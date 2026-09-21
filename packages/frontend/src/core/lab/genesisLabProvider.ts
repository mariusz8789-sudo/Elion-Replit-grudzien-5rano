import type { AnalysisProvider, KernelContext } from '@genesis/core/mythos/KernelProviderRegistry.js';
import type { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import { createGenesisLabRuntime } from './genesisLabRuntime';
import { createGenesisWorldVisualizationPort } from './genesisWorldVisualizationPort';
import { createGenesisKinematicsSolverBinding, type KinematicsSolverInput, type KinematicsSolverOutput } from './genesisSolverBinding';
import { createGenesisLabPersistencePort } from './genesisPersistencePort';
import { executeCanonicalScientificSolver, type ScientificSolverExecution } from './scientificSolverIntegration';
import { bindTwinStateToCanonicalWorld, type WorldTwinBindingInput, type WorldTwinBindingResult } from './worldVisualizationIntegration';
import { PersistenceBackedLaboratoryInformationPort } from './limsElnPersistenceIntegration';
import type { LaboratoryRecord } from './limsElnPorts';

/**
 * D-140 real-repo production entry point (CLAUDE_DIRECTIVE.md step 3: "make D-140
 * production-reachable"). Registers ONE `AnalysisProvider` on the SAME single-kernel
 * `KernelProviderRegistry` every other Genesis scientific domain (collider, thermo-lab,
 * molecular-biology, environmental-detective, ...) already registers on — see
 * `core/agent/cyberReasoningKernel.ts`, the module that calls `genesisLabProvider(kernelLedger)`.
 * No new screen, no new route: this is the same "registered on the one kernel, reachable from
 * main.tsx, invoked when a caller resolves the capability" shape the repo already uses for domains
 * that don't (yet) have a bespoke UI of their own.
 *
 * Exposes the three D-140 transfer seams this session bound to real canonical infrastructure —
 * SolverRouter dispatch, WorldGraph/render-probe binding, and LIMS persistence — as one provider
 * with three real, non-overlapping request shapes (the same `'kind' in req` / `'caseGraph' in req`
 * discriminator convention `molecularBiologyProvider`/`environmentalDetectiveProvider` already use).
 */

export interface GenesisLabSolverRequest {
  readonly kind: 'SOLVER_DISPATCH';
  readonly input: KinematicsSolverInput;
}
export interface GenesisLabWorldBindRequest {
  readonly kind: 'WORLD_BIND';
  readonly input: WorldTwinBindingInput;
}
export interface GenesisLabPersistRequest {
  readonly kind: 'PERSIST_RECORD';
  readonly record: LaboratoryRecord;
}
export type GenesisLabRequest = GenesisLabSolverRequest | GenesisLabWorldBindRequest | GenesisLabPersistRequest;

export interface GenesisLabSolverAnalysis {
  readonly execution: ScientificSolverExecution<KinematicsSolverOutput>;
  readonly label: 'D140_CANONICAL_SOLVER_ROUTER_KINEMATICS';
}
export interface GenesisLabWorldBindAnalysis {
  readonly binding: WorldTwinBindingResult;
  readonly label: 'D140_CANONICAL_WORLDGRAPH_TWIN_BINDING';
}
export interface GenesisLabPersistAnalysis {
  readonly stored: LaboratoryRecord | undefined;
  readonly label: 'D140_CANONICAL_STORAGE_LIMS_PERSISTENCE';
}

/** Kernel provider (D-140): every dispatch is anchored on the kernel ledger via the canonical LabRuntime evidence port. */
export function genesisLabProvider(ledger: EvidenceLedger): AnalysisProvider {
  const runtime = createGenesisLabRuntime(ledger, 'd140-laboratory-kernel-provider');
  const solver = createGenesisKinematicsSolverBinding();
  const world = createGenesisWorldVisualizationPort(runtime.deterministic);
  const persistence = createGenesisLabPersistencePort();
  const lims = new PersistenceBackedLaboratoryInformationPort(runtime, persistence);

  return {
    providerId: 'd140-laboratory',
    capabilities: ['d140-laboratory'],
    analyze: (_ctx: KernelContext, req: unknown): unknown => {
      const request = req as GenesisLabRequest;
      if (request.kind === 'SOLVER_DISPATCH') {
        const execution = executeCanonicalScientificSolver(runtime, solver, request.input, ['D140_KERNEL_PROVIDER_SOLVER_DISPATCH']);
        return { execution, label: 'D140_CANONICAL_SOLVER_ROUTER_KINEMATICS' } satisfies GenesisLabSolverAnalysis;
      }
      if (request.kind === 'WORLD_BIND') {
        const binding = bindTwinStateToCanonicalWorld(runtime, world, request.input);
        return { binding, label: 'D140_CANONICAL_WORLDGRAPH_TWIN_BINDING' } satisfies GenesisLabWorldBindAnalysis;
      }
      lims.putRecord(request.record);
      const stored = lims.getRecord(request.record.experimentId);
      return { stored, label: 'D140_CANONICAL_STORAGE_LIMS_PERSISTENCE' } satisfies GenesisLabPersistAnalysis;
    },
  };
}
