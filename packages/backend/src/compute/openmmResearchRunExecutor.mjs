import { createEngineExecutionPort } from './engineExecutionContract.mjs';
import { createLocalCanonicalScientificExecutor } from './localCanonicalScientificExecutor.mjs';

export const OPENMM_CANONICAL_TIP3P = Object.freeze({
  caseId: 'openmm:tip3p-water-nvt-300steps-seed42',
  capabilityId: 'molecular-dynamics',
  input: Object.freeze({ steps: 300 }),
  protocol: Object.freeze({
    system: 'TIP3P water box',
    forceField: 'amber14/tip3p.xml',
    ensemble: 'NVT',
    integrator: 'LangevinMiddleIntegrator',
    temperatureK: 300,
    frictionPerPs: 1.0,
    timestepPs: 0.002,
    seed: 42,
    nonbondedMethod: 'PME',
    nonbondedCutoffNm: 0.9,
    platform: 'CPU',
  }),
  epistemicClassification: 'MODEL_ESTIMATE',
  scope: 'SOFTWARE_INTEGRATION_REFERENCE_NOT_CANDIDATE_STABILITY',
});

export function createOpenMmResearchRunExecutor({
  executor = createLocalCanonicalScientificExecutor(),
  admit,
  now,
} = {}) {
  const port = createEngineExecutionPort({ executor, admit, now });
  return Object.freeze({
    async runCanonicalTip3p({
      researchRunId,
      experimentId = OPENMM_CANONICAL_TIP3P.caseId,
      executionId,
      signal = null,
    }) {
      const execution = await port.execute({
        researchRunId,
        experimentId,
        executionId,
        capabilityId: OPENMM_CANONICAL_TIP3P.capabilityId,
        input: OPENMM_CANONICAL_TIP3P.input,
        replayCapability: 'REPLAY_UNSUPPORTED_PLATFORM_NUMERICS',
      }, { signal });
      return {
        ...execution,
        protocol: OPENMM_CANONICAL_TIP3P.protocol,
        epistemicClassification: OPENMM_CANONICAL_TIP3P.epistemicClassification,
        scope: OPENMM_CANONICAL_TIP3P.scope,
        runtime: {
          node: process.version,
          os: process.platform,
          architecture: process.arch,
          enginePlatform: execution.result?.platform ?? null,
          hardwareIdentity: null,
          hardwareIdentityStatus: 'NOT_REPORTED_BY_CURRENT_WORKER',
        },
      };
    },
  });
}
