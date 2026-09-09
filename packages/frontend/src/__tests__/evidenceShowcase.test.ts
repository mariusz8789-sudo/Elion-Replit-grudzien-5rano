import { afterEach, describe, expect, it, vi } from 'vitest';

import { GENESIS_GENERATOR_CATALOG, GENESIS_GENERATOR_CATALOG_ID, GENESIS_GENERATOR_OBJECTIVE_METRIC } from '../core/agent/electricalGeneratorLeverCatalog';
import { EXPERIMENT_FABRIC_VERSION } from '../core/experimentFabric/types';
import type { RealExperimentRequest, RawMeasurement, DerivedMeasurement } from '../core/experimentFabric/realExperiment';
import type { FalsificationCriterion } from '../core/experimentFabric/scientificDiscovery';
import type { ScientificEvidencePack } from '../core/experimentFabric/evidencePack';

/**
 * EVIDENCE & REPLAY SHOWCASE — proves `evidenceShowcase.ts` shapes all three real investigation
 * kinds honestly. The first two are built from records through the SAME production seams
 * `realExperimentE2E.test.ts` already proves end to end (`runWorldDiscoveryAndRemember`,
 * `createRealExperimentRun`, `buildSavedRealExperimentVerification`) — no second fixture-building path
 * invented here. The third (`evidencePackId`, the older Fabric-router shape) is exercised through a
 * hand-built, type-shaped `ScientificEvidencePack` fixture — the same convention
 * `cellLabScreen.test.tsx`'s `completeStateFixture()` / `discoveryLadder.test.tsx` already use for a
 * fast, deterministic record of a real type, not a full solver run — specifically so DRIFT and BLOCKED
 * can be produced directly and deterministically, per this round's directive.
 */

function evidencePackFixture(overrides: {
  evidencePackId: string;
  allArmsMatched: boolean;
  armsWithDrift?: readonly string[];
  armsNotExecuted?: readonly string[];
}): ScientificEvidencePack {
  const domainId = 'genesis-electrical-generator';
  const request = { contractVersion: EXPERIMENT_FABRIC_VERSION, sourceText: 'fixture', domainId, operation: 'simulate' as const, parameters: {} };
  const provenance = {
    contractVersion: EXPERIMENT_FABRIC_VERSION, requestFingerprint: 'rf-fixture', runFingerprint: 'runf-fixture',
    knowledgeSources: [], supplementalKnowledgeIds: [], domainId, engine: null, parameterSnapshot: {},
    deterministic: true, resultOrigin: 'real-engine' as const, dataProvenance: 'SIMULATED' as const,
  };
  const result = {
    contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed' as const, summary: 'fixture run',
    outputs: {}, units: {}, warnings: [], assumptions: [], visualization: [], route: { kind: 'none' as const },
  };
  const criterion: FalsificationCriterion = {
    metric: 'fixtureMetric', relation: 'equal-within-tolerance', tolerance: 1, rationale: 'fixture criterion',
  };
  return {
    contractVersion: '1.0.0',
    evidencePackId: overrides.evidencePackId,
    evidenceChainId: `${overrides.evidencePackId}-chain`,
    protocol: {
      contractVersion: EXPERIMENT_FABRIC_VERSION,
      designId: `${overrides.evidencePackId}-design`,
      hypothesis: {
        contractVersion: EXPERIMENT_FABRIC_VERSION,
        hypothesisId: 'h:fixture',
        statement: 'Fixture hypothesis statement for a legacy Evidence Pack.',
        modelId: 'fixture-model',
        domainId,
        assessment: 'SUPPORTED_WITHIN_PROTOCOL',
        knowledgeSources: [],
        declaredAssumptions: [],
        falsification: criterion,
        disclaimer: 'fixture disclaimer',
      },
      primaryMetric: 'fixtureMetric',
      arms: [{ armId: 'arm-1', label: 'Arm 1', kind: 'baseline', request, expectedRole: 'baseline' }],
      repetitionsPerArm: 1,
      protocolAssumptions: [],
      protocolFingerprint: `${overrides.evidencePackId}-protocol-fp`,
    },
    hypothesisAssessment: { assessment: 'SUPPORTED_WITHIN_PROTOCOL', message: 'Fixture assessment message.', criterion, referenceRunIds: [] },
    runCount: 1,
    runs: [{ runId: `${overrides.evidencePackId}-run-1`, engine: null, parameters: {}, status: 'completed', result, provenance }],
    reproducibility: {
      allArmsMatched: overrides.allArmsMatched,
      armsWithDrift: overrides.armsWithDrift ?? [],
      armsNotExecuted: overrides.armsNotExecuted ?? [],
    },
    eventSummaries: [],
    disclaimer: 'Fixture Evidence Pack for tests — not a real laboratory or solver result.',
  };
}

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

