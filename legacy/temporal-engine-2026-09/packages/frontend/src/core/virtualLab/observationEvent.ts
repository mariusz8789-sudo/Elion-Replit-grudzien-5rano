import { canonicalJson, fnv1a } from '../events/hash';
import type { ScenarioDaySample, ScenarioRun } from '../simulation/scenarioEngine';
import type { HospitalStatus } from '../simulation/hospitalResource';

/**
 * OBSERVATION EVENT — a domain-agnostic "something worth watching just
 * happened" fact, derived PURELY from real per-tick simulation state.
 *
 * THE RULE THIS FILE ENFORCES: an ObservationEvent is never invented, timed
 * for drama, or picked to favour one outcome. Every event here is a pure
 * function of two adjacent `ScenarioDaySample`s (or the final summary) that
 * the existing `runScenario()` already produced — nothing here re-derives,
 * mocks, or guesses simulation state. This is intentionally NOT
 * "AquariumObservationEvent" or "EpidemicObservationEvent": the vocabulary
 * (STATE_CHANGE / THRESHOLD_CROSSED / ANOMALY / EXPERIMENT_COMPLETE) applies
 * to any executor whose per-tick state can be diffed this way.
 */
export const OBSERVATION_EVENT_VERSION = '1.0.0';

export type ObservationEventType =
  | 'STATE_CHANGE'
  | 'THRESHOLD_CROSSED'
  | 'PREDICTION_MATCH'
  | 'PREDICTION_DIVERGENCE'
  | 'ANOMALY'
  | 'EXPERIMENT_COMPLETE';

export type ObservationImportance = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface ObservationEvent {
  eventId: string;
  type: ObservationEventType;
  /** Simulation day/tick this event was observed at — the model's own clock, never wall-clock. */
  tick: number;
  importance: ObservationImportance;
  /** What the event is about (e.g. "hospital"). Generic string, not a domain-specific enum. */
  targetId: string;
  /** Human-readable, built entirely from the real values in `data`. */
  statement: string;
  /** The exact real numbers/strings that triggered this event — the provenance a viewer (or a later social clip) can point to. */
  data: Readonly<Record<string, number | string | null>>;
}

function buildEvent(input: Omit<ObservationEvent, 'eventId'>): ObservationEvent {
  const eventId = fnv1a(canonicalJson({ v: OBSERVATION_EVENT_VERSION, ...input }));
  return { ...input, eventId };
}

const STATUS_RANK: Record<HospitalStatus, number> = { NORMAL: 0, WARNING: 1, HIGH: 2, CRITICAL: 3 };
const STATUS_IMPORTANCE: Record<HospitalStatus, ObservationImportance> = { NORMAL: 'LOW', WARNING: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL' };

/**
 * Derives the observation event for ONE real day-transition, or `null` when
 * nothing worth observing changed. Pure and incremental by design: usable
 * both over a full `ScenarioRun.series` (below) and, later, inside a live
 * tick loop that only ever has "yesterday" and "today" in hand.
 */
export function deriveObservationEventForTransition(
  previous: ScenarioDaySample | null,
  current: ScenarioDaySample,
): ObservationEvent | null {
  const targetId = 'hospital';
  if (previous === null) {
    return buildEvent({
      type: 'STATE_CHANGE', tick: current.day, importance: 'LOW', targetId,
      statement: `Day ${current.day}: system begins at ${(current.hospital.bedOccupancy * 100).toFixed(0)}% bed occupancy (${current.hospital.status}).`,
      data: { day: current.day, bedOccupancy: current.hospital.bedOccupancy, status: current.hospital.status },
    });
  }

  if (previous.hospital.status !== current.hospital.status) {
    const rising = STATUS_RANK[current.hospital.status] > STATUS_RANK[previous.hospital.status];
    return buildEvent({
      type: current.hospital.status === 'CRITICAL' ? 'ANOMALY' : 'THRESHOLD_CROSSED',
      tick: current.day,
      importance: STATUS_IMPORTANCE[current.hospital.status],
      targetId,
      statement: `Day ${current.day}: hospital status ${rising ? 'worsened' : 'improved'} from ${previous.hospital.status} to ${current.hospital.status} (bed occupancy ${(current.hospital.bedOccupancy * 100).toFixed(0)}%, ICU ${(current.hospital.icuOccupancy * 100).toFixed(0)}%).`,
      data: {
        day: current.day, previousStatus: previous.hospital.status, status: current.hospital.status,
        bedOccupancy: current.hospital.bedOccupancy, icuOccupancy: current.hospital.icuOccupancy, unmetCare: current.hospital.unmetCare,
      },
    });
  }

  if (previous.hospital.unmetCare === 0 && current.hospital.unmetCare > 0) {
    return buildEvent({
      type: 'ANOMALY', tick: current.day, importance: 'CRITICAL', targetId,
      statement: `Day ${current.day}: capacity exceeded — ${current.hospital.unmetCare} patient(s) requiring care have no bed.`,
      data: { day: current.day, unmetCare: current.hospital.unmetCare },
    });
  }

  return null;
}

/** Runs the incremental derivation over a full, already-computed series. */
export function deriveObservationEventsFromScenarioRun(run: ScenarioRun): readonly ObservationEvent[] {
  const events: ObservationEvent[] = [];
  let previous: ScenarioDaySample | null = null;
  for (const sample of run.series) {
    const event = deriveObservationEventForTransition(previous, sample);
    if (event !== null) events.push(event);
    previous = sample;
  }

  const last = run.series[run.series.length - 1];
  if (last !== undefined) {
    const held = run.summary === null || run.summary.firstCriticalDay === null;
    events.push(buildEvent({
      type: 'EXPERIMENT_COMPLETE',
      tick: last.day,
      importance: 'HIGH',
      targetId: 'hospital',
      statement: held
        ? `Experiment complete: capacity held for all ${run.series.length} day(s) — peak bed occupancy ${((run.summary?.peakBedOccupancy ?? last.hospital.bedOccupancy) * 100).toFixed(0)}%.`
        : `Experiment complete: capacity was first exceeded on day ${run.summary!.firstCriticalDay} — peak bed occupancy ${(run.summary!.peakBedOccupancy * 100).toFixed(0)}%.`,
      data: {
        totalDays: run.series.length,
        peakBedOccupancy: run.summary?.peakBedOccupancy ?? null,
        firstCriticalDay: run.summary?.firstCriticalDay ?? null,
      },
    }));
  }

  return events;
}
