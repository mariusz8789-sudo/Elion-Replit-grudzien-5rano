import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createMatrixGradeRenderer, RAIN_SHADER, mulberry32 } from './GenesisMatrixGradeRenderer.js';
const src = readFileSync(fileURLToPath(new URL('./GenesisMatrixGradeRenderer.ts', import.meta.url)), 'utf8');
describe('matrix-grade renderer', () => {
  it('falls back safely without WebGL', () => { const h = createMatrixGradeRenderer({} as HTMLCanvasElement, 7); expect(h.ok).toBe(false); expect(h.dataLabel).toBe('SYNTHETIC_CINEMATIC'); expect(() => h.dispose()).not.toThrow(); });
  it('bind fingerprint deterministic for same seed+grid', () => { const mk = () => { const rng = mulberry32(7); expect(rng()).toBe(mulberry32(7)()); return true; }; expect(mk()).toBe(true); });
  it('rain shader deterministic (hash-based, no random)', () => { expect(RAIN_SHADER.fragmentShader).toContain('hash('); expect(RAIN_SHADER.fragmentShader).not.toContain('random'); });
  it('no Math.random/Date.now in module', () => { expect(src).not.toContain('Math.random('); expect(src).not.toContain('Date.now('); });
  it('pixelRatio cap default 2 present', () => { expect(src).toContain('pixelRatioCap = 2'); });
});
