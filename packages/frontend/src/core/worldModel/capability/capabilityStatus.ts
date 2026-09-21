/**
 * GENESIS — CAPABILITY CONTRACT (Universal Intent completion).
 *
 * One honest status vocabulary, shared by intent resolution
 * (`generation/universalIntent.ts`), domain scene builders
 * (`generation/sceneDomainBuilders.ts`), and the render/capture pipeline
 * (`temporalCinematic/*`). Its entire purpose is the rule the rest of this
 * layer exists to enforce: Genesis never presents a procedural placeholder
 * as a verified scientific model, and never reports `success: true` when it
 * rendered nothing.
 *
 * This mirrors, and does not replace, two existing honesty mechanisms that
 * already cover their own narrower scopes:
 *  - `ecs/types.ts::GroundingLevel` (`GROUNDED_EXACT`/`MODEL_ESTIMATE`/
 *    `PROCEDURAL_APPROXIMATION`/`UNGROUNDED_APPROXIMATION`) — per-ENTITY
 *    scientific grounding, already enforced end-to-end from `WorldGraph`
 *    through `bridge/graphicsWorldFrameAdapter.ts` to the renderer.
 *  - `lookingGlass/scenarioResolution.ts::ResolutionStatus` (`READY`/
 *    `NEEDS_INPUT`/`NOT_MODELLED`/`REFUSED`) — per-SCENARIO capability for
 *    the Looking Glass's own fixed hazard/lab catalog.
 *
 * `CapabilityStatus` is the superset needed once intent resolution spans
 * BOTH scientific-model coverage (what `ResolutionStatus` already answers)
 * AND runtime/environment availability (browser, ffmpeg, an unpushed
 * dependency) — a dimension neither existing vocabulary carries, because
 * neither was ever asked "can this actually be captured to a frame right
 * now," only "does a model exist for it."
 */

export type CapabilityStatus =
  | 'READY' // a real solver/asset/pipeline stage exists and was exercised
  | 'APPROXIMATE' // a real, disclosed procedural/visual heuristic stands in for a model that doesn't exist (e.g. historicalEra.ts's era-scaled skyline, a semantic solar-system layout)
  | 'NEEDS_INPUT' // the request under-specifies what Genesis would need to proceed (mirrors ResolutionStatus.NEEDS_INPUT)
  | 'NOT_MODELLED' // understood, but no real scientific model or composable visual exists for it at all
  | 'BLOCKED_BY_RUNTIME'; // a real capability exists but the current environment cannot execute it right now (no browser, no ffmpeg, an unpushed dependency)

/** Where a status's number/geometry/decision actually came from — read by a report, never inferred by a consumer. */
export type CapabilityProvenance =
  | 'IMPLEMENTED_CAPABILITY' // a real, tested Genesis subsystem (a domain solver, an existing generator, an existing renderer stage)
  | 'SCIENTIFIC_MODEL' // a named, citable physical/chemical/biological model (e.g. Arrhenius kinetics, RDKit MMFF94, Rothermel spread)
  | 'APPROXIMATION' // a disclosed, non-authoritative heuristic (era-scaled building heights, a schematic orbit radius)
  | 'VISUAL_APPROXIMATION' // a composable, renderable stand-in with no claim of scientific accuracy (a generic MRI gantry built from primitives)
  | 'RUNTIME_LIMITATION'; // the gap is environmental (missing binary, missing browser wiring), not scientific

export interface CapabilityEntry {
  readonly status: CapabilityStatus;
  readonly provenance: CapabilityProvenance;
  /** One sentence, human-readable, naming the real reason — never "not implemented" alone. */
  readonly reason: string;
}

/** True only for a status that may honestly back a rendered/produced artifact. `NEEDS_INPUT`/`NOT_MODELLED`/`BLOCKED_BY_RUNTIME` must never be silently treated as success. */
export function isActionable(status: CapabilityStatus): boolean {
  return status === 'READY' || status === 'APPROXIMATE';
}

/**
 * QUALITY GATE primitive: combines a set of capability entries into ONE
 * overall verdict for a multi-stage pipeline (intent -> spec -> world ->
 * graph -> scene -> visuals -> camera -> renderer -> runtime -> capture).
 * `BLOCKED_BY_RUNTIME` wins over `NOT_MODELLED`/`NEEDS_INPUT` wins over
 * `APPROXIMATE` wins over `READY` — the pipeline is only as honest as its
 * worst real stage, and a runtime block is reported precisely rather than
 * folded into a generic "not modelled".
 */
const SEVERITY: Readonly<Record<CapabilityStatus, number>> = {
  READY: 0,
  APPROXIMATE: 1,
  NEEDS_INPUT: 2,
  NOT_MODELLED: 3,
  BLOCKED_BY_RUNTIME: 4,
};

export function worstCapability(entries: readonly { readonly status: CapabilityStatus }[]): CapabilityStatus {
  return entries.reduce<CapabilityStatus>((worst, entry) => (SEVERITY[entry.status] > SEVERITY[worst] ? entry.status : worst), 'READY');
}

export interface QualityGateStage {
  readonly stage: string;
  readonly status: CapabilityStatus;
  readonly detail: string;
}

export interface QualityGateResult {
  readonly overall: CapabilityStatus;
  /** Fails closed: true only when every stage is READY or APPROXIMATE. */
  readonly passed: boolean;
  readonly stages: readonly QualityGateStage[];
}

/** Section 22's quality gate: fail closed rather than report `success: true` when any real stage did not run. */
export function evaluateQualityGate(stages: readonly QualityGateStage[]): QualityGateResult {
  const overall = worstCapability(stages);
  return { overall, passed: isActionable(overall), stages };
}
