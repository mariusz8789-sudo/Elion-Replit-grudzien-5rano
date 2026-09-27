import { beforeEach, describe, expect, it } from 'vitest';
import { ALL_SELF_FALSIFICATION_PROBES } from '../core/agent/discoveryContracts';
import { projectDrugRun, type CampaignEventRecord } from '../core/liveExperiment/drugRunState';
import { resetDrugHypothesesForTest } from '../core/liveExperiment/drugHypothesis';
import { DRUG_EFFECT_NOT_COMPUTED_PL, FINALIST_FALSIFICATION_CAVEAT_PL, finalistFalsification } from '../core/liveExperiment/finalistFalsification';
import type { LiveDrugRun } from '../core/liveExperiment/liveDrugRun';
import type { CampaignCandidate } from '../core/backend/client';

/**
 * D-148 — GENESIS TRIES TO OVERTURN ITS OWN FINALIST. The same canonical fixture as
 * twinContext.e2e.test.tsx (6 candidates → 4 rejected → c1 finalist, Vina −12.83, sealed MATCH):
 * the pure report must run all 13 probes, pass only what the run genuinely declares, leave the
 * rest UNRESOLVED with a reason, and be NOT_APPLICABLE off the finalists' stand.
 */
const cand = (id: string, generation: number, smiles: string, parent: string | null, transformation: string | null, status = 'retained', reason: string | null = null): CampaignCandidate => ({
  id, generation, parentSmiles: parent, transformation, canonicalSmiles: smiles, valid: true,
  descriptors: { mw: 493.6 }, objectiveVector: {}, constraintViolations: [], pareto: generation === 1, status, rejectedReason: reason, runIds: [],
});
let seq = 0;
const ev = (type: string, generation: number, payload: Record<string, unknown>): CampaignEventRecord => ({ seq: ++seq, id: `e${seq}`, generation, type, payload, createdAt: 1000 + seq });

const IMATINIB = 'Cc1ccc(NC(=O)c2ccc(CN3CCN(C)CC3)cc2)cc1Nc1nccc(-c2cccnc2)n1';
const candidates = [
  cand('c0', 0, IMATINIB, null, null),
  cand('c1', 1, `C${IMATINIB}`, IMATINIB, 'add-methyl'),
  cand('c2', 1, `O${IMATINIB}`, IMATINIB, 'add-hydroxyl', 'rejected', 'constraint:mw'),
  cand('c3', 1, `N${IMATINIB}`, IMATINIB, 'add-amine', 'rejected', 'admet:herg'),
  cand('c4', 1, `F${IMATINIB}`, IMATINIB, 'add-fluorine', 'rejected', 'constraint:logp'),
  cand('c5', 1, `Cl${IMATINIB}`, IMATINIB, 'add-chlorine', 'rejected', 'admet:tox'),
];
const target = { targetId: 'ABL1_1IEP', pdbId: '1IEP', chain: 'A', protein: 'Tyrosine-protein kinase ABL1, kinase domain', receptorPdbqtSha256: 'b'.repeat(64), sourceSha256: 'c'.repeat(64), receptorAtoms: 2702, center: [15.19, 53.903, 16.917], boxSize: [20, 20, 20], meekoVersion: '0.8.0' };
const events: CampaignEventRecord[] = [
  ev('OBJECTIVE_RECEIVED', 0, {}),
  ev('GENERATION_COMPLETED', 1, {}),
  ev('STOPPING_CONDITION_REACHED', 1, { stopReason: 'BUDGET_EXHAUSTED' }),
  ev('STAGE_RESULT', 1, { stage: 'admet', candidateId: 'c1', reason: 'ADMET_COMPUTED', admetRunId: 'r-admet', endpoints: { hERG: 0.12, BBB: 0.31 } }),
  ev('STAGE_PROGRESS', 1, { stage: 'docking', step: 'RECEPTOR_PREPARED', ...target }),
  ev('STAGE_SELECTION', 1, { stage: 'docking', candidateId: 'c1', reason: 'SELECTED_FOR_DOCKING' }),
  ev('STAGE_PROGRESS', 1, { stage: 'docking', step: 'LIGAND_PREPARED', candidateId: 'c1', ligandPdbqtSha256: 'd'.repeat(64), atoms: 68 }),
  ev('STAGE_PROGRESS', 1, { stage: 'docking', step: 'VINA_STARTED', candidateId: 'c1', targetId: 'ABL1_1IEP', exhaustiveness: 8, seed: 42 }),
  ev('STAGE_RESULT', 1, { stage: 'docking', candidateId: 'c1', reason: 'DOCKING_RESULT_RETAINED', bestAffinityKcalMol: -12.83, runId: 'r-dock', targetId: 'ABL1_1IEP', poseSha256: 'e'.repeat(64) }),
];
const dockingRuns = [{ id: 'r-dock', outputs: { poseSha256: 'e'.repeat(64), pose: { atoms: [['C', 1, 2, 3], ['N', 2, 3, 4]], bonds: [[0, 1, 1.5]] }, pocket: { residues: ['THR315:A', 'MET318:A'], atoms: [['C', 0, 0, 0, 0]] } }, provenance: { engine: 'AutoDock Vina 1.2.7 + Meeko 0.8.0' } }];
const state = projectDrugRun({ events, candidates, maxGenerations: 1, jobRunning: false, dockingRuns });
const run: LiveDrugRun = {
  campaignId: 'camp-1', projectId: 'proj-1', phase: 'DONE', state, error: null, durationMs: 1234,
  preregistration: { status: 'FOUND', recordId: 'prereg-1', chainHash: 'f'.repeat(64), check: null, error: null },
  sealed: { status: 'FOUND', recordId: 'session-1', chainHash: 'a'.repeat(64), check: 'MATCH', error: null },
};

