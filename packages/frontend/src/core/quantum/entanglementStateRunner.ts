import type { C } from '../quantumState';
import {
  checkCKWMonogamy, concurrence, densityFromState, horodeckiBoundEntangled3x3, identity,
  logarithmicNegativity, maximumCHSH, negativity, partialTraceB, peresHorodeckiTest,
  realignmentCriterion, renyiEntropy, schmidtDecomposition, vonNeumannEntropy,
  type DensityMatrix,
} from './entanglementMeasures';

/**
 * ENTANGLEMENT STATE RUNNER — the Experiment Fabric adapter for
 * `entanglementMeasures.ts`.
 *
 * WHY A NAMED-PRESET STRING AND NOT A MATRIX. The Fabric's request contract is
 * `ExperimentValue = number | string | boolean` (`experimentFabric/types.ts`),
 * and `validateStructuredExperimentRequest` rejects anything else. A density
 * matrix therefore cannot travel as a parameter. The precedent already in the
 * repo is `quantum-bloch-circuit`, which passes a whole gate sequence as one
 * string; this does the same with a declared state id plus flat numeric knobs
 * (family parameter, mixing angle, white noise). Inventing a nested-object
 * parameter path for this would change a contract that 57 models depend on.
 *
 * THE STATES ARE DECLARED, NOT DISCOVERED. Every one has a closed-form answer,
 * so a run can be checked against arithmetic rather than trusted. That is the
 * property that lets the hypothesis loops falsify something here.
 *
 * This module computes NO measure of its own — every number comes from
 * `entanglementMeasures.ts`.
 */

export const ENTANGLEMENT_STATE_RUNNER_VERSION = '1.1.0';

const S = Math.SQRT1_2;
const c = (re: number, im = 0): C => [re, im];

export interface EntanglementStateSpec {
  readonly id: string;
  readonly label: string;
  /** 2 for a qubit pair, 3 for a qutrit pair, 8 for three qubits (amplitude count). */
  readonly dimA: number;
  readonly dimB: number;
  readonly build: (familyParameter: number, mixingAngleDeg: number) => DensityMatrix;
  /** Present only for pure states — the Schmidt view needs the vector, not just rho. */
  readonly pureState?: (familyParameter: number, mixingAngleDeg: number) => readonly C[];
  /** Present only for three-qubit pure states — the CKW check needs all 8 amplitudes. */
  readonly threeQubitState?: (familyParameter: number, mixingAngleDeg: number) => readonly C[];
}

function mixed(n: number): DensityMatrix {
  return identity(n).map((row) => row.map(([re, im]) => [re / n, im / n] as C));
}

/** p |Psi-><Psi-| + (1-p) I/4 — the family where every threshold is known exactly. */
function werner(p: number): DensityMatrix {
  const bell = densityFromState([c(0), c(S), c(-S), c(0)]);
  const m = mixed(4);
  return bell.map((row, i) => row.map(([re, im], j) => [
    p * re + (1 - p) * m[i]![j]![0],
    p * im + (1 - p) * m[i]![j]![1],
  ] as C));
}

/**
 * |W⟩ = (|001⟩ + |010⟩ + |100⟩)/√3, written out because two presets need it.
 */
function wAmplitudes(scale: number): readonly number[] {
  const t = scale / Math.sqrt(3);
  return [0, t, t, 0, t, 0, 0, 0];
}

/**
 * cos α · (cos θ|000⟩ + sin θ|111⟩) + sin α · |W⟩.
 *
 * A two-knob three-qubit family, and the two knobs do genuinely different work.
 * θ sets how unbalanced the GHZ part is; α sets how much W is mixed in. GHZ and
 * W are orthogonal (disjoint computational support), so the vector is normalised
 * for every (θ, α) with no rescaling.
 *
 * WHY THIS FAMILY AND NOT A RANDOM ONE. Its residual three-tangle carries a real
 * degeneracy and a real way to break it, both MEASURED on this implementation,
 * not asserted:
 *
 *   τ₃ at α = 0°   θ=20°: 0.41318   θ=35°: 0.88302   θ=55°: 0.88302   θ=70°: 0.41318
 *   τ₃ at α = 15°  θ=20°: 0.37731   θ=35°: 0.79826   θ=55°: 0.81092   θ=70°: 0.40813
 *   τ₃ at α = 90°  every θ: 0
 *
 * At pure generalised GHZ (α = 0) the tangle is sin²(2θ), which is symmetric
 * about 45° — so θ and 90°−θ are INDISTINGUISHABLE there, however precisely you
 * measure. Mixing W in breaks that symmetry, because W has amplitude on the
 * weight-one strings and therefore interferes with |000⟩ but not with |111⟩. And
 * at pure W the tangle is 0 for every θ: the strongest, most obvious three-qubit
 * signal in the family says nothing at all about θ.
 */
