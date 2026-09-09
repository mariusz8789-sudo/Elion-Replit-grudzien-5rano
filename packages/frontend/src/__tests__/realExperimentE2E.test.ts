import { afterEach, describe, expect, it, vi } from 'vitest';

import { GENESIS_GENERATOR_CATALOG, GENESIS_GENERATOR_CATALOG_ID, GENESIS_GENERATOR_OBJECTIVE_METRIC } from '../core/agent/electricalGeneratorLeverCatalog';
import { EXPERIMENT_FABRIC_VERSION } from '../core/experimentFabric/types';
import type { RealExperimentRequest, RawMeasurement, DerivedMeasurement } from '../core/experimentFabric/realExperiment';
import type { FalsificationCriterion } from '../core/experimentFabric/scientificDiscovery';

/**
 * P0 REAL EXPERIMENT E2E — the first real bridge the master task asked for:
 *
 *   Simulation -> Prediction -> RealExperimentRequest -> REAL_EXPERIMENTAL data
 *   -> Comparison -> Evidence -> Scientific Memory -> Replay
 *
 * Every stage below reuses an EXISTING, unmodified production seam:
 *  - the SIMULATED prediction is the real `runWorldDiscoveryAndRemember`
 *    production path (`WorldDiscoveryPanel.tsx`'s own call), not a special
 *    test-only entry point;
 *  - the REAL_EXPERIMENTAL run is `createRealExperimentRun`, unmodified;
 *  - the comparison is `verifyPredictionAgainstRealExperiment`
 *    (`evaluateTwoArmRelation`, the SAME two-arm judge `worldCounterfactual.ts`
 *    already uses) against an EXPLICIT, human-declared `equal-within-tolerance`
 *    criterion — never a fabricated universal threshold;
 *  - Evidence/Memory/Replay is `saveRealExperimentVerificationToMemory` /
 *    `replaySavedRealExperimentVerification`, the fifth investigation shape
 *    alongside `worldDiscovery`, `hypothesisLoop`, `parameterInquiry` and
 *    `mechanismComposition` — the SAME `saveExperiment`/`getExperiment` store
 *    every other shape already uses.
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
/** Declared BEFORE any real measurement exists — never derived from the measurement itself. */
const VERIFICATION_TOLERANCE_L = 0.5;

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

function realRunFor(predictedValue: number, offset: number, capturedAt: string) {
  const raw: RawMeasurement = { channel: 'fuel-tank-dipstick', value: predictedValue + offset, unit: 'L', capturedAt };
  const derived: DerivedMeasurement[] = [
    { outputKey: GENESIS_GENERATOR_OBJECTIVE_METRIC, value: raw.value, unit: 'L', derivedFrom: [raw] },
  ];
  return { raw, derived };
}

