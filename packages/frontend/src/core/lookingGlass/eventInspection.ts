import type { EntityRef, GenesisEvent, GenesisLocation } from '../events/genesisEvent';
import type { WorldState } from '../world/scientificWorldState';
import type { EvidenceRef, WorldMarkerTime, WorldObservable } from './scenarioWorld';

/**
 * LOOKING GLASS — EVENTS YOU CAN INTERROGATE.
 *
 * The capture timeline flattens every event to `{tick, id, type}`, which is
 * all a shot plan needs to decide where to cut — and is why an event in the
 * world could not be inspected. `GenesisEvent` already carries far more:
 * where it happened, how severe it was, what caused it, what it affected,
 * which event it descended from, and the seed and parameter hash that make
 * it reproducible. This module reads the real event rather than the
 * flattened marker, and assembles the chain
 *
 *   event → time → location → state → observation → evidence → replay
 *
 * so a user who encounters something in the world can ask what it was and
 * get an answer that is checkable rather than atmospheric.
 *
 * WHAT IT REFUSES TO DO. Every field it cannot establish is null, and the
 * caller is expected to say so. An epidemiological run-completed event
 * genuinely has no coordinates, so `location` is null and the UI must print
 * "not modelled for this event" rather than an authoritative-sounding
 * "Street sector A". Inventing a plausible location is the same failure as
 * inventing a plausible day: it survives inspection, which is what makes it
 * dangerous.
 */

/**
 * Domain-independent event semantics. Derived from the dotted SUFFIX of the
 * canonical type, never from its domain prefix, so `infection.transmission`
 * and `reaction.transmission` classify identically and a new domain needs no
 * entry here. This is the "no `if epidemic then`" rule expressed as code.
 */
export type EventSemanticKind =
  | 'STATE_CHANGE' | 'THRESHOLD_CROSSING' | 'OBSERVATION' | 'INTERVENTION'
  | 'FAILURE' | 'ANOMALY' | 'TRANSITION' | 'ALERT' | 'UNCLASSIFIED';

const SUFFIX_SEMANTICS: readonly { readonly match: RegExp; readonly kind: EventSemanticKind }[] = [
  { match: /threshold[-.]?crossed$/i, kind: 'THRESHOLD_CROSSING' },
  { match: /anomaly$/i, kind: 'ANOMALY' },
  { match: /(divergence|drift|mismatch|failed|failure|error)$/i, kind: 'FAILURE' },
  { match: /(observation|observed|measurement|reading)$/i, kind: 'OBSERVATION' },
  { match: /(intervention|applied|isolation|quarantine|treatment|dose)$/i, kind: 'INTERVENTION' },
  { match: /(completed|complete|finished|started|begin|transition)$/i, kind: 'TRANSITION' },
  { match: /(alert|warning|critical|breach)$/i, kind: 'ALERT' },
  { match: /(transmission|change|changed|update|updated|match|simulated|computed|projected|derived|sampled)$/i, kind: 'STATE_CHANGE' },
];

export function classifyEvent(type: string): EventSemanticKind {
  const suffix = type.slice(type.lastIndexOf('.') + 1);
  return SUFFIX_SEMANTICS.find((entry) => entry.match.test(suffix))?.kind ?? 'UNCLASSIFIED';
}

/** Whether this exact moment can be returned to, and if not, why. */
export interface ReplayAvailability {
  readonly available: boolean;
  /** MATCH / DRIFT / BLOCKED from the existing replay protocol, or null. */
  readonly status: string | null;
  readonly reason: string | null;
  /** The seed that reproduces the run, when the event recorded one. */
  readonly seed: number | string | null;
  /** Parameter fingerprint at the moment of the event. */
  readonly paramsHash: string | null;
}