function ghzWFamily(thetaDeg: number, mixingAngleDeg: number): readonly C[] {
  const theta = (thetaDeg * Math.PI) / 180;
  const alpha = (mixingAngleDeg * Math.PI) / 180;
  const g = Math.cos(alpha);
  const w = wAmplitudes(Math.sin(alpha));
  const ghz = [g * Math.cos(theta), 0, 0, 0, 0, 0, 0, g * Math.sin(theta)];
  return ghz.map((amp, i) => c(amp + w[i]!));
}

/**
 * ρ → (1−w)·ρ + w·I/d — the depolarising (white-noise) channel, the one knob
 * every real source has and no ideal state does.
 *
 * It is a genuine physical channel, not a convenience: it is what an imperfect
 * preparation does to a state, and it is why an experimenter's FIRST, easiest
 * measurement is so often the one that decides nothing. `d` is read off the
 * matrix, so the same function is correct for 2⊗2, 3⊗3 and three qubits.
 */
function depolarise(rho: DensityMatrix, whiteNoise: number): DensityMatrix {
  if (!(whiteNoise > 0)) return rho;
  const w = Math.min(1, whiteNoise);
  const m = mixed(rho.length);
  return rho.map((row, i) => row.map(([re, im], j) => [
    (1 - w) * re + w * m[i]![j]![0],
    (1 - w) * im + w * m[i]![j]![1],
  ] as C));
}

/**
 * The declared state space. Each entry names what its closed form is, because
 * "checkable against a textbook" is the whole reason these particular states
 * are here rather than random ones.
 */
export const ENTANGLEMENT_STATES: readonly EntanglementStateSpec[] = [
  {
    id: 'phi-plus', label: '|Φ+⟩ (Bell) — S = ln2, C = 1, max CHSH = 2√2', dimA: 2, dimB: 2,
    pureState: () => [c(S), c(0), c(0), c(S)],
    build: () => densityFromState([c(S), c(0), c(0), c(S)]),
  },
  {
    id: 'psi-minus', label: '|Ψ−⟩ (singlet) — the state the CHSH lab already correlates', dimA: 2, dimB: 2,
    pureState: () => [c(0), c(S), c(-S), c(0)],
    build: () => densityFromState([c(0), c(S), c(-S), c(0)]),
  },
  {
    id: 'product', label: '|0⟩⊗|+⟩ — separable, every measure exactly 0', dimA: 2, dimB: 2,
    pureState: () => [c(S), c(S), c(0), c(0)],
    build: () => densityFromState([c(S), c(S), c(0), c(0)]),
  },
  {
    id: 'partial', label: 'α|00⟩ + √(1−α²)|11⟩ — concurrence = 2|αβ|', dimA: 2, dimB: 2,
    pureState: (a) => [c(a), c(0), c(0), c(Math.sqrt(Math.max(0, 1 - a * a)))],
    build: (a) => densityFromState([c(a), c(0), c(0), c(Math.sqrt(Math.max(0, 1 - a * a)))]),
  },
  {
    id: 'werner', label: 'Werner — entangled above p = 1/3, CHSH-violating only above p = 1/√2', dimA: 2, dimB: 2,
    build: (p) => werner(Math.max(0, Math.min(1, p))),
  },
  {
    id: 'maximally-mixed', label: 'I/4 — separable, and the degenerate-spectrum stress case', dimA: 2, dimB: 2,
    build: () => mixed(4),
  },
  {
    id: 'horodecki-bound', label: 'Horodecki 3⊗3 — PPT AND entangled (bound entanglement)', dimA: 3, dimB: 3,
    build: (a) => horodeckiBoundEntangled3x3(Math.max(0.05, Math.min(0.95, a))),
  },
  // --- Three-qubit states. Their bipartition for the 2x2 measures is A vs (BC),
  // which is a 2x4 split, so those measures are undefined and report NaN. What
  // they are here for is the CKW monogamy check, which needs all 8 amplitudes.
  {
    id: 'ghz', label: '|GHZ⟩ — entanglement entirely tripartite: τ_AB = τ_AC = 0, residual 1', dimA: 2, dimB: 4,
    threeQubitState: () => [c(S), c(0), c(0), c(0), c(0), c(0), c(0), c(S)],
    build: () => densityFromState([c(S), c(0), c(0), c(0), c(0), c(0), c(0), c(S)]),
  },
  {
    id: 'w-state', label: '|W⟩ — entanglement entirely pairwise: CKW saturated, residual 0', dimA: 2, dimB: 4,
    threeQubitState: () => {
      const t = 1 / Math.sqrt(3);
      return [c(0), c(t), c(t), c(0), c(t), c(0), c(0), c(0)];
    },
    build: () => {
      const t = 1 / Math.sqrt(3);
      return densityFromState([c(0), c(t), c(t), c(0), c(t), c(0), c(0), c(0)]);
    },
  },
  {
    id: 'bell-plus-spectator', label: 'Bell(0,1) ⊗ |0⟩₂ — A keeps its whole share with B', dimA: 2, dimB: 4,
    threeQubitState: () => [c(S), c(0), c(0), c(0), c(0), c(0), c(S), c(0)],
    build: () => densityFromState([c(S), c(0), c(0), c(0), c(0), c(0), c(S), c(0)]),
  },
  {
    id: 'ghz-w-family',
    label: 'cos α·(cos θ|000⟩ + sin θ|111⟩) + sin α·|W⟩ — τ₃ degenerate under θ ↔ 90°−θ at α = 0',
    dimA: 2, dimB: 4,
    threeQubitState: (theta, alpha) => ghzWFamily(theta, alpha),
    build: (theta, alpha) => densityFromState(ghzWFamily(theta, alpha)),
  },
];

