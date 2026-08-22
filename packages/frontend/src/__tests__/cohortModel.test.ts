import { describe, expect, it } from 'vitest';
import {
  NEUTRAL_COHORT_PROFILE,
  COHORT_VARIABLES,
  COHORT_NOT_MODELED,
  AGE_BANDS,
  bandOfAge,
  defineCohortProfile,
  differentiatesCohorts,
  contactMultiplierFor,
  susceptibilityFor,
  severityFor,
  fatalityFor,
} from '../core/agents/cohortModel';
import { runScenario, replayScenario, SCENARIOS } from '../core/simulation/scenarioEngine';
import type { SimAgent } from '../core/simulation/types';

const agent = (age: number): SimAgent => ({
  id: 1, x: 0, y: 0, vx: 0, vy: 0, goalX: 0, goalY: 0,
  state: 'S', stateSince: 0, isolated: false, behavior: 'dom', infectedBy: -1, age,
});

const RUN = { days: 60, stepsPerDay: 4, baseParams: { nAgents: 260, initialInfected: 5, seed: 4242, severeRate: 0.2 } };

/** Profil ilustracyjny — mnożniki BEZ źródła, wyłącznie do analizy „co, jeśli". */
const illustrative = defineCohortProfile('age-gradient-illustrative', {
  severityMultiplier: { child: 0.2, adult: 1, senior: 4 },
  fatalityMultiplier: { child: 0.1, adult: 1, senior: 6 },
});

describe('Cohort model — every variable declares where it comes from', () => {
  it('each variable states SOURCE, ASSUMPTION, PARAMETER and PROVENANCE', () => {
    expect(COHORT_VARIABLES.length).toBeGreaterThan(0);
    for (const v of COHORT_VARIABLES) {
      expect(v.source.length).toBeGreaterThan(20);
      expect(v.assumption.length).toBeGreaterThan(20);
      expect(v.parameter).toMatch(/\d|\.\./);
      expect(['STRUCTURAL', 'REQUIRES_CALIBRATION', 'NOT_MODELED']).toContain(v.provenance);
    }
  });

  it('no clinical quantity is claimed as known — all of them need calibration', () => {
    for (const id of ['susceptibilityMultiplier', 'severityMultiplier', 'fatalityMultiplier', 'contactWeight']) {
      const v = COHORT_VARIABLES.find((x) => x.id === id)!;
      expect(v.provenance).toBe('REQUIRES_CALIBRATION');
      expect(v.source).toContain('BRAK');
    }
    // Podział na pasma i mechanika ochrony wynikają z budowy modelu, nie z danych.
    expect(COHORT_VARIABLES.find((v) => v.id === 'ageBand')!.provenance).toBe('STRUCTURAL');
    expect(COHORT_VARIABLES.find((v) => v.id === 'shielding')!.provenance).toBe('STRUCTURAL');
  });

  it('declares what population structure it does not model', () => {
    expect(COHORT_NOT_MODELED).toContain('household-structure');
    expect(COHORT_NOT_MODELED).toContain('comorbidities');
    expect(COHORT_NOT_MODELED).toContain('vaccine-efficacy');
    expect(COHORT_NOT_MODELED).toContain('age-specific-contact-matrix');
  });

  it('the neutral profile asserts nothing — every multiplier is exactly 1', () => {
    for (const band of AGE_BANDS) {
      expect(NEUTRAL_COHORT_PROFILE.susceptibilityMultiplier[band]).toBe(1);
      expect(NEUTRAL_COHORT_PROFILE.severityMultiplier[band]).toBe(1);
      expect(NEUTRAL_COHORT_PROFILE.fatalityMultiplier[band]).toBe(1);
      expect(NEUTRAL_COHORT_PROFILE.contactWeight[band]).toBe(1);
    }
    expect(NEUTRAL_COHORT_PROFILE.shieldedBands).toEqual([]);
    expect(differentiatesCohorts(NEUTRAL_COHORT_PROFILE)).toBe(false);
  });

  it('a profile without a cited source is marked REQUIRES_CALIBRATION and says so', () => {
    expect(illustrative.calibration).toBe('REQUIRES_CALIBRATION');
    expect(illustrative.provenanceNote).toContain('nie uprawnia do twierdzeń');
    expect(differentiatesCohorts(illustrative)).toBe(true);
  });

  it('a profile with a cited source is marked USER_SUPPLIED and keeps the citation', () => {
    const cited = defineCohortProfile(
      'from-study',
      { fatalityMultiplier: { child: 0.1, adult: 1, senior: 5 } },
      { calibrated: true, provenanceNote: 'Wartości z tabeli 2 opracowania dostarczonego przez badacza.' },
    );
    expect(cited.calibration).toBe('USER_SUPPLIED');
    expect(cited.provenanceNote).toContain('tabeli 2');
  });

  it('a profile that changes nothing stays NEUTRAL however it is named', () => {
    expect(defineCohortProfile('pretend', { contactWeight: { child: 1, adult: 1, senior: 1 } }).calibration).toBe('NEUTRAL');
  });
});

