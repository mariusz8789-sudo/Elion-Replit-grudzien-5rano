import { describe, expect, it } from 'vitest';
import { buildWorldState, type WorldEntity } from '../core/world/scientificWorldState';
import { ScientificWorldRuntime, type WorldScene } from '../core/world/worldRuntime';

const entity = (id: string, value: number): WorldEntity => ({
  ref: { kind: 'instrument', id }, label: id,
  properties: [{ key: 'reading', value }],
});
const state = (tick: number, entities: readonly WorldEntity[]) => buildWorldState({
  worldId: 'lab', domainId: 'physics', tick, entities, relations: [], observations: [], events: [],
  experiment: { experimentId: 'run-1', status: 'RUNNING', runs: [] }, epistemic: null, evidence: [], replay: null, notModeled: [],
});

class RecordingScene implements WorldScene {
  calls: string[] = [];
  createEntity(e: WorldEntity) { this.calls.push(`create:${e.ref.id}`); }
  updateEntity(e: WorldEntity) { this.calls.push(`update:${e.ref.id}`); }
  removeEntity(id: string) { this.calls.push(`remove:${id}`); }
  reset() { this.calls.push('reset'); }
  dispose() { this.calls.push('dispose'); }
}

describe('ScientificWorldRuntime', () => {
  it('projects deterministic snapshots without inventing presentation data', () => {
    const a = state(1, [entity('a', 3)]);
    const b = state(1, [entity('a', 3)]);
    expect(a.fingerprint).toBe(b.fingerprint);
    expect((new ScientificWorldRuntime(new RecordingScene())).load(a)).toEqual(expect.objectContaining({ fingerprint: a.fingerprint, entities: a.entities }));
  });

  it('synchronizes stable entities and removes absent entities', () => {
    const scene = new RecordingScene();
    const runtime = new ScientificWorldRuntime(scene);
    runtime.load(state(0, [entity('a', 1), entity('b', 2)]));
    runtime.sync(state(1, [entity('a', 4), entity('c', 3)]));
    expect(scene.calls).toEqual(['reset', 'create:a', 'create:b', 'remove:instrument:b', 'update:a', 'create:c']);
    expect(runtime.entitiesView().map((e) => e.id)).toEqual(['instrument:a', 'instrument:c']);
  });

  it('keeps lifecycle deterministic and replays the same snapshot sequence', () => {
    const scene = new RecordingScene();
    const runtime = new ScientificWorldRuntime(scene);
    const states = [state(0, [entity('a', 1)]), state(1, [entity('a', 2)])];
    const replay = runtime.replay(states);
    expect(replay.map((s) => s.fingerprint)).toEqual(states.map((s) => s.fingerprint));
    runtime.start(); expect(runtime.lifecycle).toBe('RUNNING');
    runtime.pause(); expect(runtime.lifecycle).toBe('PAUSED');
    runtime.resume(); expect(runtime.lifecycle).toBe('RUNNING');
    runtime.reset(); expect(runtime.lifecycle).toBe('CREATED');
    runtime.dispose(); expect(runtime.lifecycle).toBe('DISPOSED');
    expect(() => runtime.start()).toThrow('disposed');
  });
});
