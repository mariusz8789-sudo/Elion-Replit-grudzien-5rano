import { describe, expect, it } from 'vitest';
import type { C } from '../core/quantumState';
import {
  checkCKWMonogamy, checkNoCommunication, concurrence, densityFromState, entanglementEntropyBits,
  entropyOfFormation, hermitianEigenvalues, horodeckiBoundEntangled3x3, identity, logarithmicNegativity,
  maximumCHSH, negativity, partialTraceA, partialTraceB, peresHorodeckiTest, realignmentCriterion,
  renyiEntropy, schmidtDecomposition, vonNeumannEntropy,
  type DensityMatrix,
} from '../core/quantum/entanglementMeasures';

/**
 * Every assertion below compares against a CLOSED-FORM value that can be
 * derived on paper — never against what this module happens to return. That is
 * the whole reason these particular states were chosen: |Phi+> has S = ln 2,
 * concurrence 1 and negativity 1/2 exactly; the Werner state is separable
 * exactly at p <= 1/3; the Horodecki criterion gives exactly the Tsirelson
 * bound for a Bell state. A test that only pinned current behaviour would
 * survive a sign error in the partial transpose.
 */

const c = (re: number, im = 0): C => [re, im];
const S = Math.SQRT1_2;

/** |Phi+> = (|00> + |11>)/sqrt(2) */
const PHI_PLUS: C[] = [c(S), c(0), c(0), c(S)];
/** |Psi-> = (|01> - |10>)/sqrt(2) */
const PSI_MINUS: C[] = [c(0), c(S), c(-S), c(0)];
/** |0>|+> — a product state, entangled by nothing. */
const PRODUCT: C[] = [c(S), c(S), c(0), c(0)];
/** |GHZ> = (|000> + |111>)/sqrt(2) */
const GHZ: C[] = [c(S), c(0), c(0), c(0), c(0), c(0), c(0), c(S)];
/** |W> = (|001> + |010> + |100>)/sqrt(3) */
const W: C[] = (() => {
  const t = 1 / Math.sqrt(3);
  return [c(0), c(t), c(t), c(0), c(t), c(0), c(0), c(0)];
})();

function maximallyMixed(n: number): DensityMatrix {
  return identity(n).map((row) => row.map(([re, im]) => [re / n, im / n] as C));
}

/** Werner state: p |Psi-><Psi-| + (1-p) I/4. Separable exactly for p <= 1/3. */
function werner(p: number): DensityMatrix {
  const bell = densityFromState(PSI_MINUS);
  const mixed = maximallyMixed(4);
  return bell.map((row, i) => row.map(([re, im], j) => [
    p * re + (1 - p) * mixed[i]![j]![0],
    p * im + (1 - p) * mixed[i]![j]![1],
  ] as C));
}

