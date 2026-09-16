import { describe, expect, it } from 'vitest';
import { runA2Analysis, type A2CandidateReport } from '../core/biotechData/a2OzempicSubstitute';
import {
  computeLowerHarmScore,
  decideLowerHarmVerdict,
  evaluateEfficacyFloor,
  rankForLowerHarm,
  runLowerHarmAnalysis,
} from '../core/biotechData/govDrugLowerHarmRanking';
import { LOWER_HARM_PREREGISTRATION, LOWER_HARM_SCENARIO_ID, assertNoNaturalnessBias } from '../core/biotechData/govDrugLowerHarmPreregistration';

/**
 * Mandate step 10, part 2 — real re-ranking over the real, unmodified A2
 * candidate space. Every pinned number below is the literal, real output of
 * `runLowerHarmAnalysis()` on the pinned trial fixtures already in this
 * repository — recomputed here, not copied from a report.
 */

function reportFor(id: string): A2CandidateReport {
  const report = runA2Analysis().candidateReports.find((r) => r.summary.moleculeChemblId === id);
  if (report === undefined) throw new Error(`fixture assumption broken: ${id} not in the real A2 candidate space`);
  return report;
}

describe('evaluateEfficacyFloor — reads the candidate\'s OWN absolute effect, not the delta vs reference', () => {
  // D-115: this specimen moved from native GLP-1 (CHEMBL1240772) to
  // liraglutide (CHEMBL4084119). Native GLP-1's sole HbA1c observation was
  // really dulaglutide's own arm in NCT05659537, refused as
  // IDENTITY_MISMATCH under the general, uniform single-arm identity rule
  // — with 0 real efficacy observations left, native GLP-1 now reports
  // NO_HBA1C_EVIDENCE (see the glucagon test below for that same real
  // state), not MEETS_FLOOR. Liraglutide is the real, current candidate
  // that meets the floor on its own absolute effect. See DECISIONS.md D-115.
  it('liraglutide (CHEMBL4084119) meets the floor', () => {
    const floor = evaluateEfficacyFloor(reportFor('CHEMBL4084119'));
    expect(floor.status).toBe('MEETS_FLOOR');
    expect(floor.fraction).toBeCloseTo(1.006, 2);
  });

  it('PF-06291874 (CHEMBL2381848) falls below the floor', () => {
    const floor = evaluateEfficacyFloor(reportFor('CHEMBL2381848'));
    expect(floor.status).toBe('BELOW_FLOOR');
    expect(floor.fraction).toBeCloseTo(0.541, 2);
  });

  it('glucagon (CHEMBL5314341) has no HbA1c evidence — a distinct state from failing the floor', () => {
    const floor = evaluateEfficacyFloor(reportFor('CHEMBL5314341'));
    expect(floor.status).toBe('NO_HBA1C_EVIDENCE');
    expect(floor.fraction).toBeNull();
  });

  it('tirzepatide clears the floor comfortably (its problem, when it has one, is safety, not efficacy)', () => {
    const floor = evaluateEfficacyFloor(reportFor('CHEMBL4297839'));
    expect(floor.status).toBe('MEETS_FLOOR');
    expect(floor.fraction).toBeGreaterThan(1.4);
  });
});

