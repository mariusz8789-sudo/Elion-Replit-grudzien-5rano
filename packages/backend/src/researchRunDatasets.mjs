/**
 * Dataset ingestion for one ResearchRun. A dataset is a file with its SHA-256, a licence field and an origin
 * URL. The bytes go to research_source_records (content-addressed, re-verified on every read) and a
 * DATASET_ATTACHED event in the run's hash chain names them, in one transaction. An experiment that uses
 * the dataset is bound to it in the plan (datasets/runDatasets.mjs resolveDatasetCell) and in its frozen
 * protocol, and the Evidence Pack carries both.
 *
 * Honest limits: the origin URL is DECLARED by the person who registered the file; Genesis does not fetch
 * it, so the dataset's provenance class is UNKNOWN, never SOURCE_FACT and never REAL_MEASUREMENT. A missing
 * licence is UNKNOWN, never assumed open.
 */
import { appendServerResearchStateEvent } from './agentRun.mjs';
import { datasetsOf, MAX_DATASET_BYTES, parseCsv, verifyDatasetBytes } from './datasets/runDatasets.mjs';
import { sha256Hex } from './determinism.mjs';
import { classifyLiteratureLicence } from './literature/literatureContracts.mjs';
import { PROVENANCE_CLASS } from './provenanceClass.mjs';
import { getResearchRun, inWriteTransaction, RESEARCH_RUN_CONTRACT_VERSION } from './researchRun.mjs';
import { putSourceRecord, readSourceRecord, SOURCE_RECORD_KIND, SOURCE_RECORD_STATUS } from './sourceRecordStore.mjs';

export const DATASET_RECORD_VERSION = 'research-run-dataset@1';
const MEDIA_TYPES = new Set(['text/csv', 'application/json', 'text/plain']);
const STR = (value, max) => typeof value === 'string' && value.trim().length > 0 ? value.trim().slice(0, max) : null;

function originOf(value) {
  if (value === null || value === undefined || value === '') return { ok: true, url: null };
  let url;
  try { url = new URL(String(value)); } catch { return { ok: false }; }
  if (url.protocol !== 'https:' || url.username || url.password) return { ok: false };
  return { ok: true, url: url.toString() };
}

function bytesOf(input) {
  if (typeof input?.contentBase64 === 'string') {
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(input.contentBase64)) return null;
    return Buffer.from(input.contentBase64, 'base64');
  }
  if (typeof input?.content === 'string') return Buffer.from(input.content, 'utf8');
  return null;
}

/** Registers one dataset to a RUNNING run. Idempotent per sha256. */
export function attachResearchRunDataset(db, projectId, runId, input = {}, { userId = null, at } = {}) {
  const name = STR(input.name, 200);
  const mediaType = STR(input.mediaType, 100) ?? 'text/csv';
  if (!name) return { ok: false, status: 'INVALID_DATASET', reason: 'name' };
  if (!MEDIA_TYPES.has(mediaType)) return { ok: false, status: 'INVALID_DATASET', reason: 'mediaType' };
  if (!Object.hasOwn(input, 'licence')) return { ok: false, status: 'INVALID_DATASET', reason: 'licence_field_required' };
  const origin = originOf(input.originUrl);
  if (!origin.ok) return { ok: false, status: 'INVALID_DATASET', reason: 'originUrl' };
  const body = bytesOf(input);
  if (!body || body.byteLength === 0) return { ok: false, status: 'INVALID_DATASET', reason: 'content' };
  if (body.byteLength > MAX_DATASET_BYTES) return { ok: false, status: 'INVALID_DATASET', reason: 'too_large' };
  const sha256 = sha256Hex(body);
  if (input.sha256 !== undefined && input.sha256 !== sha256) return { ok: false, status: 'DATASET_HASH_MISMATCH', reason: `declared ${String(input.sha256).slice(0, 64)}, received ${sha256}` };
  let table = null;
  if (mediaType === 'text/csv') {
    const parsed = parseCsv(body.toString('utf8'));
    if (!parsed.ok) return { ok: false, status: 'INVALID_DATASET', reason: parsed.reason };
    table = { columns: parsed.header, rowCount: parsed.rows.length };
  }
  const licence = classifyLiteratureLicence(input.licence);

  return inWriteTransaction(db, () => {
    const current = getResearchRun(db, projectId, runId);
    if (!current) return { ok: false, status: 'NOT_FOUND' };
    if (!current.researchState.chain.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE' };
    if (current.run.status !== 'RUNNING') return { ok: false, status: 'RUN_NOT_WRITABLE', reason: current.run.status };
    const datasetId = `dataset:${sha256}`;
    const existing = datasetsOf(current.researchState).find((d) => d.datasetId === datasetId);
    if (existing) return { ok: true, deduped: true, dataset: existing, researchRun: current };
    const stored = putSourceRecord(db, { kind: SOURCE_RECORD_KIND.DATASET, mediaType, body });
    if (stored.sha256 !== sha256) return { ok: false, status: 'STATE_INTEGRITY_FAILURE', reason: 'dataset_hash_mismatch' };
    // Content-addressed: an earlier, since-altered row under the same key is never trusted or overwritten.
    if (readSourceRecord(db, sha256).status !== SOURCE_RECORD_STATUS.INTACT) return { ok: false, status: 'SOURCE_RECORD_TAMPERED', reason: sha256 };
    const appended = appendServerResearchStateEvent(db, runId, 'DATASET_ATTACHED', {
      contractVersion: RESEARCH_RUN_CONTRACT_VERSION,
      recordVersion: DATASET_RECORD_VERSION,
      researchRunId: runId,
      datasetId,
      artifactId: stored.artifactId,
      sha256,
      bytes: stored.bytes,
      name,
      fileName: STR(input.fileName, 300),
      mediaType,
      columns: table?.columns ?? null,
      rowCount: table?.rowCount ?? null,
      licence: licence.licence,
      licenceStatus: licence.licenceStatus,
      originUrl: origin.url,
      originStatus: origin.url ? 'DECLARED_NOT_FETCHED' : 'UNKNOWN',
      provenanceClass: PROVENANCE_CLASS.UNKNOWN,
      registeredBy: { kind: 'USER', userId },
      epistemicStatus: 'NOT_EVIDENCE',
    }, at);
    if (!appended.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE', reason: appended.error };
    const researchRun = getResearchRun(db, projectId, runId);
    return { ok: true, deduped: false, dataset: datasetsOf(researchRun.researchState).find((d) => d.datasetId === datasetId), researchRun };
  });
}

/** Every registered dataset with a fresh byte check and the experiments frozen against it. */
export function listResearchRunDatasets(db, researchRun) {
  return datasetsOf(researchRun.researchState).map((dataset) => ({
    ...dataset,
    custody: verifyDatasetBytes(db, dataset).status,
    usedByExperimentIds: researchRun.experiments.filter((x) => x.frozen?.datasetBinding?.datasetId === dataset.datasetId).map((x) => x.experimentId),
  }));
}
