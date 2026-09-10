import { afterEach, describe, expect, it, vi } from 'vitest';

import { GENESIS_GENERATOR_CATALOG, GENESIS_GENERATOR_CATALOG_ID, GENESIS_GENERATOR_OBJECTIVE_METRIC } from '../core/agent/electricalGeneratorLeverCatalog';
import { EXPERIMENT_FABRIC_VERSION } from '../core/experimentFabric/types';
import type { ReferenceMeasurementRequest, DerivedReferenceValue } from '../core/experimentFabric/realExperiment';
import type { FalsificationCriterion } from '../core/experimentFabric/scientificDiscovery';

/**
 * P0 REFERENCE DATA CLOSURE — the SECOND real bridge, closing the loop
 * without a physical lab: `Simulation -> Prediction -> ReferenceMeasurementRequest
 * -> REFERENCE data -> Comparison -> Evidence -> Scientific Memory -> Replay`.
 *
 * `REFERENCE` is the THIRD `DataProvenance` value, orthogonal to
 * `REAL_EXPERIMENTAL`: a cited, published figure (e.g. generator-sizing
 * manufacturer guidance already quoted in `electricalGenerator.ts`'s own doc
 * comment, "no-load consumption commonly cited around 10-15% of full-load
 * fuel flow") rather than a fresh physical measurement. Every seam this test
 * exercises is the SAME one `realExperimentE2E.test.ts` already proves for
 * REAL_EXPERIMENTAL — `verifyPredictionAgainstRealExperiment`,
 * `buildSavedRealExperimentVerification`, `saveRealExperimentVerificationToMemory`,
 * `replaySavedRealExperimentVerification` — broadened to accept REFERENCE
 * alongside REAL_EXPERIMENTAL (refusing only SIMULATED), never a second
 * comparison/Memory/replay mechanism.
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
const VERIFICATION_TOLERANCE_L = 0.5;
/** Real, already-cited figure from electricalGenerator.ts's own doc comment — not invented here. */
const AFFINE_IDLE_FUEL_CITATION_SOURCE = 'electricalGenerator.ts#AFFINE_IDLE_FUEL_L_PER_HR';
const AFFINE_IDLE_FUEL_CITATION_TEXT = 'Representative no-load fuel consumption for this class of mid-size diesel genset, commonly cited around 10-15% of full-load fuel flow (2.4 L/h at this class\'s 50 kW / 0.32 L/kWh baseline).';

function buildReferenceRequest(hypothesisId: string): ReferenceMeasurementRequest {
  return {
    structuredRequest: {
      contractVersion: EXPERIMENT_FABRIC_VERSION,
      sourceText: GOAL,
      domainId: GENESIS_GENERATOR_CATALOG.domainId,
      operation: 'simulate',
      parameters: {},
    },
    citation: { citationText: AFFINE_IDLE_FUEL_CITATION_TEXT, sourceRef: AFFINE_IDLE_FUEL_CITATION_SOURCE },
    hypothesisId,
  };
}

