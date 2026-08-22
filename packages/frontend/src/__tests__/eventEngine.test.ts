import { describe, it, expect } from 'vitest';
import {
  EventRegistry, EventStream, ingestTransmissions, runRulesOverRegistry, runRules,
  provenanceChain, reconstructionKey, validateEvent, provenanceFromModel,
  isKnownType, getEventType, assertKnownType, listEventTypes,
  transmissionCausesExposure, EVENT_INFECTION_TRANSMISSION, EVENT_INFECTION_EXPOSURE,
  analyseEpidemicTransmissionEvents, serializeEpidemicTransmissionAnalysis,
  type GenesisRule, type GenesisEventInput,
} from '../core/events';
import { EpidemicCitySimulation } from '../core/simulation/epidemicCity';
import { runExperiment } from '../core/experimentFabric';

const modelInput = (over: Partial<GenesisEventInput> = {}): GenesisEventInput => ({
  type: 'infection.transmission', timestamp: 1, affectedEntities: [{ kind: 'agent', id: 2 }],
  source: { kind: 'agent', id: 1 }, parameters: { fromAgent: 1, toAgent: 2 },
  provenance: provenanceFromModel({ modelId: 'biology.city', seed: 1 }), ...over,
});

describe('Etap 1 — hardened validation', () => {
  it('rejects bad entity refs, bad location and bad provenance origin', () => {
    expect(validateEvent({ ...modelInput(), affectedEntities: [{ kind: '', id: 1 } as never] }).ok).toBe(false);
    expect(validateEvent({ ...modelInput(), location: { x: 'a' as never, y: 1 } }).ok).toBe(false);
    expect(validateEvent({ ...modelInput(), provenance: { origin: 'bogus' as never } }).ok).toBe(false);
    expect(validateEvent(modelInput()).ok).toBe(true);
  });
});

describe('Etap 2 — EventStream (read-only, cursor)', () => {
  it('getEventsSince returns only new events and advances the cursor deterministically', () => {
    const r = new EventRegistry({ modelId: 'm' });
    const s = new EventStream(r);
    let cur = s.cursor();
    r.add(modelInput({ timestamp: 1 })); r.add(modelInput({ timestamp: 2 }));
    let batch = s.getEventsSince(cur); cur = batch.cursor;
    expect(batch.events).toHaveLength(2);
    r.add(modelInput({ timestamp: 3 }));
    batch = s.getEventsSince(cur); cur = batch.cursor;
    expect(batch.events).toHaveLength(1);
    expect(batch.events[0].timestamp).toBe(3);
    expect(s.getEventsSince(cur).events).toHaveLength(0);
  });
});

describe('Etap 4 — GenesisRule conditions', () => {
  it('when() gates the rule; non-matching trigger or false condition emits nothing', () => {
    const r = new EventRegistry({ modelId: 'm' });
    const root = r.add(modelInput({ parameters: { fromAgent: 1, toAgent: 2, big: 1 } }));
    const gated: GenesisRule = {
      id: 'demo.gated', description: 'only when big>0', trigger: { type: 'infection.transmission' },
      when: (e) => Number((e.parameters as Record<string, unknown>).big) > 0,
      emit: (e) => [{ type: 'demo.secondary', timestamp: e.timestamp + 1, affectedEntities: e.affectedEntities, parameters: {} }],
    };
    expect(runRules(r, root, [gated])).toHaveLength(1);
    const noBig = r.add(modelInput({ parameters: { fromAgent: 3, toAgent: 4, big: 0 } }));
    expect(runRules(r, noBig, [gated])).toHaveLength(0);
  });
});