describe('Hermitian eigenvalues — the foundation everything else stands on', () => {
  it('reproduces a hand-computable spectrum', () => {
    // [[2, i], [-i, 2]] has eigenvalues 1 and 3.
    const m: DensityMatrix = [[c(2), c(0, 1)], [c(0, -1), c(2)]];
    const eigenvalues = hermitianEigenvalues(m);
    expect(eigenvalues).toHaveLength(2);
    expect(eigenvalues[0]).toBeCloseTo(1, 10);
    expect(eigenvalues[1]).toBeCloseTo(3, 10);
  });

  it('a density matrix has non-negative eigenvalues summing to one', () => {
    for (const psi of [PHI_PLUS, PSI_MINUS, PRODUCT]) {
      const eigenvalues = hermitianEigenvalues(densityFromState(psi));
      expect(eigenvalues.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
      for (const l of eigenvalues) expect(l).toBeGreaterThan(-1e-9);
    }
  });
});

describe('partial trace', () => {
  /** For a maximally entangled pair the reduced state is maximally mixed — the textbook statement. */
  it('reduces a Bell state to I/2 on both sides', () => {
    const rho = densityFromState(PHI_PLUS);
    for (const reduced of [partialTraceB(rho, 2, 2), partialTraceA(rho, 2, 2)]) {
      expect(reduced[0]![0]![0]).toBeCloseTo(0.5, 12);
      expect(reduced[1]![1]![0]).toBeCloseTo(0.5, 12);
      expect(reduced[0]![1]![0]).toBeCloseTo(0, 12);
      expect(reduced[0]![1]![1]).toBeCloseTo(0, 12);
    }
  });

  it('leaves a product state pure on both sides', () => {
    const rho = densityFromState(PRODUCT);
    // Tr(rho_A^2) = 1 exactly for a pure reduced state.
    const rhoA = partialTraceB(rho, 2, 2);
    expect(vonNeumannEntropy(rhoA)).toBeCloseTo(0, 10);
  });

  it('refuses dimensions that do not match the matrix instead of silently transposing subsystems', () => {
    expect(() => partialTraceB(densityFromState(PHI_PLUS), 2, 3)).toThrow(/dimA\*dimB/);
  });
});

describe('entropies', () => {
  /** S = ln 2 for a Bell state — 1 e-bit, and the single most quoted number in the subject. */
  it('a Bell state carries exactly ln 2 nats = 1 bit', () => {
    const rhoA = partialTraceB(densityFromState(PHI_PLUS), 2, 2);
    expect(vonNeumannEntropy(rhoA)).toBeCloseTo(Math.LN2, 10);
    expect(entanglementEntropyBits(rhoA)).toBeCloseTo(1, 10);
  });

  it('a product state carries exactly zero', () => {
    expect(vonNeumannEntropy(partialTraceB(densityFromState(PRODUCT), 2, 2))).toBeCloseTo(0, 10);
  });

  it('S(rho_A) equals S(rho_B) for a pure state, as Schmidt requires', () => {
    for (const psi of [PHI_PLUS, PSI_MINUS, PRODUCT, [c(0.6), c(0), c(0), c(0.8)] as C[]]) {
      const rho = densityFromState(psi);
      expect(vonNeumannEntropy(partialTraceB(rho, 2, 2))).toBeCloseTo(vonNeumannEntropy(partialTraceA(rho, 2, 2)), 10);
    }
  });

  /** The three Renyi limits, each checked against its own definition rather than against alpha=1. */
  it('Renyi limits: alpha->0 gives ln(rank), alpha->infinity gives -ln(lambda_max), alpha=1 gives von Neumann', () => {
    const rhoA = partialTraceB(densityFromState(PHI_PLUS), 2, 2); // eigenvalues 1/2, 1/2
    expect(renyiEntropy(rhoA, 0)).toBeCloseTo(Math.log(2), 10);
    expect(renyiEntropy(rhoA, Infinity)).toBeCloseTo(-Math.log(0.5), 10);
    expect(renyiEntropy(rhoA, 1)).toBeCloseTo(Math.LN2, 10);
    expect(renyiEntropy(rhoA, 2)).toBeCloseTo(Math.LN2, 10); // flat spectrum: every alpha agrees
  });

  it('Renyi-2 of an unequal spectrum matches its closed form', () => {
    // |psi> = 0.6|00> + 0.8|11> -> rho_A eigenvalues 0.36, 0.64
    const rhoA = partialTraceB(densityFromState([c(0.6), c(0), c(0), c(0.8)]), 2, 2);
    const expected = -Math.log(0.36 * 0.36 + 0.64 * 0.64);
    expect(renyiEntropy(rhoA, 2)).toBeCloseTo(expected, 10);
  });
});

describe('Schmidt decomposition', () => {
  it('rank 2 with equal coefficients for a Bell state — entangled by the rank criterion', () => {
    const result = schmidtDecomposition(PHI_PLUS, 2, 2);
    expect(result.rank).toBe(2);
    expect(result.coefficients[0]).toBeCloseTo(0.5, 10);
    expect(result.coefficients[1]).toBeCloseTo(0.5, 10);
    expect(result.entropy).toBeCloseTo(Math.LN2, 10);
  });

  it('rank 1 for a product state — the criterion that separates the two cases', () => {
    const result = schmidtDecomposition(PRODUCT, 2, 2);
    expect(result.rank).toBe(1);
    expect(result.coefficients[0]).toBeCloseTo(1, 10);
    expect(result.entropy).toBeCloseTo(0, 10);
  });

  it('coefficients always sum to one', () => {
    for (const psi of [PHI_PLUS, PRODUCT, [c(0.6), c(0), c(0), c(0.8)] as C[]]) {
      const sum = schmidtDecomposition(psi, 2, 2).coefficients.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 10);
    }
  });
});

