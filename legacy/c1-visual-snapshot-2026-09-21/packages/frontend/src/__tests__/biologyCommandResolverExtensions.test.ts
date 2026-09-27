import { describe, expect, it } from 'vitest';
import { parseBiologyWorldCommands } from '../core/scientificWorlds/biologyCommands';

/**
 * D-136 — organs, display modes and section-plane phrasing the legacy V3 router
 * (`humanLab/commandRouter.ts`) never reached by free text at all (only brain/hippocampus and XRAY
 * were reachable before this). `scientificWorldsBiology.test.ts` already pins the ENTIRE pre-existing
 * V3 acceptance sentence and every phrase it already understood, unchanged; this file covers only the
 * new, additive coverage layered on top through `biologyCommandResolver.ts`.
 */
describe('D-136 biology command resolver — real, additive organ/mode/section coverage', () => {
  it('reaches organs the legacy router never covered by free text (heart, liver, kidney, stomach, pancreas, lung)', () => {
    const cases: readonly [string, string][] = [
      ['pokaż serce', 'heart'], ['pokaż wątrobę', 'liver'], ['pokaż nerkę', 'left-kidney'],
      ['pokaż żołądek', 'stomach'], ['pokaż trzustkę', 'pancreas'], ['pokaż płuco', 'left-lung'],
    ];
    for (const [text, focus] of cases) {
      const parsed = parseBiologyWorldCommands(text, 1);
      expect(parsed.unresolved, text).toEqual([]);
      const interact = parsed.commands.find((c) => c.intent === 'INTERACT');
      expect(interact?.parameters, text).toMatchObject({ action: 'FOCUS_ANATOMY', focus });
    }
  });

  it('isolating an organ by name uses ISOLATE_NODE instead of FOCUS_ANATOMY', () => {
    const parsed = parseBiologyWorldCommands('izoluj serce', 1);
    const interact = parsed.commands.find((c) => c.intent === 'INTERACT');
    expect(interact?.parameters).toMatchObject({ action: 'ISOLATE_NODE', focus: 'heart' });
  });

  it('reaches display modes beyond XRAY: vascular, nervous, lymphatic, organs, tissue, cellular', () => {
    const cases: readonly [string, string][] = [
      ['pokaż naczynia', 'VASCULAR'], ['pokaż układ nerwowy', 'NERVOUS'], ['pokaż układ chłonny', 'LYMPHATIC'],
      ['pokaż narządowy', 'ORGANS'], ['pokaż tkankę', 'TISSUE'], ['pokaż komórkowy', 'CELLULAR'],
    ];
    for (const [text, mode] of cases) {
      const parsed = parseBiologyWorldCommands(text, 1);
      expect(parsed.commands[0]?.parameters, text).toEqual({ action: 'SET_ANATOMY_MODE', mode });
    }
  });

  it('the section plane (SET_CUTAWAY) and clearing isolation are reachable by free text for the first time', () => {
    const cutaway = parseBiologyWorldCommands('zrób przekrój', 1);
    expect(cutaway.commands[0]?.parameters).toEqual({ action: 'SET_CUTAWAY', enabled: true });

    const clear = parseBiologyWorldCommands('pokaż wszystko', 1);
    expect(clear.commands[0]?.parameters).toEqual({ action: 'CLEAR_ISOLATION' });
  });

  it('never invents a command for real nonsense text, on either the legacy or the extended path', () => {
    expect(parseBiologyWorldCommands('xyzzy plugh', 1)).toEqual({ commands: [], unresolved: ['xyzzy plugh'] });
  });

  it('the extended resolver never runs ahead of the legacy router: "pokaż mózg" still resolves through the V3 pack path (BRAIN mode), not the generic organ list', () => {
    const parsed = parseBiologyWorldCommands('pokaż mózg', 1);
    const interact = parsed.commands.find((c) => c.intent === 'INTERACT');
    expect(interact?.parameters).toEqual({ action: 'FOCUS_ANATOMY', focus: 'brain', mode: 'BRAIN' });
  });

  it('is deterministic: same text and logical time give the same command ids; a different logical time does not', () => {
    const a = parseBiologyWorldCommands('pokaż serce', 5);
    const b = parseBiologyWorldCommands('pokaż serce', 5);
    expect(a.commands.map((c) => c.commandId)).toEqual(b.commands.map((c) => c.commandId));
    const c = parseBiologyWorldCommands('pokaż serce', 6);
    expect(c.commands[0]?.commandId).not.toBe(a.commands[0]?.commandId);
  });
});
