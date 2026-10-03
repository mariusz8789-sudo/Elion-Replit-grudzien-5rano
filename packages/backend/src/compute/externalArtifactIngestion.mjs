import { canonicalHash } from '../provenance.mjs';

const LICENCE = new Set(['APPROVED', 'CONDITIONAL', 'BLOCKED', 'UNKNOWN']);
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,299}$/;

export async function ingestExternalArtifact(request, { artifactStorage, now = () => new Date() } = {}) {
  if (!artifactStorage || typeof artifactStorage.put !== 'function') return { ok: false, status: 'BLOCKED_BY_CONFIGURATION', failureCode: 'ARTIFACT_STORAGE_REQUIRED' };
  if (!ID.test(request?.sourceIdentity?.sourceId ?? '') || typeof request?.sourceIdentity?.canonicalUrl !== 'string') return { ok: false, status: 'BLOCKED_BY_DATA', failureCode: 'SOURCE_IDENTITY_INVALID' };
  if (!LICENCE.has(request?.licence?.status)) return { ok: false, status: 'BLOCKED_BY_LICENSE', failureCode: 'LICENCE_STATUS_REQUIRED' };
  if (request.licence.status === 'BLOCKED' || request.licence.status === 'UNKNOWN') return { ok: false, status: 'BLOCKED_BY_LICENSE', failureCode: 'LICENCE_NOT_ADMITTED', licenceStatus: request.licence.status };
  if (request.licence.status === 'CONDITIONAL' && (!request.licence.conditions || !request.licence.acceptedBy)) return { ok: false, status: 'BLOCKED_BY_LICENSE', failureCode: 'LICENCE_CONDITIONS_NOT_ACCEPTED' };
  const bytes = request.bytes instanceof Uint8Array ? request.bytes : null;
  if (!bytes || bytes.byteLength === 0) return { ok: false, status: 'BLOCKED_BY_DATA', failureCode: 'RAW_BYTES_REQUIRED' };
  if (typeof request.schemaValidator !== 'function') return { ok: false, status: 'BLOCKED_BY_CONFIGURATION', failureCode: 'SCHEMA_VALIDATOR_REQUIRED' };
  const schema = await request.schemaValidator(bytes);
  if (schema?.ok !== true) return { ok: false, status: 'FAILED', failureCode: 'SCHEMA_VALIDATION_FAILED', errors: schema?.errors ?? [] };
  const artifact = await artifactStorage.put({
    key: request.storageKey,
    bytes,
    mimeType: request.mimeType,
    producer: request.producer,
    researchRunId: request.researchRunId,
    experimentId: request.experimentId,
  });
  const custody = {
    custodyVersion: 'external-artifact-custody@1',
    sourceIdentity: request.sourceIdentity,
    licence: request.licence,
    retrievedAt: request.retrievedAt ?? now().toISOString(),
    schemaIdentity: schema.schemaIdentity ?? null,
    artifact,
  };
  return { ok: true, status: 'SUCCESS', artifact, custody: Object.freeze({ ...custody, fingerprint: canonicalHash(custody) }) };
}