describe('concurrence and entropy of formation (Wootters)', () => {
  it('equals exactly 1 for every Bell state', () => {
    expect(concurrence(densityFromState(PHI_PLUS))).toBeCloseTo(1, 8);
    expect(concurrence(densityFromState(PSI_MINUS))).toBeCloseTo(1, 8);
  });

  it('equals exactly 0 for a product state and for the maximally mixed state', () => {
    expect(concurrence(densityFromState(PRODUCT))).toBeCloseTo(0, 8);
    expect(concurrence(maximallyMixed(4))).toBeCloseTo(0, 8);
  });

  /** C(|psi>) = 2|alpha*delta| for alpha|00> + delta|11> — closed form, so 2*0.6*0.8 = 0.96. */
  it('matches the closed form 2|alpha delta| for a partially entangled pure state', () => {
    expect(concurrence(densityFromState([c(0.6), c(0), c(0), c(0.8)]))).toBeCloseTo(0.96, 8);
  });

  /** Werner concurrence is max(0, (3p-1)/2): zero at p = 1/3, one at p = 1. */
  it('follows the Werner closed form max(0, (3p-1)/2)', () => {
    for (const p of [0, 0.2, 1 / 3, 0.5, 0.75, 1]) {
      expect(concurrence(werner(p))).toBeCloseTo(Math.max(0, (3 * p - 1) / 2), 6);
    }
  });

  it('entropy of formation is 1 bit at C = 1 and 0 at C = 0', () => {
    expect(entropyOfFormation(1)).toBeCloseTo(1, 10);
    expect(entropyOfFormation(0)).toBeCloseTo(0, 10);
  });

  it('refuses anything that is not two qubits rather than returning a number for it', () => {
    expect(() => concurrence(maximallyMixed(8))).toThrow(/two qubits/);
  });
});

describe('Peres-Horodecki and negativity', () => {
  /** N(|Phi+>) = 1/2 exactly, so E_N = log2(2) = 1. */
  it('a Bell state has negativity exactly 1/2 and log-negativity exactly 1', () => {
    const rho = densityFromState(PHI_PLUS);
    expect(negativity(rho, 2, 2)).toBeCloseTo(0.5, 9);
    expect(logarithmicNegativity(rho, 2, 2)).toBeCloseTo(1, 9);
  });

  it('a product state and the maximally mixed state have zero negativity', () => {
    expect(negativity(densityFromState(PRODUCT), 2, 2)).toBeCloseTo(0, 9);
    expect(negativity(maximallyMixed(4), 2, 2)).toBeCloseTo(0, 9);
  });

  /**
   * THE WERNER BOUNDARY. In 2x2 the Peres criterion is necessary AND sufficient,
   * so p = 1/3 is the true separability threshold, not an approximation to it.
   */
  it('places the Werner separability boundary exactly at p = 1/3', () => {
    expect(peresHorodeckiTest(werner(0.32), 2, 2).verdict).toBe('SEPARABLE');
    expect(peresHorodeckiTest(werner(0.34), 2, 2).verdict).toBe('ENTANGLED');
    expect(negativity(werner(0.32), 2, 2)).toBeCloseTo(0, 6);
    expect(negativity(werner(0.34), 2, 2)).toBeGreaterThan(0);
  });

  /**
   * The criterion's SCOPE is part of its result. Above 2x3 a PPT state may be
   * bound entangled, so reporting SEPARABLE there would be a claim the theorem
   * does not license.
   */
  it('refuses to call a PPT state separable outside 2x2 and 2x3', () => {
    const separable3x3 = maximallyMixed(9);
    const result = peresHorodeckiTest(separable3x3, 3, 3);
    expect(result.positiveUnderPartialTranspose).toBe(true);
    expect(result.decisiveForSeparability).toBe(false);
    expect(result.verdict).toBe('PPT_BUT_UNDECIDED');
  });

  it('still calls an NPT state entangled in any dimension, because that direction always holds', () => {
    expect(peresHorodeckiTest(densityFromState(PHI_PLUS), 2, 2).decisiveForSeparability).toBe(true);
    expect(peresHorodeckiTest(densityFromState(PHI_PLUS), 2, 2).verdict).toBe('ENTANGLED');
  });
});

