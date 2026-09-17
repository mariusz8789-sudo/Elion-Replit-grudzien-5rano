import type { C } from '../quantumState';

/**
 * MIARY SPLĄTANIA — the measurement layer Genesis did not have.
 *
 * The repo already had entanglement PHENOMENA: `core/physics.ts` computes real
 * singlet correlations and CHSH, `labs/experiments/quantum-chsh.ts` renders
 * them in 3D, and `core/quantumState.ts` runs an exact 2^n state vector with a
 * fidelity-1 teleportation. What it had nowhere was the ability to answer HOW
 * MUCH — no partial trace, no von Neumann entropy, no Schmidt decomposition, no
 * concurrence, no negativity, no PPT test, no monogamy. Without those, the
 * standard entanglement claims are unfalsifiable in this codebase.
 *
 * This module is that layer and nothing else. It renders nothing, runs no
 * scenario, and is a pure function of a state vector or a density matrix. It
 * reuses `quantumState.ts`'s `C = [re, im]` rather than introducing a second
 * complex type.
 *
 * WHY THIS IS CHECKABLE RATHER THAN TRUSTED. Every quantity here has a
 * closed-form value on known states, so the tests compare against arithmetic,
 * not against this module's own output:
 *   - |Phi+> : S = ln 2, Schmidt rank 2, concurrence 1, negativity 1/2
 *   - product state : S = 0, Schmidt rank 1, concurrence 0, negativity 0
 *   - Werner state : separable exactly for p <= 1/3 (Peres-Horodecki is
 *     necessary AND sufficient in 2x2, so PPT is the real boundary there)
 *   - Horodecki criterion : max CHSH = 2*sqrt(M(rho)), which for |Phi+> gives
 *     exactly the Tsirelson bound 2*sqrt(2)
 *
 * INDEXING follows `quantumState.ts` verbatim: an n-qubit state is 2^n
 * amplitudes, and index i in binary is |q0 q1 ... q_{n-1}> with q0 the most
 * significant bit. Diverging from that here would silently transpose every
 * subsystem.
 */

export const ENTANGLEMENT_MEASURES_VERSION = '1.0.0';

/** Numerical floor. Eigenvalues of a density matrix are real and >= 0; anything below this is rounding, not physics. */
const EPS = 1e-10;

/** A density matrix as rows of complex entries. Always square, Hermitian, trace 1. */
export type DensityMatrix = readonly (readonly C[])[];

// ---------------------------------------------------------------------------
// Complex helpers. Local and minimal — `quantumState.ts` keeps its own
// unexported ones, and exporting them from there just to share four lines
// would widen that module's surface for no gain.
// ---------------------------------------------------------------------------

const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const conj = (a: C): C => [a[0], -a[1]];

// ---------------------------------------------------------------------------
// Hermitian eigenvalues
// ---------------------------------------------------------------------------

/**
 * Eigenvalues of a Hermitian matrix, ascending.
 *
 * A complex Hermitian H = A + iB (A symmetric, B antisymmetric) maps to the
 * REAL symmetric 2n x 2n matrix [[A, -B], [B, A]], whose spectrum is exactly
 * H's spectrum with every eigenvalue appearing twice. That is a standard
 * embedding, and it means one real Jacobi rotation solver covers the complex
 * case — no complex eigensolver to write, review or get subtly wrong. The
 * doubling is undone by taking every second eigenvalue of the sorted list.
 */
export function hermitianEigenvalues(matrix: DensityMatrix): number[] {
  const n = matrix.length;
  const size = 2 * n;
  // Build [[A, -B], [B, A]].
  const m: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const [re, im] = matrix[i]![j]!;
      m[i]![j] = re;
      m[i]![j + n] = -im;
      m[i + n]![j] = im;
      m[i + n]![j + n] = re;
    }
  }
  const doubled = symmetricEigenvalues(m);
  // Every eigenvalue appears exactly twice; take one of each pair.
  const out: number[] = [];
  for (let i = 0; i < size; i += 2) out.push(doubled[i]!);
  return out;
}

/**
 * Cyclic Jacobi for a real symmetric matrix — eigenvalues only, ascending.
 * Chosen over anything faster on purpose: the matrices here are 4x4 to 16x16,
 * Jacobi is unconditionally convergent for symmetric input, and its accuracy on
 * near-degenerate spectra is what a separability test actually needs.
 */
