import { describe, expect, it } from 'vitest';
import { fnv1a, canonicalJson } from '../core/events/hash';
import { LOWER_HARM_PREREGISTRATION } from '../core/biotechData/govDrugLowerHarmPreregistration';
import { A2_PREREGISTRATION } from '../core/biotechData/a2OzempicSubstitutePreregistration';
import { classifyComparisonEvidenceClass, compareCountedOutcomes, type CountedOutcomeObservation } from '../core/agent/evidenceProvenance';
import { surpass2Observation, surpass2ArmByTitle, SURPASS2_STUDY } from '../core/biotechData/surpass2DirectEvidence';
import { surpass2DoseStrata, doseStratumToCandidate, tirzepatideSummary } from '../core/biotechData/d062SurpassDoseStrata';
import { canPromoteToWinnerRecord, asEvidenceClass } from '../core/orchestrator/winnerGate';
import { MINIMUM_OBSERVATIONS } from '../core/agent/practicalCandidateGate';
import { buildBetterRule, evaluateBetter, freezeBetterRule } from '../core/discoveryChallenge/betterRule';
import { freezeBaseline, makeBaselineFingerprint, verifyBaselineFrozen } from '../core/discoveryChallenge/baselineRegistry';
import { classifyLineage, isTrueDiscoveryBest, noveltyLevelFromLineage } from '../core/discoveryChallenge/lineage';
import type { BaselineRecord, ChallengeCandidate } from '../core/discoveryChallenge/contracts';
import { createD062Ports } from '../core/orchestrator/d062Ports';
import { createChallengeAdapters } from '../core/discoveryChallenge/challengeAdapters';
import { D062_BASELINE, D062_BETTER_RULE, runD062Discovery, replayD062Discovery } from '../core/orchestrator/d062Discovery';
import { runScientificDiscovery } from '../core/orchestrator/orchestrator';
import { parseProblem } from '../core/orchestrator/nl';
import { scanForBannedStrings } from '../core/agent/bannedStringScanner';

/**
 * D-062 DOSE-STRATIFIED LOWER-HARM DISCOVERY CHALLENGE (docs/DECISIONS.md
 * D-062, `docs/QWEN-A2-DISCOVERY-CHALLENGE-BRIEF.md`).
 *
 * Negative-first: the tests that make the result mean something (10, 11 in
 * the brief's numbering) come before the happy path.
 */

const H = (v: unknown): string => fnv1a(canonicalJson(v));
const baseline = (): BaselineRecord => D062_BASELINE;

describe('1. the D-062 rule re-tunes no existing threshold', () => {
  it('LOWER_HARM_PREREGISTRATION.fingerprint is still c827c79c — untouched by this work', () => {
    expect(LOWER_HARM_PREREGISTRATION.fingerprint).toBe('c827c79c');
  });

  it('A2_PREREGISTRATION.fingerprint is still 4642088a — untouched by this work', () => {
    expect(A2_PREREGISTRATION.fingerprint).toBe('4642088a');
  });

  it("the D-062 better-rule declares its inheritance and re-tunes nothing", () => {
    const rule = buildBetterRule(baseline(), MINIMUM_OBSERVATIONS, 1, [], [LOWER_HARM_PREREGISTRATION.fingerprint, A2_PREREGISTRATION.fingerprint]);
    expect(rule.inheritedFrom).toEqual(['c827c79c', '4642088a']);
    expect(rule.minObservations).toBe(MINIMUM_OBSERVATIONS);
  });

  it('the better-rule fingerprint is asserted before first use and is deterministic', () => {
    const rule = buildBetterRule(baseline(), MINIMUM_OBSERVATIONS, 1, [], [LOWER_HARM_PREREGISTRATION.fingerprint, A2_PREREGISTRATION.fingerprint]);
    const frozen = freezeBetterRule(rule, 'test-subject', '1970-01-01T00:00:00Z');
    expect(frozen.ruleFingerprint).toBe(H(rule));
    expect(freezeBetterRule(rule, 'test-subject', '1970-01-01T00:00:00Z').ruleFingerprint).toBe(frozen.ruleFingerprint);
  });
});

