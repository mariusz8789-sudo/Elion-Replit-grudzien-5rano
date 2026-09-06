import type { GenesisEvent } from '../../events/genesisEvent';
import { getFrameState, type WorldFrameState } from '../bridge/worldFrameState';
import type { EntityId } from '../ecs/types';
import type { WorldGraph } from '../ecs/worldGraph';
import { realizeProposal, validateProposal, type ProposalValidationResult, type WorldModelProposal, type WorldModelProposalProvenance } from '../generation/worldModelProposal';
import { generateSpecifiedWorld, type SpecifiedWorld } from '../specification/compiler';
import { validateSpecification, type SpecificationValidationResult } from '../specification/validation';
import type { WorldSpecification } from '../specification/worldSpecification';
import { TemporalEngine, type TemporalFrame } from '../temporal/temporalEngine';

/**
 * TRINITY WORLD CREATION API (Genesis Scientific World Model 3.0, section
 * 5) — the ONE canonical orchestration entry point from either a
 * `WorldModelProposal` (from an LLM, a script, a user, or another system —
 * see generation/worldModelProposal.ts) or a hand-authored
 * `WorldSpecification`, all the way to a live, tickable world with its
 * first real `WorldFrame` ready for C2 to render and C1 to observe.
 *
 * This is intentionally a THIN ADAPTER, not a new subsystem: every step is
 * an existing, already-tested function
 * (`validateProposal`/`realizeProposal`/`generateSpecifiedWorld`/
 * `TemporalEngine`/`getFrameState`) called in the established order. It
 * introduces no new validation rule, no new generation mechanism, and no
 * new temporal/branch logic — only the composition.
 *
 * THE C1 LOOKING GLASS HANDOFF CONTRACT (Priority 1.3 — documented here,
 * not implemented in C1's own files, since that boundary belongs to a
 * future C1 session):
 *
 * `core/lookingGlass/scenarioResolution.ts` today resolves a natural-
 * language scenario request purely through its own fixed
 * `SCENARIO_CAPABILITIES` table (EPIDEMIC/QUARANTINE/CELL_CULTURE/
 * LAB_EXPERIMENT/CHEMICAL_REACTION/PARTICLE_SYSTEM), never touching C3's
 * real World Model. To route a "create/describe a scientific world"
 * intent through C3 instead of inventing a parallel path, that resolver
 * (or whatever calls it) needs exactly THIS function's return shape:
 *
 *   1. Turn the resolved natural-language request into a `WorldModelProposal`
 *      via `resolveWorldProposal` (generation/resolveWorldProposal.ts) —
 *      C1 supplies the prompt text and a deterministic-fallback request,
 *      never touches `WorldGraph`/`TemporalEngine` itself.
 *   2. Call `createScientificWorld({ kind: 'proposal', proposal })` — this
 *      function, unchanged.
 *   3. Use `result.engine` as the scenario's live, tickable world (never a
 *      second engine); `result.worldFrame` for whatever `WorldFrameRenderer`
 *      C2 hands back; `result.focalEntityIds` as the initial camera
 *      target(s) for `ObservationCameraPolicy`/`CameraRig` — no separate
 *      "where should the camera start" heuristic needs inventing on C1's
 *      side, since it is already derived here from the SAME specification.
 *
 * Nothing above requires touching this file again — `focalEntityIds` is
 * already computed from `WorldSpecification.requestedObservables` (a field
 * that existed but had no consumer until now) or, failing that, the
 * world's own structural root(s), so a proposal that names what the user
 * actually asked to see already gets a meaningful focal point for free.
 */
export type CreateScientificWorldRequest =
  | { kind: 'proposal'; proposal: WorldModelProposal }
  | { kind: 'specification'; specification: WorldSpecification };

