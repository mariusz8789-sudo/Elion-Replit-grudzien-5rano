/**
 * DOME WORLD — computational model (pure geometry, no verdicts).
 *
 * Computes what a flat-disk-plus-local-sun-plus-dome model WOULD predict for
 * a given observable, given its own declared assumptions. It does not know
 * whether the prediction matches reality — that comparison happens entirely
 * through the EXISTING REFERENCE verification pipeline
 * (`core/agent/predictionVerification.ts` +
 * `core/experimentFabric/realExperiment.ts::createReferenceMeasurementRun`,
 * both already built and tested for exactly "a SIMULATED prediction judged
 * against a cited external figure"), in `domeChallenge.ts`. This file adds
 * no new verdict vocabulary and no new comparison engine.
 *
 * Adapted from an external draft (Qwen), narrowed to the two observables
 * `domeChallenge.ts` actually tests against a real citation
 * (`domeReferenceCitations.ts`): a shadow angle at a real, historically
 * documented distance, and the flat-plane horizon-distance claim. The
 * draft's star-altitude prediction is deliberately NOT carried over — its
 * only way to place a star's position required inventing a "distance from
 * center" standing in for latitude with no principled derivation, which is
 * exactly the kind of unearned number this codebase's falsification
 * discipline exists to refuse.
 */

export interface DomeWorldParameters {
  /** Height of the sun above the plane (km). A declared model ASSUMPTION, not a fitted constant. */
  readonly sunHeightKm: number;
  /** Atmospheric visibility limit (km) — the only thing that bounds sight on an infinite flat plane. */
  readonly atmosphericVisibilityKm: number;
}

/** Representative values from common flat-plane/dome-model literature — assumptions, not tuned to match any citation below. */
export const DEFAULT_DOME_PARAMETERS: DomeWorldParameters = {
  sunHeightKm: 5000,
  atmosphericVisibilityKm: 100,
};

/**
 * Shadow angle cast by a vertical gnomon, for an observer at `groundDistanceKm`
 * from the point directly below the sun (a local object at finite height).
 *
 * Returns degrees from vertical (0 = sun directly overhead, no shadow).
 */
export function predictShadowAngleDegrees(groundDistanceKm: number, params: DomeWorldParameters): number {
  return Math.atan2(groundDistanceKm, params.sunHeightKm) * (180 / Math.PI);
}

/**
 * Distance to the horizon on an (assumed) flat plane: there is no geometric
 * horizon to derive, so the model's own prediction is simply its declared
 * atmospheric visibility limit, independent of observer height — the one
 * genuinely distinguishing prediction between a flat and a curved surface.
 */
export function predictHorizonDistanceKm(_observerHeightM: number, params: DomeWorldParameters): number {
  return params.atmosphericVisibilityKm;
}
