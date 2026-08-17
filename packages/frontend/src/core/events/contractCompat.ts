import { GENESIS_EVENT_CONTRACT_VERSION } from './genesisEvent';

/**
 * CONTRACT COMPATIBILITY (Pakiet A) — jak KONSUMENT (Manus) rozpoznaje, że może
 * bezpiecznie czytać zdarzenia danego kontraktu. NIE tworzy „drugiej wersji
 * świata" — to czysta, testowalna logika semver-lite nad jednym kontraktem.
 *
 * Reguła: konsument w wersji major X umie czytać zdarzenia major X o minor/patch
 * ≤ swojej (dodatki są wstecznie zgodne). Różny major = niezgodne.
 */

export interface SemVer { major: number; minor: number; patch: number }

export function parseVersion(v: string): SemVer | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/** Czy konsument `consumerVersion` może bezpiecznie czytać event `eventVersion`. */
export function isCompatibleContractVersion(consumerVersion: string, eventVersion: string): boolean {
  const c = parseVersion(consumerVersion), e = parseVersion(eventVersion);
  if (!c || !e) return false;
  if (c.major !== e.major) return false;
  // Konsument musi znać co najmniej tyle, ile wnosi event (minor/patch).
  if (e.minor > c.minor) return false;
  if (e.minor === c.minor && e.patch > c.patch) return false;
  return true;
}

/**
 * Deklaracja cech, które konsument może BEZPIECZNIE czytać w kontrakcie v1.0.0 —
 * bez zgadywania po losowych payloadach. `parameters` jest domenowe i nie jest
 * gwarantowaną cechą uniwersalną (konsument interpretuje je per typ zdarzenia).
 */
export interface ConsumerCapability {
  contractVersion: string;
  guaranteed: readonly string[];   // pola zawsze obecne
  optional: readonly string[];     // pola opcjonalne
  readableFeatures: readonly string[]; // cechy semantyczne bezpieczne do odczytu
}

export const CONSUMER_CAPABILITY_V1: ConsumerCapability = {
  contractVersion: GENESIS_EVENT_CONTRACT_VERSION,
  guaranteed: ['contractVersion', 'id', 'type', 'timestamp', 'affectedEntities', 'parameters', 'provenance.origin'],
  optional: ['location', 'source', 'cause', 'severity', 'parentEventId', 'modelId', 'experimentId',
    'provenance.modelId', 'provenance.experimentId', 'provenance.seed', 'provenance.paramsHash',
    'provenance.experimentContentHash', 'provenance.ruleId'],
  readableFeatures: ['location', 'source', 'affectedEntities', 'provenance', 'parent-chain'],
};

/** Zwraca aktualną deklarację cech dla danej wersji (na razie tylko v1). */
export function consumerCapability(version = GENESIS_EVENT_CONTRACT_VERSION): ConsumerCapability | null {
  return isCompatibleContractVersion(GENESIS_EVENT_CONTRACT_VERSION, version) ? CONSUMER_CAPABILITY_V1 : null;
}