describe('CKW monogamy — a theorem used as a test of the implementation', () => {
  /**
   * GHZ: tau_AB = tau_AC = 0 (both reduced pairs are separable), tau_A|BC = 1.
   * The residual three-tangle is the whole 1 — GHZ entanglement is genuinely
   * tripartite and none of it lives in any pair.
   */
  it('GHZ puts all of its entanglement in the residual three-tangle', () => {
    const result = checkCKWMonogamy(GHZ);
    expect(result.tangleAB).toBeCloseTo(0, 6);
    expect(result.tangleAC).toBeCloseTo(0, 6);
    expect(result.tangleABC).toBeCloseTo(1, 8);
    expect(result.residual).toBeCloseTo(1, 6);
    expect(result.satisfied).toBe(true);
  });

  /**
   * W: tau_AB = tau_AC = 4/9, tau_A|BC = 8/9, so the inequality is SATURATED and
   * the residual three-tangle is exactly zero — W entanglement is entirely
   * pairwise. Two states, two opposite structures, one inequality.
   */
  it('W saturates the inequality with zero residual', () => {
    const result = checkCKWMonogamy(W);
    expect(result.tangleAB).toBeCloseTo(4 / 9, 6);
    expect(result.tangleAC).toBeCloseTo(4 / 9, 6);
    expect(result.tangleABC).toBeCloseTo(8 / 9, 8);
    expect(result.residual).toBeCloseTo(0, 6);
    expect(result.satisfied).toBe(true);
  });

  it('holds for a product of a Bell pair with a spectator, where A keeps all of its share with B', () => {
    // (|00> + |11>)/sqrt(2) on qubits 0,1 tensor |0> on qubit 2.
    const psi: C[] = [c(S), c(0), c(0), c(0), c(0), c(0), c(S), c(0)];
    const result = checkCKWMonogamy(psi);
    expect(result.tangleAB).toBeCloseTo(1, 6);
    expect(result.tangleAC).toBeCloseTo(0, 6);
    expect(result.tangleABC).toBeCloseTo(1, 8);
    expect(result.satisfied).toBe(true);
  });
});

describe('maximum CHSH (Horodecki criterion) and the Tsirelson bound', () => {
  /** A Bell state reaches exactly 2*sqrt(2) — the bound itself, not merely below it. */
  it('a Bell state attains exactly the Tsirelson bound', () => {
    const result = maximumCHSH(densityFromState(PHI_PLUS));
    expect(result.maxS).toBeCloseTo(2 * Math.SQRT2, 8);
    expect(result.violatesCHSH).toBe(true);
    expect(result.maxS).toBeLessThanOrEqual(result.tsirelsonBound + 1e-9);
  });

  it('a product state cannot violate CHSH at any settings', () => {
    const result = maximumCHSH(densityFromState(PRODUCT));
    expect(result.maxS).toBeLessThanOrEqual(2 + 1e-9);
    expect(result.violatesCHSH).toBe(false);
  });

  /**
   * QE1 AS AN EXECUTABLE CHECK: no state may exceed 2*sqrt(2). Swept across the
   * Werner family, including the p = 1/sqrt(2) boundary where CHSH violation
   * begins — which is a DIFFERENT and higher threshold than separability's
   * p = 1/3, and that gap is itself the point.
   */
  it('no Werner state exceeds the Tsirelson bound, and CHSH violation starts at p = 1/sqrt(2)', () => {
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const result = maximumCHSH(werner(Math.min(1, p)));
      expect(result.maxS).toBeLessThanOrEqual(result.tsirelsonBound + 1e-9);
      // Closed form for Werner: maxS = 2*sqrt(2)*p.
      expect(result.maxS).toBeCloseTo(2 * Math.SQRT2 * Math.min(1, p), 6);
    }
    expect(maximumCHSH(werner(0.69)).violatesCHSH).toBe(false);
    expect(maximumCHSH(werner(0.72)).violatesCHSH).toBe(true);
  });

  /**
   * The gap that makes "entangled" and "Bell-violating" different words: a
   * Werner state at p = 0.5 is entangled (concurrence 0.25 > 0) and yet cannot
   * violate CHSH at any settings.
   */
  it('an entangled state can still be unable to violate CHSH', () => {
    const rho = werner(0.5);
    expect(concurrence(rho)).toBeCloseTo(0.25, 6);
    expect(peresHorodeckiTest(rho, 2, 2).verdict).toBe('ENTANGLED');
    expect(maximumCHSH(rho).violatesCHSH).toBe(false);
  });
});

describe('no-communication theorem, demonstrated rather than asserted', () => {
  /**
   * Genesis states the no-FTL rule constantly. This is the difference between a
   * rule the code can exhibit and a slogan: an arbitrary local unitary on A,
   * and B's reduced state measured before and after.
   */
  it('no local unitary on A moves B, for a maximally entangled pair', () => {
    const hadamard: DensityMatrix = [[c(S), c(S)], [c(S), c(-S)]];
    const phase: DensityMatrix = [[c(1), c(0)], [c(0), c(0, 1)]];
    const rotation: DensityMatrix = [[c(Math.cos(0.7)), c(-Math.sin(0.7))], [c(Math.sin(0.7)), c(Math.cos(0.7))]];
    for (const u of [hadamard, phase, rotation]) {
      const result = checkNoCommunication(densityFromState(PHI_PLUS), 2, 2, u);
      expect(result.maxDeviation).toBeLessThan(1e-12);
      expect(result.holds).toBe(true);
    }
  });

  it('holds for a partially entangled state too, not only the maximal one', () => {
    const hadamard: DensityMatrix = [[c(S), c(S)], [c(S), c(-S)]];
    const result = checkNoCommunication(densityFromState([c(0.6), c(0), c(0), c(0.8)]), 2, 2, hadamard);
    expect(result.holds).toBe(true);
  });
});

