import type { DigitalTwinHandle } from './GenesisCityDigitalTwin.js';
import { GenesisDisasterEngine } from './GenesisDisasterEngine.js';
import type { DisasterScenarioId, DisasterSnapshot } from './GenesisDisasterEngine.js';
import type { SeirParams, FloodParams, BlastParams } from '../../../../core/src/city-enterprise/GenesisCrisisEngine.js';
import { fnv1a } from '@genesis/core/determinism.js';
/** Technical checksum (FNV-1a). NOT a SHA-256 custody hash. */
export const traceChecksum = (s: string): string => fnv1a(s);
export interface TelemetryFrame { t: number; snapshot: DisasterSnapshot; checksum: string; }
export interface ControllerParams { seir?: SeirParams; flood?: FloodParams; }
/** Bridges twin + disaster engine to UI/renderer; append-only telemetry with technical checksum. */
export class CityDisasterController {
  private engine: GenesisDisasterEngine; private frames: TelemetryFrame[] = []; private running = false; private raf = 0; private last = 0;
  constructor(private twin: DigitalTwinHandle, scenario: DisasterScenarioId, private params: ControllerParams = { seir: { beta: 0.3, sigma: 0.2, gamma: 0.1, mobility: 0.05 }, flood: { inflowCell: 500, inflowRate: 0, roughness: 1 } }) {
    this.engine = new GenesisDisasterEngine(twin.grid, scenario);
  }
  private pushFrame(): void { const snap = this.engine.snapshot(); const frame = { t: snap.t, snapshot: snap, checksum: traceChecksum(JSON.stringify(snap)) }; this.frames.push(frame); }
  private loop = (now: number) => { this.raf = requestAnimationFrame(this.loop); const dt = Math.min(0.05, (now - this.last) / 1000 || 0.016); this.last = now; if (this.running) { this.engine.step(dt, this.params); this.pushFrame(); } };
  start() { if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.loop); } this.running = true; }
  pause() { this.running = false; }
  stop() { if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; } this.running = false; }
  injectFlood(rate: number, cell?: number) { if (this.params.flood) this.params.flood = { ...this.params.flood, inflowRate: rate, inflowCell: cell ?? this.params.flood.inflowCell }; }
  setBlast(p: BlastParams) { this.engine.setBlast(p); this.pushFrame(); }
  replay() { this.stop(); this.engine = new GenesisDisasterEngine(this.twin.grid, this.engine.getState().scenario); this.frames = []; }
  getFrames(): readonly TelemetryFrame[] { return this.frames; }
  getTraceChecksum(): string { return traceChecksum(JSON.stringify(this.frames.map(f => f.checksum))); }
  snapshot(): DisasterSnapshot { return this.engine.snapshot(); }
  dispose() { this.stop(); }
}
