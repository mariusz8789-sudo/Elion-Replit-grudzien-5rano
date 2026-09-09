import { afterEach, describe, expect, it, vi } from 'vitest';

import { GENESIS_GENERATOR_CATALOG, GENESIS_GENERATOR_CATALOG_ID, GENESIS_GENERATOR_OBJECTIVE_METRIC } from '../core/agent/electricalGeneratorLeverCatalog';
import { EXPERIMENT_FABRIC_VERSION } from '../core/experimentFabric/types';
import type { RealExperimentRequest, RawMeasurement, DerivedMeasurement } from '../core/experimentFabric/realExperiment';
import type { FalsificationCriterion } from '../core/experimentFabric/scientificDiscovery';

/**
 * EVIDENCE & REPLAY CASE STUDY — proves `evidenceCaseStudy.ts` shapes the two real investigation
 * kinds honestly, from records built through the SAME production seams `realExperimentE2E.test.ts`
 * already proves end to end (`runWorldDiscoveryAndRemember`, `createRealExperimentRun`,
 * `buildSavedRealExperimentVerification`) — no second fixture-building path invented here.
 */

function makeFakeStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

const GOAL = 'Maximise remaining fuel, at most 12 experiments.';
const TOLERANCE_L = 0.5;

function buildRequest(hypothesisId: string): RealExperimentRequest {
  return {
    structuredRequest: {
      contractVersion: EXPERIMENT_FABRIC_VERSION,
      sourceText: GOAL,
      domainId: GENESIS_GENERATOR_CATALOG.domainId,
      operation: 'simulate',
      parameters: {},
    },
    physicalProtocolRef: 'manual-fuel-dipstick-reading-v1',
    hypothesisId,
  };
}

