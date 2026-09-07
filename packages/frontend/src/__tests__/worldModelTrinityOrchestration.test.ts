import { describe, expect, it } from 'vitest';
import { validateEvent } from '../core/events/genesisEvent';
import { createScientificWorld } from '../core/worldModel/orchestration/createScientificWorld';
import { proposeWorldDeterministically } from '../core/worldModel/generation/worldModelProposal';
import { WorldRegistry } from '../core/worldModel/persistence/worldRegistry';
import type { WorldSpecification } from '../core/worldModel/specification/worldSpecification';

/**
 * TRINITY WORLD CREATION API (section 5) + WORLD PERSISTENCE (section 6).
 * Both are thin adapters over already-tested C3 primitives
 * (validateProposal/generateSpecifiedWorld/TemporalEngine/getFrameState/
 * forkBranch) — these tests prove the COMPOSITION, not the primitives
 * themselves (already covered elsewhere).
 */
describe('createScientificWorld: from a WorldSpecification', () => {
  const spec: WorldSpecification = {
    worldId: 'trinity-spec-1',
    seed: 1,
    worldType: ['CITY', 'WATER_SYSTEM'],
    scientificDomains: [{ domain: 'hydraulics', required: true }],
  };

  it('returns everything C1/C2 need: validation, generated world, live engine, initial WorldFrame, available domains', () => {
    const result = createScientificWorld({ kind: 'specification', specification: spec });
    expect(result.worldId).toBe('trinity-spec-1');
    expect(result.validation.ok).toBe(true);
    expect(result.proposalValidation).toBeUndefined();
    expect(result.specified.graph.listEntities().length).toBeGreaterThan(0);
    expect(result.engine.tick).toBe(0);
    expect(result.worldFrame.entities.length).toBe(result.specified.graph.listEntities().length);
    expect(result.availableDomains).toContain('hydraulics-engineering');
    expect(result.timeline).toEqual([]); // nothing has ticked yet
    // The generation event itself (timestamp 0) is real, recorded evidence — already visible in
    // the initial WorldFrame's own events, not a separate "nothing happened yet" empty frame.
    expect(result.events).toEqual([result.provenance.generationEvent]);
    expect(validateEvent(result.provenance.generationEvent).ok).toBe(true);
  });

  it('the returned engine is real and tickable — it is not a frozen snapshot', () => {
    const result = createScientificWorld({ kind: 'specification', specification: spec });
    result.engine.advance(1, () => {});
    expect(result.engine.tick).toBe(1);
  });

  it('rejects an invalid specification with the same clear violations generateSpecifiedWorld itself would report', () => {
    expect(() => createScientificWorld({ kind: 'specification', specification: { ...spec, worldType: [] } })).toThrow(/failed validation/);
  });
});

describe('createScientificWorld: from a WorldModelProposal', () => {
  it('goes through validateProposal first, carries proposal provenance into the result', () => {
    const proposal = proposeWorldDeterministically({ worldId: 'trinity-proposal-1', seed: 2, wantsCity: true, wantsLaboratory: true });
    const result = createScientificWorld({ kind: 'proposal', proposal });
    expect(result.worldId).toBe('trinity-proposal-1');
    expect(result.proposalValidation?.validation.ok).toBe(true);
    expect(result.provenance.proposalProvenance).toEqual(proposal.provenance);
    expect(result.availableDomains).toContain('chemistry-kinetics');
  });

  it('rejects a proposal whose specification fails validation, never generating a world from it', () => {
    const badProposal = proposeWorldDeterministically({ worldId: 'trinity-bad', seed: 1 });
    badProposal.specification = { ...badProposal.specification, worldType: [] };
    expect(() => createScientificWorld({ kind: 'proposal', proposal: badProposal })).toThrow(/failed validation/);
  });
});

describe('WorldRegistry: persistent world identity (section 6)', () => {
  it('saves and loads a created world by its own worldId', () => {
    const registry = new WorldRegistry();
    const created = createScientificWorld({
      kind: 'specification',
      specification: { worldId: 'reg-1', seed: 1, worldType: ['CITY'] },
    });
    const record = registry.save(created);
    expect(record.worldId).toBe('reg-1');
    expect(record.seed).toBe(1);
    expect(record.branchId).toBe(created.engine.branchId);

    const loaded = registry.load('reg-1');
    expect(loaded?.engine).toBe(created.engine); // the SAME live engine, never a copy
    expect(registry.list().map((r) => r.worldId)).toEqual(['reg-1']);
  });

  it('refuses to register the same worldId twice', () => {
    const registry = new WorldRegistry();
    const created = createScientificWorld({ kind: 'specification', specification: { worldId: 'reg-dup', seed: 1, worldType: ['CITY'] } });
    registry.save(created);
    expect(() => registry.save(created)).toThrow(/already registered/);
  });

  it('fork() reuses TemporalEngine.forkBranch and registers the divergent world under a new id', () => {
    const registry = new WorldRegistry();
    const created = createScientificWorld({
      kind: 'specification',
      specification: { worldId: 'reg-base', seed: 1, worldType: ['WATER_SYSTEM'], scientificDomains: [{ domain: 'hydraulics', required: true }] },
    });
    registry.save(created);
    created.engine.advance(1, () => {});
    created.engine.advance(1, () => {});

    const forkedRecord = registry.fork('reg-base', 'reg-fork-1', 2, 'shutdown-variant', (graph) => {
      const pump = graph.getEntity('pump-pipe-system:pump-pipe-1');
      graph.updateEntity(pump.id, { domainState: { ...pump.domainState, volumetricFlow: 0 } });
    });

    expect(forkedRecord.parentWorldId).toBe('reg-base');
    expect(forkedRecord.forkedAtTick).toBe(2);
    const forkedStored = registry.load('reg-fork-1');
    expect(forkedStored?.engine.parentBranchId).toBe(created.engine.branchId);
    expect(forkedStored?.engine.graph.getEntity('pump-pipe-system:pump-pipe-1').domainState?.volumetricFlow).toBe(0);
    // The base world's own state is untouched by the fork's declared divergence.
    expect(created.engine.graph.getEntity('pump-pipe-system:pump-pipe-1').domainState?.volumetricFlow).toBeGreaterThan(0);

    expect(registry.list().map((r) => r.worldId).sort()).toEqual(['reg-base', 'reg-fork-1']);
  });

  it('forking an unknown world throws', () => {
    const registry = new WorldRegistry();
    expect(() => registry.fork('does-not-exist', 'x', 0, 'x', () => {})).toThrow(/Unknown world/);
  });
});