describe('Cohort model — band assignment and multipliers', () => {
  it('assigns bands by the declared boundaries', () => {
    expect(bandOfAge(8)).toBe('child');
    expect(bandOfAge(19)).toBe('child');
    expect(bandOfAge(20)).toBe('adult');
    expect(bandOfAge(64)).toBe('adult');
    expect(bandOfAge(65)).toBe('senior');
    expect(bandOfAge(91)).toBe('senior');
  });

  it('an agent with no age falls back to adult rather than being dropped', () => {
    expect(bandOfAge(undefined)).toBe('adult');
    expect(bandOfAge(Number.NaN)).toBe('adult');
  });

  it('the boundaries are a parameter, not a fixed truth', () => {
    const shifted = defineCohortProfile('shifted', { ageBandBounds: { childMaxAge: 12, seniorMinAge: 50 } });
    expect(bandOfAge(15, shifted.ageBandBounds)).toBe('adult');
    expect(bandOfAge(55, shifted.ageBandBounds)).toBe('senior');
  });

  it('the neutral profile returns 1 for every agent and every multiplier', () => {
    for (const age of [8, 35, 80]) {
      const a = agent(age);
      expect(susceptibilityFor(a, NEUTRAL_COHORT_PROFILE)).toBe(1);
      expect(severityFor(a, NEUTRAL_COHORT_PROFILE)).toBe(1);
      expect(fatalityFor(a, NEUTRAL_COHORT_PROFILE)).toBe(1);
      expect(contactMultiplierFor(a, NEUTRAL_COHORT_PROFILE)).toBe(1);
    }
  });

  it('a calibrated profile applies the multiplier of the agent band', () => {
    expect(severityFor(agent(8), illustrative)).toBe(0.2);
    expect(severityFor(agent(35), illustrative)).toBe(1);
    expect(severityFor(agent(80), illustrative)).toBe(4);
    expect(fatalityFor(agent(80), illustrative)).toBe(6);
  });

  it('shielding reduces contact only for the targeted band', () => {
    const shielded = defineCohortProfile('shield-seniors', { shieldedBands: ['senior'], shieldingEffectiveness: 0.75 });
    expect(contactMultiplierFor(agent(80), shielded)).toBeCloseTo(0.25, 10);
    expect(contactMultiplierFor(agent(35), shielded)).toBe(1);
    expect(contactMultiplierFor(agent(8), shielded)).toBe(1);
  });

  it('shielding with zero effectiveness changes nothing and is not a difference', () => {
    const inert = defineCohortProfile('inert', { shieldedBands: ['senior'], shieldingEffectiveness: 0 });
    expect(contactMultiplierFor(agent(80), inert)).toBe(1);
    expect(differentiatesCohorts(inert)).toBe(false);
  });
});

describe('Cohort model — the neutral profile changes nothing in the model', () => {
  it('a run with the explicit neutral profile is bit-identical to one without', () => {
    const plain = runScenario('BASELINE', RUN);
    const neutral = runScenario('BASELINE', { ...RUN, baseCohort: NEUTRAL_COHORT_PROFILE });
    expect(neutral.resultFingerprint).toBe(plain.resultFingerprint);
    expect(neutral.epidemicFingerprint).toBe(plain.epidemicFingerprint);
    expect(neutral.inputFingerprint).toBe(plain.inputFingerprint);
    expect(neutral.series).toEqual(plain.series);
  });

  it('under the neutral profile age does not drive severity — and the model says so by not differing', () => {
    const bands = runScenario('BASELINE', RUN).summary!.byBand;
    // Wszystkie pasma dzieli ten sam globalny severeRate; udziały mogą się różnić
    // tylko losowo, nie systematycznie — żadne nie odstaje wielokrotnie.
    const shares = AGE_BANDS.map((b) => bands[b].severeShareOfInfected).filter((v) => v > 0);
    expect(Math.max(...shares) / Math.min(...shares)).toBeLessThan(2.5);
  });

  it('a calibrated profile really does change the outcome', () => {
    const plain = runScenario('BASELINE', RUN);
    const calibrated = runScenario('BASELINE', { ...RUN, baseCohort: illustrative });
    expect(calibrated.resultFingerprint).not.toBe(plain.resultFingerprint);
    expect(calibrated.inputFingerprint).not.toBe(plain.inputFingerprint);
    const bands = calibrated.summary!.byBand;
    // Gradient wieku wprowadzony przez profil musi być widoczny w wyniku.
    expect(bands.senior.severeShareOfInfected).toBeGreaterThan(bands.child.severeShareOfInfected * 3);
    expect(bands.senior.caseFatalityOfInfected).toBeGreaterThan(bands.child.caseFatalityOfInfected);
  });

  it('a run carries its cohort profile and reproduces exactly', () => {
    const run = runScenario('PROTECT_SENIORS', { ...RUN, baseCohort: illustrative });
    expect(run.cohort.shieldedBands).toEqual(['senior']);
    expect(run.cohort.severityMultiplier.senior).toBe(4);
    expect(replayScenario(run).status).toBe('MATCH');
  });
});

