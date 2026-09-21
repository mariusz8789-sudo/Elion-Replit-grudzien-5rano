import {
  falsifyCandidate,
  runCandidateBeliefRevision,
  scoreCandidate,
  type A2CandidateReport,
  type A2CandidateSummary,
  type A2EfficacyEvidence,
} from '../biotechData/a2OzempicSubstitute';

/**
 * SYNTHETIC_TEST_ONLY WINNER FIXTURE (docs/DECISIONS.md D-058, mandate item
 * 13's "existing approved synthetic/test backend").
 *
 * WHAT THIS IS NOT: a manually constructed `WinnerRecord`. This file builds
 * two candidates' worth of REAL, structurally-valid evidence
 * (`A2EfficacyEvidence[]`) and feeds it through the SAME REAL, UNMODIFIED
 * decision functions `createProductionLowerHarmAdapters()` uses —
 * `falsifyCandidate`, `runCandidateBeliefRevision`, `scoreCandidate` here;
 * `rankForLowerHarm`, `checkDiversity`, `freezeFalsificationCriteria`,
 * `runG2Falsification`, `runAdjudication`, `decideFunnelVerdict` downstream
 * in `govLowerHarmAdapters.ts`. Nothing about the WINNER verdict, the
 * `WinnerRecordRef`, or the `ResearchRecipe` is asserted here — every one of
 * those is computed by the real pipeline from this fixture's numbers, the
 * same way it is computed from the real pinned ChEMBL/ClinicalTrials.gov
 * data. Only the RAW EVIDENCE is synthetic; the entire decision chain is
 * real and could just as well run over real data with this shape.
 *
 * ENGINEERED, NOT CHERRY-PICKED FROM REAL DATA: two synthetic molecules
 * ("SYNTH-A", "SYNTH-B") with hand-set efficacy deltas far enough apart
 * (2.5 percentage points against a ~0.05pp observable sigma) that G2's real
 * discriminability test (`TAU_DISCRIMINABILITY = 1`, unmodified) separates
 * them by ~49σ — comfortably, not marginally, so the test is not fragile to
 * incidental floating-point drift. SYNTH-A: 3 real-shaped DIRECT_HEAD_TO_HEAD
 * efficacy entries (clears `MINIMUM_OBSERVATIONS = 3` on its own),
 * comfortably above the LOWER-HARM efficacy floor, no safety data (so no
 * veto is possible — the fixture is not "rigged" to dodge a real veto, it
 * simply supplies none, same as any candidate with zero adverse-event
 * evidence). SYNTH-B: weaker effect, still floor-qualifying, so a genuine
 * TOP2 pair exists rather than a lone candidate.
 */

function efficacyEntry(nctId: string, meanChangePp: number, deltaVsSemaglutidePp: number, n: number): A2EfficacyEvidence {
  return {
    nctId,
    candidateArm: { title: `${nctId} arm`, meanChangePp, n },
    comparisonType: 'DIRECT_HEAD_TO_HEAD',
    outcomeMetric: 'HBA1C',
    evidenceBasis: 'RANDOMIZED_DIRECT',
    deltaVsSemaglutidePp,
    diffCi95: { low: deltaVsSemaglutidePp - 0.1, high: deltaVsSemaglutidePp + 0.1 },
    withinMargin: false,
    diffCiEntirelyOutsideMargin: true,
    fairnessFlags: [],
  };
}

function buildSyntheticReport(summary: A2CandidateSummary, efficacy: readonly A2EfficacyEvidence[]): A2CandidateReport {
  const safety: A2CandidateReport['safety'] = [];
  const falsification = falsifyCandidate(efficacy, safety, 'HISTORICAL_NO_EVIDENCE_CLASS');
  const belief = runCandidateBeliefRevision(summary.moleculeChemblId, efficacy, safety);
  const score = scoreCandidate(summary, efficacy, safety, falsification);
  return { summary, efficacy, safety, falsification, belief, score, identityMismatches: [] };
}

const SYNTH_A_SUMMARY: A2CandidateSummary = {
  moleculeChemblId: 'SYNTH-A',
  prefName: 'Synthetic Candidate A (SYNTHETIC_TEST_ONLY)',
  moleculeType: 'Peptide',
  maxPhase: 2,
  medianPotencyNMByTarget: { glp1r: 5, gipr: null, gcgr: null },
  qualifyingAssayCounts: { glp1r: 3, gipr: 0, gcgr: 0 },
};

const SYNTH_B_SUMMARY: A2CandidateSummary = {
  moleculeChemblId: 'SYNTH-B',
  prefName: 'Synthetic Candidate B (SYNTHETIC_TEST_ONLY)',
  moleculeType: 'Peptide',
  maxPhase: 2,
  medianPotencyNMByTarget: { glp1r: 8, gipr: null, gcgr: null },
  qualifyingAssayCounts: { glp1r: 2, gipr: 0, gcgr: 0 },
};

/** Strong, floor-clearing effect; 3 independent direct-comparison entries (meets MINIMUM_OBSERVATIONS on its own). */
const SYNTH_A_REPORT = buildSyntheticReport(SYNTH_A_SUMMARY, [
  efficacyEntry('NCT-SYNTH-A-1', -2.0, -3.0, 200),
  efficacyEntry('NCT-SYNTH-A-2', -2.1, -3.0, 210),
  efficacyEntry('NCT-SYNTH-A-3', -1.9, -3.0, 190),
]);

/** Weaker but still floor-clearing effect; one direct-comparison entry — a genuine, weaker second finalist, not a strawman. */
const SYNTH_B_REPORT = buildSyntheticReport(SYNTH_B_SUMMARY, [
  efficacyEntry('NCT-SYNTH-B-1', -1.5, -0.5, 150),
]);

export const SYNTHETIC_WINNER_SUMMARIES: readonly A2CandidateSummary[] = [SYNTH_A_SUMMARY, SYNTH_B_SUMMARY];
export const SYNTHETIC_WINNER_REPORTS: readonly A2CandidateReport[] = [SYNTH_A_REPORT, SYNTH_B_REPORT];
