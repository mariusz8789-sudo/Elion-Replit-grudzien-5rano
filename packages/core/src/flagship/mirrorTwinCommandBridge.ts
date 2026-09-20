/* Proprietary / All Rights Reserved - Genesis OS */
import { mirrorTransition, type MirrorEvent, type MirrorTwinSession } from './mirrorTwin.js';
import type { SessionEventLog } from './sessionEventLog.js';

/**
 * D-136 — MIRROR TWIN CANONICAL COMMAND BRIDGE.
 *
 * `mirrorTwin.ts`'s state machine is currently driven only by `agenticScienceRuntime.ts`'s hardcoded
 * demo sequence (`runFlagshipJourney`) — nothing turns a parsed WorldCommand into a `MirrorEvent`.
 * This is that one, narrow translation, reusing the EXISTING `mirrorTransition` pure reducer; it
 * creates no second Mirror Twin, no second renderer, no second session/world sync. A command with an
 * unrecognised or missing `action` parameter is not a Mirror Twin command and yields `null`, never a
 * guessed transition.
 */
export interface CanonicalInteractCommand {
  readonly commandId: string;
  readonly text: string;
  readonly intent: 'INTERACT';
  readonly parameters?: Readonly<Record<string, string | number | boolean>>;
  readonly requestedAtLogicalTime: number;
}

const MIRROR_ACTIONS = new Set([
  'MIRROR_ENTER_ZONE', 'MIRROR_TELEMETRY', 'MIRROR_SYNC_TICK', 'MIRROR_DIVERGE', 'MIRROR_CAPTURE', 'MIRROR_REPLAY', 'MIRROR_RESET',
]);

function number(v: unknown, fallback = 0): number { return typeof v === 'number' && Number.isFinite(v) ? v : fallback; }
function string(v: unknown, fallback = ''): string { return typeof v === 'string' ? v : fallback; }

export function mirrorEventFromWorldCommand(command: CanonicalInteractCommand): MirrorEvent | null {
  if (command.intent !== 'INTERACT') return null;
  const p = command.parameters ?? {};
  const action = string(p.action);
  if (!MIRROR_ACTIONS.has(action)) return null;
  switch (action) {
    case 'MIRROR_ENTER_ZONE': return { type: 'ENTER_ZONE' };
    case 'MIRROR_TELEMETRY': return {
      type: 'TELEMETRY',
      payload: {
        consent: p.consent === true,
        containsRawImage: false,
        mode: p.mode === 'MEDIAPIPE' ? 'MEDIAPIPE' : 'SYNTHETIC_FALLBACK',
        confidence: number(p.confidence),
        sentAt: number(p.sentAt, command.requestedAtLogicalTime),
        ttlMs: number(p.ttlMs, 15000),
      },
    };
    case 'MIRROR_SYNC_TICK': return { type: 'SYNC_TICK', progress: number(p.progress) };
    case 'MIRROR_DIVERGE': return { type: 'DIVERGE', action: string(p.divergenceAction, 'deterministic divergence') };
    case 'MIRROR_CAPTURE': return { type: 'CAPTURE' };
    case 'MIRROR_REPLAY': return { type: 'REPLAY' };
    case 'MIRROR_RESET': return { type: 'RESET' };
    default: return null;
  }
}

export function applyMirrorTwinWorldCommand(session: MirrorTwinSession, command: CanonicalInteractCommand, now: number): MirrorTwinSession {
  const event = mirrorEventFromWorldCommand(command);
  return event ? mirrorTransition(session, event, now) : session;
}

export function recordMirrorTwinCommand(log: SessionEventLog, sessionId: string, command: CanonicalInteractCommand, state: MirrorTwinSession): void {
  const event = mirrorEventFromWorldCommand(command);
  if (!event) return;
  log.append(sessionId, 'MIRROR_STATE', { commandId: command.commandId, event, state });
}
