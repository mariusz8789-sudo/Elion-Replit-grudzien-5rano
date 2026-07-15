/**
 * Real Scientific Campaign #001 runner (Corpus Mandate Phases 8–12).
 *
 * Ties the Scientific Corpus Factory to the existing brain and real engines:
 *   bundle → evidence → claim registry → target gate → candidate generation (real RDKit) →
 *   AVAILABLE engines (RDKit + ADMET-AI real; docking BLOCKED_BY_RUNTIME) → MCRE conflict
 *   resolution → deterministic versioned ranking → Truth-Engine final gate → auditable dossier.
 *
 * HONESTY: engines are only executed when genuinely AVAILABLE; a blocked engine is recorded
 * BLOCKED_BY_RUNTIME, never a fabricated score. Docking/MD/QM are not substituted by heuristics.
 * Ki is never flattened into IC50. Record-existence is never efficacy. Engines are injectable so
 * tests are deterministic; the real E2E run uses the real adapters and logs which engine ran.
 */
import { canonicalHash } from '../provenance.mjs';
import * as rdkit from '../compute/rdkitAdapter.mjs';
import * as admet from '../compute/admetAdapter.mjs';
import * as ei from '../cognitive/evidenceIntelligence.mjs';
import * as ti from '../cognitive/targetIntelligence.mjs';
import { ingestBundle } from '../corpus/corpusIngest.mjs';

export const RANKING_POLICY_VERSION = 'genesis-campaign-ranking/1';
export const MCRE_POLICY_VERSION = 'genesis-mcre/1';
export const CAMPAIGN_STATUS = Object.freeze({ COMPLETED_RANKED: 'COMPLETED_RANKED', FAIL_CLOSED_INSUFFICIENT_EVIDENCE: 'FAIL_CLOSED_INSUFFICIENT_EVIDENCE', FAIL_CLOSED_TRUTH_GATE: 'FAIL_CLOSED_TRUTH_GATE', COMPLETED_NO_CANDIDATES: 'COMPLETED_NO_CANDIDATES' });
export const ENGINE_STATUS = Object.freeze({ AVAILABLE: 'AVAILABLE', DEGRADED: 'DEGRADED', BLOCKED_BY_RUNTIME: 'BLOCKED_BY_RUNTIME', NOT_IMPLEMENTED: 'NOT_IMPLEMENTED' });

/** Real engine adapters; injectable for deterministic tests. */
export function defaultEngines() {
  return {
    rdkitDetect: () => rdkit.detect(),
    descriptors: (s) => rdkit.descriptors(s),
    alerts: (s) => rdkit.structuralAlerts(s),
    transform: (s, t) => rdkit.transform(s, t),
    listTransformations: () => rdkit.listTransformations(),
    admetDetect: () => admet.detect(),
    admetPredict: (list) => admet.predict(list),
  };
}

/** Runtime engine status matrix (Phase 8). Docking/MD/QM are honestly blocked without inputs. */
export function engineStatusMatrix(engines, { hasReceptor = false } = {}) {
  const rk = engines.rdkitDetect ? engines.rdkitDetect() : { available: false };
  const ad = engines.admetDetect ? engines.admetDetect() : { available: false };
  return {
    RDKit: { status: rk.available ? ENGINE_STATUS.AVAILABLE : ENGINE_STATUS.BLOCKED_BY_RUNTIME, version: rk.version ?? null },
    'ADMET-AI': { status: ad.available ? ENGINE_STATUS.AVAILABLE : ENGINE_STATUS.BLOCKED_BY_RUNTIME, version: ad.version ?? null },
    Docking: { status: hasReceptor ? ENGINE_STATUS.AVAILABLE : ENGINE_STATUS.BLOCKED_BY_RUNTIME, reason: hasReceptor ? null : 'no prepared receptor — docking NOT run, NOT substituted by a heuristic' },
    OpenMM: { status: ENGINE_STATUS.BLOCKED_BY_RUNTIME, reason: 'no prepared system' },
    PySCF: { status: ENGINE_STATUS.NOT_IMPLEMENTED, reason: 'no defined quantum question in this campaign' },
  };
}

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

