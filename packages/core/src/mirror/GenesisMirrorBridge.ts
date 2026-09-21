import { createHash } from 'node:crypto';
export const mulberry32 = (seed: number) => { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
export const stableStringify = (v: unknown): string => { if (v === null) return 'null'; if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']'; if (typeof v === 'object') { const o = v as Record<string, unknown>; return '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + stableStringify(o[k])).join(',') + '}'; } return JSON.stringify(v); };
export const sha256hex = (t: string): string => createHash('sha256').update(t, 'utf8').digest('hex');
export interface Clock { now(): number; }
export interface FaceTelemetryPayload { readonly payloadId: string; readonly mode: 'MEDIAPIPE' | 'SYNTHETIC_FALLBACK'; readonly seed: number; readonly landmarkVec: readonly number[]; readonly confidence: number; readonly consent: boolean; readonly containsRawImage: false; readonly sentAt: number; readonly ttlMs: number; }
export interface AvatarAnimationPackage { readonly animationId: string; readonly trajectory: readonly (readonly number[])[]; readonly durationSeconds: number; readonly stylePalette: readonly string[]; readonly ephemeral: true; readonly retainMs: 0; readonly dataLabel: 'SYNTHETIC_CINEMATIC'; readonly fingerprint: string; }
export type MirrorClientMessage = { type: 'MIRROR_REQUEST'; payload: FaceTelemetryPayload };
export type MirrorServerMessage = { type: 'MIRROR_ANIMATION'; pkg: AvatarAnimationPackage } | { type: 'MIRROR_REJECT'; reason: 'NO_CONSENT' | 'PAYLOAD_EXPIRED' | 'RAW_IMAGE_DETECTED' };
const hashVec = (v: readonly number[]): number => { let h = 0x811c9dc5; for (const x of v) { h ^= Math.round(x * 1e6); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; };
/** Ephemeral cloud bridge: stateless, stores nothing, returns deterministic animation package. */
export class GenesisMirrorBridge {
  constructor(private clock: Clock, private seed: number) {}
  handle(p: FaceTelemetryPayload): MirrorServerMessage {
    if (!p.consent) return { type: 'MIRROR_REJECT', reason: 'NO_CONSENT' };
    if (p.containsRawImage !== false) return { type: 'MIRROR_REJECT', reason: 'RAW_IMAGE_DETECTED' };
    if (this.clock.now() - p.sentAt > p.ttlMs) return { type: 'MIRROR_REJECT', reason: 'PAYLOAD_EXPIRED' };
    const rng = mulberry32(this.seed ^ hashVec(p.landmarkVec));
    const trajectory: number[][] = [];
    for (let i = 0; i < 30; i++) trajectory.push([ +(Math.sin(i * 0.2 + rng() * 6.28) * (0.5 + p.landmarkVec[i % 32] * 0.5)).toFixed(4), +(Math.cos(i * 0.17 + rng() * 6.28) * 0.5).toFixed(4), +p.landmarkVec[(i + 7) % 32].toFixed(4) ]);
    const partial = { animationId: 'AV-' + p.payloadId, trajectory, durationSeconds: 15, stylePalette: ['#02050a', '#38bdf8', '#a78bfa'], ephemeral: true as const, retainMs: 0 as const, dataLabel: 'SYNTHETIC_CINEMATIC' as const };
    return { type: 'MIRROR_ANIMATION', pkg: { ...partial, fingerprint: sha256hex(stableStringify(partial)) } };
  }
}
