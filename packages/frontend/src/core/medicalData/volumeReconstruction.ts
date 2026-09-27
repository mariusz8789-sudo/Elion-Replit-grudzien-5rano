import type { MedicalDatasetSource, VolumeSpec } from './medicalDatasetTypes';
import { niftiVoxelCount, parseNifti1Header, readNiftiVoxels } from './niftiDatasetAdapter';
import { parseDicomPart10 } from './dicomDatasetAdapter';

export interface ReconstructedVolume {
  readonly spec: VolumeSpec;
  readonly voxels: Float32Array;
}

function niftiType(datatype: number): string {
  const map: Record<number, string> = { 2: 'uint8', 4: 'int16', 8: 'int32', 16: 'float32', 64: 'float64', 256: 'int8', 512: 'uint16', 768: 'uint32' };
  return map[datatype] ?? `datatype:${datatype}`;
}

/** Real voxels read from the dataset's own bytes — `epistemic: 'RECONSTRUCTED'` because a volume
 * built from a header + typed array is a REPRESENTATION of the real data, not the observation
 * itself; the source dataset's own record stays `REAL_DATASET` and is linked via `sourceSha256`. */
export function reconstructNifti(dataset: MedicalDatasetSource, bytes: Uint8Array): ReconstructedVolume {
  if (dataset.format !== 'NIFTI1') throw new Error('VOLUME_RECONSTRUCTION_FORMAT_MISMATCH');
  const h = parseNifti1Header(bytes);
  const voxels = readNiftiVoxels(bytes, h);
  const dims: [number, number, number] = [h.dims[1], h.dims[2], h.dims[3]];
  const spacing: [number, number, number] = [Math.abs(h.pixdim[1] || 1), Math.abs(h.pixdim[2] || 1), Math.abs(h.pixdim[3] || 1)];
  if (voxels.length !== niftiVoxelCount(h)) throw new Error('VOLUME_RECONSTRUCTION_VOXEL_COUNT_MISMATCH');
  return { spec: { datasetId: dataset.datasetId, dimensions: dims, spacingMm: spacing, datatype: niftiType(h.datatype), sourceSha256: dataset.sha256, epistemic: 'RECONSTRUCTED' }, voxels };
}

export function inspectDicomDataset(dataset: MedicalDatasetSource, bytes: Uint8Array): { readonly datasetId: string; readonly sourceSha256: string; readonly metadata: ReturnType<typeof parseDicomPart10>; readonly epistemic: 'REAL_DATASET' } {
  if (dataset.format !== 'DICOM_P10') throw new Error('DICOM_DATASET_FORMAT_MISMATCH');
  return { datasetId: dataset.datasetId, sourceSha256: dataset.sha256, metadata: parseDicomPart10(bytes), epistemic: 'REAL_DATASET' };
}