beforeEach(() => resetDrugHypothesesForTest());

describe('finalistFalsification — the finalist is a target for refutation, not a success', () => {
  it('runs all 13 probes, in the battery\'s order, on the c1 finalist', () => {
    const r = finalistFalsification(run, 'c1');
    expect(r.status).toBe('RESOLVED');
    if (r.status !== 'RESOLVED') return;
    expect(r.candidateId).toBe('c1');
    expect(r.dockingScore).toBe(-12.83);
    expect(r.probes.map((p) => p.id)).toEqual(ALL_SELF_FALSIFICATION_PROBES);
    expect(r.probes).toHaveLength(13);
    expect(r.counts.PASS + r.counts.FAIL + r.counts.UNRESOLVED).toBe(13);
    expect(r.stateHash).toBe(state.stateHash);
    expect(r.sealed).toEqual({ recordId: 'session-1', chainHash: 'a'.repeat(64), check: 'MATCH' });
  });

  it('every verdict carries provenance: a PASS or FAIL names its source and identity, an UNRESOLVED names its blocker (D-150)', () => {
    const r = finalistFalsification(run, 'c1');
    if (r.status !== 'RESOLVED') throw new Error('expected RESOLVED');
    const by = Object.fromEntries(r.probes.map((p) => [p.id, p]));
    // Declared from the run's own records.
    expect(by.HIDDEN_PREREG).toMatchObject({ verdict: 'PASS' });
    expect(by.HIDDEN_PREREG.reason).toContain('prereg-1');
    expect(by.HIDDEN_PREREG.reason).toContain('MATCH');
    expect(by.HIDDEN_PREREG.evidenceId).toContain('prereg-1');
    expect(by.MULTIPLE_TESTING).toMatchObject({ verdict: 'PASS' });
    expect(by.MULTIPLE_TESTING.reason).toContain('Exactly one hypothesis was tested');
    expect(by.PREPROCESSING_ARTIFACT).toMatchObject({ verdict: 'PASS' });
    expect(by.PREPROCESSING_ARTIFACT.reason).toContain('r-dock');
    expect(by.PREPROCESSING_ARTIFACT.reason).toContain('Meeko 0.8.0');
    // THE CONTRACT: no verdict without provenance, no UNRESOLVED without a named blocker.
    for (const p of r.probes) {
      expect(p.reason.length, p.id).toBeGreaterThan(20);
      expect(p.reasonPl.length, p.id).toBeGreaterThan(20);
      if (p.verdict === 'UNRESOLVED') {
        expect(p.evidenceSource, p.id).toBeNull();
        expect(p.evidenceId, p.id).toBeNull();
        expect(p.blockerPl, p.id).toBeTruthy();
      } else {
        expect(p.declaredFrom, p.id).toBeTruthy();
        expect(p.evidenceSource, p.id).toBeTruthy();
        expect(p.evidenceId, p.id).toBeTruthy();
        expect(p.blockerPl, p.id).toBeNull();
      }
    }
    // The three probes the real multi-seed redock + control run resolves, each pinned to its sha256.
    for (const id of ['NUMERICAL_ARTIFACT', 'MEASUREMENT_ARTIFACT', 'ALTERNATIVE_MODEL', 'TAUTOLOGY']) {
      expect(by[id].verdict, id).toBe('PASS');
      expect(by[id].evidenceId, id).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(by[id].evidenceSource, id).toContain('docs/evidence/finalist-falsification');
    }
    expect(by.NUMERICAL_ARTIFACT.reasonPl).toContain('5 konfiguracji');
    expect(by.MEASUREMENT_ARTIFACT.reasonPl).toContain('RMSD');
    expect(by.ALTERNATIVE_MODEL.reasonPl).toContain('kontrola negatywna');
    expect(by.TAUTOLOGY.reasonPl).toContain('EMPIRICAL_TEST');
    // EVIDENCE AGAINST THE RUN IS REPORTED AS FAIL, NOT HIDDEN: the campaign's seed molecule is IN the
    // independent validation set; only one of the generated candidates was docked; the receptor is rigid.
    expect(by.DATASET_CONTAMINATION.verdict).toBe('FAIL');
    expect(by.DATASET_CONTAMINATION.reasonPl).toContain('1T46');
    expect(by.SELECTION_BIAS.verdict).toBe('FAIL');
    expect(by.SELECTION_BIAS.reasonPl).toContain('WYBRANĄ');
    expect(by.CONFOUNDING.verdict).toBe('FAIL');
    expect(by.CONFOUNDING.reasonPl).toContain('sztywny receptor');
    // The leakage CHECK ran (that is what this probe asks); what it found is DATASET_CONTAMINATION's verdict.
    expect(by.LEAKAGE.verdict).toBe('PASS');
    expect(by.OVERFITTING.verdict).toBe('PASS');
    expect(by.OVERFITTING.reasonPl).toContain('Test dwóch proporcji');
    expect(by.TEMPORAL_LEAKAGE.verdict).toBe('PASS');
    expect(r.counts).toEqual({ PASS: 10, FAIL: 3, UNRESOLVED: 0 });
    // Every evidence record the report used is listed once, with a resolvable identity.
    expect(r.evidenceUsed.length).toBeGreaterThanOrEqual(6);
    expect(new Set(r.evidenceUsed.map((e) => e.identity)).size).toBe(r.evidenceUsed.length);
    for (const e of r.evidenceUsed) expect(e.source.length).toBeGreaterThan(5);
  });

  it('a probe with no evidence for THIS target stays UNRESOLVED with the blocker naming the missing run, never assumed clean', () => {
    // The recorded redock + control run belongs to ABL1_1IEP. A run docking into any other receptor
    // cannot borrow it: those probes go back to UNRESOLVED and say exactly what is missing.
    const otherTargetEvents = events.map((e) => (e.type === 'STAGE_PROGRESS' && e.payload.step === 'RECEPTOR_PREPARED'
      ? { ...e, payload: { ...e.payload, targetId: 'OPRM1_5C1M', pdbId: '5C1M' } } : e));
    const otherState = projectDrugRun({ events: otherTargetEvents, candidates, maxGenerations: 1, jobRunning: false, dockingRuns });
    const r = finalistFalsification({ ...run, state: otherState }, 'c1');
    if (r.status !== 'RESOLVED') throw new Error('expected RESOLVED');
    const by = Object.fromEntries(r.probes.map((p) => [p.id, p]));
    for (const id of ['NUMERICAL_ARTIFACT', 'MEASUREMENT_ARTIFACT', 'ALTERNATIVE_MODEL', 'TAUTOLOGY']) {
      expect(by[id].verdict, id).toBe('UNRESOLVED');
      expect(by[id].blockerPl, id).toBeTruthy();
      expect(by[id].evidenceId, id).toBeNull();
    }
    expect(by.NUMERICAL_ARTIFACT.blockerPl).toContain('OPRM1_5C1M');
    expect(r.counts.UNRESOLVED).toBe(4);
    // And the unknowns/next experiments quote the blocker, not invented prose.
    expect(r.unknowns.find((u) => u.id === 'probe:NUMERICAL_ARTIFACT')!.detail).toContain('Blokada:');
    expect(r.nextExperiments.find((n) => n.probeId === 'NUMERICAL_ARTIFACT')!.whatItWouldResolve).toBe(by.NUMERICAL_ARTIFACT.blockerPl);
  });

  it('lists what is still unknown: every UNRESOLVED probe, every unresolved criterion, and the drug effect in the tissue', () => {
    const r = finalistFalsification(run, 'c1');
    if (r.status !== 'RESOLVED') throw new Error('expected RESOLVED');
    const ids = r.unknowns.map((u) => u.id);
    for (const p of r.probes.filter((p) => p.verdict === 'UNRESOLVED')) expect(ids).toContain(`probe:${p.id}`);
    // The fixture's ADMET record has no AMES/hERG endpoints → those criteria are unresolved, and the report says so.
    expect(ids).toContain('criterion:ames');
    expect(ids).toContain('criterion:herg');
    expect(r.hypothesisVerdict).toBe('UNRESOLVED');
    const tissue = r.unknowns.find((u) => u.id === 'drug-effect-in-tissue')!;
    expect(tissue.labelPl).toBe(DRUG_EFFECT_NOT_COMPUTED_PL);
    expect(tissue.kind).toBe('NOT_VALIDATED');
    expect(tissue.detail).toContain('szpik');
    for (const u of r.unknowns) expect(`${u.labelPl} ${u.detail}`.toLowerCase()).not.toMatch(/sukces|lek działa/);
    expect(FINALIST_FALSIFICATION_CAVEAT_PL).toContain('nie ogłasza sukcesu');
  });

  it('the next experiment comes from nextDrugExperiment first, then one resolver per UNRESOLVED probe — nothing else', () => {
    const r = finalistFalsification(run, 'c1');
    if (r.status !== 'RESOLVED') throw new Error('expected RESOLVED');
    expect(r.nextExperiments[0]).toMatchObject({ probeId: 'HYPOTHESIS', source: 'drugHypothesis.ts::nextDrugExperiment' });
    // In this fixture docking is MET and no tox criterion failed → the existing rule proposes MD for the pose.
    expect(r.nextExperiments[0].labelPl).toBe('Dynamika molekularna dla najlepszej pozy');
    const rest = r.nextExperiments.slice(1);
    expect(rest.map((n) => n.probeId)).toEqual(r.probes.filter((p) => p.verdict === 'UNRESOLVED').map((p) => p.id));
    for (const n of rest) expect(n.whatItWouldResolve).toMatch(/`\w+`|sum|rozłączny|komponenty|rywalizujący/);
  });

  it('is NOT_APPLICABLE for a rejected candidate, an unknown candidate, the undocked seed and a null run', () => {
    expect(finalistFalsification(run, 'c2')).toEqual({ status: 'NOT_APPLICABLE', reason: 'CANDIDATE_NOT_FINALIST', candidateId: 'c2' });
    expect(finalistFalsification(run, 'c0')).toEqual({ status: 'NOT_APPLICABLE', reason: 'CANDIDATE_NOT_FINALIST', candidateId: 'c0' });
    expect(finalistFalsification(run, 'c99')).toEqual({ status: 'NOT_APPLICABLE', reason: 'NO_CANDIDATE', candidateId: 'c99' });
    expect(finalistFalsification(null, 'c1')).toEqual({ status: 'NOT_APPLICABLE', reason: 'NO_RUN', candidateId: 'c1' });
    expect(state.candidates.filter((c) => finalistFalsification(run, c.id).status === 'RESOLVED').map((c) => c.id)).toEqual(['c1']);
  });

  it('a refused preregistration fails HIDDEN_PREREG; no sealed check leaves it UNRESOLVED; two docked candidates fail MULTIPLE_TESTING', () => {
    const refused = finalistFalsification({ ...run, preregistration: { status: 'REFUSED', recordId: null, chainHash: null, check: null, error: 'campaign_already_executed' } }, 'c1');
    if (refused.status !== 'RESOLVED') throw new Error('expected RESOLVED');
    expect(refused.probes.find((p) => p.id === 'HIDDEN_PREREG')).toMatchObject({ verdict: 'FAIL' });
    const unsealed = finalistFalsification({ ...run, sealed: null }, 'c1');
    if (unsealed.status !== 'RESOLVED') throw new Error('expected RESOLVED');
    expect(unsealed.probes.find((p) => p.id === 'HIDDEN_PREREG')).toMatchObject({ verdict: 'UNRESOLVED' });
    expect(unsealed.sealed).toBeNull();
    const twoDocked = projectDrugRun({ events: [...events, ev('STAGE_RESULT', 1, { stage: 'docking', candidateId: 'c0', reason: 'DOCKING_RESULT_RETAINED', bestAffinityKcalMol: -10.1, runId: 'r-dock-2' })], candidates, maxGenerations: 1, jobRunning: false, dockingRuns });
    const multi = finalistFalsification({ ...run, state: twoDocked }, 'c1');
    if (multi.status !== 'RESOLVED') throw new Error('expected RESOLVED');
    expect(multi.probes.find((p) => p.id === 'MULTIPLE_TESTING')).toMatchObject({ verdict: 'FAIL' });
    expect(multi.probes.find((p) => p.id === 'MULTIPLE_TESTING')!.reason).toContain('2 hypotheses were tested with NO declared correction');
  });

  it('is deterministic: the same run gives the same report and fingerprint', () => {
    const a = finalistFalsification(run, 'c1');
    const b = finalistFalsification(run, 'c1');
    expect(a).toEqual(b);
    if (a.status === 'RESOLVED' && b.status === 'RESOLVED') expect(a.reportFingerprint).toBe(b.reportFingerprint);
  });
});
