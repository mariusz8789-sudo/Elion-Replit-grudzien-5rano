/**
 * GENESIS-MOL-01 — THE MOLECULAR DISCOVERY MISSION (docs/DECISIONS.md D-074).
 *
 * One coherent scientific process over the REAL engines this runtime actually
 * has, composing mechanisms that already exist rather than adding a parallel
 * pipeline: `campaign/orchestrator.mjs::runCampaign` (real RDKit generation,
 * BRICS recombination, constraints, Pareto, adaptive strategy),
 * `campaign/predictionHardFilters.mjs` (D-069 Option A liability gate, fed by
 * `molecularLiabilities.mjs`), `campaign/tirzepatideBaseline.mjs` (the frozen,
 * hash-verified reference) and `campaign/verify.mjs`'s replay machinery.
 *
 * ===================== WHY THIS MISSION CANNOT PRODUCE A WINNER HERE =======
 *
 * The mission's question is "is this candidate a plausible next-generation
 * alternative to tirzepatide". Answering it requires at least ONE axis on
 * which a generated candidate and the baseline can both be measured. In this
 * runtime there is none, for two independent reasons, each verified rather
 * than assumed:
 *
 *   1. The baseline has NO STRUCTURE. The pinned ChEMBL record for tirzepatide
 *      carries measured potencies but no SMILES, and ChEMBL is unreachable
 *      (HTTP 403 at the egress proxy). So every descriptor/liability number
 *      this pipeline CAN compute for a candidate (MW, logP, QED, alerts,
 *      Lipinski, Veber) is uncomputable for the baseline.
 *   2. The candidates have NO MEASURED ACTIVITY. The baseline's only real
 *      numbers are measured GLP-1R/GIPR potencies; there is no activity
 *      predictor in this repository and, because the pinned actives also lack
 *      structures, not even a ligand-similarity proxy can be fitted.
 *
 * The two sets of measurable quantities are therefore DISJOINT. That is a
 * statement about the data, computed by `comparableAxes()` below from the
 * baseline record and the run itself — not a policy, and not a judgement this
 * module makes on anyone's behalf. Its consequence, NO_WINNER, is produced by
 * `decide()` from that computed emptiness. A caller cannot reach a WINNER by
 * passing different options; it can only reach one by supplying the missing
 * data, which is exactly what `nextAction()` reports.
 *
 * NOTHING HERE WEAKENS ANY GATE. The D-057 Winner Promotion Gate, the D-069
 * objective guard, MINIMUM_OBSERVATIONS and the frozen liability rule are all
 * untouched and none of them is consulted to manufacture an outcome.
 */

import { createHash } from 'node:crypto';
import { canonicalHash } from '../provenance.mjs';
import * as store from './persistence.mjs';
import { createCampaign } from './persistence.mjs';
import { runCampaign } from './orchestrator.mjs';
import { tirzepatideBaseline, efficacyAxis } from './tirzepatideBaseline.mjs';
import { loadFrozenPredictionThresholds } from './predictionHardFilters.mjs';
import { createLiabilityPredictionSource } from './molecularLiabilities.mjs';
import { detect as rdkitDetect } from '../compute/rdkitAdapter.mjs';
import { capabilityAvailable } from './toolchain.mjs';
import {
  loadPinnedActives, computeChemotypeSimilarity, axisContribution,
  CHEMOTYPE_SIMILARITY_AXIS, CHEMOTYPE_HONESTY_NOTE,
} from './chemotypeSimilarityAxis.mjs';
import {
  trainGlp1rModel, glp1rEfficacyPrediction, glp1rAxisContribution,
  GLP1R_EFFICACY_AXIS, MODEL_ESTIMATE_NOTE,
} from './glp1rEfficacyAdapter.mjs';

export const MISSION_ID = 'GENESIS-MOL-01';
export const MISSION_CONTRACT_VERSION = '1.0.0';

