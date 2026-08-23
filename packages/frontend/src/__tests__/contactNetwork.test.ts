import { describe, expect, it } from 'vitest';
import {
  CONTACT_TYPES,
  CONTACT_TYPE_DECLARATIONS,
  CONTACT_TYPES_NOT_MODELED,
  CONTACT_GRAPH_PARAMETERS,
  CONTACT_NETWORK_NOT_MODELED,
  HOUSEHOLD_PROVENANCE_NOTE,
  classifyContact,
} from '../core/contacts/contactNetwork';
import {
  analyseTransmissionClusters,
  dominantContactType,
  shareIntoBand,
} from '../core/contacts/clusterAnalysis';
import { buildCity, buildingAt } from '../core/world/cityWorld';
import { runScenario, replayScenario, SCENARIOS } from '../core/simulation/scenarioEngine';
import { projectWorldState } from '../core/simulation/worldEngineContract';
import { EpidemicCitySimulation } from '../core/simulation/epidemicCity';
import { runDiscoveryCase } from '../core/discovery';

const RUN = { days: 60, stepsPerDay: 4, baseParams: { nAgents: 260, initialInfected: 5, seed: 4242, severeRate: 0.2 } };
const layout = buildCity();
const firstOf = (kind: string) => layout.buildings.findIndex((b) => b.kind === kind);
const centreOf = (i: number) => ({ x: layout.buildings[i].cx, y: layout.buildings[i].cy });

describe('Contact network — types are derived from the world, never guessed', () => {
  it('every contact type declares how it is established or why it cannot be', () => {
    for (const type of CONTACT_TYPES) {
      const declaration = CONTACT_TYPE_DECLARATIONS.find((d) => d.type === type);
      expect(declaration).toBeDefined();
      expect(declaration!.basis.length).toBeGreaterThan(30);
    }
  });

  it('work and transport are NOT_MODELED and never substituted for something else', () => {
    expect([...CONTACT_TYPES_NOT_MODELED].sort()).toEqual(['TRANSPORT', 'WORK']);
    for (const type of CONTACT_TYPES_NOT_MODELED) {
      expect(CONTACT_TYPE_DECLARATIONS.find((d) => d.type === type)!.basis).toMatch(/nie zawiera|nie ma/);
    }
  });

  it('classifies a contact by the building that contains it', () => {
    for (const [kind, expected] of [['school', 'SCHOOL'], ['shop', 'SHOP'], ['hospital', 'HEALTHCARE'], ['isolation', 'HEALTHCARE'], ['park', 'PUBLIC']] as const) {
      const i = firstOf(kind);
      const p = centreOf(i);
      expect(classifyContact(layout, p.x, p.y, 99, 98).contactType).toBe(expected);
    }
  });

  it('a contact outside every building is an outdoor contact, not an unknown one', () => {
    const c = classifyContact(layout, 2, 2, 99, 98);
    expect(c.contactType).toBe('OTHER');
    expect(c.locationKind).toBe('outdoor');
    expect(c.locationIndex).toBe(-1);
  });

  it('a home contact counts as HOUSEHOLD only for actual co-residents', () => {
    const home = firstOf('home');
    const p = centreOf(home);
    const together = classifyContact(layout, p.x, p.y, home, home);
    expect(together.contactType).toBe('HOUSEHOLD');
    expect(together.householdId).toBe(home);
    // Osoby z różnych gospodarstw w budynku mieszkalnym: model nie zna odwiedzin.
    const strangers = classifyContact(layout, p.x, p.y, home, home + 1);
    expect(strangers.contactType).toBe('UNKNOWN_CONTACT_TYPE');
    expect(strangers.householdId).toBeNull();
  });

  it('buildingAt resolves a point to at most one building', () => {
    const school = firstOf('school');
    const p = centreOf(school);
    expect(buildingAt(layout, p.x, p.y)).toBe(school);
    expect(buildingAt(layout, -50, -50)).toBe(-1);
  });

  it('every graph field declares its source, provenance and calibration status', () => {
    for (const field of ['source', 'target', 'location', 'contactType', 'time', 'transmissionProbability']) {
      const d = CONTACT_GRAPH_PARAMETERS.find((p) => p.field === field)!;
      expect(d).toBeDefined();
      expect(d.calibrationStatus).toBe('DERIVED_FROM_MODEL');
    }
    // Czas trwania i waga kontaktu nie istnieją w modelu i nie są podstawiane.
    for (const field of ['contactDurationDays', 'weight']) {
      const d = CONTACT_GRAPH_PARAMETERS.find((p) => p.field === field)!;
      expect(d.calibrationStatus).toBe('NOT_MODELED');
      expect(d.source).toContain('BRAK');
    }
  });

  it('declares that it has no contact matrix and no household demography', () => {
    expect(CONTACT_NETWORK_NOT_MODELED).toContain('age-specific-contact-matrix');
    expect(CONTACT_NETWORK_NOT_MODELED).toContain('household-demography');
    expect(CONTACT_NETWORK_NOT_MODELED).toContain('workplace-contacts');
    expect(CONTACT_NETWORK_NOT_MODELED).toContain('contact-duration');
  });
});

