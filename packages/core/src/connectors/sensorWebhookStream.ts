/* Proprietary / All Rights Reserved - Genesis OS */
import { stableStringify, sha256hex } from '../expansionHash.js';
export type SensorMetric = 'pressure' | 'flow' | 'energy';
export interface SensorReading { readonly sensorId: string; readonly metric: SensorMetric; readonly value: number; readonly observedAt: number; }
export interface C3StateUpdate { readonly sensorId: string; readonly metric: SensorMetric; readonly observed: number; readonly modelExpected: number; readonly drift: number; readonly driftFlag: 'OK' | 'DRIFT_WARNING' | 'DRIFT_CRITICAL'; readonly fingerprint: string; }
export interface TransportAdapter { readonly kind: 'webhook' | 'mqtt' | 'memory'; onReading(cb: (r: SensorReading) => void): () => void; }
/** In-memory transport for tests/dev; no network binding. */
export class InMemoryTransport implements TransportAdapter {
  readonly kind = 'memory' as const; private cb: ((r: SensorReading) => void) | null = null;
  onReading(cb: (r: SensorReading) => void): () => void { this.cb = cb; return () => { this.cb = null; }; }
  push(r: SensorReading): void { this.cb?.(r); }
}
/** Webhook transport: expose handleHttp(body) from your HTTP layer; no server created here. */
export class WebhookHttpTransport implements TransportAdapter {
  readonly kind = 'webhook' as const; private cb: ((r: SensorReading) => void) | null = null;
  onReading(cb: (r: SensorReading) => void): () => void { this.cb = cb; return () => { this.cb = null; }; }
  handleHttp(body: unknown): { ok: boolean } { const r = body as SensorReading; if (typeof r?.sensorId !== 'string' || typeof r?.value !== 'number') return { ok: false }; this.cb?.(r); return { ok: true }; }
}
/** MQTT transport: inject an external client; adapter only maps messages. */
export class MqttTransportAdapter implements TransportAdapter {
  readonly kind = 'mqtt' as const; private cb: ((r: SensorReading) => void) | null = null;
  constructor(private subscribeFn: (handler: (topic: string, payload: string) => void) => () => void, private topic: string) {}
  onReading(cb: (r: SensorReading) => void): () => void { this.cb = cb; return this.subscribeFn((topic, payload) => { if (topic !== this.topic) return; try { this.cb?.(JSON.parse(payload) as SensorReading); } catch { /* drop malformed */ } }); }
}
/** Real-time drift detector mapping live sensor feeds into C3 state updates. */
export class SensorWebhookStream {
  private updates: C3StateUpdate[] = []; private unsubscribe: (() => void) | null = null;
  constructor(private transport: TransportAdapter, private modelProvider: (metric: SensorMetric) => number, private driftTolerance: number) {}
  start(): void { this.unsubscribe = this.transport.onReading(r => { this.updates.push(this.handleReading(r)); }); }
  stop(): void { this.unsubscribe?.(); this.unsubscribe = null; }
  handleReading(r: SensorReading): C3StateUpdate {
    const expected = this.modelProvider(r.metric);
    const drift = +(r.value - expected).toFixed(6);
    const a = Math.abs(drift);
    const driftFlag = a <= this.driftTolerance ? 'OK' : a <= 3 * this.driftTolerance ? 'DRIFT_WARNING' : 'DRIFT_CRITICAL';
    return { sensorId: r.sensorId, metric: r.metric, observed: r.value, modelExpected: expected, drift, driftFlag, fingerprint: sha256hex(stableStringify({ r, expected, driftFlag })) };
  }
  getUpdates(): readonly C3StateUpdate[] { return this.updates; }
}
