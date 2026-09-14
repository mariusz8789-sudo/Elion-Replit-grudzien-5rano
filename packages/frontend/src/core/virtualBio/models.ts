import type { BioExperimentDefinition, BioModelCard, BioResult } from './contracts';

/**
 * VIRTUAL BIO — toy model registry, ported from the source bundle.
 *
 * Every card is `toy: true` and carries an explicit `disclosure` of what it
 * is NOT (wet-lab, animal, human data, medical advice). These are
 * pipeline-validation / hypothesis-generation models, not production
 * biological evidence — see `contracts.ts`'s module header and
 * docs/DECISIONS.md D-054. The numerical methods below are ported as given
 * by the source bundle; this pass does not add, remove, or alter the
 * underlying math.
 */

export const CARD_CELL: BioModelCard = {
  modelId: 'B-CELL-001',
  modelVersion: '0.1.0',
  family: 'CELL_POPULATION',
  toy: true,
  validityDomain: 'in-silico monolayer, dose-response over 0-72 h',
  assumptions: ['log-kill + Hill dose-response', '2 subpopulations: sensitive S and resistant R', 'logistic growth, fixed carrying capacity K'],
  knownLimitations: ['no metabolism/immune system', 'no PK — dose = fixed concentration'],
  numericalMethod: 'Euler, dt=1 h',
  uncertaintyModel: '+/-10% model error (disclosed)',
  disclosure: 'TOY/TEST MODEL. NOT wet-lab, NOT animal, NOT human data, NOT medical advice. Hypothesis generation only.',
};

export const CARD_PBPK: BioModelCard = {
  modelId: 'B-PBPK-001',
  modelVersion: '0.1.0',
  family: 'PBPK',
  toy: true,
  validityDomain: '3-compartment virtual human (gut -> plasma -> tissue), single dose',
  assumptions: ['linear elimination', 'first-order ka and kt'],
  knownLimitations: ['no protein binding', 'no metabolites'],
  numericalMethod: 'Euler, dt=0.1 h',
  uncertaintyModel: '+/-15% model error (disclosed)',
  disclosure: 'TOY/TEST MODEL. NOT a physiological human model, NOT dosing guidance, NOT medical advice.',
};

export const CARD_RECEPTOR: BioModelCard = {
  modelId: 'B-RECEPTOR-001',
  modelVersion: '0.1.0',
  family: 'RECEPTOR',
  toy: true,
  validityDomain: 'occupancy -> effect: analgesia vs respiratory depression (Hill curves with different thresholds)',
  assumptions: ['occupancy = C/(KD+C)', 'respiratory depression has a higher cooperativity threshold'],
  knownLimitations: ['no tolerance/dependence over time', 'no pharmacokinetics'],
  numericalMethod: 'analytic Hill curves',
  uncertaintyModel: '+/-10% model error (disclosed)',
  disclosure: 'TOY/TEST MODEL. NOT opioid safety evidence, NOT clinical guidance, NOT medical advice. G2 demonstrator only.',
};

export const CARD_AMR: BioModelCard = {
  modelId: 'B-AMR-001',
  modelVersion: '0.1.0',
  family: 'AMR',
  toy: true,
  validityDomain: 'bacterial population under antibiotic pressure, mutant prevention window',
  assumptions: ['resistant mutants present from t=0 (fraction f0)', 'resistance = MIC increase by mult'],
  knownLimitations: ['no horizontal gene transfer', 'no biofilm'],
  numericalMethod: 'Euler, dt=1 h',
  uncertaintyModel: '+/-10% model error (disclosed)',
  disclosure: 'TOY/TEST MODEL. NOT an epidemiological forecast, NOT a clinical protocol. G3 public-health hypothesis generator only.',
};

export type BioRun = (def: BioExperimentDefinition) => BioResult;

function P(def: BioExperimentDefinition, name: string): number {
  const p = def.parameters.find((x) => x.name === name);
  if (!p) throw new Error(`missing ${name}`);
  return p.value;
}

export const RUN_CELL: BioRun = (def) => {
  const dose = P(def, 'dose_uM');
  const ic50 = P(def, 'IC50_uM');
  const h = P(def, 'hillN');
  const kill = P(def, 'killRate');
  const g = P(def, 'growthRate');
  const steps = Math.floor(P(def, 'steps_h'));
  const f0 = P(def, 'resistFraction0');
  const mult = P(def, 'resistIC50_mult');
  const K = 1e6;
  let S = K * (1 - f0);
  let R = K * f0;
  const viab: number[] = [];
  const eff = (ic: number): number => Math.pow(dose, h) / (Math.pow(ic, h) + Math.pow(dose, h));
  for (let t = 0; t < steps; t++) {
    const load = (S + R) / K;
    S += S * (g * (1 - load) - kill * eff(ic50));
    R += R * (g * (1 - load) - kill * eff(ic50 * mult));
    S = Math.max(0, S);
    R = Math.max(0, R);
    viab.push((S + R) / K);
  }
  const vf = viab[viab.length - 1] ?? 0;
  return {
    observable: def.observable,
    unit: 'fraction',
    values: viab,
    summary: { viabilityFinal: vf, resistantFractionFinal: vf > 0 ? R / (S + R) : 0 },
    uncertainty: { viabilityFinal: 0.1 * vf },
  };
};

