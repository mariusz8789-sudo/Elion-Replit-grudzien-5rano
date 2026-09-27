import { mulberry32, canonicalJson as stableStringify, sha256Hex as sha256hex } from '../determinism.js';
export { mulberry32, stableStringify, sha256hex };
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
