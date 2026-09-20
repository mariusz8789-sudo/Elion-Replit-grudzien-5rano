import { describe, expect, it } from 'vitest';
import { sha256Bytes } from '@genesis/core/knowledge/sha256.js';
import { parseNifti1Header, niftiVoxelCount, readNiftiVoxels } from '../core/medicalData/niftiDatasetAdapter';
import { parseDicomPart10 } from '../core/medicalData/dicomDatasetAdapter';
import { detectMedicalFormat, validateMedicalDataset, MedicalDatasetRegistry } from '../core/medicalData/medicalDatasetRegistry';
import { reconstructNifti, inspectDicomDataset } from '../core/medicalData/volumeReconstruction';
import { createSegmentationOverlay } from '../core/medicalData/segmentationOverlay';
import type { MedicalDatasetSource } from '../core/medicalData/medicalDatasetTypes';

/** A real, structurally-valid NIfTI-1 header + uint8 voxel payload (2x2x1x1 = 4 voxels), built byte
 * by byte at the spec's own offsets — not a stub, not a mocked parser. */
function buildNifti(voxels: readonly number[] = [10, 20, 30, 40]): Uint8Array {
  const dims: [number, number, number] = [2, 2, 1];
  const headerLen = 352;
  const bytes = new Uint8Array(headerLen + voxels.length);
  const view = new DataView(bytes.buffer);
  view.setInt32(0, 348, true);
  view.setInt16(40, 3, true); // dim[0] = 3
  view.setInt16(42, dims[0], true); view.setInt16(44, dims[1], true); view.setInt16(46, dims[2], true);
  view.setInt16(70, 2, true); // datatype = DT_UINT8
  view.setInt16(72, 8, true); // bitpix
  view.setFloat32(76 + 4, 1, true); view.setFloat32(80, 1, true); view.setFloat32(84, 1, true); // pixdim[1..3]
  view.setFloat32(108, headerLen, true); // vox_offset
  bytes.set([...'n+1'].map((c) => c.charCodeAt(0)), 344);
  voxels.forEach((v, i) => bytes[headerLen + i] = v);
  return bytes;
}

/** A real, structurally-valid DICOM Part-10 explicit-VR-LE fixture with the tags the adapter reads. */
function buildDicom(transferSyntax = '1.2.840.10008.1.2.1'): Uint8Array {
  const parts: number[][] = [];
  const push = (...b: number[]) => parts.push(b);
  const u16le = (n: number) => [n & 0xff, (n >> 8) & 0xff];
  const shortElement = (group: number, element: number, vr: string, value: number[]) => {
    push(...u16le(group), ...u16le(element), vr.charCodeAt(0), vr.charCodeAt(1), ...u16le(value.length), ...value);
  };
  const asciiEven = (s: string): number[] => { const b = [...s].map((c) => c.charCodeAt(0)); if (b.length % 2 !== 0) b.push(0); return b; };

  const preamble = new Array(128).fill(0);
  const magic = [...'DICM'].map((c) => c.charCodeAt(0));
  const sopClassUid = asciiEven('1.2.840.10008.5.1.4.1.1.7');
  const transferSyntaxUid = asciiEven(transferSyntax);
  shortElement(0x0002, 0x0002, 'UI', sopClassUid);
  shortElement(0x0002, 0x0010, 'UI', transferSyntaxUid);
  shortElement(0x0028, 0x0010, 'US', u16le(64)); // rows
  shortElement(0x0028, 0x0011, 'US', u16le(64)); // columns
  shortElement(0x0028, 0x0100, 'US', u16le(8)); // bits allocated
  // Pixel data — long-VR form (OW): group, element, VR, 2 reserved bytes, 4-byte length, value.
  const pixels = new Array(8).fill(42);
  push(0x7fe0 & 0xff, (0x7fe0 >> 8) & 0xff, 0x0010 & 0xff, (0x0010 >> 8) & 0xff, 'O'.charCodeAt(0), 'W'.charCodeAt(0), 0, 0, pixels.length & 0xff, (pixels.length >> 8) & 0xff, 0, 0, ...pixels);

  return new Uint8Array([...preamble, ...magic, ...parts.flat()]);
}

