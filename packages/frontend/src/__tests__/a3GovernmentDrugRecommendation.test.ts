import { describe, expect, it, vi } from 'vitest';
import {
  runA3GovernmentRecommendation,
  printA3GovernmentReport,
  trialMatchesPopulation,
  deriveSafetyLabel,
  describePopulation,
} from '../core/biotechData/a3GovernmentDrugRecommendation';
import type { A2CandidateReport } from '../core/biotechData/a2OzempicSubstitute';

/**
 * These numbers are computed from the REAL pinned data: A2's own
 * mechanism-derived candidate space (D-029/D-030) plus A3's real per-trial
 * ClinicalTrials.gov `conditions` field (D-031). Asserted as literals for
 * the same reason every other pinned-anchor test in this repo does: a later
 * change to the matching/scoring logic or the pinned data becomes a
 * visible, reviewed diff.
 */
describe('A3 government recommendation — the hard population gate', () => {
  it('returns REQUIRED_POLICY_INPUT without running any candidate analysis when population is omitted', () => {
    const report = runA3GovernmentRecommendation();
    expect(report.status).toBe('REQUIRED_POLICY_INPUT');
    if (report.status !== 'REQUIRED_POLICY_INPUT') throw new Error('unreachable');
    expect(report.preregistrationFingerprint).toBe('2b32c0a8');
    expect(report.reason).toContain('never guessed');
  });

  it('the printed report for REQUIRED_POLICY_INPUT never claims a recommendation exists', () => {
    const text = printA3GovernmentReport(runA3GovernmentRecommendation());
    expect(text).toContain('STATUS:\nREQUIRED_POLICY_INPUT');
    expect(text).not.toContain('GOVERNMENT RECOMMENDATION:');
  });
});