export function getEntanglementState(stateId: string): EntanglementStateSpec | undefined {
  return ENTANGLEMENT_STATES.find((s) => s.id === stateId);
}

export interface EntanglementRunResult {
  readonly stateId: string;
  readonly label: string;
  /** The depolarising fraction this run was measured AT — 0 for the ideal preparation. */
  readonly whiteNoise: number;
  /** Sum of |negative eigenvalues| of rho^{T_A}. Zero for every PPT state. */
  readonly negativity: number;
  readonly logNegativity: number;
  /** Wootters concurrence. Defined for two qubits only; NaN elsewhere, never a fabricated 0. */
  readonly concurrence: number;
  readonly vonNeumannEntropyNats: number;
  readonly renyi2Nats: number;
  /** Maximum CHSH over ALL settings (Horodecki criterion). Two qubits only. */
  readonly maxCHSH: number;
  /** ||R(rho)||_1 — CCNR. Above 1 proves entanglement; at or below it proves nothing. */
  readonly ccnrTraceNorm: number;
  /** Most negative eigenvalue of rho^{T_A}; 0 when none. */
  readonly pptMinEigenvalue: number;
  /** 1 for a separable pure state, >= 2 for an entangled one. NaN for a mixed state, which has no Schmidt rank. */
  readonly schmidtRank: number;
  /**
   * CKW residual three-tangle: tau_A|BC − (tau_AB + tau_AC). Non-negative by the
   * monogamy theorem, so a NEGATIVE value here would falsify the implementation,
   * not the theorem. Three-qubit pure states only; NaN elsewhere.
   */
  readonly ckwResidual: number;
  /**
   * ENTANGLEMENT PPT CANNOT SEE: (‖R(ρ)‖₁ − 1) counted ONLY when the state is
   * PPT, and 0 otherwise.
   *
   * It isolates exactly the bound-entangled case. A Bell state has a huge CCNR
   * norm but is NPT, so PPT already settles it and this reads 0. A separable
   * state reads 0 because CCNR is silent. Only a state that is positive under
   * partial transpose AND provably entangled makes this positive — which is the
   * observable the "PPT is sufficient" claim can be falsified on.
   */
  readonly boundEntanglementMargin: number;
}

/**
 * Below this, a quantity whose theoretical floor is exactly 0 is reported as 0.
 *
 * NOT a convenience, and NOT applied to anything that could legitimately be
 * small: every measure chopped here is non-negative by a theorem (negativity
 * and log-negativity by construction, concurrence by Wootters' max(0, ...),
 * the entropies because eigenvalues of a density matrix lie in [0,1], and the
 * CKW residual by the monogamy inequality). A value of −1.8e-15 from those is
 * arithmetic, not physics.
 *
 * It matters because these numbers are experiment OUTPUTS. MEASURED: on the
 * `ghz-w-family` preset at α = 90° (pure |W⟩) the residual three-tangle is 0
 * for every θ, but the raw doubles come back as −1.776e-15 for θ = 20° and
 * −6.661e-16 for θ = 70° — dust that differs between them by more than any
 * relative agreement band around 1e-15 allows. A hypothesis loop judging
 * predictions against measurements on that metric would have FALSIFIED every
 * candidate at the first round, on the strength of floating-point noise. That
 * is a fabricated result, so the dust is removed where the number becomes an
 * observation.
 *
 * The falsification guard survives: a genuine monogamy violation would be of
 * order the tangles themselves (0.1 to 1), thousands of times this threshold,
 * and `checkCKWMonogamy` itself still returns the raw residual unchopped.
 */