describe('2. arm resolution — the outcome-local groupId trap (brief §6)', () => {
  it('resolves the semaglutide arm by exact title, never by groupId, across different outcome objects', () => {
    // In hba1cOutcomes[0] semaglutide is OG002; in hba1cOutcomes[1] it is
    // OG001; in adverseEvents.eventGroups it is EG003. Only the arm TITLE
    // ("1 mg Semaglutide") is stable across all three. surpass2ArmByTitle
    // must resolve correctly from the adverseEvents shape regardless.
    const arm = surpass2ArmByTitle('1 mg Semaglutide');
    expect(arm.title).toBe('1 mg Semaglutide');
    expect(arm.groupId).toBe('EG003');
  });

  it('throws rather than guessing when an arm title does not exist', () => {
    expect(() => surpass2ArmByTitle('nonexistent arm')).toThrow();
  });

  it('every dose stratum resolves a DISTINCT real arm title, never falling back to an index', () => {
    const strata = surpass2DoseStrata();
    const titles = strata.map((s) => s.armTitle);
    expect(new Set(titles).size).toBe(3);
    expect(titles).toEqual(['5 mg Tirzepatide', '10 mg Tirzepatide', '15 mg Tirzepatide']);
  });
});

describe('3. evidence class is COMPUTED, never declared', () => {
  it('two arms of the SAME randomised trial (SURPASS-2) classify as DIRECT_RANDOMISED', () => {
    const exposed: CountedOutcomeObservation = surpass2Observation('Diarrhoea', '10 mg Tirzepatide');
    const reference: CountedOutcomeObservation = surpass2Observation('Diarrhoea', '1 mg Semaglutide');
    expect(classifyComparisonEvidenceClass(exposed, reference)).toBe('DIRECT_RANDOMISED');
  });

  it('every dose stratum reports DIRECT_RANDOMISED (same-trial comparator), never asserted, always computed', () => {
    for (const stratum of surpass2DoseStrata()) {
      expect(stratum.evidenceClass).toBe('DIRECT_RANDOMISED');
    }
  });

  it('compareCountedOutcomes returns null (never a fabricated interval) on a zero-event arm', () => {
    const zero: CountedOutcomeObservation = { observationId: 'x', study: SURPASS2_STUDY, arm: { groupId: 'Z', title: 'zero', nAtRisk: 100 }, term: 'Diarrhoea', numAffected: 0, numAtRisk: 100, codingSystem: null, population: 'test' };
    const real = surpass2Observation('Diarrhoea', '1 mg Semaglutide');
    expect(compareCountedOutcomes(zero, real)).toBeNull();
  });
});

describe('4. real, honest per-stratum evidence — no inflation, no undercounting (brief §8.3)', () => {
  it('each stratum carries its own real observationCount = efficacy rows + safety rows with a real risk ratio', () => {
    for (const stratum of surpass2DoseStrata()) {
      const expected = stratum.efficacy.length + stratum.safety.filter((s) => s.riskRatio !== null).length;
      expect(stratum.observationCount).toBe(expected);
      expect(stratum.observationCount).toBeGreaterThan(0);
    }
  });

  it('doseStratumToCandidate never fabricates an evidenceRef: one per real efficacy/safety comparison', () => {
    const c = doseStratumToCandidate(surpass2DoseStrata()[0]!);
    expect(c.evidenceRefs.length).toBe(c.observationCount);
  });

  it('the same real molecule (tirzepatide, CHEMBL4297839) backs every dose stratum — no fabricated candidate', () => {
    const summary = tirzepatideSummary();
    expect(summary.moleculeChemblId).toBe('CHEMBL4297839');
  });
});

