import { canonicalJson, fnv1a } from '../events/hash';
import { backendSemanticReproductionFingerprint } from './scientificReproduction';
import type { ScientificEvidenceChain } from './scientificDiscovery';

export const BACKEND_REPLAY_RECEIPT_VERSION = '1.0.0';

export type BackendReplayReceiptStatus =
  | 'MATCH'
  | 'DRIFT'
  | 'PROTOCOL_MISMATCH'
  | 'NOT_COMPARABLE'
  | 'REPLAY_NOT_EXECUTED';

export interface BackendReplayArmReceipt {
  armId: string;
  sourceRunIds: readonly string[];
  replayRunIds: readonly string[];
  sourceSemanticFingerprint: string | null;
  replaySemanticFingerprint: string | null;
  status: BackendReplayReceiptStatus;
}

/**
 * A deterministic record of one bounded re-execution of an already executed
 * BACKEND_REAL_ENGINE Discovery protocol. It compares actual backend outcomes
 * only; it never performs a calculation, changes a protocol or turns agreement
 * into a claim of scientific correctness, external replication or validation.
 */
export interface BackendReplayReceipt {
  contractVersion: string;
  receiptId: string;
  sourceEvidenceId: string;
  replayEvidenceId: string;
  protocolFingerprint: string;
  status: BackendReplayReceiptStatus;
  armReceipts: readonly BackendReplayArmReceipt[];
  disclaimer: string;
}

function aggregateSemanticFingerprint(
  runs: readonly ScientificEvidenceChain['allRuns'][number][],
): string | null {
  if (runs.length === 0 || runs.some((run) => run.result.status !== 'completed' || !run.provenance.deterministic)) {
    return null;
  }
  return `replay_arm_${fnv1a(canonicalJson(runs.map(backendSemanticReproductionFingerprint)))}`;
}

function runsForArm(evidence: ScientificEvidenceChain, armId: string) {
  const arm = evidence.arms.find((candidate) => candidate.armId === armId);
  if (!arm) return [];
  const runIds = new Set(arm.runIds);
  return evidence.allRuns.filter((run) => runIds.has(run.runId));
}

function armReceipt(
  source: ScientificEvidenceChain,
  replay: ScientificEvidenceChain,
  armId: string,
  protocolMatches: boolean,
): BackendReplayArmReceipt {
  const sourceRuns = runsForArm(source, armId);
  const replayRuns = runsForArm(replay, armId);
  const sourceSemanticFingerprint = aggregateSemanticFingerprint(sourceRuns);
  const replaySemanticFingerprint = aggregateSemanticFingerprint(replayRuns);
  const status: BackendReplayReceiptStatus = !protocolMatches
    ? 'PROTOCOL_MISMATCH'
    : replayRuns.length === 0 || replayRuns.some((run) => run.result.status !== 'completed')
      ? 'REPLAY_NOT_EXECUTED'
      : sourceSemanticFingerprint === null || replaySemanticFingerprint === null
        ? 'NOT_COMPARABLE'
        : sourceSemanticFingerprint === replaySemanticFingerprint
          ? 'MATCH'
          : 'DRIFT';
  return {
    armId,
    sourceRunIds: sourceRuns.map((run) => run.runId),
    replayRunIds: replayRuns.map((run) => run.runId),
    sourceSemanticFingerprint,
    replaySemanticFingerprint,
    status,
  };
}

export function createBackendReplayReceipt(
  source: ScientificEvidenceChain,
  replay: ScientificEvidenceChain,
): BackendReplayReceipt {
  if (source.createdFromRealRunsOnly !== true || replay.createdFromRealRunsOnly !== true) {
    throw new Error('Backend Replay Receipt requires evidence chains created from real runs only.');
  }
  const protocolMatches = source.design.protocolFingerprint === replay.design.protocolFingerprint;
  const armIds = [...new Set([...source.arms.map((arm) => arm.armId), ...replay.arms.map((arm) => arm.armId)])]
    .sort((left, right) => left.localeCompare(right));
  const armReceipts = armIds.map((armId) => armReceipt(source, replay, armId, protocolMatches));
  const statuses = armReceipts.map((arm) => arm.status);
  const status: BackendReplayReceiptStatus = !protocolMatches
    ? 'PROTOCOL_MISMATCH'
    : statuses.includes('REPLAY_NOT_EXECUTED')
      ? 'REPLAY_NOT_EXECUTED'
      : statuses.includes('NOT_COMPARABLE')
        ? 'NOT_COMPARABLE'
        : statuses.every((value) => value === 'MATCH')
          ? 'MATCH'
          : 'DRIFT';
  const receiptSeed = {
    contractVersion: BACKEND_REPLAY_RECEIPT_VERSION,
    sourceEvidenceId: source.evidenceId,
    replayEvidenceId: replay.evidenceId,
    protocolFingerprint: source.design.protocolFingerprint,
    status,
    armReceipts,
  };
  return {
    contractVersion: BACKEND_REPLAY_RECEIPT_VERSION,
    receiptId: `replay_${fnv1a(canonicalJson(receiptSeed))}`,
    sourceEvidenceId: source.evidenceId,
    replayEvidenceId: replay.evidenceId,
    protocolFingerprint: source.design.protocolFingerprint,
    status,
    armReceipts,
    disclaimer: 'Receipt dokumentuje pojedynczy rerun tego samego prerejestrowanego protokołu przez Backend Real Engine. MATCH oznacza zgodność semantycznego wyniku w granicach tego runtime’u; nie oznacza niezależnej replikacji, poprawności naukowej, walidacji zewnętrznej ani skuteczności w świecie rzeczywistym.',
  };
}

export function serializeBackendReplayReceipt(receipt: BackendReplayReceipt): string {
  return canonicalJson(receipt);
}