describe('P0 REFERENCE Data Closure — Simulation -> Prediction -> ReferenceMeasurementRequest -> REFERENCE -> Comparison -> Evidence -> Memory -> Replay', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('proves the full REFERENCE bridge, including a genuine mismatch producing FALSIFIED (never silent SUPPORTED)', async () => {
    const storage = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: storage });

    const { runWorldDiscoveryAndRemember } = await import('../core/agent/worldDiscoverySession');
    const { createReferenceMeasurementRun } = await import('../core/experimentFabric/realExperiment');
    const {
      buildSavedRealExperimentVerification, saveRealExperimentVerificationToMemory,
    } = await import('../core/scienceMemory');

    // A) SIMULATION -> PREDICTION, unchanged production seam.
    const state = runWorldDiscoveryAndRemember(GOAL, GENESIS_GENERATOR_CATALOG_ID);
    if (state.kind !== 'COMPLETE') throw new Error(`expected COMPLETE, got ${state.kind}`);
    const lastRound = state.result.rounds[state.result.rounds.length - 1]!;
    expect(lastRound.objectiveObserved).not.toBeNull();
    const predictedValue = lastRound.objectiveObserved!;

    // B) PREDICTION -> ReferenceMeasurementRequest, citing a REAL figure already in this codebase.
    const request = buildReferenceRequest(lastRound.hypothesisId);
    expect(request.citation.sourceRef).toBe(AFFINE_IDLE_FUEL_CITATION_SOURCE);

    // C) & D) Cited value assembled into a REFERENCE-tagged ExperimentRun.
    const derived: DerivedReferenceValue[] = [{ outputKey: GENESIS_GENERATOR_OBJECTIVE_METRIC, value: predictedValue + 0.1, unit: 'L' }];
    const referenceRun = createReferenceMeasurementRun({
      request,
      derived,
      summary: 'Cited affine idle-fuel-burn figure, expressed as an expected fuel-remaining value for this same scenario.',
    });
    expect(referenceRun.provenance.dataProvenance).toBe('REFERENCE');
    expect(referenceRun.provenance.resultOrigin).toBe('knowledge-only');
    expect(referenceRun.provenance.deterministic).toBe(true);

    // F) Comparison, via the SAME verification used for REAL_EXPERIMENTAL — never a second mechanism.
    const verificationCriterion: FalsificationCriterion = {
      metric: GENESIS_GENERATOR_OBJECTIVE_METRIC,
      relation: 'equal-within-tolerance',
      tolerance: VERIFICATION_TOLERANCE_L,
      rationale: 'The cited manufacturer figure should agree with the model prediction for the same scenario, within ordinary rounding of the published rule-of-thumb.',
    };
    const saved = buildSavedRealExperimentVerification({
      predictionSourceExperimentId: state.savedExperimentId,
      loopResult: state.result,
      verificationCriterion,
      request,
      realRun: referenceRun,
    });
    expect(saved.verification.assessment).toBe('SUPPORTED_WITHIN_PROTOCOL');

    // G) Evidence preserves REFERENCE provenance; H) saved to Memory with the correct epistemic status.
    const memoryRecord = saveRealExperimentVerificationToMemory(saved);
    expect(memoryRecord.realExperimentVerification?.realRun.provenance.dataProvenance).toBe('REFERENCE');
    expect(memoryRecord.epistemicStatus).toBe('REFERENCE');

    // I) A real restart: fresh modules, same persisted storage.
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: storage });
    const memoryAfterRestart = await import('../core/scienceMemory');
    const reloaded = memoryAfterRestart.getExperiment(memoryRecord.id);
    expect(reloaded).not.toBeUndefined();
    expect(reloaded!.realExperimentVerification?.resultFingerprint).toBe(saved.resultFingerprint);

    // J) & K) Replay reruns the SIMULATION only — the cited figure never changes, no "re-measurement" of a citation.
    const replay = memoryAfterRestart.replaySavedRealExperimentVerification(reloaded!);
    expect(replay.status).toBe('MATCH');
    const reloadedAgain = memoryAfterRestart.getExperiment(memoryRecord.id);
    expect(reloadedAgain!.realExperimentVerification!.realRun).toEqual(reloaded!.realExperimentVerification!.realRun);

    // L) A deliberate mismatch between prediction and the cited figure must FALSIFY, never silently SUPPORT.
    const mismatchedDerived: DerivedReferenceValue[] = [{ outputKey: GENESIS_GENERATOR_OBJECTIVE_METRIC, value: predictedValue + 500, unit: 'L' }];
    const mismatchedRun = createReferenceMeasurementRun({
      request,
      derived: mismatchedDerived,
      summary: 'A deliberately mismatched cited figure.',
    });
    const mismatchedSaved = buildSavedRealExperimentVerification({
      predictionSourceExperimentId: state.savedExperimentId,
      loopResult: state.result,
      verificationCriterion,
      request,
      realRun: mismatchedRun,
    });
    expect(mismatchedSaved.verification.assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
  }, 60_000);

  it('refuses to compare a SIMULATED run as if it were externally sourced (SIMULATED is the only refused provenance)', async () => {
    const storage = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: storage });
    const { runWorldDiscoveryAndRemember } = await import('../core/agent/worldDiscoverySession');
    const { verifyPredictionAgainstRealExperiment } = await import('../core/agent/predictionVerification');

    const state = runWorldDiscoveryAndRemember(GOAL, GENESIS_GENERATOR_CATALOG_ID);
    if (state.kind !== 'COMPLETE') throw new Error('expected COMPLETE');
    const lastRound = state.result.rounds[state.result.rounds.length - 1]!;

    const criterion: FalsificationCriterion = {
      metric: GENESIS_GENERATOR_OBJECTIVE_METRIC, relation: 'equal-within-tolerance', tolerance: VERIFICATION_TOLERANCE_L, rationale: 'test',
    };
    const simulatedRun = {
      contractVersion: EXPERIMENT_FABRIC_VERSION,
      runId: 'fake-simulated-run',
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
      realRun: simulatedRun,
    });
    expect(verification.assessment).toBe('INCONCLUSIVE');
    expect(verification.observedValue).toBeNull();
    expect(verification.message).toContain('REAL_EXPERIMENTAL or REFERENCE');
  });

  it('createReferenceMeasurementRun rejects an unattributed citation (empty sourceRef) rather than accepting a fabricated one', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { createReferenceMeasurementRun } = await import('../core/experimentFabric/realExperiment');
    const request = buildReferenceRequest('h:fuel-efficiency');
    expect(() =>
      createReferenceMeasurementRun({
        request: { ...request, citation: { citationText: 'some claim', sourceRef: '' } },
        derived: [{ outputKey: GENESIS_GENERATOR_OBJECTIVE_METRIC, value: 40, unit: 'L' }],
        summary: 'no traceable source',
      }),
    ).toThrow(/non-empty sourceRef/);
  });
});
