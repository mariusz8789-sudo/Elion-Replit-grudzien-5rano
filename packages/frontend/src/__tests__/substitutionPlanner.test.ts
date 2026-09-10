import { describe, it, expect } from 'vitest';
import { resolveNaturalFunctionalReplacement } from '../core/biotechData/naturalReplacement';
import { assessSubstitutionCandidate, selectNextValidationCandidate, runSubstitutionInvestigation } from '../core/biotechData/substitutionPlanner';
import { isWellFormedSubstitutionInvestigation } from '../core/biotechData/substitutionInvestigation';
import {
  buildSavedSubstitutionInvestigation, saveSubstitutionInvestigationToMemory, replaySavedSubstitutionInvestigation,
} from '../core/scienceMemory';

/**
 * SUBSTITUTION INVESTIGATION — tests against the REAL, already-existing,
 * deterministic pinned dataset (`resolveNaturalFunctionalReplacement`, the
 * synchronous/no-network variant of the natural functional replacement
 * pipeline already wired into `DrugDiscoveryScreen.tsx`). No synthetic
 * fixture is invented here: these are the same 12 candidate reports
 * (caffeine, adenosine, theophylline, theobromine, paraxanthine, plus 7
 * identity-only PubChem entries) that pipeline already produces for the A1
 * reference query.
 */

