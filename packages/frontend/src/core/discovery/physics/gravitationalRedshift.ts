/**
 * GRAVITATIONAL REDSHIFT — the second real, non-molecular physics case.
 *
 * DELIBERATELY A DIFFERENT OBSERVABLE FROM THE GPS CASE, not a variation of
 * it: `relativisticTimeDilation.ts` asks how fast a moving/orbiting CLOCK
 * ticks. This module asks how the FREQUENCY of light changes as it climbs
 * out of (or falls into) a gravitational potential — a static laboratory
 * tower, not an orbit; energy/frequency shift, not clock rate. Both share
 * the same underlying weak-field GR term (GM/(rc^2)), which is exactly the
 * point: the SAME established physics, applied to a genuinely different
 * scenario, through the SAME derivation-and-falsification machinery.
 *
 * THE QUESTION: for the real Pound-Rebka (1959/1960) tower geometry at
 * Harvard's Jefferson Physical Laboratory, does a photon climbing away from
 * Earth lose energy (redshift) or gain energy (blueshift), and by what
 * fractional amount — derived, not recalled as a "measured" figure.
 *
 * WHY DERIVATION, NOT A RECALLED MEASUREMENT: same discipline as the GPS
 * case. The historically famous confirmation of Einstein's prediction to
 * ~1% (Pound & Snider, 1964) is a real, citable published result, but this
 * module does not assert its precise measured value from memory. It derives
 * the PREDICTED shift from the declared tower height and Earth's surface
 * gravity (itself derived from already-declared GM and R, not a separate
 * "9.8" pulled from memory), and tests the one falsifiable, sign-level
 * question a derivation alone can honestly answer: which direction, and
 * does the predicted magnitude match the well-known order of magnitude for
 * this specific, real experimental geometry.
 *
 *   FACT       Gravitational redshift is independently, experimentally
 *              confirmed (Pound-Rebka 1959/1960; Pound-Snider 1964; GPS
 *              clock corrections; astronomical gravitational redshift of
 *              white-dwarf spectral lines).
 *   THEORY     The weak-field first-order approximation used below
 *              (Delta f / f ~= g h / c^2) is a standard, textbook
 *              linearisation of the exact Schwarzschild redshift formula,
 *              valid because g*h/c^2 << 1 for a laboratory tower.
 *   HYPOTHESIS Whether the predicted shift is a redshift (frequency
 *              decrease) or a blueshift for light climbing away from
 *              Earth, and whether its derived order of magnitude is
 *              consistent with the historically reported ~1e-15 scale for
 *              this exact geometry — both are falsifiable by the
 *              computation itself, not assumed in advance.
 */
import { saveExperiment, type SavedExperiment } from '../../scienceMemory';
import { PHYSICAL_CONSTANTS, SPEED_OF_LIGHT_M_PER_S } from './relativisticTimeDilation';
import type { StandardScientificResult } from './physicsCaseContract';

export const GRAVITATIONAL_REDSHIFT_VERSION = '1.0.0';

/** The real Pound-Rebka tower height at Harvard's Jefferson Physical Laboratory. */
export const POUND_REBKA_TOWER_HEIGHT_M = 22.5;
export const POUND_REBKA_TOWER_SOURCE = 'Pound, R.V. and Rebka, G.A. (1960) "Apparent Weight of Photons", Phys. Rev. Lett. 4, 337 — Jefferson Physical Laboratory tower, Harvard University.';

/** Surface gravitational acceleration, DERIVED from already-declared GM and R — never a separately memorised "9.8". */
export function surfaceGravity(gravitationalParameter: number, planetRadius: number): number {
  if (planetRadius <= 0) throw new Error('Planet radius must be positive.');
  return gravitationalParameter / (planetRadius * planetRadius);
}

/**
 * Weak-field fractional frequency shift for light climbing height h in a
 * uniform field of local gravitational acceleration g: Delta f / f ~= -g h / c^2
 * (negative = redshift, i.e. frequency decreases, for h > 0 climbing away
 * from the source of gravity). This is the first-order linearisation of the
 * exact Schwarzschild gravitational redshift, valid for g*h/c^2 << 1.
 */
export function weakFieldFractionalFrequencyShift(g: number, height: number, speedOfLight: number): number {
  if (height === 0) throw new Error('Height must be non-zero: the shift is defined between two distinct points in the field.');
  return -(g * height) / (speedOfLight * speedOfLight);
}

export type RedshiftHypothesisId = 'H_CLIMBING_LIGHT_REDSHIFTS' | 'H_CLIMBING_LIGHT_BLUESHIFTS';
export type DerivationVerdict = 'SUPPORTED' | 'FALSIFIED';

export interface RedshiftHypothesisOutcome {
  hypothesisId: RedshiftHypothesisId;
  statement: string;
  verdict: DerivationVerdict;
  basis: 'DERIVATION_FROM_ESTABLISHED_PHYSICS';
  reasoning: string;
}

