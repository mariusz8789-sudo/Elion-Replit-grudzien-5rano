import { describe, expect, it } from 'vitest';
import { applyCircuit, applyGate, blochVector, GATE_ROTATIONS, GATES, rotateVector, type C } from '../labs/experiments/quantum-bloch';
import { quantumBloch } from '../labs/experiments/quantum-bloch-3d';

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

describe('GATE_ROTATIONS ↔ applyGate (SU(2)→SO(3), sfera Blocha w 3D)', () => {
  // Stany normalizowane |a|²+|b|²=1, nie tylko baza obliczeniowa — obrót
  // musi zgadzać się z macierzą dla KAŻDEGO stanu, nie tylko |0⟩.
  const testStates: [C, C][] = [
    [[1, 0], [0, 0]],
    [[0, 0], [1, 0]],
    [[1 / Math.SQRT2, 0], [1 / Math.SQRT2, 0]],
    [[0.6, 0.2], [Math.sqrt(0.6), 0]],
    [[0.3, -0.4], [0.5, Math.sqrt(1 - 0.09 - 0.16 - 0.25)]],
  ];

  it('obrót wektora Blocha o tabelaryczną oś/kąt daje DOKŁADNIE ten sam stan co zastosowanie macierzy bramki', () => {
    for (const gate of Object.keys(GATE_ROTATIONS)) {
      const { axis, angleRad } = GATE_ROTATIONS[gate];
      for (const state of testStates) {
        const before = blochVector(state[0], state[1]);
        const afterState = applyGate(state, gate);
        const afterExpected = blochVector(afterState[0], afterState[1]);
        const afterRotated = rotateVector(before, axis, angleRad);
        expect(afterRotated[0]).toBeCloseTo(afterExpected[0], 6);
        expect(afterRotated[1]).toBeCloseTo(afterExpected[1], 6);
        expect(afterRotated[2]).toBeCloseTo(afterExpected[2], 6);
      }
    }
  });

  it('blochVector zwraca wektor jednostkowy dla stanu czystego', () => {
    for (const state of testStates) {
      const [x, y, z] = blochVector(state[0], state[1]);
      expect(x * x + y * y + z * z).toBeCloseTo(1, 9);
    }
  });

  it('rotateVector zachowuje długość wektora (obrót jest izometrią)', () => {
    const v: [number, number, number] = [0.4, -0.3, Math.sqrt(1 - 0.16 - 0.09)];
    const rotated = rotateVector(v, [0, 1, 0], 1.234);
    const lenBefore = Math.hypot(...v);
    const lenAfter = Math.hypot(...rotated);
    expect(lenAfter).toBeCloseTo(lenBefore, 9);
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
