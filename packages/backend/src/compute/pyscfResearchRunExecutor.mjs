import { createEngineExecutionPort } from './engineExecutionContract.mjs';
import { createLocalCanonicalScientificExecutor } from './localCanonicalScientificExecutor.mjs';

export const PYSCF_CANONICAL_H2 = Object.freeze({
  caseId: 'pyscf:h2-rhf-sto3g-0.74a',
  capabilityId: 'quantum-chemistry',
  input: Object.freeze({
    smiles: '[H][H]',
    method: 'RHF',
    basis: 'sto-3g',
    charge: 0,
    forceField: 'FIXED_H2_074A',
    atoms: Object.freeze([
      Object.freeze({ element: 'H', x: 0, y: 0, z: 0 }),
      Object.freeze({ element: 'H', x: 0, y: 0, z: 0.74 }),
    ]),
  }),
  expectedEnergyHartree: -1.1168,
  toleranceHartree: 0.02,
});

export function createPyScfResearchRunExecutor({ executor = createLocalCanonicalScientificExecutor(), admit, now } = {}) {
  const port = createEngineExecutionPort({ executor, admit, now });
  return Object.freeze({
    async runCanonicalH2({ researchRunId, experimentId, executionId, signal = null }) {
      return port.execute({
        researchRunId,
        experimentId,
        executionId,
        capabilityId: PYSCF_CANONICAL_H2.capabilityId,
        input: PYSCF_CANONICAL_H2.input,
        replayCapability: 'DETERMINISTIC_WITH_PINNED_ENGINE_AND_GEOMETRY',
      }, { signal });
    },
  });
}
