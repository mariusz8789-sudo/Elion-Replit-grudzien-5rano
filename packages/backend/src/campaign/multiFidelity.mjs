/**
 * Multi-fidelity scientific campaign stages (P3/P5/P7/P11/P12).
 *
 * CHEAP → FILTER → EXPENSIVE. RDKit descriptors + Pareto/diversity (cheap) gate
 * which candidates reach docking (medium) and quantum chemistry (expensive). We
 * NEVER call an expensive engine for a candidate already invalidated by cheaper
 * validated constraints, and every stage decision (selected / not-selected /
 * failed / retained) is persisted with its reason so the WHY engine can explain it.
 *
 * All docking/QM results are MODEL_ESTIMATE and stored as Scientific Runs with raw
 * artifacts, hashes and provenance. Cross-engine disagreement (favorable
 * descriptors vs poor docking) becomes a MODEL_CONFLICT — never silently averaged.
 */
import { createHash } from 'node:crypto';
import * as store from './persistence.mjs';
import { saveScienceRun } from '../store.mjs';
import * as docking from '../compute/dockingAdapter.mjs';
import * as qm from '../compute/qmAdapter.mjs';
import { embed3d } from '../compute/rdkitAdapter.mjs';
import { capabilityAvailable } from './toolchain.mjs';

const sha16 = (obj) => createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 16);
const scalar = (vec) => Object.values(vec).reduce((a, b) => a + (b ?? 0), 0);

export const STAGE_REASON = {
  SELECTED_FOR_DOCKING: 'SELECTED_FOR_DOCKING',
  NOT_SELECTED_FOR_DOCKING: 'NOT_SELECTED_FOR_DOCKING',
  DOCKING_FAILED: 'DOCKING_FAILED',
  DOCKING_RESULT_RETAINED: 'DOCKING_RESULT_RETAINED',
  SELECTED_FOR_QM: 'SELECTED_FOR_QM',
  QM_FAILED: 'QM_FAILED',
  QM_RESULT_RETAINED: 'QM_RESULT_RETAINED',
};

/**
 * Selects candidates for an expensive stage from persisted retained candidates.
 * Modes: 'pareto' (front first), 'diverse' (spread by scalar), 'explicit' (ids).
 * Returns { selected:[{cand,reason}], notSelected:[{cand,reason}] } — every
 * candidate accounted for (no silent drops).
 */
export function selectForStage(candidates, { budget = 3, mode = 'pareto', explicitIds = [] } = {}) {
  const retained = candidates.filter((c) => c.status === 'retained');
  let ordered;
  if (mode === 'explicit') {
    const set = new Set(explicitIds);
    ordered = [...retained.filter((c) => set.has(c.id)), ...retained.filter((c) => !set.has(c.id))];
  } else if (mode === 'diverse') {
    const sorted = [...retained].sort((a, b) => scalar(a.objectiveVector) - scalar(b.objectiveVector) || a.canonicalSmiles.localeCompare(b.canonicalSmiles));
    const step = sorted.length / Math.max(1, budget);
    const picks = new Set(Array.from({ length: Math.min(budget, sorted.length) }, (_, i) => sorted[Math.floor(i * step)].id));
    ordered = [...sorted.filter((c) => picks.has(c.id)), ...sorted.filter((c) => !picks.has(c.id))];
  } else {
    // pareto first, then best scalar
    ordered = [...retained].sort((a, b) => (Number(b.pareto) - Number(a.pareto)) || (scalar(a.objectiveVector) - scalar(b.objectiveVector)) || a.canonicalSmiles.localeCompare(b.canonicalSmiles));
  }
  const selected = ordered.slice(0, budget).map((cand) => ({
    cand, reason: cand.pareto ? 'on Pareto front (highest scientific value)' : 'best multi-objective scalar under budget',
  }));
  const selectedIds = new Set(selected.map((s) => s.cand.id));
  const notSelected = retained.filter((c) => !selectedIds.has(c.id)).map((cand) => ({ cand, reason: 'below expensive-stage budget threshold' }));
  return { selected, notSelected };
}

