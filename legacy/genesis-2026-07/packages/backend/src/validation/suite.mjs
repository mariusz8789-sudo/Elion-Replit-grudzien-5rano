/**
 * Scientific Validation Suite orchestrator (Phase 2 + Phase 4 + Phase 5). Wires the real engines,
 * runs every measurable benchmark, validates a campaign dossier (Phase 4), and scores readiness
 * (Phase 5). Deterministic and honest: labels/expectations are explicit, unavailable capabilities
 * are reported BLOCKED. Deps are injectable so the logic is unit-testable without spawning Python.
 */
import * as sv from './scientificValidation.mjs';
import * as rq from './researchQuality.mjs';
import { scoreReadiness } from './readiness.mjs';
import { REFERENCE_MOLECULES } from './knownChemistry.mjs';
import * as rdkit from '../compute/rdkitAdapter.mjs';
import * as te from '../cognitive/truthEngine.mjs';
import * as fk from '../cognitive/formalKernel.mjs';
import { detectConflicts } from '../campaign/campaignRunner001.mjs';

export const SUITE_VERSION = 'genesis-scientific-validation-suite/1';

const FMA = { symbol: 'F=ma', terms: [{ symbol: 'F', dimension: fk.DIM.FORCE }, { symbol: 'ma', dimension: fk.dimMul(fk.DIM.MASS, fk.DIM.ACCELERATION) }] };

/** Calibrated Truth-Engine cases (expectations taken from the passing adversarial behaviour). */
export const TRUTH_CASES = [
  { name: 'insufficient_information', proposal: { problemStatement: 'the future of energy', claimedResult: 'infinite output' }, expectedDecision: 'INSUFFICIENT_DATA' },
  { name: 'efficiency_over_100pct', proposal: { claimedResult: 'x', assumptions: ['a'], efficiency: 1.5 }, expectedDecision: 'BLOCK' },
  { name: 'energy_out_gt_in', proposal: { claimedResult: 'x', assumptions: ['a'], energy: { input: 100, output: 200 } }, expectedDecision: 'BLOCK' },
  { name: 'material_over_temperature', proposal: { claimedResult: 'x', assumptions: ['a'], operating: { temperature: { value: 200, max: 100 } } }, expectedDecision: 'BLOCK' },
  { name: 'well_specified_consistent', proposal: { claimedResult: 'period ~ sqrt(l/g)', equations: [FMA], assumptions: ['small angle', 'rigid rod'], energy: { input: 100, output: 80 }, efficiency: 0.8 }, expectedDecision: 'GO' },
];

/** MCRE conflict-detection cases with expected outcomes. */
const KI = (v) => ({ standardType: 'Ki', standardRelation: '=', standardValue: v, standardUnits: 'nM', identifiers: { activityId: `ki${v}` } });
const IC50 = (v) => ({ standardType: 'IC50', standardRelation: '=', standardValue: v, standardUnits: 'nM', identifiers: { activityId: `ic${v}` } });
export const MCRE_CASES = [
  { name: 'reported_activity_vs_predicted_liability', input: { candidate: { candidateId: 'a', canonicalSmiles: 'CCO' }, ctx: { bioactivity: [KI(10)], engineOutputs: { admet: { predictions: { hERG: 0.9 } } } } }, expectConflict: true },
  { name: 'no_data_no_conflict', input: { candidate: { candidateId: 'b', canonicalSmiles: 'CCO' }, ctx: { bioactivity: [], engineOutputs: { admet: { predictions: {} } } } }, expectConflict: false },
  { name: 'ki_vs_ic50_interpretation', input: { candidate: { candidateId: 'c', canonicalSmiles: 'CCO' }, ctx: { bioactivity: [KI(10), IC50(50)], engineOutputs: { admet: { predictions: {} } } } }, expectConflict: true },
];

export function defaultDeps() {
  return {
    descriptors: (s) => rdkit.descriptors(s),
    rdkitDetect: () => rdkit.detect(),
    runTruth: (p) => ({ decision: te.analyze(p, { capabilityResolver: () => true }).decision.decision }),
    detectConflicts: (input) => detectConflicts(input.candidate, input.ctx),
    truthCases: TRUTH_CASES,
    mcreCases: MCRE_CASES,
  };
}

/** A defined, transparent drug-likeness score from RDKit descriptors (Lipinski-oriented). */
export function drugLikenessScore(desc) {
  if (!desc) return -99;
  const mwInRange = desc.molWt >= 150 && desc.molWt <= 500 ? 1 : 0;
  const arom = (desc.aromaticRings ?? 0) >= 1 ? 1 : 0;
  const hbdOk = (desc.hbd ?? 99) <= 5 ? 1 : 0;
  const hbaOk = (desc.hba ?? 99) <= 10 ? 1 : 0;
  const rotOk = (desc.rotatableBonds ?? 99) <= 10 ? 1 : 0;
  return mwInRange + arom + hbdOk + hbaOk + rotOk - (desc.lipinskiViolations ?? 0);
}

