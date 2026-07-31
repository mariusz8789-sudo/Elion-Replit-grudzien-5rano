import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runModel, listModels, getModel, validateInputs } from './compute/engine.mjs';
import { openDatabase, saveRun, getRun, listRuns, createUser, createProject } from './store.mjs';
import { hashPassword } from './auth.mjs';

/**
 * Backend Compute Engine — testy referencyjne (znane wartości + tolerancje),
 * NIE tylko pokrycie. Potwierdzają, że serwer liczy tę samą, poprawną fizykę co
 * frontend (wspólny bundle) oraz że walidacja, prowieniencja i persystencja
 * przebiegów działają.
 */

function near(actual, expected, relTol = 0.01) {
  const tol = Math.max(Math.abs(expected) * relTol, 1e-6);
  assert.ok(Math.abs(actual - expected) <= tol, `oczekiwano ~${expected}, otrzymano ${actual}`);
}

describe('registry', () => {
  test('lists models with required metadata (id/version/units/provenance)', () => {
    const models = listModels();
    assert.ok(models.length >= 10);
    for (const m of models) {
      assert.ok(m.id && m.name && m.domain && m.version, `metadane: ${m.id}`);
      assert.ok(Array.isArray(m.inputs) && Array.isArray(m.outputs));
      assert.ok(m.outputs.every((o) => typeof o.unit === 'string'));
      assert.ok(m.provenance && m.provenance.formula, `prowieniencja: ${m.id}`);
      assert.equal(typeof m.deterministic, 'boolean');
      assert.equal(m.backendExecutable, true);
    }
  });
});

describe('reference calculations (known scientific values)', () => {
  test('nuclear-semf Fe-56 → ~8.9 MeV/nucleon (SEMF, shell-free)', () => {
    const r = runModel('nuclear-semf', { protonNumber: 26, neutronNumber: 30 });
    assert.equal(r.status, 'ok');
    assert.equal(r.outputs.massNumber, 56);
    near(r.outputs.bindingPerNucleon, 8.896, 0.02);
    assert.equal(r.units.bindingPerNucleon, 'MeV');
  });
  test('atom-bohr hydrogen ground state → −13.606 eV', () => {
    const r = runModel('atom-bohr', { atomicNumber: 1, principalN: 1 });
    near(r.outputs.energyLevelEV, -13.606, 0.001);
  });
  test('sr-lorentz β=0.8 → γ=1.6667', () => {
    near(runModel('sr-lorentz', { velocityFraction: 0.8 }).outputs.lorentzGammaFactor, 1.66667, 0.001);
  });
  test('universe-kepler M=1,a=1 → 1.0 yr', () => {
    near(runModel('universe-kepler', { centralMassSolar: 1, orbitalRadiusAu: 1 }).outputs.orbitalPeriodYears, 1.0, 0.01);
  });
  test('universe-atmospheric-escape Earth → ~255 K, ~11.19 km/s, λ≥15 no warning', () => {
    const r = runModel('universe-atmospheric-escape', {});
    near(r.outputs.equilibriumTempK, 255, 0.05);
    near(r.outputs.escapeVelocityMs, 11186, 0.02);
    assert.equal(r.warnings.length, 0);
  });
  test('universe-atmospheric-escape hot low-gravity → λ warning fires', () => {
    const r = runModel('universe-atmospheric-escape', { orbitalDistanceAu: 0.2, planetMassEarth: 0.2, planetRadiusEarth: 0.6, moleculeMassAmu: 2 });
    assert.ok(r.warnings.length >= 1, 'oczekiwano ostrzeżenia o niskim λ');
  });
  test('particle relativistic energy electron @0.866c → ~1.022 MeV', () => {
    near(runModel('particle-relativistic-energy', { restMassMeV: 0.511, velocityFraction: 0.866 }).outputs.totalEnergyMeV, 1.022, 0.01);
  });
  test('math-gaussian N(0,1) at x=1 → pdf=0.24197, P(|z|<1)=0.6827', () => {
    const r = runModel('math-gaussian', { mean: 0, sigma: 1, xValue: 1 });
    near(r.outputs.pdfValue, 0.24197, 0.01); // f(1)=e^-0.5/√(2π)
    near(r.outputs.probWithinZ, 0.6827, 0.01);
    // iconic peak: f(0)=1/√(2π)
    near(runModel('math-gaussian', { mean: 0, sigma: 1, xValue: 0 }).outputs.pdfValue, 0.39894, 0.01);
  });
  test('einstein-schwarzschild 1 M☉ → ~2953 m', () => {
    near(runModel('einstein-schwarzschild', { massSolar: 1 }).outputs.radiusMeters, 2953, 0.01);
  });
  test('einstein-chirp-mass 30+30 M☉ → ℳ≈26.1', () => {
    near(runModel('einstein-chirp-mass', { m1Solar: 30, m2Solar: 30 }).outputs.chirpMassSolar, 26.1, 0.02);
  });
  test('civilization-kardashev type I → 1e16 W', () => {
    near(runModel('civilization-kardashev', { kardashevType: 1 }).outputs.powerWatts, 1e16, 0.001);
  });
  test('chemistry-arrhenius returns finite positive rate + higher rate at higher T', () => {
    const cold = runModel('chemistry-arrhenius', { temperatureK: 298, activationEnergyKJ: 50 });
    const hot = runModel('chemistry-arrhenius', { temperatureK: 400, activationEnergyKJ: 50 });
    assert.ok(cold.outputs.rateConstant > 0 && Number.isFinite(cold.outputs.rateConstant));
    assert.ok(hot.outputs.rateConstant > cold.outputs.rateConstant, 'Arrhenius: wyższa T → wyższe k');
  });
  test('biology-logistic stays within (N0, K) and rises over time', () => {
    const r = runModel('biology-logistic', { growthRate: 0.5, carryingCapacity: 1000, initialPopulation: 10, timeElapsed: 10 });
    assert.ok(r.outputs.populationAtT > 10 && r.outputs.populationAtT < 1000);
  });
});