describe('5. D-057 gate: evidence sufficiency and strength (never re-tuned)', () => {
  it('a candidate with 2 observations is refused with EVIDENCE_SUFFICIENT (needs 3)', () => {
    const result = canPromoteToWinnerRecord({ adjudicationVerdict: 'WINNER', inventory: [{ evidenceClass: 'DIRECT_RANDOMISED', observationCount: 2 }] });
    expect(result.outcome).toBe('NO_PROMOTION');
    expect(result.reasons.some((r) => r.startsWith('EVIDENCE_SUFFICIENT'))).toBe(true);
  });

  it('a WINNER verdict on OBSERVATIONAL evidence alone is refused with EVIDENCE_STRENGTH', () => {
    const result = canPromoteToWinnerRecord({ adjudicationVerdict: 'WINNER', inventory: [{ evidenceClass: asEvidenceClass('OBSERVATIONAL'), observationCount: 5 }] });
    expect(result.outcome).toBe('NO_PROMOTION');
    expect(result.reasons.some((r) => r.startsWith('EVIDENCE_STRENGTH'))).toBe(true);
  });

  it('a NO_WINNER adjudication verdict is refused regardless of evidence volume', () => {
    const result = canPromoteToWinnerRecord({ adjudicationVerdict: 'NO_WINNER', inventory: [{ evidenceClass: 'DIRECT_RANDOMISED', observationCount: 99 }] });
    expect(result.outcome).toBe('NO_PROMOTION');
  });
});

describe('6. lineage classification (brief §9) — never conflates novelty with lineage level', () => {
  it('the frozen baseline classifies as A_BASELINE', () => {
    const fp = H('baseline-id');
    expect(classifyLineage(fp, { baseline: fp, retrieved: new Set(), initial: new Set(), mutated: new Set(), symbolic: new Set() })).toBe('A_BASELINE');
  });

  it('a fixed-set molecule classifies as B_RETRIEVED, never counted as a true discovery', () => {
    const fp = H('retrieved-id');
    const lineage = classifyLineage(fp, { baseline: H('other'), retrieved: new Set([fp]), initial: new Set(), mutated: new Set(), symbolic: new Set() });
    expect(lineage).toBe('B_RETRIEVED');
    expect(noveltyLevelFromLineage(lineage)).toBe(0);
  });

  it('a real dose stratum classifies as C_INITIAL_SPACE, genuinely absent from the fixed retrieval list', () => {
    const fp = H('dose-stratum-id');
    const lineage = classifyLineage(fp, { baseline: H('other'), retrieved: new Set(), initial: new Set([fp]), mutated: new Set(), symbolic: new Set() });
    expect(lineage).toBe('C_INITIAL_SPACE');
    expect(isTrueDiscoveryBest({ lineage } as ChallengeCandidate)).toBe(true);
  });

  it('isTrueDiscoveryBest is false for both the baseline and a retrieved candidate, true otherwise', () => {
    expect(isTrueDiscoveryBest({ lineage: 'A_BASELINE' } as ChallengeCandidate)).toBe(false);
    expect(isTrueDiscoveryBest({ lineage: 'B_RETRIEVED' } as ChallengeCandidate)).toBe(false);
    expect(isTrueDiscoveryBest(null)).toBe(false);
    expect(isTrueDiscoveryBest({ lineage: 'C_INITIAL_SPACE' } as ChallengeCandidate)).toBe(true);
  });
});

describe('7. baseline freeze — real, provenanced, frozen before any candidate is scored', () => {
  it('the D062 baseline freeze round-trips and detects tampering', () => {
    const b = baseline();
    const frozen = freezeBaseline(b, '1970-01-01T00:00:00Z');
    expect(verifyBaselineFrozen(b, frozen)).toBe(true);
    expect(verifyBaselineFrozen({ ...b, fingerprint: 'tampered' }, frozen)).toBe(false);
  });

  it('the baseline fingerprint is a real function of its own fields, not a random id', () => {
    const { fingerprint, ...withoutFingerprint } = baseline();
    expect(makeBaselineFingerprint(withoutFingerprint)).toBe(fingerprint);
  });
});

