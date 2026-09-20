/* Proprietary / All Rights Reserved - Genesis OS */
import type { EvidenceLedger, LedgerSnapshot } from '../knowledge/EvidenceLedger.js';
import { verifySessionChain, type FlagshipEvent } from './sessionEventLog.js';

/** D-136 — deterministic, real gate checks (never a hardcoded PASS) for the acceptance matrix. */
export interface D136GateResult { readonly ok: boolean; readonly gate: string; readonly details: readonly string[]; }

export function verifyD136PersistenceGate(ledger: EvidenceLedger, persisted: LedgerSnapshot): D136GateResult {
  const current = ledger.verifyLedger();
  if (!current.ok) return { ok: false, gate: 'EVIDENCE_LEDGER_CHAIN', details: current.errors };
  if (persisted.schema !== 'evidence-ledger-snapshot/1') return { ok: false, gate: 'LEDGER_SNAPSHOT_SCHEMA', details: ['unexpected schema'] };
  return { ok: true, gate: 'EVIDENCE_LEDGER_CHAIN', details: [`version=${persisted.version}`, `entries=${persisted.entries.length}`, `records=${persisted.records.length}`] };
}

export function verifyD136SessionChainGate(events: readonly FlagshipEvent[]): D136GateResult {
  const result = verifySessionChain(events);
  return { ok: result.ok, gate: 'SESSION_EVENT_CHAIN', details: result.errors };
}

/** Passes only if `rejects` genuinely throws — a tampered/invalid input silently accepted fails this gate. */
export function verifyD136TamperNegativeGate(rejects: () => unknown): D136GateResult {
  try { rejects(); return { ok: false, gate: 'TAMPER_NEGATIVE', details: ['tampered state was accepted'] }; }
  catch (error) { return { ok: true, gate: 'TAMPER_NEGATIVE', details: [String(error instanceof Error ? error.message : error)] }; }
}