describe('rankForLowerHarm — real ranking over the real candidate space', () => {
  const ranked = rankForLowerHarm(runA2Analysis().candidateReports);

  it('covers every candidate in the space exactly once', () => {
    expect(ranked).toHaveLength(runA2Analysis().candidateReports.length);
    expect(new Set(ranked.map((r) => r.report.summary.moleculeChemblId)).size).toBe(ranked.length);
  });

  it('exactly two candidates clear both the floor and the safety veto', () => {
    // D-115: moved from 3 (native GLP-1, liraglutide, exenatide) to 2
    // (liraglutide, exenatide). Native GLP-1's sole HbA1c observation was
    // really dulaglutide's own arm in NCT05659537, refused as
    // IDENTITY_MISMATCH — with 0 real efficacy observations left it no
    // longer clears the efficacy floor. See DECISIONS.md D-115.
    const qualifying = ranked.filter((r) => r.lowerHarmScore !== null);
    expect(qualifying.map((r) => r.report.summary.moleculeChemblId).sort()).toEqual(['CHEMBL414357', 'CHEMBL4084119'].sort());
  });

  it('a safety-vetoed candidate is eliminated with the veto reason, never the floor reason — even when it also fails the floor', () => {
    // CHEMBL4297630 (cotadutide) fails BOTH the floor and the veto; the veto
    // must win the elimination message, because it is checked first.
    const cotadutide = ranked.find((r) => r.report.summary.moleculeChemblId === 'CHEMBL4297630')!;
    expect(cotadutide.lowerHarmScore).toBeNull();
    expect(cotadutide.eliminationReason).toMatch(/Existential safety veto/);
  });

  it('sorts eliminated candidates last, qualifying candidates by lowerHarmScore descending', () => {
    const scores = ranked.map((r) => r.lowerHarmScore);
    const firstNullIndex = scores.indexOf(null);
    expect(firstNullIndex).toBeGreaterThan(-1);
    for (let i = firstNullIndex; i < scores.length; i += 1) expect(scores[i]).toBeNull();
    const qualifying = scores.slice(0, firstNullIndex) as number[];
    for (let i = 1; i < qualifying.length; i += 1) expect(qualifying[i]).toBeLessThanOrEqual(qualifying[i - 1]);
  });

  it('liraglutide ranks #1 by lowerHarmScore among real qualifiers', () => {
    // D-115: moved from native GLP-1 (CHEMBL1240772, lowerHarmScore 1.275).
    // Native GLP-1 no longer qualifies at all (see the test above), so it
    // cannot rank #1 among qualifiers — its `lowerHarmScore` is `null` and
    // it sorts last, per `rankForLowerHarm`'s own documented contract.
    // Liraglutide is the real, current #1 among the 2 remaining
    // qualifiers. See DECISIONS.md D-115.
    expect(ranked[0].report.summary.moleculeChemblId).toBe('CHEMBL4084119');
    expect(ranked[0].lowerHarmScore).toBeCloseTo(-0.038, 2);
  });
});

describe('computeLowerHarmScore — safety genuinely dominates, demonstrated on real numbers', () => {
  // D-115: this demonstration pair moved from native GLP-1 vs liraglutide.
  // Native GLP-1's sole HbA1c observation was really dulaglutide's own arm
  // in NCT05659537, refused as IDENTITY_MISMATCH under the general,
  // uniform single-arm identity rule — with 0 real efficacy observations
  // left, comparing its now-vacuous "no evidence" efficacyScore of 0
  // against a rival's real, measured efficacy score would no longer be an
  // honest demonstration of safety dominating a genuine efficacy
  // trade-off. Adomeglivant (CHEMBL3707351) has 3 real efficacy
  // observations, same as liraglutide, so this pair keeps the
  // demonstration real. See DECISIONS.md D-115.
  it('adomeglivant has both the better real safety score AND the better lowerHarmScore than liraglutide', () => {
    const adomeglivant = reportFor('CHEMBL3707351');
    const liraglutide = reportFor('CHEMBL4084119');
    expect(adomeglivant.score.safetyScore).toBeGreaterThan(liraglutide.score.safetyScore);
    expect(computeLowerHarmScore(adomeglivant)).toBeGreaterThan(computeLowerHarmScore(liraglutide));
  });

  it('a candidate with a WORSE raw efficacy score than a rival can still outrank it once weighted, because safety dominates', () => {
    // Real case: liraglutide's raw efficacyScore (-0.658) is LESS negative
    // (better) than adomeglivant's (-1) — on efficacy alone liraglutide
    // "wins" — yet adomeglivant's composite lowerHarmScore is higher
    // because its safety margin is large enough to outweigh the
    // 8x-weighted-down (safety=2 vs efficacyMarginAboveFloor=0.25)
    // efficacy term.
    const adomeglivant = reportFor('CHEMBL3707351');
    const liraglutide = reportFor('CHEMBL4084119');
    expect(liraglutide.score.efficacyScore).toBeGreaterThan(adomeglivant.score.efficacyScore);
    expect(computeLowerHarmScore(adomeglivant)).toBeGreaterThan(computeLowerHarmScore(liraglutide));
  });
});

