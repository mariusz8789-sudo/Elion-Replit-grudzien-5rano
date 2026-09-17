import { createHash } from 'node:crypto';
export const mulberry32 = (seed: number) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const stableStringify = (v: unknown): string => { if (v === null) return 'null'; if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'; if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'; } return JSON.stringify(v); };
export const sha256hex = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');
export interface Clock { now(): number; }
export const DISCLAIMER_THOUGHT = 'Thought-experiment metric (Titor/Mandela divergence). Synthetic model; not a measurement of reality; not medical or biohacking guidance.';
export type JobKind = 'HILL_FIELD' | 'GRAVITY_5D' | 'DECAY_CHAIN' | 'MONTE_CARLO';
export interface ComputeJob { readonly jobId: string; readonly kind: JobKind; readonly size: number; readonly seed: number; }
export interface ShardResult { readonly workerId: number; readonly start: number; readonly end: number; readonly hash: string; }
export interface JobResult { readonly jobId: string; readonly output: Float64Array; readonly shards: readonly ShardResult[]; readonly combinedHash: string; readonly dataLabel: 'RELATIVISTIC_SIMULATION'; }
export interface LogEntry { readonly index: number; readonly kind: string; readonly at: number; readonly payloadHash: string; readonly prevHash: string; readonly hash: string; }
/** Elementwise deterministic kernel (shard-invariant => partition-invariant results). */
export function kernel(kind: JobKind, idx: number, v: number, seed: number): number {
  const s = (seed % 97) / 97;
  switch (kind) {
    case 'HILL_FIELD': return +(3 * Math.sin(v + s) + 2 * Math.cos(v * 0.5)).toFixed(8);
    case 'GRAVITY_5D': return +(1 / Math.max(1e-9, Math.abs(v) + 1e-6 + s)).toFixed(8);
    case 'DECAY_CHAIN': return +(v * Math.exp(-0.1 * ((idx % 7) + 1))).toFixed(8);
    case 'MONTE_CARLO': return +v.toFixed(8);
  }
}
/** Simulated distributed worker pool; combine order is index-ordered => deterministic regardless of workerCount. */
export class VirtualWorkerPool {
  constructor(private clock: Clock, private seed: number, private workerCount: number) {}
  run(job: ComputeJob, input: Float64Array): JobResult {
    const out = new Float64Array(job.size); const shards: ShardResult[] = [];
    const per = Math.ceil(job.size / this.workerCount);
    for (let w = 0; w < this.workerCount; w++) {
      const start = w * per; const end = Math.min(job.size, start + per); if (start >= end) break;
      for (let i = start; i < end; i++) out[i] = kernel(job.kind, i, input[i], job.seed);
      shards.push({ workerId: w, start, end, hash: sha256hex(Array.from(out.slice(start, end)).join(',')) });
    }
    shards.sort((a, b) => a.start - b.start);
    const combinedHash = sha256hex(stableStringify({ jobId: job.jobId, output: Array.from(out) }));
    return { jobId: job.jobId, output: out, shards, combinedHash, dataLabel: 'RELATIVISTIC_SIMULATION' };
  }
}
/** GPU-style TypedArray matrix/vector accelerator. */
export const matVec = (mat: Float64Array, n: number, vec: Float64Array): Float64Array => { const o = new Float64Array(n); for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += mat[i * n + j] * vec[j]; o[i] = s; } return o; };
export const dot = (a: Float64Array, b: Float64Array): number => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
export const scale = (a: Float64Array, k: number): Float64Array => { const o = new Float64Array(a.length); for (let i = 0; i < a.length; i++) o[i] = a[i] * k; return o; };
/** Deterministic seeded quasi-Monte-Carlo mean of f over [0,1). */
export function monteCarloIntegral(seed: number, samples: number, f: (x: number) => number): number { const rng = mulberry32(seed); let s = 0; for (let i = 0; i < samples; i++) s += f(rng()); return s / samples; }
/** 5D warp applied to [t,x,y,z,w] tuples in-place on a Float64Array (len % 5 === 0). */
export function fieldWarp5D(buf: Float64Array, warpAmp: number): Float64Array { const o = Float64Array.from(buf); for (let i = 0; i + 4 < o.length; i += 5) { const w = o[i + 4]; const k = 1 + warpAmp * Math.sin(w); o[i + 1] *= k; o[i + 2] *= k; o[i + 3] *= k; } return o; }
export interface DivergenceState { readonly timelineId: string; readonly divergenceIndex: number; readonly anomalyCount: number; readonly collapseProbability: number; readonly hash: string; readonly dataLabel: 'THOUGHT_EXPERIMENT_SYNTHETIC'; }
/** Titor/Mandela divergence meter (thought-experiment only). */
export class DivergenceTracker {
  private state: DivergenceState;
  constructor(private clock: Clock, seed: number) { this.state = { timelineId: 'TL-' + seed, divergenceIndex: 0, anomalyCount: 0, collapseProbability: 0.5, hash: sha256hex(stableStringify({ seed })), dataLabel: 'THOUGHT_EXPERIMENT_SYNTHETIC' }; }
  step(eventPayload: unknown): DivergenceState {
    const h = sha256hex(stableStringify(eventPayload));
    const bits = parseInt(h.slice(0, 8), 16) / 0xffffffff;
    const delta = (bits - 0.5) * 0.02;
    const div = +(this.state.divergenceIndex + delta).toFixed(6);
    const anomaly = this.state.anomalyCount + (Math.abs(delta) > 0.008 ? 1 : 0);
    const collapse = +Math.min(1, Math.max(0, 0.5 + div * 0.1)).toFixed(6);
    this.state = { timelineId: this.state.timelineId, divergenceIndex: div, anomalyCount: anomaly, collapseProbability: collapse, hash: sha256hex(stableStringify({ prev: this.state.hash, h, div })), dataLabel: 'THOUGHT_EXPERIMENT_SYNTHETIC' };
    return this.state;
  }
  getState(): DivergenceState { return this.state; }
}
export interface SoraFrame { readonly t: number; readonly camera5D: readonly [number, number, number, number, number]; readonly physicsHash: string; readonly palette: readonly string[]; }
export interface SoraExport { readonly frames: readonly SoraFrame[]; readonly acts: number; readonly durationSeconds: number; readonly tags: readonly string[]; readonly dataLabel: 'SYNTHETIC_CINEMATIC'; readonly fingerprint: string; }
/** Sora-ready keyframe/trajectory export (<=180 s). */
export function generateSoraExport(job: JobResult, opts: { durationSeconds: number; cameraSeed: number }): SoraExport {
  const duration = Math.min(180, Math.max(1, Math.floor(opts.durationSeconds)));
  const rng = mulberry32(opts.cameraSeed); const frames: SoraFrame[] = [];
  for (let t = 0; t < duration; t++) {
    const sliceStart = (t * 7) % Math.max(1, job.output.length - 8);
    frames.push({ t, camera5D: [ +(rng() * 360).toFixed(2), +((rng() - 0.5) * 180).toFixed(2), +(8 + rng() * 8).toFixed(2), +(0.05 + rng() * 0.1).toFixed(3), +(0.1 + rng() * 0.2).toFixed(3) ], physicsHash: sha256hex(Array.from(job.output.slice(sliceStart, sliceStart + 8)).join(',')), palette: ['#02050a', '#38bdf8', '#a78bfa'] });
  }
  const partial = { frames, acts: 4, durationSeconds: duration, tags: ['#genesis5d', '#syntheticcinematic', '#hpc'], dataLabel: 'SYNTHETIC_CINEMATIC' as const };
  return { ...partial, fingerprint: sha256hex(stableStringify(partial)) };
}
/** Top-level HPC engine tying pool + divergence + sora export with append-only hashed log. */
export class GenesisHPCComputeEngine {
  private log: LogEntry[] = [];
  private pool: VirtualWorkerPool; private tracker: DivergenceTracker;
  constructor(private clock: Clock, private seed: number, workerCount: number) { this.pool = new VirtualWorkerPool(clock, seed, workerCount); this.tracker = new DivergenceTracker(clock, seed); }
  private append(kind: string, payload: unknown): void { const prev = this.log.length ? this.log[this.log.length - 1].hash : 'GENESIS'; const at = this.clock.now(); const index = this.log.length; const payloadHash = sha256hex(stableStringify(payload)); const hash = sha256hex(stableStringify({ index, kind, payloadHash, prevHash: prev })); this.log.push(Object.freeze({ index, kind, at, payloadHash, prevHash: prev, hash })); }
  runPipeline(input: Float64Array, job: ComputeJob, divergenceEvents: readonly unknown[]): { jobResult: JobResult; divergence: DivergenceState; sora: SoraExport; logHash: string } {
    const jobResult = this.pool.run(job, input); this.append('JOB', { jobId: job.jobId, combinedHash: jobResult.combinedHash });
    let div = this.tracker.getState(); for (const e of divergenceEvents) { div = this.tracker.step(e); } this.append('DIVERGENCE', { hash: div.hash });
    const sora = generateSoraExport(jobResult, { durationSeconds: 60, cameraSeed: this.seed }); this.append('SORA', { fingerprint: sora.fingerprint });
    return { jobResult, divergence: div, sora, logHash: this.getFingerprint() };
  }
  getLog(): readonly LogEntry[] { return this.log; }
  getFingerprint(): string { return sha256hex(stableStringify({ seed: this.seed, log: this.log.map(l => l.hash) })); }
}
