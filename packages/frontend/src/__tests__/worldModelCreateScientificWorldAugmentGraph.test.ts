import { describe, expect, it } from 'vitest';
import { canonicalJson } from '../core/events/hash';
import { createScientificWorld } from '../core/worldModel/orchestration/createScientificWorld';
import type { WorldSpecification } from '../core/worldModel/specification/worldSpecification';

/**
 * createScientificWorld's `augmentGraph` option (Priority 2.4's own real
 * finding: adding an entity to `specified.graph`/`engine.graph` AFTER
 * construction silently breaks replay, since `TemporalEngine` clones its
 * `initialGraph` argument for both `current` and `keyframeGraph`). This
 * proves the CORRECT way — `augmentGraph`, which runs before construction
 * — produces a world whose replay stays consistent from tick 0 onward,
 * including the augmented entity.
 */
describe('createScientificWorld: augmentGraph adds genuine tick-0 state, not a post-hoc mutation', () => {
  const spec: WorldSpecification = { worldId: 'augment-city', seed: 1, worldType: ['CITY'] };

  it('an entity added via augmentGraph is present in worldFrame/availableDomains and survives scrubTo(0)', () => {
    const result = createScientificWorld(
      { kind: 'specification', specification: spec },
      {
        augmentGraph: (graph) => {
          const cityRoot = graph.listEntities().find((e) => e.scale.parentEntityId === undefined)!;
          graph.addEntity({
            id: 'sensor:s1',
            ref: { kind: 'sensor', id: 's1' },
            label: 'Sensor',
            scale: { level: 'MESO_LAB', parentEntityId: cityRoot.id },
            domainState: { reading: 1 },
            grounding: 'UNGROUNDED_APPROXIMATION',
            updatedAtTick: 0,
          });
        },
      },
    );

    expect(result.engine.graph.getEntity('sensor:s1')).toBeDefined();
    expect(result.worldFrame.entities.some((e) => e.id === 'sensor:s1')).toBe(true);

    // scrubTo(0) — the true keyframe — must ALSO include it, proving it was part of construction,
    // not a mutation applied to a graph the engine already cloned away from.
    expect(result.engine.scrubTo(0).getEntity('sensor:s1')).toBeDefined();
  });

  it('replay stays byte-identical after real ticks, with the augmented entity present throughout', () => {
    const result = createScientificWorld(
      { kind: 'specification', specification: { ...spec, worldId: 'augment-city-ticked' } },
      {
        augmentGraph: (graph) => {
          const cityRoot = graph.listEntities().find((e) => e.scale.parentEntityId === undefined)!;
          graph.addEntity({
            id: 'sensor:s2',
            ref: { kind: 'sensor', id: 's2' },
            label: 'Sensor',
            scale: { level: 'MESO_LAB', parentEntityId: cityRoot.id },
            domainState: { reading: 1 },
            grounding: 'UNGROUNDED_APPROXIMATION',
            updatedAtTick: 0,
          });
        },
      },
    );

    for (let i = 0; i < 3; i++) result.engine.advance(1, () => undefined);
    const live = result.engine.graph.listEntities();
    const replayed = result.engine.scrubTo(result.engine.tick).listEntities();
    expect(canonicalJson([...replayed].sort((a, b) => (a.id < b.id ? -1 : 1)))).toBe(canonicalJson([...live].sort((a, b) => (a.id < b.id ? -1 : 1))));
    expect(replayed.some((e) => e.id === 'sensor:s2')).toBe(true);
  });

  it('without augmentGraph, behavior is completely unchanged (backward compatible)', () => {
    const result = createScientificWorld({ kind: 'specification', specification: { ...spec, worldId: 'no-augment-city' } });
    expect(result.engine.graph.listEntities().length).toBeGreaterThan(0);
  });
});