describe('Contact network — the transmission graph comes from real events', () => {
  const run = runScenario('BASELINE', RUN);

  it('records one edge per transmission with a resolvable type', () => {
    expect(run.transmissionGraph.length).toBeGreaterThan(0);
    for (const e of run.transmissionGraph) {
      expect(CONTACT_TYPES).toContain(e.contactType);
      expect(CONTACT_TYPES_NOT_MODELED).not.toContain(e.contactType);
      expect(e.source).not.toBe(e.target);
      expect(e.transmissionProbability).toBeGreaterThan(0);
      expect(e.transmissionProbability).toBeLessThanOrEqual(1);
      expect(e.stepDurationDays).toBeCloseTo(1 / RUN.stepsPerDay, 10);
    }
  });

  it('every edge target is infected exactly once — no double counting', () => {
    const targets = run.transmissionGraph.map((e) => e.target);
    expect(new Set(targets).size).toBe(targets.length);
  });

  it('edge time is inside the run horizon and non-decreasing', () => {
    const times = run.transmissionGraph.map((e) => e.time);
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
    expect(Math.max(...times)).toBeLessThanOrEqual(RUN.days);
  });

  it('household edges only ever join members of the same household', () => {
    for (const e of run.transmissionGraph) {
      if (e.contactType !== 'HOUSEHOLD') continue;
      expect(e.sourceHouseholdId).toBe(e.targetHouseholdId);
      expect(e.householdId).toBe(e.sourceHouseholdId);
    }
  });

  it('the graph is deterministic and survives replay', () => {
    const again = runScenario('BASELINE', RUN);
    expect(again.transmissionGraph).toEqual(run.transmissionGraph);
    expect(replayScenario(run).status).toBe('MATCH');
  });

  it('household membership is a real, reproducible relation with an honest caveat', () => {
    const households = run.households!;
    expect(households.calibration).toBe('SYNTHETIC_CALIBRATION_REQUIRED');
    expect(households.provenanceNote).toBe(HOUSEHOLD_PROVENANCE_NOTE);
    expect(households.provenanceNote).toContain('nie wolno go czytać jako struktury gospodarstw');
    const members = households.households.flatMap((h) => h.memberIds);
    expect(new Set(members).size).toBe(members.length);
    expect(members.length).toBe(run.summary!.population);
    for (const h of households.households) {
      expect(h.size).toBe(h.memberIds.length);
      expect(h.bandCounts.child + h.bandCounts.adult + h.bandCounts.senior).toBe(h.size);
    }
  });
});