/** Real docking of one candidate against a receptor. Persists a Scientific Run. */
export function dockCandidate(db, ctx, cand, receptor) {
  if (!capabilityAvailable('molecular-docking')) return { ok: false, error: 'BLOCKED_BY_RUNTIME', capability: 'molecular-docking' };
  const t0 = Date.now();
  const r = docking.dock({
    ligandSmiles: cand.canonicalSmiles,
    receptorSmiles: receptor?.receptorSmiles,
    receptorPdbqt: receptor?.receptorPdbqt,
    center: receptor?.center,
    boxSize: receptor?.boxSize ?? [22, 22, 22],
    exhaustiveness: receptor?.exhaustiveness ?? 8,
    nPoses: receptor?.nPoses ?? 5,
    seed: receptor?.seed ?? 42,
  });
  if (!r.ok) return { ok: false, error: r.error, reason: r.reason };
  const run = saveScienceRun(db, {
    projectId: ctx.projectId, campaignId: ctx.campaignId, candidateId: cand.id,
    engine: 'AutoDock Vina', engineVersion: r.data.vinaVersion, capability: 'molecular-docking',
    method: `vina exhaustiveness=${r.data.exhaustiveness}`, status: 'ok', evidenceClass: 'MODEL_ESTIMATE',
    inputs: { ligandSmiles: cand.canonicalSmiles, receptorKind: r.data.receptorKind, center: r.data.center, boxSize: r.data.boxSize, seed: r.data.seed },
    outputs: { bestAffinityKcalMol: r.data.bestAffinityKcalMol, nPoses: r.data.nPoses, poses: r.data.poses },
    units: { bestAffinityKcalMol: 'kcal/mol' },
    warnings: r.data.receptorKind === 'small_molecule_standin' ? ['receptor is a small-molecule rigid stand-in (software-validation), not a protein target'] : [],
    provenance: { engine: `AutoDock Vina ${r.data.vinaVersion} + Meeko ${r.data.meekoVersion}`, receptorKind: r.data.receptorKind },
    inputHash: r.data.inputHash, outputHash: sha16(r.data.poses),
    artifacts: r.data.artifacts, durationMs: Date.now() - t0,
  });
  return { ok: true, run, bestAffinityKcalMol: r.data.bestAffinityKcalMol };
}

/** Real quantum single-point of one candidate (3D embed via RDKit -> PySCF). */
export function qmCandidate(db, ctx, cand, { method = 'RHF', basis = 'sto-3g' } = {}) {
  if (!capabilityAvailable('quantum-chemistry')) return { ok: false, error: 'BLOCKED_BY_RUNTIME', capability: 'quantum-chemistry' };
  const emb = embed3d(cand.canonicalSmiles);
  if (!emb.ok) return { ok: false, error: 'embed_failed', reason: emb.reason ?? emb.error };
  const t0 = Date.now();
  const r = qm.singlePoint({ atoms: emb.atoms, charge: emb.charge ?? 0, method, basis });
  if (!r.ok) return { ok: false, error: r.error, reason: r.reason };
  const run = saveScienceRun(db, {
    projectId: ctx.projectId, campaignId: ctx.campaignId, candidateId: cand.id,
    engine: 'PySCF', engineVersion: (r.meta.engine || '').replace('PySCF ', ''), capability: 'quantum-chemistry',
    method: `${r.meta.method}/${r.meta.basis}`, status: 'ok', evidenceClass: 'MODEL_ESTIMATE',
    inputs: { smiles: cand.canonicalSmiles, method, basis, charge: emb.charge ?? 0, forceField: emb.forceField },
    outputs: r.data, units: { energyHartree: 'Hartree', homoLumoGapEv: 'eV', dipoleDebye: 'Debye' },
    provenance: { engine: r.meta.engine, geometry: `RDKit 3D embed (${emb.forceField})` },
    inputHash: sha16({ s: cand.canonicalSmiles, method, basis }), outputHash: sha16(r.data),
    artifacts: [], durationMs: Date.now() - t0,
  });
  return { ok: true, run, data: r.data };
}

/**
 * Cross-engine conflict (MCRE): a candidate with a favorable (low) descriptor MPO
 * scalar but a poor (weak/positive) docking affinity is a MODEL_CONFLICT — the two
 * validated models disagree on the candidate's merit. Persisted, never averaged.
 */
export function detectDescriptorDockingConflict(db, ctx, cand, bestAffinityKcalMol, { affinityThreshold = -3.0, scalarThreshold = 1.5 } = {}) {
  const s = scalar(cand.objectiveVector);
  const descriptorFavorable = s <= scalarThreshold;
  const dockingPoor = bestAffinityKcalMol != null && bestAffinityKcalMol > affinityThreshold;
  if (descriptorFavorable && dockingPoor) {
    const conflict = {
      candidateId: cand.id, smiles: cand.canonicalSmiles,
      classification: 'MODEL_CONFLICT',
      resultA: { engine: 'RDKit descriptors (MPO scalar)', value: Number(s.toFixed(3)), verdict: 'favorable' },
      resultB: { engine: 'AutoDock Vina (docking)', value: bestAffinityKcalMol, unit: 'kcal/mol', verdict: 'weak' },
      applicability: '2D descriptors ignore 3D pocket complementarity; docking ignores solvation/entropy nuance.',
      recommendation: 'ADDITIONAL_COMPUTATION_REQUIRED (e.g., MD refinement) before trusting either verdict.',
    };
    // Persisted (append-only) as a campaign event — MCRE + WHY read it back. Never averaged.
    store.addEvent(db, { campaignId: ctx.campaignId, generation: cand.generation, type: 'MODEL_CONFLICT', payload: conflict });
    return conflict;
  }
  return null;
}

/**
 * Runs the medium/expensive stages on a campaign's persisted candidates.
 * config: { docking:{enabled,budget,mode,receptor}, quantum:{enabled,budget,mode} }.
 * Returns a stage report; all Scientific Runs, selection reasons and conflicts persisted.
 */