describe('evidenceShowcase — honest shaping of real Scientific Memory records', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a SIMULATED worldDiscovery run alone qualifies as a candidate, shaped as SIMULATED_DISCOVERY', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runWorldDiscoveryAndRemember } = await import('../core/agent/worldDiscoverySession');
    const { listCaseStudyCandidates, buildCaseStudy, replayCaseStudy } = await import('../components/visual-simulation/evidenceShowcase');
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
    expect(replay.computedLive).toBe(true);
  }, 30_000);

  it('a REAL_EXPERIMENTAL verification is preferred over its own SIMULATED source and sorts first', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runWorldDiscoveryAndRemember } = await import('../core/agent/worldDiscoverySession');
    const { createRealExperimentRun } = await import('../core/experimentFabric/realExperiment');
    const { buildSavedRealExperimentVerification, saveRealExperimentVerificationToMemory, getExperiment } = await import('../core/scienceMemory');
    const { listCaseStudyCandidates, buildCaseStudy, replayCaseStudy } = await import('../components/visual-simulation/evidenceShowcase');

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
    expect(replay.computedLive).toBe(true);
  }, 30_000);

  it('never hides a DRIFT replay verdict behind a flattering reason', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { runWorldDiscoveryAndRemember } = await import('../core/agent/worldDiscoverySession');
    const { createRealExperimentRun } = await import('../core/experimentFabric/realExperiment');
    const { buildSavedRealExperimentVerification, saveRealExperimentVerificationToMemory, getExperiment } = await import('../core/scienceMemory');
    const { buildCaseStudy, replayCaseStudy } = await import('../components/visual-simulation/evidenceShowcase');

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
    expect(replay.computedLive).toBe(true);
    // The case study itself still renders — a DRIFT verdict is shown, not hidden by refusing to build a study.
    expect(buildCaseStudy(corrupted)).not.toBeNull();
  }, 30_000);

  it('a bare scenario-only saved experiment (no Evidence Bundle of its own) is not a candidate', async () => {
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const { saveExperiment } = await import('../core/scienceMemory');
    const { isCaseStudyCandidate, listCaseStudyCandidates } = await import('../components/visual-simulation/evidenceShowcase');

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

  describe('the legacy evidencePackId shape (older Fabric-router ScientificEvidencePack)', () => {
    async function seedPackExperiment(pack: ScientificEvidencePack) {
      const { saveScientificEvidencePack } = await import('../core/experimentFabric');
      const { saveExperiment } = await import('../core/scienceMemory');
      saveScientificEvidencePack(pack);
      return saveExperiment({
        labId: 'legacy-pilot', experimentId: `legacy:${pack.evidencePackId}`, experimentName: `Legacy pilot run — ${pack.evidencePackId}`,
        params: {}, stats: {}, evidencePackId: pack.evidencePackId,
        honesty: 'simplified', honestyNote: 'test fixture', assumptions: [], epistemicStatus: 'SIMULATION',
      });
    }

    it('a record with a resolvable evidencePackId qualifies, shaped as LEGACY_EVIDENCE_PACK, and MATCH is disclosed as NOT live', async () => {
      vi.stubGlobal('window', { localStorage: makeFakeStorage() });
      const { isCaseStudyCandidate, buildCaseStudy, replayCaseStudy } = await import('../components/visual-simulation/evidenceShowcase');

      const pack = evidencePackFixture({ evidencePackId: 'pack-match-1', allArmsMatched: true });
      const saved = await seedPackExperiment(pack);

      expect(isCaseStudyCandidate(saved)).toBe(true);
      const study = buildCaseStudy(saved)!;
      expect(study.kind).toBe('LEGACY_EVIDENCE_PACK');
      expect(study.recordProvenance).toBe('SIMULATED');
      expect(study.steps.map((s) => s.key)).toEqual(expect.arrayContaining(['question', 'hypothesis', 'criterion', 'data', 'verdict', 'evidence-bundle']));
      expect(study.steps.find((s) => s.key === 'question')!.lines[0]).toBe(pack.protocol.hypothesis.statement);

      const replay = replayCaseStudy(saved);
      expect(replay.status).toBe('MATCH');
      // Honesty: this shape's store only ever discloses a SAVE-TIME verdict — never presented as a
      // fresh in-browser re-execution the way the other two kinds genuinely are.
      expect(replay.computedLive).toBe(false);
    });

    it('an unmatched arm surfaces as DRIFT, rendered with the same shape as MATCH, never hidden', async () => {
      vi.stubGlobal('window', { localStorage: makeFakeStorage() });
      const { buildCaseStudy, replayCaseStudy } = await import('../components/visual-simulation/evidenceShowcase');

      const pack = evidencePackFixture({ evidencePackId: 'pack-drift-1', allArmsMatched: false, armsWithDrift: ['arm-1'] });
      const saved = await seedPackExperiment(pack);

      const replay = replayCaseStudy(saved);
      expect(replay.status).toBe('DRIFT');
      expect(replay.status).not.toBe('MATCH');
      expect(replay.computedLive).toBe(false);
      expect(replay.reason.length).toBeGreaterThan(0);
      // The case study still renders in full — DRIFT is disclosed, not hidden by refusing to build one.
      expect(buildCaseStudy(saved)).not.toBeNull();
    });

    it('an arm that never executed surfaces as BLOCKED, rendered with the same shape as MATCH, never hidden', async () => {
      vi.stubGlobal('window', { localStorage: makeFakeStorage() });
      const { buildCaseStudy, replayCaseStudy } = await import('../components/visual-simulation/evidenceShowcase');

      const pack = evidencePackFixture({ evidencePackId: 'pack-blocked-1', allArmsMatched: false, armsNotExecuted: ['arm-1'] });
      const saved = await seedPackExperiment(pack);

      const replay = replayCaseStudy(saved);
      expect(replay.status).toBe('BLOCKED');
      expect(replay.status).not.toBe('MATCH');
      expect(replay.computedLive).toBe(false);
      expect(buildCaseStudy(saved)).not.toBeNull();
    });

    it('a record referencing an evidencePackId no longer in this browser is NOT a candidate — no placeholder pack is invented', async () => {
      vi.stubGlobal('window', { localStorage: makeFakeStorage() });
      const { saveExperiment } = await import('../core/scienceMemory');
      const { isCaseStudyCandidate, listCaseStudyCandidates } = await import('../components/visual-simulation/evidenceShowcase');

      const saved = saveExperiment({
        labId: 'legacy-pilot', experimentId: 'legacy:missing', experimentName: 'References a pack that was never saved',
        params: {}, stats: {}, evidencePackId: 'pack-does-not-exist',
        honesty: 'simplified', honestyNote: 'test fixture', assumptions: [], epistemicStatus: 'SIMULATION',
      });

      expect(isCaseStudyCandidate(saved)).toBe(false);
      expect(listCaseStudyCandidates().some((c) => c.id === saved.id)).toBe(false);
    });
  });
});