/** Run the AVAILABLE engines on one candidate. Never fabricates a blocked engine's output. */
function runEngines(candidate, engines, matrix) {
  const outputs = {}; const failures = [];
  if (matrix.RDKit.status === ENGINE_STATUS.AVAILABLE) {
    const d = engines.descriptors(candidate.canonicalSmiles);
    const a = engines.alerts(candidate.canonicalSmiles);
    outputs.rdkit = { engine: 'RDKit', engineVersion: matrix.RDKit.version, ok: d.ok && a.ok, epistemicStatus: 'COMPUTED',
      descriptors: d.ok ? { molWt: num(d.data.molWt), logP: num(d.data.crippenLogP), lipinskiViolations: num(d.data.lipinskiViolations) } : null,
      structuralAlerts: a.ok ? (a.nAlerts ?? (a.alerts ?? []).length) : null,
      rawOutputHash: canonicalHash({ d, a }) };
    if (!d.ok || !a.ok) failures.push('rdkit');
  } else outputs.rdkit = { engine: 'RDKit', status: matrix.RDKit.status };
  if (matrix['ADMET-AI'].status === ENGINE_STATUS.AVAILABLE) {
    const p = engines.admetPredict([candidate.canonicalSmiles]);
    outputs.admet = { engine: 'ADMET-AI', engineVersion: matrix['ADMET-AI'].version, ok: p.ok, epistemicStatus: 'MODEL_INFERRED',
      note: 'predicted ADMET is a MODEL_ESTIMATE, never measured ADMET',
      predictions: p.ok ? (p.predictions?.[candidate.canonicalSmiles] ?? p.predictions?.[0] ?? null) : null,
      rawOutputHash: canonicalHash(p) };
    if (!p.ok) failures.push('admet');
  } else outputs.admet = { engine: 'ADMET-AI', status: matrix['ADMET-AI'].status };
  outputs.docking = { engine: 'Docking', status: matrix.Docking.status, note: matrix.Docking.reason };
  return { outputs, failures };
}

/* ---------------- MCRE — conflict resolution (Phase 9) ---------------- */
export function detectConflicts(candidate, { bioactivity = [], engineOutputs }) {
  const conflicts = [];
  const admetTox = engineOutputs.admet?.predictions ? Object.entries(engineOutputs.admet.predictions).find(([k]) => /herg|tox|ames|dili/i.test(k)) : null;
  // Conflict: literature/db-reported activity (a real assay value) vs an unfavourable computed ADMET signal.
  for (const b of bioactivity) {
    if (b.standardValue != null && admetTox && Number(admetTox[1]) > 0.5) {
      conflicts.push({ conflictId: 'cf_' + canonicalHash({ c: candidate.candidateId, b: b.identifiers?.activityId, t: admetTox[0] }).slice(0, 12),
        candidateId: candidate.candidateId, evidenceIds: [b.identifiers?.activityId].filter(Boolean), enginesInvolved: ['ChEMBL-reported', 'ADMET-AI'],
        conflictType: 'REPORTED_ACTIVITY_vs_PREDICTED_LIABILITY',
        detail: `reported ${b.standardType} ${b.standardRelation} ${b.standardValue} ${b.standardUnits} vs predicted ${admetTox[0]}=${Number(admetTox[1]).toFixed(2)}`,
        resolutionPolicy: MCRE_POLICY_VERSION, resolutionResult: 'UNRESOLVED_KEEP_BOTH_VISIBLE',
        remainingUncertainty: 'reported activity is measured; ADMET is a model estimate — they measure different things and are NOT reconciled into one score' });
    }
  }
  // Conflict: mixed measurement types present (Ki AND IC50) — must NOT be flattened.
  const types = new Set(bioactivity.map((b) => b.standardType).filter(Boolean));
  if (types.has('Ki') && types.has('IC50')) {
    conflicts.push({ conflictId: 'cf_' + canonicalHash({ c: candidate.candidateId, t: 'ki_ic50' }).slice(0, 12), candidateId: candidate.candidateId,
      conflictType: 'KI_VS_IC50_INTERPRETATION', enginesInvolved: ['ChEMBL-reported'], resolutionPolicy: MCRE_POLICY_VERSION,
      resolutionResult: 'KEPT_DISTINCT', detail: 'Ki and IC50 present; kept as distinct measurements (not interchangeable)', remainingUncertainty: 'assay-condition dependent; no Cheng-Prusoff conversion applied without Km/[S]' });
  }
  return conflicts;
}