export const RUN_PBPK: BioRun = (def) => {
  const dose = P(def, 'dose_mg');
  const ka = P(def, 'ka_per_h');
  const ke = P(def, 'ke_per_h');
  const kt = P(def, 'kt_per_h');
  const Vd = P(def, 'Vd_L');
  const steps = Math.floor(P(def, 'steps_h'));
  let gut = dose;
  let plasma = 0;
  let tissue = 0;
  const conc: number[] = [];
  let cmax = 0;
  let tmax = 0;
  let auc = 0;
  for (let t = 0; t < steps * 10; t++) {
    const dt = 0.1;
    const a = ka * gut * dt;
    gut -= a;
    plasma += a - (ke + kt) * plasma * dt;
    tissue += kt * plasma * dt;
    const c = plasma / Vd;
    conc.push(c);
    auc += c * dt;
    if (c > cmax) {
      cmax = c;
      tmax = t * dt;
    }
  }
  void tissue;
  return {
    observable: def.observable,
    unit: 'mg/L',
    values: conc,
    summary: { Cmax: cmax, Tmax_h: tmax, AUC: auc },
    uncertainty: { Cmax: 0.15 * cmax, AUC: 0.15 * auc },
  };
};

export const RUN_RECEPTOR: BioRun = (def) => {
  const kd = P(def, 'KD_nM');
  const nA = P(def, 'hillAnalgesia');
  const nR = P(def, 'hillRespiratory');
  const cs = [1, 3, 10, 30, 100, 300, 1000];
  const anal: number[] = [];
  const resp: number[] = [];
  for (const c of cs) {
    const occ = c / (kd + c);
    anal.push(Math.pow(occ, nA));
    resp.push(Math.pow(occ, nR));
  }
  const ed = (arr: number[], thr: number): number => cs.find((_, i) => (arr[i] ?? 0) >= thr) ?? NaN;
  const eA = ed(anal, 0.5);
  const eR = ed(resp, 0.5);
  return {
    observable: def.observable,
    unit: 'index',
    values: anal,
    // therapeuticIndexToy: a TOY receptor-response separation metric ONLY
    // (ratio of two in-silico Hill-curve EC50 values) — not a clinical
    // therapeutic index and not a safety claim of any kind (mandate item 6).
    summary: { analgesiaEC50_nM: eA, respiratoryEC50_nM: eR, therapeuticIndexToy: eR / eA },
    uncertainty: { therapeuticIndexToy: 0.1 * (eR / eA) },
  };
};

export const RUN_AMR: BioRun = (def) => {
  const mic = P(def, 'MIC_mg_L');
  const conc = P(def, 'antibiotic_mg_L');
  const g = P(def, 'growthRate');
  const kill = P(def, 'killRate');
  const steps = Math.floor(P(def, 'steps_h'));
  const f0 = P(def, 'mutantFraction0');
  const mult = P(def, 'resistanceMult');
  const K = 1e8;
  let S = K * (1 - f0);
  let R = K * f0;
  const pop: number[] = [];
  let emergDay = NaN;
  const killEff = (m: number): number => (conc > m ? kill : 0);
  for (let t = 0; t < steps; t++) {
    S += S * (g * (1 - (S + R) / K) - killEff(mic));
    R += R * (g * (1 - (S + R) / K) - killEff(mic * mult));
    S = Math.max(0, S);
    R = Math.max(0, R);
    pop.push(S + R);
    if (Number.isNaN(emergDay) && R / (S + R) > 0.5) emergDay = t / 24;
  }
  return {
    observable: def.observable,
    unit: 'CFU',
    values: pop,
    summary: { resistanceEmergenceDay: emergDay, nadir: Math.min(...pop) },
    uncertainty: { resistanceEmergenceDay: 1 },
  };
};

export const BIO_REGISTRY: Readonly<Record<string, { readonly card: BioModelCard; readonly run: BioRun }>> = {
  'B-CELL-001': { card: CARD_CELL, run: RUN_CELL },
  'B-PBPK-001': { card: CARD_PBPK, run: RUN_PBPK },
  'B-RECEPTOR-001': { card: CARD_RECEPTOR, run: RUN_RECEPTOR },
  'B-AMR-001': { card: CARD_AMR, run: RUN_AMR },
};
