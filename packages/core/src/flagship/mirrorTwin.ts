/* Proprietary / All Rights Reserved - Genesis OS */
import { sha256hex, stableStringify } from '../knowledge/EvidenceLedger.js';
import type { FaceTelemetryPayload } from '../mirror/GenesisMirrorBridge.js';

/**
 * MIRROR TWIN (D-130) — the pack's lifecycle as a pure state machine over
 * the existing mirror contract (`GenesisMirrorBridge`: consent required,
 * no raw image, ephemeral payloads). The twin is a VISUAL_SESSION_PROXY:
 * a session-scoped representation, never an identity, never a biometric
 * claim. Divergence is the feature: the twin may perform a different
 * scripted action while the subject stays; both are in the trace so a
 * capture can be replayed deterministically.
 */
export type MirrorState = 'MIRROR_IDLE' | 'SCANNING' | 'SYNCING' | 'TWIN_READY' | 'DIVERGENCE_MODE' | 'CAPTURE' | 'REPLAY';
export type MirrorEvent = { type: 'ENTER_ZONE' } | { type: 'TELEMETRY'; payload: Pick<FaceTelemetryPayload, 'consent' | 'containsRawImage' | 'mode' | 'confidence' | 'sentAt' | 'ttlMs'> } | { type: 'SYNC_TICK'; progress: number } | { type: 'DIVERGE'; action: string } | { type: 'CAPTURE' } | { type: 'REPLAY' } | { type: 'RESET' };

export interface MirrorTwinSession {
  readonly sessionId: string; readonly state: MirrorState; readonly subjectRepresentationId: string; readonly twinRepresentationId: string;
  readonly identityScope: 'VISUAL_SESSION_PROXY'; readonly syncProgress: number; readonly appearance: { readonly face: 'CAPTURE_PENDING' | 'SYNCED_SESSION_PROXY'; readonly clothing: 'CAPTURE_PENDING' | 'SYNCED_SESSION_PROXY'; readonly sourceMode: 'MEDIAPIPE' | 'SYNTHETIC_FALLBACK' | null };
  readonly divergenceAllowed: true; readonly divergenceAction: string | null; readonly refusals: readonly string[]; readonly dataLabel: 'SYNTHETIC_CINEMATIC'; readonly fingerprint: string;
}

const TRANSITIONS: Readonly<Record<MirrorState, readonly MirrorEvent['type'][]>> = {
  MIRROR_IDLE: ['ENTER_ZONE'], SCANNING: ['TELEMETRY', 'RESET'], SYNCING: ['SYNC_TICK', 'RESET'], TWIN_READY: ['DIVERGE', 'CAPTURE', 'RESET'], DIVERGENCE_MODE: ['CAPTURE', 'DIVERGE', 'RESET'], CAPTURE: ['REPLAY', 'RESET'], REPLAY: ['RESET', 'CAPTURE'],
};
function seal(s: Omit<MirrorTwinSession, 'fingerprint'>): MirrorTwinSession { return { ...s, fingerprint: sha256hex(stableStringify({ ...s, refusals: s.refusals })) }; }

export function createMirrorSession(sessionId: string, subjectRepresentationId: string): MirrorTwinSession {
  return seal({ sessionId, state: 'MIRROR_IDLE', subjectRepresentationId, twinRepresentationId: `twin:${sha256hex(`${sessionId}|${subjectRepresentationId}`).slice(0, 12)}`, identityScope: 'VISUAL_SESSION_PROXY', syncProgress: 0, appearance: { face: 'CAPTURE_PENDING', clothing: 'CAPTURE_PENDING', sourceMode: null }, divergenceAllowed: true, divergenceAction: null, refusals: [], dataLabel: 'SYNTHETIC_CINEMATIC' });
}

/** Pure transition; an illegal event is refused (state unchanged, reason recorded), never thrown into the scene. */
export function mirrorTransition(s: MirrorTwinSession, e: MirrorEvent, now: number): MirrorTwinSession {
  if (!TRANSITIONS[s.state].includes(e.type)) return seal({ ...s, refusals: [...s.refusals, `ILLEGAL_EVENT:${e.type}@${s.state}`] });
  switch (e.type) {
    case 'ENTER_ZONE': return seal({ ...s, state: 'SCANNING' });
    case 'TELEMETRY': {
      if (!e.payload.consent) return seal({ ...s, refusals: [...s.refusals, 'NO_CONSENT'] });
      if (e.payload.containsRawImage !== false) return seal({ ...s, refusals: [...s.refusals, 'RAW_IMAGE_DETECTED'] });
      if (now > e.payload.sentAt + e.payload.ttlMs) return seal({ ...s, refusals: [...s.refusals, 'PAYLOAD_EXPIRED'] });
      return seal({ ...s, state: 'SYNCING', syncProgress: 0, appearance: { ...s.appearance, sourceMode: e.payload.mode } });
    }
    case 'SYNC_TICK': { const p = Math.min(1, Math.max(s.syncProgress, e.progress)); return seal(p >= 1 ? { ...s, state: 'TWIN_READY', syncProgress: 1, appearance: { face: 'SYNCED_SESSION_PROXY', clothing: 'SYNCED_SESSION_PROXY', sourceMode: s.appearance.sourceMode } } : { ...s, syncProgress: p }); }
    case 'DIVERGE': return seal({ ...s, state: 'DIVERGENCE_MODE', divergenceAction: e.action });
    case 'CAPTURE': return seal({ ...s, state: 'CAPTURE' });
    case 'REPLAY': return seal({ ...s, state: 'REPLAY' });
    case 'RESET': return createMirrorSession(s.sessionId, s.subjectRepresentationId);
  }
}
