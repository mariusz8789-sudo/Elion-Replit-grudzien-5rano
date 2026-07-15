/**
 * Lead Optimization AI (Genesis V4, Phase 2). Given a lead compound, generates analogues (RDKit
 * de novo / SMARTS edits), evaluates each on REAL multi-objective axes, and returns the Pareto-
 * improved set. Objectives use ADMET-AI's drugbank-approved PERCENTILES (already normalised 0–1
 * against approved drugs) for solubility / permeability / metabolic stability / drug-likeness, plus
 * RDKit synthetic accessibility, off-target selectivity, and a transparent synthesis-cost proxy.
 *
 * HONESTY: potency/binding needs a target structure (docking) — reported N/A when absent, never
 * invented. All ADMET axes are MODEL_INFERRED. Analogues are computational; no activity is claimed.
 */
import { canonicalHash } from '../provenance.mjs';
import { paretoFrontIndices } from '../campaign/pareto.mjs';
import { predictOffTarget } from './offTarget.mjs';
import { generateDeNovo } from './denovoDesign.mjs';
import * as rdkit from '../compute/rdkitAdapter.mjs';
import * as admet from '../compute/admetAdapter.mjs';

export const LEAD_OPT_VERSION = 'genesis-lead-opt/1';
const clamp01 = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : null);
const pct = (preds, k) => { const v = preds?.[`${k}_drugbank_approved_percentile`]; return typeof v === 'number' ? clamp01(v / 100) : null; };

export const OBJECTIVES = Object.freeze(['druglikeness', 'solubility', 'permeability', 'metabolicStability', 'syntheticAccessibility', 'selectivity', 'lowToxicity']);

export function defaultEngines() {
  return {
    rdkitDetect: () => rdkit.detect(),
    admetDetect: () => admet.detect(),
    saScore: (s) => rdkit.saScore(s),
    descriptors: (s) => rdkit.descriptors(s),
    admetPredict: (list) => admet.predict(list),
    generateAnalogues: (seeds, count) => generateDeNovo({ seeds, count, methods: ['brics_build', 'bioisostere'], evaluate: false }),
    predictOffTarget,
  };
}

/** Real objective vector (each axis 0–1, higher = better) for one molecule. */
export function objectiveVector({ smiles, predictions, saScore }, engines) {
  const ot = engines.predictOffTarget(predictions);
  const selectivity = ot.status === 'COMPLETED' ? ot.selectivity : null;
  const lowTox = ot.status === 'COMPLETED' ? clamp01(1 - { LOW: 0.1, MEDIUM: 0.5, HIGH: 0.9 }[ot.risk]) : null;
  return {
    smiles,
    druglikeness: pct(predictions, 'QED'),
    solubility: pct(predictions, 'Solubility_AqSolDB'),
    permeability: pct(predictions, 'Caco2_Wang'),
    metabolicStability: pct(predictions, 'Half_Life_Obach'),
    syntheticAccessibility: typeof saScore === 'number' ? clamp01((10 - saScore) / 9) : null,
    selectivity, lowToxicity: lowTox,
    offTargetRisk: ot.status === 'COMPLETED' ? ot.risk : null,
    costProxy: typeof saScore === 'number' ? +clamp01((saScore - 1) / 9).toFixed(4) : null, // higher SA → higher cost
  };
}

/**
 * Optimise a lead. opts: { lead:smiles, count?, objectives?, engines?, potencyAvailable? }
 * Returns the lead's profile + Pareto-improved analogues (non-dominated across the objectives).
 */
export function optimiseLead(opts = {}) {
  const { lead, count = 20, objectives = OBJECTIVES, engines = defaultEngines(), potencyAvailable = false } = opts;
  if (!engines.rdkitDetect().available) return { status: 'BLOCKED_BY_RUNTIME', version: LEAD_OPT_VERSION, reason: 'RDKit unavailable' };
  if (!engines.admetDetect().available) return { status: 'BLOCKED_BY_RUNTIME', version: LEAD_OPT_VERSION, reason: 'ADMET-AI unavailable — multi-objective ADMET optimisation needs the model (never fabricated)' };
  if (!lead) return { status: 'INVALID_INPUT', version: LEAD_OPT_VERSION, reason: 'lead SMILES required' };

  const gen = engines.generateAnalogues([lead], count);
  const analogues = gen.status === 'COMPLETED' ? gen.molecules.map((m) => m.smiles).filter((s) => s !== lead) : [];
  const all = [lead, ...analogues.slice(0, count)];
  const preds = engines.admetPredict(all);
  if (!preds.ok) return { status: 'BLOCKED_BY_RUNTIME', version: LEAD_OPT_VERSION, reason: 'ADMET prediction failed' };

  const rows = all.map((smi) => {
    const sa = engines.saScore(smi);
    return objectiveVector({ smiles: smi, predictions: preds.predictions[smi], saScore: sa.ok ? sa.saScore : null }, engines);
  });
  // Only keep objectives that are non-null for the lead (so Pareto is well-defined).
  const usable = objectives.filter((o) => typeof rows[0][o] === 'number');
  const vectors = rows.map((r) => usable.map((o) => r[o])); // maximise all (higher=better)
  const frontIdx = new Set(paretoFrontIndices(vectors.map((v) => v.map((x) => -x)))); // pareto util minimises → negate
  const leadVec = rows[0];

  const dominatesLead = (r) => usable.every((o) => (r[o] ?? -1) >= (leadVec[o] ?? -1)) && usable.some((o) => (r[o] ?? -1) > (leadVec[o] ?? -1));
  const improved = rows.slice(1)
    .map((r, i) => ({ r, i: i + 1 }))
    .filter(({ r, i }) => frontIdx.has(i) && dominatesLead(r))
    .map(({ r }) => ({ moleculeId: 'lo_' + canonicalHash({ smi: r.smiles }).slice(0, 12), ...r, paretoImproved: true }))
    .sort((a, b) => usable.reduce((s, o) => s + (b[o] ?? 0) - (a[o] ?? 0), 0));

  return {
    status: 'COMPLETED', version: LEAD_OPT_VERSION, lead: { smiles: lead, objectives: leadVec },
    objectivesUsed: usable, potency: potencyAvailable ? 'SEE_DOCKING' : 'N/A — requires a target structure (docking); not invented',
    analoguesEvaluated: analogues.length, paretoImprovedCount: improved.length, improvedAnalogues: improved,
    epistemicStatus: 'MODEL_INFERRED',
    note: 'Multi-objective optimisation over MODEL_INFERRED ADMET percentiles + RDKit synthesizability + off-target selectivity. Potency requires docking. Computational only.',
  };
}
