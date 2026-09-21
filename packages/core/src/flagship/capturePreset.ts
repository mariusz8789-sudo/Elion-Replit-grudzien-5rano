/* Proprietary / All Rights Reserved - Genesis OS */
import { sha256hex, stableStringify } from '../knowledge/EvidenceLedger.js';
import type { FlagshipEpistemicStatus } from './epistemicGuard.js';

/**
 * SOCIAL CAPTURE (D-130) — one shared capture SPEC for every flagship
 * sequence: aspect preset, safe framing, captions, the epistemic badge and
 * the replay key. The spec is what a renderer records against (the existing
 * canvas capture in LabFpvView is the only recorder today); no video is
 * produced here, and a spec without a badge is not a valid capture.
 */
export type CaptureAspect = '9:16' | '16:9' | '1:1';
export type CameraMove = 'ORBIT' | 'TRACK' | 'DOLLY' | 'STATIC';
export interface CaptureFrame { readonly width: number; readonly height: number; readonly safeInset: { readonly top: number; readonly bottom: number; readonly left: number; readonly right: number } }
export const CAPTURE_FRAMES: Readonly<Record<CaptureAspect, CaptureFrame>> = {
  '9:16': { width: 1080, height: 1920, safeInset: { top: 0.14, bottom: 0.2, left: 0.06, right: 0.06 } },
  '16:9': { width: 1920, height: 1080, safeInset: { top: 0.08, bottom: 0.1, left: 0.05, right: 0.05 } },
  '1:1': { width: 1080, height: 1080, safeInset: { top: 0.08, bottom: 0.12, left: 0.06, right: 0.06 } },
};
export interface CaptureSpec {
  readonly captureId: string; readonly sessionId: string; readonly title: string; readonly aspect: CaptureAspect; readonly frame: CaptureFrame; readonly move: CameraMove; readonly durationS: number;
  readonly captions: readonly { readonly atS: number; readonly text: string }[]; readonly badge: { readonly status: FlagshipEpistemicStatus; readonly text: string }; readonly replayKey: string; readonly privacy: 'NO_USER_DATA_IN_FRAME'; readonly fingerprint: string;
}
export function createCaptureSpec(input: { readonly sessionId: string; readonly title: string; readonly aspect: CaptureAspect; readonly move?: CameraMove; readonly durationS?: number; readonly captions: readonly { readonly atS: number; readonly text: string }[]; readonly status: FlagshipEpistemicStatus; readonly replayKey: string }): CaptureSpec {
  if (!input.replayKey) throw new Error('CAPTURE_REQUIRES_REPLAY_KEY');
  const badgeText = input.status === 'FICTIONAL' ? 'FICTIONAL — no scientific claim' : input.status === 'SPECULATIVE' ? 'SPECULATIVE — assumptions declared, not established' : input.status === 'REAL_OBSERVATION' ? 'REAL OBSERVATION — sourced' : `${input.status} — not a direct observation`;
  const spec = { captureId: `cap:${sha256hex(`${input.sessionId}|${input.title}|${input.aspect}|${input.replayKey}`).slice(0, 12)}`, sessionId: input.sessionId, title: input.title, aspect: input.aspect, frame: CAPTURE_FRAMES[input.aspect], move: input.move ?? 'ORBIT', durationS: Math.max(3, Math.min(60, input.durationS ?? 12)), captions: [...input.captions].sort((a, b) => a.atS - b.atS), badge: { status: input.status, text: badgeText }, replayKey: input.replayKey, privacy: 'NO_USER_DATA_IN_FRAME' as const };
  return { ...spec, fingerprint: sha256hex(stableStringify(spec)) };
}