/* ---------------- Deterministic versioned ranking (Phase 10) ---------------- */
export function rankCandidates(candidates) {
  const scored = candidates.map((c) => {
    const rd = c.engineOutputs.rdkit;
    const alerts = rd?.structuralAlerts ?? 0;
    const molWt = rd?.descriptors?.molWt ?? 500;
    const evidenceContribution = +(Math.min(1, (c.evidenceIds?.length ?? 0) / 2)).toFixed(4);
    const targetRelevanceContribution = +(c.targetRelevance ?? 0).toFixed(4);
    const chemistryContribution = +Math.max(0, 1 - alerts * 0.3 - Math.max(0, molWt - 400) * 0.001).toFixed(4);
    const admetContribution = c.engineOutputs.admet?.ok ? 0.5 : 0; // present-but-model-inferred; modest, never decisive
    const structuralContribution = 0; // no real docking → no structural contribution (never fabricated)
    const conflictPenalty = +((c.conflictCount ?? 0) * 0.1).toFixed(4);
    const uncertaintyPenalty = +((c.unresolvedConflictCount ?? 0) * 0.05).toFixed(4);
    const finalScore = +(0.30 * evidenceContribution + 0.25 * targetRelevanceContribution + 0.25 * chemistryContribution + 0.10 * admetContribution + 0.10 * structuralContribution - conflictPenalty - uncertaintyPenalty).toFixed(6);
    return { candidateId: c.candidateId, sourceIdentity: c.canonicalSmiles, targetRelevanceContribution, evidenceContribution, chemistryContribution, admetContribution, structuralContribution, conflictPenalty, uncertaintyPenalty, finalScore, rankingPolicyVersion: RANKING_POLICY_VERSION };
  });
  // Deterministic order: score desc, then candidateId asc (stable tiebreak). No manual reordering.
  scored.sort((a, b) => b.finalScore - a.finalScore || String(a.candidateId).localeCompare(String(b.candidateId)));
  return scored.map((s, i) => ({ rank: i + 1, ...s }));
}

/* ---------------- Truth Engine final gate (Phase 11) ---------------- */
const FORBIDDEN_CLAIM = /\b(cures?|clinically\s+(safe|proven)|drug\b|therapeutic\s+efficacy|treats?\s+patients|approved)\b/i;
export function truthFinalGate({ claimRegistry, rankingProduced, forbiddenClaimTexts = [] }) {
  const rejections = [];
  for (const t of forbiddenClaimTexts) if (FORBIDDEN_CLAIM.test(String(t))) rejections.push({ claim: t, reason: 'unsupported clinical/efficacy/drug claim not present in source evidence' });
  // A claim that cites no supporting evidence cannot pass as a strong scientific conclusion.
  for (const c of claimRegistry) if (c.status === 'UNSUPPORTED' && FORBIDDEN_CLAIM.test(c.normalizedClaim)) rejections.push({ claim: c.normalizedClaim, reason: 'unsupported + forbidden efficacy phrasing' });
  const decision = rejections.length > 0 ? 'BLOCK' : rankingProduced ? 'GO_COMPUTATIONAL' : 'INSUFFICIENT_DATA';
  return { decision, rejections, boundedClaim: 'GO_COMPUTATIONAL means a reproducible computational ranking was produced under cited evidence — NOT therapeutic efficacy and NOT a drug-discovery claim.' };
}

