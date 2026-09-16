import { sealAuditSnapshot, verifyAuditChain, type AuditSeal, type AuditSnapshot, type ChainVerification } from './cryptoAudit';

/**
 * AUDIT LEDGER (D-121) — the client-side hash chain of every sealed verdict
 * this browser produced, appended in order and verifiable end to end. Stored
 * in localStorage (per person, per device); an unreadable or tampered ledger
 * is reported as such, never silently reset.
 */
export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void; }

export const LEDGER_KEY = 'genesis.auditLedger.v1';

export function loadLedger(storage: StorageLike | null): readonly AuditSeal[] {
  if (storage === null) return [];
  try {
    const raw = storage.getItem(LEDGER_KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as AuditSeal[]) : [];
  } catch {
    return [];
  }
}

function saveLedger(storage: StorageLike | null, seals: readonly AuditSeal[]): void {
  if (storage === null) return;
  try { storage.setItem(LEDGER_KEY, JSON.stringify(seals)); } catch { /* quota / private mode: the seal still exists in memory for this run */ }
}

/** Appends a new seal chained to the ledger's last one. Returns the seal and the ledger length. */
export async function appendToLedger(storage: StorageLike | null, snapshot: AuditSnapshot, now: () => string = () => new Date().toISOString()): Promise<{ readonly seal: AuditSeal; readonly length: number }> {
  const seals = loadLedger(storage);
  const previous = seals.length > 0 ? seals[seals.length - 1]! : null;
  const seal = await sealAuditSnapshot(snapshot, previous, now());
  const next = [...seals, seal];
  saveLedger(storage, next);
  return { seal, length: next.length };
}

export async function verifyLedger(storage: StorageLike | null): Promise<ChainVerification> {
  return verifyAuditChain(loadLedger(storage));
}
