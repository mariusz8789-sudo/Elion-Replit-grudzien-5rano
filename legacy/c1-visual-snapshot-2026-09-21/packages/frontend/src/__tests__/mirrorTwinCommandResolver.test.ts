import { describe, expect, it } from 'vitest';
import { parseBiologyWorldCommands } from '../core/scientificWorlds/biologyCommands';

/**
 * D-136 — the Mirror Twin text-command front door. Proves `mirrorTwinCommandResolver.ts` produces the
 * exact canonical `MIRROR_*` actions `packages/core/src/flagship/mirrorTwinCommandBridge.ts` already
 * understands (`mirrorEventFromWorldCommand`'s `MIRROR_ACTIONS` set) — never a different vocabulary,
 * never a second Mirror Twin. Also proves it is checked BEFORE the biology resolver, so a phrase
 * naming the mirror twin is never shadowed by the biology resolver's broader keyword matching.
 */
describe('D-136 Mirror Twin command resolver — real text -> canonical MIRROR_* actions, checked first', () => {
  it('maps the whole vocabulary onto exactly the actions the existing bridge understands', () => {
    const cases: readonly [string, string][] = [
      ['wejdz do trybu mirror twin', 'MIRROR_ENTER_ZONE'],
      ['wyslij telemetrie do lustra', 'MIRROR_TELEMETRY'],
      ['zsynchronizuj lustro', 'MIRROR_SYNC_TICK'],
      ['niech lustro sie rozejdzie od mojego ruchu', 'MIRROR_DIVERGE'],
      ['nagraj zrzut lustra', 'MIRROR_CAPTURE'],
      ['odtworz replay lustra', 'MIRROR_REPLAY'],
      ['zresetuj lustro', 'MIRROR_RESET'],
    ];
    for (const [text, action] of cases) {
      const parsed = parseBiologyWorldCommands(text, 1);
      const interact = parsed.commands.find((c) => c.intent === 'INTERACT');
      expect(interact?.parameters?.action, text).toBe(action);
      expect(interact?.targetEntityId, text).toBe('station:human-study');
    }
  });

  it('TELEMETRY never carries a raw image flag from free text — the resolver never emits containsRawImage itself, the bridge always forces it false', () => {
    const parsed = parseBiologyWorldCommands('wyslij telemetrie do lustra', 1);
    const interact = parsed.commands.find((c) => c.intent === 'INTERACT');
    expect(interact?.parameters).not.toHaveProperty('containsRawImage');
  });

  it('a mirror-twin phrase is resolved before the biology resolver could shadow it, even when it also contains a biology-sounding word', () => {
    const parsed = parseBiologyWorldCommands('wejdz do trybu mirror twin i pokaz naczynia', 1);
    const interact = parsed.commands.find((c) => c.intent === 'INTERACT');
    expect(interact?.parameters?.action).toBe('MIRROR_ENTER_ZONE');
  });

  it('never invents a Mirror Twin command for text that never mentions the mirror twin', () => {
    const parsed = parseBiologyWorldCommands('pokaz serce', 1);
    const interact = parsed.commands.find((c) => c.intent === 'INTERACT');
    expect(interact?.parameters?.action).not.toMatch(/^MIRROR_/);
  });

  it('is deterministic: same text and logical time give the same command ids', () => {
    const a = parseBiologyWorldCommands('zsynchronizuj lustro', 3);
    const b = parseBiologyWorldCommands('zsynchronizuj lustro', 3);
    expect(a.commands.map((c) => c.commandId)).toEqual(b.commands.map((c) => c.commandId));
  });
});
