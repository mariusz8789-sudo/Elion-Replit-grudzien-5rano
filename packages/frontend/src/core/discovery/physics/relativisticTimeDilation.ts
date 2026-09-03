import { saveExperiment, type SavedExperiment } from '../../scienceMemory';

/**
 * RELATIVISTIC TIME DILATION — the first real, non-molecular physics case.
 *
 * PURPOSE: prove the discovery core generalises beyond chemistry, and lay a
 * real (not speculative) stepping stone toward the temporal/spacetime
 * research direction: this module is genuinely about the SR/GR structure of
 * time, using only established, textbook physics.
 *
 * THE QUESTION: for a GPS satellite in circular Earth orbit, does its clock
 * run net FASTER or SLOWER than a ground clock — and which effect (special-
 * relativistic velocity dilation, or general-relativistic gravitational
 * dilation) dominates?
 *
 * WHY THIS CASE, AND NOT A "MEASURED VALUE" COMPARISON:
 *
 * The historically famous number (~38 microseconds/day) is a widely quoted
 * engineering figure, but Genesis has no live path to the primary source that
 * established its precise decimal value, and this module refuses to state a
 * number from memory as if it were a verified measurement. Instead it
 * DERIVES its own prediction from first principles — exact and standard
 * constants only — and tests an INTERNAL-CONSISTENCY hypothesis: which of the
 * two well-established effects is larger. That is real science (a genuine
 * derivation from real equations) that needs no external "ground truth" to
 * be honest, and it happens to reproduce the textbook figure closely, which
 * is reported here as a cross-check, not a citation.
 *
 * THE THREE-WAY SEPARATION THIS MODULE ENFORCES:
 *
 *   FACT       Special relativity (time dilation from motion) and general
 *              relativity (time dilation from a gravitational potential) are
 *              independently, overwhelmingly experimentally confirmed
 *              theories. Genesis does not re-derive or re-test them here.
 *   THEORY     The specific weak-field approximations used below (first-order
 *              expansion of the Schwarzschild metric, Newtonian circular-
 *              orbit mechanics for velocity) are standard, textbook
 *              applications of that established physics to this scenario.
 *   HYPOTHESIS Which effect numerically dominates for THIS satellite's
 *              specific orbit is the one question this module actually
 *              answers by computation, and is falsifiable: a different
 *              orbital radius flips the sign.
 */
export const RELATIVISTIC_TIME_DILATION_VERSION = '1.0.0';

/** Exact by SI definition since 1983. Zero uncertainty, zero memorisation risk. */
export const SPEED_OF_LIGHT_M_PER_S = 299792458;

export interface PhysicalConstant {
  value: number;
  unit: string;
  source: string;
  /** Whether this is exact by definition, or a measured/adopted standard value with real (if small) uncertainty. */
  status: 'EXACT_BY_DEFINITION' | 'LITERATURE_VALUE';
}

/**
 * Every non-exact constant below is a standard geodesy/orbital-mechanics
 * value, cited to its real convention body — never a number this module
 * claims to have measured.
 */
export const PHYSICAL_CONSTANTS: Readonly<Record<string, PhysicalConstant>> = {
  speedOfLight: { value: SPEED_OF_LIGHT_M_PER_S, unit: 'm/s', source: 'SI definition (exact since 1983).', status: 'EXACT_BY_DEFINITION' },
  earthGravitationalParameter: {
    value: 3.986004418e14, unit: 'm^3/s^2',
    source: 'Standard gravitational parameter of Earth (GM), IERS Conventions / WGS84 geodetic reference.',
    status: 'LITERATURE_VALUE',
  },
  earthEquatorialRadius: {
    value: 6378137, unit: 'm',
    source: 'WGS84 ellipsoid semi-major axis (exact by definition of the WGS84 reference ellipsoid).',
    status: 'EXACT_BY_DEFINITION',
  },
  gpsOrbitalRadius: {
    value: 26560000, unit: 'm',
    source: 'GPS constellation nominal orbital semi-major axis (~20,180 km altitude + Earth radius), per GPS Interface Control Document orbital parameters.',
    status: 'LITERATURE_VALUE',
  },
};