function symmetricEigenvalues(input: number[][]): number[] {
  const n = input.length;
  const a = input.map((row) => [...row]);
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i]![j]! * a[i]![j]!;
    if (off < 1e-24) break;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p]![q]!;
        if (Math.abs(apq) < 1e-18) continue;
        const theta = (a[q]![q]! - a[p]![p]!) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k]![p]!;
          const akq = a[k]![q]!;
          a[k]![p] = c * akp - s * akq;
          a[k]![q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p]![k]!;
          const aqk = a[q]![k]!;
          a[p]![k] = c * apk - s * aqk;
          a[q]![k] = s * apk + c * aqk;
        }
      }
    }
  }
  return Array.from({ length: n }, (_, i) => a[i]![i]!).sort((x, y) => x - y);
}

// ---------------------------------------------------------------------------
// Density matrices and partial trace
// ---------------------------------------------------------------------------

/** |psi><psi| for a normalised state vector. */
export function densityFromState(psi: readonly C[]): DensityMatrix {
  const d = psi.length;
  return Array.from({ length: d }, (_, i) =>
    Array.from({ length: d }, (_, j) => mul(psi[i]!, conj(psi[j]!))));
}

/**
 * Partial trace over subsystem B of a bipartite rho on H_A (x) H_B.
 *
 * `dimA * dimB` must equal the matrix size; the row index is `a * dimB + b`,
 * which is exactly `quantumState.ts`'s q0-most-significant convention read as
 * "A's index first". `rho_A[a][a'] = sum_b rho[a,b][a',b]`.
 */
export function partialTraceB(rho: DensityMatrix, dimA: number, dimB: number): DensityMatrix {
  if (rho.length !== dimA * dimB) {
    throw new Error(`partialTraceB: matrix is ${rho.length}x${rho.length} but dimA*dimB = ${dimA * dimB}.`);
  }
  return Array.from({ length: dimA }, (_, a) =>
    Array.from({ length: dimA }, (_, a2) => {
      let re = 0;
      let im = 0;
      for (let b = 0; b < dimB; b++) {
        const [r, i] = rho[a * dimB + b]![a2 * dimB + b]!;
        re += r;
        im += i;
      }
      return [re, im] as C;
    }));
}

/** Partial trace over subsystem A — the mirror of `partialTraceB`, not a re-derivation. */
export function partialTraceA(rho: DensityMatrix, dimA: number, dimB: number): DensityMatrix {
  if (rho.length !== dimA * dimB) {
    throw new Error(`partialTraceA: matrix is ${rho.length}x${rho.length} but dimA*dimB = ${dimA * dimB}.`);
  }
  return Array.from({ length: dimB }, (_, b) =>
    Array.from({ length: dimB }, (_, b2) => {
      let re = 0;
      let im = 0;
      for (let a = 0; a < dimA; a++) {
        const [r, i] = rho[a * dimB + b]![a * dimB + b2]!;
        re += r;
        im += i;
      }
      return [re, im] as C;
    }));
}

// ---------------------------------------------------------------------------
// Entropies
// ---------------------------------------------------------------------------

/**
 * Von Neumann entropy S(rho) = -Tr(rho ln rho), in NATS (natural log), so a
 * maximally entangled qubit pair reads ln 2 = 0.6931, not 1. The unit is stated
 * because "1 e-bit" is the log2 convention and silently mixing the two is how a
 * comparison against a published number goes wrong.
 */
export function vonNeumannEntropy(rho: DensityMatrix): number {
  let s = 0;
  for (const lambda of hermitianEigenvalues(rho)) {
    if (lambda > EPS) s -= lambda * Math.log(lambda);
  }
  return s;
}

/** The same quantity in bits, for comparison against log2-convention literature. */
export function entanglementEntropyBits(rho: DensityMatrix): number {
  return vonNeumannEntropy(rho) / Math.LN2;
}

/**
 * Renyi entropy S_alpha = (1/(1-alpha)) ln Tr(rho^alpha), in nats.
 * `alpha === 1` is the von Neumann limit and is dispatched there rather than
 * dividing by zero; alpha -> 0 gives ln(rank) and alpha -> infinity gives
 * -ln(lambda_max), both of which the tests check against that definition.
 */