export function runMultiFidelityStage(db, campaignId, config = {}, { log = () => {} } = {}) {
  const campaign = store.getCampaign(db, campaignId);
  if (!campaign) throw new Error('campaign_not_found');
  const ctx = { campaignId, projectId: campaign.projectId };
  const candidates = store.listCandidates(db, campaignId);
  const report = { docking: null, quantum: null, conflicts: [] };

  // ---- Docking stage (medium cost) ----
  if (config.docking?.enabled) {
    const cap = capabilityAvailable('molecular-docking');
    if (!cap) {
      report.docking = { executed: false, blocker: 'BLOCKED_BY_RUNTIME', capability: 'molecular-docking' };
      store.addEvent(db, { campaignId, generation: campaign.currentGeneration, type: 'STAGE_BLOCKED', payload: { stage: 'docking', blocker: 'BLOCKED_BY_RUNTIME' } });
    } else {
      const { selected, notSelected } = selectForStage(candidates, { budget: config.docking.budget ?? 2, mode: config.docking.mode ?? 'pareto', explicitIds: config.docking.explicitIds ?? [] });
      const docked = [];
      for (const { cand, reason } of selected) {
        store.addEvent(db, { campaignId, generation: cand.generation, type: 'STAGE_SELECTION', payload: { stage: 'docking', candidateId: cand.id, reason: STAGE_REASON.SELECTED_FOR_DOCKING, why: reason } });
        log('DOCKING', { candidate: cand.canonicalSmiles });
        const dr = dockCandidate(db, ctx, cand, config.docking.receptor ?? { receptorSmiles: 'c1ccc2[nH]ccc2c1', center: [0, 0, 0] });
        if (!dr.ok) {
          store.addEvent(db, { campaignId, generation: cand.generation, type: 'STAGE_RESULT', payload: { stage: 'docking', candidateId: cand.id, reason: STAGE_REASON.DOCKING_FAILED, error: dr.error } });
          docked.push({ candidateId: cand.id, smiles: cand.canonicalSmiles, failed: true, error: dr.error });
          continue;
        }
        store.addEvent(db, { campaignId, generation: cand.generation, type: 'STAGE_RESULT', payload: { stage: 'docking', candidateId: cand.id, reason: STAGE_REASON.DOCKING_RESULT_RETAINED, bestAffinityKcalMol: dr.bestAffinityKcalMol, runId: dr.run.id } });
        const conflict = detectDescriptorDockingConflict(db, ctx, cand, dr.bestAffinityKcalMol);
        if (conflict) report.conflicts.push(conflict);
        docked.push({ candidateId: cand.id, smiles: cand.canonicalSmiles, bestAffinityKcalMol: dr.bestAffinityKcalMol, runId: dr.run.id });
      }
      for (const { cand } of notSelected) {
        store.addEvent(db, { campaignId, generation: cand.generation, type: 'STAGE_SELECTION', payload: { stage: 'docking', candidateId: cand.id, reason: STAGE_REASON.NOT_SELECTED_FOR_DOCKING } });
      }
      report.docking = { executed: true, selected: selected.length, notSelected: notSelected.length, docked };
    }
  }

  // ---- Quantum stage (expensive) ----
  if (config.quantum?.enabled) {
    const cap = capabilityAvailable('quantum-chemistry');
    if (!cap) {
      report.quantum = { executed: false, blocker: 'BLOCKED_BY_RUNTIME', capability: 'quantum-chemistry' };
      store.addEvent(db, { campaignId, generation: campaign.currentGeneration, type: 'STAGE_BLOCKED', payload: { stage: 'quantum', blocker: 'BLOCKED_BY_RUNTIME' } });
    } else {
      const { selected } = selectForStage(candidates, { budget: config.quantum.budget ?? 1, mode: config.quantum.mode ?? 'pareto' });
      const computed = [];
      for (const { cand } of selected) {
        store.addEvent(db, { campaignId, generation: cand.generation, type: 'STAGE_SELECTION', payload: { stage: 'quantum', candidateId: cand.id, reason: STAGE_REASON.SELECTED_FOR_QM } });
        log('QUANTUM', { candidate: cand.canonicalSmiles });
        const qr = qmCandidate(db, ctx, cand, { method: config.quantum.method, basis: config.quantum.basis });
        if (!qr.ok) {
          store.addEvent(db, { campaignId, generation: cand.generation, type: 'STAGE_RESULT', payload: { stage: 'quantum', candidateId: cand.id, reason: STAGE_REASON.QM_FAILED, error: qr.error } });
          computed.push({ candidateId: cand.id, smiles: cand.canonicalSmiles, failed: true, error: qr.error });
          continue;
        }
        store.addEvent(db, { campaignId, generation: cand.generation, type: 'STAGE_RESULT', payload: { stage: 'quantum', candidateId: cand.id, reason: STAGE_REASON.QM_RESULT_RETAINED, homoLumoGapEv: qr.data.homoLumoGapEv, runId: qr.run.id } });
        computed.push({ candidateId: cand.id, smiles: cand.canonicalSmiles, homoLumoGapEv: qr.data.homoLumoGapEv, dipoleDebye: qr.data.dipoleDebye, runId: qr.run.id });
      }
      report.quantum = { executed: true, computed };
    }
  }

  return report;
}