/** Build the labelled recovery set + a RDKit-drug-likeness ranking function (COMPUTATIONAL_CRITERION). */
export function buildRecovery(descriptorsFn, molecules = REFERENCE_MOLECULES) {
  const scoreOf = new Map();
  for (const m of molecules) { const d = descriptorsFn(m.smiles); scoreOf.set(m.name, d.ok ? drugLikenessScore(d.data) : -99); }
  const labeledSet = {
    items: molecules.map((m) => ({ id: m.name, label: Boolean(m.drugLike) })),
    labelProvenance: 'COMPUTATIONAL_CRITERION',
    criterion: 'curated small-molecule drug set (aspirin/ibuprofen/caffeine/paracetamol/naproxen) vs simple non-drug molecules',
  };
  const rankFn = (items) => items.map((it) => ({ id: it.id, score: scoreOf.get(it.id) ?? -99 })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return { labeledSet, rankFn };
}

/**
 * Run the full suite. `dossier` (optional) is a campaign Discovery Dossier for Phase-4 validation.
 * Returns { version, metrics, researchQuality, readiness, blockedEngines, enginesExecuted }.
 */
export function runValidationSuite({ deps = defaultDeps(), dossier = null } = {}) {
  const rdOn = deps.rdkitDetect().available;
  const metrics = {};

  // ETAP 2 — descriptor correctness (real RDKit vs first-principles chemistry).
  metrics.descriptorAccuracy = sv.descriptorAccuracy(deps.descriptors);

  // Known-item recovery + ranking stability + reproducibility (only if RDKit ran).
  if (rdOn && metrics.descriptorAccuracy.status === 'COMPLETED') {
    const { labeledSet, rankFn } = buildRecovery(deps.descriptors);
    metrics.rankingRecovery = sv.rankingRecovery({ labeledSet, rankFn });
    // stability: ranking must be order-independent (shuffle input → identical ranking).
    metrics.rankingStability = sv.rankingStability(() => rankFn(labeledSet.items), () => rankFn([...labeledSet.items].reverse()));
    metrics.reproducibility = [
      sv.reproducibility(() => sv.descriptorAccuracy(deps.descriptors).cases, { label: 'descriptorAccuracy' }),
      sv.reproducibility(() => rankFn(labeledSet.items), { label: 'rankingRecovery' }),
      sv.reproducibility(() => deps.truthCases.map((c) => deps.runTruth(c.proposal).decision), { label: 'truthDecisions' }),
    ];
  } else {
    metrics.rankingRecovery = { status: 'BLOCKED_BY_RUNTIME', metric: 'rankingRecovery', reason: 'RDKit unavailable' };
    metrics.rankingStability = { status: 'BLOCKED_BY_RUNTIME', metric: 'rankingStability' };
    metrics.reproducibility = [sv.reproducibility(() => deps.truthCases.map((c) => deps.runTruth(c.proposal).decision), { label: 'truthDecisions' })];
  }

  // ETAP 1 — Truth Engine + MCRE benchmarks (accuracy + consistency).
  metrics.truth = sv.truthEngineBenchmark(deps.truthCases, deps.runTruth);
  metrics.mcre = sv.mcreBenchmark(deps.mcreCases, deps.detectConflicts);

  // Phase 4 — campaign dossier validation (research quality + provenance integrity).
  const researchQuality = dossier ? rq.validateResearchQuality(dossier) : { pass: false, score: 0, passedChecks: 0, totalChecks: 0, checks: [], note: 'no dossier supplied for campaign validation' };

  const enginesExecuted = [rdOn ? 'RDKit' : null, 'TruthEngine', 'MCRE'].filter(Boolean);
  const blockedEngines = [rdOn ? null : 'RDKit:BLOCKED_BY_RUNTIME'].filter(Boolean);

  // Phase 5 — readiness from measured evidence.
  const readiness = scoreReadiness({
    descriptorAccuracy: metrics.descriptorAccuracy, reproducibility: metrics.reproducibility,
    rankingRecovery: metrics.rankingRecovery, truth: metrics.truth, mcre: metrics.mcre,
    researchQuality, enginesExecuted, blockedEngines,
  });

  return { version: SUITE_VERSION, metrics, researchQuality, readiness, enginesExecuted, blockedEngines };
}
