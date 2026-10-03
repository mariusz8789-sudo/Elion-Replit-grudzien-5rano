import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CODATA_2018, inverseLorentzGamma, lorentzGamma, ROUNDED_4_SIG, schwarzschildRadius } from './relativity.js';
import { clockComparison } from '../flagship/timeMachine.js';
import { spacetimePhoton } from '../flagship/spacetimePhoton.js';
import { lorentzGamma as frontendLorentzGamma, schwarzschildRadius as frontendSchwarzschildRadius, iscoFrequency } from '../../../frontend/src/core/physics.js';

const REPO = resolve(__dirname, '../../../..');

// The exact expressions that were hand-written in each file before U0-a.
const legacyGamma = (b: number) => 1 / Math.sqrt(1 - b * b);
const legacyGammaPow = (b: number) => 1 / Math.sqrt(1 - b ** 2);
const legacyInverse = (b: number) => Math.sqrt(1 - b * b);
const legacyRsRounded = (m: number) => (2 * 6.674e-11 * m) / (2.998e8 * 2.998e8);
const legacyRsCodata = (m: number) => (2 * 6.67430e-11 * m) / (299_792_458 * 299_792_458);

const BETAS = Array.from({ length: 2001 }, (_, i) => -0.9999 + (i * 1.9998) / 2000).concat([0, 0.6, 0.8, 0.99, 0.999999]);
const MASSES = [0, 1, 7.35e22, 5.972e24, 1.989e30, 1.98892e30, 1e31, 4e6 * 1.989e30, 6.5e9 * 1.989e30, 1e-8];

describe('U0-a: one Lorentz factor and one Schwarzschild radius, results unchanged', () => {
  it('lorentzGamma and 1/γ are bit-identical to every former hand-written copy', () => {
    for (const b of BETAS) {
      expect(Object.is(lorentzGamma(b), legacyGamma(b))).toBe(true);
      expect(Object.is(lorentzGamma(b), legacyGammaPow(b))).toBe(true);
      expect(Object.is(inverseLorentzGamma(b), legacyInverse(b))).toBe(true);
      expect(Object.is(frontendLorentzGamma(b), legacyGamma(b))).toBe(true);
    }
  });

  it('keeps the former behaviour outside |β| < 1 (callers guard input themselves)', () => {
    expect(lorentzGamma(1)).toBe(Infinity);
    expect(Number.isNaN(lorentzGamma(1.5))).toBe(true);
  });

  it('schwarzschildRadius is bit-identical with each constant set it replaced', () => {
    for (const m of MASSES) {
      expect(Object.is(schwarzschildRadius(m, ROUNDED_4_SIG), legacyRsRounded(m))).toBe(true);
      expect(Object.is(frontendSchwarzschildRadius(m), legacyRsRounded(m))).toBe(true);
      expect(Object.is(schwarzschildRadius(m, CODATA_2018), legacyRsCodata(m))).toBe(true);
    }
  });

  it('units: r_s in metres for mass in kilograms, against textbook values', () => {
    // Sun: r_s ≈ 2.95 km; Earth: ≈ 8.87 mm.
    expect(schwarzschildRadius(1.98892e30, CODATA_2018)).toBeCloseTo(2954, 0);
    expect(schwarzschildRadius(5.972e24, CODATA_2018) * 1000).toBeCloseTo(8.87, 2);
    expect(lorentzGamma(0.6)).toBeCloseTo(1.25, 12);
    expect(lorentzGamma(0.8)).toBeCloseTo(5 / 3, 12);
  });

  it('records how far the two constant sets differ (about 1e-4, kept on purpose)', () => {
    const rel = schwarzschildRadius(1.989e30, ROUNDED_4_SIG) / schwarzschildRadius(1.989e30, CODATA_2018) - 1;
    expect(Math.abs(rel)).toBeLessThan(2e-4);
    expect(Math.abs(rel)).toBeGreaterThan(1e-5);
  });

  it('flagship engines give the same numbers as before', () => {
    const r = clockComparison({ relativeSpeedMps: 7_660, gravitationalMassKg: 5.972e24, radiusM: 6_771_000, referenceRadiusM: 6_371_000, coordinateSeconds: 86_400 });
    const beta = 7_660 / 299_792_458;
    const rs = legacyRsCodata(5.972e24);
    const rate = (x: number) => Math.sqrt(Math.max(0, 1 - rs / x));
    expect(Object.is(r.lorentzGamma, legacyGamma(beta))).toBe(true);
    expect(Object.is(r.properSecondsMoving, 86_400 * (1 / legacyGamma(beta)) * rate(6_771_000))).toBe(true);
    const p = spacetimePhoton({ massKg: 1.98892e30, impactParameterM: 6.957e8, emitterDistanceM: 1.5e11, receiverDistanceM: 1.5e11 });
    expect(Object.is(p.schwarzschildRadiusM, legacyRsCodata(1.98892e30))).toBe(true);
    expect(p.deflectionArcsec).toBeCloseTo(1.75, 2); // Eddington 1919 value for the Sun's limb
  });

  it('the chirp model still uses the frontend lab constants', () => {
    const legacyIsco = (Mt: number) => { const M_kg = Mt * 1.989e30; return Math.pow(2.998e8, 3) / (Math.pow(6, 1.5) * Math.PI * 6.674e-11 * M_kg); };
    for (const m of [2.8, 10, 65]) expect(Object.is(iscoFrequency(m), legacyIsco(m))).toBe(true);
  });
});

// Guard: no new hand-written copy of either formula outside the shared module.
const SCAN_ROOTS = ['packages/frontend/src', 'packages/core/src', 'packages/ui/src'];
const ALLOWED = new Set([
  'packages/core/src/physics/relativity.ts',
  // CERN world: owned by the Human Explorer thread, consolidated only with its agreement.
  'packages/core/src/cern/BlackHoleEventHorizonEngine.ts',
]);
const GAMMA_COPY = /1\s*\/\s*Math\.sqrt\(\s*1\s*-\s*([\w.]+)\s*(\*\s*\1|\*\*\s*2)\s*\)/;
const RS_COPY = /\(\s*2\s*\*\s*[\w.]*G[\w.]*\s*\*\s*[\w.]+\s*\)\s*\/\s*\(\s*[\w.]*C[\w.]*\s*\*\s*[\w.]*C[\w.]*\s*\)/i;

function* sourceFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === '__tests__' || name === 'dist') continue;
      yield* sourceFiles(full);
    } else if (/\.(ts|tsx|mjs)$/.test(name) && !/\.test\.tsx?$/.test(name)) yield full;
  }
}

describe('U0-a guard', () => {
  it('no file re-implements γ or r_s outside physics/relativity.ts', () => {
    const offenders: string[] = [];
    for (const root of SCAN_ROOTS) {
      for (const file of sourceFiles(join(REPO, root))) {
        const rel = relative(REPO, file).replaceAll('\\', '/');
        if (ALLOWED.has(rel)) continue;
        const text = readFileSync(file, 'utf8');
        if (GAMMA_COPY.test(text) || RS_COPY.test(text)) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
