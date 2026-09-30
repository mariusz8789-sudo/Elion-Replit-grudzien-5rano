/* Proprietary / All Rights Reserved - Genesis OS */
/**
 * ONE place for the Lorentz factor and the Schwarzschild radius (U0-a).
 *
 * Before U0-a these two formulas were written out by hand in the labs, the
 * World Director templates and the flagship engines. The copies agreed on the
 * formula but not on the constants, so the constants are now an explicit
 * argument instead of a hidden literal:
 *
 *   CODATA_2018   G = 6.67430e-11 m³ kg⁻¹ s⁻², c = 299 792 458 m/s (exact, SI)
 *                 used by the flagship engines (packages/core/src/flagship)
 *   ROUNDED_4_SIG G = 6.674e-11, c = 2.998e8 (4 significant figures)
 *                 used by the frontend labs (core/physics.ts, labs/einstein.ts)
 *
 * U0-a keeps every existing result bit-for-bit, so both sets stay. Moving the
 * labs to CODATA changes r_s by about 1e-4 relative and is a separate decision.
 *
 * Not consolidated here on purpose:
 *  - packages/core/src/cern/BlackHoleEventHorizonEngine.ts (CERN world, owned
 *    by the Human Explorer thread; to be moved only with its agreement)
 *  - legacy/ (archived code, not built)
 */

export interface GravityLightConstants {
  /** Newtonian constant of gravitation [m³ kg⁻¹ s⁻²]. */
  readonly G: number;
  /** Speed of light in vacuum [m/s]. */
  readonly c: number;
  readonly label: string;
}

export const CODATA_2018: GravityLightConstants = Object.freeze({
  G: 6.67430e-11,
  c: 299_792_458,
  label: 'CODATA 2018 (c exact by SI definition)',
});

export const ROUNDED_4_SIG: GravityLightConstants = Object.freeze({
  G: 6.674e-11,
  c: 2.998e8,
  label: 'rounded to 4 significant figures (frontend labs)',
});

/**
 * Lorentz factor γ = 1/√(1−β²), β = v/c.
 * Valid for |β| < 1 only. Outside that range it returns Infinity or NaN
 * exactly as the hand-written copies did; callers that accept user input
 * clamp or reject β before calling (see timeMachine.ts, spacetime-lightcone-3d.ts).
 */
export function lorentzGamma(beta: number): number {
  return 1 / Math.sqrt(1 - beta * beta);
}

/** 1/γ = √(1−β²): the rate of a moving clock relative to a clock at rest. Same validity as lorentzGamma. */
export function inverseLorentzGamma(beta: number): number {
  return Math.sqrt(1 - beta * beta);
}

/**
 * Schwarzschild radius r_s = 2GM/c² [m] for a non-rotating, uncharged mass M [kg].
 * It is the event-horizon radius in Schwarzschild coordinates. Physics does not
 * end there: the horizon is a causal boundary, and nothing locally special
 * happens to an infalling observer when crossing it.
 */
export function schwarzschildRadius(massKg: number, constants: GravityLightConstants): number {
  return (2 * constants.G * massKg) / (constants.c * constants.c);
}
