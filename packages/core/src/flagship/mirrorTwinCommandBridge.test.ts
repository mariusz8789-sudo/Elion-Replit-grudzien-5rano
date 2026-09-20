/* Proprietary / All Rights Reserved - Genesis OS */
import { describe, expect, it } from 'vitest';
import { createMirrorSession, mirrorTransition } from './mirrorTwin.js';
import { applyMirrorTwinWorldCommand, mirrorEventFromWorldCommand, recordMirrorTwinCommand, type CanonicalInteractCommand } from './mirrorTwinCommandBridge.js';
import { SessionEventLog } from './sessionEventLog.js';

const cmd = (action: string, parameters: Record<string, string | number | boolean> = {}, commandId = 'cmd-deadbeef'): CanonicalInteractCommand =>
  ({ commandId, text: action, intent: 'INTERACT', parameters: { action, ...parameters }, requestedAtLogicalTime: 1 });

describe('Mirror Twin canonical command bridge (D-136) — no second Mirror Twin, no second renderer', () => {
  it('maps a canonical INTERACT command onto the EXISTING state machine: ENTER_ZONE -> TELEMETRY -> SYNC_TICK reaches TWIN_READY', () => {
    let s = createMirrorSession('S1', 'human-explorer');
    expect(s.state).toBe('MIRROR_IDLE');
    s = applyMirrorTwinWorldCommand(s, cmd('MIRROR_ENTER_ZONE'), 1);
    expect(s.state).toBe('SCANNING');
    s = mirrorTransition(s, { type: 'TELEMETRY', payload: { consent: true, containsRawImage: false, mode: 'SYNTHETIC_FALLBACK', confidence: 1, sentAt: 1, ttlMs: 100 } }, 2);
    expect(s.state).toBe('SYNCING');
    s = applyMirrorTwinWorldCommand(s, cmd('MIRROR_SYNC_TICK', { progress: 1 }), 3);
    expect(s.state).toBe('TWIN_READY');
  });

  it('a command whose action is not a Mirror Twin action leaves the session untouched — never a guessed transition', () => {
    const s0 = createMirrorSession('S1', 'human-explorer');
    const s1 = applyMirrorTwinWorldCommand(s0, cmd('FOCUS_ANATOMY', { focus: 'heart' }), 1);
    expect(s1).toEqual(s0);
    expect(mirrorEventFromWorldCommand(cmd('FOCUS_ANATOMY'))).toBeNull();
    expect(mirrorEventFromWorldCommand({ commandId: 'cmd-x', text: 't', intent: 'INTERACT', requestedAtLogicalTime: 1 })).toBeNull();
  });

  it('TELEMETRY always carries containsRawImage: false regardless of what parameters claim — the consent gate cannot be bypassed by a command', () => {
    const event = mirrorEventFromWorldCommand(cmd('MIRROR_TELEMETRY', { consent: true, mode: 'MEDIAPIPE', confidence: 0.9, sentAt: 5, ttlMs: 2000 }));
    expect(event).toEqual({ type: 'TELEMETRY', payload: { consent: true, containsRawImage: false, mode: 'MEDIAPIPE', confidence: 0.9, sentAt: 5, ttlMs: 2000 } });
  });

  it('an illegal transition (SYNC_TICK before entering the zone) is refused by the existing state machine, not by this bridge', () => {
    const s0 = createMirrorSession('S1', 'human-explorer');
    const s1 = applyMirrorTwinWorldCommand(s0, cmd('MIRROR_SYNC_TICK', { progress: 1 }), 1);
    expect(s1.state).toBe('MIRROR_IDLE');
    expect(s1.refusals).toContain('ILLEGAL_EVENT:SYNC_TICK@MIRROR_IDLE');
  });

  it('recordMirrorTwinCommand writes a MIRROR_STATE session event carrying the command id and the resulting state; a non-mirror command writes nothing', () => {
    const clock = { t: 0, now() { return (this.t += 1); } };
    const log = new SessionEventLog(clock);
    let s = createMirrorSession('S1', 'human-explorer');
    s = applyMirrorTwinWorldCommand(s, cmd('MIRROR_ENTER_ZONE', {}, 'cmd-abc12345'), 1);
    recordMirrorTwinCommand(log, 'S1', cmd('MIRROR_ENTER_ZONE', {}, 'cmd-abc12345'), s);
    const events = log.read('S1');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('MIRROR_STATE');
    expect((events[0].payload as { commandId: string }).commandId).toBe('cmd-abc12345');
    expect((events[0].payload as { state: { state: string } }).state.state).toBe('SCANNING');

    recordMirrorTwinCommand(log, 'S1', cmd('FOCUS_ANATOMY'), s);
    expect(log.read('S1')).toHaveLength(1); // unchanged: not a Mirror Twin command
  });
});
