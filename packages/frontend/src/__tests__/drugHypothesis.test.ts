import { describe, expect, it } from 'vitest';
import { buildDrugHypothesis, evaluateDrugHypothesis, nextDrugExperiment } from '../core/liveExperiment/drugHypothesis';
import { projectDrugRun, type CampaignEventRecord } from '../core/liveExperiment/drugRunState';
import type { CampaignCandidate } from '../core/backend/client';

const cand = (id: string, status = 'retained'): CampaignCandidate => ({ id, generation: 1, parentSmiles: 'c1ccccc1', transformation: 'add-methyl', canonicalSmiles: `C${id}`, valid: true, descriptors: {}, objectiveVector: {}, constraintViolations: [], pareto: true, status, rejectedReason: null, runIds: [] });
const ev = (seq: number, type: string, payload: Record<string, unknown>): CampaignEventRecord => ({ seq, id: `e${seq}`, generation: 1, type, payload, createdAt: seq });
const run = (affinity: number | null, admet: 'ADMET_FILTER_PASSED' | 'ADMET_FILTER_REJECTED' | null, blocked = false) => {
  const events: CampaignEventRecord[] = [ev(1, 'STOPPING_CONDITION_REACHED', { stopReason: 'BUDGET_EXHAUSTED' })];
  if (admet) events.push(ev(2, 'STAGE_RESULT', { stage: 'admet', candidateId: 'x', reason: 'ADMET_COMPUTED', admetRunId: 'ra' }), ev(3, 'STAGE_SELECTION', { stage: 'admet', candidateId: 'x', reason: admet }));
  if (affinity !== null) events.push(ev(4, 'STAGE_RESULT', { stage: 'docking', candidateId: 'x', reason: 'DOCKING_RESULT_RETAINED', bestAffinityKcalMol: affinity, runId: 'rd' }));
  if (blocked) events.push(ev(5, 'STAGE_BLOCKED', { stage: 'docking', blocker: 'BLOCKED_BY_RUNTIME' }));
  return projectDrugRun({ events, candidates: [cand('x')], maxGenerations: 1, jobRunning: false });
};

describe('drug hypothesis — frozen criteria, verdict from engine measurements only', () => {
  const h = buildDrugHypothesis('aspiryna');
  it('the fingerprint is fixed before the run and deterministic', () => {
    expect(buildDrugHypothesis('aspiryna').fingerprint).toBe(h.fingerprint);
    expect(buildDrugHypothesis('ibuprofen').fingerprint).not.toBe(h.fingerprint);
  });
  it('SUPPORTED when every criterion is met', () => {
    const s = run(-6.1, 'ADMET_FILTER_PASSED');
    expect(evaluateDrugHypothesis(h, s, s.candidates[0]!).verdict).toBe('SUPPORTED');
  });
  it('FALSIFIED when a criterion fails and none is met', () => {
    const s = projectDrugRun({ events: [], candidates: [cand('x', 'rejected')], maxGenerations: 1, jobRunning: false });
    expect(evaluateDrugHypothesis(h, s, s.candidates[0]!).verdict).toBe('FALSIFIED');
  });
  it('WEAKENED when some criteria fail', () => {
    const s = run(-4.2, 'ADMET_FILTER_PASSED');
    const r = evaluateDrugHypothesis(h, s, s.candidates[0]!);
    expect(r.verdict).toBe('WEAKENED');
    expect(r.criteria.find((c) => c.id === 'docking')).toEqual({ id: 'docking', status: 'NOT_MET', observed: '-4.20 kcal/mol' });
  });
  it('a blocked stage is UNRESOLVED, never counted as met, and the next step says so', () => {
    const s = run(null, 'ADMET_FILTER_PASSED', true);
    const r = evaluateDrugHypothesis(h, s, s.candidates[0]!);
    expect(r.criteria.find((c) => c.id === 'docking')?.status).toBe('UNRESOLVED');
    expect(r.verdict).toBe('UNRESOLVED');
    expect(nextDrugExperiment(r, s).title).toMatch(/zablokowany/);
  });
});