export interface CreateScientificWorldResult {
  worldId: string;
  specification: WorldSpecification;
  /** The specification's own scientific validation (mission's "validation" field) — always present, whether this world came from a proposal or a raw specification. */
  validation: SpecificationValidationResult;
  /** Present only when this world was created from a `WorldModelProposal` — the proposal's own validation pass, distinct from the specification's. */
  proposalValidation?: ProposalValidationResult;
  /** The full compile+generate+postGenerate+invariants result (specification/compiler.ts) — blueprint, graph, templateIds all live here. */
  specified: SpecifiedWorld;
  /** The live `TemporalEngine` wrapping the generated graph — already has the world's own `generationEvent` recorded in its journal. Ticking, forking, and replaying this engine is the ONLY way this world evolves; nothing here creates a second temporal/branch mechanism. */
  engine: TemporalEngine;
  /** The initial (tick 0) `WorldFrame` — exactly what C2's renderer and C1's observation layer consume (bridge/worldFrameState.ts). */
  worldFrame: WorldFrameState;
  /** Distinct `domainId`s genuinely bound to a real solver in the generated graph — "what scientific domains does this world actually have," derived from the graph itself, never asserted separately. */
  availableDomains: readonly string[];
  /** This world's recorded history so far (empty at creation) — the same `TemporalFrame[]` `engine.frames` exposes, surfaced here for a caller that only has this result object. */
  timeline: readonly TemporalFrame[];
  /** Events recorded at the initial frame (the generation event, at tick 0). */
  events: readonly GenesisEvent[];
  /**
   * The entities C1's observation layer should point its camera at
   * initially — resolved from `specification.requestedObservables` (each
   * entry matched first as an exact entity id, then as an entity `ref.kind`
   * — e.g. `'hospital-building'` for every building of that kind) when
   * present; otherwise the world's own structural root(s) (entities with
   * no `scale.parentEntityId`), a reasonable "establish the whole world"
   * default. Never empty for a non-empty graph.
   */
  focalEntityIds: readonly EntityId[];
  provenance: {
    generationEvent: GenesisEvent;
    proposalProvenance?: WorldModelProposalProvenance;
  };
}

/**
 * Resolves `specification.requestedObservables` against a generated graph,
 * falling back to the graph's own structural root(s) — see
 * `CreateScientificWorldResult.focalEntityIds`'s own doc for the exact
 * rule. Entirely domain-blind: it only ever compares an observable string
 * against an entity's `id` or `ref.kind`, never branches on what an entity
 * scientifically IS.
 */
function computeFocalEntityIds(graph: WorldGraph, specification: WorldSpecification): readonly EntityId[] {
  const observables = specification.requestedObservables ?? [];
  if (observables.length > 0) {
    const matched = new Set<EntityId>();
    for (const observable of observables) {
      if (graph.tryGetEntity(observable as EntityId)) {
        matched.add(observable as EntityId);
        continue;
      }
      for (const entity of graph.listEntities()) {
        if (entity.ref.kind === observable) matched.add(entity.id);
      }
    }
    if (matched.size > 0) return [...matched];
  }
  return graph.listEntities().filter((e) => e.scale.parentEntityId === undefined).map((e) => e.id);
}

/**
 * The one canonical Trinity entry point: `Intent -> ... -> WorldFrame`.
 * Throws (via `validateProposal`'s caller-visible result, or
 * `generateSpecifiedWorld`'s own validation/invariant checks) rather than
 * ever handing back a world built from a rejected proposal or an invalid
 * specification.
 */
export function createScientificWorld(request: CreateScientificWorldRequest): CreateScientificWorldResult {
  let specification: WorldSpecification;
  let proposalValidation: ProposalValidationResult | undefined;
  let proposalProvenance: WorldModelProposalProvenance | undefined;

  if (request.kind === 'proposal') {
    proposalValidation = validateProposal(request.proposal);
    if (!proposalValidation.validation.ok) {
      const summary = proposalValidation.validation.errors.map((e) => `${e.path}: ${e.message}`).join('; ');
      throw new Error(`WorldModelProposal "${request.proposal.proposalId}" failed validation: ${summary}`);
    }
    specification = request.proposal.specification;
    proposalProvenance = request.proposal.provenance;
  } else {
    specification = request.specification;
  }

  // `realizeProposal`/`generateSpecifiedWorld` re-validate the specification itself and throw on
  // failure — the SAME gate either request path goes through, never a shortcut for either kind.
  const specified = request.kind === 'proposal' ? realizeProposal(request.proposal) : generateSpecifiedWorld(specification);
  const validation = validateSpecification(specification);

  const engine = new TemporalEngine(specified.graph);
  engine.journal.recordEvent(specified.generated.generationEvent);

  const worldFrame = getFrameState(engine);
  const availableDomains = [...new Set(specified.graph.listEntities().map((e) => e.domainBinding?.domainId).filter((id): id is string => Boolean(id)))].sort();
  const focalEntityIds = computeFocalEntityIds(specified.graph, specification);

  return {
    worldId: specification.worldId,
    specification,
    validation,
    proposalValidation,
    specified,
    engine,
    worldFrame,
    availableDomains,
    timeline: engine.frames,
    events: worldFrame.events,
    focalEntityIds,
    provenance: { generationEvent: specified.generated.generationEvent, proposalProvenance },
  };
}
