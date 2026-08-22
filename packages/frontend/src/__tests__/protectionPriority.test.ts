import { describe, expect, it } from 'vitest';
import { runProtectionPriorityStudy, PROTECTION_OBJECTIVES, PROTECTION_SCENARIOS } from '../core/discovery/protectionPriority';
import { defineCohortProfile } from '../core/agents/cohortModel';
import { runDiscoveryCase } from '../core/discovery';

const ic = { nAgents: 260, initialInfected: 5, seed: 4242, days: 60, stepsPerDay: 4 };

const illustrative = defineCohortProfile('age-gradient-illustrative', {
  severityMultiplier: { child: 0.2, adult: 1, senior: 4 },
  fatalityMultiplier: { child: 0.1, adult: 1, senior: 6 },
});

const study = (over = {}) => runProtectionPriorityStudy({
  question: 'Kogo chronić najpierw?',
  initialConditions: ic,
  baseParams: { severeRate: 0.2 },
  ...over,
});

describe('Who to protect first — every candidate is a fully evidenced case', () => {
  it('runs each protection option as its own discovery case against one reference', () => {
    const s = study({ cohort: illustrative });
    expect(s.status).toBe('COMPLETED');
    expect(s.candidates).toHaveLength(PROTECTION_SCENARIOS.length);
    for (const c of s.candidates) {
      expect(c.case.arms).toHaveLength(2);
      expect(c.case.arms[0].scenario).toBe('BASELINE');
      expect(c.case.arms[1].scenario).toBe(c.scenario);
      expect(c.case.comparison!.controlledDifference).toBe('priority-protection');
      expect(c.case.replay!.status).toBe('MATCH');
      expect(c.case.evidence!.missingFields).toEqual([]);
    }
  });

  it('all candidates share the seed, the population and the reference arm', () => {
    const s = study({ cohort: illustrative });
    const references = s.candidates.map((c) => c.case.arms[0].run.resultFingerprint);
    // Identyczne ramię odniesienia dla każdego kandydata — inaczej ranking
    // porównywałby różne światy.
    expect(new Set(references).size).toBe(1);
    for (const c of s.candidates) expect(c.case.seed).toBe(ic.seed);
  });

  it('ranks separately for each objective, because the answer depends on it', () => {
    const s = study({ cohort: illustrative });
    for (const objective of PROTECTION_OBJECTIVES) {
      const ranking = s.rankingByObjective[objective];
      expect(ranking).toHaveLength(3);
      for (let i = 1; i < ranking.length; i++) expect(ranking[i].value).toBeGreaterThanOrEqual(ranking[i - 1].value);
      expect(ranking[0].rank).toBe(1);
    }
  });

  it('reports the real conflict: fewest deaths and lowest peak are different policies', () => {
    const s = study({ cohort: illustrative });
    expect(s.winnerByObjective.totalDeaths).toBe('PROTECT_SENIORS');
    expect(s.winnerByObjective.peakInfectious).toBe('PROTECT_ADULTS');
    expect(s.winnerByObjective.deaths_senior).toBe('PROTECT_SENIORS');
    expect(s.conflictNote).toContain('nie wnioskiem z samego modelu');
  });

  it('every ranked value is measured against the same reference run', () => {
    const s = study({ cohort: illustrative });
    for (const objective of PROTECTION_OBJECTIVES) {
      const ranking = s.rankingByObjective[objective];
      expect(new Set(ranking.map((r) => r.referenceValue)).size).toBe(1);
      for (const entry of ranking) expect(entry.delta).toBeCloseTo(entry.value - entry.referenceValue, 10);
    }
  });

  it('protecting seniors genuinely cuts deaths under this calibration', () => {
    const s = study({ cohort: illustrative });
    const deaths = s.rankingByObjective.totalDeaths;
    expect(deaths[0].value).toBeLessThan(deaths[0].referenceValue);
    const seniors = s.candidates.find((c) => c.scenario === 'PROTECT_SENIORS')!;
    expect(seniors.case.conclusion!.verdict).toBe('SUPPORTED');
  });

  it('the answer changes with the calibration — and the neutral profile gives a different one', () => {
    const calibrated = study({ cohort: illustrative });
    const neutral = study();
    expect(neutral.status).toBe('COMPLETED');
    expect(neutral.winnerByObjective.totalDeaths).not.toBe(calibrated.winnerByObjective.totalDeaths);
    // Bez gradientu wieku ochrona seniorów nie ratuje życia — model tego nie ukrywa.
    const seniors = neutral.candidates.find((c) => c.scenario === 'PROTECT_SENIORS')!;
    expect(seniors.case.conclusion!.verdict).toBe('NOT_SUPPORTED');
  });

  it('carries the cohort provenance into the study limitations', () => {
    const calibrated = study({ cohort: illustrative });
    expect(calibrated.cohortCalibration).toBe('REQUIRES_CALIBRATION');
    expect(calibrated.limitations.join(' ')).toContain('REQUIRES_CALIBRATION');
    expect(calibrated.limitations.join(' ')).toContain('co, jeśli');

    const neutral = study();
    expect(neutral.cohortCalibration).toBe('NEUTRAL');
    expect(neutral.limitations.join(' ')).toContain('NEUTRALNY');
  });

  it('states that protection here is contact reduction, not immunity', () => {
    expect(study().limitations.join(' ')).toContain('Nie jest szczepieniem');
  });

  it('is deterministic', () => {
    const a = study({ cohort: illustrative });
    const b = study({ cohort: illustrative });
    expect(b.studyId).toBe(a.studyId);
    expect(b.rankingByObjective).toEqual(a.rankingByObjective);
  });

  it('a different cohort profile is a different study', () => {
    expect(study({ cohort: illustrative }).studyId).not.toBe(study().studyId);
  });
});

