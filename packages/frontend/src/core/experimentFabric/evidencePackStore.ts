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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Każdy run musi nieść to, czego czytelnicy paczki realnie dotykają:
 * `status` (werdykt snapshotu) i `provenance.runFingerprint` (porównanie
 * replayu). Rekord bez tych pól przechodził walidację jako VALID i wywracał
 * porównanie na TypeError.
 */
function isPackRun(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.status === 'string'
    && isRecord(value.provenance)
    && typeof value.provenance.runFingerprint === 'string';
}

/**
 * Granica integralności dla paczek z localStorage.
 *
 * `typeof null === 'object'`, więc poprzedni warunek `typeof
 * pack.reproducibility === 'object'` przepuszczał `reproducibility: null` i
 * oznaczał taki rekord jako VALID — po czym ekran Scientific Memory wywracał
 * się na odczycie `reproducibility.armsNotExecuted`. `protocol` nie był
 * sprawdzany wcale, mimo że i ekran, i komparator replayu go czytają.
 *
 * VALID ma znaczyć „ten rekord da się bezpiecznie pokazać i porównać", a nie
 * „ma kilka pól o właściwym typie". Rekord, który nie spełnia własnego
 * niezmiennika `runCount === runs.length`, też nie jest VALID: paczka kłamiąca
 * o liczbie własnych przebiegów nie jest dowodem.
 */
function isPack(value: unknown): value is ScientificEvidencePack {
  if (!isRecord(value)) return false;
  if (typeof value.contractVersion !== 'string'
    || typeof value.evidencePackId !== 'string'
    || typeof value.evidenceChainId !== 'string'
    || typeof value.disclaimer !== 'string'
    || typeof value.runCount !== 'number') return false;

  if (!isRecord(value.protocol)
    || typeof value.protocol.protocolFingerprint !== 'string'
    || !isRecord(value.protocol.hypothesis)) return false;

  const reproducibility = value.reproducibility;
  if (!isRecord(reproducibility)
    || typeof reproducibility.allArmsMatched !== 'boolean'
    || !Array.isArray(reproducibility.armsWithDrift)
    || !Array.isArray(reproducibility.armsNotExecuted)) return false;

  if (!Array.isArray(value.runs) || !value.runs.every(isPackRun)) return false;
  return value.runCount === value.runs.length;
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

/**
 * Reports the verdict captured inside a persisted pack without rerunning a backend.
 * This is a snapshot disclosure, not proof of a fresh replay.
 */
export function getStoredEvidencePackReplayVerdict(pack: ScientificEvidencePack): ScientificEvidenceReplayVerdict {
  if (pack.runCount <= 0 || pack.runs.length === 0 || pack.runs.some((run) => run.status !== 'completed') || pack.reproducibility.armsNotExecuted.length > 0) return 'BLOCKED';
  return pack.reproducibility.allArmsMatched ? 'MATCH' : 'DRIFT';
}
