import { describe, expect, it } from 'vitest';
import {
  extractCandidateSafety,
  falsifyCandidate,
  type A2TrialRecord,
} from '../core/biotechData/a2OzempicSubstitute';
import tirzepatideTrialsRaw from '../core/biotechData/a2-ozempic-substitute/trials-CHEMBL4297839.json';
import referenceSemaglutideRaw from '../core/biotechData/a2-ozempic-substitute/reference-semaglutide-NCT03987919.json';

/**
 * SOURCE_TRIAL_MISMATCH — characterisation of a DEFECT, not of desired behaviour.
 *
 * The GOV-DRUG-CAMPAIGN-01 run vetoes tirzepatide with
 *   "Diarrhea risk ratio 2.71 vs semaglutide, CI excludes 1".
 *
 * This file pins, from the repository's own pinned fixtures, exactly WHERE that
 * 2.71 comes from, so the number can never drift silently and so the defect is
 * visible in the diff the day someone fixes it.
 *
 * The defect, in one sentence: the numerator is an n=16 Japanese phase-2 cohort
 * while a DIRECT head-to-head trial of the very same two drugs (SURPASS-2) is
 * already pinned in this repository and is never consulted for the candidate side.
 *
 * Every test below asserts CURRENT behaviour. Tests marked DEFECT are expected to
 * FAIL once the evidence-class gate lands (docs/DECISIONS.md D-042, step 5 of the
 * mandate) — that failure is the point: the fix must be a conscious, reviewed
 * diff in this file, never a silent change of a verdict.
 *
 * Nothing here changes a threshold, a comparison, or a verdict.
 */

const TIRZEPATIDE_TRIALS = tirzepatideTrialsRaw as readonly A2TrialRecord[];
const SURPASS_2 = referenceSemaglutideRaw as A2TrialRecord;

/** Exactly the pattern `buildCandidateReport` builds for CHEMBL4297839 (prefName only, no code name). */
const TIRZEPATIDE_PATTERN = /TIRZEPATIDE/i;
/** Exactly the constant `a2OzempicSubstitute.ts` uses as the comparator arm. */
const REFERENCE_GROUP_TITLE = '1 mg Semaglutide';

function diarrhoeaStat(trial: A2TrialRecord, groupId: string): { numAffected: number; numAtRisk: number } {
  const events = [...(trial.adverseEvents?.seriousEvents ?? []), ...(trial.adverseEvents?.otherEvents ?? [])];
  const event = events.find((e) => /iarrh/i.test(e.term));
  expect(event, `no diarrhoea term in ${trial.nctId}`).toBeDefined();
  const stat = event!.stats.find((s) => s.groupId === groupId);
  expect(stat, `no stat for ${groupId} in ${trial.nctId}`).toBeDefined();
  expect(stat!.numAffected).not.toBeNull();
  expect(stat!.numAtRisk).not.toBeNull();
  return { numAffected: stat!.numAffected as number, numAtRisk: stat!.numAtRisk as number };
}

describe('SOURCE_TRIAL_MISMATCH — where the diarrhea RR 2.71 veto actually comes from', () => {
  it('numerator is NCT03322631 cohort 2, an n=16 Japanese phase-2 arm', () => {
    const trial = TIRZEPATIDE_TRIALS.find((t) => t.nctId === 'NCT03322631');
    expect(trial).toBeDefined();
    expect(trial!.briefTitle).toMatch(/Japanese/i);

    // pickCandidateAeGroupTitle takes the tirzepatide-matching group with the highest
    // parsed mg. Among the three tirzepatide groups that is cohort 2 (peaks at 15 mg).
    const group = trial!.adverseEvents!.eventGroups.find((g) => g.title === '5 mg/10 mg/15 mg Tirzepatide (Cohort 2)');
    expect(group).toBeDefined();

    // Confirm the selection rule really lands here: of the groups this pattern
    // matches, this is the one with the highest parsed mg.
    const parseDoseMg = (title: string): number => Number(/([\d.]+)\s*mg/i.exec(title)?.[1] ?? -Infinity);
    const matches = trial!.adverseEvents!.eventGroups.filter((g) => TIRZEPATIDE_PATTERN.test(g.title));
    expect(matches.length).toBe(3);
    const picked = matches.reduce((best, g) => (parseDoseMg(g.title) > parseDoseMg(best.title) ? g : best));
    expect(picked.title).toBe(group!.title);

    expect(diarrhoeaStat(trial!, group!.id)).toEqual({ numAffected: 5, numAtRisk: 16 });
  });

  it('denominator is the SURPASS-2 semaglutide 1 mg arm, n=469', () => {
    expect(SURPASS_2.nctId).toBe('NCT03987919');
    const group = SURPASS_2.adverseEvents!.eventGroups.find((g) => g.title === REFERENCE_GROUP_TITLE);
    expect(group).toBeDefined();
    expect(diarrhoeaStat(SURPASS_2, group!.id)).toEqual({ numAffected: 54, numAtRisk: 469 });
  });

  it('reproduces the exact 2.71 the campaign prints, from those two arms', () => {
    const trial = TIRZEPATIDE_TRIALS.find((t) => t.nctId === 'NCT03322631')!;
    const safety = extractCandidateSafety(trial, '5 mg/10 mg/15 mg Tirzepatide (Cohort 2)', SURPASS_2, REFERENCE_GROUP_TITLE);
    const diarrhea = safety.find((s) => /diarrh/i.test(s.label));
    expect(diarrhea).toBeDefined();

    expect(diarrhea!.candidate).toEqual({ numAffected: 5, numAtRisk: 16 });
    expect(diarrhea!.reference).toEqual({ numAffected: 54, numAtRisk: 469 });
    expect(diarrhea!.riskRatio).toBeCloseTo(2.7141, 4);
    expect(diarrhea!.riskRatioCi95!.low).toBeCloseTo(1.258, 3);
    expect(diarrhea!.riskRatioCi95!.high).toBeCloseTo(5.855, 3);
    // The veto fires because the lower bound clears 1 — on 5 events.
    expect(diarrhea!.riskRatioCi95!.low).toBeGreaterThan(1);
  });

  it('the comparator IS semaglutide — the COMPARATOR_MISMATCH hypothesis is falsified', () => {
    // The hypothesis under test was that the veto compared tirzepatide against
    // PLACEBO or a non-GLP-1 pool. The comparator arm is semaglutide 1 mg from a
    // randomised trial. That hypothesis does not survive its own pinned data.
    const group = SURPASS_2.adverseEvents!.eventGroups.find((g) => g.title === REFERENCE_GROUP_TITLE)!;
    expect(group.title).toMatch(/semaglutide/i);
    expect(group.title).not.toMatch(/placebo/i);
    expect(SURPASS_2.adverseEvents!.eventGroups.some((g) => /placebo/i.test(g.title))).toBe(false);
  });
});

