import { describe, expect, it } from 'vitest';
import { runDiscoveryCase, runFollowUp, isRunnable, runInterventionTimingSweep } from '../core/discovery';
import { runScenario, replayScenario } from '../core/simulation/scenarioEngine';
import type { DiscoveryCaseSpec } from '../core/discovery';

const ic = { nAgents: 160, initialInfected: 5, seed: 777, days: 40, stepsPerDay: 4 };

const spec = (over: Partial<DiscoveryCaseSpec> = {}): DiscoveryCaseSpec => ({
  question: 'Czy izolacja objawowych obniża szczyt zakażeń?',
  hypothesis: {
    statement: 'Izolacja objawowych obniża szczytową liczbę zakaźnych.',
    falsification: { metric: 'peakInfectious', relation: 'less-than', rationale: 'Izolacja usuwa zakaźnych z obiegu kontaktów.' },
    assumptions: [],
  },
  baselineScenario: 'BASELINE',
  variantScenario: 'ISOLATION',
  initialConditions: ic,
  ...over,
});

describe('Intervention timing — the model can start a policy mid-run', () => {
  const timed = (day: number) => runScenario('ISOLATION', {
    days: 40, stepsPerDay: 4, baseParams: { nAgents: 160, initialInfected: 5, seed: 777 }, interventionStartDay: day,
  });

  it('a later start gives a genuinely different, higher peak', () => {
    const early = timed(0);
    const late = timed(20);
    expect(early.resultFingerprint).not.toBe(late.resultFingerprint);
    expect(late.summary!.peakInfectious).toBeGreaterThan(early.summary!.peakInfectious);
  });

  it('a timed run reproduces exactly — the pre-intervention state is recorded, not guessed', () => {
    for (const day of [0, 5, 12, 25]) {
      const run = timed(day);
      expect(run.interventionStartDay).toBe(day);
      expect(replayScenario(run).status).toBe('MATCH');
    }
  });

  it('timing a scenario with no intervention changes nothing', () => {
    const base = runScenario('BASELINE', { days: 40, stepsPerDay: 4, baseParams: { nAgents: 160, initialInfected: 5, seed: 777 } });
    const timedBase = runScenario('BASELINE', { days: 40, stepsPerDay: 4, baseParams: { nAgents: 160, initialInfected: 5, seed: 777 }, interventionStartDay: 10 });
    expect(timedBase.resultFingerprint).toBe(base.resultFingerprint);
  });

  it('refuses to start a structural change mid-run', () => {
    const run = runScenario('ISOLATION', {
      days: 20, stepsPerDay: 4,
      baseParams: { nAgents: 160, initialInfected: 5, seed: 777 },
      overrideParams: { nAgents: 400 },
      interventionStartDay: 5,
    });
    expect(run.status).toBe('NOT_MODELED');
    expect(run.notModeledReason).toContain('strukturalnych');
  });

  it('a timing sweep runs one real simulation per start day', () => {
    const sweep = runInterventionTimingSweep({
      question: 'Jak szczyt zależy od dnia rozpoczęcia izolacji?',
      scenario: 'ISOLATION',
      startDays: [0, 4, 10, 16, 24],
      initialConditions: ic,
    });
    expect(sweep.status).toBe('COMPLETED');
    expect(new Set(sweep.points.map((p) => p.runFingerprint)).size).toBe(5);
    const peak = sweep.monotonicity.find((m) => m.metric === 'peakInfectious')!;
    expect(peak.verdict).toBe('INCREASING');
    expect(peak.values[0]).toBeLessThan(peak.values[4]);
  });

  it('refuses a timing sweep on a scenario that introduces no intervention', () => {
    const sweep = runInterventionTimingSweep({
      question: 'q', scenario: 'BASELINE', startDays: [0, 5, 10], initialConditions: ic,
    });
    expect(sweep.status).toBe('BLOCKED_INVALID_PARAMETER');
    expect(sweep.message).toContain('nie wprowadza żadnej interwencji');
  });

  it('rejects a start day outside the run horizon', () => {
    const sweep = runInterventionTimingSweep({
      question: 'q', scenario: 'ISOLATION', startDays: [0, 10, 500], initialConditions: ic,
    });
    expect(sweep.points[2].status).toBe('INVALID_VALUE');
    expect(sweep.points[2].summary).toBeNull();
  });
});

