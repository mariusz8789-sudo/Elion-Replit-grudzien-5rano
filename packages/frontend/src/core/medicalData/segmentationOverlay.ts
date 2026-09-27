import type { ReconstructedVolume } from './volumeReconstruction';

export interface SegmentationOverlay {
  readonly overlayId: string;
  readonly sourceDatasetId: string;
  readonly dimensions: readonly [number, number, number];
  readonly labels: Uint16Array;
  readonly labelNames: Readonly<Record<number, string>>;
  /** Ground-truth annotation shipped with the dataset is `REAL_DATASET`; anything Genesis itself
   * computed (a solver, a model, a placeholder) is `RECONSTRUCTED` or `MODEL` — never defaulted, a
   * caller must say which one this overlay actually is. */
  readonly epistemic: 'REAL_DATASET' | 'RECONSTRUCTED' | 'MODEL';
}

export function createSegmentationOverlay(
  overlayId: string,
  volume: ReconstructedVolume,
  labels: Uint16Array,
  labelNames: Readonly<Record<number, string>>,
  epistemic: SegmentationOverlay['epistemic'],
): SegmentationOverlay {
  const expected = volume.spec.dimensions[0] * volume.spec.dimensions[1] * volume.spec.dimensions[2];
  if (labels.length !== expected) throw new Error(`SEGMENTATION_REJECTED:DIMENSION_MISMATCH:${labels.length}:${expected}`);
  return { overlayId, sourceDatasetId: volume.spec.datasetId, dimensions: volume.spec.dimensions, labels, labelNames, epistemic };
}
