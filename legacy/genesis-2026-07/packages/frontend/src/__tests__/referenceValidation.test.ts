/**
 * Reference validation — Genesis vs. published values.
 *
 * Every other test in this repo asks "does the code do what the code says?".
 * This one asks the only question an outside scientist cares about: "do the
 * numbers agree with the literature?"
 *
 * It drives the SAME path the UI drives (evaluateCandidate → the executable
 * Model Graph → core/physics), so a passing run is a statement about the
 * product, not about a test fixture. No new physics is defined here; this file
 * only supplies published reference values and measures the deviation.
 *
 * Reference sources:
 *  - Planetary bodies: NASA Planetary Fact Sheets (Bond albedo, semi-major
 *    axis, black-body temperature, mass, radius, escape velocity).
 *  - Nuclides: experimental binding energy per nucleon from the AME atomic
 *    mass evaluation, as tabulated in standard nuclear-physics texts.
 *
 * Crucially, this file also pins the model's KNOWN FAILURES (§ "documented
 * limits"). A simplified model that is silently wrong is worthless; a
 * simplified model whose error envelope is measured and asserted is usable.
 *
 * To print the comparison tables:  npm run validate:physics
 */
import { describe, expect, it } from 'vitest';
import { evaluateCandidate } from '../core/cde/passport';
import { getAdapter } from '../core/cde/adapters';

const atmos = getAdapter('atmospheric-habitability')!;
const nuclear = getAdapter('nuclear-stability')!;

/** Deviation report line, printed so the numbers can be read off a CI log. */
function report(rows: Array<Record<string, string | number>>, title: string) {
  const keys = Object.keys(rows[0]);
  const w = keys.map((k) => Math.max(k.length, ...rows.map((r) => String(r[k]).length)));
  const line = (cells: Array<string | number>) => '| ' + cells.map((c, i) => String(c).padEnd(w[i])).join(' | ') + ' |';
  // eslint-disable-next-line no-console
  console.log(['', `### ${title}`, line(keys), '|' + w.map((n) => '-'.repeat(n + 2)).join('|') + '|',
    ...rows.map((r) => line(keys.map((k) => r[k])))].join('\n'));
}

// ---------------------------------------------------------------------------
// 1. Planetary equilibrium temperature  T_eq = 278.5·((1−A)·L/a²)^¼
// ---------------------------------------------------------------------------

/** name, Bond albedo, semi-major axis [AU], NASA black-body temperature [K]. */
const BODIES = [
  { name: 'Mercury', albedo: 0.068, au: 0.387, tRef: 440.1, mass: 0.0553, radius: 0.3829, vEscRef: 4.3 },
  { name: 'Venus', albedo: 0.770, au: 0.723, tRef: 226.6, mass: 0.815, radius: 0.9499, vEscRef: 10.36 },
  { name: 'Earth', albedo: 0.306, au: 1.000, tRef: 254.0, mass: 1.0, radius: 1.0, vEscRef: 11.19 },
  { name: 'Moon', albedo: 0.110, au: 1.000, tRef: 270.6, mass: 0.0123, radius: 0.2727, vEscRef: 2.38 },
  { name: 'Mars', albedo: 0.250, au: 1.524, tRef: 209.8, mass: 0.107, radius: 0.5320, vEscRef: 5.03 },
  { name: 'Jupiter', albedo: 0.343, au: 5.204, tRef: 110.0, mass: 317.8, radius: 11.209, vEscRef: 59.5 },
] as const;

const bodyParams = (b: (typeof BODIES)[number], moleculeMassAmu = 28) => ({
  stellarLuminositySolar: 1, orbitalDistanceAu: b.au, planetAlbedo: b.albedo,
  planetMassEarth: b.mass, planetRadiusEarth: b.radius, moleculeMassAmu,
});