describe('SOURCE_TRIAL_MISMATCH — the higher-quality evidence that exists and is not used', () => {
  it('SURPASS-2 carries DIRECT tirzepatide-vs-semaglutide diarrhoea arms', () => {
    const groups = SURPASS_2.adverseEvents!.eventGroups;
    const byTitle = (title: string): { numAffected: number; numAtRisk: number } =>
      diarrhoeaStat(SURPASS_2, groups.find((g) => g.title === title)!.id);

    // Same trial, same protocol, same MedDRA version, same adjudication.
    expect(byTitle('5 mg Tirzepatide')).toEqual({ numAffected: 62, numAtRisk: 470 });
    expect(byTitle('10 mg Tirzepatide')).toEqual({ numAffected: 77, numAtRisk: 469 });
    expect(byTitle('15 mg Tirzepatide')).toEqual({ numAffected: 65, numAtRisk: 470 });
    expect(byTitle(REFERENCE_GROUP_TITLE)).toEqual({ numAffected: 54, numAtRisk: 469 });
  });

  it('DEFECT: SURPASS-2 is absent from the candidate trial pool, so those arms are unreachable', () => {
    // This is the structural cause. SURPASS-2 lives only in the reference fixture,
    // so `TRIALS_BY_MOLECULE['CHEMBL4297839']` never offers its tirzepatide arms as
    // candidate-side data, and `extractCandidateSafety` can never see a same-trial
    // semaglutide group for this candidate.
    expect(TIRZEPATIDE_TRIALS.map((t) => t.nctId)).toEqual(['NCT03322631', 'NCT02759107', 'NCT04093752']);
    expect(TIRZEPATIDE_TRIALS.some((t) => t.nctId === 'NCT03987919')).toBe(false);
  });

  it('DEFECT: the comparison is labelled NAIVE_INDIRECT and vetoes anyway', () => {
    const trial = TIRZEPATIDE_TRIALS.find((t) => t.nctId === 'NCT03322631')!;
    const safety = extractCandidateSafety(trial, '5 mg/10 mg/15 mg Tirzepatide (Cohort 2)', SURPASS_2, REFERENCE_GROUP_TITLE);

    // The engine knows the comparison is weak...
    for (const s of safety) expect(s.comparisonType).toBe('NAIVE_INDIRECT');

    // ...and the veto fires regardless: `falsifyCandidate` never reads comparisonType.
    const { failures, worseSafetySignal } = falsifyCandidate([], safety);
    expect(failures.some((f) => /Diarrhea.*2\.71.*worse, CI excludes 1/.test(f))).toBe(true);
    expect(worseSafetySignal).not.toBeNull();

    // The invariant this violates, stated so the fix has something to satisfy:
    // a safety veto must not be drawn from lower-quality evidence while
    // higher-quality direct evidence is available, without recording why the
    // direct evidence could not be used.
  });

  it('DEFECT: an all-DIRECT comparison of the same two drugs does not clear the veto threshold', () => {
    // Not a re-adjudication and not a verdict — arithmetic on pinned numbers,
    // shown here only so the size of the gap is on the record.
    const p1 = 77 / 469; // SURPASS-2 tirzepatide 10 mg, the worst of its three arms
    const p2 = 54 / 469; // SURPASS-2 semaglutide 1 mg
    const rr = p1 / p2;
    const se = Math.sqrt((1 - p1) / (p1 * 469) + (1 - p2) / (p2 * 469));
    const low = Math.exp(Math.log(rr) - 1.96 * se);
    const high = Math.exp(Math.log(rr) + 1.96 * se);

    expect(rr).toBeCloseTo(1.4259, 4);
    expect(low).toBeCloseTo(1.0318, 4);
    expect(high).toBeCloseTo(1.9706, 4);
    // Far below the 2.71 that produced the veto, on 29× the events.
    expect(rr).toBeLessThan(2.71);
  });
});
