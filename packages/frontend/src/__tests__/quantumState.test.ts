import { describe, expect, it } from 'vitest';
import {
  applyCNOT,
  applySingleQubitGate,
  H_GATE,
  initState,
  measureQubit,
  stateOverlapSquared,
  teleport,
  X_GATE,
  type C,
} from '../core/quantumState';

/** Generator liniowy kongruentny — deterministyczny, powtarzalny RNG dla testów statystycznych. */
function seededRng(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function normSquared(state: C[]): number {
  return state.reduce((sum, [re, im]) => sum + re * re + im * im, 0);
}

describe('wektor stanu wielu kubitów — bramki (Quantum Lab, teleportacja)', () => {
  it('initState(n) daje |00...0⟩ znormalizowany', () => {
    const s = initState(3);
    expect(s[0]).toEqual([1, 0]);
    expect(normSquared(s)).toBeCloseTo(1, 9);
  });

  it('H na kubicie 0 w stanie 2-kubitowym |00⟩ daje dokładnie 50/50 na tym kubicie, drugi bez zmian', () => {
    const s = applySingleQubitGate(initState(2), 2, 0, H_GATE);
    // |00> -> (|00>+|10>)/sqrt2
    expect(s[0][0]).toBeCloseTo(Math.SQRT1_2, 9);
    expect(s[2][0]).toBeCloseTo(Math.SQRT1_2, 9);
    expect(s[1]).toEqual([0, 0]);
    expect(s[3]).toEqual([0, 0]);
  });

  it('CNOT(0,1) na (H⊗I)|00⟩ tworzy dokładną parę Bell (|00⟩+|11⟩)/√2', () => {
    let s = applySingleQubitGate(initState(2), 2, 0, H_GATE);
    s = applyCNOT(s, 2, 0, 1);
    expect(s[0][0]).toBeCloseTo(Math.SQRT1_2, 9); // |00>
    expect(s[3][0]).toBeCloseTo(Math.SQRT1_2, 9); // |11>
    expect(s[1]).toEqual([0, 0]);
    expect(s[2]).toEqual([0, 0]);
    expect(normSquared(s)).toBeCloseTo(1, 9);
  });

  it('bramki zachowują normę stanu (unitarność) dla dowolnej kombinacji H, X, CNOT', () => {
    let s = initState(3);
    s = applySingleQubitGate(s, 3, 0, H_GATE);
    s = applyCNOT(s, 3, 0, 1);
    s = applySingleQubitGate(s, 3, 2, X_GATE);
    s = applyCNOT(s, 3, 1, 2);
    expect(normSquared(s)).toBeCloseTo(1, 9);
  });

  it('pomiar kubitu w stanie Bell daje skorelowane wyniki (oba 0 albo oba 1), z zachowaniem normy po kolapsie', () => {
    let s = applySingleQubitGate(initState(2), 2, 0, H_GATE);
    s = applyCNOT(s, 2, 0, 1);
    const rnd = seededRng(1);
    const m0 = measureQubit(s, 2, 0, rnd);
    const m1 = measureQubit(m0.newState, 2, 1, rnd);
    expect(m1.outcome).toBe(m0.outcome); // korelacja pary Bell — jeśli 0 to 0, jeśli 1 to 1
    expect(normSquared(m1.newState)).toBeCloseTo(1, 9);
  });

  it('stateOverlapSquared daje 1 dla identycznych stanów, 0 dla ortogonalnych', () => {
    const psi: [C, C] = [[Math.SQRT1_2, 0], [Math.SQRT1_2, 0]];
    expect(stateOverlapSquared(psi, psi)).toBeCloseTo(1, 9);
    expect(stateOverlapSquared([[1, 0], [0, 0]], [[0, 0], [1, 0]])).toBeCloseTo(0, 9);
  });
});

describe('teleportacja kwantowa (Bennett i in. 1993) — protokół 3-kubitowy', () => {
  it('odtwarza DOKŁADNIE oryginalny stan (fidelity=1) dla stanu |0⟩', () => {
    const r = teleport([1, 0], [0, 0], seededRng(1));
    expect(r.fidelity).toBeCloseTo(1, 9);
  });

  it('odtwarza DOKŁADNIE oryginalny stan (fidelity=1) dla stanu |1⟩', () => {
    const r = teleport([0, 0], [1, 0], seededRng(2));
    expect(r.fidelity).toBeCloseTo(1, 9);
  });

  it('odtwarza DOKŁADNIE oryginalny stan dla superpozycji |+⟩=(|0⟩+|1⟩)/√2', () => {
    const r = teleport([Math.SQRT1_2, 0], [Math.SQRT1_2, 0], seededRng(3));
    expect(r.fidelity).toBeCloseTo(1, 9);
  });

  it('odtwarza DOKŁADNIE dowolny stan zespolony (nie tylko rzeczywiste amplitudy)', () => {
    const alpha: C = [0.6, 0.1];
    const betaR = Math.sqrt(1 - 0.6 ** 2 - 0.1 ** 2);
    const beta: C = [betaR * 0.8, betaR * 0.6];
    for (let seed = 1; seed <= 12; seed++) {
      const r = teleport(alpha, beta, seededRng(seed));
      expect(r.fidelity).toBeCloseTo(1, 6);
    }
  });

  it('poprawka jest dokładnie jedną z I/X/Z/XZ, w zależności od wyników pomiaru', () => {
    const seenCorrections = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const r = teleport([0.6, 0], [0.8, 0], seededRng(seed));
      seenCorrections.add(r.correction);
      expect(['I', 'X', 'Z', 'XZ']).toContain(r.correction);
      expect(r.fidelity).toBeCloseTo(1, 6);
    }
    // przy losowych ziarnach powinniśmy zobaczyć więcej niż jedną gałąź korekty
    expect(seenCorrections.size).toBeGreaterThan(1);
  });

  it('wyniki pomiaru (outcome0, outcome1) są losowe (~25% na każdą z 4 kombinacji dla stanu symetrycznego |+⟩)', () => {
    const counts = { '00': 0, '01': 0, '10': 0, '11': 0 };
    const N = 400;
    for (let seed = 1; seed <= N; seed++) {
      const r = teleport([Math.SQRT1_2, 0], [Math.SQRT1_2, 0], seededRng(seed * 7919));
      counts[`${r.outcome0}${r.outcome1}` as keyof typeof counts]++;
    }
    for (const key of Object.keys(counts) as (keyof typeof counts)[]) {
      expect(counts[key]).toBeGreaterThan(N * 0.15); // grubo powyżej 0 — wszystkie 4 gałęzie realnie występują
    }
  });
});
