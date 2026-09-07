import { describe, expect, it } from 'vitest';
import { createScientificWorld } from '../core/worldModel/orchestration/createScientificWorld';
import type { WorldSpecification } from '../core/worldModel/specification/worldSpecification';

/**
 * FOCAL ENTITY IDS (Priority 1.3 — the C3-side contract a future C1
 * Looking Glass handoff needs: "where should the camera start"). See
 * createScientificWorld.ts's own module doc for the full handoff
 * description; this only tests the computation itself.
 */
describe('createScientificWorld: focalEntityIds', () => {
  const baseSpec: WorldSpecification = {
    worldId: 'focal-city',
    seed: 1,
    worldType: ['CITY', 'WATER_SYSTEM'],
    scientificDomains: [{ domain: 'hydraulics', required: true }],
  };

  it('defaults to the world\'s own structural root(s) when no observables are requested', () => {
    const result = createScientificWorld({ kind: 'specification', specification: baseSpec });
    expect(result.focalEntityIds.length).toBeGreaterThan(0);
    for (const id of result.focalEntityIds) {
      const entity = result.specified.graph.getEntity(id);
      expect(entity.scale.parentEntityId).toBeUndefined();
    }
  });

  it('resolves requestedObservables by exact entity id', () => {
    const result = createScientificWorld({
      kind: 'specification',
      specification: { ...baseSpec, worldId: 'focal-city-exact', requestedObservables: ['pump-pipe-system:pump-pipe-1'] },
    });
    expect(result.focalEntityIds).toEqual(['pump-pipe-system:pump-pipe-1']);
  });

  it('resolves requestedObservables by entity ref.kind, matching every entity of that kind', () => {
    const result = createScientificWorld({
      kind: 'specification',
      specification: { ...baseSpec, worldId: 'focal-city-kind', requestedObservables: ['pump-pipe-system'] },
    });
    expect(result.focalEntityIds).toContain('pump-pipe-system:pump-pipe-1');
    for (const id of result.focalEntityIds) {
      expect(result.specified.graph.getEntity(id).ref.kind).toBe('pump-pipe-system');
    }
  });

  it('falls back to the structural root when every requested observable matches nothing real', () => {
    const result = createScientificWorld({
      kind: 'specification',
      specification: { ...baseSpec, worldId: 'focal-city-nomatch', requestedObservables: ['nonexistent-kind-xyz'] },
    });
    expect(result.focalEntityIds.length).toBeGreaterThan(0);
    for (const id of result.focalEntityIds) {
      expect(result.specified.graph.getEntity(id).scale.parentEntityId).toBeUndefined();
    }
  });

  it('never fabricates a focal entity that does not exist in the generated graph', () => {
    const result = createScientificWorld({
      kind: 'specification',
      specification: { ...baseSpec, worldId: 'focal-city-real', requestedObservables: ['pump-pipe-system', 'nonexistent-kind-xyz'] },
    });
    for (const id of result.focalEntityIds) {
      expect(() => result.specified.graph.getEntity(id)).not.toThrow();
    }
  });
});
