import { describe, expect, it } from 'vitest';
import { buildDrugHypothesis, evaluateDrugHypothesis, nextDrugExperiment, DEFAULT_DRUG_TARGET } from '../core/liveExperiment/drugHypothesis';
import { projectDrugRun, type CampaignEventRecord, type DockingRunRecord } from '../core/liveExperiment/drugRunState';
import type { CampaignCandidate } from '../core/backend/client';

const cand = (id: string, status = 'retained'): CampaignCandidate => ({ id, generation: 1, parentSmiles: 'c1ccccc1', transformation: 'add-methyl', canonicalSmiles: `C${id}`, valid: true, descriptors: {}, objectiveVector: {}, constraintViolations: [], pareto: true, status, rejectedReason: null, runIds: [] });
const ev = (seq: number, type: string, payload: Record<string, unknown>): CampaignEventRecord => ({ seq, id: `e${seq}`, generation: 1, type, payload, createdAt: seq });

const dockingRun = (id: string): DockingRunRecord => ({
  id,
  outputs: {
    poseSha256: 'a'.repeat(64),
    pose: { atoms: [['C', 15.1, 53.9, 16.9], ['N', 16.2, 54.1, 17.4]], bonds: [[0, 1, 1]] },
    pocket: { residues: ['TYR253:A', 'PHE382:A'], atoms: [['C', 14.0, 53.0, 16.0, 0]] },
  },
  provenance: { engine: 'AutoDock Vina 1.2.7 + Meeko 0.8.0' },
});

/** A finished run: ADMET endpoints, a docking score against the preregistered target, its pose on record. */
const run = (opts: { affinity?: number | null; ames?: number; herg?: number; target?: boolean; pose?: boolean; blocked?: 'docking' | 'admet' | null; retained?: boolean } = {}) => {
  const { affinity = -11.2, ames = 0.18, herg = 0.21, target = true, pose = true, blocked = null, retained = true } = opts;
  const events: CampaignEventRecord[] = [ev(1, 'STOPPING_CONDITION_REACHED', { stopReason: 'BUDGET_EXHAUSTED' })];
  if (ames !== undefined) events.push(ev(2, 'STAGE_RESULT', { stage: 'admet', candidateId: 'x', reason: 'ADMET_COMPUTED', admetRunId: 'ra', keyEndpoints: { AMES: ames, hERG: herg } }));
  if (target) events.push(ev(3, 'STAGE_PROGRESS', { stage: 'docking', step: 'RECEPTOR_PREPARED', targetId: 'ABL1_1IEP', pdbId: '1IEP', chain: 'A', protein: 'ABL1', receptorPdbqtSha256: 'b'.repeat(64), sourceSha256: 'c'.repeat(64), receptorAtoms: 2702, center: [15.19, 53.903, 16.917], boxSize: [20, 20, 20], meekoVersion: '0.8.0' }));
  if (affinity !== null) events.push(ev(4, 'STAGE_RESULT', { stage: 'docking', candidateId: 'x', reason: 'DOCKING_RESULT_RETAINED', bestAffinityKcalMol: affinity, runId: 'rd', targetId: 'ABL1_1IEP' }));
  if (blocked) events.push(ev(5, 'STAGE_BLOCKED', { stage: blocked, blocker: 'BLOCKED_BY_RUNTIME' }));
  return projectDrugRun({ events, candidates: [cand('x', retained ? 'retained' : 'rejected')], maxGenerations: 1, jobRunning: false, dockingRuns: pose ? [dockingRun('rd')] : [] });
};

describe('drug hypothesis — preregistered criteria, verdict computed from engine output only', () => {
  const h = buildDrugHypothesis('imatynib');

  it('the fingerprint is fixed before the run and covers the target', () => {
    expect(buildDrugHypothesis('imatynib').fingerprint).toBe(h.fingerprint);
    expect(buildDrugHypothesis('aspiryna').fingerprint).not.toBe(h.fingerprint);
    expect(buildDrugHypothesis('imatynib', { ...DEFAULT_DRUG_TARGET, pdbId: '2HYY' }).fingerprint).not.toBe(h.fingerprint);
    expect(h.criteria.filter((c) => c.critical).map((c) => c.id)).toEqual(['docking']);
  });

  it('SUPPORTED when every preregistered criterion is met', () => {
    const s = run();
    const r = evaluateDrugHypothesis(h, s, s.candidates[0]!);
    expect(r.verdict).toBe('SUPPORTED');
    expect(r.criteria.find((c) => c.id === 'docking')).toEqual({ id: 'docking', status: 'MET', observed: '-11.20 kcal/mol (1IEP:A)' });
  });

  it('FALSIFIED when the critical docking criterion fails, whatever else holds', () => {
    const s = run({ affinity: -6.4 });
    const r = evaluateDrugHypothesis(h, s, s.candidates[0]!);
    expect(r.verdict).toBe('FALSIFIED');
    expect(r.rule).toContain('docking');
  });

  it('WEAKENED when the falsifier holds but a non-critical criterion fails', () => {
    const s = run({ herg: 0.97 });
    const r = evaluateDrugHypothesis(h, s, s.candidates[0]!);
    expect(r.verdict).toBe('WEAKENED');
    expect(r.criteria.find((c) => c.id === 'herg')).toEqual({ id: 'herg', status: 'NOT_MET', observed: 'hERG = 0.97' });
  });

  it('UNRESOLVED when a stage was blocked — a missing measurement is never a met criterion', () => {
    const s = run({ affinity: null, blocked: 'docking' });
    const r = evaluateDrugHypothesis(h, s, s.candidates[0]!);
    expect(r.criteria.find((c) => c.id === 'docking')?.status).toBe('UNRESOLVED');
    expect(r.verdict).toBe('UNRESOLVED');
    expect(nextDrugExperiment(r, s).title).toMatch(/zablokowany/);
  });

  it('a score without the preregistered protein or without a pose on record cannot decide the criterion', () => {
    const noTarget = run({ target: false });
    expect(evaluateDrugHypothesis(h, noTarget, noTarget.candidates[0]!).criteria.find((c) => c.id === 'docking')?.observed).toContain('nie wobec 1IEP');
    const noPose = run({ pose: false });
    expect(evaluateDrugHypothesis(h, noPose, noPose.candidates[0]!).verdict).toBe('UNRESOLVED');
  });

  it('a failing falsifier outranks everything, and a met one proposes the next experiment', () => {
    const bad = run({ affinity: -3.0, ames: 0.99, herg: 0.99, retained: false });
    expect(evaluateDrugHypothesis(h, bad, bad.candidates[0]!).verdict).toBe('FALSIFIED');
    const good = run();
    expect(nextDrugExperiment(evaluateDrugHypothesis(h, good, good.candidates[0]!), good).title).toMatch(/Dynamika molekularna/);
    const toxic = run({ ames: 0.94 });
    expect(nextDrugExperiment(evaluateDrugHypothesis(h, toxic, toxic.candidates[0]!), toxic).title).toMatch(/bezpieczeństwa/);
  });
});