export function renyiEntropy(rho: DensityMatrix, alpha: number): number {
  if (alpha === 1) return vonNeumannEntropy(rho);
  const eigenvalues = hermitianEigenvalues(rho).filter((l) => l > EPS);
  if (!Number.isFinite(alpha)) return -Math.log(Math.max(...eigenvalues));
  if (alpha === 0) return Math.log(eigenvalues.length);
  const sum = eigenvalues.reduce((acc, l) => acc + Math.pow(l, alpha), 0);
  return Math.log(sum) / (1 - alpha);
}

// ---------------------------------------------------------------------------
// Schmidt decomposition
// ---------------------------------------------------------------------------

export interface SchmidtResult {
  /** Schmidt coefficients lambda_k (squared singular values), descending, summing to 1. */
  readonly coefficients: readonly number[];
  /** Number of non-negligible coefficients. A pure state is entangled exactly when this is >= 2. */
  readonly rank: number;
  /** S(rho_A) in nats — equal to S(rho_B) for a pure state, which the tests verify rather than assume. */
  readonly entropy: number;
}

/**
 * Schmidt decomposition of a PURE bipartite state.
 *
 * The coefficients are the eigenvalues of rho_A, which is the same thing as the
 * squared singular values of the coefficient matrix — so this reuses the
 * partial trace and the eigensolver above instead of adding an SVD. Only the
 * coefficients are returned: the Schmidt BASES are not computed, because
 * nothing here needs them and returning vectors this module never verified
 * would be inventing output.
 */
export function schmidtDecomposition(psi: readonly C[], dimA: number, dimB: number): SchmidtResult {
  const rhoA = partialTraceB(densityFromState(psi), dimA, dimB);
  const coefficients = hermitianEigenvalues(rhoA)
    .map((l) => (l < EPS ? 0 : l))
    .sort((a, b) => b - a);
  return {
    coefficients,
    rank: coefficients.filter((l) => l > 1e-8).length,
    entropy: vonNeumannEntropy(rhoA),
  };
}

// ---------------------------------------------------------------------------
// Concurrence and entropy of formation (two qubits)
// ---------------------------------------------------------------------------

/**
 * Wootters concurrence for a two-qubit state (1998).
 *
 * C = max{0, sqrt(l1) - sqrt(l2) - sqrt(l3) - sqrt(l4)} with l_i the descending
 * eigenvalues of R = rho (sy (x) sy) rho* (sy (x) sy).
 *
 * R is NOT Hermitian, so its eigenvalues cannot go through the solver above.
 * They are instead obtained as the squared eigenvalues of the Hermitian
 * sqrt(rho) (sy(x)sy) rho* (sy(x)sy) sqrt(rho), which is the standard
 * equivalent formulation and keeps every spectrum in this file real by
 * construction rather than by rounding away an imaginary part.
 */
export function concurrence(rho: DensityMatrix): number {
  if (rho.length !== 4) throw new Error('concurrence: defined for two qubits (4x4) only.');
  const sqrtRho = hermitianSqrt(rho);
  const flipped = spinFlip(rho);
  const product = matMul(matMul(sqrtRho, flipped), sqrtRho);
  const eigenvalues = hermitianEigenvalues(product)
    .map((l) => Math.sqrt(Math.max(0, l)))
    .sort((a, b) => b - a);
  return Math.max(0, eigenvalues[0]! - eigenvalues[1]! - eigenvalues[2]! - eigenvalues[3]!);
}

/** Entropy of formation from concurrence, in bits (the convention Wootters states it in). */
export function entropyOfFormation(concurrenceValue: number): number {
  const x = (1 + Math.sqrt(Math.max(0, 1 - concurrenceValue * concurrenceValue))) / 2;
  const h = (p: number): number => (p <= 0 || p >= 1 ? 0 : -p * Math.log2(p) - (1 - p) * Math.log2(1 - p));
  return h(x);
}

/** (sy (x) sy) rho* (sy (x) sy) — the spin-flipped state. */
function spinFlip(rho: DensityMatrix): DensityMatrix {
  // sy (x) sy in the computational basis: antidiagonal (-1, 1, 1, -1).
  const sy2: number[][] = [
    [0, 0, 0, -1],
    [0, 0, 1, 0],
    [0, 1, 0, 0],
    [-1, 0, 0, 0],
  ];
  const conjugated: C[][] = rho.map((row) => row.map((z) => conj(z)));
  const real = sy2.map((row) => row.map((v) => [v, 0] as C));
  return matMul(matMul(real, conjugated), real);
}