describe('A3 government recommendation — real pinned data, population = T2D_AND_OBESITY', () => {
  it('reaches the answered branch and is deterministic', () => {
    const a = runA3GovernmentRecommendation({ kind: 'T2D_AND_OBESITY' });
    const b = runA3GovernmentRecommendation({ kind: 'T2D_AND_OBESITY' });
    expect(a.status).toBe('ANSWERED');
    if (a.status !== 'ANSWERED' || b.status !== 'ANSWERED') throw new Error('unreachable');
    expect(a.decisionFingerprint).toBe(b.decisionFingerprint);
    // D-113/D-114/D-115: moved from 'ebf4df60' — A3 re-runs A2's own
    // analysis, so every real data change flows through here: orforglipron's
    // second observation, LEAD-2's ingestion (liraglutide's third), and
    // D-115's general single-arm identity-mismatch rule refusing
    // NCT05659537's "Dulaglutide" arm as native GLP-1's (CHEMBL1240772)
    // own observation. D-115 also changes A3's own verdict label — see
    // the next test — because native GLP-1 no longer has any efficacy
    // evidence to contribute. See DECISIONS.md D-115.
    expect(a.decisionFingerprint).toBe('6febb00c');
    expect(a.preregistrationFingerprint).toBe('2b32c0a8');
  });

  it('honestly reuses A2\'s NO_SUPERIOR_CANDIDATE verdict -- no rosier government vocabulary', () => {
    const report = runA3GovernmentRecommendation({ kind: 'T2D_AND_OBESITY' });
    if (report.status !== 'ANSWERED') throw new Error('unreachable');
    // D-115: moved from CONFLICTING_EVIDENCE — see DECISIONS.md D-115.
    expect(report.answerRecord.recommendation.label).toBe('NO_SUPERIOR_CANDIDATE');
  });

  it('excludes zero-efficacy candidates from SCIENTIFIC WINNER / BEST OVERALL, even when they score highest on safety alone', () => {
    const report = runA3GovernmentRecommendation({ kind: 'T2D_AND_OBESITY' });
    if (report.status !== 'ANSWERED') throw new Error('unreachable');
    const mk0893 = report.answerRecord.candidateViews.find((v) => v.report.summary.prefName === 'MK-0893')!;
    // Real finding: MK-0893 has 0 efficacy trials but a high safety-only score (1.100), which
    // would make it the top of an UNFILTERED ranking -- it must not be crowned scientific winner.
    expect(mk0893.report.efficacy).toHaveLength(0);
    expect(mk0893.report.score.weightedScore).toBeCloseTo(1.1, 6);
    expect(report.answerRecord.scientificRanking.some((v) => v.report.summary.prefName === 'MK-0893')).toBe(false);
    expect(report.answerRecord.bestOverallCandidate?.report.summary.prefName).not.toBe('MK-0893');
    // But it is NOT hidden: it remains fully visible as the safest supported option, with efficacy: n/a disclosed.
    expect(report.answerRecord.safestSupportedCandidate?.report.summary.prefName).toBe('MK-0893');
    expect(report.answerRecord.candidateViews.some((v) => v.report.summary.prefName === 'MK-0893')).toBe(true);
  });

  it('best-efficacy and best-overall genuinely differ from the vetoed top scorer', () => {
    const report = runA3GovernmentRecommendation({ kind: 'T2D_AND_OBESITY' });
    if (report.status !== 'ANSWERED') throw new Error('unreachable');
    expect(report.answerRecord.bestEfficacyCandidate?.report.summary.prefName).toBe('TIRZEPATIDE');
    expect(report.answerRecord.bestEfficacyCandidate?.report.score.vetoed).toBe(true);
    // D-115: moved from 'GLP-1' (CHEMBL1240772). Native GLP-1's sole HbA1c
    // observation was really dulaglutide's own arm in NCT05659537 and is now
    // refused as IDENTITY_MISMATCH — with 0 real efficacy observations left,
    // native GLP-1 can no longer be BEST OVERALL. PF-06291874 is the real,
    // current best-overall under the unmodified scoring rule. See
    // DECISIONS.md D-115.
    expect(report.answerRecord.bestOverallCandidate?.report.summary.prefName).toBe('PF-06291874');
    expect(report.answerRecord.bestOverallCandidate?.report.score.vetoed).toBe(false);
  });

  it('the government ranking currently equals the scientific ranking, disclosed as a fact about missing policy data, not assumed', () => {
    const report = runA3GovernmentRecommendation({ kind: 'T2D_AND_OBESITY' });
    if (report.status !== 'ANSWERED') throw new Error('unreachable');
    expect(report.answerRecord.rankingsDiverge).toBe(false);
    expect(report.policyDimensionsWithoutSource).toEqual([
      'cost', 'availability', 'scalability', 'supplySecurity', 'manufacturingFeasibility', 'populationCoverage',
    ]);
    for (const v of report.answerRecord.candidateViews) {
      expect(v.governmentScore.governmentWeightedScore).toBeCloseTo(v.report.score.weightedScore, 10);
      for (const dim of report.policyDimensionsWithoutSource) {
        expect(v.governmentScore.policyDimensions[dim]).toEqual({ status: 'INSUFFICIENT_EVIDENCE', contribution: 0 });
      }
    }
  });

  it('self-falsification adds government-specific findings alongside A2\'s own scientific findings', () => {
    const report = runA3GovernmentRecommendation({ kind: 'T2D_AND_OBESITY' });
    if (report.status !== 'ANSWERED') throw new Error('unreachable');
    expect(report.answerRecord.selfFalsification).not.toBeNull();
    expect(report.answerRecord.selfFalsification!.candidateId).toBe('CHEMBL4297839');
    expect(report.answerRecord.selfFalsification!.scientificFindings.length).toBeGreaterThan(0);
    expect(report.answerRecord.selfFalsification!.governmentFindings).toContain(
      'No real, integrated public source exists in this analysis for cost, availability, supply security, or manufacturing feasibility -- these dimensions are INSUFFICIENT_EVIDENCE, never assumed favorable.',
    );
  });

  it('AnswerRecord vs ActionRecord: no candidate is gated for action under a NO_SUPERIOR_CANDIDATE recommendation', () => {
    const report = runA3GovernmentRecommendation({ kind: 'T2D_AND_OBESITY' });
    if (report.status !== 'ANSWERED') throw new Error('unreachable');
    expect(report.actionRecord.gatedCandidate).toBeNull();
    expect(report.actionRecord.gateDecision).toBeNull();
    expect(report.actionRecord.surface).toBe('NONE');
    // TRUTH is unaffected by the absence of ACTION -- all 12 candidate views stay in the report.
    expect(report.answerRecord.candidateViews).toHaveLength(12);
  });
});