describe('Etap 3 + 5 — REAL transmission -> GenesisEvent -> exposure consequence', () => {
  const build = () => {
    const sim = new EpidemicCitySimulation({ nAgents: 220, r0: 4, seed: 321, contactRadius: 18 });
    const registry = new EventRegistry({ modelId: 'biology.city', experimentId: 'exp-A', seed: 321 });
    let day = 0;
    for (let i = 0; i < 500; i++) {
      sim.tick(0.05); day += 0.05;
      ingestTransmissions(registry, sim.lastTransmissions(), {
        simTime: day, modelId: 'biology.city', experimentId: 'exp-A', seed: 321, params: sim.getParams(),
      });
    }
    const secondary = runRulesOverRegistry(registry, [transmissionCausesExposure]);
    return { sim, registry, secondary };
  };

  it('each real transmission gets one traceable infection.exposure child (parent + provenance)', () => {
    const { registry, secondary } = build();
    const transmissions = registry.byType(EVENT_INFECTION_TRANSMISSION);
    const exposures = registry.byType(EVENT_INFECTION_EXPOSURE);
    expect(transmissions.length).toBeGreaterThan(10);           // realny strumień, nie fixture
    expect(exposures.length).toBe(transmissions.length);        // jedna ekspozycja na transmisję
    expect(secondary.length).toBe(transmissions.length);
    for (const ex of exposures) {
      expect(ex.provenance?.origin).toBe('consequence-rule');
      expect(ex.provenance?.ruleId).toBe('epidemic.transmission-causes-exposure');
      const parent = registry.get(ex.parentEventId!);
      expect(parent?.type).toBe(EVENT_INFECTION_TRANSMISSION);
      // source/target zachowane
      expect(ex.affectedEntities[0].kind).toBe('agent');
    }
    // Ślad do modelu: source != target, lokalizacja w granicach świata.
    const t = transmissions[0];
    expect(Number(t.source!.id)).not.toBe(Number(t.affectedEntities[0].id));
    expect(t.location!.x).toBeGreaterThanOrEqual(0);
    expect(t.location!.x).toBeLessThanOrEqual(sim0Width());
  });

  it('reproducible: same seed+params => identical event ids across transmission AND exposure chain', () => {
    const a = build(); const b = build();
    expect(a.registry.all().map((e) => e.id)).toEqual(b.registry.all().map((e) => e.id));
  });

  it('provenanceChain traces exposure -> transmission; reconstructionKey carries seed+paramsHash', () => {
    const { registry } = build();
    const exposure = registry.byType(EVENT_INFECTION_EXPOSURE)[0];
    const chain = provenanceChain(registry, exposure.id);
    expect(chain[0].type).toBe(EVENT_INFECTION_EXPOSURE);
    expect(chain[1].type).toBe(EVENT_INFECTION_TRANSMISSION);
    const key = reconstructionKey(chain[1]);
    expect(key.seed).toBe(321);
    expect(typeof key.paramsHash).toBe('string');
    expect(key.experimentId).toBe('exp-A');
  });

  it('projects real model transmissions into a provenance-bound graph and coordinate hotspot ranking', () => {
    const { registry } = build();
    const analysis = analyseEpidemicTransmissionEvents(registry.byType(EVENT_INFECTION_TRANSMISSION), { cellSizeWorldUnits: 100 });
    expect(analysis.status).toBe('AVAILABLE');
    expect(analysis.classification).toBe('SIMULATED_MODEL_OUTPUT');
    expect(analysis.metrics.transmissionCount).toBe(registry.byType(EVENT_INFECTION_TRANSMISSION).length);
    expect(analysis.metrics.uniqueSourceAgents).toBeGreaterThan(0);
    expect(analysis.metrics.uniqueTargetAgents).toBeGreaterThan(0);
    expect(analysis.graph.nodes.length).toBeGreaterThan(0);
    expect(analysis.graph.edges.length).toBeGreaterThan(0);
    expect(analysis.hotspots[0].transmissionCount).toBeGreaterThan(0);
    expect(analysis.sourceModelIds).toEqual(['biology.city']);
    expect(analysis.experimentIds).toEqual(['exp-A']);
    expect(analysis.seedValues).toEqual([321]);

    const replay = analyseEpidemicTransmissionEvents(build().registry.byType(EVENT_INFECTION_TRANSMISSION), { cellSizeWorldUnits: 100 });
    expect(serializeEpidemicTransmissionAnalysis(replay)).toBe(serializeEpidemicTransmissionAnalysis(analysis));
  });

  it('does not infer a graph from missing or unprovenanced transmission events', () => {
    expect(analyseEpidemicTransmissionEvents([]).status).toBe('NO_TRANSMISSIONS');
    const { registry } = build();
    const [realTransmission] = registry.byType(EVENT_INFECTION_TRANSMISSION);
    const blocked = analyseEpidemicTransmissionEvents([{ ...realTransmission, provenance: undefined }]);
    expect(blocked.status).toBe('BLOCKED_INCOMPLETE_PROVENANCE');
    expect(blocked.metrics.transmissionCount).toBe(0);
  });
});

