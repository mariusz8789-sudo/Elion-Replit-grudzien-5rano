import type { ExperimentDefinition, ModelCard, ResultDataset } from './contracts';

/**
 * PHYSICS WORLD — toy model registry, ported from the source bundle.
 *
 * Every card is `toy: true` and carries an explicit `disclosure` of what it
 * is NOT (no detector simulation, no quantum chemistry, no collider, no live
 * data). These are pipeline-validation models, not production physics — see
 * `contracts.ts`'s module header and docs/DECISIONS.md D-052. The numerical
 * methods below are ported as given by the source bundle; this pass does not
 * add, remove, or alter any physics.
 */

export const CARD_TRANSPORT: ModelCard = {
  modelId: 'M-TRANSPORT-001',
  modelVersion: '0.2.0',
  family: 'PARTICLE_TRANSPORT',
  backend: 'NATIVE_TOY',
  toy: true,
  validityDomain: 'charged heavy particle, 10-500 MeV, thin absorber',
  assumptions: [
    'mean dE/dx only (Bethe-like, K=0.307 MeV·cm²/mol, L=10 fixed)',
    'no straggling, no delta rays, no nuclear reactions',
    '1D path',
  ],
  knownLimitations: [
    'no fluctuation physics ⇒ uncertainty is MODEL error, not statistical',
    'Geant4 adapter is the production path',
  ],
  numericalMethod: 'explicit Euler, 200 steps',
  uncertaintyModel: '±5% model error (disclosed)',
  disclosure: 'TOY/TEST MODEL. NOT Geant4, NOT a detector simulation. Mean-loss pipeline validation only.',
};

export const CARD_ATOM: ModelCard = {
  modelId: 'M-ATOM-001',
  modelVersion: '0.2.0',
  family: 'MOLECULAR',
  backend: 'NATIVE_TOY',
  toy: true,
  validityDomain: 'diatomic van der Waals bond, classical regime',
  assumptions: ['Lennard-Jones 12-6', 'classical nuclei, no zero-point energy', 'velocity-Verlet, fixed dt'],
  knownLimitations: ['no quantum effects', 'no thermostat'],
  numericalMethod: 'velocity-Verlet',
  uncertaintyModel: 'energy drift over run',
  disclosure: 'TOY/TEST MODEL. NOT a quantum chemistry engine, NOT atom-accurate. External matter backend is the production path.',
};

export const CARD_COULOMB: ModelCard = {
  modelId: 'M-COUL-001',
  modelVersion: '0.2.0',
  family: 'PARTICLE_TRANSPORT',
  backend: 'NATIVE_TOY',
  toy: true,
  validityDomain: 'non-relativistic Rutherford scattering, point charges',
  assumptions: ['pure Coulomb, no screening', 'classical trajectories'],
  knownLimitations: ['no QM diffraction', 'non-relativistic'],
  numericalMethod: 'velocity-Verlet + analytic Rutherford cross-check',
  uncertaintyModel: '|numeric - analytic| angle delta',
  disclosure: 'TOY/TEST MODEL. Classical cross-check; analytic formula used ONLY as validation, never as result.',
};

export const CARD_HE: ModelCard = {
  modelId: 'M-HE-001',
  modelVersion: '0.2.0',
  family: 'HIGH_ENERGY',
  backend: 'NATIVE_TOY',
  toy: true,
  validityDomain: 'pipeline demo of event-detector-analysis chain',
  assumptions: ['isotropic 2-body decay in transverse plane', 'Breit-Wigner mass draw', 'Gaussian detector smearing'],
  knownLimitations: ['no matrix elements', 'no pile-up/trigger', 'no detector geometry'],
  numericalMethod: 'Monte Carlo, seeded',
  uncertaintyModel: 'sqrt(N) statistical on window fraction',
  disclosure: 'TOY/TEST MODEL. NOT PYTHIA, NOT Geant4, NOT a collider, NOT LHC, NOT a real detector. Validates chain only; PYTHIA/Geant4 adapters replace it in production.',
};

export type ModelRun = (def: ExperimentDefinition, rnd: () => number) => ResultDataset;

function P(def: ExperimentDefinition, name: string): number {
  const p = def.parameters.find((x) => x.name === name);
  if (!p) throw new Error(`missing param ${name}`);
  return p.value;
}