// ---------------------------------------------------------------------------
// Partial transpose, PPT, negativity
// ---------------------------------------------------------------------------

/**
 * Partial transpose over subsystem A: rho^{T_A}[a,b][a',b'] = rho[a',b][a,b'].
 * Peres's criterion works on either subsystem and gives the same spectrum; A is
 * chosen here only so callers have one fixed convention.
 */
export function partialTransposeA(rho: DensityMatrix, dimA: number, dimB: number): DensityMatrix {
  if (rho.length !== dimA * dimB) {
    throw new Error(`partialTransposeA: matrix is ${rho.length}x${rho.length} but dimA*dimB = ${dimA * dimB}.`);
  }
  const d = dimA * dimB;
  return Array.from({ length: d }, (_, i) =>
    Array.from({ length: d }, (_, j) => {
      const a = Math.floor(i / dimB);
      const b = i % dimB;
      const a2 = Math.floor(j / dimB);
      const b2 = j % dimB;
      return rho[a2 * dimB + b]![a * dimB + b2]!;
    }));
}

/** Negativity N(rho) = sum of |negative eigenvalues| of rho^{T_A}. Zero for every PPT state. */
export function negativity(rho: DensityMatrix, dimA: number, dimB: number): number {
  const eigenvalues = hermitianEigenvalues(partialTransposeA(rho, dimA, dimB));
  return eigenvalues.reduce((acc, l) => acc + Math.max(0, -l), 0);
}

/** Logarithmic negativity E_N = log2 ||rho^{T_A}||_1 = log2(2N + 1). */
export function logarithmicNegativity(rho: DensityMatrix, dimA: number, dimB: number): number {
  return Math.log2(2 * negativity(rho, dimA, dimB) + 1);
}

export interface PPTResult {
  /** True when rho^{T_A} has no negative eigenvalue. */
  readonly positiveUnderPartialTranspose: boolean;
  /** The most negative eigenvalue (0 when none) — the margin by which the test passed or failed. */
  readonly minEigenvalue: number;
  /**
   * Whether PPT settles separability for THIS pair of dimensions. Peres-Horodecki
   * is necessary and sufficient only in 2x2 and 2x3; above that a PPT state may
   * still be (bound) entangled, so a PPT verdict there proves nothing.
   */
  readonly decisiveForSeparability: boolean;
  /** What the result licenses a caller to say. Never upgraded beyond what the criterion supports. */
  readonly verdict: 'SEPARABLE' | 'ENTANGLED' | 'PPT_BUT_UNDECIDED';
}

/**
 * Peres-Horodecki test, with its own scope attached.
 *
 * A NPT state is entangled in every dimension — that direction is always valid.
 * A PPT state is separable ONLY in 2x2 and 2x3; anywhere else the honest answer
 * is PPT_BUT_UNDECIDED, because bound entangled states are exactly the states
 * that would otherwise be reported separable and are not.
 */
export function peresHorodeckiTest(rho: DensityMatrix, dimA: number, dimB: number): PPTResult {
  const eigenvalues = hermitianEigenvalues(partialTransposeA(rho, dimA, dimB));
  const minEigenvalue = Math.min(...eigenvalues);
  const positive = minEigenvalue > -EPS;
  const decisive = (dimA === 2 && dimB === 2) || (dimA === 2 && dimB === 3) || (dimA === 3 && dimB === 2);
  return {
    positiveUnderPartialTranspose: positive,
    minEigenvalue: Math.min(0, minEigenvalue),
    decisiveForSeparability: decisive,
    verdict: !positive ? 'ENTANGLED' : decisive ? 'SEPARABLE' : 'PPT_BUT_UNDECIDED',
  };
}

// ---------------------------------------------------------------------------
// Realignment / CCNR criterion — the second, INDEPENDENT separability test
// ---------------------------------------------------------------------------

