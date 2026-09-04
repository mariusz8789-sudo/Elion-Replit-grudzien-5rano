import { canonicalJson, fnv1a } from '../events/hash';
import type { EntityRef, GenesisEvent } from '../events/genesisEvent';
import type { EpistemicGraph, EpistemicNode, UnknownExplanation } from '../discovery/epistemicEngine';
import { explainUnknown } from '../discovery/epistemicEngine';

/**
 * SCIENTIFIC WORLD STATE — the one generic contract a future Genesis World
 * Engine (owner: Manus) can render against, regardless of domain.
 *
 * CORE PRINCIPLE (non-negotiable):
 *   SCIENTIFIC STATE -> WORLD STATE -> RENDERER OBSERVES WORLD STATE
 * Never the reverse. Nothing in this file computes science: every field is
 * either read straight from an existing, already-real result (ScenarioRun,
 * a physics case, an epistemic graph) or derived by a pure, declared
 * transform of it. A renderer consuming `WorldState` can show it, animate
 * transitions between two of them, or ignore parts of it — it must never
 * invent a value this contract does not carry.
 *
 * REUSE, NOT DUPLICATION:
 *  - `EntityRef` / `GenesisEvent` are the EXISTING, domain-neutral event
 *    contract (`core/events/genesisEvent.ts`) — not redefined here.
 *  - `HypothesisState` / `EpistemicState` are the EXISTING Epistemic Engine
 *    types (`core/discovery/epistemicEngine.ts`) — not redefined here.
 *  - `ReplayState` mirrors the existing MATCH/DRIFT/NOT_COMPARABLE
 *    vocabulary already used by `scenarioEngine.ts` and the epistemic
 *    engine's own replay — kept as a plain union so either can be reported
 *    through the same field without adapting their own replay functions.
 *
 * This module intentionally does NOT introduce a competing simulation,
 * event, or replay system. It is a projection surface.
 */
export const SCIENTIFIC_WORLD_STATE_VERSION = '1.0.0';

/** A single scientific variable on an entity — generic across domains. */
export interface ScientificProperty {
  key: string;
  value: number | string | boolean;
  unit?: string;
}

/** A thing in the world a renderer can point a camera at. Spatial data, if any, lives in `properties` (e.g. 'x'/'y') — this contract does not mandate a coordinate scheme. */
export interface WorldEntity {
  ref: EntityRef;
  label: string;
  properties: readonly ScientificProperty[];
}

/** A relationship between two entities (e.g. containment, contact, causality target). */
export interface WorldRelation {
  from: EntityRef;
  to: EntityRef;
  kind: string;
}

/** A single numeric reading, always traceable to where it came from. */
export interface Measurement {
  key: string;
  value: number;
  unit?: string;
  tick: number;
  entity?: EntityRef;
  provenance: readonly string[];
}

/** A real, timestamped scientific observation — text plus the measurements it is grounded in. */
export interface Observation {
  observationId: string;
  tick: number;
  statement: string;
  measurements: readonly Measurement[];
  provenance: readonly string[];
}

/** Scientific events ARE GenesisEvents. No parallel event system. */
export type ScientificEvent = GenesisEvent;

export type ExperimentStatus = 'RUNNING' | 'COMPLETED' | 'NOT_MODELED' | 'BLOCKED';

export interface ExperimentState {
  experimentId: string;
  status: ExperimentStatus;
  inputFingerprint: string;
  resultFingerprint: string | null;
  notModeledReason?: string;
}

/** Hypotheses ARE Epistemic Engine nodes. No parallel hypothesis type. */
export type HypothesisState = EpistemicNode;
/** The epistemic state of a world IS an Epistemic Engine graph. */
export type EpistemicState = EpistemicGraph;

/** A pointer to real evidence backing a claim — a locator, not a copy of the evidence. */
export interface EvidenceReference {
  evidenceId: string;
  sourceKind: string;
  locator: string;
}

export type ReplayStatus = 'MATCH' | 'DRIFT' | 'NOT_COMPARABLE';

