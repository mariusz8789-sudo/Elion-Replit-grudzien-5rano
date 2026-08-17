import { describe, it, expect } from 'vitest';
import {
  EventRegistry, EventStream, ingestTransmissions, runRulesOverRegistry, runRules,
  transmissionCausesExposure, EVENT_INFECTION_TRANSMISSION, EVENT_INFECTION_EXPOSURE,
  isCompatibleContractVersion, consumerCapability, GENESIS_EVENT_CONTRACT_VERSION,
  serializeEvent, deserializeEvent, serializeEvents, deserializeEvents,
  fingerprintRun, compareEventRuns, provenanceFromModel, provenanceChain,
  isKnownType, getEventType, EVENT_POWER_FAILURE,
  type GenesisEventInput, type GenesisRule, type EventConsumer,
} from '../core/events';
import { EpidemicCitySimulation } from '../core/simulation/epidemicCity';

const CTX = { simTime: 1, modelId: 'biology.city', experimentId: 'exp-A', seed: 321 };
const runCity = (seed = 321, r0 = 4) => {
  const sim = new EpidemicCitySimulation({ nAgents: 220, r0, seed, contactRadius: 18 });
  const registry = new EventRegistry({ modelId: 'biology.city', experimentId: 'exp-A', seed });
  let day = 0;
  for (let i = 0; i < 500; i++) {
    sim.tick(0.05); day += 0.05;
    ingestTransmissions(registry, sim.lastTransmissions(), { ...CTX, simTime: day, seed, params: sim.getParams() });
  }
  return { sim, registry };
};

describe('Pakiet A — contract compatibility & schema assurance', () => {
  it('version compatibility (semver-lite) is exact and safe', () => {
    expect(isCompatibleContractVersion('1.0.0', '1.0.0')).toBe(true);
    expect(isCompatibleContractVersion('1.2.0', '1.0.0')).toBe(true);   // consumer newer minor ok
    expect(isCompatibleContractVersion('1.0.0', '1.1.0')).toBe(false);  // event newer minor
    expect(isCompatibleContractVersion('2.0.0', '1.0.0')).toBe(false);  // major mismatch
    expect(isCompatibleContractVersion('bad', '1.0.0')).toBe(false);
    expect(consumerCapability(GENESIS_EVENT_CONTRACT_VERSION)?.readableFeatures).toContain('parent-chain');
  });

  it('JSON round-trip preserves id, timestamp, parent, provenance, parameters', () => {
    const { registry } = runCity();
    runRulesOverRegistry(registry, [transmissionCausesExposure]);
    const original = registry.all();
    const restored = deserializeEvents(serializeEvents(original));
    expect(restored.map((e) => e.id)).toEqual(original.map((e) => e.id));
    const child = restored.find((e) => e.type === EVENT_INFECTION_EXPOSURE)!;
    const src = original.find((e) => e.id === child.id)!;
    expect(child.parentEventId).toBe(src.parentEventId);
    expect(child.provenance).toEqual(src.provenance);
    expect(child.parameters).toEqual(src.parameters);
    expect(child.timestamp).toBe(src.timestamp);
  });

  it('deserialize rejects malformed events', () => {
    const good = runCity().registry.all()[0];
    expect(() => deserializeEvent(serializeEvent(good))).not.toThrow();
    expect(() => deserializeEvent(JSON.stringify({ ...good, type: 'BAD TYPE' }))).toThrow();
    expect(() => deserializeEvent(JSON.stringify({ ...good, timestamp: NaN }))).toThrow(); // NaN -> null in JSON -> invalid
  });

  it('type registry: builtin stable, future domains declared but not implemented', () => {
    expect(getEventType(EVENT_INFECTION_TRANSMISSION)?.implemented).toBe(true);
    expect(getEventType(EVENT_POWER_FAILURE)?.implemented).toBe(false);
    expect(isKnownType('hazard.flood')).toBe(true);
    expect(getEventType('hazard.flood')?.implemented).toBe(false);
  });
});

describe('Pakiet B — deterministic replay & reproducibility harness', () => {
  it('identical seed+params => identical fingerprint & compareEventRuns match', () => {
    const a = runCity(321).registry, b = runCity(321).registry;
    const fa = fingerprintRun(a, { seed: 321 }), fb = fingerprintRun(b, { seed: 321 });
    expect(fa.digest).toBe(fb.digest);
    expect(fa.eventIds).toEqual(fb.eventIds);
    expect(compareEventRuns(a, b).match).toBe(true);
  });

  it('changed seed => divergence is reported, not masked', () => {
    const a = runCity(321).registry, b = runCity(999).registry;
    const cmp = compareEventRuns(a, b);
    expect(cmp.match).toBe(false);
    expect(cmp.firstDivergenceIndex).toBeGreaterThanOrEqual(0);
    expect(cmp.divergence).toBeDefined();
  });
});

