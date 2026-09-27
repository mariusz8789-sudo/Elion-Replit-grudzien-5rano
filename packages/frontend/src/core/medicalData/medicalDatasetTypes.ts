/**
 * D-136 — REAL EXTERNAL MEDICAL DATA BOUNDARY.
 *
 * Every dataset admitted here carries its own provenance and a SHA-256 of the exact bytes checked
 * (the canonical Genesis hash, `@genesis/core/knowledge/sha256.js` — never a second hash algorithm
 * for content identity). `status`/`epistemic` are never upgraded by a prettier reconstruction: real
 * bytes stay `REAL_DATASET`; anything derived from them (a voxel volume, a segmentation computed
 * rather than imported as ground truth) is `RECONSTRUCTED` or `MODEL`, never silently promoted.
 */
export type MedicalDatasetFormat = 'NIFTI1' | 'DICOM_P10';
export type MedicalDatasetStatus = 'NOT_VERIFIED' | 'BYTES_VERIFIED' | 'METADATA_VERIFIED';

export interface MedicalDatasetSource {
  readonly datasetId: string;
  readonly title: string;
  readonly sourceUrl: string;
  readonly retrievalUri: string;
  readonly format: MedicalDatasetFormat;
  readonly sha256: string;
  readonly license: string;
  readonly licenseUrl: string;
  readonly retrievedAt: string;
  readonly subjectScope: string;
  readonly status: MedicalDatasetStatus;
  readonly epistemic: 'REAL_DATASET';
}

export interface DatasetValidationResult {
  readonly ok: boolean;
  readonly errors: readonly string[];
  readonly record: MedicalDatasetSource;
}

export interface NiftiHeader {
  readonly endian: 'LE' | 'BE';
  readonly sizeofHdr: 348;
  readonly dims: readonly number[];
  readonly datatype: number;
  readonly bitpix: number;
  readonly pixdim: readonly number[];
  readonly voxOffset: number;
  readonly magic: 'n+1' | 'ni1';
}

export interface DicomP10Meta {
  readonly transferSyntaxUid: string | null;
  readonly sopClassUid: string | null;
  readonly rows: number | null;
  readonly columns: number | null;
  readonly bitsAllocated: number | null;
  readonly pixelDataOffset: number | null;
  readonly pixelDataLength: number | null;
}

/** A volume derived FROM real bytes — `epistemic` says which: `REAL_DATASET` only for an
 * unmodified voxel read; anything a solver/algorithm computed is `RECONSTRUCTED` or `MODEL`. */
export interface VolumeSpec {
  readonly datasetId: string;
  readonly dimensions: readonly [number, number, number];
  readonly spacingMm: readonly [number, number, number];
  readonly datatype: string;
  readonly sourceSha256: string;
  readonly epistemic: 'REAL_DATASET' | 'RECONSTRUCTED' | 'MODEL';
}