/** Frozen BEFORE any candidate is generated; its fingerprint is recorded in the recipe. */
export function missionObjective() {
  const objective = {
    missionId: MISSION_ID,
    question:
      'Is there a generated small-molecule candidate that is a plausible next-generation alternative to the frozen tirzepatide baseline — comparable or better modelled target-relevant activity at a lower selected liability burden?',
    baselineChemblId: 'CHEMBL4297839',
    requiredAxes: [
      { axis: 'TARGET_RELEVANT_ACTIVITY', decisive: true, why: 'an alternative that is not active at the target is not an alternative' },
      { axis: 'LIABILITY_BURDEN', decisive: true, why: 'the mission asks specifically for LOWER selected adverse-effect/risk burden' },
      { axis: 'STRUCTURAL_VALIDITY', decisive: true, why: 'an invalid structure is not a candidate' },
      { axis: 'NOVELTY', decisive: true, why: 'a rediscovery of the baseline or of public prior art is not a discovery' },
    ],
    decisionRule:
      'WINNER requires every decisive axis to be EVALUABLE and satisfied against the baseline. An axis that cannot be evaluated at all is not a neutral axis: it blocks WINNER. NO_WINNER is a valid terminal state.',
    forbidden: [
      'promoting a candidate on an axis the baseline cannot be measured on',
      'treating a missing prior-art search as evidence of novelty',
      'relaxing a frozen threshold to obtain a winner',
    ],
  };
  return Object.freeze({ ...objective, objectiveFingerprint: canonicalHash(objective).slice(0, 16) });
}

/**
 * THE DECISIVE COMPUTATION. Intersects what is measurable on the baseline with
 * what is measurable on a generated candidate. Returns the axes on which a
 * comparison is possible AT ALL — empty here, and empty because of data, not
 * because of a rule.
 */
export function comparableAxes(baseline, capabilities, chemotype = null) {
  const baselineMeasurable = [];
  const candidateMeasurable = [];

  // Baseline: real measured bioactivity only; structure absent -> no computed descriptor is available for it.
  if (baseline.measuredPotencyNM && Object.values(baseline.measuredPotencyNM).some((v) => v != null)) {
    baselineMeasurable.push('TARGET_RELEVANT_ACTIVITY');
  }
  if (baseline.structureAvailable) baselineMeasurable.push('LIABILITY_BURDEN', 'STRUCTURAL_VALIDITY');

  // Candidate: structure is real and RDKit is live -> computed axes available; measured activity is not.
  if (capabilities.rdkit) candidateMeasurable.push('LIABILITY_BURDEN', 'STRUCTURAL_VALIDITY');
  if (capabilities.activityPredictor) candidateMeasurable.push('TARGET_RELEVANT_ACTIVITY');

  // D-075 chemotype screening proxy. It joins the axis sets ONLY when it is
  // genuinely AVAILABLE on that side, and `axisContribution` refuses to emit
  // it under the decisive activity axis's name. It is added to the baseline
  // side only when the baseline has a structure to compare — which it does
  // not in this runtime — so today it changes nothing. Crucially it is NOT
  // decisive: `decide()` reads `efficacy.available` separately, so this axis
  // can never clear EFFICACY_AXIS_UNAVAILABLE.
  if (chemotype?.candidate) {
    for (const c of axisContribution(chemotype.candidate)) candidateMeasurable.push(c.axis);
  }
  if (chemotype?.baseline) {
    for (const c of axisContribution(chemotype.baseline)) baselineMeasurable.push(c.axis);
  }

  const shared = baselineMeasurable.filter((a) => candidateMeasurable.includes(a));
  return Object.freeze({
    baselineMeasurable: Object.freeze([...baselineMeasurable]),
    candidateMeasurable: Object.freeze([...candidateMeasurable]),
    comparable: Object.freeze([...shared]),
    disjoint: shared.length === 0,
  });
}

/**
 * Real runtime capability probe — never a remembered answer.
 *
 * `activityPredictor` (D-076/077) is now COMPUTED, not asserted: it is true
 * only when `glp1rEfficacyAdapter.trainGlp1rModel()` actually loads a
 * hash-verified human GLP-1R pin, loads the frozen validation gate, trains,
 * and clears every gate threshold. It is false in this runtime because no
 * such pin exists (ChEMBL egress is HTTP 403 here) — but it is false as the
 * OUTPUT of that check, not as a constant, so the day a real dataset is
 * ingested this flips without an edit to this file. `glp1rBlockedReason`
 * carries exactly why it is false.
 */
