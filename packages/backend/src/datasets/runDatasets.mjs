/**
 * Datasets registered to a ResearchRun: pure helpers over the DATASET_ATTACHED events and the stored bytes.
 * No researchRun import here, so researchRun.mjs can bind a proposed experiment to a dataset without a cycle.
 */
import { canonicalJson, sha256Hex } from '../determinism.mjs';
import { PROVENANCE_CLASS } from '../provenanceClass.mjs';
import { readSourceRecord, SOURCE_RECORD_STATUS } from '../sourceRecordStore.mjs';

export const DATASET_BINDING_VERSION = 'research-run-dataset-binding@1';
export const MAX_DATASET_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 100_000;

/** Minimal RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF. Returns { ok, header, rows } or { ok:false, reason }. */
export function parseCsv(text) {
  if (typeof text !== 'string' || text.length === 0) return { ok: false, reason: 'csv_empty' };
  const records = [];
  let field = '';
  let record = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; } else if (ch === '"') quoted = false; else field += ch;
      continue;
    }
    if (ch === '"' && field.length === 0) quoted = true;
    else if (ch === ',') { record.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      record.push(field); field = '';
      records.push(record); record = [];
      if (records.length > MAX_ROWS + 1) return { ok: false, reason: 'csv_too_many_rows' };
    } else field += ch;
  }
  if (quoted) return { ok: false, reason: 'csv_unterminated_quote' };
  if (field.length > 0 || record.length > 0) { record.push(field); records.push(record); }
  const nonEmpty = records.filter((r) => !(r.length === 1 && r[0] === ''));
  if (nonEmpty.length === 0) return { ok: false, reason: 'csv_empty' };
  const [header, ...rows] = nonEmpty;
  if (header.some((h) => h.trim() === '') || new Set(header).size !== header.length) return { ok: false, reason: 'csv_header_invalid' };
  if (rows.some((r) => r.length !== header.length)) return { ok: false, reason: 'csv_ragged_rows' };
  return { ok: true, header: header.map((h) => h.trim()), rows };
}

/** The run's registered datasets, one per datasetId, first registration wins. */
export function datasetsOf(researchState) {
  const byId = new Map();
  for (const event of researchState?.events ?? []) {
    if (event?.type !== 'DATASET_ATTACHED' || !event.payload?.datasetId) continue;
    if (!byId.has(event.payload.datasetId)) byId.set(event.payload.datasetId, { ...event.payload, eventSeq: event.seq });
  }
  return [...byId.values()];
}

/** Re-reads the bytes of one registered dataset. INTACT only when they still hash to the registered sha256. */
export function verifyDatasetBytes(db, dataset) {
  const read = readSourceRecord(db, dataset?.sha256);
  if (read.status !== SOURCE_RECORD_STATUS.INTACT) return { ok: false, status: read.status };
  if (read.bytes !== dataset.bytes) return { ok: false, status: SOURCE_RECORD_STATUS.TAMPERED };
  return { ok: true, status: SOURCE_RECORD_STATUS.INTACT, body: read.body };
}

/**
 * Resolves `{ datasetId, row, column }` against the run's datasets and the verified bytes. Returns
 * { ok, value, binding } or { ok:false, reason }. The binding names the dataset, the cell and the
 * SHA-256 of the cell value, so the frozen experiment states exactly which datum it used.
 */
export function resolveDatasetCell(db, datasets, ref) {
  const datasetId = typeof ref?.datasetId === 'string' ? ref.datasetId.trim() : '';
  const dataset = datasets.find((d) => d.datasetId === datasetId);
  if (!dataset) return { ok: false, reason: 'DATASET_NOT_REGISTERED_IN_THIS_RUN' };
  if (dataset.mediaType !== 'text/csv') return { ok: false, reason: 'DATASET_NOT_TABULAR' };
  const row = ref?.row;
  const column = typeof ref?.column === 'string' ? ref.column.trim() : '';
  if (!Number.isInteger(row) || row < 0) return { ok: false, reason: 'DATASET_ROW_INVALID' };
  const verified = verifyDatasetBytes(db, dataset);
  if (!verified.ok) return { ok: false, reason: `DATASET_${verified.status}` };
  const parsed = parseCsv(verified.body.toString('utf8'));
  if (!parsed.ok) return { ok: false, reason: `DATASET_${parsed.reason.toUpperCase()}` };
  const columnIndex = parsed.header.indexOf(column);
  if (columnIndex < 0) return { ok: false, reason: 'DATASET_COLUMN_NOT_FOUND' };
  if (row >= parsed.rows.length) return { ok: false, reason: 'DATASET_ROW_OUT_OF_RANGE' };
  const value = parsed.rows[row][columnIndex].trim();
  if (!value) return { ok: false, reason: 'DATASET_CELL_EMPTY' };
  return {
    ok: true,
    value,
    binding: {
      bindingVersion: DATASET_BINDING_VERSION,
      datasetId: dataset.datasetId,
      artifactId: dataset.artifactId,
      sha256: dataset.sha256,
      bytes: dataset.bytes,
      row,
      column,
      valueSha256: sha256Hex(canonicalJson(value)),
      licence: dataset.licence,
      licenceStatus: dataset.licenceStatus,
      originUrl: dataset.originUrl,
      provenanceClass: dataset.provenanceClass ?? PROVENANCE_CLASS.UNKNOWN,
    },
  };
}