export interface GravitationalRedshiftResult {
  contractVersion: string;
  question: string;
  surfaceGravity: number;
  towerHeight: number;
  fractionalFrequencyShift: number;
  direction: 'REDSHIFT' | 'BLUESHIFT';
  orderOfMagnitudeConsistentWithHistoricalReport: boolean;
  hypotheses: readonly RedshiftHypothesisOutcome[];
  fact: readonly string[];
  theory: readonly string[];
  assumptions: readonly string[];
  nextExperiment: string;
  resultFingerprint: string;
}

function fingerprintOf(input: Record<string, number | string>): string {
  const json = JSON.stringify(input, Object.keys(input).sort());
  let hash = 0x811c9dc5;
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Runs the case: derives surface gravity and the fractional frequency shift
 * PURELY BY COMPUTATION from already-declared constants (GM, R, c) and the
 * real, cited tower height. Nothing here is asserted from memory as a
 * "measured" figure.
 */
export function runGravitationalRedshiftCase(): GravitationalRedshiftResult {
  const gm = PHYSICAL_CONSTANTS.earthGravitationalParameter!.value;
  const r = PHYSICAL_CONSTANTS.earthEquatorialRadius!.value;
  const c = SPEED_OF_LIGHT_M_PER_S;
  const h = POUND_REBKA_TOWER_HEIGHT_M;

  const g = surfaceGravity(gm, r);
  const shift = weakFieldFractionalFrequencyShift(g, h, c);
  const direction: GravitationalRedshiftResult['direction'] = shift < 0 ? 'REDSHIFT' : 'BLUESHIFT';

  // The historically reported Pound-Rebka shift is of order 1e-15 (specifically
  // ~2.5e-15 for this tower). This checks ORDER OF MAGNITUDE consistency with
  // that widely published figure as an internal sanity cross-check, never as a
  // substitute for an independently retrieved measured value.
  const orderOfMagnitudeConsistentWithHistoricalReport = Math.abs(shift) > 1e-16 && Math.abs(shift) < 1e-14;

  const hypotheses: RedshiftHypothesisOutcome[] = [
    {
      hypothesisId: 'H_CLIMBING_LIGHT_REDSHIFTS',
      statement: 'Light climbing away from Earth (increasing height in the gravitational field) is redshifted: its frequency decreases.',
      verdict: shift < 0 ? 'SUPPORTED' : 'FALSIFIED',
      basis: 'DERIVATION_FROM_ESTABLISHED_PHYSICS',
      reasoning: `Computed fractional shift = ${shift.toExponential(4)} for height ${h} m. ${shift < 0 ? 'Negative, i.e. a frequency decrease: redshift.' : 'Non-negative: this hypothesis does not hold for this computation.'}`,
    },
    {
      hypothesisId: 'H_CLIMBING_LIGHT_BLUESHIFTS',
      statement: 'Light climbing away from Earth (increasing height in the gravitational field) is blueshifted: its frequency increases.',
      verdict: shift > 0 ? 'SUPPORTED' : 'FALSIFIED',
      basis: 'DERIVATION_FROM_ESTABLISHED_PHYSICS',
      reasoning: `Computed fractional shift = ${shift.toExponential(4)} for height ${h} m. ${shift > 0 ? 'Positive, i.e. a frequency increase: blueshift.' : 'Non-positive: this hypothesis does not hold for this computation.'}`,
    },
  ];

  const resultFingerprint = fingerprintOf({ gm, r, c, h, g, shift });

  return {
    contractVersion: GRAVITATIONAL_REDSHIFT_VERSION,
    question: 'For the real Pound-Rebka tower geometry (22.5 m at Harvard), does light climbing away from Earth redshift or blueshift, and is the derived fractional shift consistent in order of magnitude with the historically published result?',
    surfaceGravity: g,
    towerHeight: h,
    fractionalFrequencyShift: shift,
    direction,
    orderOfMagnitudeConsistentWithHistoricalReport,
    hypotheses,
    fact: [
      'Gravitational redshift of light climbing out of a gravitational potential is independently, experimentally confirmed (Pound-Rebka 1959/1960; Pound-Snider 1964; astronomical white-dwarf spectral-line redshifts; GPS clock corrections use the same underlying effect).',
    ],
    theory: [
      'This case uses the weak-field, first-order linearisation of the exact Schwarzschild gravitational redshift (Delta f / f ~= -g h / c^2), valid because g*h/c^2 is far smaller than 1 for a laboratory tower — a standard, textbook application of established GR, not a novel theoretical claim.',
      'Surface gravity is derived from Earth\'s already-declared standard gravitational parameter and equatorial radius (g = GM / R^2), not introduced as a separate, independently memorised constant.',
    ],
    assumptions: [
      'The field is treated as locally uniform over the tower\'s 22.5 m height — an excellent approximation given Earth\'s radius is over 280,000 times larger.',
      'The tower is treated as vertical and stationary; no correction is made for the Mossbauer source/absorber\'s own recoil-free fraction or for any other apparatus-specific effect — those belong to the real experiment\'s error budget, not to this derivation.',
    ],
    nextExperiment: 'Obtain the actual Pound-Rebka/Pound-Snider published fractional-shift measurement and its stated experimental uncertainty to compare against this derived prediction. REQUIRES_EXPERIMENT: Genesis has not retrieved or independently verified that published measurement in this runtime.',
    resultFingerprint,
  };
}

export function replayGravitationalRedshiftCase(saved: GravitationalRedshiftResult): { status: 'MATCH' | 'DRIFT'; reason: string } {
  const recomputed = runGravitationalRedshiftCase();
  if (recomputed.resultFingerprint !== saved.resultFingerprint) {
    return { status: 'DRIFT', reason: 'Recomputing from the same declared constants produced a different fingerprint — a constant or a formula changed since the run was saved.' };
  }
  return { status: 'MATCH', reason: '' };
}

export function saveGravitationalRedshiftCaseToMemory(result: GravitationalRedshiftResult): SavedExperiment {
  const leading = result.hypotheses.find((h) => h.verdict === 'SUPPORTED') ?? null;
  return saveExperiment({
    labId: 'physics-gravitational-redshift',
    experimentId: `pound-rebka-tower:${result.resultFingerprint}`,
    experimentName: 'Gravitational redshift — Pound-Rebka tower geometry',
    params: {
      surfaceGravity: result.surfaceGravity,
      towerHeight: result.towerHeight,
      fractionalFrequencyShift: result.fractionalFrequencyShift,
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
      'Every number here is either a declared constant (GM, R, c — already used by the GPS time-dilation case) or the real, cited Pound-Rebka tower height, or computed from those by a real weak-field GR formula. '
      + 'No external "measured" dataset was consulted or asserted; the order-of-magnitude cross-check against the historical figure is reported explicitly as a cross-check, never as a citation of a retrieved measurement.',
    epistemicStatus: `HYPOTHESES=${result.hypotheses.length};LEADING=${leading?.hypothesisId ?? 'NONE'};BASIS=DERIVATION_FROM_ESTABLISHED_PHYSICS`,
    assumptions: [...result.assumptions],
  });
}

/**
 * Projects this case into the domain-generic StandardScientificResult shape.
 * A VIEW over `result`, never a recomputation.
 */
export function toStandardScientificResult(result: GravitationalRedshiftResult): StandardScientificResult {
  const gm = PHYSICAL_CONSTANTS.earthGravitationalParameter!;
  const r = PHYSICAL_CONSTANTS.earthEquatorialRadius!;
  const c = PHYSICAL_CONSTANTS.speedOfLight!;

  return {
    domainId: 'PHYSICS',
    caseId: 'GRAVITATIONAL_REDSHIFT',
    contractVersion: GRAVITATIONAL_REDSHIFT_VERSION,
    question: result.question,
    assumptions: result.assumptions,
    inputs: [
      { symbol: 'h', meaning: 'Tower height light climbs (Pound-Rebka geometry)', value: result.towerHeight, unit: 'm' },
    ],
    constants: [
      { symbol: 'GM', meaning: 'Earth\'s standard gravitational parameter', value: gm.value, unit: gm.unit, source: gm.source, status: gm.status },
      { symbol: 'R', meaning: 'Earth\'s equatorial radius', value: r.value, unit: r.unit, source: r.source, status: r.status },
      { symbol: 'c', meaning: 'Speed of light in vacuum', value: c.value, unit: c.unit, source: c.source, status: c.status },
    ],
    equations: [
      'g = GM / R^2  (surface gravitational acceleration, derived, not memorised)',
      'Delta f / f ~= -g h / c^2  (weak-field gravitational frequency shift; negative = redshift)',
    ],
    calculation: [
      `g = ${gm.value} / ${r.value}^2 = ${result.surfaceGravity.toFixed(6)} m/s^2`,
      `Delta f / f = -(${result.surfaceGravity.toFixed(6)} * ${result.towerHeight}) / ${c.value}^2 = ${result.fractionalFrequencyShift.toExponential(6)}`,
    ],
    result: [
      { symbol: 'g', meaning: 'Surface gravitational acceleration', value: result.surfaceGravity, unit: 'm/s^2' },
      { symbol: 'Delta f / f', meaning: 'Fractional frequency shift over the tower height', value: result.fractionalFrequencyShift, unit: 'dimensionless' },
    ],
    uncertaintyNote: 'No error bars are computed: every input is either exact by definition, a standard literature value, or the real cited tower height; the weak-field approximation error (g*h/c^2 itself) is many orders of magnitude smaller than 1 and is not the dominant uncertainty in any real measurement of this effect.',
    falsificationCriteria: result.hypotheses.map((h) => ({
      statement: h.statement,
      wouldFalsifyIf: h.hypothesisId === 'H_CLIMBING_LIGHT_REDSHIFTS'
        ? 'A recomputation from the same declared constants and formula yields a non-negative fractional frequency shift.'
        : 'A recomputation from the same declared constants and formula yields a non-positive fractional frequency shift.',
    })),
    epistemicTag: 'DERIVED',
    nextQuestion: {
      question: 'Obtain the actual published Pound-Rebka/Pound-Snider measured fractional shift and its stated uncertainty to compare against this derived prediction.',
      kind: 'REQUIRES_EXTERNAL_DATA',
    },
    resultFingerprint: result.resultFingerprint,
  };
}
