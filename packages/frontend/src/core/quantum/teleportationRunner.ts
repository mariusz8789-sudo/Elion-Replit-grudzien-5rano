import { teleport, type C, type Correction } from '../quantumState';

/** Stany wejściowe dostępne zarówno dla Canvasu, jak i kanonicznego Fabric. */
export const TELEPORT_STATE_PRESETS: Readonly<Record<string, { label: string; alpha: C; beta: C }>> = {
  zero: { label: '|0⟩', alpha: [1, 0], beta: [0, 0] },
  one: { label: '|1⟩', alpha: [0, 0], beta: [1, 0] },
  plus: { label: '|+⟩ = (|0⟩+|1⟩)/√2', alpha: [Math.SQRT1_2, 0], beta: [Math.SQRT1_2, 0] },
  minus: { label: '|−⟩ = (|0⟩−|1⟩)/√2', alpha: [Math.SQRT1_2, 0], beta: [-Math.SQRT1_2, 0] },
  plusI: { label: '|+i⟩ = (|0⟩+i|1⟩)/√2', alpha: [Math.SQRT1_2, 0], beta: [0, Math.SQRT1_2] },
  minusI: { label: '|−i⟩ = (|0⟩−i|1⟩)/√2', alpha: [Math.SQRT1_2, 0], beta: [0, -Math.SQRT1_2] },
};

export interface QuantumTeleportBranch {
  outcome0: 0 | 1;
  outcome1: 0 | 1;
  correction: Correction;
  fidelity: number;
}

export interface QuantumTeleportScenario {
  state: string;
  stateLabel: string;
  branchCount: number;
  minFidelity: number;
  averageFidelity: number;
  allRecovered: boolean;
  branches: readonly QuantumTeleportBranch[];
}

/**
 * Enumerates all four Born-measurement branches deterministically. This calls
 * the same exact three-qubit state-vector core as the live Quantum Lab;
 * it does not simulate a device, noise, transport channel, or matter.
 */
export function runQuantumTeleportScenario({ state = 'plus' }: { state?: string } = {}): QuantumTeleportScenario {
  const preset = TELEPORT_STATE_PRESETS[state];
  if (!preset) throw new Error(`Unknown teleport state preset: ${state}.`);
  const branches = ([0, 1] as const).flatMap((outcome0) => ([0, 1] as const).map((outcome1) => {
    const randomValues = [outcome0 === 1 ? 0.25 : 0.75, outcome1 === 1 ? 0.25 : 0.75];
    let cursor = 0;
    const trial = teleport(preset.alpha, preset.beta, () => randomValues[cursor++]);
    return { outcome0: trial.outcome0, outcome1: trial.outcome1, correction: trial.correction, fidelity: trial.fidelity };
  }));
  const fidelities = branches.map((branch) => branch.fidelity);
  return {
    state,
    stateLabel: preset.label,
    branchCount: branches.length,
    minFidelity: Math.min(...fidelities),
    averageFidelity: fidelities.reduce((sum, fidelity) => sum + fidelity, 0) / fidelities.length,
    allRecovered: branches.every((branch) => Math.abs(branch.fidelity - 1) < 1e-12),
    branches,
  };
}