describe('Epidemic Digital Twin — canonical Fabric metrics', () => {
  it('publishes graph and hotspot metrics calculated from the same real EpidemicCity event stream', () => {
    const request = {
      contractVersion: '1.0.0',
      sourceText: 'Uruchom realną epidemię i policz transmisje modelu.',
      domainId: 'biology',
      operation: 'simulate' as const,
      modelId: 'epidemic-city',
      parameters: { r0: 4, horizonDays: 30, nAgents: 220 },
      seed: 321,
    };
    const first = runExperiment(request);
    const replay = runExperiment(request);
    expect(first.result.status).toBe('completed');
    expect(first.result.eventAnalysis?.status).toBe('AVAILABLE');
    expect(first.result.eventAnalysis?.metrics.transmissionEvents).toBeGreaterThan(0);
    expect(first.result.eventAnalysis?.metrics.uniqueTransmissionSources).toBeGreaterThan(0);
    expect(first.result.eventAnalysis?.metrics.uniqueTransmissionTargets).toBeGreaterThan(0);
    expect(first.result.eventAnalysis?.metrics.transmissionHotspotCells).toBeGreaterThan(0);
    expect(first.result.eventAnalysis?.metrics.largestTransmissionHotspotEvents).toBeGreaterThan(0);
    expect(first.result.eventSummary?.count).toBe(first.result.eventAnalysis?.metrics.transmissionEvents);
    expect(replay.result.eventAnalysis).toEqual(first.result.eventAnalysis);
  });

  it('applies declared transmission and isolation controls to the same real model rather than recording inert parameters', () => {
    const run = runExperiment({
      contractVersion: '1.0.0',
      sourceText: 'Uruchom przebieg kontrolny z wyłączoną transmisją i izolacją.',
      domainId: 'biology',
      operation: 'simulate',
      modelId: 'epidemic-city',
      parameters: { r0: 4, horizonDays: 30, nAgents: 220, initialInfected: 4, transmissionScale: 0, restrictions: 0.9, isolate: true },
      seed: 321,
    });
    expect(run.result.status).toBe('completed');
    expect(run.provenance.parameterSnapshot.transmissionScale).toBe(0);
    expect(run.provenance.parameterSnapshot.isolate).toBe(true);
    expect(run.result.eventSummary?.count).toBe(0);
    expect(run.result.eventAnalysis?.status).toBe('NO_TRANSMISSIONS');
    expect(run.result.outputs.izolowani).toBe(0);
  });
});

describe('Etap 6 + 7 — event type registry (contracts ready, models not)', () => {
  it('builtin epidemic types are implemented; future/urban types are declared but not implemented', () => {
    expect(isKnownType(EVENT_INFECTION_TRANSMISSION)).toBe(true);
    expect(getEventType(EVENT_INFECTION_TRANSMISSION)?.implemented).toBe(true);
    expect(getEventType('hazard.flood')?.implemented).toBe(false);
    expect(getEventType('power.failure')?.implemented).toBe(false);
    expect(isKnownType('totally.unknown')).toBe(false);
    expect(() => assertKnownType('totally.unknown')).toThrow(/Unknown event type/);
    expect(listEventTypes().length).toBeGreaterThanOrEqual(12);
  });
});

function sim0Width(): number { return new EpidemicCitySimulation({ nAgents: 10 }).worldWidth; }
