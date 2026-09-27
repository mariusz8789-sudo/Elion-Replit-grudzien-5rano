import { describe, expect, it } from 'vitest';
import { runScenario } from '../core/simulation/scenarioEngine';
import { projectEpidemiologyWorldStates } from '../core/world/epidemiologyWorldAdapter';
import {
  GenericWorldRuntime,
  GenericWorldScene,
  InMemoryWorldEventBridge,
  ReadOnlyWorldInteractionHandler,
} from '../core/world/experienceFoundation';

describe('experience-side WorldRuntime foundation', () => {
  it('consumes real ScientificWorldState without modifying the scientific source', () => {
    const run = runScenario('BASELINE', { days: 12, stepsPerDay: 2 });
    const states = projectEpidemiologyWorldStates(run);
    const sourceFingerprint = states[0]!.fingerprint;
    const events: string[] = [];
    const bridge = new InMemoryWorldEventBridge();
    bridge.subscribe((event) => events.push(event.id));
    const scene = new GenericWorldScene();
    const runtime = new GenericWorldRuntime(scene, bridge);

    const firstSync = runtime.sync(states[0]!);
    expect(firstSync.stateFingerprint).toBe(sourceFingerprint);
    expect(firstSync.syncedEntityIds).toEqual(['facility:hospital', 'population:city']);
    expect(scene.getEntityViews().map((view) => view.scientificRef.id)).toEqual(['hospital', 'city']);
    expect(scene.getEntityView({ kind: 'facility', id: 'hospital' })?.visualState.bedOccupancy).toBe(
      states[0]!.entities[0]!.properties.find((property) => property.key === 'bedOccupancy')!.value,
    );
    expect(scene.state).toBe(states[0]);
    expect(states[0]!.fingerprint).toBe(sourceFingerprint);
    expect(events).toEqual(states[0]!.events.map((event) => event.id));
  });

  it('provides the full lifecycle and replays the same snapshots deterministically', () => {
    const states = projectEpidemiologyWorldStates(runScenario('BASELINE', { days: 8, stepsPerDay: 2 }));
    const runtime = new GenericWorldRuntime();
    expect(runtime.phase).toBe('CREATED');
    runtime.load(states[0]!.worldId);
    expect(runtime.phase).toBe('READY');
    runtime.sync(states[0]!);
    runtime.run();
    expect(runtime.phase).toBe('RUNNING');
    runtime.pause();
    expect(runtime.phase).toBe('PAUSED');
    runtime.resume();
    expect(runtime.phase).toBe('RUNNING');
    const replay = runtime.replay(states);
    expect(replay).toHaveLength(states.length);
    expect(runtime.phase).toBe('PAUSED');
    expect(runtime.snapshot()?.stateFingerprint).toBe(states.at(-1)!.fingerprint);
    expect(runtime.snapshot()?.tick).toBe(states.at(-1)!.tick);
    runtime.reset();
    expect(runtime.phase).toBe('RESET');
    expect(runtime.snapshot()).toBeNull();
    runtime.dispose();
    expect(runtime.phase).toBe('DISPOSED');
  });

  it('keeps visual identity stable while syncing a changed WorldState', () => {
    const states = projectEpidemiologyWorldStates(runScenario('BASELINE', { days: 16, stepsPerDay: 2 }));
    const scene = new GenericWorldScene();
    const first = scene.sync(states[0]!);
    const firstHospitalView = scene.getEntityView({ kind: 'facility', id: 'hospital' });
    const second = scene.sync(states.at(-1)!);
    const secondHospitalView = scene.getEntityView({ kind: 'facility', id: 'hospital' });
    expect(first.revision).toBe(1);
    expect(second.revision).toBe(2);
    expect(secondHospitalView?.viewId).toBe(firstHospitalView?.viewId);
    expect(secondHospitalView?.scientificRef).toEqual(firstHospitalView?.scientificRef);
    expect(secondHospitalView?.syncRevision).toBe(1);
  });

  it('does not let the experience layer mutate scientific state through interaction', () => {
    const handler = new ReadOnlyWorldInteractionHandler();
    const result = handler.handle({
      requestId: 'interaction-1',
      kind: 'ACTIVATE',
      target: { kind: 'facility', id: 'hospital' },
      tick: 4,
      source: 'USER',
    });
    expect(result).toEqual({
      requestId: 'interaction-1',
      status: 'NOT_AVAILABLE',
      reason: 'No scientific capability is registered for ACTIVATE on facility:hospital.',
      scientificStateChanged: false,
    });
  });
});