export interface RealignmentResult {
  /** ||R(rho)||_1, the trace norm of the realigned matrix. */
  readonly traceNorm: number;
  /** Computable Cross-Norm / Realignment says: > 1 implies ENTANGLED. <= 1 decides nothing. */
  readonly entangled: boolean;
  /** How far past 1 the norm is — 0 when the criterion is silent. */
  readonly margin: number;
}

/**
 * The CCNR (computable cross-norm / realignment) criterion.
 *
 * WHY THIS EXISTS ALONGSIDE PPT, AND WHY IT IS NOT A DUPLICATE. Peres-Horodecki
 * is necessary and sufficient ONLY in 2x2 and 2x3. Above that a PPT state can
 * still be entangled — "bound" entanglement — and PPT cannot see it at all. CCNR
 * is a DIFFERENT, independent criterion that can: it detects some states PPT
 * misses, and misses some states PPT detects. Neither subsumes the other, which
 * is exactly why having only one of them leaves the claim "PPT settles
 * separability" untestable in this codebase.
 *
 * The realignment: R(rho)[(i,j),(k,l)] = rho[(i,k),(j,l)]. Its singular values
 * are the square roots of the eigenvalues of R^dagger R, which is Hermitian and
 * positive semidefinite by construction — so the existing Hermitian eigensolver
 * covers it and no SVD is introduced.
 *
 * ONE DIRECTION ONLY, and the type says so. `entangled: false` means the
 * criterion is SILENT, never that the state is separable. Reading it the other
 * way would be the exact error this module exists to prevent.
 */
export function realignmentCriterion(rho: DensityMatrix, dimA: number, dimB: number): RealignmentResult {
  if (rho.length !== dimA * dimB) {
    throw new Error(`realignmentCriterion: matrix is ${rho.length}x${rho.length} but dimA*dimB = ${dimA * dimB}.`);
  }
  const rows = dimA * dimA;
  const cols = dimB * dimB;
  const r: C[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => [0, 0] as C));
  for (let i = 0; i < dimA; i++) {
    for (let j = 0; j < dimA; j++) {
      for (let k = 0; k < dimB; k++) {
        for (let l = 0; l < dimB; l++) {
          r[i * dimA + j]![k * dimB + l] = rho[i * dimB + k]![j * dimB + l]!;
        }
      }
    }
  }
  // R^dagger R, Hermitian PSD; its eigenvalues are the squared singular values.
  const gram: C[][] = Array.from({ length: cols }, () => Array.from({ length: cols }, () => [0, 0] as C));
  for (let p = 0; p < cols; p++) {
    for (let q = 0; q < cols; q++) {
      let re = 0;
      let im = 0;
      for (let row = 0; row < rows; row++) {
        const a = r[row]![p]!;
        const b = r[row]![q]!;
        // conj(a) * b
        re += a[0] * b[0] + a[1] * b[1];
        im += a[0] * b[1] - a[1] * b[0];
      }
      gram[p]![q] = [re, im];
    }
  }
  const traceNorm = hermitianEigenvalues(gram).reduce((acc, l) => acc + Math.sqrt(Math.max(0, l)), 0);
  return { traceNorm, entangled: traceNorm > 1 + EPS, margin: Math.max(0, traceNorm - 1) };
}

/**
 * The Horodecki 3x3 BOUND ENTANGLED state, for 0 < a < 1.
 *
 * This state is the counterexample that makes "PPT implies separable" false
 * above 2x3: it is positive under partial transpose AND entangled. Without a
 * state like it in the codebase, the scope limit on Peres-Horodecki is a
 * sentence in a comment rather than something a run can demonstrate.
 *
 * Horodecki, Horodecki & Horodecki (1998), "Mixed-State Entanglement and
 * Distillation: Is there a Bound Entanglement in Nature?" — the a-family.
 * Reproduced here in the computational basis; its entanglement is detected by
 * `realignmentCriterion`, never asserted.
 */