/* ---------------- Orchestrator ---------------- */
export function runCampaign001(_db, { bundleRoot, seedCompounds = [], targetHypotheses = [], supplementalClaims = [], engines = defaultEngines(), hasReceptor = false, campaignId = 'real-scientific-campaign-001' }) {
  const matrix = engineStatusMatrix(engines, { hasReceptor });
  const ingest = ingestBundle(bundleRoot, { campaignId });
  const { registry: claimRegistry } = ei.buildClaimRegistry(supplementalClaims, ingest.evidenceRecords);
  const bioactivity = ingest.entities.filter((e) => e.entity.entityType === 'BioactivityRecord').map((e) => e.entity);

  // Target gate — fail closed if no evidence-backed target.
  const funnel = ti.targetFunnel(targetHypotheses, claimRegistry);
  if (funnel.primaryGate.gate === 'BLOCK') {
    return { campaignId, status: CAMPAIGN_STATUS.FAIL_CLOSED_INSUFFICIENT_EVIDENCE, engineMatrix: matrix, targetFunnel: funnel, ingest, claimRegistry, conflicts: [], ranking: [], truthGate: { decision: 'INSUFFICIENT_DATA' } };
  }

  // Candidate generation (real RDKit analogues around corpus/seed compounds).
  const compoundSeeds = seedCompounds.length ? seedCompounds : ingest.entities.filter((e) => e.entity.entityType === 'ChemicalCompound' && e.entity.canonicalSmiles).map((e) => ({ name: e.entity.identifiers.cid ?? 'compound', smiles: e.entity.canonicalSmiles }));
  const transforms = (engines.listTransformations().transformations ?? []).slice(0, 2);
  const candidates = [];
  const seen = new Set();
  for (const seed of compoundSeeds) {
    // Include the seed itself + a bounded set of real analogues.
    for (const smi of [seed.smiles, ...transforms.flatMap((t) => { const r = engines.transform(seed.smiles, t); return r.ok ? r.products.slice(0, 1) : []; })]) {
      if (seen.has(smi)) continue; seen.add(smi);
      const candidate = { candidateId: 'cand_' + canonicalHash({ campaignId, smi }).slice(0, 12), canonicalSmiles: smi, sourceIds: [seed.name], evidenceIds: funnel.primaryTarget?.evidenceFor ?? [], targetRelevance: Math.min(1, (funnel.primaryTarget?.supportingSourceCount ?? 0) / 2) };
      const { outputs, failures } = runEngines(candidate, engines, matrix);
      candidate.engineOutputs = outputs; candidate.failureState = failures.length ? failures : null;
      candidate.conflicts = detectConflicts(candidate, { bioactivity, engineOutputs: outputs });
      candidate.conflictCount = candidate.conflicts.length;
      candidate.unresolvedConflictCount = candidate.conflicts.filter((c) => /UNRESOLVED/.test(c.resolutionResult)).length;
      candidate.epistemicStatus = 'COMPUTATIONAL_CANDIDATE';
      candidates.push(candidate);
    }
  }
  if (candidates.length === 0) return { campaignId, status: CAMPAIGN_STATUS.COMPLETED_NO_CANDIDATES, engineMatrix: matrix, targetFunnel: funnel, ingest, claimRegistry, conflicts: [], ranking: [], truthGate: { decision: 'INSUFFICIENT_DATA' } };

  const conflicts = candidates.flatMap((c) => c.conflicts);
  const ranking = rankCandidates(candidates);
  const gate = truthFinalGate({ claimRegistry, rankingProduced: ranking.length > 0, forbiddenClaimTexts: supplementalClaims.map((c) => c.text) });
  const status = gate.decision === 'BLOCK' ? CAMPAIGN_STATUS.FAIL_CLOSED_TRUTH_GATE : CAMPAIGN_STATUS.COMPLETED_RANKED;
  return { campaignId, status, engineMatrix: matrix, ingest, claimRegistry, targetFunnel: funnel, candidates, conflicts, ranking: status === CAMPAIGN_STATUS.COMPLETED_RANKED ? ranking : [], truthGate: gate };
}