export interface InspectableEvent {
  readonly id: string;
  readonly type: string;
  readonly semanticKind: EventSemanticKind;
  readonly time: WorldMarkerTime;
  /** Null when the model genuinely places nothing in space. Never guessed. */
  readonly location: GenesisLocation | null;
  /** 0..1, or null when the model does not grade this event. */
  readonly severity: number | null;
  readonly cause: string | null;
  /** The event this one descended from — the causal chain, already recorded. */
  readonly parentEventId: string | null;
  readonly affectedEntities: readonly EntityRef[];
  /** Index of the state this event belongs to, when it maps to one. */
  readonly stateIndex: number | null;
  readonly observations: readonly WorldObservable[];
  readonly evidence: EvidenceRef | null;
  readonly modelId: string | null;
  readonly experimentId: string | null;
  readonly origin: string | null;
  readonly replay: ReplayAvailability;
}

/**
 * Replay is offered only on a verified MATCH. DRIFT and BLOCKED already fail
 * closed elsewhere in Genesis — a drifting run never reaches the world — and
 * offering a replay button that silently produced different numbers would be
 * worse than offering none.
 */
function replayFor(state: WorldState | null, event: GenesisEvent): ReplayAvailability {
  const status = state?.replay?.status ?? null;
  const provenance = event.provenance;
  const seed = provenance?.seed ?? null;
  const paramsHash = provenance?.paramsHash ?? null;
  if (status === 'MATCH') {
    return { available: true, status, reason: null, seed, paramsHash };
  }
  return {
    available: false,
    status,
    reason: status === null
      ? 'this run carries no replay verdict, so the moment cannot be verified as reproducible'
      : `replay verdict is ${status}; only a verified MATCH may be returned to`,
    seed,
    paramsHash,
  };
}

export interface InspectionSource {
  readonly states: readonly WorldState[];
  readonly observables: readonly WorldObservable[];
  readonly getEvidence: (markerId: string) => EvidenceRef | null;
  readonly viewerTicks: readonly number[];
}

/**
 * Builds the inspectable view of every real event in the run. Pure over what
 * the adapters produced; it computes no science and creates no event.
 */
export function collectInspectableEvents(source: InspectionSource): readonly InspectableEvent[] {
  const viewerTicks = new Set(source.viewerTicks);
  const inspectable: InspectableEvent[] = [];

  source.states.forEach((state, stateIndex) => {
    for (const event of state.events) {
      // Observations recorded against the same state are the ones that speak
      // to this event; anything further would be an inferred association.
      const observations = source.observables.filter((observable) => observable.time.tick === state.tick);
      inspectable.push({
        id: event.id,
        type: event.type,
        semanticKind: classifyEvent(event.type),
        time: {
          tick: event.timestamp,
          axis: 'WORLD_TIME',
          onViewerClock: viewerTicks.has(event.timestamp),
        },
        location: event.location ?? null,
        severity: event.severity ?? null,
        cause: event.cause ?? null,
        parentEventId: event.parentEventId ?? null,
        affectedEntities: event.affectedEntities,
        stateIndex,
        observations,
        evidence: source.getEvidence(event.id),
        modelId: event.modelId ?? event.provenance?.modelId ?? null,
        experimentId: event.experimentId ?? event.provenance?.experimentId ?? null,
        origin: event.provenance?.origin ?? null,
        replay: replayFor(state, event),
      });
    }
  });

  return inspectable;
}

/**
 * Walks `parentEventId` back to the root. The chain is recorded by the
 * models themselves, so this reports causality rather than inferring it —
 * and it stops at an unknown id instead of guessing a link.
 */
export function causalChainOf(
  eventId: string,
  events: readonly InspectableEvent[],
): readonly InspectableEvent[] {
  const byId = new Map(events.map((event) => [event.id, event]));
  const chain: InspectableEvent[] = [];
  const seen = new Set<string>();
  let current = byId.get(eventId) ?? null;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.push(current);
    current = current.parentEventId ? byId.get(current.parentEventId) ?? null : null;
  }
  return chain;
}