describe('decideLowerHarmVerdict — the honest, real result, and CONFLICTING_EVIDENCE reachability', () => {
  it('reports WINNER because the real qualifying candidate genuinely dominates both raw dimensions', () => {
    // D-115: moved from CONFLICTING_EVIDENCE. That real conflict existed
    // when native GLP-1 (best real safety, but a spurious "efficacy"
    // reading really sourced from dulaglutide's own arm in NCT05659537)
    // and liraglutide (best real efficacy) both qualified and disagreed on
    // which dimension led. Native GLP-1's misattributed observation is now
    // refused as IDENTITY_MISMATCH under the general, uniform single-arm
    // identity rule — with 0 real efficacy observations left it no longer
    // qualifies at all. Of the 2 real candidates left, liraglutide
    // dominates BOTH the safety and efficacy dimension, so there is no
    // real two-way conflict to report. See DECISIONS.md D-115.
    const ranked = rankForLowerHarm(runA2Analysis().candidateReports);
    const verdict = decideLowerHarmVerdict(ranked);
    expect(verdict.label).toBe('WINNER');
    expect(verdict.winnerId).toBe('CHEMBL4084119');
  });

  it('CONFLICTING_EVIDENCE remains a real, reachable code path — proven with a synthetic dimension split, not asserted from the real data above', () => {
    // The real pinned data no longer produces this case (see the test
    // above), so this proves decideLowerHarmVerdict's own conflict-
    // detection branch is still real code, not merely declared, via a
    // synthetic override of the two real qualifiers' score dimensions —
    // never touching the ranking function, weights, or thresholds.
    const ranked = rankForLowerHarm(runA2Analysis().candidateReports);
    const lira = ranked.find((r) => r.report.summary.moleculeChemblId === 'CHEMBL4084119')!;
    const exen = ranked.find((r) => r.report.summary.moleculeChemblId === 'CHEMBL414357')!;
    const bestSafety = { ...lira, report: { ...lira.report, score: { ...lira.report.score, safetyScore: 1, efficacyScore: -1 } }, lowerHarmScore: 1 };
    const bestEfficacy = { ...exen, report: { ...exen.report, score: { ...exen.report.score, safetyScore: -1, efficacyScore: 1 } }, lowerHarmScore: 0.5 };
    const verdict = decideLowerHarmVerdict([bestSafety, bestEfficacy]);
    expect(verdict.label).toBe('CONFLICTING_EVIDENCE');
    expect(verdict.winnerId).toBeNull();
    expect(verdict.reason).toBe(LOWER_HARM_PREREGISTRATION.conflictingEvidencePolicy);
  });

  it('returns NO_WINNER, not CONFLICTING_EVIDENCE, when nothing qualifies', () => {
    const allEliminated = rankForLowerHarm(runA2Analysis().candidateReports).map((r) => ({ ...r, lowerHarmScore: null as number | null }));
    const verdict = decideLowerHarmVerdict(allEliminated);
    expect(verdict.label).toBe('NO_WINNER');
    expect(verdict.winnerId).toBeNull();
  });

  it('returns WINNER when exactly one candidate qualifies (no possibility of a two-way conflict)', () => {
    // D-115: moved from CHEMBL1240772 (native GLP-1). Native GLP-1 no
    // longer has a real, non-null lowerHarmScore to isolate (see the test
    // above) — liraglutide (CHEMBL4084119) is the real candidate with a
    // genuine, non-null lowerHarmScore this synthetic isolation now uses.
    const ranked = rankForLowerHarm(runA2Analysis().candidateReports);
    const onlyLiraglutide = ranked.map((r) => (r.report.summary.moleculeChemblId === 'CHEMBL4084119' ? r : { ...r, lowerHarmScore: null }));
    const verdict = decideLowerHarmVerdict(onlyLiraglutide);
    expect(verdict.label).toBe('WINNER');
    expect(verdict.winnerId).toBe('CHEMBL4084119');
  });

  it('returns INSUFFICIENT_EVIDENCE for an empty candidate space, never NO_WINNER', () => {
    expect(decideLowerHarmVerdict([]).label).toBe('INSUFFICIENT_EVIDENCE');
  });
});

describe('runLowerHarmAnalysis — the full, real, deterministic run', () => {
  it('produces the real scenarioId and preregistration fingerprint', () => {
    const r = runLowerHarmAnalysis();
    expect(r.scenarioId).toBe(LOWER_HARM_SCENARIO_ID);
    expect(r.preregistrationFingerprint).toBe(LOWER_HARM_PREREGISTRATION.fingerprint);
  });

  it('is deterministic: two independent runs produce the identical fingerprint', () => {
    expect(runLowerHarmAnalysis().fingerprint).toBe(runLowerHarmAnalysis().fingerprint);
  });

  it('the naturalness-neutrality guard passes on the real, full report — no scoring field is natural-origin-named', () => {
    expect(() => assertNoNaturalnessBias(runLowerHarmAnalysis(), 'runLowerHarmAnalysis output')).not.toThrow();
  });

  it('reuses runA2Analysis() rather than re-deriving candidate efficacy/safety — same veto reasons appear verbatim', () => {
    const lowerHarm = runLowerHarmAnalysis();
    const a2 = runA2Analysis();
    const tirzepatideLH = lowerHarm.ranked.find((r) => r.report.summary.moleculeChemblId === 'CHEMBL4297839')!;
    const tirzepatideA2 = a2.candidateReports.find((r) => r.summary.moleculeChemblId === 'CHEMBL4297839')!;
    expect(tirzepatideLH.eliminationReason).toBe(tirzepatideA2.score.vetoReason);
  });
});
