import type { LabRuntime } from './labRuntime';
import { emitLabEvidence } from './labRuntime';
export type DataAssimilationMode = 'SIMULATION_ONLY' | 'REAL_DATA' | 'HYBRID';
export interface AssimilationValue { readonly value: number; readonly standardUncertainty: number }
export interface AssimilationResult { readonly mode: DataAssimilationMode; readonly simulated?: AssimilationValue; readonly measured?: AssimilationValue; readonly assimilated: AssimilationValue; readonly provenance: readonly string[] }

export class ScientificDataAssimilation {
  constructor(private readonly runtime: LabRuntime) {}
  assimilate(mode: DataAssimilationMode, simulated: AssimilationValue | undefined, measured: AssimilationValue | undefined, provenance: readonly string[]): AssimilationResult {
    let assimilated: AssimilationValue;
    if (mode === 'SIMULATION_ONLY') { if (simulated === undefined) throw new Error('Simulated value required'); assimilated = simulated; }
    else if (mode === 'REAL_DATA') { if (measured === undefined) throw new Error('Measured value required'); assimilated = measured; }
    else {
      if (simulated === undefined || measured === undefined) throw new Error('Hybrid mode requires simulated and measured values');
      const vs = Math.max(simulated.standardUncertainty ** 2, 1e-18); const vm = Math.max(measured.standardUncertainty ** 2, 1e-18);
      const ws = 1 / vs; const wm = 1 / vm;
      assimilated = { value: (ws * simulated.value + wm * measured.value) / (ws + wm), standardUncertainty: Math.sqrt(1 / (ws + wm)) };
    }
    const result: AssimilationResult = { mode, ...(simulated === undefined ? {} : { simulated }), ...(measured === undefined ? {} : { measured }), assimilated, provenance };
    emitLabEvidence(this.runtime, { type: 'DATA_ASSIMILATED', modelId: 'D140_DATA_ASSIMILATION', solverId: 'precision-weighted-v1', input: { mode, simulated, measured, provenance }, result, epistemicStatus: mode === 'REAL_DATA' ? 'MEASURED' : mode === 'SIMULATION_ONLY' ? 'SIMULATION' : 'HYBRID_DERIVED', evidenceClass: mode === 'REAL_DATA' ? 'MEASUREMENT' : 'DERIVED', provenance });
    return result;
  }
}
