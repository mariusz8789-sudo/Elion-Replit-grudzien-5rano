import { describe, expect, it } from 'vitest';
import { labProcedureOf } from '../core/liveExperiment/labProcedure';
import { projectDrugRun, type CampaignEventRecord, type DockingRunRecord } from '../core/liveExperiment/drugRunState';
import type { CampaignCandidate } from '../core/backend/client';

const cand = (id: string, status = 'retained'): CampaignCandidate => ({ id, generation: 1, parentSmiles: 'c1ccccc1', transformation: 'add-methyl', canonicalSmiles: `C${id}`, valid: true, descriptors: {}, objectiveVector: {}, constraintViolations: [], pareto: true, status, rejectedReason: null, runIds: [] });
const ev = (seq: number, type: string, payload: Record<string, unknown>): CampaignEventRecord => ({ seq, id: `e${seq}`, generation: 1, type, payload, createdAt: seq });
const dockingRun: DockingRunRecord = {
  id: 'rd',
  outputs: { poseSha256: 'f'.repeat(64), pose: { atoms: [['C', 1, 2, 3], ['N', 2, 3, 4]], bonds: [[0, 1, 1]] }, pocket: { residues: ['TYR253:A', 'PHE382:A'], atoms: [['C', 0, 0, 0, 0]] } },
  provenance: { engine: 'AutoDock Vina 1.2.7 + Meeko 0.8.0' },
};
const receptor = ev(2, 'STAGE_PROGRESS', { stage: 'docking', step: 'RECEPTOR_PREPARED', targetId: 'ABL1_1IEP', pdbId: '1IEP', chain: 'A', protein: 'ABL1', receptorPdbqtSha256: 'b'.repeat(64), sourceSha256: 'c'.repeat(64), receptorAtoms: 2702, center: [15.19, 53.903, 16.917], boxSize: [20, 20, 20], meekoVersion: '0.8.0' });
const build = (events: CampaignEventRecord[], opts: { jobRunning?: boolean; runs?: DockingRunRecord[] } = {}) =>
  projectDrugRun({ events, candidates: [cand('x')], maxGenerations: 1, jobRunning: opts.jobRunning ?? true, dockingRuns: opts.runs ?? [] });
const status = (state: ReturnType<typeof build>, outcome = {}) => {
  const p = labProcedureOf(state, state.candidates[0] ?? null, outcome);
  return Object.fromEntries(p.phases.map((x) => [x.id, x.status]));
};

describe('lab procedure — the canonical run state read as a bench procedure', () => {
  it('nothing has happened yet: the first phase is the only active one', () => {
    const p = labProcedureOf(null, null);
    expect(p.activeId).toBeNull();
    expect(p.phases.map((x) => x.id)).toEqual(['PREPARE', 'LOAD', 'CONFIGURE', 'EXECUTE', 'OBSERVE', 'MEASURE', 'INTERPRET', 'EVIDENCE', 'REPLAY']);
    expect(p.phases.every((x) => x.status === 'PENDING')).toBe(true);
  });

  it('the docking phases only advance once the engine wrote the step that proves them', () => {
    const preparing = build([]);
    expect(status(preparing).CONFIGURE).toBe('PENDING');

    const configured = build([receptor, ev(3, 'STAGE_PROGRESS', { stage: 'docking', step: 'LIGAND_PREPARED', candidateId: 'x' })]);
    const s1 = status(configured);
    expect(s1.CONFIGURE).toBe('DONE');
    expect(s1.EXECUTE).toBe('PENDING');

    const running = build([receptor, ev(3, 'STAGE_PROGRESS', { stage: 'docking', step: 'LIGAND_PREPARED', candidateId: 'x' }), ev(4, 'STAGE_PROGRESS', { stage: 'docking', step: 'VINA_STARTED', candidateId: 'x' })]);
    const s2 = status(running);
    expect(s2.EXECUTE).toBe('ACTIVE');
    expect(s2.OBSERVE).toBe('PENDING');
    expect(s2.MEASURE).toBe('PENDING');
    expect(labProcedureOf(running, running.candidates[0]!).activeId).toBe('EXECUTE');
  });

  it('the pose and the score are shown only when they exist, each with its own epistemic label', () => {
    const events = [
      receptor,
      ev(3, 'STAGE_RESULT', { stage: 'admet', candidateId: 'x', reason: 'ADMET_COMPUTED', admetRunId: 'ra', keyEndpoints: { AMES: 0.18, hERG: 0.21 } }),
      ev(4, 'STAGE_PROGRESS', { stage: 'docking', step: 'LIGAND_PREPARED', candidateId: 'x' }),
      ev(5, 'STAGE_PROGRESS', { stage: 'docking', step: 'VINA_STARTED', candidateId: 'x' }),
      ev(6, 'STAGE_RESULT', { stage: 'docking', candidateId: 'x', reason: 'DOCKING_RESULT_RETAINED', bestAffinityKcalMol: -11.4, runId: 'rd' }),
      ev(7, 'STOPPING_CONDITION_REACHED', { stopReason: 'BUDGET_EXHAUSTED' }),
    ];
    const done = build(events, { jobRunning: false, runs: [dockingRun] });
    const p = labProcedureOf(done, done.candidates[0]!, { verdict: 'SUPPORTED', sealed: true, replay: 'MATCH' });
    const by = Object.fromEntries(p.phases.map((x) => [x.id, x]));
    expect(by.OBSERVE!.status).toBe('DONE');
    expect(by.OBSERVE!.detail).toContain('TYR253:A');
    expect(by.MEASURE!.detail).toContain('-11.40 kcal/mol');
    expect(by.MEASURE!.detail).toContain('nie pomiar');
    expect(by.LOAD!.evidence).toBe('MODEL_ESTIMATE');
    expect(by.LOAD!.detail).toContain('AMES 0.18');
    expect(by.CONFIGURE!.evidence).toBe('REFERENCE_DATA');
    expect(by.EXECUTE!.evidence).toBe('REAL_ENGINE_OUTPUT');
    expect(by.INTERPRET!.evidence).toBe('DERIVED');
    expect([by.INTERPRET!.status, by.EVIDENCE!.status, by.REPLAY!.status]).toEqual(['DONE', 'DONE', 'DONE']);
    expect(p.activeId).toBeNull();
  });

  it('a blocked stage blocks its phase and nothing downstream claims a result', () => {
    const blocked = build([ev(2, 'STAGE_BLOCKED', { stage: 'docking', blocker: 'BLOCKED_BY_RUNTIME' })], { jobRunning: false });
    const p = labProcedureOf(blocked, blocked.candidates[0]!);
    const by = Object.fromEntries(p.phases.map((x) => [x.id, x]));
    expect(by.CONFIGURE!.status).toBe('BLOCKED');
    expect(by.EXECUTE!.status).toBe('BLOCKED');
    expect(by.OBSERVE!.status).toBe('PENDING');
    expect(by.MEASURE!.status).toBe('PENDING');
    expect(by.CONFIGURE!.detail).toContain('BLOCKED_BY_RUNTIME');
  });
});
