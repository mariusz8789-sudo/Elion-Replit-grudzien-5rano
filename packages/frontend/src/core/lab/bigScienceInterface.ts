import type { LabRuntime } from './labRuntime';
import { emitLabEvidence } from './labRuntime';

export interface BeamParameters { readonly beamId: string; readonly particle: string; readonly energyGeV: number }
export interface ParticleEvent { readonly eventId: string; readonly beamIds: readonly string[]; readonly detectorObservations: readonly { readonly channel: string; readonly value: number; readonly unit: string }[]; readonly provenance: readonly string[] }
export interface BigScienceDataset { readonly datasetId: string; readonly source: string; readonly beams: readonly BeamParameters[]; readonly events: readonly ParticleEvent[]; readonly provenance: readonly string[] }
export interface BigScienceIngestResult { readonly datasetId: string; readonly eventCount: number; readonly deterministicFingerprint: string }

export function ingestBigScienceDataset(runtime: LabRuntime, dataset: BigScienceDataset): BigScienceIngestResult {
  if (dataset.events.some((e) => e.provenance.length === 0)) throw new Error('Every event requires provenance');
  const base = { datasetId: dataset.datasetId, eventCount: dataset.events.length };
  const result = { ...base, deterministicFingerprint: runtime.deterministic.fingerprint({ ...base, dataset }) };
  emitLabEvidence(runtime, { type: 'BIG_SCIENCE_DATASET_INGESTED', modelId: 'D140_BIG_SCIENCE_INTERFACE', solverId: 'dataset-ingest-v1', input: dataset, result, epistemicStatus: 'MEASURED', evidenceClass: 'MEASUREMENT', provenance: dataset.provenance, limitations: ['This interface does not claim detector reconstruction fidelity until validated against a specific public dataset and experiment pipeline.'] });
  return result;
}