describe("8. evaluateBetter — the frozen conjunction, never evaluated on the baseline's own evidence", () => {
  it("refuses a candidate whose OWN observationCount is below the rule's minimum even if the baseline's evidence is strong", () => {
    const rule = D062_BETTER_RULE;
    const candidate = { candidateId: 'x', label: 'x', mechanism: 'm', efficacy: 5, harm: -5, evidenceRefs: ['a'], evidenceClass: 'DIRECT_RANDOMISED' as const, observationCount: 1, lineage: 'C_INITIAL_SPACE' as const, hypothesisRef: null, modelFingerprint: null, predictionRefs: [], falsificationCriterionRef: null, candidateFingerprint: 'x' };
    const result = evaluateBetter(rule, D062_BASELINE, candidate, 1);
    expect(result.better).toBe(false);
    expect(result.reasons.some((r) => r.includes('observations'))).toBe(true);
  });

  it('a candidate that clears efficacy/harm/volume/strength is accepted', () => {
    const rule = D062_BETTER_RULE;
    const candidate = { candidateId: 'x', label: 'x', mechanism: 'm', efficacy: 0.5, harm: -0.5, evidenceRefs: ['a', 'b', 'c'], evidenceClass: 'DIRECT_RANDOMISED' as const, observationCount: 3, lineage: 'C_INITIAL_SPACE' as const, hypothesisRef: null, modelFingerprint: null, predictionRefs: [], falsificationCriterionRef: null, candidateFingerprint: 'x' };
    const result = evaluateBetter(rule, D062_BASELINE, candidate, 3);
    expect(result.better).toBe(true);
    expect(result.reasons).toEqual([]);
  });
});

describe('9. an L2 interpolated-dose candidate can never be promoted (brief §9)', () => {
  it('interpolatedCandidate() carries zero real observations', () => {
    const { ports } = createD062Ports();
    const interpolated = ports.interpolatedCandidate();
    expect(interpolated).not.toBeNull();
    expect(interpolated!.observationCount).toBe(0);
    expect(interpolated!.evidenceRefs).toEqual([]);
  });

  it('a zero-observation candidate is refused by the D-057 gate outright', () => {
    const result = canPromoteToWinnerRecord({ adjudicationVerdict: 'WINNER', inventory: [{ evidenceClass: 'DIRECT_RANDOMISED', observationCount: 0 }] });
    expect(result.outcome).toBe('NO_PROMOTION');
  });
});

describe('10. the real safety veto still fires through the unmodified falsifyCandidate path', () => {
  it('every real dose stratum is eliminated by hardFilterAndRank on today\'s pinned data, and every elimination names a real reason', () => {
    const { ports } = createD062Ports();
    const retrieved = ports.retrievedCandidates();
    const generated = ports.generatedCandidates();
    const { qualifying, eliminated } = ports.hardFilterAndRank([...retrieved, ...generated]);
    const doseIds = generated.map((c) => c.candidateId);
    const eliminatedDoseIds = eliminated.filter((e) => doseIds.includes(e.candidateId));
    // Disclosed, real finding (D-062): on the pinned SURPASS-2 data, the
    // existential safety veto that already excludes full-dose tirzepatide
    // from the A2 fixed space also fires at every measured dose stratum —
    // this assertion is a REGRESSION GUARD on that real result, not a
    // hand-picked expectation.
    expect(eliminatedDoseIds.length).toBe(doseIds.length);
    for (const e of eliminatedDoseIds) expect(e.reason.length).toBeGreaterThan(0);
    expect(qualifying.length).toBeGreaterThanOrEqual(2);
  });
});

describe('11. three rounds produce three genuinely different pairs (brief §8)', () => {
  it('round rotation over 0/1/2 visits three distinct TOP2 pairs on the real pool', () => {
    const problem = parseProblem('TEST-D062', { text: 't', objectives: [{ metric: 'efficacy', direction: 'maximize' }], evidenceMinimum: 'x', harmAxes: [] }, H);
    const pairs: string[] = [];
    for (let round = 0; round < 3; round += 1) {
      const { ports } = createD062Ports();
      const bundle = createChallengeAdapters({ ports, baselineCandidateId: D062_BASELINE.baselineId, excludedFingerprints: new Set(), custodyRefs: [], problemFingerprintForRecipe: 'p', researchStateHeadForRecipe: 'h', topPairRotation: round });
      runScientificDiscovery(problem, bundle.adapters, 'SYNTHETIC_TEST_ONLY');
      pairs.push(bundle.diagnostics.lastTop2().map((c) => c.candidateId).sort().join('+'));
    }
    expect(new Set(pairs).size).toBe(3);
  });
});

