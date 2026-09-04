import { describe, expect, it } from 'vitest';
import { kitaevBulkEnergyAtMomentum, solveKitaevBulk } from '../core/compute/kitaevBulk';
import { quantumKitaevBulk } from '../labs/experiments/quantum-kitaev-bulk';

describe('Q2 — łańcuch Kitaeva bulk BdG', () => {
  it('odczytuje gap i invariant z istniejącego solvera zamiast wprowadzać drugą fizykę Canvasu', () => {
    const params = { chemicalPotential: 0, hopping: 1, pairing: 1 };
    const expected = solveKitaevBulk(params);
    const sim = quantumKitaevBulk.createSim!();

    sim.init(960, 540);
    sim.update(1 / 60, params);

    const stats = sim.getStats!();
    expect(stats.bulkGap).toBeCloseTo(expected.bulkGap, 12);
    expect(stats.invariant).toBe(expected.topologicalInvariant);
    expect(stats.phaseCode).toBe(-1);
    expect(expected.phase).toBe('TOPOLOGICAL_REGIME');
    expect(expected.bulkGap).toBeCloseTo(2, 12);
  });

  it('próbkuje dodatnią gałąź dokładnego pasma BdG używaną także przez solver gapu', () => {
    const params = { chemicalPotential: 0, hopping: 1, pairing: 1 };
    expect(kitaevBulkEnergyAtMomentum(0, params)).toBeCloseTo(2, 12);
    expect(kitaevBulkEnergyAtMomentum(Math.PI / 2, params)).toBeCloseTo(2, 12);
    expect(kitaevBulkEnergyAtMomentum(Math.PI, params)).toBeCloseTo(2, 12);
  });

  it('zachowuje teoretyczną etykietę oraz blokadę twierdzeń o hardware Majorana 1', () => {
    expect(quantumKitaevBulk.id).toBe('kitaev-bulk');
    expect(quantumKitaevBulk.honesty).toBe('theoretical');
    expect(quantumKitaevBulk.honestyNote).toContain('model bulk');
    expect(quantumKitaevBulk.honestyNote).toContain('nie symulacja nanodrutu');
    expect(quantumKitaevBulk.honestyNote).toContain('Majorana 1');

    const narration = quantumKitaevBulk.narrate(
      { chemicalPotential: 0, hopping: 1, pairing: 1 },
      { bulkGap: 2, invariant: -1, phaseCode: -1 },
    );
    expect(narration.some((block) => block.kind === 'warning' && block.body.includes('nie oblicza skończonego przewodu'))).toBe(true);
  });
});