export function horodeckiBoundEntangled3x3(a: number): DensityMatrix {
  if (!(a > 0 && a < 1)) throw new Error(`horodeckiBoundEntangled3x3: a must lie strictly in (0, 1), got ${a}.`);
  const n = 9;
  const m: C[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => [0, 0] as C));
  const offDiagonal = Math.sqrt(1 - a * a) / 2;
  for (const [i, j] of [[0, 0], [0, 4], [0, 8], [4, 0], [4, 4], [4, 8], [8, 0], [8, 4]]) m[i!]![j!] = [a, 0];
  for (const i of [1, 2, 3, 5, 7]) m[i]![i] = [a, 0];
  m[6]![6] = [(1 + a) / 2, 0];
  m[8]![8] = [(1 + a) / 2, 0];
  m[6]![8] = [offDiagonal, 0];
  m[8]![6] = [offDiagonal, 0];
  const norm = 8 * a + 1;
  return m.map((row) => row.map(([re, im]) => [re / norm, im / norm] as C));
}

// ---------------------------------------------------------------------------
// Monogamy (CKW)
// ---------------------------------------------------------------------------

export interface MonogamyResult {
  readonly tangleAB: number;
  readonly tangleAC: number;
  /** tau_{A|(BC)} = 4 det(rho_A) for a PURE three-qubit state — the CKW right-hand side. */
  readonly tangleABC: number;
  /** tau_AB + tau_AC <= tau_A|BC. False would be a violation of the CKW inequality. */
  readonly satisfied: boolean;
  /** tau_A|BC - (tau_AB + tau_AC) — the residual three-tangle, >= 0 by CKW. */
  readonly residual: number;
}

/**
 * Coffman-Kundu-Wootters monogamy check for a PURE three-qubit state.
 *
 * Stated as a CHECK, not as an assertion: the inequality is a theorem, so the
 * only thing worth computing is whether this implementation reproduces it. A
 * `satisfied: false` here means the code is wrong, not that physics is — and
 * that is precisely what makes it a useful test of everything above it.
 */
export function checkCKWMonogamy(psi: readonly C[]): MonogamyResult {
  if (psi.length !== 8) throw new Error('checkCKWMonogamy: defined for three qubits (8 amplitudes) only.');
  const rho = densityFromState(psi);
  // Qubit order is q0 q1 q2 with q0 most significant, so A = qubit 0.
  const rhoA = partialTraceB(rho, 2, 4);
  const rhoAB = partialTraceB(rho, 4, 2);
  const rhoAC = partialTraceOutMiddleQubit(rho);
  const tangleAB = Math.pow(concurrence(rhoAB), 2);
  const tangleAC = Math.pow(concurrence(rhoAC), 2);
  // For a pure state, tau_{A|(BC)} = 2(1 - Tr(rho_A^2)) = 4 det(rho_A) for a qubit A.
  const purityA = traceOfSquare(rhoA);
  const tangleABC = 2 * (1 - purityA);
  const residual = tangleABC - (tangleAB + tangleAC);
  return { tangleAB, tangleAC, tangleABC, satisfied: residual > -1e-8, residual };
}

/** rho_AC from a three-qubit rho: trace out the MIDDLE qubit, which neither partialTrace helper does. */
function partialTraceOutMiddleQubit(rho: DensityMatrix): DensityMatrix {
  const out: C[][] = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => [0, 0] as C));
  for (let a = 0; a < 2; a++) {
    for (let c = 0; c < 2; c++) {
      for (let a2 = 0; a2 < 2; a2++) {
        for (let c2 = 0; c2 < 2; c2++) {
          let re = 0;
          let im = 0;
          for (let b = 0; b < 2; b++) {
            const i = a * 4 + b * 2 + c;
            const j = a2 * 4 + b * 2 + c2;
            re += rho[i]![j]![0];
            im += rho[i]![j]![1];
          }
          out[a * 2 + c]![a2 * 2 + c2] = [re, im];
        }
      }
    }
  }
  return out;
}

function traceOfSquare(rho: DensityMatrix): number {
  let trace = 0;
  for (let i = 0; i < rho.length; i++) {
    for (let j = 0; j < rho.length; j++) {
      // Tr(rho^2) = sum_ij rho_ij rho_ji, and rho is Hermitian so rho_ji = conj(rho_ij).
      const [re, im] = rho[i]![j]!;
      trace += re * re + im * im;
    }
  }
  return trace;
}

// ---------------------------------------------------------------------------
// Maximum CHSH value (Horodecki criterion)
// ---------------------------------------------------------------------------

