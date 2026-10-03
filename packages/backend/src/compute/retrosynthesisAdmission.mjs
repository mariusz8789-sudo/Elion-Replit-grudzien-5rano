import { ENGINE_EXECUTION_STATUS } from './engineExecutionContract.mjs';
import { detect as detectRetrosynthesis } from './retroAdapter.mjs';

export const RETROSYNTHESIS_USE_PURPOSE = Object.freeze({
  COMMERCIAL_PRODUCT: 'COMMERCIAL_PRODUCT',
  TECHNICAL_VALIDATION: 'TECHNICAL_VALIDATION',
});

export const RETROSYNTHESIS_ARTIFACT_POLICY = Object.freeze({
  engine: Object.freeze({
    name: 'AiZynthFinder',
    codeLicence: 'MIT',
    licenceStatus: 'APPROVED',
    officialSource: 'https://github.com/MolecularAI/aizynthfinder',
  }),
  artifacts: Object.freeze([
    Object.freeze({ role: 'expansion_policy_model', identityRequired: true, licenceStatus: 'UNKNOWN' }),
    Object.freeze({ role: 'expansion_templates', identityRequired: true, licenceStatus: 'UNKNOWN' }),
    Object.freeze({ role: 'stock', identityRequired: true, licenceStatus: 'UNKNOWN' }),
  ]),
  outputClassification: 'MODEL_ESTIMATE',
  outputKind: 'ROUTE_PROPOSAL',
  procedureStatus: 'NOT_A_LABORATORY_PROCEDURE',
  commercialUseStatus: 'BLOCKED_PENDING_MODEL_TEMPLATE_AND_STOCK_LICENCES',
  sources: Object.freeze({
    licence: 'https://github.com/MolecularAI/aizynthfinder/blob/master/LICENSE',
    requirements: 'https://github.com/MolecularAI/aizynthfinder',
    configuration: 'https://molecularai.github.io/aizynthfinder/configuration.html',
  }),
});

function requiredArtifacts(runtime) {
  return (runtime?.models?.files ?? []).filter((file) => file.required);
}

export function assessRetrosynthesisAdmission({
  purpose = RETROSYNTHESIS_USE_PURPOSE.COMMERCIAL_PRODUCT,
  runtime = detectRetrosynthesis(),
} = {}) {
  if (!Object.values(RETROSYNTHESIS_USE_PURPOSE).includes(purpose)) {
    return {
      ok: false,
      status: ENGINE_EXECUTION_STATUS.BLOCKED_BY_CONFIGURATION,
      failureCode: 'RETROSYNTHESIS_USE_PURPOSE_INVALID',
      policy: RETROSYNTHESIS_ARTIFACT_POLICY,
    };
  }

  if (purpose === RETROSYNTHESIS_USE_PURPOSE.COMMERCIAL_PRODUCT) {
    return {
      ok: false,
      status: ENGINE_EXECUTION_STATUS.BLOCKED_BY_LICENSE,
      failureCode: 'RETRO_MODEL_TEMPLATE_OR_STOCK_LICENSE_UNVERIFIED',
      policy: RETROSYNTHESIS_ARTIFACT_POLICY,
    };
  }

  if (!runtime?.installed) {
    return {
      ok: false,
      status: ENGINE_EXECUTION_STATUS.BLOCKED_BY_RUNTIME,
      failureCode: 'AIZYNTHFINDER_NOT_INSTALLED',
      policy: RETROSYNTHESIS_ARTIFACT_POLICY,
    };
  }

  const required = requiredArtifacts(runtime);
  if (!runtime?.models?.complete || required.length !== RETROSYNTHESIS_ARTIFACT_POLICY.artifacts.length) {
    return {
      ok: false,
      status: ENGINE_EXECUTION_STATUS.BLOCKED_BY_DATA,
      failureCode: 'RETRO_REQUIRED_ARTIFACTS_MISSING',
      missing: runtime?.models?.missing ?? null,
      policy: RETROSYNTHESIS_ARTIFACT_POLICY,
    };
  }

  if (required.some((artifact) => !artifact.present || !/^[a-f0-9]{64}$/.test(artifact.sha256 ?? ''))) {
    return {
      ok: false,
      status: ENGINE_EXECUTION_STATUS.BLOCKED_BY_DATA,
      failureCode: 'RETRO_ARTIFACT_IDENTITY_INCOMPLETE',
      policy: RETROSYNTHESIS_ARTIFACT_POLICY,
    };
  }

  return {
    ok: true,
    status: 'AVAILABLE_FOR_TECHNICAL_VALIDATION',
    artifactIdentity: Object.freeze(Object.fromEntries(required.map((artifact) => [artifact.role, artifact.sha256]))),
    policy: RETROSYNTHESIS_ARTIFACT_POLICY,
  };
}
