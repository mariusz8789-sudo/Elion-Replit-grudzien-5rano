import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { generateBeyondLand, GenesisIceWallBeyondEngine } from './GenesisIceWallBeyondEngine.js';
const src = readFileSync(fileURLToPath(new URL('./GenesisIceWallBeyondEngine.ts', import.meta.url)), 'utf8');
const clock = { t: 1000, now() { return this.t; } };
describe('ice-wall beyond engine', () => {
  it('same seed -> identical fingerprint', () => { expect(generateBeyondLand(7, 32).fingerprint).toBe(generateBeyondLand(7, 32).fingerprint); });
  it('different seed -> different fingerprint', () => { expect(generateBeyondLand(7, 32).fingerprint).not.toBe(generateBeyondLand(8, 32).fingerprint); });
  it('biomes include ice-shelf rim & anomaly class', () => { const m = generateBeyondLand(7, 48); expect(m.biome).toContain('ICE_SHELF'); expect(m.biome.some(b => b === 'UNKNOWN_MAGNETIC' || b === 'VOLCANIC')).toBe(true); });
  it('label SYNTHETIC_GEO_EXPLORATION', () => { expect(generateBeyondLand(7, 16).dataLabel).toBe('SYNTHETIC_GEO_EXPLORATION'); });
  it('expedition ledger chain verifies', () => { const e = new GenesisIceWallBeyondEngine(clock, 7); e.explore('Terra Incognita A'); e.explore('Terra B'); expect(e.verifyLedger().ok).toBe(true); expect(e.getLedger().length).toBe(2); });
});
describe('iron rules', () => { it('no Math.random/Date.now', () => { expect(src).not.toContain('Math.random('); expect(src).not.toContain('Date.now('); }); });
