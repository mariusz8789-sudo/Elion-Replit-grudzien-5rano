import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateEntityFromSeed, GenesisInteractiveEntityEngine } from './GenesisInteractiveEntityEngine.js';
const src = readFileSync(fileURLToPath(new URL('./GenesisInteractiveEntityEngine.ts', import.meta.url)), 'utf8');
const clock = { t: 1000, now() { return this.t; } };
describe('genesis interactive entity engine', () => {
  it('generates entities deterministically from seed', () => { const a = generateEntityFromSeed(777, 'MAYAN_CLASSIC', 800, 'Kapłan'); const b = generateEntityFromSeed(777, 'MAYAN_CLASSIC', 800, 'Kapłan'); expect(a.entityId).toBe(b.entityId); expect(a.name).toBe(b.name); });
  it('unique session ids for same agent+entity at same tick', () => { const e = new GenesisInteractiveEntityEngine(clock, 1337); const ent = generateEntityFromSeed(777, 'INDUSTRIAL_XIX', 1890); const s1 = e.startSession('AG-1', ent); const s2 = e.startSession('AG-1', ent); expect(s1.sessionId).not.toBe(s2.sessionId); });
  it('first utterance uses greeting; ledger chains & verifies', () => { const e = new GenesisInteractiveEntityEngine(clock, 1337); const ent = generateEntityFromSeed(777, 'INDUSTRIAL_XIX', 1890); const s = e.startSession('AG-1', ent); const s2 = e.interact(s.sessionId, 'Opowiedz o maszynach');
    expect(s2.dialogueHistory[0].utteranceText).toMatch(/Dzień dobry|Czym mogę służyć/); expect(e.getDialogueLedger().length).toBe(1); expect(e.verifyDialogueLedger().ok).toBe(true); });
  it('session fingerprint chains across utterances', () => { const e = new GenesisInteractiveEntityEngine(clock, 1337); const ent = generateEntityFromSeed(777, 'MAYAN_CLASSIC', 800); let s = e.startSession('AG-1', ent); const f0 = s.fingerprint; s = e.interact(s.sessionId, 'q1'); const f1 = s.fingerprint; s = e.interact(s.sessionId, 'q2'); expect(f1).not.toBe(f0); expect(s.fingerprint).not.toBe(f1); });
  it('bullet-time toggles', () => { const e = new GenesisInteractiveEntityEngine(clock, 1337); const s = e.toggleBulletTime(e.startSession('AG-1', generateEntityFromSeed(7, 'FUTURE_2099', 2099)).sessionId, true); expect(s.bulletTimeActive).toBe(true); });
  it('iron rules', () => { expect(src).not.toContain('Math.random('); expect(src).not.toContain('Date.now('); });
});