export function probeCapabilities() {
  const rd = rdkitDetect();
  const glp1r = trainGlp1rModel();
  return Object.freeze({
    rdkit: rd.available === true,
    rdkitVersion: rd.version ?? null,
    admet: capabilityAvailable('admet-estimation') === true,
    docking: capabilityAvailable('molecular-docking') === true,
    quantum: capabilityAvailable('quantum-chemistry') === true,
    activityPredictor: glp1r.ok === true,
    glp1rBlockedReason: glp1r.ok ? null : (glp1r.code ?? 'UNKNOWN'),
    priorArtSearch: false,
  });
}

/**
 * Real falsification probes over the RUN ITSELF. Each is computed; none is a
 * placeholder. UNRESOLVED is a real outcome and is never reported as PASS.
 */
export function falsifyRun(run, candidates, gateRule) {
  const probes = [];
  const add = (name, result, detail) => probes.push({ probe: name, result, detail });

  const retained = candidates.filter((c) => c.status === 'retained');
  const canon = retained.map((c) => c.canonicalSmiles);
  add('NO_DUPLICATE_RETAINED', new Set(canon).size === canon.length ? 'PASS' : 'FAIL',
    `${canon.length} retained, ${new Set(canon).size} distinct canonical structures`);

  const seeds = new Set(run.startingSmiles ?? []);
  const nonSeed = retained.filter((c) => !seeds.has(c.canonicalSmiles));
  add('SEARCH_LEFT_THE_SEED_SET', nonSeed.length > 0 ? 'PASS' : 'FAIL',
    `${nonSeed.length} retained candidates are not themselves seeds`);

  const withLineage = retained.filter((c) => c.parentSmiles || c.transformation);
  add('LINEAGE_RECORDED', withLineage.length === nonSeed.length ? 'PASS' : 'FAIL',
    `${withLineage.length}/${nonSeed.length} non-seed retained candidates carry a parent/transformation`);

  const gateApplied = candidates.some((c) => (c.rejectedReason ?? '').startsWith('prediction:'));
  add('LIABILITY_GATE_ACTUALLY_BIT', gateApplied ? 'PASS' : 'UNRESOLVED',
    gateApplied
      ? 'at least one candidate was rejected by the frozen liability rule'
      : 'no candidate was rejected by the liability gate in this run — cannot distinguish "gate is permissive here" from "gate is inert"');

  const gateTerms = new Set((gateRule?.terms ?? []).map((t) => t.term));
  const objectiveKeys = new Set(retained.flatMap((c) => Object.keys(c.objectiveVector ?? {})));
  const leaked = [...objectiveKeys].filter((k) => gateTerms.has(k));
  add('NO_GATE_TERM_IN_OBJECTIVE', leaked.length === 0 ? 'PASS' : 'FAIL',
    leaked.length === 0 ? 'no frozen gate term appears in any objective vector (D-069 Option A holds)' : `LEAKED: ${leaked.join(',')}`);

  add('BASELINE_COMPARISON_POSSIBLE', 'FAIL',
    'no axis is measurable on both the baseline and a generated candidate — see comparableAxes()');

  return Object.freeze({
    probes: Object.freeze(probes),
    allPassed: probes.every((p) => p.result === 'PASS'),
    failed: Object.freeze(probes.filter((p) => p.result === 'FAIL').map((p) => p.probe)),
    unresolved: Object.freeze(probes.filter((p) => p.result === 'UNRESOLVED').map((p) => p.probe)),
  });
}

/**
 * Three SEPARATE kinds of novelty, never collapsed into one word. Prior art is
 * reported NO_ACCESS when it could not be searched — never silently converted
 * into novelty.
 */
