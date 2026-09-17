import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHyperMicroscope, sampleBase, upsampleSuperRes } from './VirtualHyperMicroscope.js';
import { MarketGapHarvester, normalizeText, sha256hex, stableStringify } from './MarketGapHarvester.js';
import { GenesisCyberBastion, hmacSha256hex, constantTimeEqual, secureZero } from './GenesisCyberBastion.js';

const src = (f: string) => readFileSync(fileURLToPath(new URL('./' + f, import.meta.url)), 'utf8');
const clock = { t: 1000, now() { return this.t; } };
const INPUT = { sampleId: 'S1', baseGridSize: 8, seed: 7, psfSigma: 0.1 };

describe('VirtualHyperMicroscope', () => {
  it('same seed -> identical superGrid & fingerprint', () => { const m = createHyperMicroscope(clock); expect(m.simulate(INPUT).fingerprint).toBe(m.simulate(INPUT).fingerprint); });
  it('different seed -> different superGrid', () => { const m = createHyperMicroscope(clock); expect(m.simulate(INPUT).superGrid).not.toEqual(m.simulate({ ...INPUT, seed: 8 }).superGrid); });
  it('resolution gain factor is exactly 2', () => { const r = createHyperMicroscope(clock).simulate(INPUT); expect(r.resolutionGainFactor).toBe(2); expect(r.superGrid.length).toBe(r.baseGrid.length * 2); });
  it('dataLabel is MODEL_ESTIMATE', () => expect(createHyperMicroscope(clock).simulate(INPUT).dataLabel).toBe('MODEL_ESTIMATE'));
  it('upsample deterministic & non-negative', () => { const b = sampleBase(INPUT); const a = upsampleSuperRes(b, 7, 0.1); const c = upsampleSuperRes(b, 7, 0.1); expect(a).toEqual(c); expect(a.flat().every(v => v >= 0)).toBe(true); });
});

describe('MarketGapHarvester', () => {
  const mock = (text: string) => async () => ({ text, source: 'mock' });
  const TEXT = 'lack of deterministic replay\nmissing custody seal\nall good line\nbug in parser';
  it('seals gaps with SHA-256 and status UNVERIFIED_GAP', async () => {
    const h = new MarketGapHarvester({ fetchAdapter: mock(TEXT), clock });
    const gaps = await h.harvestOnce([{ url: 'u' }], 7);
    expect(gaps.length).toBe(3);
    for (const g of gaps) { expect(g.status).toBe('UNVERIFIED_GAP'); expect(g.sha256).toBe(sha256hex(stableStringify({ excerpt: g.excerpt, category: g.category, severity: g.severity, sourceUrl: g.sourceUrl }))); }
  });
  it('gap matrix aggregates by category', async () => { const h = new MarketGapHarvester({ fetchAdapter: mock(TEXT), clock }); await h.harvestOnce([{ url: 'u' }], 7); const m = h.getGapMatrix(); expect(m.some(e => e.category === 'lack')).toBe(true); });
  it('falsify changes status; assertNotClinical throws while unverified', async () => {
    const h = new MarketGapHarvester({ fetchAdapter: mock(TEXT), clock });
    const g = (await h.harvestOnce([{ url: 'u' }], 7))[0];
    expect(() => h.assertNotClinical(g.gapId)).toThrow();
    h.falsify(g.gapId, true); expect(() => h.assertNotClinical(g.gapId)).not.toThrow();
  });
  it('normalizeText deterministic', () => expect(normalizeText('Lack of Replay!')).toEqual(normalizeText('lack of replay')));
});

describe('GenesisCyberBastion', () => {
  it('sign/verify roundtrip', () => { const b = new GenesisCyberBastion(clock, 'key'); const t = b.issueToken('s1'); expect(b.verifyToken(t)).toBe(true); });
  it('tampered hmac fails verify (constant-time)', () => { const b = new GenesisCyberBastion(clock, 'key'); const t = b.issueToken('s1'); expect(b.verifyToken({ ...t, hmac: '00'.repeat(32) })).toBe(false); });
  it('write requires valid signature', () => { const b = new GenesisCyberBastion(clock, 'key'); expect(b.write({ sessionId: 's1', issuedAt: 0, expiresAt: 999999, hmac: 'aa'.repeat(32) }, { a: 1 }).code).toBe('BAD_SIGNATURE'); });
  it('rate limit triggers then resets after window', () => {
    const b = new GenesisCyberBastion(clock, 'key', { maxOps: 2, windowMs: 1000 }); const t = b.issueToken('s1');
    expect(b.write(t, { a: 1 }).ok).toBe(true); expect(b.write(t, { a: 2 }).ok).toBe(true);
    expect(b.write(t, { a: 3 }).code).toBe('RATE_LIMITED');
    clock.t += 1001; expect(b.write(t, { a: 4 }).ok).toBe(true);
  });
  it('tamper detection triggers lockdown and blocks writes', () => {
    const b = new GenesisCyberBastion(clock, 'key'); const t = b.issueToken('s1'); b.write(t, { a: 1 });
    const trail = b.getAuditTrail(); expect(b.detectTamper(0, 'ff'.repeat(32))).toBe(true);
    expect(b.isLocked()).toBe(true); expect(b.write(t, { a: 2 }).code).toBe('LOCKED');
    expect(trail.length).toBeLessThan(b.getAuditTrail().length);
  });
  it('audit chain verifies when untampered', () => { const b = new GenesisCyberBastion(clock, 'key'); const t = b.issueToken('s1'); b.write(t, { a: 1 }); b.write(t, { a: 2 }); expect(b.verifyChain()).toBe(true); });
  it('sanitize zeroes sensitive buffer', () => { const b = new GenesisCyberBastion(clock, 'secret'); const buf = b.getSessionKeyBuffer(); b.sanitize(); expect(buf.every(x => x === 0)).toBe(true); });
  it('hmac + constantTimeEqual correct', () => { const key = new TextEncoder().encode('k'); const h = hmacSha256hex(key, 'm'); expect(constantTimeEqual(h, h)).toBe(true); expect(constantTimeEqual(h, hmacSha256hex(key, 'x'))).toBe(false); });
  it('secureZero zeroes', () => { const b = new Uint8Array([1, 2, 3]); secureZero(b); expect(b.every(x => x === 0)).toBe(true); });
});

describe('iron rules: no Math.random / Date.now in advanced modules', () => {
  for (const f of ['VirtualHyperMicroscope.ts', 'MarketGapHarvester.ts', 'GenesisCyberBastion.ts']) {
    it(f + ' clean', () => { const s = src(f); expect(s).not.toContain('Math.random('); expect(s).not.toContain('Date.now('); });
  }
});
