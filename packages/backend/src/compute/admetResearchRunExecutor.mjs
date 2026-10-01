import { createEngineExecutionPort, ENGINE_EXECUTION_STATUS } from './engineExecutionContract.mjs';
import { createLocalCanonicalScientificExecutor } from './localCanonicalScientificExecutor.mjs';

export const ADMET_USE_PURPOSE = Object.freeze({
  COMMERCIAL_PRODUCT: 'COMMERCIAL_PRODUCT',
  TECHNICAL_VALIDATION: 'TECHNICAL_VALIDATION',
});

export const ADMET_CANONICAL_ASPIRIN = Object.freeze({
  caseId: 'admet:aspirin-v2.0.1',
  capabilityId: 'admet-estimation',
  input: Object.freeze({ smiles: 'CC(=O)Oc1ccccc1C(=O)O' }),
});

export const ADMET_MODEL_IDENTITY = Object.freeze({
  engineId: 'admet',
  package: 'admet-ai',
  packageVersion: '2.0.1',
  packageLicence: Object.freeze({ status: 'APPROVED', spdx: 'MIT' }),
  weights: Object.freeze({
    delivery: 'BUNDLED_WITH_PACKAGE',
    exactArtifactHash: null,
    identityStatus: 'UNKNOWN',
    licenceStatus: 'UNKNOWN',
  }),
  trainingData: Object.freeze({
    provider: 'Therapeutics Data Commons',
    datasetSet: 'ADMET datasets used by ADMET-AI v2',
    exactDatasetManifest: null,
    identityStatus: 'UNKNOWN',
    licenceStatus: 'UNKNOWN',
    note: 'TDC code is MIT, but TDC requires licence review for each individual dataset.',
  }),
  outputClassification: 'MODEL_ESTIMATE',
  measurementStatus: 'NOT_A_MEASUREMENT',
  commercialUseStatus: 'BLOCKED_PENDING_WEIGHTS_AND_TRAINING_DATA_AUDIT',
  limitations: Object.freeze([
    'Predictions are probabilistic model estimates, not measurements or clinical safety findings.',
    'Exact bundled weight hashes are not pinned in the current Genesis manifest.',
    'Commercial rights for the complete training-data set have not been verified dataset by dataset.',
    'Important predictions require experimental validation.',
  ]),
});

export function admitAdmetUse({ purpose = ADMET_USE_PURPOSE.COMMERCIAL_PRODUCT } = {}) {
  if (!Object.values(ADMET_USE_PURPOSE).includes(purpose)) {
    return {
      ok: false,
      status: ENGINE_EXECUTION_STATUS.BLOCKED_BY_CONFIGURATION,
      failureCode: 'ADMET_USE_PURPOSE_INVALID',
    };
  }
  if (purpose === ADMET_USE_PURPOSE.COMMERCIAL_PRODUCT) {
    return {
      ok: false,
      status: ENGINE_EXECUTION_STATUS.BLOCKED_BY_LICENSE,
      failureCode: 'ADMET_WEIGHTS_AND_TRAINING_DATA_LICENSE_UNVERIFIED',
    };
  }
  return { ok: true };
}

export function createAdmetResearchRunExecutor({
  executor = createLocalCanonicalScientificExecutor(),
  purpose = ADMET_USE_PURPOSE.COMMERCIAL_PRODUCT,
  admit,
  now,
} = {}) {
  const combinedAdmission = async (request) => {
    const modelAdmission = admitAdmetUse({ purpose });
    if (!modelAdmission.ok) return modelAdmission;
    return typeof admit === 'function' ? admit(request) : { ok: true };
  };
  const port = createEngineExecutionPort({ executor, admit: combinedAdmission, now });

  return Object.freeze({
    async runCanonicalAspirin({
      researchRunId,
      experimentId = ADMET_CANONICAL_ASPIRIN.caseId,
      executionId,
      signal = null,
    }) {
      const execution = await port.execute({
        researchRunId,
        experimentId,
        executionId,
        capabilityId: ADMET_CANONICAL_ASPIRIN.capabilityId,
        input: ADMET_CANONICAL_ASPIRIN.input,
        replayCapability: 'LIMITED_PACKAGE_PINNED_WEIGHTS_UNVERIFIED',
      }, { signal });
      return {
        ...execution,
        epistemicClassification: ADMET_MODEL_IDENTITY.outputClassification,
        measurementStatus: ADMET_MODEL_IDENTITY.measurementStatus,
        purpose,
        modelIdentity: ADMET_MODEL_IDENTITY,
      };
    },
  });
}