export const RUN_TRANSPORT: ModelRun = (def) => {
  const z = P(def, 'z');
  const E0 = P(def, 'E0_MeV');
  const Z = P(def, 'mat_Z');
  const A = P(def, 'mat_A');
  const rho = P(def, 'rho_g_cm3');
  const t = P(def, 'thickness_cm');
  const K = 0.307;
  const L = 10;
  const m = 938.0;
  let E = E0;
  const steps = 200;
  const dx = t / steps;
  const trace: number[] = [];
  for (let i = 0; i < steps && E > 0.5; i++) {
    const beta2 = Math.max(0.001, 1 - (m / (m + E)) ** 2);
    const dEdx = (K * z * z * (Z / A) * L) / beta2;
    E -= dEdx * rho * dx;
    trace.push(E);
  }
  return {
    observable: def.observable,
    unit: 'MeV',
    values: trace,
    summary: { residualEnergy: E, deposited: E0 - E },
    uncertainty: { residualEnergy: 0.05 * E, deposited: 0.05 * (E0 - E) },
  };
};

export const RUN_ATOM: ModelRun = (def) => {
  const eps = P(def, 'epsilon');
  const sig = P(def, 'sigma');
  const m = P(def, 'mass');
  const dt = P(def, 'dt');
  const steps = Math.floor(P(def, 'steps'));
  const force = (x: number): number => (24 * eps * (2 * (sig / x) ** 13 - (sig / x) ** 7)) / sig;
  const energy = (x: number, v: number): number => 0.5 * m * v * v + 4 * eps * ((sig / x) ** 12 - (sig / x) ** 6);
  let x = P(def, 'r0');
  let v = 0;
  const trace: number[] = [];
  const e0 = energy(x, v);
  for (let i = 0; i < steps; i++) {
    const a = force(x) / m;
    x += v * dt + 0.5 * a * dt * dt;
    const a2 = force(x) / m;
    v += 0.5 * (a + a2) * dt;
    trace.push(x);
  }
  const drift = Math.abs(energy(x, v) - e0);
  return {
    observable: def.observable,
    unit: 'sigma',
    values: trace,
    summary: { finalBond: x, energyDrift: drift },
    uncertainty: { finalBond: drift, energyDrift: drift },
  };
};

export const RUN_COULOMB: ModelRun = (def) => {
  const k = P(def, 'q1q2');
  const E = P(def, 'E');
  const b = P(def, 'b');
  const m = P(def, 'm');
  const v0 = Math.sqrt((2 * E) / m);
  let x = -50;
  let y = b;
  let vx = v0;
  let vy = 0;
  const dt = 0.05;
  const acc = (): { ax: number; ay: number } => {
    const r2 = x * x + y * y;
    const r = Math.sqrt(r2);
    const a = k / (m * r2);
    return { ax: (-a * x) / r, ay: (-a * y) / r };
  };
  let a = acc();
  for (let i = 0; i < 4000 && Math.hypot(x, y) < 200; i++) {
    x += vx * dt + 0.5 * a.ax * dt * dt;
    y += vy * dt + 0.5 * a.ay * dt * dt;
    const a2 = acc();
    vx += 0.5 * (a.ax + a2.ax) * dt;
    vy += 0.5 * (a.ay + a2.ay) * dt;
    a = a2;
  }
  const thetaNum = Math.atan2(vy, vx);
  const thetaAna = 2 * Math.atan(k / (2 * b * E));
  return {
    observable: def.observable,
    unit: 'rad',
    values: [thetaNum],
    summary: { thetaNumeric: thetaNum, thetaAnalytic: thetaAna, validationDelta: Math.abs(thetaNum - thetaAna) },
    uncertainty: { thetaNumeric: Math.abs(thetaNum - thetaAna) },
  };
};

export const RUN_HE: ModelRun = (def, rnd) => {
  const M = P(def, 'resonanceMass');
  const G = P(def, 'width');
  const N = Math.floor(P(def, 'nEvents'));
  const sDet = P(def, 'sigmaDetector');
  const gauss = (): number => {
    const u = Math.max(1e-9, rnd());
    const v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const masses: number[] = [];
  let inWin = 0;
  for (let i = 0; i < N; i++) {
    const u = Math.min(0.999, Math.max(0.001, rnd()));
    const mObs = Math.abs(M + 0.5 * G * Math.tan(Math.PI * (u - 0.5)) + sDet * gauss());
    masses.push(mObs);
    if (mObs >= 85 && mObs <= 95) inWin++;
  }
  const frac = inWin / N;
  return {
    observable: def.observable,
    unit: 'GeV',
    values: masses,
    summary: { nEvents: N, fractionInWindow: frac },
    uncertainty: { fractionInWindow: Math.sqrt((frac * (1 - frac)) / N) },
  };
};

export const MODEL_REGISTRY: Readonly<Record<string, { readonly card: ModelCard; readonly run: ModelRun }>> = {
  'M-TRANSPORT-001': { card: CARD_TRANSPORT, run: RUN_TRANSPORT },
  'M-ATOM-001': { card: CARD_ATOM, run: RUN_ATOM },
  'M-COUL-001': { card: CARD_COULOMB, run: RUN_COULOMB },
  'M-HE-001': { card: CARD_HE, run: RUN_HE },
};