describe('A3 — real per-trial population matching (fixed regex, both word orders + roman numeral)', () => {
  it('matches "Diabetes Mellitus, Type 2" (reversed word order, the real majority phrasing in this dataset)', () => {
    expect(trialMatchesPopulation('NCT00518882', { kind: 'T2D' })).toBe(true);
  });

  it('matches "Diabetes Mellitus, Type II" (roman numeral)', () => {
    expect(trialMatchesPopulation('NCT02175121', { kind: 'T2D' })).toBe(true);
  });

  it('matches "Type 2 Diabetes Mellitus (T2DM)" (forward order with trailing abbreviation)', () => {
    expect(trialMatchesPopulation('NCT02759107', { kind: 'T2D' })).toBe(true);
  });

  it('does NOT match perphenazine\'s real, unrelated trial (Psychotic Disorders) against T2D or OBESITY', () => {
    expect(trialMatchesPopulation('NCT00806234', { kind: 'T2D' })).toBe(false);
    expect(trialMatchesPopulation('NCT00806234', { kind: 'OBESITY' })).toBe(false);
  });

  it('OBESITY-only population correctly narrows to exactly the 2 real candidates with an obesity-tagged trial', () => {
    const report = runA3GovernmentRecommendation({ kind: 'OBESITY' });
    if (report.status !== 'ANSWERED') throw new Error('unreachable');
    const matching = report.answerRecord.candidateViews.filter((v) => v.population.populationCoverage === 'DIRECT_EVIDENCE_FOR_POPULATION').map((v) => v.report.summary.prefName).sort();
    expect(matching).toEqual(['COTADUTIDE', 'ORFORGLIPRON']);
  });

  it('RISK_GROUP matches real condition keywords literally, not a synonym expansion', () => {
    expect(trialMatchesPopulation('NCT04616027', { kind: 'RISK_GROUP', conditionKeywords: ['Renal Impairment'] })).toBe(true);
    expect(trialMatchesPopulation('NCT04616027', { kind: 'RISK_GROUP', conditionKeywords: ['Cardiovascular'] })).toBe(false);
  });

  it('describePopulation renders each kind in human-readable form', () => {
    expect(describePopulation({ kind: 'T2D' })).toBe('Type 2 Diabetes');
    expect(describePopulation({ kind: 'OBESITY' })).toBe('Obesity');
    expect(describePopulation({ kind: 'T2D_AND_OBESITY' })).toBe('Type 2 Diabetes and/or Obesity');
    expect(describePopulation({ kind: 'RISK_GROUP', conditionKeywords: ['Renal Impairment'] })).toContain('Renal Impairment');
  });
});

describe('A3 — §7 controlled safety-language vocabulary, never a bare "safe" claim', () => {
  it('a vetoed candidate gets no reassuring label from the vocabulary (null), not a euphemism', () => {
    const report = runA3GovernmentRecommendation({ kind: 'T2D_AND_OBESITY' });
    if (report.status !== 'ANSWERED') throw new Error('unreachable');
    const tirzepatide = report.answerRecord.candidateViews.find((v) => v.report.summary.prefName === 'TIRZEPATIDE')!;
    expect(tirzepatide.report.score.vetoed).toBe(true);
    expect(tirzepatide.safetyLabel).toBeNull();
  });

  it('no numeric safety comparison yields INSUFFICIENT_SAFETY_EVIDENCE, not a default-favorable guess', () => {
    const report = runA3GovernmentRecommendation({ kind: 'T2D_AND_OBESITY' });
    if (report.status !== 'ANSWERED') throw new Error('unreachable');
    const exenatide = report.answerRecord.candidateViews.find((v) => v.report.summary.prefName === 'EXENATIDE')!;
    expect(exenatide.safetyLabel).toBe('INSUFFICIENT_SAFETY_EVIDENCE');
  });

  it('a real favorable-but-mixed safety signal yields LOWER_OBSERVED_RISK, not SAFE_RELATIVE_TO_X', () => {
    const report = runA3GovernmentRecommendation({ kind: 'T2D_AND_OBESITY' });
    if (report.status !== 'ANSWERED') throw new Error('unreachable');
    const liraglutide = report.answerRecord.candidateViews.find((v) => v.report.summary.prefName === 'LIRAGLUTIDE')!;
    expect(liraglutide.safetyLabel).toBe('LOWER_OBSERVED_RISK');
  });

  it('SAFE_RELATIVE_TO_X is a real, reachable code path: every measured category strictly favorable', () => {
    const syntheticReport = {
      summary: { moleculeChemblId: 'TEST', prefName: 'TEST', moleculeType: 'Small molecule', maxPhase: 3, medianPotencyNMByTarget: { glp1r: 1, gipr: null, gcgr: null }, qualifyingAssayCounts: { glp1r: 1, gipr: 0, gcgr: 0 } },
      efficacy: [],
      safety: [
        { key: 'nausea', label: 'Nausea', candidate: { numAffected: 5, numAtRisk: 100 }, reference: { numAffected: 20, numAtRisk: 100 }, riskRatio: 0.25, riskRatioCi95: { low: 0.1, high: 0.6 }, comparisonType: 'NAIVE_INDIRECT' as const },
      ],
      falsification: { failures: [], worseSafetySignal: null, evidencePolicy: 'HISTORICAL_NO_EVIDENCE_CLASS' as const, supersededByStrongerEvidence: [] },
      belief: {} as A2CandidateReport['belief'],
      score: { moleculeChemblId: 'TEST', prefName: 'TEST', efficacyScore: 0, safetyScore: 0.8, evidenceStrengthScore: 0.2, uncertaintyPenalty: 0, conflictPenalty: 0, weightedScore: 1, vetoed: false, vetoReason: null },
      identityMismatches: [],
    };
    expect(deriveSafetyLabel(syntheticReport)).toBe('SAFE_RELATIVE_TO_X');
  });

  it('never emits the bare word "safe" outside the SAFE_RELATIVE_TO_X token anywhere in the printed report', () => {
    const text = printA3GovernmentReport(runA3GovernmentRecommendation({ kind: 'T2D_AND_OBESITY' }));
    const withoutTokens = text.replace(/SAFE_RELATIVE_TO_X/g, '').replace(/INSUFFICIENT_SAFETY_EVIDENCE/g, '');
    expect(/\bsafe\b/i.test(withoutTokens)).toBe(false);
  });
});

