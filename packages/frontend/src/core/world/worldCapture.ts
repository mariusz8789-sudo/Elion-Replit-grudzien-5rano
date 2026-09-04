import type { ExperimentRun } from '../experimentFabric/types';
import type { WorldState } from './scientificWorldState';

export interface WorldCaptureMarker { readonly tick: number; readonly kind: 'OBSERVATION' | 'EVENT' | 'SNAPSHOT'; readonly id: string; }
export interface WorldCaptureTimeline {
  readonly runId: string;
  readonly worldId: string;
  readonly snapshots: readonly { tick: number; fingerprint: string }[];
  readonly observations: readonly { tick: number; observationId: string; statement: string }[];
  readonly events: readonly { tick: number; eventId: string; type: string }[];
  readonly markers: readonly WorldCaptureMarker[];
  readonly replay: WorldState['replay'];
}

/** Structural capture only: no video, no copied scientific results, no second replay. */
export function captureWorldTimeline(run: ExperimentRun | null, states: readonly WorldState[]): WorldCaptureTimeline {
  const snapshots = states.map((state) => ({ tick: state.tick, fingerprint: state.fingerprint }));
  const observations = states.flatMap((state) => state.observations.map((observation) => ({ tick: observation.tick, observationId: observation.observationId, statement: observation.statement })));
  const events = states.flatMap((state) => state.events.map((event) => ({ tick: event.timestamp, eventId: event.id, type: event.type })));
  const markers: WorldCaptureMarker[] = [
    ...snapshots.map((snapshot) => ({ tick: snapshot.tick, kind: 'SNAPSHOT' as const, id: snapshot.fingerprint })),
    ...observations.map((observation) => ({ tick: observation.tick, kind: 'OBSERVATION' as const, id: observation.observationId })),
    ...events.map((event) => ({ tick: event.tick, kind: 'EVENT' as const, id: event.eventId })),
  ].sort((a, b) => a.tick - b.tick || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  return { runId: run?.runId ?? states[0]?.experiment.experimentId ?? 'live-world', worldId: states[0]?.worldId ?? run?.request.domainId ?? 'unknown', snapshots, observations, events, markers, replay: states.at(-1)?.replay ?? null };
}