export function assessNovelty(candidates, capabilities) {
  const retained = candidates.filter((c) => c.status === 'retained');
  const seeds = new Set();
  for (const c of candidates) if (c.generation === 0) seeds.add(c.canonicalSmiles);
  const derived = retained.filter((c) => !seeds.has(c.canonicalSmiles));
  return Object.freeze({
    structural: Object.freeze({
      status: derived.length > 0 ? 'NEW_TO_THIS_CORPUS' : 'NONE_DERIVED',
      distinctRetained: new Set(retained.map((c) => c.canonicalSmiles)).size,
      derivedFromSeeds: derived.length,
      basis: 'RDKit canonical SMILES identity within this campaign only — says nothing about the world',
    }),
    lineage: Object.freeze({
      status: derived.every((c) => c.parentSmiles || c.transformation) ? 'FULLY_TRACED' : 'INCOMPLETE',
      basis: 'every derived candidate carries the real parent (and co-parent for BRICS) plus the transformation that produced it',
    }),
    priorArt: Object.freeze({
      status: capabilities.priorArtSearch ? 'SEARCHED' : 'NO_ACCESS',
      searched: capabilities.priorArtSearch,
      basis: 'ChEMBL/PubChem/patent search is unreachable from this runtime (egress proxy HTTP 403) — absence of a hit was never observed, so novelty is UNVERIFIABLE, not established',
    }),
  });
}

/**
 * The verdict. Derived entirely from computed state: an empty comparable-axis
 * set, failed decisive probes, and unverifiable prior art each independently
 * block promotion. There is no branch that returns WINNER on a judgement call.
 */
export function decide({ axes, falsification, novelty, efficacy }) {
  const blockers = [];
  if (axes.disjoint) {
    blockers.push({
      code: 'NO_COMPARABLE_AXIS',
      detail: `baseline is measurable on [${axes.baselineMeasurable.join(', ') || 'nothing'}], candidates on [${axes.candidateMeasurable.join(', ') || 'nothing'}] — the intersection is empty`,
    });
  }
  if (!efficacy.available) blockers.push({ code: efficacy.code, detail: efficacy.reasons[0] });
  if (novelty.priorArt.status === 'NO_ACCESS') {
    blockers.push({ code: 'PRIOR_ART_UNVERIFIABLE', detail: novelty.priorArt.basis });
  }
  for (const f of falsification.failed) blockers.push({ code: `FALSIFICATION_FAILED:${f}`, detail: 'a decisive probe over the run did not hold' });

  const outcome = blockers.length === 0 ? 'COMPUTATIONAL_CANDIDATE' : 'NO_WINNER';
  return Object.freeze({
    outcome,
    blockers: Object.freeze(blockers),
    /** Stated explicitly so no reader can upgrade this result by omission. */
    claimBoundary:
      'This is a COMPUTATIONAL research result. It is not a clinical finding, not a validated drug, and carries no evidence of efficacy or safety in any organism. Nothing here may be described as a tirzepatide replacement.',
  });
}

/**
 * "What is still missing, what should we do next, and why" — computed by
 * ranking candidate actions against the ACTUAL blocker set, not a fixed script.
 * Each action declares which blocker codes it would clear; the ranking is by
 * how many of the run's real blockers each clears.
 */
export const AVAILABLE_ACTIONS = Object.freeze([
  {
    id: 'OBTAIN_BASELINE_AND_ACTIVE_STRUCTURES',
    action: 'Obtain SMILES for tirzepatide and for the pinned GLP-1R actives (danuglipron, orforglipron, lotiglipron, PF-06291874) and pin them with hashes next to the existing A2 dataset',
    clears: ['NO_COMPARABLE_AXIS', 'EFFICACY_AXIS_UNAVAILABLE'],
    cost: 'one CI fetch job against ChEMBL from a network-enabled runner; the repo already has this pattern for the A2 dataset',
  },
  {
    id: 'INGEST_HUMAN_GLP1R_ACTIVITY_DATASET',
    action: 'Supply a human GLP-1R activity artifact (ChEMBL/BindingDB export, target_organism = Homo sapiens, target id resolved at ingestion — CHEMBL5862 is the RAT receptor and must not be used) and pin it with scripts/ingest-glp1r-activity.mjs; the D-076/077 QSAR seam then trains and validates itself against the frozen gate with no further code change',
    clears: ['EFFICACY_AXIS_UNAVAILABLE'],
    cost: 'no new dependency and no new code — RDKit is live and the ingestion/training/validation path already exists; it needs ≥150 train and ≥40 test human rows after scaffold-disjoint splitting, or the frozen gate will (correctly) refuse the model',
  },
  {
    id: 'INSTALL_ACTIVITY_OR_DOCKING_ENGINE',
    action: 'Install ADMET-AI and/or AutoDock Vina + a GLP-1R receptor structure so multiFidelity.mjs stages stop reporting BLOCKED_BY_RUNTIME',
    clears: ['EFFICACY_AXIS_UNAVAILABLE'],
    cost: 'heavy runtime dependencies (torch/chemprop); adapters and persistence already exist and are unchanged',
  },
  {
    id: 'ENABLE_PRIOR_ART_SEARCH',
    action: 'Give the runtime egress to ChEMBL/PubChem so literatureNoveltyAdapter can actually search, converting UNVERIFIABLE into an observation',
    clears: ['PRIOR_ART_UNVERIFIABLE'],
    cost: 'network policy change only',
  },
]);

