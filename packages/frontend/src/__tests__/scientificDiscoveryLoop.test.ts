import { describe, expect, it } from 'vitest';
import { runScientificDiscoveryLoop, buildEvidenceChain } from '../core/experimentFabric/scientificDiscoveryLoop';
import {
  executePreregisteredHypotheses, generateCompetingHypotheses, HYPOTHESIS_PROBLEMS, preregisterHypotheses,
} from '../core/experimentFabric/hypothesisLoop';

/**
 * SCIENTIFIC DISCOVERY LOOP — proves the first full, closed, deterministic
 * cycle for ONE real epidemiological question:
 * Question → Hypothesis → Experiment Design → Execution → Observation →
 * Analysis → Falsification → Comparison → Next Experiment.
 *
 * Nothing here is a second engine: `runScientificDiscoveryLoop` composes
 * the EXISTING `hypothesisLoop.ts` (Question/Hypothesis/Design/Execution/
 * Falsification/Comparison/Next-Experiment) with the EXISTING
 * `observationAnalysis/*` (Observation/Analysis/Findings, merged via PR #4).
 */
const QUESTION_ID = 'problem:intervention-timing';

describe('Scientific Discovery Loop — one real epidemiological question, closed cycle', () => {
  it('1. runs the full closed loop end to end for a real question', () => {
    const result = runScientificDiscoveryLoop(QUESTION_ID);
    expect(result.problem.problemId).toBe(QUESTION_ID);
    expect(result.loop.preregistration.hypotheses.length).toBeGreaterThan(0);
    expect(result.loop.outcomes.length).toBe(result.loop.preregistration.hypotheses.length);
    expect(result.evidenceChain.length).toBe(result.loop.outcomes.length);
    expect(result.nextExperiment).toBeDefined();
  });

  it('2. is deterministic — the same real question produces the same statuses and metrics twice', () => {
    const a = runScientificDiscoveryLoop(QUESTION_ID);
    const b = runScientificDiscoveryLoop(QUESTION_ID);
    expect(a.loop.outcomes.map((o) => [o.hypothesisId, o.status, o.observedMetric, o.baselineMetric])).toEqual(
      b.loop.outcomes.map((o) => [o.hypothesisId, o.status, o.observedMetric, o.baselineMetric]),
    );
    expect(a.loop.preregistration.preregistrationFingerprint).toBe(b.loop.preregistration.preregistrationFingerprint);
  });

  it('3. every non-blocked hypothesis gets real Observations tied to a real resultFingerprint/day', () => {
    const result = runScientificDiscoveryLoop(QUESTION_ID);
    const executed = result.evidenceChain.filter((link) => link.status !== 'BLOCKED' && link.variantRunId !== null);
    expect(executed.length).toBeGreaterThan(0);
    for (const link of executed) {
      expect(link.observations.length).toBeGreaterThan(0);
      for (const observation of link.observations) {
        expect(observation.evidence.resultFingerprint.length).toBeGreaterThan(0);
        expect(Number.isFinite(observation.evidence.day)).toBe(true);
        expect(Number.isFinite(observation.evidence.sampleIndex)).toBe(true);
      }
      expect(link.analysis).not.toBeNull();
      expect(link.findings.length).toBeGreaterThan(0);
    }
  });

  it('4. Falsification status comes from the real evidence chain assessment, not from Observation/Analysis', () => {
    const result = runScientificDiscoveryLoop(QUESTION_ID);
    for (const outcome of result.loop.outcomes) {
      expect(['SUPPORTED', 'FALSIFIED', 'INCONCLUSIVE', 'BLOCKED', 'UNKNOWN']).toContain(outcome.status);
    }
    // At least one real falsification-relevant status must have actually occurred (not all silently UNKNOWN).
    expect(result.loop.outcomes.some((o) => o.status !== 'UNKNOWN')).toBe(true);
  });

  it('5. Comparison (discrimination) ranks candidates using real measured metrics only', () => {
    const result = runScientificDiscoveryLoop(QUESTION_ID);
    for (const entry of result.loop.discrimination.ranking) {
      expect(Number.isFinite(entry.metric)).toBe(true);
    }
  });

  it('6. Next Experiment is a real, existing decision (selectNextHypothesisExperiment), never fabricated', () => {
    const result = runScientificDiscoveryLoop(QUESTION_ID);
    expect(['READY_TO_RUN', 'VALIDATION_REQUIRED', 'BLOCKED', 'RESOLVED']).toContain(result.nextExperiment.status);
    expect(result.nextExperiment.why.length).toBeGreaterThan(0);
  });

  it('7. an unknown question throws instead of silently fabricating a loop', () => {
    expect(() => runScientificDiscoveryLoop('problem:does-not-exist')).toThrow(/Nieznany problem badawczy/);
  });

  it('8. a chemistry/physics hypothesis (no scenario-timeline) reports NOT_MODELED for Observation/Analysis, never fabricates it', () => {
    const chemProblem = HYPOTHESIS_PROBLEMS.find((p) => p.problemId === 'problem:chem-rdkit-molecular-weight-comparison')!;
    // Local sync executor cannot run a BACKEND_REAL_ENGINE model — outcome is BLOCKED, which is itself a real, honest status.
    const loop = executePreregisteredHypotheses(preregisterHypotheses(generateCompetingHypotheses(chemProblem)));
    const chain = buildEvidenceChain(loop);
    expect(chain.length).toBeGreaterThan(0);
    for (const link of chain) {
      expect(link.observations).toEqual([]);
      expect(link.analysis).toBeNull();
      expect(link.notModeled).toBeDefined();
    }
  });

  it('9. evidence chain link ids trace back to the real evidence chain/pack the loop already produced', () => {
    const result = runScientificDiscoveryLoop(QUESTION_ID);
    for (const link of result.evidenceChain) {
      const outcome = result.loop.outcomes.find((o) => o.hypothesisId === link.hypothesisId)!;
      expect(link.evidenceChainId).toBe(outcome.evidenceChainId);
      expect(link.evidencePackId).toBe(outcome.evidencePackId);
    }
  });

  it('10. re-running does not mutate the original HypothesisProblem catalog entry', () => {
    const before = JSON.stringify(HYPOTHESIS_PROBLEMS.find((p) => p.problemId === QUESTION_ID));
    runScientificDiscoveryLoop(QUESTION_ID);
    const after = JSON.stringify(HYPOTHESIS_PROBLEMS.find((p) => p.problemId === QUESTION_ID));
    expect(after).toBe(before);
  });
});