describe('evidenceCaseStudy — honest shaping of real Scientific Memory records', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a SIMULATED worldDiscovery run alone qualifies as a candidate, shaped as SIMULATED_DISCOVERY', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runWorldDiscoveryAndRemember } = await import('../core/agent/worldDiscoverySession');
    const { listCaseStudyCandidates, buildCaseStudy, replayCaseStudy } = await import('../components/visual-simulation/evidenceCaseStudy');
    const { getExperiment } = await import('../core/scienceMemory');

    const state = runWorldDiscoveryAndRemember(GOAL, GENESIS_GENERATOR_CATALOG_ID);
    if (state.kind !== 'COMPLETE') throw new Error(`expected COMPLETE, got ${state.kind}`);

    const candidates = listCaseStudyCandidates();
    expect(candidates.some((c) => c.id === state.savedExperimentId)).toBe(true);

    const saved = getExperiment(state.savedExperimentId)!;
    const study = buildCaseStudy(saved);
    expect(study).not.toBeNull();
    expect(study!.kind).toBe('SIMULATED_DISCOVERY');
    expect(study!.recordProvenance).toBe('SIMULATED');
    expect(study!.steps.map((s) => s.key)).toEqual(expect.arrayContaining(['question', 'hypothesis', 'criterion', 'data', 'verdict', 'evidence-bundle']));
    expect(study!.steps.find((s) => s.key === 'question')!.lines[0]).toBe(GOAL);

    const replay = replayCaseStudy(saved);
    expect(replay.status).toBe('MATCH');
  }, 30_000);

  it('a REAL_EXPERIMENTAL verification is preferred over its own SIMULATED source and sorts first', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runWorldDiscoveryAndRemember } = await import('../core/agent/worldDiscoverySession');
    const { createRealExperimentRun } = await import('../core/experimentFabric/realExperiment');
    const { buildSavedRealExperimentVerification, saveRealExperimentVerificationToMemory, getExperiment } = await import('../core/scienceMemory');
    const { listCaseStudyCandidates, buildCaseStudy, replayCaseStudy } = await import('../components/visual-simulation/evidenceCaseStudy');

    const state = runWorldDiscoveryAndRemember(GOAL, GENESIS_GENERATOR_CATALOG_ID);
    if (state.kind !== 'COMPLETE') throw new Error('expected COMPLETE');
    const lastRound = state.result.rounds[state.result.rounds.length - 1]!;
    const predictedValue = lastRound.objectiveObserved!;

    const request = buildRequest(lastRound.hypothesisId);
    const raw: RawMeasurement = { channel: 'fuel-tank-dipstick', value: predictedValue + 0.1, unit: 'L', capturedAt: '2026-09-09T12:00:00.000Z' };
    const derived: DerivedMeasurement[] = [{ outputKey: GENESIS_GENERATOR_OBJECTIVE_METRIC, value: raw.value, unit: 'L', derivedFrom: [raw] }];
    const realRun = createRealExperimentRun({ request, derived, summary: 'Manual dipstick reading.' });

    const verificationCriterion: FalsificationCriterion = {
      metric: GENESIS_GENERATOR_OBJECTIVE_METRIC,
      relation: 'equal-within-tolerance',
      tolerance: TOLERANCE_L,
      rationale: 'A real generator should leave a fuel level close to the model prediction.',
    };
    const savedVerification = buildSavedRealExperimentVerification({
      predictionSourceExperimentId: state.savedExperimentId,
      loopResult: state.result,
      verificationCriterion,
      request,
      realRun,
    });
    const memoryRecord = saveRealExperimentVerificationToMemory(savedVerification);

    const candidates = listCaseStudyCandidates();
    // Both the SIMULATED prediction and the REAL_EXPERIMENTAL verification qualify; the real one sorts first.
    expect(candidates[0]!.id).toBe(memoryRecord.id);
    expect(candidates.some((c) => c.id === state.savedExperimentId)).toBe(true);

    const saved = getExperiment(memoryRecord.id)!;
    const study = buildCaseStudy(saved)!;
    expect(study.kind).toBe('REAL_VERIFICATION');
    expect(study.recordProvenance).toBe('REAL_EXPERIMENTAL');
    const dataStep = study.steps.find((s) => s.key === 'data')!;
    expect(dataStep.lines.some((l) => l.includes('SIMULATED'))).toBe(true);
    expect(dataStep.lines.some((l) => l.includes('REAL_EXPERIMENTAL'))).toBe(true);
    const verdictStep = study.steps.find((s) => s.key === 'verdict')!;
    expect(verdictStep.lines[0]).toBe('SUPPORTED_WITHIN_PROTOCOL');

    const replay = replayCaseStudy(saved);
    expect(replay.status).toBe('MATCH');
  }, 30_000);

  it('never hides a DRIFT replay verdict behind a flattering reason', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runWorldDiscoveryAndRemember } = await import('../core/agent/worldDiscoverySession');
    const { createRealExperimentRun } = await import('../core/experimentFabric/realExperiment');
    const { buildSavedRealExperimentVerification, saveRealExperimentVerificationToMemory, getExperiment } = await import('../core/scienceMemory');
    const { buildCaseStudy, replayCaseStudy } = await import('../components/visual-simulation/evidenceCaseStudy');

    const state = runWorldDiscoveryAndRemember(GOAL, GENESIS_GENERATOR_CATALOG_ID);
    if (state.kind !== 'COMPLETE') throw new Error('expected COMPLETE');
    const lastRound = state.result.rounds[state.result.rounds.length - 1]!;
    const predictedValue = lastRound.objectiveObserved!;
    const request = buildRequest(lastRound.hypothesisId);
    const raw: RawMeasurement = { channel: 'fuel-tank-dipstick', value: predictedValue + 0.1, unit: 'L', capturedAt: '2026-09-09T12:00:00.000Z' };
    const derived: DerivedMeasurement[] = [{ outputKey: GENESIS_GENERATOR_OBJECTIVE_METRIC, value: raw.value, unit: 'L', derivedFrom: [raw] }];
    const realRun = createRealExperimentRun({ request, derived, summary: 'Manual dipstick reading.' });
    const verificationCriterion: FalsificationCriterion = {
      metric: GENESIS_GENERATOR_OBJECTIVE_METRIC, relation: 'equal-within-tolerance', tolerance: TOLERANCE_L,
      rationale: 'test',
    };
    const savedVerification = buildSavedRealExperimentVerification({
      predictionSourceExperimentId: state.savedExperimentId, loopResult: state.result, verificationCriterion, request, realRun,
    });
    const memoryRecord = saveRealExperimentVerificationToMemory(savedVerification);
    const saved = getExperiment(memoryRecord.id)!;

    // Tamper the stored record after save, exactly as realExperimentE2E.test.ts does — this MUST
    // surface as DRIFT through this screen's own replay call, never silently as MATCH. The original
    // assessment here is SUPPORTED_WITHIN_PROTOCOL (offset 0.1 is within the 0.5 tolerance), so the
    // tamper flips it to FALSIFIED_WITHIN_PROTOCOL — a genuinely different value, not a same-value no-op.
    const corrupted = {
      ...saved,
      realExperimentVerification: {
        ...saved.realExperimentVerification!,
        verification: { ...saved.realExperimentVerification!.verification, assessment: 'FALSIFIED_WITHIN_PROTOCOL' as const },
      },
    };
    const replay = replayCaseStudy(corrupted);
    expect(replay.status).toBe('DRIFT');
    expect(replay.status).not.toBe('MATCH');
    // The case study itself still renders — a DRIFT verdict is shown, not hidden by refusing to build a study.
    expect(buildCaseStudy(corrupted)).not.toBeNull();
  }, 30_000);

  it('a bare scenario-only saved experiment (no Evidence Bundle of its own) is not a candidate', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { saveExperiment } = await import('../core/scienceMemory');
    const { isCaseStudyCandidate, listCaseStudyCandidates } = await import('../components/visual-simulation/evidenceCaseStudy');

    const saved = saveExperiment({
      labId: 'test-lab',
      experimentId: 'test-experiment',
      experimentName: 'A bare experiment with no Evidence Bundle',
      params: {},
      stats: {},
      honesty: 'simplified',
      honestyNote: 'test fixture',
      assumptions: [],
      epistemicStatus: 'SIMULATION',
    });

    expect(isCaseStudyCandidate(saved)).toBe(false);
    expect(listCaseStudyCandidates().some((c) => c.id === saved.id)).toBe(false);
  });
});
