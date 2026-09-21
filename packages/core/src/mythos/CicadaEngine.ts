/* Proprietary / All Rights Reserved - Genesis OS */
import { stableStringify, sha256hex } from '../knowledge/EvidenceLedger.js';
export class InsufficientEvidenceError extends Error {
  constructor(readonly reason: string) { super('INSUFFICIENT_EVIDENCE: ' + reason); this.name = 'InsufficientEvidenceError'; }
}
export interface ProcurementEvent {
  readonly eventId: string; readonly ts: number; readonly supplierId: string; readonly componentId: string;
  readonly qty: number; readonly unitPrice: number; readonly routeId?: string; readonly entityRegTs?: number;
}
export interface ComponentBaseline { readonly meanQty: number; readonly sigmaQty: number; readonly meanPrice: number; readonly sigmaPrice: number; readonly routes: readonly string[]; }
export interface CicadaConfig {
  readonly windowMs: number; readonly surgeK: number; readonly minSuppliers: number; readonly newEntityDays: number;
  readonly criticalComponents: readonly string[]; readonly scoreThreshold: number;
  readonly historicalWindows: readonly { readonly year: number; readonly hadPattern: boolean; readonly escalated: boolean }[];
  readonly calibration?: (score: number) => number;
}
export interface CicadaAssessment {
  readonly patternId: string; readonly triggeredRules: readonly string[]; readonly score: number;
  readonly confidence: number; readonly confidenceInterval: readonly [number, number];
  readonly claimType: 'hypothesis'; readonly status: 'CANDIDATE' | 'INSUFFICIENT_EVIDENCE';
  readonly counterexamples: readonly number[]; readonly provenanceHash: string; readonly requiresApproval: true;
}
/** CICADA-LEDGER CEP engine: synchronous dual-use surge, route anomaly, new-entity takeover. Hard thresholds; below => INSUFFICIENT_EVIDENCE. */
export class CicadaEngine {
  constructor(private config: CicadaConfig, private baselines: Readonly<Record<string, ComponentBaseline>>) {}
  evaluate(events: readonly ProcurementEvent[]): CicadaAssessment {
    const byComponent = new Map<string, ProcurementEvent[]>();
    for (const e of events) { const arr = byComponent.get(e.componentId) ?? []; arr.push(e); byComponent.set(e.componentId, arr); }
    const triggered: string[] = [];
    let surgeSuppliers = 0; let routeAnomaly = false; let newEntity = false;
    for (const [componentId, evs] of byComponent) {
      const base = this.baselines[componentId];
      const sorted = [...evs].sort((a, b) => a.ts - b.ts);
      for (let i = 0; i < sorted.length; i++) {
        const windowEnd = sorted[i].ts; const windowStart = windowEnd - this.config.windowMs;
        const inWin = sorted.filter(e => e.ts >= windowStart && e.ts <= windowEnd);
        const surgeSet = new Set<string>();
        for (const e of inWin) {
          if (base && e.qty > base.meanQty + this.config.surgeK * base.sigmaQty) surgeSet.add(e.supplierId);
          if (base && e.routeId && !base.routes.includes(e.routeId)) routeAnomaly = true;
          if (e.entityRegTs !== undefined && this.config.criticalComponents.includes(componentId) && (e.ts - e.entityRegTs) <= this.config.newEntityDays * 86400000) newEntity = true;
        }
        surgeSuppliers = Math.max(surgeSuppliers, surgeSet.size);
      }
    }
    if (surgeSuppliers >= this.config.minSuppliers) triggered.push('R1_SYNCHRONOUS_SURGE:' + surgeSuppliers);
    if (routeAnomaly) triggered.push('R2_ROUTE_ANOMALY');
    if (newEntity) triggered.push('R3_NEW_ENTITY_CRITICAL_NODE');
    const score = +(0.45 * Math.min(1, surgeSuppliers / Math.max(1, this.config.minSuppliers)) + 0.3 * (routeAnomaly ? 1 : 0) + 0.25 * (newEntity ? 1 : 0)).toFixed(4);
    const counterexamples = this.config.historicalWindows.filter(w => w.hadPattern && !w.escalated).map(w => w.year);
    let confidence = this.config.calibration ? this.config.calibration(score) : score;
    if (counterexamples.length > 0) confidence = +(confidence * 0.7).toFixed(4);
    const clamped = Math.min(1, Math.max(0, confidence));
    const interval: [number, number] = [+(Math.max(0, clamped - 0.15)).toFixed(4), +(Math.min(1, clamped + 0.15)).toFixed(4)];
    const status: CicadaAssessment['status'] = score >= this.config.scoreThreshold && triggered.length > 0 ? 'CANDIDATE' : 'INSUFFICIENT_EVIDENCE';
    const provenanceHash = sha256hex(stableStringify({ eventIds: events.map(e => e.eventId), score, triggered, threshold: this.config.scoreThreshold }));
    return { patternId: 'CIC-' + provenanceHash.slice(0, 10).toUpperCase(), triggeredRules: triggered, score, confidence: clamped, confidenceInterval: interval, claimType: 'hypothesis', status, counterexamples, provenanceHash, requiresApproval: true };
  }
  /** Strict variant: physically throws when hard thresholds not met. */
  evaluateStrict(events: readonly ProcurementEvent[]): CicadaAssessment {
    const a = this.evaluate(events);
    if (a.status === 'INSUFFICIENT_EVIDENCE') throw new InsufficientEvidenceError('score=' + a.score + ' < threshold=' + this.config.scoreThreshold + '; rules=' + (a.triggeredRules.join(',') || 'none'));
    return a;
  }
}