describe('Contact network — cluster analysis', () => {
  const run = runScenario('BASELINE', RUN);
  const analysis = analyseTransmissionClusters(run.transmissionGraph);

  it('attributes every transmission and the shares add to one', () => {
    const total = analysis.attribution.reduce((n, a) => n + a.transmissions, 0);
    expect(total).toBe(analysis.totalTransmissions);
    expect(total).toBe(run.transmissionGraph.length);
    const shares = analysis.attribution.reduce((n, a) => n + a.share, 0);
    expect(shares).toBeCloseTo(1, 10);
  });

  it('flags a zero for a NOT_MODELED type as an absent capability, not an absence of spread', () => {
    for (const type of CONTACT_TYPES_NOT_MODELED) {
      const entry = analysis.attribution.find((a) => a.contactType === type)!;
      expect(entry.transmissions).toBe(0);
      expect(entry.notModeled).toBe(true);
    }
    expect(analysis.notModeledContactTypes).toEqual(CONTACT_TYPES_NOT_MODELED);
  });

  it('never reports a NOT_MODELED type as the dominant route', () => {
    const dominant = dominantContactType(analysis);
    expect(dominant).not.toBeNull();
    expect(CONTACT_TYPES_NOT_MODELED).not.toContain(dominant!);
  });

  it('clusters are groups of genuine events, sized at or above the threshold', () => {
    for (const cluster of [...analysis.householdClusters, ...analysis.locationClusters]) {
      expect(cluster.transmissions).toBeGreaterThanOrEqual(2);
      expect(cluster.infectedIds).toHaveLength(cluster.transmissions);
      expect(cluster.lastDay).toBeGreaterThanOrEqual(cluster.firstDay);
      const bands = cluster.targetBands;
      expect(bands.child + bands.adult + bands.senior).toBe(cluster.transmissions);
    }
  });

  it('household clusters only contain household transmissions', () => {
    for (const cluster of analysis.householdClusters) expect(cluster.contactType).toBe('HOUSEHOLD');
  });

  it('cross-cohort flows account for every transmission', () => {
    expect(analysis.crossCohortFlows.reduce((n, f) => n + f.transmissions, 0)).toBe(analysis.totalTransmissions);
    for (const flow of analysis.crossCohortFlows) {
      expect(Object.values(flow.byContactType).reduce((n, v) => n + v, 0)).toBe(flow.transmissions);
    }
  });

  it('an empty graph yields empty analysis rather than invented clusters', () => {
    const empty = analyseTransmissionClusters([]);
    expect(empty.totalTransmissions).toBe(0);
    expect(empty.householdClusters).toEqual([]);
    expect(empty.locationClusters).toEqual([]);
    expect(empty.crossCohortFlows).toEqual([]);
    expect(dominantContactType(empty)).toBeNull();
    expect(shareIntoBand(empty, 'senior', 'HOUSEHOLD')).toBe(0);
  });

  it('a band nobody infected reports a zero share, not a division by zero', () => {
    expect(Number.isFinite(shareIntoBand(analysis, 'senior', 'HOUSEHOLD'))).toBe(true);
  });
});

describe('Contact network — school closure is now a real, separable lever', () => {
  it('closing schools removes school transmission without touching other levers', () => {
    const base = runScenario('BASELINE', RUN);
    const closed = runScenario('SCHOOL_CLOSURE', RUN);
    expect(base.transmissionGraph.some((e) => e.contactType === 'SCHOOL')).toBe(true);
    expect(closed.transmissionGraph.some((e) => e.contactType === 'SCHOOL')).toBe(false);
    // Jedyna zmieniona dźwignia: zamknięcie szkół.
    expect(closed.params.restrictions).toBe(base.params.restrictions);
    expect(closed.params.mobility).toBe(base.params.mobility);
    expect(closed.params.closeSchools).toBe(true);
  });

  it('the retired placeholder points at the real scenario', () => {
    expect(SCENARIOS.SCHOOL_CLOSURE_ONLY.notModeledReason).toContain('SCHOOL_CLOSURE');
    expect(SCENARIOS.SCHOOL_CLOSURE.notModeledReason).toBeUndefined();
  });

  it('household protection lowers transmission inside households only', () => {
    // Regime, w którym transmisja domowa faktycznie występuje.
    const homebound = { ...RUN, baseParams: { ...RUN.baseParams, mobility: 0.4 } };
    const base = runScenario('BASELINE', homebound);
    const protectedRun = runScenario('HOUSEHOLD_PROTECTION', homebound);
    const household = (r: typeof base) => r.transmissionGraph.filter((e) => e.contactType === 'HOUSEHOLD').length;
    expect(household(base)).toBeGreaterThan(0);
    expect(household(protectedRun)).toBeLessThan(household(base));
    expect(protectedRun.params.householdTransmissionScale).toBeLessThan(1);
  });
});

describe('Contact network — World Engine contract exposes it read-only', () => {
  it('projects the graph, clusters and households without the consumer computing anything', () => {
    const sim = new EpidemicCitySimulation({ nAgents: 160, initialInfected: 5, seed: 4242 });
    for (let i = 0; i < 120; i++) sim.tick(0.25);
    const view = projectWorldState(sim);
    expect(view.transmissionGraph.length).toBe(sim.transmissionGraph().length);
    expect(view.households.households.length).toBeGreaterThan(0);
    expect(view.households.provenanceNote).toBe(HOUSEHOLD_PROVENANCE_NOTE);
    expect(view.notModeled).toContain('age-specific-contact-matrix');
    expect(view.notModeled).toContain('workplace-contacts');
  });

  it('hands out copies, so a consumer cannot write into the model graph', () => {
    const sim = new EpidemicCitySimulation({ nAgents: 160, initialInfected: 5, seed: 4242 });
    for (let i = 0; i < 120; i++) sim.tick(0.25);
    const view = projectWorldState(sim);
    expect(view.transmissionGraph[0]).not.toBe(sim.transmissionGraph()[0]);
    view.transmissionGraph[0].target = -999;
    expect(sim.transmissionGraph()[0].target).not.toBe(-999);
  });
});

