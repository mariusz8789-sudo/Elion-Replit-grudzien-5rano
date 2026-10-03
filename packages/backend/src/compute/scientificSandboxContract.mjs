import { canonicalHash } from '../provenance.mjs';

export const SCIENTIFIC_SANDBOX_POLICY = Object.freeze({
  version: 'scientific-sandbox-policy@1',
  language: 'python',
  network: 'DENY_ALL',
  rootFilesystem: 'READ_ONLY',
  hostFilesystem: 'NO_ACCESS',
  secrets: 'NONE',
  capabilities: 'DROP_ALL',
  noNewPrivileges: true,
  packagePolicy: 'PINNED_IN_IMAGE_ONLY',
  datasetPolicy: 'ALLOWLISTED_ARTIFACT_REFS_ONLY',
  cpuLimit: 1,
  memoryMb: 1024,
  wallClockMs: 120_000,
  processLimit: 32,
  stdoutBytes: 1_000_000,
  stderrBytes: 1_000_000,
  artifactBytes: 100_000_000,
});

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,299}$/;
const IMAGE = /^[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$/;

export function validateSandboxRequest(request) {
  const errors = [];
  for (const field of ['sandboxRunId', 'researchRunId', 'experimentId']) {
    if (typeof request?.[field] !== 'string' || !ID.test(request[field])) errors.push(field + ': invalid');
  }
  if (request?.language !== 'python') errors.push('language: only python is admitted');
  if (typeof request?.source !== 'string' || request.source.length === 0 || request.source.length > 50_000 || request.source.includes('\u0000')) {
    errors.push('source: invalid');
  }
  if (!Array.isArray(request?.datasetRefs)) errors.push('datasetRefs: must be an array');
  else {
    for (const ref of request.datasetRefs) {
      if (typeof ref?.artifactId !== 'string' || !/^artifact:[a-f0-9]{64}$/.test(ref.artifactId)) errors.push('datasetRefs: invalid artifact identity');
      if (typeof ref?.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(ref.sha256)) errors.push('datasetRefs: sha256 required');
      else if (ref?.artifactId !== 'artifact:' + ref.sha256) errors.push('datasetRefs: artifact identity/hash mismatch');
      if (ref?.allowlisted !== true) errors.push('datasetRefs: artifact is not allowlisted');
    }
  }
  if (request && ('packages' in request || 'environment' in request || 'secrets' in request || 'command' in request)) {
    errors.push('request: runtime customization is forbidden');
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: request };
}

export function buildSandboxExecutionPlan(request, { image, policy = SCIENTIFIC_SANDBOX_POLICY } = {}) {
  const validated = validateSandboxRequest(request);
  if (!validated.ok) return validated;
  if (typeof image !== 'string' || !IMAGE.test(image)) return { ok: false, errors: ['image: immutable digest required'] };

  const sourceHash = canonicalHash({ language: 'python', source: request.source });
  const datasetIdentity = request.datasetRefs.map((ref) => ({ artifactId: ref.artifactId, sha256: ref.sha256 }));
  const environmentFingerprint = canonicalHash({ image, policy, datasetIdentity });

  return {
    ok: true,
    plan: Object.freeze({
      sandboxRunId: request.sandboxRunId,
      researchRunId: request.researchRunId,
      experimentId: request.experimentId,
      image,
      sourceHash,
      sourceStdin: request.source,
      datasetIdentity: Object.freeze(datasetIdentity),
      environmentFingerprint,
      policy,
      invocation: Object.freeze({
        executable: 'container-runtime',
        shell: false,
        stdin: 'SOURCE_VIA_CONTROLLED_RUNNER_PROTOCOL',
        mounts: Object.freeze([]),
        network: 'none',
        readOnlyRoot: true,
      }),
    }),
  };
}

const REQUIRED_ATTESTATION = Object.freeze({
  containerIsolation: true,
  networkDenyByDefault: true,
  noHostFilesystem: true,
  noSecrets: true,
  readOnlyRoot: true,
  packageAllowlist: true,
  cpuLimit: true,
  memoryLimit: true,
  wallClockLimit: true,
  processLimit: true,
  outputLimit: true,
});

export function createScientificSandboxPort({ backend } = {}) {
  if (!backend || typeof backend.attest !== 'function' || typeof backend.execute !== 'function') {
    throw new Error('SANDBOX_BACKEND_REQUIRED');
  }
  return Object.freeze({
    async execute(request, options) {
      const attestation = await backend.attest();
      const missing = Object.entries(REQUIRED_ATTESTATION)
        .filter(([key, required]) => required && attestation?.[key] !== true)
        .map(([key]) => key);
      if (missing.length > 0) {
        return {
          ok: false,
          status: 'BLOCKED_BY_CONFIGURATION',
          failureCode: 'SANDBOX_ISOLATION_INCOMPLETE',
          missing,
        };
      }
      const built = buildSandboxExecutionPlan(request, options);
      if (!built.ok) return { ok: false, status: 'BLOCKED_BY_DATA', failureCode: 'SANDBOX_REQUEST_INVALID', errors: built.errors };
      return backend.execute(built.plan);
    },
  });
}

export function admitCurrentScientificSandbox() {
  return {
    ok: false,
    status: 'BLOCKED_BY_CONFIGURATION',
    failureCode: 'CONTAINER_SANDBOX_BACKEND_NOT_CONFIGURED',
  };
}
