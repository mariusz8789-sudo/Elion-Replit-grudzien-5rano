import { sha256Bytes } from '@genesis/core/knowledge/sha256.js';
import type { MedicalDatasetSource, DatasetValidationResult, MedicalDatasetFormat } from './medicalDatasetTypes';
import { parseNifti1Header } from './niftiDatasetAdapter';
import { parseDicomPart10 } from './dicomDatasetAdapter';

function sha256HexBytes(bytes: Uint8Array): string {
  const digest = sha256Bytes(bytes);
  let hex = '';
  for (const b of digest) hex += b.toString(16).padStart(2, '0');
  return hex;
}

export function detectMedicalFormat(bytes: Uint8Array): MedicalDatasetFormat {
  try { parseNifti1Header(bytes); return 'NIFTI1'; } catch { /* not NIfTI-1 */ }
  try { parseDicomPart10(bytes); return 'DICOM_P10'; } catch { /* not DICOM Part-10 */ }
  throw new Error('MEDICAL_DATASET_REJECTED:UNKNOWN_FORMAT');
}

/** Real checksum of the actual bytes against the record's claimed SHA-256 (canonical Genesis hash —
 * never a second content-identity algorithm), real format detection against the claimed format, and
 * the provenance fields a dataset must carry before it may ever be labelled `REAL_DATASET`. */
export function validateMedicalDataset(record: MedicalDatasetSource, bytes: Uint8Array): DatasetValidationResult {
  const errors: string[] = [];
  if (record.epistemic !== 'REAL_DATASET') errors.push('EPISTEMIC_MUST_BE_REAL_DATASET');
  if (!record.sourceUrl || !record.retrievalUri) errors.push('SOURCE_URI_REQUIRED');
  if (!/^https?:\/\//i.test(record.sourceUrl)) errors.push('SOURCE_URL_MUST_BE_HTTP');
  if (!/^[0-9a-f]{64}$/i.test(record.sha256)) errors.push('SHA256_REQUIRED');
  if (!record.license || !record.licenseUrl) errors.push('LICENSE_REQUIRED');
  const actual = sha256HexBytes(bytes);
  if (actual.toLowerCase() !== record.sha256.toLowerCase()) errors.push('SHA256_MISMATCH');
  try {
    const detected = detectMedicalFormat(bytes);
    if (detected !== record.format) errors.push(`FORMAT_MISMATCH:${detected}`);
  } catch (e) { errors.push(String(e instanceof Error ? e.message : e)); }
  return { ok: errors.length === 0, errors, record: { ...record, status: errors.length === 0 ? 'METADATA_VERIFIED' : 'NOT_VERIFIED' } };
}

/** In-memory registry — a caller supplies real persistence (the same pattern
 * `knowledge/ledgerPersistence.ts` already uses for the Evidence Ledger); this never duplicates the
 * ledger or invents a dataset that failed `validateMedicalDataset`. */
export class MedicalDatasetRegistry {
  private readonly records = new Map<string, MedicalDatasetSource>();
  register(record: MedicalDatasetSource, bytes: Uint8Array): MedicalDatasetSource {
    const checked = validateMedicalDataset(record, bytes);
    if (!checked.ok) throw new Error(`MEDICAL_DATASET_REJECTED:${checked.errors.join('|')}`);
    this.records.set(record.datasetId, checked.record);
    return checked.record;
  }
  get(datasetId: string): MedicalDatasetSource | null { return this.records.get(datasetId) ?? null; }
  list(): readonly MedicalDatasetSource[] { return [...this.records.values()]; }
}