describe('equilibrium temperature vs. NASA black-body temperature', () => {
  it('reproduces all six Solar-System bodies to better than 0.5 K', () => {
    const rows = BODIES.map((b) => {
      const t = evaluateCandidate(atmos, { params: bodyParams(b) }).outputs.equilibriumTempK;
      return { body: b.name, genesis_K: t.toFixed(1), published_K: b.tRef.toFixed(1), delta_K: (t - b.tRef).toFixed(2) };
    });
    report(rows, 'Equilibrium temperature [K] — Genesis vs NASA');
    for (const b of BODIES) {
      const t = evaluateCandidate(atmos, { params: bodyParams(b) }).outputs.equilibriumTempK;
      expect(Math.abs(t - b.tRef), `${b.name} T_eq`).toBeLessThan(0.5);
    }
  });

  it('scales as the inverse square root of orbital distance', () => {
    const at = (au: number) => evaluateCandidate(atmos, { params: { ...bodyParams(BODIES[2]), orbitalDistanceAu: au } }).outputs.equilibriumTempK;
    // T ∝ a^(−1/2): quadrupling the distance must halve the temperature.
    expect(at(4) / at(1)).toBeCloseTo(0.5, 6);
  });
});

// ---------------------------------------------------------------------------
// 2. Escape velocity  v_esc = √(2GM/R)
// ---------------------------------------------------------------------------

