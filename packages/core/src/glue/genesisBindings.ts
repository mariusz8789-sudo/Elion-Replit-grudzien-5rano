/* Proprietary / All Rights Reserved - Genesis OS */
import type { HypothesisTournament } from '../engine/hypothesisTournament.js';
import type { SensorWebhookStream, C3StateUpdate } from '../connectors/sensorWebhookStream.js';
import type { GisOpenUSDAdapter, EcsSpatialEntity } from '../connectors/gisOpenUSDAdapter.js';
/** Structural minimal contracts for existing Genesis modules (Claude maps to real repo APIs). */
export interface WorldGraph { addNode(node: { id: string; kind: string; position: readonly [number, number, number]; attrs: Readonly<Record<string, unknown>> }): void; }
export interface TemporalEngine { now(): number; }
export interface ObservationDirector { record(obs: { kind: string; payload: unknown; at: number }): void; }
export function bindTournamentToDirector(t: HypothesisTournament, d: ObservationDirector, clock: { now(): number }): void {
  for (const id of t.gatedRejects()) d.record({ kind: 'HYPOTHESIS_REJECT_UNPHYSICAL', payload: { hypothesisId: id, reasons: t.getStandings().find(e => e.hypothesis.id === id)?.rejectionReasons ?? [] }, at: clock.now() });
  for (const f of t.getUngroundedFlags()) d.record({ kind: 'UNGROUNDED_STATE_FLAG', payload: { flag: f }, at: clock.now() });
}
export function bindSensorStreamToTemporal(s: SensorWebhookStream, temporal: TemporalEngine, d: ObservationDirector): () => readonly C3StateUpdate[] {
  const before = s.getUpdates().length;
  return () => { const fresh = s.getUpdates().slice(before); for (const u of fresh) if (u.driftFlag !== 'OK') d.record({ kind: 'SENSOR_DRIFT', payload: { update: u }, at: temporal.now() }); return s.getUpdates(); };
}
export function bindGisToWorldGraph(a: GisOpenUSDAdapter, entities: readonly EcsSpatialEntity[], wg: WorldGraph): void {
  const patch = a.toWorldGraphPatch(entities);
  for (const n of patch.addNodes) wg.addNode({ id: n.entityId, kind: n.kind, position: n.position, attrs: n.attrs });
}
