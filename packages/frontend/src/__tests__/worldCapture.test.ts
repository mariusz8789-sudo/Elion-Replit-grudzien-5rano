import { describe, expect, it } from 'vitest';
import { buildWorldState } from '../core/world/scientificWorldState';
import { captureWorldTimeline } from '../core/world/worldCapture';
import type { ExperimentRun } from '../core/experimentFabric/types';

const run = { runId: 'run-1', request: { domainId: 'physics' } } as ExperimentRun;
const state = buildWorldState({ worldId: 'lab', domainId: 'physics', tick: 2, entities: [], relations: [], observations: [{ observationId: 'o-1', tick: 2, statement: 'measured', measurements: [], provenance: ['run-1'] }], events: [{ contractVersion: '1.0.0', id: 'e-1', type: 'observation.anomaly', timestamp: 2, affectedEntities: [], parameters: {} }], experiment: { experimentId: 'run-1', status: 'COMPLETED', runs: [] }, epistemic: null, evidence: [], replay: { status: 'MATCH', message: 'same' }, notModeled: [] });

describe('World capture adapter', () => {
  it('projects existing run/state provenance into a deterministic structural timeline', () => {
    const timeline = captureWorldTimeline(run, [state]);
    expect(timeline.runId).toBe('run-1');
    expect(timeline.snapshots).toEqual([{ tick: 2, fingerprint: state.fingerprint }]);
    expect(timeline.observations[0]?.observationId).toBe('o-1');
    expect(timeline.events[0]?.type).toBe('observation.anomaly');
    expect(timeline.markers.map((m) => m.kind)).toEqual(['EVENT', 'OBSERVATION', 'SNAPSHOT']);
    expect(timeline.replay?.status).toBe('MATCH');
  });
});
