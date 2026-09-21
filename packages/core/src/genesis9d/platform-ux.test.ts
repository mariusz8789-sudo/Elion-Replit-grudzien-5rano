import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GenesisPlatformUXEnvironment, AMBIENT_TRACKS, NAV_OPTIONS } from './GenesisPlatformUXEnvironment.js';
const src = readFileSync(fileURLToPath(new URL('./GenesisPlatformUXEnvironment.ts', import.meta.url)), 'utf8');
const clock = { t: 1000, now() { return this.t; } };
describe('platform UX environment', () => {
  it('attachment parse deterministic & hashed', () => { const a = new GenesisPlatformUXEnvironment(clock, 7).addAttachment('ZIP', 'docs.zip', 1024, 'ab'.repeat(32)); const b = new GenesisPlatformUXEnvironment(clock, 7).addAttachment('ZIP', 'docs.zip', 1024, 'ab'.repeat(32)); expect(a.parsedEntries).toEqual(b.parsedEntries); expect(a.sha256).toBe(b.sha256); });
  it('volume clamped to [-36,-12]', () => { const e = new GenesisPlatformUXEnvironment(clock, 7); e.setVolume(0); expect(e.state().volumeDb).toBe(-12); e.setVolume(-99); expect(e.state().volumeDb).toBe(-36); });
  it('track & option selection validated', () => { const e = new GenesisPlatformUXEnvironment(clock, 7); e.setTrack('TR-BACH'); e.selectOption('OP-FREE'); expect(e.state().currentTrackId).toBe('TR-BACH'); expect(e.state().selectedOptionId).toBe('OP-FREE'); e.setTrack('NOPE'); expect(e.state().currentTrackId).toBe('TR-BACH'); });
  it('playlist order deterministic permutation of tracks', () => { const e = new GenesisPlatformUXEnvironment(clock, 7); const o = e.playlistOrder(); expect(o.length).toBe(AMBIENT_TRACKS.length); expect([...o].sort()).toEqual(AMBIENT_TRACKS.map(t => t.id).sort()); });
  it('state fingerprint deterministic', () => { const mk = () => { const e = new GenesisPlatformUXEnvironment(clock, 7); e.addAttachment('PDF', 'a.pdf', 10, 'cd'.repeat(32)); e.togglePlay(); return e.fingerprint(); }; expect(mk()).toBe(mk()); });
  it('options include government & agent groups', () => { expect(NAV_OPTIONS.some(o => o.group === 'GOVERNMENT')).toBe(true); expect(NAV_OPTIONS.some(o => o.group === 'AGENT')).toBe(true); });
});
describe('iron rules', () => { it('no Math.random/Date.now', () => { expect(src).not.toContain('Math.random('); expect(src).not.toContain('Date.now('); }); });
