import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveWorld, generateUrbanGrid, ElasticComputeBridge, GenesisUrbanCyberEngine, HEAVY_THRESHOLD } from './GenesisUrbanCyberEngine.js';
const src = readFileSync(fileURLToPath(new URL('./GenesisUrbanCyberEngine.ts', import.meta.url)), 'utf8');
const clock = { t: 1000, now() { return this.t; } };
describe('world resolver', () => {
  it('deterministic same prompt+seed', () => { expect(resolveWorld('Warszawa 2029 Dubai style', 7).fingerprint).toBe(resolveWorld('Warszawa 2029 Dubai style', 7).fingerprint); });
  it('style extraction: Times Square -> NEON, Moon -> LUNAR, Dubai -> DUBAI', () => {
    expect(resolveWorld('Times Square neon billboards', 7).style).toBe('NEON_METROPOLIS');
    expect(resolveWorld('Moon base Alpha', 7).style).toBe('LUNAR_BASE');
    expect(resolveWorld('Warszawa przyszłości jak Dubaj', 7).style).toBe('DUBAI_FUTURIST'); });
  it('rain boosts reflectionIndex', () => { expect(resolveWorld('Nowy Jork Times Square w deszczu', 7).reflectionIndex).toBeGreaterThan(resolveWorld('Nowy Jork Times Square', 7).reflectionIndex); });
  it('label SYNTHETIC_URBAN_TWIN', () => { expect(resolveWorld('X', 7).dataLabel).toBe('SYNTHETIC_URBAN_TWIN'); });
});
describe('urban grid & neon generator', () => {
  it('deterministic grid', () => { const r = resolveWorld('Greenpoint Brooklyn retro', 7); expect(generateUrbanGrid(r, 24).fingerprint).toBe(generateUrbanGrid(r, 24).fingerprint); });
  it('neon density proportional to saturation (NEON > LUNAR)', () => {
    const neon = generateUrbanGrid(resolveWorld('Times Square neon', 7), 24).emitters.length;
    const lunar = generateUrbanGrid(resolveWorld('Moon base', 7), 24).emitters.length;
    expect(neon).toBeGreaterThan(lunar); });
  it('emitters carry 5D coords & valid schedule slots', () => { const g = generateUrbanGrid(resolveWorld('Times Square neon', 7), 24);
    expect(g.emitters.every(e => Number.isFinite(e.w) && e.scheduleSlot >= 0 && e.scheduleSlot < 8)).toBe(true); expect(g.emitters.length).toBeGreaterThan(0); });
});
describe('elastic compute bridge', () => {
  it('heavy job spawns+releases ephemeral HPC; light does not', () => {
    const b = new ElasticComputeBridge(clock); b.enqueue('heavy city', HEAVY_THRESHOLD * 2); b.enqueue('light profile', 10); const log = b.runQueue();
    expect(log.some(e => e.kind === 'SPAWN_HEAVY')).toBe(true); expect(log.some(e => e.kind === 'RELEASE_HEAVY')).toBe(true);
    expect(log.filter(e => e.kind === 'SPAWN_HEAVY').length).toBe(1); expect(b.heavyCurrentlyActive()).toBe(0); expect(b.getCost()).toBeGreaterThan(0); });
});
describe('cinematic package compiler', () => {
  it('duration<=180, 15s beats, 64-hex fingerprint, labels', () => {
    const pkg = new GenesisUrbanCyberEngine(clock, 7).pipeline('Warszawa 2029 Dubai style', 24);
    expect(pkg.durationSeconds).toBeLessThanOrEqual(180);
    expect(pkg.narratorScript[0].tEnd - pkg.narratorScript[0].tStart).toBe(15);
    expect(pkg.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(pkg.urbanLabel).toBe('SYNTHETIC_URBAN_TWIN'); expect(pkg.dataLabel).toBe('SYNTHETIC_CINEMATIC');
    expect(pkg.disclaimer).toContain('NOT a real city'); });
  it('pipeline deterministic', () => { const a = new GenesisUrbanCyberEngine(clock, 7).pipeline('X', 16); const b = new GenesisUrbanCyberEngine(clock, 7).pipeline('X', 16); expect(a.fingerprint).toBe(b.fingerprint); });
});
describe('iron rules', () => { it('no Math.random/Date.now', () => { expect(src).not.toContain('Math.random('); expect(src).not.toContain('Date.now('); }); });
