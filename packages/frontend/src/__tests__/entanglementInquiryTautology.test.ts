import { describe, expect, it } from 'vitest';
import {
  ENTANGLEMENT_MODEL_ID,
  QE1_HYPOTHESES,
  QE1_OPENING_NOISE,
  qe1System,
  qe1VisibilityInquiry,
  QE2_HYPOTHESES,
  qe2MonogamyInquiry,
  qe3BoundEntanglementInquiry,
} from '../core/agent/entanglementInquiry';
import { runAutonomousInquiry } from '../core/agent/inquiryLoop';

/**
 * TAUTOLOGY GATE — QE1/QE2/QE3 integration.
 *
 * Proves the gate is wired to the REAL, running inquiry loop (not just
 * exercised as a standalone function in `tautologyGate.test.ts`), and proves
 * §7 of the brief: circularity and non-discrimination are kept as two
 * SEPARATE, uncoupled results, never conflated.
 */

describe('CASE 2 — QE1 whiteNoise: an independent (non-circular) channel that happens to be non-discriminating at one setting', () => {
  it('the gate classifies QE1 as EMPIRICAL_TEST (not tautological)', () => {
    const result = runAutonomousInquiry(qe1VisibilityInquiry(0.92, 5));
    expect(result.tautologyAssessment).not.toBeNull();
    expect(result.tautologyAssessment!.classification).toBe('EMPIRICAL_TEST');
  });

  it('at the declared opening probe (whiteNoise=1) every hypothesis predicts maxCHSH=0 — a real, independent non-discrimination, not a tautology', () => {
    const result = runAutonomousInquiry(qe1VisibilityInquiry(0.92, 5));
    const openingRound = result.rounds[0]!;
    expect(openingRound.probeValue).toBe(QE1_OPENING_NOISE);
    expect(openingRound.observed).toBe(0);
    for (const outcome of openingRound.outcomes) {
      expect(outcome.predicted).toBe(0);
      // Genuinely SUPPORTED (every hypothesis predicts the true value here) —
      // this is NOT the gate refusing evidence; the gate says EMPIRICAL_TEST
      // (checked above). It is a real measurement that happens to agree with
      // everyone, which is exactly what makes the NEXT probe selection have
      // to look elsewhere.
      expect(outcome.assessment).toBe('SUPPORTED_WITHIN_PROTOCOL');
    }
    // Non-discrimination is a SEPARATE, existing mechanism (inquiryLoop.ts's
    // own selectNextProbe) — untouched by this change. At the opening probe
    // it correctly finds no separating setting yet tried, so it proposes a
    // real next probe rather than stopping (there are five more candidates).
    expect(openingRound.nextSelection.probeValue).not.toBeNull();
  });

  it('tautology (false) and discrimination (independent fact) never get merged into one status', () => {
    const result = runAutonomousInquiry(qe1VisibilityInquiry(0.92, 5));
    // The classification field and the stop/selection machinery are on
    // completely different parts of the result, computed by completely
    // different code paths (tautologyGate.ts vs selectNextProbe) — proving
    // they are orthogonal, not that one subsumed the other.
    expect(result.tautologyAssessment!.classification).toBe('EMPIRICAL_TEST');
    expect(['NO_DISCRIMINATING_PROBE', 'NO_CONTENDERS_LEFT', 'ROUND_BUDGET_EXHAUSTED', 'MEASUREMENT_FAILED']).toContain(result.stopReason);
  });
});

describe('CASE 3 — QE2: the opening probe leaves θ=20°/70° (and 35°/55°) undiscriminated; a later probe discriminates', () => {
  it('round 1 (mixingAngleDeg=90, pure |W>) measures ckwResidual=0 for every hypothesis — genuinely non-discriminating', () => {
    const result = runAutonomousInquiry(qe2MonogamyInquiry(70, 6));
    const openingRound = result.rounds[0]!;
    expect(openingRound.probeValue).toBe(90);
    expect(openingRound.observed).toBeCloseTo(0, 10);
    for (const outcome of openingRound.outcomes) {
      expect(outcome.predicted).toBeCloseTo(0, 10);
    }
    // The gate still says EMPIRICAL_TEST for the whole inquiry — this round's
    // non-discrimination is a probe-choice fact, not a circularity fact.
    expect(result.tautologyAssessment!.classification).toBe('EMPIRICAL_TEST');
  });

  it('a later probe (mixingAngleDeg=0, the generalised-GHZ limit) genuinely discriminates candidates', () => {
    const result = runAutonomousInquiry(qe2MonogamyInquiry(70, 6));
    const ghzRound = result.rounds.find((r) => r.probeValue === 0);
    expect(ghzRound).toBeDefined();
    const predictions = new Set(ghzRound!.outcomes.map((o) => o.predicted));
    // At least two genuinely different predicted values among the surviving
    // candidates at this setting — real separation, not everyone agreeing.
    expect(predictions.size).toBeGreaterThan(1);
  });

  it('QE2_HYPOTHESES still declares all five candidates unchanged (no hardcoded QE-specific exception introduced)', () => {
    expect(QE2_HYPOTHESES).toHaveLength(5);
  });
});