describe('Contact network — the four questions this layer was built to answer', () => {
  const ic = { nAgents: 260, initialInfected: 5, seed: 4242, days: 60, stepsPerDay: 4 };
  const caseOf = (variant: 'SCHOOL_CLOSURE' | 'PROTECT_SENIORS', mobility?: number) => runDiscoveryCase({
    question: 'q',
    hypothesis: { statement: 's', falsification: { metric: 'peakInfectious', relation: 'less-than', rationale: 'r' }, assumptions: [] },
    baselineScenario: 'BASELINE',
    variantScenario: variant,
    initialConditions: ic,
    baseParams: { severeRate: 0.2, ...(mobility === undefined ? {} : { mobility }) },
  });
  const metric = (c: ReturnType<typeof runDiscoveryCase>, key: string) => c.comparison!.metrics.find((m) => m.key === key)!;

  it('A. school closure removes school transmission but displaces it elsewhere', () => {
    const c = caseOf('SCHOOL_CLOSURE');
    expect(c.status).toBe('EVIDENCE_VERIFIED');
    expect(c.replay!.status).toBe('MATCH');
    // Dźwignia działa dokładnie tam, gdzie powinna.
    expect(metric(c, 'transmissions_SCHOOL').variant).toBe(0);
    expect(metric(c, 'transmissions_SCHOOL').baseline).toBeGreaterThan(0);
    // Ale w tym układzie miasta kontakty przenoszą się gdzie indziej, więc
    // łączna transmisja NIE spada — i hipoteza o niższym szczycie upada.
    expect(metric(c, 'transmissions_total').variant).toBeGreaterThan(metric(c, 'transmissions_total').baseline);
    expect(metric(c, 'transmissions_PUBLIC').variant).toBeGreaterThan(metric(c, 'transmissions_PUBLIC').baseline);
    expect(c.conclusion!.verdict).toBe('NOT_SUPPORTED');
  });

  it('B. household transmission defeats senior shielding once people stay home', () => {
    const mobile = caseOf('PROTECT_SENIORS');
    const homebound = caseOf('PROTECT_SENIORS', 0.4);
    for (const c of [mobile, homebound]) expect(c.replay!.status).toBe('MATCH');

    const householdShare = (c: ReturnType<typeof runDiscoveryCase>, arm: 0 | 1) => {
      const analysis = analyseTransmissionClusters(c.arms[arm].run.transmissionGraph);
      return shareIntoBand(analysis, 'senior', 'HOUSEHOLD');
    };
    // Im mniej wychodzenia, tym większa część zakażeń seniorów biegnie przez dom.
    expect(householdShare(homebound, 1)).toBeGreaterThan(householdShare(mobile, 1));
    expect(householdShare(homebound, 1)).toBeGreaterThan(0.3);
    // I wtedy ochrona przestaje chronić: zamknięci w domu seniorzy chorują więcej.
    expect(metric(homebound, 'attackRate_senior').variant).toBeGreaterThan(metric(homebound, 'attackRate_senior').baseline);
  });

  it('C. different age bands have measurably different transmission sources', () => {
    const analysis = analyseTransmissionClusters(
      runScenario('BASELINE', { ...RUN, baseParams: { ...RUN.baseParams, mobility: 0.4 } }).transmissionGraph,
    );
    const seniorHousehold = shareIntoBand(analysis, 'senior', 'HOUSEHOLD');
    const childHousehold = shareIntoBand(analysis, 'child', 'HOUSEHOLD');
    expect(seniorHousehold).toBeGreaterThan(childHousehold * 2);
  });

  it('D. the dominant route is reported from real events, with its own caveat', () => {
    const analysis = analyseTransmissionClusters(runScenario('BASELINE', RUN).transmissionGraph);
    const dominant = dominantContactType(analysis)!;
    const entry = analysis.attribution.find((a) => a.contactType === dominant)!;
    expect(entry.transmissions).toBe(Math.max(...analysis.attribution.filter((a) => !a.notModeled).map((a) => a.transmissions)));
    expect(entry.share).toBeGreaterThan(0);
    // Dominująca kategoria to kontakt na otwartej przestrzeni — model nie
    // rozdziela jej dalej i tak jest to zadeklarowane.
    expect(CONTACT_TYPE_DECLARATIONS.find((d) => d.type === 'OTHER')!.basis).toContain('nie dzieli ulicy');
  });
});