function hex(bytes: Uint8Array): string {
  let h = '';
  for (const b of sha256Bytes(bytes)) h += b.toString(16).padStart(2, '0');
  return h;
}

const baseRecord = (bytes: Uint8Array, format: MedicalDatasetSource['format'], datasetId: string): MedicalDatasetSource => ({
  datasetId, title: 'fixture', sourceUrl: 'https://example.invalid/dataset', retrievalUri: 'https://example.invalid/dataset/raw',
  format, sha256: hex(bytes), license: 'CC0-1.0', licenseUrl: 'https://example.invalid/license', retrievedAt: '2026-01-01T00:00:00Z',
  subjectScope: 'phantom', status: 'NOT_VERIFIED', epistemic: 'REAL_DATASET',
});

describe('D-136 real-data format gates — NIfTI-1', () => {
  it('parses a real binary NIfTI-1 header without inventing data', () => {
    const bytes = buildNifti();
    const h = parseNifti1Header(bytes);
    expect(h.magic).toBe('n+1');
    expect(h.dims.slice(1, 4)).toEqual([2, 2, 1]);
    expect(h.datatype).toBe(2);
    expect(niftiVoxelCount(h)).toBe(4);
  });

  it('reads the REAL voxel values at their real offsets, not zeros or a placeholder', () => {
    const bytes = buildNifti([10, 20, 30, 40]);
    const h = parseNifti1Header(bytes);
    const voxels = readNiftiVoxels(bytes, h);
    expect(Array.from(voxels)).toEqual([10, 20, 30, 40]);
  });

  it('rejects arbitrary bytes, a short buffer, and a truncated voxel payload by name', () => {
    expect(() => parseNifti1Header(new Uint8Array(512))).toThrow(/NIFTI_REJECTED/);
    expect(() => parseNifti1Header(new Uint8Array(10))).toThrow(/NIFTI_REJECTED:HEADER_TOO_SHORT/);
    const truncated = buildNifti().slice(0, 353); // header + 1 of 4 voxel bytes
    const h = parseNifti1Header(truncated);
    expect(() => readNiftiVoxels(truncated, h)).toThrow(/NIFTI_REJECTED:VOXEL_DATA_TRUNCATED/);
  });
});

describe('D-136 real-data format gates — DICOM Part-10', () => {
  it('parses a real Part-10 preamble + explicit-VR-LE dataset', () => {
    const bytes = buildDicom();
    const meta = parseDicomPart10(bytes);
    expect(meta.transferSyntaxUid).toBe('1.2.840.10008.1.2.1');
    expect(meta.rows).toBe(64);
    expect(meta.columns).toBe(64);
    expect(meta.bitsAllocated).toBe(8);
    expect(meta.pixelDataLength).toBe(8);
  });

  it('rejects bytes with no DICM preamble, and a real dataset built on an unsupported transfer syntax, by name', () => {
    expect(() => parseDicomPart10(new Uint8Array(200))).toThrow(/DICOM_REJECTED:NO_PART10_PREAMBLE/);
    // Implicit VR Little Endian (1.2.840.10008.1.2) — a real, valid DICOM transfer syntax, just not
    // the one explicit-VR reader this adapter supports; it must be refused by name, not mis-parsed.
    const implicitVr = buildDicom('1.2.840.10008.1.2');
    expect(() => parseDicomPart10(implicitVr)).toThrow(/DICOM_REJECTED:UNSUPPORTED_TRANSFER_SYNTAX:1\.2\.840\.10008\.1\.2$/);
  });
});