export function nextAction(decision) {
  const open = new Set(decision.blockers.map((b) => b.code));
  const ranked = AVAILABLE_ACTIONS
    .map((a) => ({ ...a, clearsNow: a.clears.filter((c) => open.has(c)) }))
    .filter((a) => a.clearsNow.length > 0)
    .sort((a, b) => b.clearsNow.length - a.clearsNow.length || a.id.localeCompare(b.id));
  const best = ranked[0] ?? null;
  return Object.freeze({
    nextAction: best ? best.action : 'none — no open blocker has a known unblocking action in this runtime',
    actionId: best ? best.id : null,
    rationale: best
      ? `clears ${best.clearsNow.length} of ${open.size} open blocker(s): ${best.clearsNow.join(', ')} — the largest reduction available, and its cost is ${best.cost}`
      : 'every open blocker requires a resource this runtime cannot obtain',
    alternatives: Object.freeze(ranked.slice(1).map((a) => ({ id: a.id, clears: a.clearsNow }))),
    stopCondition:
      'stop when either (a) a comparable axis exists AND every decisive probe passes AND prior art has been genuinely searched, or (b) the open blockers are confirmed unobtainable, in which case NO_WINNER is the final scientific result for this runtime and must be reported as such',
  });
}

/** Deterministic: no timestamps, no random ids, no wall-clock anywhere in the fingerprinted body. */
function recipeFingerprintOf(body) {
  return createHash('sha256').update(JSON.stringify(body)).digest('hex').slice(0, 16);
}

/**
 * Runs the whole mission. `seeds` and `seedProvenance` are REQUIRED — the
 * mission refuses to invent a starting population or to leave its provenance
 * unstated, because a seed set that is not target-derived is itself a
 * limitation the reader must be told about.
 */
