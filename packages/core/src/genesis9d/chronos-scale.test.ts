import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { epochProfile, snapYear, eraOf, GenesisChronosScaleEngine, MIN_YEAR, MAX_YEAR } from './GenesisChronosScaleEngine.js';
const src = readFileSync(fileURLToPath(new URL('./GenesisChronosScaleEngine.ts', import.meta.url)), 'utf8');
const clock = { t: 1000, now() { return this.t; } };
describe('chronos scale engine', () => {
  it('snaps past to 1000y and future to 50y', () => { expect(snapYear(-3450)).toBe(-4000); expect(snapYear(2060)).toBe(2075); expect(snapYear(2099)).toBe(2099); });
  it('clamps to bounds', () => { expect(snapYear(-99999)).toBe(MIN_YEAR); expect(snapYear(99999)).toBe(MAX_YEAR); });
  it('era mapping', () => { expect(eraOf(-3000)).toBe('DEEP_HISTORY'); expect(eraOf(1999)).toBe('MODERN'); expect(eraOf(2049)).toBe('NEAR_FUTURE'); expect(eraOf(2099)).toBe('FUTURE_2099'); });
  it('deterministic profile & metrics bounded', () => { const a = epochProfile(2049); const b = epochProfile(2049); expect(a.fingerprint).toBe(b.fingerprint); expect(a.civilizationDensity).toBeGreaterThanOrEqual(0); expect(a.techLevel).toBeLessThanOrEqual(1); });
  it('jump ledger verifies', () => { const e = new GenesisChronosScaleEngine(clock); e.jump(-3000); e.jump(2099); expect(e.verifyLedger().ok).toBe(true); });
});
describe('iron rules', () => { it('no Math.random/Date.now', () => { expect(src).not.toContain('Math.random('); expect(src).not.toContain('Date.now('); }); });