describe('Follow-up engine — the next experiment is an input, not a sentence', () => {
  it('proposes follow-ups grounded in what this case actually found', () => {
    const c = runDiscoveryCase(spec());
    expect(c.followUp.length).toBeGreaterThan(0);
    for (const f of c.followUp) {
      expect(f.question.length).toBeGreaterThan(10);
      expect(f.rationale.length).toBeGreaterThan(20);
    }
  });

  it('always proposes replication, because the case ran a single seed', () => {
    const c = runDiscoveryCase(spec());
    const multi = c.followUp.find((f) => f.plan?.kind === 'multi-seed')!;
    expect(multi).toBeDefined();
    expect(multi.rationale).toContain('777');
    if (multi.plan?.kind === 'multi-seed') {
      expect(new Set(multi.plan.spec.seeds).size).toBe(multi.plan.spec.seeds.length);
      expect(multi.plan.spec.seeds).not.toContain(777);
    }
  });

  it('proposes the timing question when the lever is binary, and it really runs', () => {
    const c = runDiscoveryCase(spec());
    const timing = c.followUp.find((f) => f.plan?.kind === 'intervention-timing')!;
    expect(timing.question).toContain('rozpoczęcie izolacji');

    const run = runFollowUp(timing)!;
    expect(run.kind).toBe('intervention-timing');
    if (run.kind !== 'intervention-timing') throw new Error('unexpected kind');
    expect(run.sweep.status).toBe('COMPLETED');
    expect(run.sweep.points.every((p) => p.status === 'COMPLETED')).toBe(true);
    // Nowy, realny przebieg: każdy punkt ma własny odcisk.
    expect(new Set(run.sweep.points.map((p) => p.runFingerprint)).size).toBe(run.sweep.points.length);
  });

  it('the replication follow-up executes into real, differing seeds', () => {
    const c = runDiscoveryCase(spec());
    const run = runFollowUp(c.followUp.find((f) => f.plan?.kind === 'multi-seed')!)!;
    if (run.kind !== 'multi-seed') throw new Error('unexpected kind');
    expect(run.multiRun.status).toBe('COMPLETED');
    expect(run.multiRun.runs.every((r) => r.status === 'COMPLETED')).toBe(true);
    const peak = run.multiRun.dispersion.find((d) => d.metric === 'peakInfectious')!;
    expect(peak.distribution.length).toBe(run.multiRun.runs.length);
  });

  it('proposes a sweep to find where a continuous lever saturates', () => {
    const c = runDiscoveryCase(spec({ variantScenario: 'CONTACT_REDUCTION' }));
    const sweep = c.followUp.find((f) => f.plan?.kind === 'parameter-sweep')!;
    if (sweep.plan?.kind !== 'parameter-sweep') throw new Error('expected a sweep');
    expect(sweep.plan.spec.parameter).toBe('restrictions');
    const run = runFollowUp(sweep)!;
    if (run.kind !== 'parameter-sweep') throw new Error('unexpected kind');
    expect(run.sweep.status).toBe('COMPLETED');
    expect(run.sweep.points.filter((p) => p.status === 'COMPLETED').length).toBe(6);
  });

  it('proposes decomposing a bundled capacity change into its parts', () => {
    const c = runDiscoveryCase(spec({
      variantScenario: 'HEALTHCARE_EXPANSION',
      hypothesis: { ...spec().hypothesis, falsification: { metric: 'totalUnmetCareDays', relation: 'less-than', rationale: 'więcej łóżek to mniej dni bez opieki' } },
      hospitalCapacity: { totalBeds: 4, icuBeds: 1, icuShareOfAdmissions: 0.22 },
    }));
    const parameters = c.followUp
      .filter((f) => f.plan?.kind === 'parameter-sweep')
      .map((f) => (f.plan?.kind === 'parameter-sweep' ? f.plan.spec.parameter : ''));
    expect(parameters).toContain('totalBeds');
    expect(parameters).toContain('icuBeds');
    expect(c.followUp.find((f) => f.rationale.includes('pakiet'))).toBeDefined();
  });

  it('proposes untangling a confounded case before anything else', () => {
    const c = runDiscoveryCase(spec({ baselineScenario: 'ISOLATION', variantScenario: 'CONTACT_REDUCTION' }));
    expect(c.status).toBe('BLOCKED');
    const untangle = c.followUp.filter((f) => f.plan?.kind === 'scenario-comparison');
    expect(untangle.length).toBe(2);
    for (const f of untangle) {
      if (f.plan?.kind !== 'scenario-comparison') throw new Error('expected a comparison');
      expect(f.plan.spec.baselineScenario).toBe('BASELINE');
    }
    // Rozplątana wersja faktycznie przechodzi bramkę porównania.
    const rerun = runFollowUp(untangle[0])!;
    if (rerun.kind !== 'scenario-comparison') throw new Error('unexpected kind');
    expect(rerun.case.comparison!.status).toBe('COMPLETED');
  });

  it('proposes a capacity sweep only when the baseline actually ran out of beds', () => {
    const strained = runDiscoveryCase(spec({ hospitalCapacity: { totalBeds: 2, icuBeds: 0, icuShareOfAdmissions: 0.22 } }));
    expect(strained.arms[0].summary!.totalUnmetCareDays).toBeGreaterThan(0);
    expect(strained.followUp.some((f) => f.rationale.includes('zabrakło miejsca'))).toBe(true);

    const roomy = runDiscoveryCase(spec({ hospitalCapacity: { totalBeds: 500, icuBeds: 200, icuShareOfAdmissions: 0.22 } }));
    expect(roomy.arms[0].summary!.totalUnmetCareDays).toBe(0);
    expect(roomy.followUp.some((f) => f.rationale.includes('zabrakło miejsca'))).toBe(false);
  });

  it('states the questions this model cannot answer instead of promising them', () => {
    const c = runDiscoveryCase(spec());
    const blocked = c.followUp.filter((f) => !isRunnable(f));
    expect(blocked.length).toBeGreaterThan(0);
    for (const f of blocked) {
      expect(f.plan).toBeNull();
      expect(f.notModeledReason!.length).toBeGreaterThan(30);
      expect(runFollowUp(f)).toBeNull();
    }
    expect(blocked.some((f) => f.question.includes('Szczepienia'))).toBe(true);
  });

  it('a NOT_MODELED case still names the frontier it hit', () => {
    const c = runDiscoveryCase(spec({ variantScenario: 'VACCINATION' }));
    expect(c.status).toBe('NOT_MODELED');
    expect(c.followUp.length).toBeGreaterThan(0);
    expect(c.followUp.every((f) => f.plan === null)).toBe(true);
  });

  it('follow-up generation is deterministic', () => {
    expect(runDiscoveryCase(spec()).followUp).toEqual(runDiscoveryCase(spec()).followUp);
  });
});
