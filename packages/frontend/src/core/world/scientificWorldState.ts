import { canonicalJson, fnv1a } from '../events/hash';
import type { EntityRef, GenesisEvent } from '../events/genesisEvent';
import type { HypothesisLoopReplayStatus, HypothesisLoopResult } from '../experimentFabric/hypothesisLoop';
import type { ExperimentRun } from '../experimentFabric/types';

/**
 * SCIENTIFIC WORLD STATE — the generic, domain-agnostic read model this
 * branch was missing (Phase B). It is NOT a second epistemic engine, event
 * system, or replay protocol:
 *
 *  - `ScientificEvent` IS the existing `GenesisEvent` (`events/genesisEvent.ts`,
 *    byte-identical across Genesis branches) — no parallel event type.
 *  - `EpistemicState` IS the existing `HypothesisLoopResult`
 *    (`experimentFabric/hypothesisLoop.ts`) — this branch's real epistemic
 *    vocabulary is `HypothesisStatus` (HYPOTHESIS/PRE_REGISTERED/SUPPORTED/
 *    FALSIFIED/INCONCLUSIVE/BLOCKED/UNKNOWN), already reused unchanged by
 *    `beliefChangeRun.ts`. This module does NOT build a FACT/DERIVED/MODEL
 *    graph that does not exist here — that would be exactly the "second
 *    ontology" the mission forbids.
 *  - `ReplayState.status` reuses `HypothesisLoopReplayStatus` (MATCH/DRIFT/
 *    BLOCKED) verbatim.
 *  - `ActiveExperiment` IS the existing `ExperimentRun` (`experimentFabric/types.ts`).
 *
 * CORE PRINCIPLE: SCIENTIFIC STATE -> WORLD STATE -> RENDERER OBSERVES.
 * Every field is either a direct reference to an already-real, already-
 * computed structure, or a pure projection of one. Nothing here computes
 * science; `buildWorldState` only assembles and fingerprints what it is
 * given.
 */
export const SCIENTIFIC_WORLD_STATE_VERSION = '1.0.0';

export interface ScientificProperty {
  key: string;
  value: number | string | boolean;
  unit?: string;
}

export interface WorldEntity {
  ref: EntityRef;
  label: string;
  properties: readonly ScientificProperty[];
}

export interface WorldRelation {
  from: EntityRef;
  to: EntityRef;
  kind: string;
}

export interface Measurement {
  key: string;
  value: number;
  unit?: string;
  tick: number;
  entity?: EntityRef;
  provenance: readonly string[];
}

export interface Observation {
  observationId: string;
  tick: number;
  statement: string;
  measurements: readonly Measurement[];
  provenance: readonly string[];
}

/** Scientific events ARE GenesisEvents — no parallel event system. */
export type ScientificEvent = GenesisEvent;

export type ExperimentStatus = 'RUNNING' | 'COMPLETED' | 'NOT_MODELED' | 'BLOCKED';

export interface ActiveExperimentState {
  experimentId: string;
  status: ExperimentStatus;
  /** The canonical run(s) this world state's experiment field is projecting — real ExperimentRun records, never copies. */
  runs: readonly ExperimentRun[];
  notModeledReason?: string;
}

/** The epistemic state of a world IS a real HypothesisLoopResult — this branch's actual, already-tested belief-tracking structure. Null only when this world state has no hypothesis loop behind it at all. */
export type EpistemicState = HypothesisLoopResult;

export interface EvidenceReference {
  evidenceId: string;
  sourceKind: string;
  locator: string;
}

export interface ReplayState {
  status: HypothesisLoopReplayStatus | 'NOT_COMPARABLE';
  message: string;
}

export interface WorldState {
  contractVersion: string;
  worldId: string;
  domainId: string;
  /** Discrete simulation/experiment step this state represents (unit is domain-defined: day, sweep-index, ...). */
  tick: number;
  entities: readonly WorldEntity[];
  relations: readonly WorldRelation[];
  observations: readonly Observation[];
  events: readonly ScientificEvent[];
  experiment: ActiveExperimentState;
  epistemic: EpistemicState | null;
  evidence: readonly EvidenceReference[];
  replay: ReplayState | null;
  notModeled: readonly string[];
  fingerprint: string;
}

export type BuildWorldStateInput = Omit<WorldState, 'contractVersion' | 'fingerprint'>;

/** The only way to construct a `WorldState` — the fingerprint always matches the declared content, so tampering after construction is detectable (see test #10 in scientificWorldState.test.ts). */
export function buildWorldState(input: BuildWorldStateInput): WorldState {
  const base = { contractVersion: SCIENTIFIC_WORLD_STATE_VERSION, ...input };
  const fingerprint = fnv1a(canonicalJson(base));
  return { ...base, fingerprint };
}

export interface ScientificWorld {
  worldId: string;
  domainId: string;
  states: readonly WorldState[];
}

export function buildScientificWorld(worldId: string, domainId: string, states: readonly WorldState[]): ScientificWorld {
  return { worldId, domainId, states };
}

/**
 * Machine-readable causal lineage for one event already present in this
 * state: WORLD CHANGE -> ENTITY -> EVENT -> (which hypotheses' own
 * provenance names this event, read live from the real epistemic state).
 */
export interface WorldChangeTrace {
  event: ScientificEvent;
  affectedEntities: readonly WorldEntity[];
  relatedHypothesisIds: readonly string[];
  parentEvent: ScientificEvent | null;
}

export function traceWorldChange(state: WorldState, eventId: string): WorldChangeTrace | null {
  const event = state.events.find((e) => e.id === eventId);
  if (!event) return null;
  const affectedIds = new Set(event.affectedEntities.map((r) => `${r.kind}:${r.id}`));
  const affectedEntities = state.entities.filter((e) => affectedIds.has(`${e.ref.kind}:${e.ref.id}`));
  const relatedHypothesisIds = state.epistemic && event.experimentId
    ? state.epistemic.outcomes.filter((o) => o.runIds.includes(event.experimentId!)).map((o) => o.hypothesisId)
    : [];
  const parentEvent = event.parentEventId ? (state.events.find((e) => e.id === event.parentEventId) ?? null) : null;
  return { event, affectedEntities, relatedHypothesisIds, parentEvent };
}

/**
 * UNKNOWN AS FIRST-CLASS STATE. This branch's real "unknown" signal is a
 * hypothesis outcome whose status could not be resolved
 * (`INCONCLUSIVE`/`BLOCKED`) or a candidate that was never generated
 * because a declared model/lever did not exist
 * (`HypothesisProblem`/`PreregisteredHypothesis.blockedReason`). This is a
 * thin, read-only summary over the real `HypothesisLoopResult` — it never
 * upgrades an unresolved hypothesis into a guess.
 */
export interface UnknownSummary {
  hypothesisId: string;
  statement: string;
  status: 'INCONCLUSIVE' | 'BLOCKED';
  reason: string;
}

export function listUnknowns(state: WorldState): readonly UnknownSummary[] {
  if (!state.epistemic) return [];
  return state.epistemic.outcomes
    .filter((o): o is typeof o & { status: 'INCONCLUSIVE' | 'BLOCKED' } => o.status === 'INCONCLUSIVE' || o.status === 'BLOCKED')
    .map((o) => {
      const hypothesis = state.epistemic!.preregistration.hypotheses.find((h) => h.hypothesisId === o.hypothesisId);
      return { hypothesisId: o.hypothesisId, statement: hypothesis?.statement ?? 'UNKNOWN', status: o.status, reason: o.reason };
    });
}
