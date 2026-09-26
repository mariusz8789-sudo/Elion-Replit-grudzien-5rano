import { describe, expect, it } from 'vitest';
import { projectDrugRun, type CampaignEventRecord } from '../core/liveExperiment/drugRunState';
import { benchLayoutOf, focusCandidate } from '../core/liveExperiment/drugBenchLayout';
import { labProcedureOf } from '../core/liveExperiment/labProcedure';
import { benchHandlingOf, transferMotion, TRANSFER_MS, type HandAction } from '../core/liveExperiment/benchHandling';
import type { CampaignCandidate } from '../core/backend/client';

/**
 * THE HANDS. Gate B asks for a visible experiment: a sample gripped, carried and put into the right
 * instrument. These tests hold the handling projection to the rules that make it honest —
 *   • a sample is only ever handled with its molecular identity attached;
 *   • the gesture is labelled SIMULATED and carries the real label of the step it represents;
 *   • the presentation clock moves the hands and NOTHING else: no clamped motion, no elapsed time and
 *     no repeated call can finish a phase, advance the funnel or produce a number.
 */

const cand = (id: string, smiles: string, status = 'retained', rejectedReason: string | null = null): CampaignCandidate => ({
  id, generation: 1, parentSmiles: null, transformation: 'add-methyl', canonicalSmiles: smiles, valid: true,
  descriptors: {}, objectiveVector: {}, constraintViolations: [], pareto: false, status, rejectedReason, runIds: [],
});
let seq = 0;
const ev = (type: string, payload: Record<string, unknown>): CampaignEventRecord => ({ seq: ++seq, id: `e${seq}`, generation: 1, type, payload, createdAt: 1000 + seq });

const candidates = [cand('queued', 'c1ccccc1'), cand('analysed', 'Cc1ccccc1'), cand('docked', 'CCc1ccccc1')];

function handling(events: CampaignEventRecord[], motion = 0, jobRunning = true) {
  const state = projectDrugRun({ events, candidates, maxGenerations: 1, jobRunning });
  const procedure = labProcedureOf(state, focusCandidate(state));
  return { handling: benchHandlingOf(procedure, benchLayoutOf(state), motion), procedure, state };
}

describe('benchHandlingOf — the hands do the work the record proves', () => {
  it('loading the analyser is one transfer: reach, grip, carry, place, then stand and wait', () => {
    const events = [ev('STAGE_SELECTION', { stage: 'admet', candidateId: 'queued', reason: 'SELECTED_FOR_ADMET' })];
    const order: HandAction[] = [0, 0.3, 0.5, 0.8, 1].map((m) => handling(events, m).handling.action);
    expect(order).toEqual(['REACH', 'GRIP', 'CARRY', 'PLACE', 'OPERATE']);
    const mid = handling(events, 0.5).handling;
    expect(mid.instrument).toBe('ANALYSER');
    expect(mid.carrying).toBe(true);
    // Identity travels with the sample: never "sample 3".
    expect(mid.sampleLabel).toBe('c1ccccc1');
    expect(mid.note).toContain('c1ccccc1');
    // The gesture is a simulated laboratory step standing for a model prediction.
    expect(mid.evidence).toBe('SIMULATED');
    expect(mid.represents).toBe('MODEL_ESTIMATE');
  });

  it('the vial leaves the hand only at the instrument: carrying is false before the grip and after the placement', () => {
    const events = [ev('STAGE_SELECTION', { stage: 'admet', candidateId: 'queued', reason: 'SELECTED_FOR_ADMET' })];
    expect(handling(events, 0).handling.carrying).toBe(false);
    expect(handling(events, 1).handling.carrying).toBe(false);
  });

  it('while Vina runs the scientist stands at the docking workstation, hands empty', () => {
    const events = [
      ev('STAGE_RESULT', { stage: 'admet', candidateId: 'docked', reason: 'ADMET_COMPUTED', keyEndpoints: { AMES: 0.2 } }),
      ev('STAGE_PROGRESS', { stage: 'docking', candidateId: 'docked', step: 'VINA_STARTED' }),
    ];
    const h = handling(events, 1).handling;
    expect(h.phaseId).toBe('EXECUTE');
    expect(h.action).toBe('OPERATE');
    expect(h.instrument).toBe('WORKSTATION');
    expect(h.carrying).toBe(false);
    expect(h.represents).toBe('REAL_ENGINE_OUTPUT');
  });

  it('a blocked stage stops the hands and says why, instead of miming a transfer', () => {
    const events = [ev('STAGE_BLOCKED', { stage: 'admet', candidateId: 'queued', blocker: 'ADMET_MODEL_MISSING' })];
    const h = handling(events, 1).handling;
    expect(h.action).toBe('IDLE');
    expect(h.carrying).toBe(false);
    expect(h.note).toContain('ADMET_MODEL_MISSING');
  });

  it('with nothing persisted the hands are empty and say what they are waiting for', () => {
    const state = projectDrugRun({ events: [], candidates: [], maxGenerations: 1, jobRunning: true });
    const h = benchHandlingOf(labProcedureOf(state, null), benchLayoutOf(state), 1);
    expect(h.action).toBe('IDLE');
    expect(h.sampleId).toBeNull();
    expect(h.sampleLabel).toBeNull();
  });

  it('THE RULE: the presentation clock moves hands only — it never advances the experiment', () => {
    const events = [ev('STAGE_SELECTION', { stage: 'admet', candidateId: 'queued', reason: 'SELECTED_FOR_ADMET' })];
    const early = handling(events, 0);
    const late = handling(events, 1);
    // Same phases, same statuses, same funnel: only the gesture differs.
    expect(late.procedure.phases.map((p) => [p.id, p.status])).toEqual(early.procedure.phases.map((p) => [p.id, p.status]));
    expect(late.state.stateHash).toBe(early.state.stateHash);
    expect(benchLayoutOf(late.state).counts).toEqual(benchLayoutOf(early.state).counts);
    // And the completed phases are exactly those the record proves, at every point of the movement.
    expect(late.procedure.phases.filter((p) => p.status === 'DONE').map((p) => p.id)).toEqual(
      early.procedure.phases.filter((p) => p.status === 'DONE').map((p) => p.id),
    );
  });

  it('motion is clamped, so a long engine run leaves the hands working instead of looping', () => {
    expect(transferMotion(0)).toBe(0);
    expect(transferMotion(TRANSFER_MS / 2)).toBeCloseTo(0.5, 5);
    expect(transferMotion(TRANSFER_MS)).toBe(1);
    expect(transferMotion(TRANSFER_MS * 100)).toBe(1); // three minutes of Vina: still 1, never 0 again
    expect(transferMotion(-5)).toBe(0);
  });

  it('observation looks at the pose that exists, and records the result at the monitor afterwards', () => {
    const observe = [
      ev('STAGE_RESULT', { stage: 'admet', candidateId: 'docked', reason: 'ADMET_COMPUTED', keyEndpoints: { AMES: 0.2 } }),
      ev('STAGE_RESULT', { stage: 'docking', candidateId: 'docked', reason: 'DOCKING_RESULT_RETAINED', bestAffinityKcalMol: -9.5, runId: 'r1' }),
    ];
    const h = handling(observe, 1).handling;
    expect(h.action).toBe('OBSERVE');
    expect(h.instrument).toBe('POSE_VIEWER');
    expect(h.represents).toBe('REAL_ENGINE_OUTPUT');
    expect(h.note).toContain('kieszeni');
  });
});