describe('escape velocity vs. published values', () => {
  it('reproduces all six bodies to better than 1.5 %', () => {
    const rows = BODIES.map((b) => {
      const v = evaluateCandidate(atmos, { params: bodyParams(b) }).outputs.escapeVelocityMs / 1000;
      return { body: b.name, genesis_kms: v.toFixed(2), published_kms: b.vEscRef.toFixed(2), error_pct: (((v - b.vEscRef) / b.vEscRef) * 100).toFixed(2) };
    });
    report(rows, 'Escape velocity [km/s] — Genesis vs published');
    for (const b of BODIES) {
      const v = evaluateCandidate(atmos, { params: bodyParams(b) }).outputs.escapeVelocityMs / 1000;
      expect(Math.abs(v - b.vEscRef) / b.vEscRef, `${b.name} v_esc`).toBeLessThan(0.015);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. SEMF binding energy per nucleon vs. experimental (AME) values
// ---------------------------------------------------------------------------

/** Z, N, experimental B/A [MeV/nucleon]. */
const NUCLIDES = [
  { name: 'He-4', z: 2, n: 2, ref: 7.074 },
  { name: 'C-12', z: 6, n: 6, ref: 7.680 },
  { name: 'O-16', z: 8, n: 8, ref: 7.976 },
  { name: 'Ca-40', z: 20, n: 20, ref: 8.551 },
  { name: 'Fe-56', z: 26, n: 30, ref: 8.790 },
  { name: 'Ni-62', z: 28, n: 34, ref: 8.795 },
  { name: 'Zr-90', z: 40, n: 50, ref: 8.710 },
  { name: 'Sn-120', z: 50, n: 70, ref: 8.504 },
  { name: 'Pb-208', z: 82, n: 126, ref: 7.867 },
  { name: 'U-238', z: 92, n: 146, ref: 7.570 },
] as const;

const bindingPerNucleon = (z: number, n: number) =>
  evaluateCandidate(nuclear, { params: { protonNumber: z, neutronNumber: n } }).outputs.bindingPerNucleon;

describe('SEMF binding energy per nucleon vs. experiment', () => {
  it('agrees with AME values within the semi-empirical model’s stated accuracy', () => {
    const rows = NUCLIDES.map((x) => {
      const b = bindingPerNucleon(x.z, x.n);
      return { nuclide: x.name, A: x.z + x.n, genesis_MeV: b.toFixed(3), experiment_MeV: x.ref.toFixed(3), delta_MeV: (b - x.ref).toFixed(3) };
    });
    report(rows, 'Binding energy per nucleon [MeV] — SEMF vs experiment');

    // Medium and heavy nuclei (A ≥ 40): the regime the liquid-drop model is for.
    for (const x of NUCLIDES.filter((y) => y.z + y.n >= 40)) {
      expect(Math.abs(bindingPerNucleon(x.z, x.n) - x.ref), `${x.name} B/A`).toBeLessThan(0.15);
    }
  });

  it('reproduces the iron peak — the boundary between fusion and fission yield', () => {
    // Scan the β-stability valley and locate the maximum of B/A.
    let best = { a: 0, ba: 0 };
    for (let z = 2; z <= 100; z++) {
      for (let n = z; n <= Math.min(1.6 * z + 8, 160); n++) {
        const ba = bindingPerNucleon(z, n);
        if (ba > best.ba) best = { a: z + n, ba };
      }
    }
    // eslint-disable-next-line no-console
    console.log(`\n  SEMF maximum of B/A: ${best.ba.toFixed(3)} MeV at A = ${best.a} (experiment: 8.795 MeV at A = 62, Ni-62)`);
    expect(best.ba).toBeGreaterThan(8.5);
    expect(best.ba).toBeLessThan(9.0);
    expect(best.a).toBeGreaterThan(40);
    expect(best.a).toBeLessThan(90);
  });
});

// ---------------------------------------------------------------------------
// 4. Documented limits — where the model is KNOWN to be wrong.
//
// These assertions are the point of the file. Each one pins a deviation that
// is real, physically explained, and disclosed in the adapter's honestyNote.
// If a future change silently "fixes" one of these without adding the missing
// physics, this suite fails — which is exactly what should happen.
// ---------------------------------------------------------------------------

describe('documented limits of the simplified models', () => {
  it('SEMF misses light nuclei because it has no shell structure', () => {
    // He-4 and C-12 are doubly magic / α-clustered. The liquid-drop model has
    // no shells, so it must fail here — and the failure must stay visible.
    const he4 = Math.abs(bindingPerNucleon(2, 2) - 7.074);
    const c12 = Math.abs(bindingPerNucleon(6, 6) - 7.680);
    // eslint-disable-next-line no-console
    console.log(`\n  Light-nucleus deviation: He-4 ${he4.toFixed(3)} MeV, C-12 ${c12.toFixed(3)} MeV (shell effects absent from SEMF)`);
    expect(he4).toBeGreaterThan(0.5);
  });

  it('Jeans escape uses T_eq, not the exobase temperature, so λ is optimistic', () => {
    // Earth actually loses hydrogen: at the ~1000 K exobase λ_H ≈ 7 (< 15).
    // Evaluated at T_eq ≈ 254 K the model reports a much larger λ and would
    // wrongly conclude "retained". Recorded here so the gap cannot be forgotten.
    const lambdaH2 = evaluateCandidate(atmos, { params: bodyParams(BODIES[2], 2) }).outputs.jeansParameter;
    // eslint-disable-next-line no-console
    console.log(`\n  Earth + H2 at T_eq: lambda = ${lambdaH2.toFixed(1)} (model: retained) — reality: Earth loses hydrogen, exobase lambda ~7`);
    expect(lambdaH2).toBeGreaterThan(15);
  });

  it('the Moon passes the thermal criterion yet has no atmosphere', () => {
    // Thermal (Jeans) escape is not the dominant loss channel for the Moon;
    // there is no source and non-thermal losses dominate. The criterion is
    // necessary, never sufficient — which is what the passport claims.
    const p = evaluateCandidate(atmos, { params: bodyParams(BODIES[3], 28) });
    // eslint-disable-next-line no-console
    console.log(`  Moon + N2: lambda = ${p.outputs.jeansParameter.toFixed(1)} (model: retained) — reality: no atmosphere`);
    expect(p.outputs.jeansParameter).toBeGreaterThan(15);
  });

  it('Earth with N2 is retained — the case the model does get right', () => {
    const p = evaluateCandidate(atmos, { params: bodyParams(BODIES[2], 28) });
    expect(p.outputs.jeansParameter).toBeGreaterThan(100);
    expect(p.accepted).toBe(true);
  });
});