describe('A3 — Science Memory', () => {
  it('writes REQUIRED_POLICY_INPUT without claiming a recommendation exists', async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => (storage.has(k) ? storage.get(k)! : null),
        setItem: (k: string, v: string) => void storage.set(k, v),
        removeItem: (k: string) => void storage.delete(k),
        key: (i: number) => [...storage.keys()][i] ?? null,
        get length() { return storage.size; },
      },
    });
    vi.resetModules();
    const { saveA3GovernmentRecommendationToMemory, listExperiments } = await import('../core/scienceMemory');
    const report = runA3GovernmentRecommendation();

    const before = listExperiments().length;
    const record = saveA3GovernmentRecommendationToMemory(report);
    expect(listExperiments().length).toBe(before + 1);
    expect(record.epistemicStatus).toBe('INCONCLUSIVE');
    const bodies = record.analysis!.map((a) => a.body).join(' ');
    expect(bodies).toContain('REQUIRED_POLICY_INPUT');
    vi.unstubAllGlobals();
  });

  it('writes an answered recommendation, disclosing the real verdict, not hiding it', async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => (storage.has(k) ? storage.get(k)! : null),
        setItem: (k: string, v: string) => void storage.set(k, v),
        removeItem: (k: string) => void storage.delete(k),
        key: (i: number) => [...storage.keys()][i] ?? null,
        get length() { return storage.size; },
      },
    });
    vi.resetModules();
    const { saveA3GovernmentRecommendationToMemory, listExperiments } = await import('../core/scienceMemory');
    const report = runA3GovernmentRecommendation({ kind: 'T2D_AND_OBESITY' });

    const before = listExperiments().length;
    const record = saveA3GovernmentRecommendationToMemory(report);
    expect(listExperiments().length).toBe(before + 1);
    // D-115: moved from 'INCONCLUSIVE'. The real recommendation label is now
    // NO_SUPERIOR_CANDIDATE (see DECISIONS.md D-115), and
    // saveA3GovernmentRecommendationToMemory maps that to
    // FALSIFIED_WITHIN_PROTOCOL, not INCONCLUSIVE (core/scienceMemory.ts).
    expect(record.epistemicStatus).toBe('FALSIFIED_WITHIN_PROTOCOL');
    const bodies = record.analysis!.map((a) => a.body).join(' ');
    expect(bodies).toContain('NO_SUPERIOR_CANDIDATE');
    expect(bodies).toContain('TIRZEPATIDE');
    expect(bodies).toContain('MK-0893');
    vi.unstubAllGlobals();
  });
});

describe('A3 — §14 full report format', () => {
  it('contains every mandated section header for an answered report', () => {
    const text = printA3GovernmentReport(runA3GovernmentRecommendation({ kind: 'T2D_AND_OBESITY' }));
    for (const header of [
      'QUESTION:', 'POPULATION:', 'CANDIDATE SPACE:', 'SCIENTIFIC WINNER:', 'SAFEST SUPPORTED OPTION:',
      'BEST EFFICACY OPTION:', 'BEST OVERALL OPTION:', 'COUNTEREVIDENCE:', 'UNKNOWN / DATA GAPS:', 'CONFLICTS:',
      'CONFIDENCE:', 'EVIDENCE STRENGTH:', 'GOVERNMENT RECOMMENDATION:', 'WHY:', 'WHAT WOULD CHANGE THIS DECISION:',
      'NEXT BEST EXPERIMENT:', 'FULL PROVENANCE:', 'REPLAY:', 'DECISION FINGERPRINT:', 'STATUS:',
    ]) {
      expect(text).toContain(header);
    }
  });

  it('names all 4 vetoed candidates in COUNTEREVIDENCE, not just the top scorer', () => {
    const text = printA3GovernmentReport(runA3GovernmentRecommendation({ kind: 'T2D_AND_OBESITY' }));
    for (const name of ['DANUGLIPRON', 'ORFORGLIPRON', 'COTADUTIDE', 'TIRZEPATIDE']) {
      expect(text).toContain(name);
    }
  });
});
