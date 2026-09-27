import type { LabRuntime } from './labRuntime';
import { emitLabEvidence } from './labRuntime';

export type SampleKind = 'SAMPLE' | 'BATCH' | 'ALIQUOT' | 'WELL' | 'CONTAINER' | 'MATERIAL_LOT' | 'BIOLOGICAL_SPECIMEN';
export interface SampleRecord {
  readonly sampleId: string;
  readonly kind: SampleKind;
  readonly parentSampleId?: string;
  readonly source: string;
  readonly transformations: readonly string[];
  readonly storage: string;
  readonly provenance: readonly string[];
  readonly lineageFingerprint: string;
}

export class SampleLineageStore {
  private readonly samples = new Map<string, SampleRecord>();
  constructor(private readonly runtime: LabRuntime) {}

  create(input: Omit<SampleRecord, 'lineageFingerprint'>): SampleRecord {
    if (this.samples.has(input.sampleId)) throw new Error(`Duplicate sample: ${input.sampleId}`);
    if (input.parentSampleId !== undefined && !this.samples.has(input.parentSampleId)) throw new Error(`Unknown parent: ${input.parentSampleId}`);
    const lineageFingerprint = this.runtime.deterministic.fingerprint(input);
    const record = { ...input, lineageFingerprint };
    this.samples.set(record.sampleId, record);
    emitLabEvidence(this.runtime, {
      type: 'SAMPLE_LINEAGE_UPDATED', modelId: 'D140_SAMPLE_LINEAGE', solverId: 'lineage-v1', input, result: record,
      epistemicStatus: 'MEASURED', evidenceClass: 'DERIVED', provenance: record.provenance,
    });
    return record;
  }

  get(sampleId: string): SampleRecord {
    const record = this.samples.get(sampleId); if (record === undefined) throw new Error(`Unknown sample: ${sampleId}`); return record;
  }
}
