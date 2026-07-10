import { describe, expect, it } from 'vitest';
import { applyCircuit, applyGate, GATES, quantumBloch, type C } from '../labs/experiments/quantum-bloch';

const ZERO: [C, C] = [[1, 0], [0, 0]];

function prob0(state: [C, C]): number {
  return state[0][0] ** 2 + state[0][1] ** 2;
}

describe('bramki kwantowe (macierze unitarne dokładne)', () => {
  it('każda bramka jest unitarna: zachowuje normę stanu (P(|0⟩)+P(|1⟩)=1)', () => {
    for (const gate of Object.keys(GATES)) {
      const state = applyGate(ZERO, gate);
      const total = state[0][0] ** 2 + state[0][1] ** 2 + state[1][0] ** 2 + state[1][1] ** 2;
      expect(total).toBeCloseTo(1, 9);
    }
  });

  it('H (Hadamard) na |0⟩ daje dokładnie 50/50 superpozycję', () => {
    const state = applyGate(ZERO, 'H');
    expect(prob0(state)).toBeCloseTo(0.5, 9);
  });

  it('X (NOT) zamienia |0⟩ na |1⟩ dokładnie', () => {
    const state = applyGate(ZERO, 'X');
    expect(prob0(state)).toBeCloseTo(0, 9);
  });

  it('X∘X = tożsamość (podwójne zaprzeczenie wraca do startu)', () => {
    const state = applyCircuit(ZERO, ['X', 'X']);
    expect(prob0(state)).toBeCloseTo(1, 9);
  });

  it('H∘H = tożsamość (Hadamard jest własną odwrotnością)', () => {
    const state = applyCircuit(ZERO, ['H', 'H']);
    expect(prob0(state)).toBeCloseTo(1, 9);
    expect(state[0][0]).toBeCloseTo(1, 9);
  });

  it('bramki NIE są przemienne: kolejność X,Z daje inny stan niż Z,X', () => {
    const startSuperposition = applyGate(ZERO, 'H');
    const xThenZ = applyCircuit(startSuperposition, ['X', 'Z']);
    const zThenX = applyCircuit(startSuperposition, ['Z', 'X']);
    // różne stany — przynajmniej jedna amplituda różni się istotnie
    const differs =
      Math.abs(xThenZ[0][0] - zThenX[0][0]) > 1e-6 ||
      Math.abs(xThenZ[0][1] - zThenX[0][1]) > 1e-6 ||
      Math.abs(xThenZ[1][0] - zThenX[1][0]) > 1e-6 ||
      Math.abs(xThenZ[1][1] - zThenX[1][1]) > 1e-6;
    expect(differs).toBe(true);
  });

  it('obwód pusty (brak bramek) zwraca stan bez zmian', () => {
    const state = applyCircuit(ZERO, []);
    expect(state).toEqual(ZERO);
  });

  it('nieznana bramka jest ignorowana (stan bez zmian)', () => {
    const state = applyGate(ZERO, 'CNOT');
    expect(state).toEqual(ZERO);
  });
});

describe('Sfera Blocha — ExperimentDef', () => {
  it('narracja działa z pustym i niepustym obwodem', () => {
    for (const historyLen of [0, 1, 2, 5]) {
      const blocks = quantumBloch.narrate({ decoherence: false }, { p0: 50, shrink: 1, gates: historyLen, historyLen });
      expect(blocks.length).toBeGreaterThan(0);
      for (const b of blocks) {
        expect(b.title.length).toBeGreaterThan(0);
        expect(b.body.length).toBeGreaterThan(0);
      }
    }
  });
});
