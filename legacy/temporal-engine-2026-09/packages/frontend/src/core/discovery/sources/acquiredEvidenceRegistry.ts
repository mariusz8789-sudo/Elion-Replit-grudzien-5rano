import type { DatasetEvidenceRecord } from './datasetEvidenceIngestion';
import type { SourceBackedKnowledgeRecord } from '../molecular/sourceBackedKnowledgeRegistry';

/**
 * ACQUIRED EVIDENCE → SOURCE-BACKED REGISTRY.
 *
 * This is the last link that makes autonomous acquisition worth anything: a
 * value Genesis fetched itself has to land in the SAME registry as
 * hand-curated knowledge, in the same shape, so downstream discovery cannot
 * tell — and must not need to tell — where a record came from in order to use
 * it correctly. What it CAN always tell is what kind of evidence it is.
 *
 * THE MAPPING IS DELIBERATELY LOSSY IN ONE DIRECTION ONLY.
 *
 * A dataset column declared MEASURED becomes `PRIMARY_MEASURED`. A column
 * declared PREDICTED becomes `MODEL_PREDICTION`. There is no path by which a
 * prediction is promoted, and no path by which a descriptor shipped with a
 * file is recorded as a measurement — a molecular weight in a CSV is a
 * computed descriptor, not something anyone weighed.
 *
 * COMPARABILITY IS NEVER ASSERTED HERE. A newly acquired value has not been
 * checked against any other assay, so it enters as `NOT_AVAILABLE` and must be
 * upgraded by an explicit comparability check, never by arriving.
 */
export const ACQUIRED_EVIDENCE_REGISTRY_VERSION = '1.0.0';

export interface AcquisitionMapping {
  /** Effect this dataset speaks to, in the registry's vocabulary. */
  effectId: string;
  /** Target, when the dataset is about one. Physicochemical data has none. */
  targetId: string | null;
  assayName: string;
  assayModel: string;
}

/**
 * Converts acquired dataset records into registry records.
 *
 * Records whose value failed to parse are dropped rather than registered with
 * a null value: an unparseable cell is a data-quality fact for the ingestion
 * report, not evidence about a compound.
 */
export function registerAcquiredEvidence(
  records: readonly DatasetEvidenceRecord[],
  mapping: AcquisitionMapping,
): readonly SourceBackedKnowledgeRecord[] {
  const out: SourceBackedKnowledgeRecord[] = [];

  for (const record of records) {
    if (record.value === null) continue;

    const evidenceType = record.kind === 'MEASURED'
      ? 'PRIMARY_MEASURED' as const
      : record.kind === 'PREDICTED'
        ? 'MODEL_PREDICTION' as const
        // A descriptor distributed with a dataset was computed by somebody's
        // software, which is an inference about the structure, not a reading.
        : 'INFERENCE' as const;

    const limitations = [
      `Autonomously retrieved from ${record.provenance.url} at ${record.provenance.retrievedAt}; content sha256 ${record.provenance.contentSha256.slice(0, 16)}..., row ${record.provenance.rowIndex}.`,
      'Not independently verified against the underlying publication: no DOI/PubMed resolution is reachable in this runtime.',
    ];
    if (record.kind === 'PREDICTED') {
      limitations.push('This value is a MODEL PREDICTION distributed alongside the measurement in the same file. It is not evidence of the measured quantity and must never be substituted for it.');
    }
    if (record.kind === 'COMPUTED_DESCRIPTOR') {
      limitations.push('This is a descriptor computed by the dataset producer, not a laboratory measurement.');
    }

    out.push({
      recordId: `acquired:${record.recordId}`,
      entityClass: 'EVIDENCE',
      entityId: record.subject,
      label: `${record.subject} — ${record.column}`,
      effectId: mapping.effectId,
      targetId: mapping.targetId,
      mechanism: null,
      compoundId: record.subject,
      // Origin is genuinely unknown from a solubility table; saying UNKNOWN is
      // the honest answer rather than guessing natural or synthetic.
      compoundOrigin: 'UNKNOWN',
      source: {
        source: 'LITERATURE',
        identifier: record.provenance.citation,
        establishes: `${record.column} = ${record.value}${record.unit === null ? '' : ` ${record.unit}`} for ${record.subject}, as distributed in the retrieved dataset.`,
      },
      assay: {
        name: mapping.assayName,
        model: mapping.assayModel,
        parameter: record.column,
        value: String(record.value),
        unit: record.unit,
      },
      evidenceType,
      comparability: 'NOT_AVAILABLE',
      status: 'SUPPORTED',
      // A single dataset row, unverified against its publication, is not HIGH.
      confidence: record.kind === 'MEASURED' ? 'MEDIUM' : 'LOW',
      limitations,
    });
  }

  return out;
}

export interface AcquisitionRegistrySummary {
  registered: number;
  primaryMeasured: number;
  modelPrediction: number;
  inference: number;
  distinctCompounds: number;
  summary: string;
}

export function summariseAcquiredRegistration(records: readonly SourceBackedKnowledgeRecord[]): AcquisitionRegistrySummary {
  const primaryMeasured = records.filter((r) => r.evidenceType === 'PRIMARY_MEASURED').length;
  const modelPrediction = records.filter((r) => r.evidenceType === 'MODEL_PREDICTION').length;
  const inference = records.filter((r) => r.evidenceType === 'INFERENCE').length;
  const distinctCompounds = new Set(records.map((r) => r.compoundId)).size;

  return {
    registered: records.length,
    primaryMeasured,
    modelPrediction,
    inference,
    distinctCompounds,
    summary: `${records.length} record(s) registered from autonomous retrieval across ${distinctCompounds} compound(s): `
      + `${primaryMeasured} PRIMARY_MEASURED, ${modelPrediction} MODEL_PREDICTION, ${inference} INFERENCE. `
      + 'Every record carries its source URL, content hash, row index and retrieval time; none is marked comparable to any other assay.',
  };
}
