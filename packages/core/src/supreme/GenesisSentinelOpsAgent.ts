import { createHash } from 'node:crypto';
export const mulberry32 = (seed: number) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const stableStringify = (v: unknown): string => { if (v === null) return 'null'; if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'; if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'; } return JSON.stringify(v); };
export const sha256hex = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');
export interface Clock { now(): number; }
export const SENTINEL_DISCLAIMER = 'Autonomous monitor applies cryptographic overlay patches ONLY; source telemetry and sequences are never mutated. Synthetic ops model, not a real autonomous repair system.';
export interface TelemetryFrame { readonly frameId: string; readonly t: number; readonly metricId: string; readonly value: number; }
export interface MonitorRule { readonly metricId: string; readonly min: number; readonly max: number; }
export interface Anomaly { readonly frameId: string; readonly metricId: string; readonly value: number; readonly bound: number; readonly kind: 'HIGH' | 'LOW'; }
export interface SentinelPatch { readonly patchId: string; readonly targetId: string; readonly kind: 'TELEMETRY_CLAMP' | 'SEQUENCE_MASK'; readonly clampedValue?: number; readonly maskedIndices?: readonly number[]; readonly payloadHash: string; readonly prevHash: string; readonly hash: string; readonly at: number; readonly dataLabel: 'SYNTHETIC_PATCH'; }
export interface GenomeReport { readonly gcContent: number; readonly orfCount: number; readonly repeatAnomalyScore: number; readonly fingerprint: string; readonly dataLabel: 'BIOLOGICAL_SYNTHETIC_ESTIMATE'; }
export interface SentinelHealth { readonly tick: number; readonly anomalies: number; readonly patches: number; readonly ledgerOk: boolean; readonly dataLabel: 'SWISS_PRECISION_DIGITAL_TWIN'; }
const STOPS = ['TAA', 'TAG', 'TGA'];
export class GenesisSentinelOpsAgent {
  private rules = new Map<string, MonitorRule>();
  private anomalies: Anomaly[] = [];
  private ledger: SentinelPatch[] = [];
  private tickCount = 0; private patchSeq = 0;
  constructor(private clock: Clock, private seed: number) {}
  addRule(r: MonitorRule): void { this.rules.set(r.metricId, r); }
  private appendPatch(kind: SentinelPatch['kind'], targetId: string, payload: { clampedValue?: number; maskedIndices?: number[] }): SentinelPatch {
    const prev = this.ledger.length ? this.ledger[this.ledger.length - 1].hash : 'GENESIS';
    const at = this.clock.now(); const patchId = 'PATCH-' + (this.patchSeq++);
    const payloadHash = sha256hex(stableStringify(payload));
    const hash = sha256hex(stableStringify({ patchId, kind, targetId, payloadHash, prevHash: prev, at }));
    const p: SentinelPatch = { patchId, targetId, kind, clampedValue: payload.clampedValue, maskedIndices: payload.maskedIndices, payloadHash, prevHash: prev, hash, at, dataLabel: 'SYNTHETIC_PATCH' };
    this.ledger.push(Object.freeze(p)); return p;
  }
  ingestTelemetry(frames: readonly TelemetryFrame[]): readonly Anomaly[] {
    const out: Anomaly[] = [];
    for (const f of frames) {
      const rule = this.rules.get(f.metricId); if (!rule) continue;
      if (f.value > rule.max) { out.push({ frameId: f.frameId, metricId: f.metricId, value: f.value, bound: rule.max, kind: 'HIGH' }); this.appendPatch('TELEMETRY_CLAMP', f.frameId, { clampedValue: rule.max }); }
      else if (f.value < rule.min) { out.push({ frameId: f.frameId, metricId: f.metricId, value: f.value, bound: rule.min, kind: 'LOW' }); this.appendPatch('TELEMETRY_CLAMP', f.frameId, { clampedValue: rule.min }); }
    }
    this.anomalies.push(...out); return out;
  }
  patchedTelemetry(frames: readonly TelemetryFrame[]): readonly TelemetryFrame[] {
    const latest = new Map<string, number>();
    for (const p of this.ledger) if (p.kind === 'TELEMETRY_CLAMP' && p.clampedValue !== undefined) latest.set(p.targetId, p.clampedValue);
    return frames.map(f => latest.has(f.frameId) ? { ...f, value: latest.get(f.frameId)! } : f);
  }
  analyzeGenome(seq: string): GenomeReport {
    const s = seq.toUpperCase(); let gc = 0; for (const ch of s) if (ch === 'G' || ch === 'C') gc++;
    const gcContent = +(gc / Math.max(1, s.length)).toFixed(6);
    let orfCount = 0;
    for (let frame = 0; frame < 3; frame++) { let i = frame; while (i + 3 <= s.length) { if (s.slice(i, i + 3) === 'ATG') { let j = i + 3; let stop = -1; while (j + 3 <= s.length) { const cod = s.slice(j, j + 3); if (STOPS.includes(cod)) { stop = j; break; } j += 3; } if (stop >= 0 && (stop - i) >= 30) { orfCount++; i = stop + 3; continue; } } i += 3; } }
    let maxRun = 1, run = 1; for (let i = 1; i < s.length; i++) { run = s[i] === s[i - 1] ? run + 1 : 1; maxRun = Math.max(maxRun, run); }
    const repeatAnomalyScore = +(maxRun / Math.max(1, s.length)).toFixed(6);
    if (repeatAnomalyScore > 0.5) { const idx: number[] = []; let start = 0; for (let i = 1; i <= s.length; i++) { if (i === s.length || s[i] !== s[start]) { if (i - start > 4) for (let k = start; k < i; k++) idx.push(k); start = i; } } this.appendPatch('SEQUENCE_MASK', 'SEQ-' + sha256hex(s).slice(0, 12), { maskedIndices: idx }); }
    return { gcContent, orfCount, repeatAnomalyScore, fingerprint: sha256hex(stableStringify({ seed: this.seed, gcContent, orfCount, repeatAnomalyScore })), dataLabel: 'BIOLOGICAL_SYNTHETIC_ESTIMATE' };
  }
  tick(): SentinelHealth { this.tickCount++; return this.healthReport(); }
  verifyLedger(): { ok: boolean; errors: readonly string[] } {
    const errors: string[] = []; let prev = 'GENESIS';
    for (const p of this.ledger) { if (p.prevHash !== prev) errors.push('CHAIN_BREAK@' + p.patchId);
      if (p.hash !== sha256hex(stableStringify({ patchId: p.patchId, kind: p.kind, targetId: p.targetId, payloadHash: p.payloadHash, prevHash: p.prevHash, at: p.at }))) errors.push('HASH_MISMATCH@' + p.patchId); prev = p.hash; }
    return { ok: errors.length === 0, errors };
  }
  healthReport(): SentinelHealth { return { tick: this.tickCount, anomalies: this.anomalies.length, patches: this.ledger.length, ledgerOk: this.verifyLedger().ok, dataLabel: 'SWISS_PRECISION_DIGITAL_TWIN' }; }
  getLedger(): readonly SentinelPatch[] { return this.ledger; }
  disclaimer(): string { return SENTINEL_DISCLAIMER; }
}
