import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GenesisMirrorClient } from '../../../ui/src/mirror/GenesisMirrorClient.js';
import { GenesisMirrorBridge } from './GenesisMirrorBridge.js';
const src = (f: string) => readFileSync(fileURLToPath(new URL('./' + f, import.meta.url)), 'utf8');
const clock = { t: 1000, now() { return this.t; } };
describe('mirror client (privacy-minimal)', () => {
  it('synthetic payload deterministic & no raw image', () => { const c = new GenesisMirrorClient(7, clock); const a = c.syntheticSummary(); const b = c.syntheticSummary(); expect(a.landmarkVec).toEqual(b.landmarkVec); expect(a.containsRawImage).toBe(false); expect(a.landmarkVec.length).toBe(32); });
  it('consent flag carried', () => { expect(new GenesisMirrorClient(7, clock).syntheticSummary(false).consent).toBe(false); });
});
describe('mirror bridge (ephemeral, deterministic)', () => {
  it('same payload+seed -> same fingerprint', () => { const c = new GenesisMirrorClient(7, clock); const p = c.syntheticSummary(); const br = new GenesisMirrorBridge(clock, 1337);
    const a = br.handle(p); const b = br.handle(p); expect(a.type).toBe('MIRROR_ANIMATION'); if (a.type === 'MIRROR_ANIMATION' && b.type === 'MIRROR_ANIMATION') expect(a.pkg.fingerprint).toBe(b.pkg.fingerprint); });
  it('rejects no-consent and expired', () => { const c = new GenesisMirrorClient(7, clock); const br = new GenesisMirrorBridge(clock, 1337);
    expect(br.handle(c.syntheticSummary(false))).toEqual({ type: 'MIRROR_REJECT', reason: 'NO_CONSENT' });
    const old = { ...c.syntheticSummary(), sentAt: clock.now() - 20000 }; expect(br.handle(old)).toEqual({ type: 'MIRROR_REJECT', reason: 'PAYLOAD_EXPIRED' }); });
  it('ephemeral: retainMs 0 & label', () => { const c = new GenesisMirrorClient(7, clock); const r = new GenesisMirrorBridge(clock, 1337).handle(c.syntheticSummary()); if (r.type === 'MIRROR_ANIMATION') { expect(r.pkg.retainMs).toBe(0); expect(r.pkg.ephemeral).toBe(true); expect(r.pkg.dataLabel).toBe('SYNTHETIC_CINEMATIC'); } });
});
describe('iron rules', () => {
  it('bridge no Math.random/Date.now', () => { const s = src('GenesisMirrorBridge.ts'); expect(s).not.toContain('Math.random('); expect(s).not.toContain('Date.now('); });
});
