import type { GroundingLevel } from '../ecs/types';

/**
 * GROUNDING-WEIGHTED EVIDENCE CONTRIBUTION — how much a measurement taken on
 * an entity is allowed to move belief, given how grounded that entity's own
 * declared model is.
 *
 * THE GAP THIS CLOSES: `GroundingLevel` (`ecs/types.ts`) is declared by every
 * domain and carried on every entity, but nothing has ever read it when
 * revising belief. `updateConfidence` (`experimentFabric/beliefRevision.ts`)
 * takes a scalar magnitude and treats a reading from an entity no solver
 * advances exactly like one from a real solver. That is the one place where
 * Genesis's own honesty axis was declared and then ignored.
 *
 * THIS IS NOT A SECOND BELIEF ENGINE. It produces a 0..1 multiplier for the
 * magnitude a caller ALREADY computed (`evidenceMagnitudeWithinTolerance` /
 * `evidenceMagnitudeFromAssessment`), and `updateConfidence` is called
 * unchanged with the scaled value. No new verdict vocabulary, no second
 * log-odds path, no evidence object.
 *
 * NOT A PROVENANCE WEIGHT. `GroundingLevel` answers "how well grounded is the
 * MODEL of this entity", which is a different question from `DataProvenance`
 * ("did this number come from a simulation or a real instrument" —
 * `core/dataProvenance.ts`) and from `resultOrigin`. See
 * `agent/discoveryStrategy.ts`'s own note that these axes already exist and
 * none answers the others' question. Weighting by grounding here does not
 * license anyone to skip the provenance gate; `predictionVerification.ts`
 * still refuses to compare a SIMULATED run against a real measurement.
 *
 * THE CONSTANTS ARE DISCLOSED HEURISTICS, NOT FITTED VALUES — exactly the
 * same standing as `LOG_ODDS_WEIGHT` in `beliefRevision.ts`, and documented
 * to the same standard: changing them changes how fast belief moves on
 * approximate entities, not whether it moves in the right direction.
 *
 * Why the two top levels are 1 and not something smaller: a solver result IS
 * legitimate evidence within its protocol — that is precisely what
 * `SUPPORTED_WITHIN_PROTOCOL` means in Genesis's verdict vocabulary.
 * Down-weighting `MODEL_ESTIMATE` would contradict the verdict the same run
 * is allowed to produce. The two approximation levels are a different claim:
 * they name entities that no solver advances at all, or advances only
 * procedurally, so a reading taken on them is weaker evidence about the world
 * than the same reading taken on a modelled one.
 */
export const GROUNDING_CONTRIBUTION_WEIGHT: Readonly<Record<GroundingLevel, number>> = Object.freeze({
  /** Measured or known exactly — full weight. */
  GROUNDED_EXACT: 1,
  /** A real solver advances this entity; its output is within-protocol evidence — full weight, unchanged from Genesis's behaviour before this module existed. */
  MODEL_ESTIMATE: 1,
  /** Generated/derived structure with no solver of its own behind this metric. */
  PROCEDURAL_APPROXIMATION: 0.5,
  /** Nothing models this entity; it exists as structure only (the default `spawnEntity` applies when a domain declares nothing — see `ecs/entityFactory.ts`). */
  UNGROUNDED_APPROXIMATION: 0.25,
});

/** The 0..1 multiplier for `level`. Total over the declared enum — a new `GroundingLevel` member fails the build here rather than silently defaulting. */
export function groundingContributionWeight(level: GroundingLevel): number {
  return GROUNDING_CONTRIBUTION_WEIGHT[level];
}

/**
 * Scales an already-computed evidence magnitude by how grounded the measured
 * entity is. Returns a value in 0..1, so it stays inside the contract
 * `updateConfidence` already clamps to.
 */
export function weightMagnitudeByGrounding(magnitude: number, level: GroundingLevel): number {
  if (!Number.isFinite(magnitude)) return 0;
  const clamped = Math.min(1, Math.max(0, magnitude));
  return clamped * groundingContributionWeight(level);
}