export function runMolecularMission(db, opts) {
  const { projectId, seeds, seedProvenance, thresholdsPath, expectedRuleFingerprint, budget = {}, log = () => {} } = opts;
  if (!Array.isArray(seeds) || seeds.length === 0) {
    return { ok: false, code: 'SEEDS_REQUIRED', reason: 'the mission will not invent a starting population' };
  }
  if (typeof seedProvenance !== 'string' || seedProvenance.length === 0) {
    return { ok: false, code: 'SEED_PROVENANCE_REQUIRED', reason: 'a seed set must state where it came from' };
  }

  const objective = missionObjective();
  const base = tirzepatideBaseline();
  if (!base.ok) return { ok: false, code: base.code, reason: base.reason };
  const rule = loadFrozenPredictionThresholds(thresholdsPath, expectedRuleFingerprint);
  if (!rule.ok) return { ok: false, code: rule.code, reason: rule.reason };

  const capabilities = probeCapabilities();
  if (!capabilities.rdkit) {
    return { ok: false, code: 'BLOCKED_BY_RUNTIME', reason: 'RDKit is unavailable — the mission refuses to run a molecular search without a real chemistry engine' };
  }

  log('MISSION_FROZEN', { objectiveFingerprint: objective.objectiveFingerprint, ruleFingerprint: rule.thresholds.ruleFingerprint });

  const campaign = createCampaign(db, {
    projectId,
    objective: `${MISSION_ID}: ${objective.question}`,
    domain: 'DRUG_DISCOVERY',
    objectiveVector: [],
    constraints: [],
    strategy: {
      startingSmiles: seeds,
      transformationWeights: { 'add-methyl': 1, 'add-hydroxyl': 1, 'add-fluoro': 1, 'add-amino': 1, 'brics-recombination': 1 },
      parentSelection: 'pareto',
      predictionGate: { enabled: true, thresholdsPath, expectedRuleFingerprint },
    },
    budget: { maxGenerations: 3, maxGeneratedCandidates: 60, ...budget },
  });

  const summary = runCampaign(db, campaign.id, { log });
  const candidates = store.listCandidates(db, campaign.id);

  // D-075 chemotype screening proxy. BLOCKED in this runtime (no pinned
  // actives artifact — ChEMBL is unreachable), so it contributes nothing
  // today; it is computed and recorded anyway so its BLOCKED state is a
  // visible fact in the recipe rather than an unexplained absence. The
  // baseline side stays null because the baseline has no structure to
  // compare, which is the same limit recorded on the baseline itself.
  const pinnedActives = loadPinnedActives();
  const firstRetained = candidates.find((c) => c.status === 'retained') ?? null;
  const chemotype = {
    candidate: firstRetained ? computeChemotypeSimilarity(firstRetained.canonicalSmiles, pinnedActives) : null,
    baseline: null,
  };

  // D-076/077 GLP-1R QSAR efficacy axis. `trainGlp1rModel()` is fail-closed:
  // with no hash-verified human pin (this runtime) it returns PIN_MISSING and
  // the prediction below is BLOCKED, so `efficacyAxis()` keeps reporting
  // EFFICACY_AXIS_UNAVAILABLE exactly as before. A BLOCKED model is NEVER
  // wired in as an available axis — only a gate-clearing one is.
  const glp1rModel = trainGlp1rModel();
  const glp1rPrediction = firstRetained ? glp1rEfficacyPrediction(firstRetained.canonicalSmiles, glp1rModel) : null;

  const axes = comparableAxes(base.baseline, capabilities, chemotype);
  const falsification = falsifyRun(summary, candidates, rule.thresholds);
  const novelty = assessNovelty(candidates, capabilities);
  const efficacy = efficacyAxis(glp1rPrediction);
  const decision = decide({ axes, falsification, novelty, efficacy });
  const plan = nextAction(decision);

  const liabilitySource = createLiabilityPredictionSource();
  const paretoFront = candidates
    .filter((c) => c.pareto && c.status === 'retained')
    .map((c) => {
      const liab = liabilitySource.predictionsFor(c.canonicalSmiles);
      return {
        canonicalSmiles: c.canonicalSmiles,
        inchiKey: liab?.liab?.inchiKey ?? null,
        parentSmiles: c.parentSmiles ?? null,
        coParentSmiles: c.coParentSmiles ?? null,
        transformation: c.transformation ?? null,
        generation: c.generation,
        objectiveVector: c.objectiveVector,
        descriptors: { molWt: c.descriptors?.molWt ?? null, crippenLogP: c.descriptors?.crippenLogP ?? null, tpsa: c.descriptors?.tpsa ?? null },
        liabilities: liab ? liab.liab : null,
      };
    })
    .sort((a, b) => a.canonicalSmiles.localeCompare(b.canonicalSmiles));

  const recipeBody = {
    contractVersion: MISSION_CONTRACT_VERSION,
    missionId: MISSION_ID,
    objectiveFingerprint: objective.objectiveFingerprint,
    problemFingerprint: objective.objectiveFingerprint,
    baseline: {
      chemblId: base.baseline.chemblId,
      name: base.baseline.name,
      measuredPotencyNM: base.baseline.measuredPotencyNM,
      contentSha256: base.baseline.provenance.contentSha256,
      structureAvailable: base.baseline.structureAvailable,
    },
    seeds: [...seeds].sort(),
    seedProvenance,
    frozenRule: { ruleFingerprint: rule.thresholds.ruleFingerprint, terms: rule.thresholds.terms, evidenceClass: rule.thresholds.evidenceClass ?? null },
    engines: { rdkit: capabilities.rdkitVersion, admet: capabilities.admet, docking: capabilities.docking, quantum: capabilities.quantum },
    search: {
      stopReason: summary.stopReason, generations: summary.generations,
      totalGenerated: summary.totalGenerated, retained: summary.retainedCount, paretoCount: summary.paretoCount,
    },
    paretoFront,
    comparableAxes: axes,
    chemotypeScreeningProxy: chemotype.candidate
      ? {
          axis: CHEMOTYPE_SIMILARITY_AXIS, status: chemotype.candidate.status,
          value: chemotype.candidate.value, nearest: chemotype.candidate.nearest,
          blockedReason: chemotype.candidate.blockedReason ?? null,
          evidenceClass: chemotype.candidate.evidenceClass,
          isEfficacyPredictor: false, honestyNote: CHEMOTYPE_HONESTY_NOTE,
        }
      : { axis: CHEMOTYPE_SIMILARITY_AXIS, status: 'BLOCKED', value: null, nearest: null, blockedReason: 'NO_RETAINED_CANDIDATE', evidenceClass: 'COMPUTATIONAL', isEfficacyPredictor: false, honestyNote: CHEMOTYPE_HONESTY_NOTE },
    /**
     * D-076/077. Unlike the chemotype proxy above, this axis MAY close
     * EFFICACY_AXIS_UNAVAILABLE — but only via a model that cleared the frozen
     * validation gate, and even then it stays MODEL_ESTIMATE and never
     * decisive. Recorded on every run (including BLOCKED) so its state is a
     * visible fact in the recipe rather than an unexplained absence.
     */
    glp1rEfficacyAxis: {
      axis: GLP1R_EFFICACY_AXIS,
      status: glp1rPrediction?.status ?? 'BLOCKED',
      value: glp1rPrediction?.value ?? null,
      unit: glp1rPrediction?.unit ?? null,
      uncertainty: glp1rPrediction?.uncertainty ?? null,
      outOfDomain: glp1rPrediction?.outOfDomain ?? null,
      evidenceClass: 'MODEL_ESTIMATE',
      isMeasurement: false,
      modelVersion: glp1rPrediction?.modelVersion ?? null,
      modelFingerprint: glp1rPrediction?.modelFingerprint ?? null,
      trainingDataHash: glp1rPrediction?.trainingDataHash ?? null,
      inputFingerprint: glp1rPrediction?.inputFingerprint ?? null,
      outputHash: glp1rPrediction?.outputHash ?? null,
      blockedReason: glp1rPrediction?.blockedReason ?? (firstRetained ? null : 'NO_RETAINED_CANDIDATE'),
      contribution: glp1rAxisContribution(glp1rPrediction),
      honestyNote: MODEL_ESTIMATE_NOTE,
    },
    falsification,
    novelty,
    decision,
    nextAction: plan,
    limitations: [
      base.baseline.structureAbsentReason,
      ...efficacy.reasons,
      `${CHEMOTYPE_SIMILARITY_AXIS} is a COMPUTATIONAL SCREENING PROXY and never closes EFFICACY_AXIS_UNAVAILABLE: structural resemblance is not activity`,
      glp1rPrediction?.status === 'AVAILABLE'
        ? `${GLP1R_EFFICACY_AXIS} is a MODEL_ESTIMATE from a QSAR model, not a measured potency; the baseline side of this axis is real measured bioactivity and the candidate side is a model output, and that asymmetry is part of every comparison made on it`
        : `${GLP1R_EFFICACY_AXIS} is BLOCKED (${glp1rPrediction?.blockedReason ?? 'NO_RETAINED_CANDIDATE'}): no hash-verified human GLP-1R activity pin exists in this runtime, so no QSAR model could be trained or validated against the frozen D-077 gate`,
      `seed provenance: ${seedProvenance}`,
      'ADMET-AI, AutoDock Vina and PySCF are absent from this runtime; their adapters report BLOCKED_BY_RUNTIME and nothing substitutes for them',
    ],
    reproducibilityInstructions: [
      'run scripts/genesis-molecular-mission-demo.mjs — the objective, the frozen rule and the seed set fully determine the search',
      'every retained candidate has a replayable molecular-descriptors science_run (campaign/verify.mjs::replayScienceRun)',
      'the recipe fingerprint below covers this entire body and contains no timestamp, no random id and no wall-clock value',
    ],
  };

  return {
    ok: true,
    campaignId: campaign.id,
    objective,
    baseline: base.baseline,
    capabilities,
    summary,
    axes,
    falsification,
    novelty,
    decision,
    plan,
    recipe: Object.freeze({ ...recipeBody, recipeFingerprint: recipeFingerprintOf(recipeBody) }),
  };
}
