/* Proprietary / All Rights Reserved - Genesis OS */
import * as os from 'node:os';
import type { Clock } from '../../knowledge/evidenceTypes.js';
export interface ResourceSample { readonly totalMemBytes: number; readonly freeMemBytes: number; readonly loadAvg: readonly [number, number, number]; readonly cpuCount: number; }
export interface ResourceSnapshot extends ResourceSample { readonly at: number; }
export interface ResourceSampler { sample(): ResourceSample; }
/** Real OS sampler (production). Tests inject a deterministic sampler. */
export const osSampler: ResourceSampler = {
  sample: (): ResourceSample => {
    const [l0, l1, l2] = os.loadavg(); // one read: three separate calls could straddle a kernel update
    return { totalMemBytes: os.totalmem(), freeMemBytes: os.freemem(), loadAvg: [l0 ?? 0, l1 ?? 0, l2 ?? 0], cpuCount: Math.max(1, os.cpus().length || os.availableParallelism()) };
  },
};
/** Native telemetry bridge: RAM, core load, derived pressure. Logging timestamps come ONLY from injected Clock. */
export class SystemResourceBridge {
  private history: ResourceSnapshot[] = [];
  constructor(private clock: Clock, private sampler: ResourceSampler = osSampler, private maxHistory = 512) {}
  sample(): ResourceSnapshot {
    const s: ResourceSnapshot = { at: this.clock.now(), ...this.sampler.sample() };
    this.history.push(s);
    if (this.history.length > this.maxHistory) this.history.shift();
    return s;
  }
  /** 0..1 combined memory+cpu pressure. */
  pressure(): number {
    const s = this.sample();
    const memPressure = 1 - s.freeMemBytes / Math.max(1, s.totalMemBytes);
    const cpuPressure = Math.min(1, s.loadAvg[0] / Math.max(1, s.cpuCount));
    return Math.min(1, Math.max(0, 0.5 * memPressure + 0.5 * cpuPressure));
  }
  /** Hardware-derived dynamic concurrency (no artificial constant caps): scales with physical cores, backs off under pressure. */
  recommendedConcurrency(): number {
    const s = this.sample();
    const p = Math.min(1, Math.max(0, 0.5 * (1 - s.freeMemBytes / Math.max(1, s.totalMemBytes)) + 0.5 * Math.min(1, s.loadAvg[0] / Math.max(1, s.cpuCount))));
    return Math.max(1, Math.round(s.cpuCount * (1 - 0.5 * p)));
  }
  getHistory(): readonly ResourceSnapshot[] { return this.history; }
}
