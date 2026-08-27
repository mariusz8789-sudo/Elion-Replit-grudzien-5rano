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
  return typeof pack.contractVersion === 'string'
    && typeof pack.evidencePackId === 'string'
    && typeof pack.evidenceChainId === 'string'
    && typeof pack.runCount === 'number'
    && Array.isArray(pack.runs)
    && typeof pack.reproducibility === 'object'
    && typeof pack.disclaimer === 'string';
}

export function saveScientificEvidencePack(pack: ScientificEvidencePack): StoredEvidencePack {
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
  if (reference.runs.some((run) => run.status !== 'completed') || replay.runs.some((run) => run.status !== 'completed')) return 'BLOCKED';
  if (reference.protocol.protocolFingerprint !== replay.protocol.protocolFingerprint) return 'DRIFT';
  if (reference.runs.length !== replay.runs.length) return 'DRIFT';
  const referenceFingerprints = reference.runs.map((run) => run.provenance.runFingerprint);
  const replayFingerprints = replay.runs.map((run) => run.provenance.runFingerprint);
  return referenceFingerprints.every((fingerprint, index) => fingerprint === replayFingerprints[index]) ? 'MATCH' : 'DRIFT';
}