export interface ReplayState {
  status: ReplayStatus;
  message: string;
}

/**
 * ONE domain-agnostic world state. A `ScientificWorld` is an ordered series
 * of these. `notModeled` is mandatory and explicit — a domain that has
 * nothing to say about a concept (e.g. physics has no `entities` beyond a
 * couple of reference bodies) declares that, rather than a renderer
 * discovering an empty array and guessing why.
 */
export interface WorldState {
  contractVersion: string;
  worldId: string;
  domainId: string;
  /** Discrete simulation/experiment time step this state represents. Unit is domain-defined (e.g. day, event-index). */
  tick: number;
  entities: readonly WorldEntity[];
  relations: readonly WorldRelation[];
  observations: readonly Observation[];
  events: readonly ScientificEvent[];
  experiment: ExperimentState;
  /** Null only when this world state has no epistemic layer at all (not merely "no changes yet"). */
  epistemic: EpistemicState | null;
  evidence: readonly EvidenceReference[];
  /** Null until a replay has actually been attempted against this state's own run. */
  replay: ReplayState | null;
  notModeled: readonly string[];
  fingerprint: string;
}

export type BuildWorldStateInput = Omit<WorldState, 'contractVersion' | 'fingerprint'>;

/** The only way to construct a `WorldState` — guarantees the fingerprint always matches the declared content. */
export function buildWorldState(input: BuildWorldStateInput): WorldState {
  const base = { contractVersion: SCIENTIFIC_WORLD_STATE_VERSION, ...input };
  const fingerprint = fnv1a(canonicalJson(base));
  return { ...base, fingerprint };
}

/** A scientific world over time: one id/domain, an ordered series of real states. */
export interface ScientificWorld {
  worldId: string;
  domainId: string;
  states: readonly WorldState[];
}

export function buildScientificWorld(worldId: string, domainId: string, states: readonly WorldState[]): ScientificWorld {
  return { worldId, domainId, states };
}

/**
 * UNKNOWN AS FIRST-CLASS STATE — a thin pass-through, not a reimplementation.
 * Calls the existing `explainUnknown` on this state's own epistemic graph.
 * Returns null (not a guess) when the state carries no epistemic layer or
 * the node id does not name an UNKNOWN node in it.
 */
export function explainWorldUnknown(state: WorldState, nodeId: string): UnknownExplanation | null {
  if (!state.epistemic) return null;
  const node = state.epistemic.nodes.find((n) => n.nodeId === nodeId);
  if (!node || node.status !== 'UNKNOWN') return null;
  return explainUnknown(state.epistemic, nodeId);
}

/** Machine-readable causal lineage for one scientific event already present in this state: WORLD CHANGE -> ENTITY -> EVENT -> (HYPOTHESES it bears on, via the epistemic graph's own provenance). */
export interface WorldChangeTrace {
  event: ScientificEvent;
  affectedEntities: readonly WorldEntity[];
  /** Hypotheses whose `provenance` names this event's id — real cross-reference, not inferred. */
  relatedHypotheses: readonly HypothesisState[];
  /** The causal parent event, if any (GenesisEvent.parentEventId), so a renderer can walk the chain backward without recomputation. */
  parentEvent: ScientificEvent | null;
}

export function traceWorldChange(state: WorldState, eventId: string): WorldChangeTrace | null {
  const event = state.events.find((e) => e.id === eventId);
  if (!event) return null;
  const affectedIds = new Set(event.affectedEntities.map((r) => `${r.kind}:${r.id}`));
  const affectedEntities = state.entities.filter((e) => affectedIds.has(`${e.ref.kind}:${e.ref.id}`));
  const relatedHypotheses = state.epistemic
    ? state.epistemic.nodes.filter((n) => n.provenance.some((p) => p.includes(eventId)))
    : [];
  const parentEvent = event.parentEventId ? (state.events.find((e) => e.id === event.parentEventId) ?? null) : null;
  return { event, affectedEntities, relatedHypotheses, parentEvent };
}