/** Real Newtonian circular-orbit relation: gravity supplies centripetal force, GM/r^2 = v^2/r. */
export function circularOrbitSpeed(gravitationalParameter: number, orbitalRadius: number): number {
  if (orbitalRadius <= 0) throw new Error('Orbital radius must be positive.');
  return Math.sqrt(gravitationalParameter / orbitalRadius);
}

/**
 * Special-relativistic fractional rate DEFICIT of a clock moving at speed v
 * relative to a stationary observer: 1 - dτ/dt ≈ v^2/(2c^2) (weak-field,
 * i.e. low-v, first-order expansion of the exact Lorentz factor).
 */
export function specialRelativisticFractionalDeficit(speed: number, speedOfLight: number): number {
  return (speed * speed) / (2 * speedOfLight * speedOfLight);
}

/**
 * The EXACT Lorentz factor, for reference and for checking the weak-field
 * approximation's validity domain (it degrades as v approaches c).
 */
export function lorentzFactor(speed: number, speedOfLight: number): number {
  const beta2 = (speed / speedOfLight) ** 2;
  if (beta2 >= 1) throw new Error('Speed must be strictly less than the speed of light for the Lorentz factor to be defined.');
  return 1 / Math.sqrt(1 - beta2);
}

/**
 * General-relativistic fractional rate EXCESS of a clock at radius rHigh
 * relative to one at radius rLow (rHigh > rLow, both above the gravitating
 * body's surface), weak-field: GM/c^2 * (1/rLow - 1/rHigh). A clock higher in
 * a gravitational well (weaker potential magnitude) runs faster.
 */
export function gravitationalFractionalExcess(
  gravitationalParameter: number,
  rLow: number,
  rHigh: number,
  speedOfLight: number,
): number {
  if (rHigh <= rLow) throw new Error('rHigh must exceed rLow: the excess is defined for a higher clock relative to a lower one.');
  return (gravitationalParameter / (speedOfLight * speedOfLight)) * (1 / rLow - 1 / rHigh);
}

export type TimeDilationHypothesisId = 'H_GR_DOMINATES' | 'H_SR_DOMINATES';

export type DerivationVerdict = 'SUPPORTED' | 'FALSIFIED';

export interface TimeDilationHypothesisOutcome {
  hypothesisId: TimeDilationHypothesisId;
  statement: string;
  verdict: DerivationVerdict;
  /** How this was decided: DERIVATION, never EMPIRICAL_FIT — there is no external measured dataset in this case. */
  basis: 'DERIVATION_FROM_ESTABLISHED_PHYSICS';
  reasoning: string;
}

export interface RelativisticTimeDilationResult {
  contractVersion: string;
  question: string;
  orbitalSpeed: number;
  specialRelativisticFractionalDeficit: number;
  gravitationalFractionalExcess: number;
  netFractionalRate: number;
  netMicrosecondsPerDay: number;
  /** Which direction the net effect actually points, from the real computation — never asserted in advance. */
  netDirection: 'SATELLITE_CLOCK_NET_FASTER' | 'SATELLITE_CLOCK_NET_SLOWER';
  hypotheses: readonly TimeDilationHypothesisOutcome[];
  fact: readonly string[];
  theory: readonly string[];
  assumptions: readonly string[];
  nextExperiment: string;
  resultFingerprint: string;
}

