import { createHash } from 'node:crypto';
export const stableStringify = (v: unknown): string => { if (v === null) return 'null'; if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'; if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'; } return JSON.stringify(v); };
export const sha256hex = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');
export interface Clock { now(): number; }
export const CHRONO_DISCLAIMER = 'Deterministic synthetic chronology model seeded by temporal hash. NOT a prediction of real history or of the future.';
export type Era = 'DEEP_HISTORY' | 'MODERN' | 'NEAR_FUTURE' | 'FUTURE_2099';
export interface EpochProfile { readonly year: number; readonly era: Era; readonly civilizationDensity: number; readonly techLevel: number; readonly warPeaceIndex: number; readonly dataLabel: 'SYNTHETIC_CHRONO_MODEL'; readonly fingerprint: string; }
export interface JumpEntry { readonly index: number; readonly at: number; readonly year: number; readonly payloadHash: string; readonly prevHash: string; readonly hash: string; }
export const MIN_YEAR = -5000; export const MAX_YEAR = 2099;
export const eraOf = (year: number): Era => year <= 0 ? 'DEEP_HISTORY' : year <= 2025 ? 'MODERN' : year < 2099 ? 'NEAR_FUTURE' : 'FUTURE_2099';
/** Snap to scale: past in 1000y steps, future in 50y steps from 2025, clamped [-5000, 2099]. */
export function snapYear(year: number): number {
  const y = Math.min(MAX_YEAR, Math.max(MIN_YEAR, Math.round(year)));
  if (y <= 0) return Math.floor(y / 1000) * 1000;
  if (y <= 2025) return y;
  return Math.min(MAX_YEAR, 2025 + Math.ceil((y - 2025) / 50) * 50);
}
export function epochProfile(year: number): EpochProfile {
  const y = snapYear(year); const h = sha256hex(String(y));
  const bits = (n: number, off: number) => parseInt(h.slice(off, off + 3), 16) / 4095;
  const era = eraOf(y);
  const eraBias = era === 'DEEP_HISTORY' ? 0.25 : era === 'MODERN' ? 0.6 : era === 'NEAR_FUTURE' ? 0.75 : 0.9;
  const partial = { year: y, era, civilizationDensity: +Math.min(1, bits(0, 0) * 0.4 + eraBias * 0.6).toFixed(4), techLevel: +Math.min(1, bits(1, 3) * 0.3 + eraBias * 0.7).toFixed(4), warPeaceIndex: +bits(2, 6).toFixed(4), dataLabel: 'SYNTHETIC_CHRONO_MODEL' as const };
  return { ...partial, fingerprint: sha256hex(stableStringify(partial)) };
}
export class GenesisChronosScaleEngine {
  private ledger: JumpEntry[] = [];
  constructor(private clock: Clock) {}
  jump(year: number): EpochProfile { const p = epochProfile(year); this.log(p.year, { fingerprint: p.fingerprint }); return p; }
  private log(year: number, payload: unknown): void { const prev = this.ledger.length ? this.ledger[this.ledger.length - 1].hash : 'GENESIS'; const at = this.clock.now(); const index = this.ledger.length; const payloadHash = sha256hex(stableStringify(payload)); const hash = sha256hex(stableStringify({ index, year, at, payloadHash, prevHash: prev })); this.ledger.push(Object.freeze({ index, year, at, payloadHash, prevHash: prev, hash })); }
  getLedger(): readonly JumpEntry[] { return this.ledger; }
  verifyLedger(): { ok: boolean; errors: readonly string[] } { const errors: string[] = []; let prev = 'GENESIS'; for (const e of this.ledger) { if (e.prevHash !== prev) errors.push('CHAIN_BREAK@' + e.index); if (e.hash !== sha256hex(stableStringify({ index: e.index, year: e.year, at: e.at, payloadHash: e.payloadHash, prevHash: e.prevHash }))) errors.push('HASH_MISMATCH@' + e.index); prev = e.hash; } return { ok: errors.length === 0, errors }; }
  disclaimer(): string { return CHRONO_DISCLAIMER; }
}