/* ---------------- Auditable Scientific Dossier (Phase 12) ---------------- */
export function buildCampaign001Dossier(result, { scientificQuestion = null, selectionRationale = null } = {}) {
  const ing = result.ingest;
  const executed = Object.entries(result.engineMatrix).filter(([, v]) => v.status === ENGINE_STATUS.AVAILABLE).map(([k, v]) => `${k}${v.version ? ' ' + v.version : ''}`);
  const blocked = Object.entries(result.engineMatrix).filter(([, v]) => v.status !== ENGINE_STATUS.AVAILABLE).map(([k, v]) => `${k}: ${v.status}${v.reason ? ' — ' + v.reason : ''}`);
  const dossier = {
    schema: 'genesis-scientific-campaign-dossier/1',
    // 1-3
    campaign: { id: result.campaignId, version: 'v1', status: result.status },
    scientificQuestion, selectionRationale,
    // 4-7 (source inventory / provenance / hash / rights)
    sourceInventory: ing.summary,
    evidenceProvenance: ing.entities.map((e) => ({ sourceService: e.provenance.sourceService, sourceId: e.provenance.sourceId, contentHash: e.provenance.contentHash, hashAlgorithm: e.provenance.hashAlgorithm, license: e.provenance.license, ingestionMode: e.provenance.ingestionMode, evidenceOrigin: e.provenance.evidenceOrigin, sourceUrl: e.provenance.sourceUrl })),
    contentHashVerification: 'SHA-256 verified at ingestion (fail-closed) — see bundle adapter',
    rightsStatus: [...new Set(ing.entities.map((e) => e.provenance.license))],
    // 8-9
    normalizedEntities: ing.summary.byType,
    claims: result.claimRegistry.map((c) => ({ claimId: c.claimId, claim: c.normalizedClaim, status: c.status, supporting: c.supportingEvidenceIds })),
    // 10-11
    targetIntelligence: { primary: result.targetFunnel.primaryTarget?.targetName ?? null, gate: result.targetFunnel.primaryGate, scoringPolicyVersion: result.targetFunnel.scoringPolicyVersion },
    reasoningLedgerSummary: 'reasoning brain CAPABILITY_BLOCKED (no live model configured) — see discoveryControllerV2',
    // 12-13
    enginesExecuted: executed, enginesBlocked: blocked,
    // 14-16
    candidateFunnel: (result.candidates ?? []).map((c) => ({ candidateId: c.candidateId, smiles: c.canonicalSmiles, epistemicStatus: c.epistemicStatus, failureState: c.failureState, conflicts: c.conflictCount })),
    rejectedCandidateReasons: (result.candidates ?? []).filter((c) => c.failureState).map((c) => ({ candidateId: c.candidateId, reasons: c.failureState })),
    conflictRegistry: result.conflicts,
    // 17-18
    finalRanking: result.ranking, rankingPolicyVersion: RANKING_POLICY_VERSION,
    uncertaintyRegister: result.conflicts.map((c) => ({ conflictId: c.conflictId, remainingUncertainty: c.remainingUncertainty })),
    // 19-20
    truthEngineGate: result.truthGate,
    capabilityBlocks: blocked,
    // 21-22
    scientificLimitations: [
      'Evidence origin in this run is TEST_FIXTURE (live external sources policy-blocked) — NOT real acquired literature/structures/compounds.',
      'ADMET predictions are MODEL_ESTIMATEs, not measured ADMET. Docking/MD/QM were not executed.',
      'A computational ranking is NOT evidence of binding, activity, safety, efficacy, or therapeutic effect.',
    ],
    reproducibility: { rankingPolicyVersion: RANKING_POLICY_VERSION, mcrePolicyVersion: MCRE_POLICY_VERSION, note: 'same bundle + same seeds + same policy versions reproduce the same ranking (deterministic).' },
    didGenesisDiscoverADrug: 'NO',
    didGenesisDiscoverADrugExplanation: 'No live evidence, no experimental/clinical validation, no docking. The run produced an auditable, provenance-preserving computational ranking over SYNTHETIC TEST_FIXTURE data. That is not drug discovery.',
  };
  dossier.dossierHash = canonicalHash({ ...dossier, dossierHash: undefined });
  return dossier;
}
