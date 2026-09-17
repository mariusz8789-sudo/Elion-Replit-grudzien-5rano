export const mulberry32 = (seed: number) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export interface Clock { now(): number; }
/** Privacy-minimal payload: 32-dim landmark summary ONLY. No raw frames, no images, no video. */
export interface FaceTelemetryPayload {
  readonly payloadId: string; readonly mode: 'MEDIAPIPE' | 'SYNTHETIC_FALLBACK'; readonly seed: number;
  readonly landmarkVec: readonly number[]; readonly confidence: number; readonly consent: boolean;
  readonly containsRawImage: false; readonly sentAt: number; readonly ttlMs: number;
}
/** Client-side (browser) face summarizer. MediaPipe optional; deterministic synthetic fallback for demo. */
export class GenesisMirrorClient {
  private mode: FaceTelemetryPayload['mode'] = 'SYNTHETIC_FALLBACK';
  constructor(private seed: number, private clock: Clock) {}
  async init(): Promise<void> { try { await import('@mediapipe/tasks-vision'); this.mode = 'MEDIAPIPE'; } catch { this.mode = 'SYNTHETIC_FALLBACK'; } }
  getMode(): FaceTelemetryPayload['mode'] { return this.mode; }
  /** Pure summarizer: host app passes FaceLandmarker landmarks; nothing leaves device except this vector. */
  summarize(landmarks: readonly (readonly [number, number, number])[], consent: boolean): FaceTelemetryPayload {
    const vec = new Array<number>(32).fill(0);
    for (let i = 0; i < landmarks.length; i++) { const [x, y, z] = landmarks[i]; const b = i % 32; vec[b] = +(vec[b] + x * 0.37 + y * 0.51 + z * 0.19).toFixed(6); }
    const norm = Math.sqrt(vec.reduce((a, b) => a + b * b, 0)) || 1;
    const unit = vec.map(v => +(v / norm).toFixed(6));
    return { payloadId: 'MP-' + this.seed, mode: this.mode, seed: this.seed, landmarkVec: unit, confidence: +(0.5 + 0.5 * Math.abs(unit[0])).toFixed(4), consent, containsRawImage: false, sentAt: this.clock.now(), ttlMs: 15000 };
  }
  syntheticSummary(consent = true): FaceTelemetryPayload { const rng = mulberry32(this.seed); const lm = Array.from({ length: 64 }, () => [rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1] as const); return this.summarize(lm, consent); }
}