describe('D-136 dataset registry — provenance, checksum and format enforced together', () => {
  it('detects the real format from bytes alone', () => {
    expect(detectMedicalFormat(buildNifti())).toBe('NIFTI1');
    expect(detectMedicalFormat(buildDicom())).toBe('DICOM_P10');
    expect(() => detectMedicalFormat(new Uint8Array(64))).toThrow(/MEDICAL_DATASET_REJECTED:UNKNOWN_FORMAT/);
  });

  it('validates a real dataset end to end and registers it', () => {
    const bytes = buildNifti();
    const record = baseRecord(bytes, 'NIFTI1', 'ds-1');
    const checked = validateMedicalDataset(record, bytes);
    expect(checked.ok).toBe(true);
    expect(checked.record.status).toBe('METADATA_VERIFIED');
    const registry = new MedicalDatasetRegistry();
    const registered = registry.register(record, bytes);
    expect(registered.status).toBe('METADATA_VERIFIED');
    expect(registry.get('ds-1')?.datasetId).toBe('ds-1');
    expect(registry.list()).toHaveLength(1);
  });

  it('rejects a dataset whose claimed SHA-256 does not match the real bytes — never silently accepted', () => {
    const bytes = buildNifti();
    const record = { ...baseRecord(bytes, 'NIFTI1', 'ds-2'), sha256: '0'.repeat(64) };
    const checked = validateMedicalDataset(record, bytes);
    expect(checked.ok).toBe(false);
    expect(checked.errors).toContain('SHA256_MISMATCH');
    expect(() => new MedicalDatasetRegistry().register(record, bytes)).toThrow(/MEDICAL_DATASET_REJECTED/);
  });

  it('rejects a claimed format that does not match the real detected format, an http-less source, and a missing license', () => {
    const bytes = buildNifti();
    const wrongFormat = validateMedicalDataset(baseRecord(bytes, 'DICOM_P10', 'ds-3'), bytes);
    expect(wrongFormat.errors.some((e) => e.startsWith('FORMAT_MISMATCH'))).toBe(true);

    const noHttp = validateMedicalDataset({ ...baseRecord(bytes, 'NIFTI1', 'ds-4'), sourceUrl: 'ftp://example.invalid/x' }, bytes);
    expect(noHttp.errors).toContain('SOURCE_URL_MUST_BE_HTTP');

    const noLicense = validateMedicalDataset({ ...baseRecord(bytes, 'NIFTI1', 'ds-5'), license: '', licenseUrl: '' }, bytes);
    expect(noLicense.errors).toContain('LICENSE_REQUIRED');
  });

  it('a non-REAL_DATASET epistemic claim is rejected — the gate never admits a dataset that mislabels itself', () => {
    const bytes = buildNifti();
    const record = { ...baseRecord(bytes, 'NIFTI1', 'ds-6'), epistemic: 'RECONSTRUCTED' as unknown as 'REAL_DATASET' };
    expect(validateMedicalDataset(record, bytes).errors).toContain('EPISTEMIC_MUST_BE_REAL_DATASET');
  });
});

describe('D-136 volume reconstruction and segmentation — real voxels, honest epistemic status', () => {
  it('reconstructs a real volume from the dataset\'s own bytes and labels it RECONSTRUCTED, never REAL_DATASET', () => {
    const bytes = buildNifti([1, 2, 3, 4]);
    const dataset = baseRecord(bytes, 'NIFTI1', 'ds-7');
    const volume = reconstructNifti(dataset, bytes);
    expect(volume.spec.epistemic).toBe('RECONSTRUCTED');
    expect(volume.spec.dimensions).toEqual([2, 2, 1]);
    expect(volume.spec.sourceSha256).toBe(dataset.sha256);
    expect(Array.from(volume.voxels)).toEqual([1, 2, 3, 4]);
  });

  it('inspecting a DICOM dataset stays REAL_DATASET (metadata only, no reconstructed representation invented)', () => {
    const bytes = buildDicom();
    const dataset = baseRecord(bytes, 'DICOM_P10', 'ds-8');
    const inspected = inspectDicomDataset(dataset, bytes);
    expect(inspected.epistemic).toBe('REAL_DATASET');
    expect(inspected.metadata.rows).toBe(64);
  });

  it('a segmentation overlay is refused when its label array does not match the volume\'s own voxel count', () => {
    const bytes = buildNifti([1, 2, 3, 4]);
    const dataset = baseRecord(bytes, 'NIFTI1', 'ds-9');
    const volume = reconstructNifti(dataset, bytes);
    expect(() => createSegmentationOverlay('seg-1', volume, new Uint16Array(3), { 1: 'tissue' }, 'MODEL')).toThrow(/SEGMENTATION_REJECTED:DIMENSION_MISMATCH/);
    const overlay = createSegmentationOverlay('seg-1', volume, new Uint16Array(4), { 1: 'tissue' }, 'MODEL');
    expect(overlay.epistemic).toBe('MODEL');
    expect(overlay.dimensions).toEqual(volume.spec.dimensions);
  });
});
