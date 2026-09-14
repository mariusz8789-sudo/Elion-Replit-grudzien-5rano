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
  it('native GLP-1 (CHEMBL1240772) meets the floor', () => {
    const floor = evaluateEfficacyFloor(reportFor('CHEMBL1240772'));
    expect(floor.status).toBe('MEETS_FLOOR');
    expect(floor.fraction).toBeCloseTo(0.829, 2);
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

  it('exactly three candidates clear both the floor and the safety veto', () => {
    const qualifying = ranked.filter((r) => r.lowerHarmScore !== null);
    expect(qualifying.map((r) => r.report.summary.moleculeChemblId).sort()).toEqual(['CHEMBL1240772', 'CHEMBL414357', 'CHEMBL4084119'].sort());
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

  it('native GLP-1 ranks #1 by lowerHarmScore — its safety score dominates under the safety-heavy weights', () => {
    expect(ranked[0].report.summary.moleculeChemblId).toBe('CHEMBL1240772');
    expect(ranked[0].lowerHarmScore).toBeCloseTo(1.275, 2);
  });
});

describe('computeLowerHarmScore — safety genuinely dominates, demonstrated on real numbers', () => {
  it('native GLP-1 has both the best safety score AND the best lowerHarmScore among qualifiers', () => {
    const glp1 = reportFor('CHEMBL1240772');
    const liraglutide = reportFor('CHEMBL4084119');
    expect(glp1.score.safetyScore).toBeGreaterThan(liraglutide.score.safetyScore);
    expect(computeLowerHarmScore(glp1)).toBeGreaterThan(computeLowerHarmScore(liraglutide));
  });

  it('a candidate with a WORSE raw efficacy score than a rival can still outrank it once weighted, because safety dominates', () => {
    // Real case: liraglutide's raw efficacyScore (-0.4875) is LESS negative
    // (better) than GLP-1's (-0.725) — on efficacy alone liraglutide "wins" —
    // yet GLP-1's composite lowerHarmScore is higher because its safety
    // margin is large enough to outweigh a 2.6x-weighted-down efficacy term.
    const glp1 = reportFor('CHEMBL1240772');
    const liraglutide = reportFor('CHEMBL4084119');
    expect(liraglutide.score.efficacyScore).toBeGreaterThan(glp1.score.efficacyScore);
    expect(computeLowerHarmScore(glp1)).toBeGreaterThan(computeLowerHarmScore(liraglutide));
  });
});

describe('decideLowerHarmVerdict — the honest, real CONFLICTING_EVIDENCE case', () => {
  it('reports CONFLICTING_EVIDENCE because no single candidate dominates BOTH raw dimensions, even though one dominates the weighted composite', () => {
    // This is the real, unforced result on this pinned candidate space: it is
    // asserted here to demonstrate mandate success criterion #9 (detect an
    // efficacy-vs-safety conflict) is actually exercised, not merely coded.
    const ranked = rankForLowerHarm(runA2Analysis().candidateReports);
    const verdict = decideLowerHarmVerdict(ranked);
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
    const ranked = rankForLowerHarm(runA2Analysis().candidateReports);
    const onlyGlp1 = ranked.map((r) => (r.report.summary.moleculeChemblId === 'CHEMBL1240772' ? r : { ...r, lowerHarmScore: null }));
    const verdict = decideLowerHarmVerdict(onlyGlp1);
    expect(verdict.label).toBe('WINNER');
    expect(verdict.winnerId).toBe('CHEMBL1240772');
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
