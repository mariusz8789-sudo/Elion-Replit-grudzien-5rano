import type { LabRuntime } from './labRuntime';
import { emitLabEvidence } from './labRuntime';

export interface ScientificSolverBinding<I, O> {
  readonly solverId: string;
  readonly modelId: string;
  readonly version: string;
  execute(input: I): O;
}

export interface ScientificSolverExecution<O> {
  readonly solverId: string;
  readonly modelId: string;
  readonly version: string;
  readonly output: O;
  readonly inputFingerprint: string;
  readonly outputFingerprint: string;
}

/**
 * Adapter over an injected canonical scientific solver. It intentionally contains no
 * solver registry of its own; the real repo must inject the existing SolverRouter binding.
 */
export function executeCanonicalScientificSolver<I, O>(
  runtime: LabRuntime,
  solver: ScientificSolverBinding<I, O>,
  input: I,
  provenance: readonly string[],
): ScientificSolverExecution<O> {
  const output = solver.execute(input);
  const result: ScientificSolverExecution<O> = {
    solverId: solver.solverId,
    modelId: solver.modelId,
    version: solver.version,
    output,
    inputFingerprint: runtime.deterministic.fingerprint(input),
    outputFingerprint: runtime.deterministic.fingerprint(output),
  };
  emitLabEvidence(runtime, {
    type: 'SCIENTIFIC_SOLVER_EXECUTED',
    modelId: solver.modelId,
    solverId: solver.solverId,
    input,
    result,
    epistemicStatus: 'SIMULATION',
    evidenceClass: 'MODEL',
    provenance,
    limitations: ['Standalone E2E injects a deterministic Newton-cooling solver. Real Genesis integration must inject the canonical SolverRouter/D-138/D-139 binding.'],
  });
  return result;
}

export interface NewtonCoolingInput {
  readonly initialKelvin: number;
  readonly ambientKelvin: number;
  readonly coolingConstantPerSecond: number;
  readonly elapsedSeconds: number;
}

export interface NewtonCoolingOutput {
  readonly temperatureKelvin: number;
}

/** Real analytic Newton cooling equation used only as a deterministic transfer-test solver. */
export const newtonCoolingTransferSolver: ScientificSolverBinding<NewtonCoolingInput, NewtonCoolingOutput> = {
  solverId: 'newton-cooling-analytic-transfer-v1',
  modelId: 'NEWTON_COOLING_TRANSFER_FIXTURE',
  version: '1.0.0',
  execute(input: NewtonCoolingInput): NewtonCoolingOutput {
    if (input.coolingConstantPerSecond < 0 || input.elapsedSeconds < 0) throw new Error('Cooling constant and elapsed time must be non-negative');
    const temperatureKelvin = input.ambientKelvin
      + (input.initialKelvin - input.ambientKelvin) * Math.exp(-input.coolingConstantPerSecond * input.elapsedSeconds);
    return { temperatureKelvin };
  },
};
