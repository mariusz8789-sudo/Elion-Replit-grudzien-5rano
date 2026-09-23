import type { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import { stableHash } from './hash';
import type { HumanDigitalTwinManifest } from './types';

export interface HumanTwinObservationInput {
  readonly observationId: string;
  readonly twinId: string;
  readonly anatomyNodeId: string | null;
  readonly metric: string;
  readonly value: number;
  readonly unit: string;
  readonly sourceTimestamp: string;
  readonly sourceIdentity: string;
  readonly deviceId: string | null;
  readonly calibrationRef: string | null;
  readonly calibrationStatus: 'VALID' | 'INVALID' | 'NOT_PROVIDED';
  readonly uncertainty: Readonly<{ kind: 'INTERVAL'; low: number; high: number } | { kind: 'NOT_QUANTIFIED'; reason: string }>;
  readonly provenanceRefs: readonly string[];
}

export interface HumanTwinObservation extends HumanTwinObservationInput {
  readonly origin: 'EXTERNAL_OBSERVATION';
  readonly directObservation: true;
  readonly simulated: false;
  readonly evidenceRecordId: string;
  readonly evidenceContentHash: string;
  readonly fingerprint: string;
}

/** Binds an external reading to the existing twin and canonical ledger without mutating model state. */
export function admitHumanTwinObservation(ledger: EvidenceLedger, manifest: HumanDigitalTwinManifest, input: HumanTwinObservationInput): HumanTwinObservation {
  if (input.twinId !== manifest.twinId) throw new Error('HUMAN_TWIN_OBSERVATION_TWIN_MISMATCH');
  if (input.anatomyNodeId !== null && !manifest.nodes.some((node) => node.id === input.anatomyNodeId)) throw new Error('HUMAN_TWIN_OBSERVATION_ANATOMY_NODE_UNKNOWN');
  if (!input.observationId.trim() || !input.metric.trim() || !input.unit.trim() || !input.sourceIdentity.trim()) throw new Error('HUMAN_TWIN_OBSERVATION_IDENTITY_REQUIRED');
  if (!Number.isFinite(input.value) || !Number.isFinite(Date.parse(input.sourceTimestamp))) throw new Error('HUMAN_TWIN_OBSERVATION_VALUE_OR_TIME_INVALID');
  if (input.provenanceRefs.length === 0) throw new Error('HUMAN_TWIN_OBSERVATION_PROVENANCE_REQUIRED');
  if (input.deviceId !== null && (input.calibrationRef === null || input.calibrationStatus !== 'VALID')) throw new Error('HUMAN_TWIN_OBSERVATION_DEVICE_CALIBRATION_REQUIRED');
  if (input.deviceId === null && (input.calibrationRef !== null || input.calibrationStatus !== 'NOT_PROVIDED')) throw new Error('HUMAN_TWIN_OBSERVATION_CALIBRATION_WITHOUT_DEVICE');
  const claim = JSON.stringify({ observationId: input.observationId, twinId: input.twinId, anatomyNodeId: input.anatomyNodeId, metric: input.metric, value: input.value, unit: input.unit, uncertainty: input.uncertainty });
  const result = ledger.addRecord({
    sourceUrl: `genesis://human-twin/observation/${encodeURIComponent(input.observationId)}`,
    sourceTimestamp: input.sourceTimestamp,
    claim,
    claimType: 'observation',
    confidence: 0.8,
    provenance: { sourceKind: 'dataset', retrievedBy: input.sourceIdentity, independentSourceIds: input.provenanceRefs },
  });
  const unsigned = { ...input, origin: 'EXTERNAL_OBSERVATION' as const, directObservation: true as const, simulated: false as const, evidenceRecordId: result.record.id, evidenceContentHash: result.record.contentHash };
  return Object.freeze({ ...unsigned, fingerprint: stableHash(unsigned) });
}