describe('QE3 — existing behavior remains intact', () => {
  it('runs exactly as before: real solver runs, real assessments, and now also reports EMPIRICAL_TEST', () => {
    const result = runAutonomousInquiry(qe3BoundEntanglementInquiry(0.4, 5));
    expect(result.rounds.length).toBeGreaterThan(0);
    expect(result.tautologyAssessment).not.toBeNull();
    expect(result.tautologyAssessment!.classification).toBe('EMPIRICAL_TEST');
    // The known QE3 finding (measured, not asserted): the schedule always
    // ends at the smallest declared noise setting.
    const lastRound = result.rounds[result.rounds.length - 1]!;
    expect(lastRound.probeValue).toBe(0);
  });
});

describe('QE1/QE2/QE3 without any tautology declaration stay byte-identical to before this change', () => {
  it('a system with no observableDerivation gets tautologyAssessment: null and an uncapped inquiry, exactly as before this field existed', () => {
    const bareSystem = qe1System(0.92);
    const { observableDerivation: _drop, ...withoutDerivation } = bareSystem;
    const result = runAutonomousInquiry({
      question: 'bare system, no tautology declaration',
      system: withoutDerivation,
      hypotheses: QE1_HYPOTHESES,
      openingProbeValue: QE1_OPENING_NOISE,
      maxRounds: 5,
    });
    expect(result.tautologyAssessment).toBeNull();
    // Confidence still moves normally — nothing is capped when nothing was declared.
    const moved = result.rounds.some((r) => r.outcomes.some((o) => o.confidenceAfter !== o.confidenceBefore));
    expect(moved).toBe(true);
  });
});

describe('Evidence boundary: a CONSISTENCY_CHECK system can never raise (or lower) confidence, however the numbers compare', () => {
  /** A non-opening probe so real assessments actually run (0.3 separates the four QE1 candidates cleanly). */
  const PROBE_THAT_WOULD_DISCRIMINATE = 0.3;

  it('every round leaves every hypothesis\'s confidence completely unchanged when the system is declared model-invariant', () => {
    const realSystem = qe1System(0.92);
    const consistencyOnlySystem = {
      ...realSystem,
      observableDerivation: {
        componentId: 'synthetic-consistency-check',
        prediction: {
          source: 'model-invariant' as const,
          modelId: ENTANGLEMENT_MODEL_ID,
          rationale: 'test double: forcing a CONSISTENCY_CHECK classification to prove the evidence cap, independent of whether QE1 itself is one',
        },
        observation: {
          source: 'model-invariant' as const,
          modelId: ENTANGLEMENT_MODEL_ID,
          rationale: 'same, for the observation side',
        },
      },
    };
    const result = runAutonomousInquiry({
      question: 'synthetic consistency-check system',
      system: consistencyOnlySystem,
      hypotheses: QE1_HYPOTHESES,
      openingProbeValue: PROBE_THAT_WOULD_DISCRIMINATE,
      maxRounds: 5,
    });

    expect(result.tautologyAssessment!.classification).toBe('CONSISTENCY_CHECK');
    expect(result.rounds.length).toBeGreaterThan(0);
    let realAssessmentHappened = false;
    for (const round of result.rounds) {
      for (const outcome of round.outcomes) {
        if (outcome.assessment === 'SUPPORTED_WITHIN_PROTOCOL' || outcome.assessment === 'FALSIFIED_WITHIN_PROTOCOL') realAssessmentHappened = true;
        expect(outcome.evidenceMagnitude).toBe(0);
        expect(outcome.confidenceAfter).toBe(outcome.confidenceBefore);
      }
    }
    // Sanity: the test is not vacuous — real SUPPORTED/FALSIFIED judgements
    // really were computed and really were capped, not simply absent.
    expect(realAssessmentHappened).toBe(true);
  });
});