const NUMERICAL_ZERO = 1e-12;

/** Identity except on dust; NaN passes through, because NaN means "undefined here". */
function chop(value: number): number {
  return Math.abs(value) < NUMERICAL_ZERO ? 0 : value;
}

/**
 * How a state was PREPARED, as opposed to what it ideally is.
 *
 * Split out from the measures because it is the experimentalist's half of the
 * problem: the same declared family, prepared with a different second knob or a
 * different amount of depolarising noise, is a different state on the bench and
 * measures differently. Both default to the ideal preparation, so every existing
 * caller keeps the behaviour it had.
 */
export interface EntanglementPreparation {
  /** Second family knob. Only `ghz-w-family` reads it; every other preset ignores it. */
  readonly mixingAngleDeg?: number;
  /** Depolarising fraction w in ρ → (1−w)ρ + w·I/d. 0 is the ideal preparation. */
  readonly whiteNoise?: number;
}

/**
 * Runs every measure the module can compute for a declared state, as prepared.
 *
 * A measure that is UNDEFINED for the state's dimensions returns NaN, never 0.
 * Concurrence and maximum CHSH are two-qubit quantities; reporting 0 for a 3x3
 * state would say "no entanglement" about a state this very runner can show IS
 * entangled. That distinction is the whole point of the Horodecki entry.
 *
 * THE SAME RULE APPLIES TO NOISE, and it is easy to get wrong. The Schmidt rank
 * and the CKW residual three-tangle are defined for PURE states only — the
 * residual is computed as τ_{A|BC} = 2(1 − Tr ρ_A²), which is the A|BC tangle
 * only when the whole state is pure. Under any depolarising noise that identity
 * fails, and the mixed-state three-tangle is a convex roof this module does not
 * compute. So both report NaN as soon as `whiteNoise > 0`, rather than a number
 * that would look like a measurement and be an artefact.
 */
export function runEntanglementState(
  stateId: string,
  familyParameter: number,
  preparation: EntanglementPreparation = {},
): EntanglementRunResult {
  const spec = getEntanglementState(stateId);
  if (spec === undefined) {
    throw new Error(`Unknown entanglement state "${stateId}". Declared: ${ENTANGLEMENT_STATES.map((s) => s.id).join(', ')}.`);
  }
  const mixingAngleDeg = preparation.mixingAngleDeg ?? 0;
  const whiteNoise = Math.max(0, Math.min(1, preparation.whiteNoise ?? 0));
  const ideal = spec.build(familyParameter, mixingAngleDeg);
  const rho = depolarise(ideal, whiteNoise);
  const isPure = whiteNoise === 0;
  const twoQubit = spec.dimA === 2 && spec.dimB === 2;
  const ppt = peresHorodeckiTest(rho, spec.dimA, spec.dimB);
  const pure = isPure ? spec.pureState?.(familyParameter, mixingAngleDeg) : undefined;
  const three = isPure ? spec.threeQubitState?.(familyParameter, mixingAngleDeg) : undefined;
  const ccnr = realignmentCriterion(rho, spec.dimA, spec.dimB);
  const isPPT = ppt.positiveUnderPartialTranspose;
  return {
    stateId: spec.id,
    label: spec.label,
    whiteNoise,
    negativity: chop(negativity(rho, spec.dimA, spec.dimB)),
    logNegativity: chop(logarithmicNegativity(rho, spec.dimA, spec.dimB)),
    concurrence: twoQubit ? chop(concurrence(rho)) : Number.NaN,
    vonNeumannEntropyNats: twoQubit ? chop(vonNeumannEntropy(partialTraceB(rho, 2, 2))) : Number.NaN,
    renyi2Nats: twoQubit ? chop(renyiEntropy(partialTraceB(rho, 2, 2), 2)) : Number.NaN,
    maxCHSH: twoQubit ? chop(maximumCHSH(rho).maxS) : Number.NaN,
    ccnrTraceNorm: ccnr.traceNorm,
    // NOT chopped: this is the raw evidence for the PPT verdict, and the whole
    // point of the Horodecki entry is that its most negative eigenvalue sits at
    // the 1e-17 level rather than at zero. Hiding that would hide the finding.
    pptMinEigenvalue: ppt.minEigenvalue,
    schmidtRank: pure !== undefined && twoQubit ? schmidtDecomposition(pure, 2, 2).rank : Number.NaN,
    ckwResidual: three !== undefined ? chop(checkCKWMonogamy(three).residual) : Number.NaN,
    boundEntanglementMargin: isPPT && ccnr.entangled ? chop(ccnr.traceNorm - 1) : 0,
  };
}