describe('12. the research state chain is real and tamper-evident', () => {
  it('a real SYNTHETIC_TEST_ONLY run produces a chain-verified audit trail', async () => {
    const result = await runD062Discovery({ mode: 'SYNTHETIC_TEST_ONLY', maxRounds: 3 });
    expect(result.kind).toBe('RUN');
    if (result.kind === 'RUN') {
      expect(result.auditFingerprint.length).toBeGreaterThan(0);
      expect(result.rounds.length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('13. replay determinism — two runs, identical audit and recipe fingerprints', () => {
  it('SYNTHETIC_TEST_ONLY replays identically', async () => {
    const replay = await replayD062Discovery({ mode: 'SYNTHETIC_TEST_ONLY', maxRounds: 3 });
    expect(replay.ok).toBe(true);
  });

  it('PRODUCTION replays identically (custody-verified real evidence)', async () => {
    const replay = await replayD062Discovery({ mode: 'PRODUCTION', maxRounds: 3 });
    expect(replay.ok).toBe(true);
  }, 20000);
});

describe('14. THE KEY PROPERTY — never manufacture a WINNER; NO_WINNER is a real, honest, complete result', () => {
  it('the real PRODUCTION run over pinned SURPASS-2 data completes with an honest, non-empty verdict and blocker list', async () => {
    const result = await runD062Discovery({ mode: 'PRODUCTION', maxRounds: 3 });
    expect(result.kind).toBe('RUN');
    if (result.kind !== 'RUN') return;
    expect(['WINNER', 'NO_WINNER', 'CONFLICTING_EVIDENCE', 'INSUFFICIENT_EVIDENCE', 'ABORTED']).toContain(result.verdict);
    if (result.verdict !== 'WINNER') {
      expect(result.winnerRecord).toBeNull();
      expect(result.recipeFingerprint).toBeNull();
      expect(result.blockers.length).toBeGreaterThan(0);
      expect(result.nextExperiment.length).toBeGreaterThan(0);
    } else {
      // If evidence ever legitimately clears every conjunct, a WINNER must
      // carry a real recipe fingerprint — never a WINNER label alone.
      expect(result.winnerRecord).not.toBeNull();
      expect(result.recipeFingerprint).not.toBeNull();
      expect(result.wasAbsentFromFixedSet).toBe(true);
    }
  });

  it('falsification coverage is reported honestly as executed/available, never claimed as the full 13/13 battery', async () => {
    const result = await runD062Discovery({ mode: 'SYNTHETIC_TEST_ONLY', maxRounds: 1 });
    if (result.kind !== 'RUN') return;
    expect(result.falsification.executedProbes).toBeLessThanOrEqual(result.falsification.availableProbes);
    expect(result.falsification.availableProbes).toBe(13);
  });

  it('the prior-art axis reports NO_ACCESS and claims no novelty', async () => {
    const result = await runD062Discovery({ mode: 'SYNTHETIC_TEST_ONLY', maxRounds: 1 });
    if (result.kind !== 'RUN') return;
    expect(result.priorArtAxis).toContain('NO_ACCESS');
  });
});

describe('15. no banned string in any run output', () => {
  it('the real PRODUCTION run text contains no banned claim (word-boundary scan, so "safety" never false-positives on "safe")', async () => {
    const result = await runD062Discovery({ mode: 'PRODUCTION', maxRounds: 3 });
    if (result.kind !== 'RUN') return;
    const text = JSON.stringify(result);
    expect(scanForBannedStrings(text, 'en')).toEqual([]);
    expect(scanForBannedStrings(text, 'pl')).toEqual([]);
  }, 20000);
});

describe("16. existing D-058/D-059 LOWER-HARM anchors are untouched by this work", () => {
  it('the real funnel TOP2 is still the native GLP-1 / liraglutide pair this challenge itself observes in round 0', async () => {
    const result = await runD062Discovery({ mode: 'SYNTHETIC_TEST_ONLY', maxRounds: 1 });
    if (result.kind !== 'RUN') return;
    expect(result.rounds[0]?.experimentLabels).toEqual(['d062::CHEMBL1240772', 'd062::CHEMBL4084119']);
  });
});