describe('Who to protect first — no rank without evidence', () => {
  it('refuses a candidate whose case cannot be compared, naming the reason', () => {
    const s = study({ cohort: illustrative, candidates: ['PROTECT_SENIORS', 'VACCINATION'] });
    const rejected = s.candidates.find((c) => c.scenario === 'VACCINATION')!;
    expect(rejected.admitted).toBe(false);
    expect(rejected.rejectionReason).toBeTruthy();
    // Odrzucony kandydat nie pojawia się w żadnym rankingu.
    for (const objective of PROTECTION_OBJECTIVES) {
      expect(s.rankingByObjective[objective].map((r) => r.scenario)).not.toContain('VACCINATION');
    }
  });

  it('blocks the whole study when nothing survives the evidence gate', () => {
    const s = study({ candidates: ['VACCINATION', 'TRANSPORT_REDUCTION'] });
    expect(s.status).toBe('BLOCKED_NO_ADMITTED_CANDIDATE');
    expect(s.winnerByObjective.totalDeaths).toBeNull();
    expect(s.rankingByObjective.totalDeaths).toEqual([]);
    expect(s.message).toContain('bramki dowodowej');
  });

  it('refuses a self-comparison that has no controlled difference', () => {
    const s = study({ candidates: ['BASELINE'] });
    expect(s.status).toBe('BLOCKED_NO_ADMITTED_CANDIDATE');
    expect(s.candidates[0].rejectionReason).toContain('NO_CONTROLLED_DIFFERENCE');
  });

  it('each admitted candidate would pass the discovery gate on its own', () => {
    for (const c of study({ cohort: illustrative }).candidates) {
      const standalone = runDiscoveryCase({
        question: 'kontrola',
        hypothesis: c.case.hypothesis,
        baselineScenario: 'BASELINE',
        variantScenario: c.scenario,
        initialConditions: ic,
        baseParams: { severeRate: 0.2 },
        cohort: illustrative,
      });
      expect(standalone.runFingerprint).toBe(c.case.runFingerprint);
    }
  });
});