function realReports() {
  const result = resolveNaturalFunctionalReplacement({ referenceCompound: 'caffeine', target: 'A1' });
  expect(result.status).toBe('RESOLVED');
  return result.reports;
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

describe('assessSubstitutionCandidate — comparison-driven verdict on real reports', () => {
  it('splits the real 13-report pinned dataset into 5 CANDIDATE_HYPOTHESIS and 8 INSUFFICIENT_DATA', () => {
    const reports = realReports();
    // 3 pinned ChEMBL (caffeine, adenosine, theophylline) + theobromine + paraxanthine (5, all
    // targetRelevance > 0) + 8 identity-only PubChem entries (targetRelevance = 0, including a
    // SECOND, identity-only caffeine record distinct from the pinned ChEMBL one).
    expect(reports.length).toBe(13);
    const assessments = reports.map((r) => assessSubstitutionCandidate(r, ['A1']));
    const candidateHypothesis = assessments.filter((a) => a.verdict === 'CANDIDATE_HYPOTHESIS');
    const insufficient = assessments.filter((a) => a.verdict === 'INSUFFICIENT_DATA');
    expect(candidateHypothesis.length).toBe(5);
    expect(insufficient.length).toBe(8);
    // every real, target-relevant compound (positive targetRelevance + real evidence) is among them
    for (const id of ['candidate:chembl:CHEMBL1114', 'candidate:chembl:CHEMBL1158']) {
      expect(candidateHypothesis.some((a) => a.candidateId === id)).toBe(true);
    }
  });

  it('comparison record is structurally traceable to the actual report fields, never a free-form flag', () => {
    const reports = realReports();
    const theobromine = reports.find((r) => r.candidateId === 'candidate:chembl:CHEMBL1114')!;
    const assessment = assessSubstitutionCandidate(theobromine, ['A1']);
    expect(assessment.comparison.result).toBe('MATCH');
    expect(assessment.comparison.observed).toContain('targetRelevance=1');
    expect(assessment.comparison.observed).toContain(`evidenceIds=${theobromine.evidenceIds.length}`);
    expect(assessment.rankingScore).toBe(theobromine.ranking!.score);
  });

  it('a report with no ranking at all is INSUFFICIENT_DATA, distinct from a MISMATCH reason', () => {
    const reports = realReports();
    const withoutRanking = { ...reports[0]!, ranking: undefined };
    const assessment = assessSubstitutionCandidate(withoutRanking, ['A1']);
    expect(assessment.verdict).toBe('INSUFFICIENT_DATA');
    expect(assessment.verdictReason).toContain('no CandidateRanking');
    expect(assessment.rankingScore).toBeNull();
  });
});

describe('selectNextValidationCandidate — adaptive cross-candidate planner', () => {
  it('picks the highest research-priority score among CANDIDATE_HYPOTHESIS candidates, excluding INSUFFICIENT_DATA', () => {
    const reports = realReports();
    const assessments = reports.map((r) => assessSubstitutionCandidate(r, ['A1']));
    const sel = selectNextValidationCandidate(assessments, new Set());
    expect(sel.selectedCandidateId).not.toBeNull();
    const chosen = assessments.find((a) => a.candidateId === sel.selectedCandidateId)!;
    expect(chosen.verdict).toBe('CANDIDATE_HYPOTHESIS');
    const candidateHypothesisScores = assessments.filter((a) => a.verdict === 'CANDIDATE_HYPOTHESIS').map((a) => a.rankingScore ?? -Infinity);
    expect(chosen.rankingScore).toBe(Math.max(...candidateHypothesisScores));
    expect(sel.why.length).toBeGreaterThan(0);
    expect(sel.whyNot.length).toBeGreaterThan(0);
  });

  it('excludes already-selected candidates — no accidental repeat', () => {
    const reports = realReports();
    const assessments = reports.map((r) => assessSubstitutionCandidate(r, ['A1']));
    const first = selectNextValidationCandidate(assessments, new Set());
    const second = selectNextValidationCandidate(assessments, new Set([first.selectedCandidateId!]));
    expect(second.selectedCandidateId).not.toBe(first.selectedCandidateId);
  });

  it('returns null with a structured reason once every CANDIDATE_HYPOTHESIS candidate is selected', () => {
    const reports = realReports();
    const assessments = reports.map((r) => assessSubstitutionCandidate(r, ['A1']));
    const allIds = new Set(assessments.filter((a) => a.verdict === 'CANDIDATE_HYPOTHESIS').map((a) => a.candidateId));
    const sel = selectNextValidationCandidate(assessments, allIds);
    expect(sel.selectedCandidateId).toBeNull();
    expect(sel.why.length).toBeGreaterThan(0);
  });
});

describe('runSubstitutionInvestigation — the real orchestrator', () => {
  it('queues every CANDIDATE_HYPOTHESIS candidate exactly once, each with a real (BLOCKED) validation request', () => {
    const reports = realReports();
    const result = runSubstitutionInvestigation({ question: 'najlepszy zamiennik dla A1?', reports, requestedTargetIds: ['A1'] });
    expect(result.maxStepsUsed).toBe(5);
    expect(result.steps).toHaveLength(5);
    expect(result.steps.every((s) => s.selectedCandidateId !== null)).toBe(true);
    const selectedIds = result.steps.map((s) => s.selectedCandidateId);
    expect(new Set(selectedIds).size).toBe(5); // no duplicates: every step is a distinct candidate
    for (const step of result.steps) {
      expect(step.validationRequest).not.toBeNull();
      expect(step.validationRequest!.status).toBe('BLOCKED'); // honest: no biological executor exists in this environment
      expect(step.validationRequest!.candidateId).toBe(step.selectedCandidateId);
    }
    expect(result.stopReason).toContain('maxSteps=5');
  });

  it('bestCandidateId is the highest-scoring CANDIDATE_HYPOTHESIS candidate', () => {
    const reports = realReports();
    const result = runSubstitutionInvestigation({ question: 'q', reports, requestedTargetIds: ['A1'] });
    const best = result.assessments.find((a) => a.candidateId === result.bestCandidateId)!;
    const allScores = result.assessments.filter((a) => a.verdict === 'CANDIDATE_HYPOTHESIS').map((a) => a.rankingScore ?? -Infinity);
    expect(best.rankingScore).toBe(Math.max(...allScores));
  });

  it('K: the planner is genuinely adaptive — a smaller maxSteps yields a strict prefix of the full queue', () => {
    const reports = realReports();
    const full = runSubstitutionInvestigation({ question: 'q', reports, requestedTargetIds: ['A1'] });
    const partial = runSubstitutionInvestigation({ question: 'q', reports, requestedTargetIds: ['A1'], maxSteps: 2 });
    expect(partial.steps).toHaveLength(2);
    expect(partial.steps.map((s) => s.selectedCandidateId)).toEqual(full.steps.slice(0, 2).map((s) => s.selectedCandidateId));
  });

  it('stops with a structured reason (not a crash) once maxSteps exceeds the number of real candidates', () => {
    const reports = realReports();
    const result = runSubstitutionInvestigation({ question: 'q', reports, requestedTargetIds: ['A1'], maxSteps: 10 });
    expect(result.steps.length).toBe(6); // 5 real selections + 1 null-selection stop step
    expect(result.steps[5]!.selectedCandidateId).toBeNull();
    expect(result.stopReason).toContain('brak kandydatów');
  });

  it('reuses the EXISTING combination/composition hypothesis functions verbatim, not a reimplementation', () => {
    const reports = realReports();
    const result = runSubstitutionInvestigation({ question: 'q', reports, requestedTargetIds: ['A1'] });
    expect(result.combinationHypothesis).toBeDefined();
    expect(result.combinationHypothesis!.status).toBe('HYPOTHESIS');
    expect(result.compositionHypotheses.length).toBeGreaterThan(0);
    expect(result.compositionHypotheses[0]!.rank).toBe(1);
  });

  it('is well-formed per the anti-fabrication validator', () => {
    const reports = realReports();
    const result = runSubstitutionInvestigation({ question: 'q', reports, requestedTargetIds: ['A1'] });
    expect(isWellFormedSubstitutionInvestigation(result)).toBe(true);
  });

  it('paretoFrontier is non-empty, restricted to CANDIDATE_HYPOTHESIS candidates, and includes the best candidate', () => {
    const reports = realReports();
    const result = runSubstitutionInvestigation({ question: 'q', reports, requestedTargetIds: ['A1'] });
    const candidateHypothesisIds = new Set(result.assessments.filter((a) => a.verdict === 'CANDIDATE_HYPOTHESIS').map((a) => a.candidateId));
    expect(result.paretoFrontier.length).toBeGreaterThan(0);
    for (const id of result.paretoFrontier) expect(candidateHypothesisIds.has(id)).toBe(true);
    expect(result.paretoFrontier).toContain(result.bestCandidateId);
  });
});

describe('Science Memory persistence and GENUINE replay (not self-consistency-only)', () => {
  it('saves, and replay recomputes from the same reports to MATCH', () => {
    (globalThis as { window?: unknown }).window = { localStorage: makeFakeStorage() };
    const reports = realReports();
    const result = runSubstitutionInvestigation({ question: 'najlepszy zamiennik dla A1?', reports, requestedTargetIds: ['A1'] });
    const saved = buildSavedSubstitutionInvestigation(result);
    const experiment = saveSubstitutionInvestigationToMemory(saved);
    expect(experiment.substitutionInvestigation).toBeDefined();
    expect(replaySavedSubstitutionInvestigation(experiment, reports).status).toBe('MATCH');
  });

  it('DRIFT when replayed against a report set that changes the outcome (fewer candidates)', () => {
    (globalThis as { window?: unknown }).window = { localStorage: makeFakeStorage() };
    const reports = realReports();
    const result = runSubstitutionInvestigation({ question: 'najlepszy zamiennik dla A1?', reports, requestedTargetIds: ['A1'] });
    const saved = buildSavedSubstitutionInvestigation(result);
    const experiment = saveSubstitutionInvestigationToMemory(saved);
    const fewerReports = reports.slice(0, 6);
    const replay = replaySavedSubstitutionInvestigation(experiment, fewerReports);
    expect(['DRIFT', 'NOT_REPRODUCIBLE']).toContain(replay.status);
  });

  it('BLOCKED when the saved experiment carries no substitution investigation', () => {
    (globalThis as { window?: unknown }).window = { localStorage: makeFakeStorage() };
    const reports = realReports();
    const result = runSubstitutionInvestigation({ question: 'q', reports, requestedTargetIds: ['A1'] });
    const experiment = saveSubstitutionInvestigationToMemory(buildSavedSubstitutionInvestigation(result));
    const stripped = { ...experiment, substitutionInvestigation: undefined };
    expect(replaySavedSubstitutionInvestigation(stripped, reports).status).toBe('BLOCKED');
  });

  it('rejects an empty/degenerate result at build time (anti-fabrication)', () => {
    expect(() => buildSavedSubstitutionInvestigation({
      investigationId: 'x', question: 'q', requestedTargetIds: [], candidateIds: [], assessments: [],
      steps: [], maxStepsUsed: 0, bestCandidateId: null, paretoFrontier: [], combinationHypothesis: undefined, compositionHypotheses: [], stopReason: 'none',
    })).toThrow();
  });
});
