import { describe, expect, it } from 'vitest';
import { CHAT_ENGINES } from '../core/scienceChat/engines';
import { parseScienceChatMessage } from '../core/experimentFabric/parser';
import { resolveCommand } from '../core/scienceChat/resolveCommand';

describe('Ask engine picker', () => {
  it('every engine fills a prompt the chat already acts on (a route, a lab or a model plan)', () => {
    for (const engine of CHAT_ENGINES) {
      const r = resolveCommand(engine.prompt, null);
      const fabric = parseScienceChatMessage(engine.prompt);
      const acts = r.action !== undefined || r.intent !== 'UNKNOWN' || fabric.modelId !== undefined;
      expect(acts, engine.id).toBe(true);
    }
  });

  it('an unknown question is not answered with one fixed sentence', () => {
    const a = resolveCommand('jak działa lek na cukrzycę', null);
    const b = resolveCommand('policz energię wodoru', null);
    expect(a.text).not.toBe(b.text);
    expect(a.text).toContain('jak działa lek na cukrzycę');
  });

  it('a question about an organ opens that organ', () => {
    expect(resolveCommand('co robi mózg?', null).action).toEqual({ type: 'openRoute', hash: '#/human-biology-lab?focus=brain&level=organ' });
  });
});