describe('Cohort model — per-band outcome metrics', () => {
  it('band populations add up to the whole population', () => {
    const s = runScenario('BASELINE', RUN).summary!;
    expect(AGE_BANDS.reduce((n, b) => n + s.byBand[b].population, 0)).toBe(s.population);
  });

  it('band deaths add up to total deaths', () => {
    const s = runScenario('BASELINE', RUN).summary!;
    expect(AGE_BANDS.reduce((n, b) => n + s.byBand[b].deaths, 0)).toBe(s.totalDeaths);
  });

  it('nobody is counted as infected who was not, and shares stay in range', () => {
    const s = runScenario('BASELINE', RUN).summary!;
    for (const band of AGE_BANDS) {
      const o = s.byBand[band];
      expect(o.infected).toBeLessThanOrEqual(o.population);
      expect(o.deaths).toBeLessThanOrEqual(o.infected);
      expect(o.attackRate).toBeGreaterThanOrEqual(0);
      expect(o.attackRate).toBeLessThanOrEqual(1);
      expect(o.severeShareOfInfected).toBeLessThanOrEqual(1);
      expect(o.caseFatalityOfInfected).toBeLessThanOrEqual(1);
    }
  });

  it('an empty band reports zero shares instead of dividing by zero', () => {
    const s = runScenario('BASELINE', { ...RUN, baseParams: { ...RUN.baseParams, initialInfected: 1 }, days: 1 }).summary!;
    for (const band of AGE_BANDS) {
      expect(Number.isFinite(s.byBand[band].attackRate)).toBe(true);
      expect(Number.isFinite(s.byBand[band].caseFatalityOfInfected)).toBe(true);
    }
  });
});

describe('Cohort model — priority protection scenarios', () => {
  it('protection is contact reduction, and the model refuses to call it vaccination', () => {
    expect(SCENARIOS.PROTECT_SENIORS.rationale).toContain('nie jest szczepienie');
    expect(SCENARIOS.VACCINATION.notModeledReason).toContain('OCHRONA PRIORYTETOWA');
    expect(SCENARIOS.VACCINATION.notModeledReason).toContain('nie wolno jej opisywać jako szczepień');
  });

  it('each protection scenario shields exactly its own band', () => {
    expect(SCENARIOS.PROTECT_SENIORS.cohortOverrides!.shieldedBands).toEqual(['senior']);
    expect(SCENARIOS.PROTECT_CHILDREN.cohortOverrides!.shieldedBands).toEqual(['child']);
    expect(SCENARIOS.PROTECT_ADULTS.cohortOverrides!.shieldedBands).toEqual(['adult']);
  });

  it('shielding a band really lowers that band exposure', () => {
    const plain = runScenario('BASELINE', RUN).summary!.byBand;
    const shielded = runScenario('PROTECT_SENIORS', RUN).summary!.byBand;
    expect(shielded.senior.attackRate).toBeLessThan(plain.senior.attackRate);
  });

  it('protection scenarios leave the epidemic parameters untouched', () => {
    const plain = runScenario('BASELINE', RUN);
    const shielded = runScenario('PROTECT_SENIORS', RUN);
    expect(shielded.params).toEqual(plain.params);
    expect(shielded.hospitalCapacity).toEqual(plain.hospitalCapacity);
    // Różni je wyłącznie profil kohortowy.
    expect(shielded.cohort.shieldedBands).not.toEqual(plain.cohort.shieldedBands);
  });
});