export interface MaxCHSHResult {
  /** max over all measurement settings of |<B>| for this state — a closed form, not a search. */
  readonly maxS: number;
  /** True when maxS > 2, i.e. the state violates CHSH for SOME choice of settings. */
  readonly violatesCHSH: boolean;
  /** Tsirelson's ceiling. No quantum state can exceed it, which is the point of reporting it. */
  readonly tsirelsonBound: number;
}

/**
 * The Horodecki criterion (1995): for a two-qubit state, the maximum CHSH value
 * over ALL measurement settings is `2 sqrt(M)`, where M is the sum of the two
 * largest eigenvalues of T^T T and T is the correlation matrix
 * T_ij = Tr(rho (sigma_i (x) sigma_j)).
 *
 * This is a closed form, so it does not search over angles and cannot miss a
 * better setting — which is exactly why it can be used to test the Tsirelson
 * bound rather than merely illustrate it. `core/physics.ts::chshS` computes S
 * for GIVEN angles and is unchanged and still the right tool for that; this
 * answers the different question of what the best angles would yield.
 */
export function maximumCHSH(rho: DensityMatrix): MaxCHSHResult {
  if (rho.length !== 4) throw new Error('maximumCHSH: defined for two qubits (4x4) only.');
  const pauli: C[][][] = [
    [[[0, 0], [1, 0]], [[1, 0], [0, 0]]],            // sigma_x
    [[[0, 0], [0, -1]], [[0, 1], [0, 0]]],           // sigma_y
    [[[1, 0], [0, 0]], [[0, 0], [-1, 0]]],           // sigma_z
  ];
  const t: number[][] = Array.from({ length: 3 }, () => new Array<number>(3).fill(0));
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      t[i]![j] = realTrace(matMul(rho, kron2(pauli[i]!, pauli[j]!)));
    }
  }
  // T^T T is real symmetric and positive semidefinite by construction.
  const tt: number[][] = Array.from({ length: 3 }, (_, i) =>
    Array.from({ length: 3 }, (_, j) => {
      let sum = 0;
      for (let k = 0; k < 3; k++) sum += t[k]![i]! * t[k]![j]!;
      return sum;
    }));
  const eigenvalues = symmetricEigenvalues(tt);
  const m = eigenvalues[2]! + eigenvalues[1]!;
  const maxS = 2 * Math.sqrt(Math.max(0, m));
  return { maxS, violatesCHSH: maxS > 2 + EPS, tsirelsonBound: 2 * Math.SQRT2 };
}

// ---------------------------------------------------------------------------
// No-communication theorem, as an executable check
// ---------------------------------------------------------------------------

export interface NoCommunicationResult {
  /** Largest |entry| difference between rho_B before and after A's local unitary. */
  readonly maxDeviation: number;
  /** True when rho_B is unchanged to numerical precision, as the theorem requires. */
  readonly holds: boolean;
}

/**
 * Applies an arbitrary local unitary on A and measures whether B's reduced
 * state moved. The theorem says it cannot; this returns the actual deviation so
 * the claim is demonstrated rather than repeated.
 *
 * Genesis states the no-FTL rule constantly. A rule the code cannot exhibit is
 * a slogan, and this is the difference.
 */
export function checkNoCommunication(
  rho: DensityMatrix,
  dimA: number,
  dimB: number,
  unitaryA: DensityMatrix,
): NoCommunicationResult {
  const before = partialTraceA(rho, dimA, dimB);
  const identityB = identity(dimB);
  const u = kron(unitaryA, identityB);
  const uDagger = daggerOf(u);
  const after = partialTraceA(matMul(matMul(u, rho), uDagger), dimA, dimB);
  let maxDeviation = 0;
  for (let i = 0; i < dimB; i++) {
    for (let j = 0; j < dimB; j++) {
      maxDeviation = Math.max(
        maxDeviation,
        Math.abs(before[i]![j]![0] - after[i]![j]![0]),
        Math.abs(before[i]![j]![1] - after[i]![j]![1]),
      );
    }
  }
  return { maxDeviation, holds: maxDeviation < 1e-9 };
}

// ---------------------------------------------------------------------------
// Small matrix utilities
// ---------------------------------------------------------------------------

export function identity(n: number): DensityMatrix {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => [i === j ? 1 : 0, 0] as C));
}

