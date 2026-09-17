import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GenesisAgisCognitiveCore } from './GenesisAgisCognitiveCore.js';
import { ClassifiedInquiryEngine, HmacTokenVerifier } from './ClassifiedInquiryEngine.js';
const src = (f: string) => readFileSync(fileURLToPath(new URL('./' + f, import.meta.url)), 'utf8');
const clock = { t: 1000, now() { return this.t; } };
describe('AGI cognitive core', () => {
  it('same seed -> identical cognitiveFingerprint & trace', () => {
    const run = () => { const c = new GenesisAgisCognitiveCore(clock); const h = c.propose('PHYSICS', 'c-consistency', ['F-C', 'F-G'], 7); c.refute(h, { maxDerived: 1e9 }); return c.trace(); };
    expect(run().traceFingerprint).toBe(run().traceFingerprint);
  });
  it('different seed -> different trace', () => {
    const a = () => { const c = new GenesisAgisCognitiveCore(clock); c.propose('PHYSICS', 'q', ['F-C'], 7); return c.trace(); };
    const b = () => { const c = new GenesisAgisCognitiveCore(clock); c.propose('PHYSICS', 'q', ['F-C'], 8); return c.trace(); };
    expect(a().traceFingerprint).not.toBe(b().traceFingerprint);
  });
  it('conservation refutation falsifies violating hypothesis', () => {
    const c = new GenesisAgisCognitiveCore(clock); const h = c.propose('PHYSICS', 'over-unity', ['F-C'], 7);
    const tests = c.refute(h, { conserved: 1, maxDerived: 1 });
    expect(h.status).toBe('REFUTED'); expect(tests.some(t => !t.passed)).toBe(true);
  });
  it('synthesize returns only validated', () => {
    const c = new GenesisAgisCognitiveCore(clock); const h = c.propose('ASTROPHYSICS', 'solar', ['F-MSUN', 'F-RSUN'], 7);
    c.refute(h, { maxDerived: 1e31 }); expect(c.synthesize([h.id])).toContain(h.id);
  });
  it('never winner-gate eligible', () => { const c = new GenesisAgisCognitiveCore(clock); expect(c.trace().winnerGateEligible).toBe(false); });
});
describe('classified inquiry', () => {
  const setup = () => { const v = new HmacTokenVerifier(clock, 'secret'); return { v, e: new ClassifiedInquiryEngine(clock, v, 'RESEARCH') }; };
  it('valid token yields labeled scenario', () => { const { v, e } = setup(); const t = v.issue('RESEARCH', 60000); const r = e.inquire(t, 'Fermi paradox scenarios'); expect(r.ok).toBe(true); expect(r.result!.dataLabel).toBe('SPECULATIVE_HYPOTHESIS'); });
  it('CLASSIFIED level labels CLASSIFIED_SCENARIO', () => { const { v, e } = setup(); const t = v.issue('CLASSIFIED', 60000); const r = e.inquire(t, 'technosignature anomaly model'); expect(r.result!.dataLabel).toBe('CLASSIFIED_SCENARIO'); });
  it('bad token rejected', () => { const { v, e } = setup(); const t = v.issue('RESEARCH', 60000); expect(e.inquire({ ...t, hmac: '00'.repeat(32) }, 'q').code).toBe('BAD_TOKEN'); });
  it('insufficient level -> ACCESS_DENIED (not topic censorship)', () => { const { v, e } = setup(); const t = v.issue('PUBLIC', 60000); expect(e.inquire(t, 'UAP anomaly analysis').code).toBe('ACCESS_DENIED'); });
  it('fringe topic answered at sufficient level', () => { const { v, e } = setup(); const t = v.issue('RESEARCH', 60000); expect(e.inquire(t, 'extraterrestrial technosignatures').ok).toBe(true); });
});
describe('iron rules: no randomness/time in AGI+classified', () => {
  for (const f of ['GenesisAgisCognitiveCore.ts', 'ClassifiedInquiryEngine.ts']) it(f + ' clean', () => { const s = src(f); expect(s).not.toContain('Math.random('); expect(s).not.toContain('Date.now('); });
});
