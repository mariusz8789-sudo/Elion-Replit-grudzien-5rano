import type { GenesisEvent } from '../../events/genesisEvent';
import { getFrameState, type WorldFrameState } from '../bridge/worldFrameState';
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
  provenance: {
    generationEvent: GenesisEvent;
    proposalProvenance?: WorldModelProposalProvenance;
  };
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
    provenance: { generationEvent: specified.generated.generationEvent, proposalProvenance },
  };
}
