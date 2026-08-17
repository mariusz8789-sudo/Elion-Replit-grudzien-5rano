import { describe, it, expect } from 'vitest';
import {
  EventRegistry, validateEvent, adaptTransmission, ingestTransmissions,
  applyConsequences, provenanceFromModel, GENESIS_EVENT_CONTRACT_VERSION,
  type GenesisEventInput, type ConsequenceRule,
} from '../core/events';
import type { TransmissionEvent } from '../core/simulation/types';
import { EpidemicCitySimulation } from '../core/simulation/epidemicCity';

const modelInput = (over: Partial<GenesisEventInput> = {}): GenesisEventInput => ({
  type: 'infection.transmission', timestamp: 1, affectedEntities: [{ kind: 'agent', id: 2 }],
  source: { kind: 'agent', id: 1 }, parameters: { fromAgent: 1, toAgent: 2 },
  provenance: provenanceFromModel({ modelId: 'biology.city', seed: 1 }), ...over,
});

describe('GenesisEvent — schema', () => {
  it('accepts a well-formed event and rejects malformed ones', () => {
    expect(validateEvent(modelInput()).ok).toBe(true);
    expect(validateEvent({ ...modelInput(), type: 'Infection Transmission' }).ok).toBe(false); // not dotted lowercase
    expect(validateEvent({ ...modelInput(), timestamp: NaN }).ok).toBe(false);
    expect(validateEvent({ ...modelInput(), severity: 1.5 }).ok).toBe(false);
    expect(validateEvent({ ...modelInput(), affectedEntities: undefined }).ok).toBe(false);
  });
});

describe('EventRegistry — deterministic ID, ordering, provenance', () => {
  it('assigns the contract version and a deterministic id (same input sequence -> same ids)', () => {
    const a = new EventRegistry({ modelId: 'm' });
    const b = new EventRegistry({ modelId: 'm' });
    const ea = a.add(modelInput()); const eb = b.add(modelInput());
    expect(ea.contractVersion).toBe(GENESIS_EVENT_CONTRACT_VERSION);
    expect(ea.id).toBe(eb.id);
    expect(ea.id.startsWith('infection.transmission@')).toBe(true);
  });

  it('orders events by timestamp', () => {
    const r = new EventRegistry();
    r.add(modelInput({ timestamp: 5 }));
    r.add(modelInput({ timestamp: 2 }));
    r.add(modelInput({ timestamp: 9 }));
    expect(r.all().map((e) => e.timestamp)).toEqual([2, 5, 9]);
  });

  it('rejects fake events (no provenance.origin)', () => {
    const r = new EventRegistry();
    expect(() => r.add({ ...modelInput(), provenance: undefined })).toThrow(/provenance\.origin/);
  });

  it('links parent -> children and rejects unknown parent', () => {
    const r = new EventRegistry();
    const parent = r.add(modelInput());
    const child = r.add({ ...modelInput({ timestamp: 2 }), parentEventId: parent.id });
    expect(r.children(parent.id).map((e) => e.id)).toEqual([child.id]);
    expect(() => r.add({ ...modelInput(), parentEventId: 'does-not-exist' })).toThrow(/not found/);
    expect(r.provenanceOf(parent.id)?.origin).toBe('model');
  });
});

describe('TransmissionEvent -> infection.transmission adapter', () => {
  it('maps model transmission to a neutral GenesisEvent preserving source/target/location', () => {
    const t: TransmissionEvent = { from: 7, to: 42, x: 120, y: 80 };
    const input = adaptTransmission(t, { simTime: 12, modelId: 'biology.city', experimentId: 'exp1', seed: 5 });
    expect(input.type).toBe('infection.transmission');
    expect(input.timestamp).toBe(12);
    expect(input.source).toEqual({ kind: 'agent', id: 7 });
    expect(input.affectedEntities).toEqual([{ kind: 'agent', id: 42 }]);
    expect(input.location).toEqual({ x: 120, y: 80 });
    expect(input.parameters).toEqual({ fromAgent: 7, toAgent: 42 });
    expect(input.provenance?.origin).toBe('model');
    expect(input.provenance?.modelId).toBe('biology.city');
  });
});

describe('Reproducibility — same seed + params => same events + provenance (REAL model)', () => {
  const collect = () => {
    const sim = new EpidemicCitySimulation({ nAgents: 220, r0: 4, seed: 123, contactRadius: 18 });
    const registry = new EventRegistry({ modelId: 'biology.city', experimentId: 'city-1', seed: 123 });
    let day = 0;
    for (let i = 0; i < 600; i++) {
      sim.tick(0.05); day += 0.05;
      ingestTransmissions(registry, sim.lastTransmissions(), {
        simTime: day, modelId: 'biology.city', experimentId: 'city-1', seed: 123, params: sim.getParams(),
      });
    }
    return registry;
  };

  it('two identical runs produce identical event ids, order, and provenance hashes', () => {
    const a = collect(); const b = collect();
    expect(a.count()).toBeGreaterThan(10);            // realny strumień zdarzeń z modelu
    expect(a.count()).toBe(b.count());
    const idsA = a.all().map((e) => e.id);
    const idsB = b.all().map((e) => e.id);
    expect(idsA).toEqual(idsB);
    expect(a.all()[0].provenance?.paramsHash).toBe(b.all()[0].provenance?.paramsHash);
    // Każde zdarzenie ma źródło modelowe i lokalizację (ślad na scenie dla Manusa).
    for (const e of a.all()) {
      expect(e.provenance?.origin).toBe('model');
      expect(e.location).toBeDefined();
      expect(e.type).toBe('infection.transmission');
    }
  });
});

describe('Consequence Engine — architecture proof (no domain impl)', () => {
  it('a rule derives a secondary event linked to its parent with consequence-rule provenance', () => {
    const r = new EventRegistry({ modelId: 'm' });
    const root = r.add(modelInput());
    const rule: ConsequenceRule = {
      id: 'demo.echo',
      description: 'Architecture proof: emits one neutral secondary event per source event.',
      appliesTo: (e) => e.type === 'infection.transmission',
      derive: (e) => [{
        type: 'demo.secondary', timestamp: e.timestamp + 1,
        affectedEntities: e.affectedEntities, parameters: { of: e.id },
        provenance: { origin: 'consequence-rule' },
      }],
    };
    const derived = applyConsequences(r, root, [rule]);
    expect(derived).toHaveLength(1);
    expect(derived[0].parentEventId).toBe(root.id);
    expect(derived[0].provenance?.origin).toBe('consequence-rule');
    expect(derived[0].provenance?.ruleId).toBe('demo.echo');
    expect(r.children(root.id)).toHaveLength(1);
  });
});