function fingerprintOf(input: Record<string, number | string>): string {
  // Reuses the same small FNV-1a the rest of the codebase's fingerprints use,
  // inlined here to avoid pulling a browser-facing hashing module into a
  // domain that should stay independently testable and dependency-light.
  const json = JSON.stringify(input, Object.keys(input).sort());
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Runs the case: derives the orbital speed, both fractional-rate effects, and
 * decides the two competing hypotheses PURELY BY COMPUTATION from the
 * constants above. Every number in the result is either a declared constant
 * (with its own source and exactness status) or computed from them here —
 * nothing is asserted from memory.
 */
export function runRelativisticTimeDilationCase(): RelativisticTimeDilationResult {
  const c = PHYSICAL_CONSTANTS.speedOfLight!.value;
  const gm = PHYSICAL_CONSTANTS.earthGravitationalParameter!.value;
  const rGround = PHYSICAL_CONSTANTS.earthEquatorialRadius!.value;
  const rSat = PHYSICAL_CONSTANTS.gpsOrbitalRadius!.value;

  const speed = circularOrbitSpeed(gm, rSat);
  const srDeficit = specialRelativisticFractionalDeficit(speed, c);
  const grExcess = gravitationalFractionalExcess(gm, rGround, rSat, c);
  const net = grExcess - srDeficit;
  const netMicrosecondsPerDay = net * 86400 * 1e6;

  const hypotheses: TimeDilationHypothesisOutcome[] = [
    {
      hypothesisId: 'H_GR_DOMINATES',
      statement: 'The gravitational (general-relativistic) rate excess exceeds the velocity-driven (special-relativistic) rate deficit, so the satellite clock runs net FASTER than the ground clock.',
      verdict: grExcess > srDeficit ? 'SUPPORTED' : 'FALSIFIED',
      basis: 'DERIVATION_FROM_ESTABLISHED_PHYSICS',
      reasoning: `Computed GR excess = ${grExcess.toExponential(4)}, SR deficit = ${srDeficit.toExponential(4)}. ${grExcess > srDeficit ? 'GR excess is larger, so this hypothesis holds for this orbit.' : 'SR deficit is at least as large, so this hypothesis does not hold for this orbit.'}`,
    },
    {
      hypothesisId: 'H_SR_DOMINATES',
      statement: 'The velocity-driven (special-relativistic) rate deficit exceeds the gravitational (general-relativistic) rate excess, so the satellite clock runs net SLOWER than the ground clock.',
      verdict: srDeficit > grExcess ? 'SUPPORTED' : 'FALSIFIED',
      basis: 'DERIVATION_FROM_ESTABLISHED_PHYSICS',
      reasoning: `Computed SR deficit = ${srDeficit.toExponential(4)}, GR excess = ${grExcess.toExponential(4)}. ${srDeficit > grExcess ? 'SR deficit is larger, so this hypothesis holds for this orbit.' : 'GR excess is at least as large, so this hypothesis does not hold for this orbit.'}`,
    },
  ];

  const resultFingerprint = fingerprintOf({
    c, gm, rGround, rSat, speed, srDeficit, grExcess, net,
  });

  return {
    contractVersion: RELATIVISTIC_TIME_DILATION_VERSION,
    question: 'For a GPS-orbit satellite, does gravitational (GR) or velocity (SR) time dilation dominate its clock rate relative to the ground, and by how much?',
    orbitalSpeed: speed,
    specialRelativisticFractionalDeficit: srDeficit,
    gravitationalFractionalExcess: grExcess,
    netFractionalRate: net,
    netMicrosecondsPerDay,
    netDirection: net > 0 ? 'SATELLITE_CLOCK_NET_FASTER' : 'SATELLITE_CLOCK_NET_SLOWER',
    hypotheses,
    fact: [
      'Special relativistic time dilation (moving clocks run slow relative to a stationary observer) is independently, experimentally confirmed (e.g. muon lifetime, particle accelerator measurements).',
      'General relativistic gravitational time dilation (clocks deeper in a gravitational potential run slow) is independently, experimentally confirmed (e.g. Pound-Rebka, gravitational redshift observations).',
    ],
    theory: [
      'This case uses the weak-field, first-order approximations of both effects (valid because v << c and the gravitational potential is weak at Earth-orbit scales) — a standard, textbook application of established GR/SR, not a novel theoretical claim.',
      'Orbital speed is derived from Newtonian circular-orbit mechanics (GM/r^2 = v^2/r), which is the correct leading-order approximation for this weak-field regime.',
    ],
    assumptions: [
      'The ground clock is treated as non-rotating (Earth\'s own rotational velocity and oblateness are neglected) — a simplification, stated rather than hidden, that affects the third significant figure, not the sign of the result.',
      'The orbit is treated as exactly circular at the declared nominal radius; real GPS orbits have small eccentricity.',
    ],
    nextExperiment: 'Obtain the actual GPS onboard oscillator pre-correction factor and independently measured on-orbit clock comparison data (e.g. from published GPS control-segment records) to compare against this derived prediction. That would upgrade this case\'s status from a self-consistent derivation to an experimentally validated model — REQUIRES_EXPERIMENT: Genesis has not performed or independently verified such a comparison in this runtime.',
    resultFingerprint,
  };
}

/**
 * Replay: recomputes the case and compares fingerprints. Since every input
 * is a declared constant (no external retrieval, no random seed), a MATCH is
 * expected always — DRIFT would mean the constants or formulas themselves
 * changed, which this function reports rather than hides.
 */
export function replayRelativisticTimeDilationCase(saved: RelativisticTimeDilationResult): { status: 'MATCH' | 'DRIFT'; reason: string } {
  const recomputed = runRelativisticTimeDilationCase();
  if (recomputed.resultFingerprint !== saved.resultFingerprint) {
    return { status: 'DRIFT', reason: 'Recomputing from the same declared constants produced a different fingerprint — a constant or a formula changed since the run was saved.' };
  }
  return { status: 'MATCH', reason: '' };
}

/**
 * Closes the loop for this domain the same way every other domain in this
 * engine closes it: RESULT → EVIDENCE/MEMORY, with a replay-checkable
 * fingerprint as the sole identity key (no wall-clock timestamp in the
 * experimentId — this case is a pure derivation, so re-running it later must
 * resolve to the SAME memory entry, not a new one).
 */
export function savePhysicsCaseToMemory(result: RelativisticTimeDilationResult): SavedExperiment {
  const leading = result.hypotheses.find((h) => h.verdict === 'SUPPORTED') ?? null;
  return saveExperiment({
    labId: 'physics-relativistic-time-dilation',
    experimentId: `gps-orbit-time-dilation:${result.resultFingerprint}`,
    experimentName: 'GPS-orbit relativistic time dilation — SR vs GR',
    params: {
      orbitalSpeed: result.orbitalSpeed,
      specialRelativisticFractionalDeficit: result.specialRelativisticFractionalDeficit,
      gravitationalFractionalExcess: result.gravitationalFractionalExcess,
      netFractionalRate: result.netFractionalRate,
      netMicrosecondsPerDay: result.netMicrosecondsPerDay,
    },
    stats: {
      hypothesisCount: result.hypotheses.length,
      supportedCount: result.hypotheses.filter((h) => h.verdict === 'SUPPORTED').length,
      falsifiedCount: result.hypotheses.filter((h) => h.verdict === 'FALSIFIED').length,
    },
    analysis: [
      { title: 'Question', kind: 'question', body: result.question },
      { title: 'Leading hypothesis', kind: 'hypotheses', body: leading ? `${leading.hypothesisId} — ${leading.reasoning}` : 'none supported' },
      { title: 'Fact', kind: 'fact', body: result.fact.join(' ') },
      { title: 'Theory', kind: 'theory', body: result.theory.join(' ') },
      { title: 'Assumptions', kind: 'assumptions', body: result.assumptions.join(' ') },
      { title: 'Next experiment', kind: 'next-experiment', body: result.nextExperiment },
    ],
    honesty: 'simplified',
    honestyNote:
      'Every number here is either a declared, cited constant (exact-by-definition or a standard literature value) or computed from those constants by real SR/GR weak-field formulas. '
      + 'No external "measured" dataset was consulted or asserted; the hypothesis verdicts are DERIVATION_FROM_ESTABLISHED_PHYSICS, never an empirical fit.',
    epistemicStatus: `HYPOTHESES=${result.hypotheses.length};LEADING=${leading?.hypothesisId ?? 'NONE'};BASIS=DERIVATION_FROM_ESTABLISHED_PHYSICS`,
    assumptions: [...result.assumptions],
  });
}