describe('Pakiet C — consumer contract harness (real model, read-only)', () => {
  it('EventConsumer seam: model -> ingest -> cursor -> transmission -> child exposure -> provenance chain', () => {
    const { sim } = { sim: new EpidemicCitySimulation({ nAgents: 200, r0: 4, seed: 7, contactRadius: 18 }) };
    const registry = new EventRegistry({ modelId: 'biology.city', experimentId: 'exp-C', seed: 7 });
    const consumer: EventConsumer = new EventStream(registry);
    let cur = consumer.cursor();
    let day = 0; let sawBatch = false;
    for (let i = 0; i < 500; i++) {
      sim.tick(0.05); day += 0.05;
      ingestTransmissions(registry, sim.lastTransmissions(), { ...CTX, experimentId: 'exp-C', simTime: day, seed: 7, params: sim.getParams() });
      const batch = consumer.getEventsSince(cur); cur = batch.cursor;
      if (batch.events.length > 0) sawBatch = true;
    }
    runRulesOverRegistry(registry, [transmissionCausesExposure]);
    expect(sawBatch).toBe(true); // stream delivered new events per tick
    const t = consumer.getEventsByType(EVENT_INFECTION_TRANSMISSION);
    expect(t.length).toBeGreaterThan(10);
    const exposureChildren = consumer.getChildren(t[0].id);
    expect(exposureChildren[0].type).toBe(EVENT_INFECTION_EXPOSURE);
    const chain = provenanceChain(registry, exposureChildren[0].id);
    expect(chain.map((e) => e.type)).toEqual([EVENT_INFECTION_EXPOSURE, EVENT_INFECTION_TRANSMISSION]);
    expect(consumer.getProvenance(t[0].id)?.origin).toBe('model');
  });

  it('run reset: a fresh run does not mix events with a previous one', () => {
    const r1 = runCity(1).registry;
    const r2 = runCity(2).registry;
    // Independent registries → independent streams; no shared state.
    expect(compareEventRuns(r1, r2).match).toBe(false);
    const s2 = new EventStream(r2);
    expect(s2.getEventsSince(0).events.length).toBe(r2.count());
  });
});

describe('Pakiet D — consequence hardening', () => {
  it('rule does not mutate model stats or agents', () => {
    const { sim, registry } = runCity();
    const statsBefore = JSON.stringify(sim.stats());
    const agentsBefore = sim.agents().map((a) => a.state).join('');
    runRulesOverRegistry(registry, [transmissionCausesExposure]);
    expect(JSON.stringify(sim.stats())).toBe(statsBefore);
    expect(sim.agents().map((a) => a.state).join('')).toBe(agentsBefore);
  });

  it('idempotent: running the rule twice does not duplicate children', () => {
    const { registry } = runCity();
    const first = runRulesOverRegistry(registry, [transmissionCausesExposure]).length;
    const exposuresAfterFirst = registry.byType(EVENT_INFECTION_EXPOSURE).length;
    const second = runRulesOverRegistry(registry, [transmissionCausesExposure]).length;
    expect(first).toBeGreaterThan(0);
    expect(second).toBe(0); // nothing new
    expect(registry.byType(EVENT_INFECTION_EXPOSURE).length).toBe(exposuresAfterFirst);
  });

  it('cycle guard: a self-referential rule cannot loop', () => {
    const r = new EventRegistry({ modelId: 'm' });
    const root = r.add({
      type: 'demo.loop', timestamp: 0, affectedEntities: [{ kind: 'x', id: 1 }],
      parameters: {}, provenance: provenanceFromModel({ modelId: 'm' }),
    } as GenesisEventInput);
    const selfRule: GenesisRule = {
      id: 'demo.self', description: 'emits its own trigger type', trigger: { type: 'demo.loop' },
      emit: (e) => [{ type: 'demo.loop', timestamp: e.timestamp + 1, affectedEntities: e.affectedEntities, parameters: {} }],
    };
    runRules(r, root, [selfRule]);          // one child
    runRulesOverRegistry(r, [selfRule]);    // must NOT loop / duplicate
    runRulesOverRegistry(r, [selfRule]);
    expect(r.byType('demo.loop').length).toBe(2); // root + exactly one child
  });

  it('urban-cascade types cannot be emitted by builtin rules (declaration only)', () => {
    const { registry } = runCity();
    runRulesOverRegistry(registry, [transmissionCausesExposure]);
    expect(registry.byType(EVENT_POWER_FAILURE).length).toBe(0);
  });
});
