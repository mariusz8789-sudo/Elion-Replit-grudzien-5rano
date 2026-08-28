import { readJSON, writeJSON } from '../storage';
import type { ScientificEvidencePack } from './evidencePack';

const KEY = 'experiment-fabric/evidence-packs/v1';
const MAX_PACKS = 50;

export type StoredEvidencePackStatus = 'VALID' | 'INVALID_LOCAL_RECORD';
export type ScientificEvidenceReplayVerdict = 'MATCH' | 'DRIFT' | 'BLOCKED';

export interface StoredEvidencePack {
  readonly savedAt: string;
  readonly pack: ScientificEvidencePack;
}

function isPack(value: unknown): value is ScientificEvidencePack {
  if (!value || typeof value !== 'object') return false;
  const pack = value as Partial<ScientificEvidencePack>;
  const reproducibility = pack.reproducibility as Partial<ScientificEvidencePack['reproducibility']> | undefined;
  const runs = pack.runs as readonly Partial<ScientificEvidencePack['runs'][number]>[] | undefined;
  const runCount = pack.runCount;
  const protocol = pack.protocol as Partial<ScientificEvidencePack['protocol']> | undefined;
  return typeof pack.contractVersion === 'string'
    && typeof pack.evidencePackId === 'string' && pack.evidencePackId.trim().length > 0
    && typeof pack.evidenceChainId === 'string' && pack.evidenceChainId.trim().length > 0
    && typeof protocol?.protocolFingerprint === 'string' && protocol.protocolFingerprint.trim().length > 0
    && Number.isInteger(runCount)
    && typeof runCount === 'number' && runCount > 0
    && Array.isArray(runs)
    && runCount === runs.length
    && runs.every((run) => typeof run?.runId === 'string' && (run.status === 'completed' || run.status === 'failed') && typeof run.provenance?.runFingerprint === 'string')
    && typeof reproducibility?.allArmsMatched === 'boolean'
    && Array.isArray(reproducibility.armsWithDrift)
    && Array.isArray(reproducibility.armsNotExecuted)
    && typeof pack.disclaimer === 'string';
}

export function saveScientificEvidencePack(pack: ScientificEvidencePack): StoredEvidencePack {
  if (!isPack(pack)) throw new Error('Cannot persist an invalid Scientific Evidence Pack.');
  const entry = { savedAt: new Date().toISOString(), pack } satisfies StoredEvidencePack;
  const existing = listScientificEvidencePacks().filter((item) => item.pack.evidencePackId !== pack.evidencePackId);
  writeJSON(KEY, [...existing, entry].slice(-MAX_PACKS));
  return entry;
}

export function listScientificEvidencePacks(): StoredEvidencePack[] {
  const raw = readJSON<unknown[]>(KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is StoredEvidencePack => {
    if (!item || typeof item !== 'object') return false;
    const record = item as Partial<StoredEvidencePack>;
    return typeof record.savedAt === 'string' && isPack(record.pack);
  });
}

export function getScientificEvidencePack(evidencePackId: string): StoredEvidencePack | undefined {
  return listScientificEvidencePacks().find((item) => item.pack.evidencePackId === evidencePackId);
}

export function classifyStoredEvidencePack(value: unknown): StoredEvidencePackStatus {
  return isPack(value) ? 'VALID' : 'INVALID_LOCAL_RECORD';
}

export function compareScientificEvidencePacks(reference: ScientificEvidencePack, replay: ScientificEvidencePack): ScientificEvidenceReplayVerdict {
  if (!isPack(reference) || !isPack(replay)) return 'BLOCKED';
  if (reference.runs.some((run) => run.status !== 'completed') || replay.runs.some((run) => run.status !== 'completed')) return 'BLOCKED';
  if (reference.protocol.protocolFingerprint !== replay.protocol.protocolFingerprint) return 'DRIFT';
  if (reference.runs.length !== replay.runs.length) return 'DRIFT';
  const referenceFingerprints = reference.runs.map((run) => run.provenance.runFingerprint);
  const replayFingerprints = replay.runs.map((run) => run.provenance.runFingerprint);
  return referenceFingerprints.every((fingerprint, index) => fingerprint === replayFingerprints[index]) ? 'MATCH' : 'DRIFT';
}

/**
 * Reports the verdict captured inside a persisted pack without rerunning a backend.
 * This is a snapshot disclosure, not proof of a fresh replay.
 */
export function getStoredEvidencePackReplayVerdict(pack: ScientificEvidencePack): ScientificEvidenceReplayVerdict {
  if (!isPack(pack)) return 'BLOCKED';
  if (pack.runCount <= 0 || pack.runs.length === 0 || pack.runs.some((run) => run.status !== 'completed') || pack.reproducibility.armsNotExecuted.length > 0) return 'BLOCKED';
  return pack.reproducibility.allArmsMatched ? 'MATCH' : 'DRIFT';
}