describe('realignment (CCNR) and bound entanglement — the counterexample PPT cannot see', () => {
  /** ||R(rho)||_1 = 2 exactly for a two-qubit maximally entangled state. */
  it('gives exactly 2 for a Bell state', () => {
    const result = realignmentCriterion(densityFromState(PHI_PLUS), 2, 2);
    expect(result.traceNorm).toBeCloseTo(2, 8);
    expect(result.entangled).toBe(true);
  });

  /** A separable state must not be flagged. 1/d for the maximally mixed state. */
  it('stays silent on separable states rather than claiming separability', () => {
    for (const [rho, dim] of [[maximallyMixed(4), 2], [maximallyMixed(9), 3]] as const) {
      const result = realignmentCriterion(rho, dim, dim);
      expect(result.traceNorm).toBeLessThanOrEqual(1 + 1e-9);
      expect(result.entangled).toBe(false);
      expect(result.margin).toBe(0);
    }
  });

  /**
   * THE POINT OF THE WHOLE PAIR OF CRITERIA. The Horodecki 3x3 a-family is
   * positive under partial transpose AND entangled — bound entanglement. PPT
   * therefore cannot settle separability here, and says so; CCNR, an
   * independent criterion, detects the entanglement PPT structurally misses.
   *
   * This is what makes "PPT is sufficient only in 2x2 and 2x3" a checkable
   * statement in this codebase instead of a sentence in a comment.
   */
  it.each([0.2, 0.5, 0.8])('the Horodecki 3x3 state at a=%f is PPT, yet CCNR proves it entangled', (a) => {
    const rho = horodeckiBoundEntangled3x3(a);
    // It is a real density matrix: Hermitian, trace 1, positive semidefinite.
    expect(hermitianEigenvalues(rho).reduce((x, y) => x + y, 0)).toBeCloseTo(1, 9);
    for (const l of hermitianEigenvalues(rho)) expect(l).toBeGreaterThan(-1e-9);

    const ppt = peresHorodeckiTest(rho, 3, 3);
    expect(ppt.positiveUnderPartialTranspose).toBe(true);
    expect(ppt.decisiveForSeparability).toBe(false);
    expect(ppt.verdict).toBe('PPT_BUT_UNDECIDED');
    expect(negativity(rho, 3, 3)).toBeCloseTo(0, 9);

    const ccnr = realignmentCriterion(rho, 3, 3);
    expect(ccnr.traceNorm).toBeGreaterThan(1);
    expect(ccnr.entangled).toBe(true);
  });

  it('refuses a parameter outside the family range instead of returning a matrix for it', () => {
    expect(() => horodeckiBoundEntangled3x3(0)).toThrow(/strictly in/);
    expect(() => horodeckiBoundEntangled3x3(1)).toThrow(/strictly in/);
  });

  /**
   * MEASURED, AFTER AN ASSUMPTION OF MINE TURNED OUT WRONG. I expected the two
   * criteria to disagree somewhere on the Werner family. They do not: the
   * realigned trace norm is exactly (1 + 3p)/2, which crosses 1 at exactly
   * p = 1/3 — the SAME threshold PPT gives, which in 2x2 is the true
   * separability boundary. On this family the two agree everywhere.
   *
   * So the non-subsumption is not visible here, and claiming it here would have
   * been a fabricated illustration. It is visible in the Horodecki 3x3 case
   * above, where CCNR sees entanglement PPT structurally cannot.
   */
  it('on the Werner family CCNR follows (1+3p)/2 and crosses 1 at exactly the PPT threshold', () => {
    for (const p of [0, 0.2, 0.3, 1 / 3, 0.5, 0.8, 1]) {
      expect(realignmentCriterion(werner(p), 2, 2).traceNorm).toBeCloseTo((1 + 3 * p) / 2, 8);
    }
    expect(realignmentCriterion(werner(1 / 3), 2, 2).traceNorm).toBeCloseTo(1, 9);
    expect(realignmentCriterion(werner(0.32), 2, 2).entangled).toBe(false);
    expect(realignmentCriterion(werner(0.34), 2, 2).entangled).toBe(true);
    expect(peresHorodeckiTest(werner(0.34), 2, 2).verdict).toBe('ENTANGLED');
  });
});