describe('run schema + provenance', () => {
  test('ok run carries full provenance contract', () => {
    const r = runModel('nuclear-semf', { protonNumber: 8, neutronNumber: 8 });
    for (const k of ['runId', 'modelId', 'modelVersion', 'domain', 'status', 'inputs', 'outputs', 'units', 'warnings', 'validity', 'assumptions', 'provenance', 'deterministic', 'durationMs', 'engine']) {
      assert.ok(k in r, `brak pola ${k}`);
    }
    assert.match(r.runId, /^[0-9a-f-]{36}$/);
    assert.equal(r.deterministic, true);
  });
  test('seed is recorded (passthrough for deterministic models)', () => {
    assert.equal(runModel('sr-lorentz', { velocityFraction: 0.5 }, { seed: 42 }).seed, 42);
  });
});

describe('validation', () => {
  test('unknown model → status error', () => {
    const r = runModel('does-not-exist', {});
    assert.equal(r.status, 'error');
    assert.equal(r.error, 'unknown_model');
  });
  test('unknown parameter → rejected', () => {
    const r = runModel('sr-lorentz', { velocityFraction: 0.5, bogusParam: 1 });
    assert.equal(r.status, 'rejected');
    assert.equal(r.error, 'unknown_parameter');
  });
  test('out-of-range parameter → rejected', () => {
    const r = runModel('sr-lorentz', { velocityFraction: 2 });
    assert.equal(r.status, 'rejected');
    assert.equal(r.error, 'out_of_range');
  });
  test('missing input uses declared default', () => {
    const r = runModel('atom-bohr', {}); // defaults Z=1,n=1
    assert.equal(r.status, 'ok');
    near(r.outputs.energyLevelEV, -13.606, 0.001);
  });
  test('validateInputs rejects non-finite', () => {
    assert.equal(validateInputs(getModel('sr-lorentz'), { velocityFraction: NaN }).ok, false);
  });
});

describe('run persistence (store)', () => {
  test('saveRun/getRun/listRuns round-trip with provenance', () => {
    const db = openDatabase();
    const u = createUser(db, { email: 'sci@lab.org', displayName: 'Sci', passwordHash: hashPassword('password123') });
    const p = createProject(db, { name: 'Compute', ownerId: u.id });
    const run = runModel('nuclear-semf', { protonNumber: 26, neutronNumber: 30 });
    saveRun(db, run, { userId: u.id, projectId: p.id });
    const got = getRun(db, run.runId);
    assert.equal(got.modelId, 'nuclear-semf');
    near(got.outputs.bindingPerNucleon, 8.896, 0.02);
    assert.equal(got.provenance.formula.length > 0, true);
    assert.equal(listRuns(db, p.id).length, 1);
  });
});