export function matMul(a: DensityMatrix, b: DensityMatrix): DensityMatrix {
  const n = a.length;
  const m = b[0]!.length;
  const inner = b.length;
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: m }, (_, j) => {
      let re = 0;
      let im = 0;
      for (let k = 0; k < inner; k++) {
        const p = mul(a[i]![k]!, b[k]![j]!);
        re += p[0];
        im += p[1];
      }
      return [re, im] as C;
    }));
}

export function kron(a: DensityMatrix, b: DensityMatrix): DensityMatrix {
  const na = a.length;
  const nb = b.length;
  return Array.from({ length: na * nb }, (_, i) =>
    Array.from({ length: na * nb }, (_, j) =>
      mul(a[Math.floor(i / nb)]![Math.floor(j / nb)]!, b[i % nb]![j % nb]!)));
}

const kron2 = (a: C[][], b: C[][]): DensityMatrix => kron(a, b);

function daggerOf(m: DensityMatrix): DensityMatrix {
  return Array.from({ length: m[0]!.length }, (_, i) =>
    Array.from({ length: m.length }, (_, j) => conj(m[j]![i]!)));
}

function realTrace(m: DensityMatrix): number {
  let trace = 0;
  for (let i = 0; i < m.length; i++) trace += m[i]![i]![0];
  return trace;
}

/**
 * Principal square root of a positive-semidefinite Hermitian matrix.
 *
 * Uses the SAME real embedding as `hermitianEigenvalues`, and for a reason
 * stronger than convenience: H -> [[A, -B], [B, A]] is a ring homomorphism, so
 * the real symmetric square root of the embedded 2n x 2n matrix IS the
 * embedding of sqrt(H). Reading the top-left and bottom-left blocks back out
 * therefore needs no complex eigenvectors at all.
 *
 * That matters. The obvious alternative — pairing up the doubled real
 * eigenvectors and rebuilding complex ones — is wrong on a DEGENERATE spectrum,
 * where two real eigenvectors of the same eigenvalue can map to the same
 * complex direction. The maximally mixed state is exactly that case, and it is
 * one of the states this module must get right.
 *
 * Private: a general matrix square root is a bigger promise than this file keeps.
 */
function hermitianSqrt(rho: DensityMatrix): DensityMatrix {
  const n = rho.length;
  const size = 2 * n;
  const m: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const [re, im] = rho[i]![j]!;
      m[i]![j] = re;
      m[i]![j + n] = -im;
      m[i + n]![j] = im;
      m[i + n]![j + n] = re;
    }
  }
  const { values, vectors } = symmetricEigenSystem(m);
  // sqrt(M) = sum_k sqrt(lambda_k) v_k v_k^T — real, orthonormal, degeneracy-safe.
  const root: number[][] = Array.from({ length: size }, () => new Array<number>(size).fill(0));
  for (let k = 0; k < size; k++) {
    const s = Math.sqrt(Math.max(0, values[k]!));
    if (s < EPS) continue;
    const v = vectors[k]!;
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) root[i]![j] += s * v[i]! * v[j]!;
    }
  }
  // Read the embedding back: top-left block is the real part, bottom-left the imaginary.
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => [root[i]![j]!, root[i + n]![j]!] as C));
}

/** Cyclic Jacobi with eigenvector accumulation. Same solver as above, returning V as well. */
function symmetricEigenSystem(input: number[][]): { values: number[]; vectors: number[][] } {
  const n = input.length;
  const a = input.map((row) => [...row]);
  const v: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i]![j]! * a[i]![j]!;
    if (off < 1e-24) break;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p]![q]!;
        if (Math.abs(apq) < 1e-18) continue;
        const theta = (a[q]![q]! - a[p]![p]!) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k]![p]!;
          const akq = a[k]![q]!;
          a[k]![p] = c * akp - s * akq;
          a[k]![q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p]![k]!;
          const aqk = a[q]![k]!;
          a[p]![k] = c * apk - s * aqk;
          a[q]![k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k]![p]!;
          const vkq = v[k]![q]!;
          v[k]![p] = c * vkp - s * vkq;
          v[k]![q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const order = Array.from({ length: n }, (_, i) => i).sort((x, y) => a[x]![x]! - a[y]![y]!);
  return {
    values: order.map((i) => a[i]![i]!),
    vectors: order.map((i) => Array.from({ length: n }, (_, k) => v[k]![i]!)),
  };
}
