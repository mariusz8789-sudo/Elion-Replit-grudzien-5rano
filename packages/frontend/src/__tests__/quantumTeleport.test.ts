import { describe, expect, it } from 'vitest';
import { runQuantumTeleportScenario } from '../labs/experiments/quantum-teleport';

describe('bounded quantum teleport runner', () => {
  it('evaluates all four measurement branches through the shared three-qubit state vector', () => {
    const result = runQuantumTeleportScenario({ state: 'plusI' });

    expect(result).toEqual(runQuantumTeleportScenario({ state: 'plusI' }));
    expect(result.branchCount).toBe(4);
    expect(result.allRecovered).toBe(true);
    expect(result.minFidelity).toBeCloseTo(1, 12);
    expect(result.averageFidelity).toBeCloseTo(1, 12);
    expect(result.branches.map((branch) => branch.correction).sort()).toEqual(['I', 'X', 'XZ', 'Z']);
  });

  it('rejects a teleport-state preset absent from the shared model', () => {
    expect(() => runQuantumTeleportScenario({ state: 'unknown' })).toThrow('Unknown teleport state preset');
  });
});