describe('P0 Real Experiment E2E — Simulation -> Prediction -> RealExperimentRequest -> REAL_EXPERIMENTAL -> Comparison -> Evidence -> Memory -> Replay', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('proves the full bridge, including a genuine post-save DRIFT on tamper (never silently MATCH)', async () => {
    const storage = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: storage });

    const { runWorldDiscoveryAndRemember } = await import('../core/agent/worldDiscoverySession');
    const { createRealExperimentRun } = await import('../core/experimentFabric/realExperiment');
    const {
      buildSavedRealExperimentVerification, saveRealExperimentVerificationToMemory, getExperiment,
    } = await import('../core/scienceMemory');

    // A) SIMULATION -> PREDICTION, with SIMULATED provenance — the real
    // production seam `WorldDiscoveryPanel.tsx` itself calls, unmodified.
    const state = runWorldDiscoveryAndRemember(GOAL, GENESIS_GENERATOR_CATALOG_ID);
    if (state.kind !== 'COMPLETE') throw new Error(`expected COMPLETE, got ${state.kind}`);
    const predictionExperiment = getExperiment(state.savedExperimentId);
    expect(predictionExperiment).not.toBeUndefined();
    expect(predictionExperiment!.epistemicStatus).toBe('SIMULATION');

    const lastRound = state.result.rounds[state.result.rounds.length - 1]!;
    expect(lastRound.objectiveObserved).not.toBeNull();
    const predictedValue = lastRound.objectiveObserved!;

    // B) PREDICTION -> RealExperimentRequest — a request naming the SAME
    // hypothesis the prediction came from, before any real data exists.
    const request = buildRequest(lastRound.hypothesisId);
    expect(request.hypothesisId).toBe(lastRound.hypothesisId);

    // C) Manual RawMeasurement ingested; D) stamped REAL_EXPERIMENTAL.
    const { derived } = realRunFor(predictedValue, 0.1, '2026-09-09T12:00:00.000Z');
    const derivedSnapshot = JSON.parse(JSON.stringify(derived));
    const realRun = createRealExperimentRun({
      request,
      derived,
      summary: 'Manual dipstick reading taken 10 hours into the outage, matching the declared horizon.',
    });
    expect(realRun.provenance.dataProvenance).toBe('REAL_EXPERIMENTAL');
    expect(realRun.provenance.resultOrigin).toBe('real-engine');

    // E) Real data remains value-equivalent after being fed into a comparison
    // — the input measurements are never mutated by createRealExperimentRun.
    expect(derived).toEqual(derivedSnapshot);
    const observedBeforeCompare = realRun.result.outputs[GENESIS_GENERATOR_OBJECTIVE_METRIC];

    // F) COMPARISON -> explicit assessment, via an EXPLICIT, preregistered
    // tolerance criterion — never a fabricated universal threshold, and never
    // reusing the ORIGINAL hypothesis's own baseline-vs-intervention criterion
    // (a different question) as if it judged prediction-vs-reality.
    const verificationCriterion: FalsificationCriterion = {
      metric: GENESIS_GENERATOR_OBJECTIVE_METRIC,
      relation: 'equal-within-tolerance',
      tolerance: VERIFICATION_TOLERANCE_L,
      rationale: 'A real generator under the same declared protocol should leave a fuel level close to the model prediction, within ordinary dipstick reading error.',
    };
    const saved = buildSavedRealExperimentVerification({
      predictionSourceExperimentId: state.savedExperimentId,
      loopResult: state.result,
      verificationCriterion,
      request,
      realRun,
    });
    expect(saved.verification.assessment).toBe('SUPPORTED_WITHIN_PROTOCOL');
    expect(saved.verification.outcome?.applicable).toBe(true);
    expect(realRun.result.outputs[GENESIS_GENERATOR_OBJECTIVE_METRIC]).toBe(observedBeforeCompare);

    // G) Evidence preserves REAL_EXPERIMENTAL provenance; H) saved to Memory.
    expect(saved.realRun.provenance.dataProvenance).toBe('REAL_EXPERIMENTAL');
    const memoryRecord = saveRealExperimentVerificationToMemory(saved);
    expect(memoryRecord.realExperimentVerification?.realRun.provenance.dataProvenance).toBe('REAL_EXPERIMENTAL');
    expect(memoryRecord.epistemicStatus).toBe('REAL_EXPERIMENTAL');

    // I) A REAL process/session restart: fresh modules, same persisted storage.
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: storage });
    const memoryAfterRestart = await import('../core/scienceMemory');
    const reloaded = memoryAfterRestart.getExperiment(memoryRecord.id);
    expect(reloaded).not.toBeUndefined();
    expect(reloaded!.realExperimentVerification?.resultFingerprint).toBe(saved.resultFingerprint);

    // J) & K) REPLAY reruns the simulation but NEVER the physical experiment —
    // the same stored real run is reused, byte-for-byte, and only the
    // WorldGraph prediction is genuinely recomputed.
    const runIdBeforeReplay = reloaded!.realExperimentVerification!.realRun.runId;
    const replay = memoryAfterRestart.replaySavedRealExperimentVerification(reloaded!);
    expect(replay.status).toBe('MATCH');
    const reloadedAgain = memoryAfterRestart.getExperiment(memoryRecord.id);
    // Replay is read-only: the stored real run is byte-identical after replay.
    expect(reloadedAgain!.realExperimentVerification!.realRun).toEqual(reloaded!.realExperimentVerification!.realRun);
    expect(reloadedAgain!.realExperimentVerification!.realRun.runId).toBe(runIdBeforeReplay);

    // L) A DELIBERATE MISMATCH must produce FALSIFIED / DRIFT, never a silent
    // MATCH — first at the comparison stage (a real reading far outside the
    // preregistered tolerance)...
    const { derived: mismatchedDerived } = realRunFor(predictedValue, 500, '2026-09-09T12:05:00.000Z');
    const mismatchedRun = createRealExperimentRun({
      request,
      derived: mismatchedDerived,
      summary: 'A deliberately mismatched reading — the tank is nowhere near what was predicted.',
    });
    const mismatchedSaved = buildSavedRealExperimentVerification({
      predictionSourceExperimentId: state.savedExperimentId,
      loopResult: state.result,
      verificationCriterion,
      request,
      realRun: mismatchedRun,
    });
    expect(mismatchedSaved.verification.assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
    expect(mismatchedSaved.verification.outcome?.met).toBe(false);

    // ...and again at REPLAY, when a stored record is tampered with after
    // save: self-consistency must catch it as DRIFT, never silently MATCH.
    const tamperedMemoryModule = memoryAfterRestart;
    const tampered = tamperedMemoryModule.saveRealExperimentVerificationToMemory(mismatchedSaved);
    const tamperedReloaded = tamperedMemoryModule.getExperiment(tampered.id)!;
    const corrupted = {
      ...tamperedReloaded,
      realExperimentVerification: {
        ...tamperedReloaded.realExperimentVerification!,
        verification: { ...tamperedReloaded.realExperimentVerification!.verification, assessment: 'SUPPORTED_WITHIN_PROTOCOL' as const },
      },
    };
    const tamperedReplay = tamperedMemoryModule.replaySavedRealExperimentVerification(corrupted);
    expect(tamperedReplay.status).toBe('DRIFT');
    expect(tamperedReplay.status).not.toBe('MATCH');
  }, 60_000);

  it('refuses to compare a non-REAL_EXPERIMENTAL run as if it were a real measurement (no hidden truth, no silent simulator call)', async () => {
    const storage = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: storage });
    const { runWorldDiscoveryAndRemember } = await import('../core/agent/worldDiscoverySession');
    const { verifyPredictionAgainstRealExperiment } = await import('../core/agent/predictionVerification');

    const state = runWorldDiscoveryAndRemember(GOAL, GENESIS_GENERATOR_CATALOG_ID);
    if (state.kind !== 'COMPLETE') throw new Error('expected COMPLETE');
    const lastRound = state.result.rounds[state.result.rounds.length - 1]!;

    const criterion: FalsificationCriterion = {
      metric: GENESIS_GENERATOR_OBJECTIVE_METRIC, relation: 'equal-within-tolerance', tolerance: VERIFICATION_TOLERANCE_L,
      rationale: 'test',
    };
    const notRealRun = {
      contractVersion: EXPERIMENT_FABRIC_VERSION,
      runId: 'fake-run',
      request: { contractVersion: EXPERIMENT_FABRIC_VERSION, sourceText: GOAL, domainId: GENESIS_GENERATOR_CATALOG.domainId, operation: 'simulate' as const, parameters: {} },
      intent: { contractVersion: EXPERIMENT_FABRIC_VERSION, request: { contractVersion: EXPERIMENT_FABRIC_VERSION, sourceText: GOAL, domainId: GENESIS_GENERATOR_CATALOG.domainId, operation: 'simulate' as const, parameters: {} }, capability: 'REAL_ENGINE' as const, confidence: 'high' as const, rationale: '', requiredSolver: 'none', knowledgeSources: [], supplementalKnowledgeIds: [] },
      plan: { contractVersion: EXPERIMENT_FABRIC_VERSION, planId: 'p', intent: { contractVersion: EXPERIMENT_FABRIC_VERSION, request: { contractVersion: EXPERIMENT_FABRIC_VERSION, sourceText: GOAL, domainId: GENESIS_GENERATOR_CATALOG.domainId, operation: 'simulate' as const, parameters: {} }, capability: 'REAL_ENGINE' as const, confidence: 'high' as const, rationale: '', requiredSolver: 'none', knowledgeSources: [], supplementalKnowledgeIds: [] }, engine: null, modelVersion: null, parameterSchema: [], runnable: true, route: { kind: 'none' as const } },
      result: { contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed' as const, summary: 's', outputs: { [GENESIS_GENERATOR_OBJECTIVE_METRIC]: lastRound.objectiveObserved! }, units: {}, warnings: [], assumptions: [], visualization: [], route: { kind: 'none' as const } },
      provenance: {
        contractVersion: EXPERIMENT_FABRIC_VERSION, requestFingerprint: 'rf', runFingerprint: 'runf', knowledgeSources: [], supplementalKnowledgeIds: [],
        domainId: GENESIS_GENERATOR_CATALOG.domainId, engine: null, parameterSnapshot: {}, deterministic: true,
        resultOrigin: 'real-engine' as const, dataProvenance: 'SIMULATED' as const,
      },
    };

    const verification = verifyPredictionAgainstRealExperiment({
      predictedValue: lastRound.objectiveObserved!,
      criterion,
      realRun: notRealRun,
    });
    expect(verification.assessment).toBe('INCONCLUSIVE');
    expect(verification.observedValue).toBeNull();
    expect(verification.message).toContain('REAL_EXPERIMENTAL');
  });

  it('createRealExperimentRun rejects an orphaned derived measurement rather than silently accepting fake data', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { createRealExperimentRun } = await import('../core/experimentFabric/realExperiment');
    const request = buildRequest('h:fuel-efficiency');
    expect(() =>
      createRealExperimentRun({
        request,
        derived: [{ outputKey: GENESIS_GENERATOR_OBJECTIVE_METRIC, value: 40, unit: 'L', derivedFrom: [] }],
        summary: 'no raw readings behind this at all',
      }),
    ).toThrow(/no raw readings/);
  });
});
