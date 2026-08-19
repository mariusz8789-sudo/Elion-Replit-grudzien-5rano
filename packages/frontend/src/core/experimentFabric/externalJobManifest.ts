import { fnv1a, canonicalJson } from '../events/hash';
import { getExternalEngineAdapter, type ExternalExecutionBackend } from './externalAdapters';

export const EXTERNAL_SOLVER_JOB_MANIFEST_VERSION = '1.0.0';

export type ExternalSolverJobStatus = 'AWAITING_RUNTIME';

export interface ExternalJobArtifact {
  role: string;
  sha256: string;
  mediaType: string;
  byteLength: number;
}

export interface ExternalJobResourceLimits {
  cpuCores: number;
  memoryMiB: number;
  wallTimeSeconds: number;
}

export interface ExternalSolverJobRequest {
  adapterId: string;
  containerImageDigest: string;
  inputArtifacts: readonly ExternalJobArtifact[];
  resourceLimits: ExternalJobResourceLimits;
}

/**
 * A non-executable manifest for a future approved runtime. It has no command,
 * output values, log, checkpoint or success status, therefore cannot be
 * mistaken for a completed solver result.
 */
export interface ExternalSolverJobManifest {
  contractVersion: string;
  jobId: string;
  status: ExternalSolverJobStatus;
  adapterId: string;
  backend: ExternalExecutionBackend;
  containerImageDigest: string;
  inputArtifacts: readonly ExternalJobArtifact[];
  resourceLimits: ExternalJobResourceLimits;
  requiredProvenance: readonly string[];
  requiredRuntime: readonly string[];
  executionProhibitedReason: string;
}

const SHA256 = /^[a-f0-9]{64}$/i;
const IMAGE_DIGEST = /^sha256:[a-f0-9]{64}$/i;

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${field} must be a positive integer.`);
}

function canonicalArtifacts(artifacts: readonly ExternalJobArtifact[]): ExternalJobArtifact[] {
  if (artifacts.length === 0) throw new Error('External solver job requires at least one hashed input artifact.');
  const seen = new Set<string>();
  return artifacts.map((artifact) => {
    if (!artifact.role.trim() || !artifact.mediaType.trim() || !SHA256.test(artifact.sha256)) {
      throw new Error('Each input artifact requires a role, media type and SHA-256 hash.');
    }
    assertPositiveInteger(artifact.byteLength, 'input artifact byteLength');
    const key = `${artifact.role}:${artifact.sha256}`;
    if (seen.has(key)) throw new Error('Input artifact role/hash pairs must be unique.');
    seen.add(key);
    return { ...artifact, sha256: artifact.sha256.toLowerCase() };
  }).sort((a, b) => `${a.role}:${a.sha256}`.localeCompare(`${b.role}:${b.sha256}`));
}

export function createExternalSolverJobManifest(request: ExternalSolverJobRequest): ExternalSolverJobManifest {
  const adapter = getExternalEngineAdapter(request.adapterId);
  if (!adapter) throw new Error(`Unknown external solver adapter '${request.adapterId}'.`);
  if (adapter.status !== 'ENGINE_NOT_AVAILABLE') throw new Error('Job manifests are reserved for unavailable external solver seams.');
  if (!IMAGE_DIGEST.test(request.containerImageDigest)) throw new Error('containerImageDigest must be an immutable sha256 image digest.');
  assertPositiveInteger(request.resourceLimits.cpuCores, 'cpuCores');
  assertPositiveInteger(request.resourceLimits.memoryMiB, 'memoryMiB');
  assertPositiveInteger(request.resourceLimits.wallTimeSeconds, 'wallTimeSeconds');

  const inputArtifacts = canonicalArtifacts(request.inputArtifacts);
  const identity = {
    adapterId: adapter.id,
    containerImageDigest: request.containerImageDigest.toLowerCase(),
    inputArtifacts,
    resourceLimits: request.resourceLimits,
  };
  return {
    contractVersion: EXTERNAL_SOLVER_JOB_MANIFEST_VERSION,
    jobId: `external_job_${fnv1a(canonicalJson(identity))}`,
    status: 'AWAITING_RUNTIME', adapterId: adapter.id, backend: adapter.backend,
    containerImageDigest: request.containerImageDigest.toLowerCase(), inputArtifacts,
    resourceLimits: { ...request.resourceLimits },
    requiredProvenance: [...adapter.requiredProvenance, 'container image digest', 'input artifact hashes', 'resource limits'],
    requiredRuntime: adapter.requiredRuntime,
    executionProhibitedReason: `Runtime '${adapter.id}' is ${adapter.status}; this manifest records an approved future job boundary and does not execute a solver or create outputs.`,
  };
}
