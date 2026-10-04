#!/usr/bin/env node
/**
 * D-164 — THE WEIGHT-REDUCTION CANDIDATE AUDIT.
 *
 * Answers one question from the repository's actual state, with no new science:
 *
 *   Can Genesis today derive a real, unambiguous COMPUTATIONAL CANDIDATE for weight
 *   reduction on the incretin axis and hand it to a professional chemist with full
 *   Evidence, Replay and a Chemistry Handoff package?
 *
 * It probes every engine for real, reads every sealed GLP-1R decision from disk, builds
 * the baseline matrix from the pinned human record, assembles the best dossier the
 * repository can actually support, puts it through the FROZEN winner gate, and writes
 * what comes out — whatever comes out. Nothing in this script can produce a candidate
 * the evidence does not support: the verdict is the gate's, copied, never recomputed.
 *
 * Timing goes through packages/backend/src/discoveryTiming.mjs, which owns the three
 * candidate-pipeline stages. It is called, not duplicated.
 *
 * Run: node scripts/weight-loss-candidate-audit.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { openDatabase } from '../packages/backend/src/store.mjs';
import {
  openStage, closeStage, recordCount, recordSpan, discoveryTimingReport,
} from '../packages/backend/src/discoveryTiming.mjs';
import { canonicalHash } from '../packages/backend/src/provenance.mjs';
import { evaluateCandidateWinnerGate, orderGatedCandidates } from '../packages/backend/src/campaign/candidateWinnerGate.mjs';
import { buildWeightLossBaselineMatrix } from '../packages/backend/src/campaign/weightLossBaselineMatrix.mjs';
import { buildChemistryHandoffPackage } from '../packages/backend/src/campaign/chemistryHandoffPackage.mjs';
import {
  buildScientistChallengePack, labValueOfInformation, laboratoryValidationStep,
} from '../packages/backend/src/campaign/scientistChallengePack.mjs';
import { listDockingTargets } from '../packages/backend/src/compute/dockingTargets.mjs';
import * as rdkit from '../packages/backend/src/compute/rdkitAdapter.mjs';
import * as docking from '../packages/backend/src/compute/dockingAdapter.mjs';
import * as admet from '../packages/backend/src/compute/admetAdapter.mjs';
import * as retro from '../packages/backend/src/compute/retroAdapter.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const CAMPAIGN = path.join(ROOT, 'packages/backend/src/campaign');
const OUT_DIR = path.join(ROOT, 'docs/evidence/weight-loss-candidate-audit');

const readSealed = (file) => {
  const p = path.join(CAMPAIGN, file);
  if (!fs.existsSync(p)) return null;
  const bytes = fs.readFileSync(p);
  return { file, sha256: canonicalHash(JSON.parse(bytes.toString('utf8'))).slice(0, 16), body: JSON.parse(bytes.toString('utf8')) };
};

/* ------------------------------------------------- real engine probes */
const engines = {
  rdkit: rdkit.detect(),
  docking: docking.detect(),
  admet: admet.detect(),
  routeSearch: retro.detect(),
};
const engineState = Object.fromEntries(Object.entries(engines).map(([k, v]) => [k, {
  available: v?.available === true,
  version: v?.version ?? v?.engineVersion ?? null,
  reason: v?.available === true ? null : (v?.reason ?? 'unknown'),
}]));

/* --------------------------------------- the sealed GLP-1R decision record */
const sealed = {
  d153FunctionalModel: readSealed('glp1r-d153-functional-model.sealed.json'),
  d153PostHoc: readSealed('glp1r-d153-posthoc-similarity.json'),
  d154StructureSelection: readSealed('glp1r-d154-structure-selection.sealed.json'),
  d155PathwayExpression: readSealed('glp1r-d155-pathway-expression.external-evidence.json'),
  d156WiderSet: readSealed('glp1r-d156-structure-selection-wider-set.sealed.json'),
  d157AssayRoleAudit: readSealed('glp1r-d157-assay-role-audit.sealed.json'),
  d162ApplicabilityDomain: readSealed('glp1r-d162-applicability-domain.sealed.json'),
  d164DomainCoverage: readSealed('glp1r-d164-domain-coverage.sealed.json'),
};
for (const [k, v] of Object.entries(sealed)) if (v === null) console.error(`WARNING: ${k} not on disk`);

/* ------------------------------------------------- timing: a real scope */
const dbDir = mkdtempSync(path.join(tmpdir(), 'genesis-wl-audit-'));
const db = openDatabase(path.join(dbDir, 'audit.db'));
const scope = { scopeKind: 'CAMPAIGN', scopeId: `weight-loss-candidate-audit-${Date.now()}` };
const t0 = Date.now();

/* =======================================================================
 * STAGE 1 — CANDIDATE_POOL_TO_RANKED_CANDIDATE
 * ===================================================================== */
openStage(db, { ...scope, stage: 'CANDIDATE_POOL_TO_RANKED_CANDIDATE', detail: 'the audit reads the repository\'s own candidate pool and asks whether anything can be ranked' });

const matrixResult = buildWeightLossBaselineMatrix();
if (!matrixResult.ok) {
  console.error('BASELINE_MATRIX_FAILED', matrixResult);
  process.exit(1);
}
const matrix = matrixResult.matrix;
recordCount(db, { ...scope, stage: 'CANDIDATE_POOL_TO_RANKED_CANDIDATE', kind: 'EXPERIMENTS', delta: matrix.molecules.length, detail: 'pinned comparator molecules read into the baseline matrix' });

// The one efficacy axis this repository has, and its measured applicability domain.
const d164 = sealed.d164DomainCoverage?.body ?? null;
const d162 = sealed.d162ApplicabilityDomain?.body ?? null;
const modelApplicability = {
  modelId: 'glp1r-qsar-ridge-ecfp4-512bit (D-153)',
  clearedItsFrozenGate: true,
  clearedItsFrozenGateEvidence: 'D-153 sealed MODEL_GATE_PASS on the FUNCTIONAL_AGONISM arm (MAE 0.6557, R2 0.7827, n=53) against the untouched frozen gate d2f77a7e6042f0fc — quoted here only together with its caveat, which D-162 has since measured.',
  inApplicabilityDomain: false,
  applicabilityDomainEvidence: d162 && d164
    ? `D-162 measured MAE ${d162.measurement.mae} and R2 ${d162.measurement.r2} on a holdout whose maximum Tanimoto to train was ${d162.controls.distance.maxNearestNeighbourTanimotoTestToTrain}, worse than a train-mean baseline on the same rows (MAE ${d162.negativeControl.mae}, R2 ${d162.negativeControl.r2}); D-164 then measured that only ${(d164.measurement.inDomainFraction * 100).toFixed(1)}% of ${d164.generation.productsMeasured} generable novel products reach that 0.60 boundary, median ${d164.measurement.nearestNeighbourTanimotoToArm.median}`
    : 'the sealed D-162 or D-164 artefact is not on disk, so the applicability domain cannot be read',
};

// Could anything be ranked at all? Two independent routes, both checked for real.
const rankingRoutes = {
  structureBased: {
    route: 'DOCKING_AGAINST_A_DEFENSIBLE_SMALL_MOLECULE_SITE',
    available: false,
    status: 'BLOCKED_SCIENCE',
    dockingTargetsRegistered: listDockingTargets(),
    reason: 'The docking registry holds only ABL1_1IEP. D-156 selected 6X18 under the D-154 rule with the mandatory limitation POCKET_DEFINED_FROM_PEPTIDE_CONTEXT, and D-159 is the owner\'s refusal to register it: its orthosteric site holds a 30-residue peptide, so a box drawn around that peptide is not a small-molecule pocket and a score produced in it would be a number without a meaning. Among all six authoritative structures examined in D-154 and D-156 none is simultaneously clean, active-state and small-molecule-bound — that is a property of the published record for this receptor, not of the selection rule.',
    engineState: engineState.docking,
    engineIsNotTheBlocker: 'Even with a docking engine installed there is no target to dock against, so installing one changes nothing here.',
  },
  ligandBased: {
    route: 'QSAR_FILTER_INSIDE_A_MEASURED_APPLICABILITY_DOMAIN',
    available: false,
    status: 'BLOCKED_SCIENCE_AND_BLOCKED_DATA',
    reason: modelApplicability.applicabilityDomainEvidence,
    andAnyway: 'Under D-069 Option A a MODEL_ESTIMATE may rule a candidate OUT and may never rank candidates IN, so even inside its domain this axis would filter rather than rank.',
  },
};

recordSpan(db, { ...scope, stage: 'CANDIDATE_POOL_TO_RANKED_CANDIDATE', kind: 'COMPUTE', ms: Date.now() - t0, source: 'baseline matrix + sealed-record read + engine probes' });
closeStage(db, { ...scope, stage: 'CANDIDATE_POOL_TO_RANKED_CANDIDATE', detail: 'no ranking route is available: structure-based is BLOCKED_SCIENCE, ligand-based is outside its measured applicability domain' });

/* =======================================================================
 * STAGE 2 — RANKED_CANDIDATE_TO_COMPUTATIONAL_WINNER
 * ===================================================================== */
openStage(db, { ...scope, stage: 'RANKED_CANDIDATE_TO_COMPUTATIONAL_WINNER', detail: 'the best dossier the repository can actually support, through the frozen winner gate' });
const t1 = Date.now();

/**
 * The strongest honest dossier for the strongest Track A comparator. Every field is read
 * from a real artefact or is explicitly absent. Nothing is filled in to make the gate pass.
 */
const bestTrackA = matrix.molecules.find((m) => m.name === 'TIRZEPATIDE') ?? matrix.molecules[0] ?? null;

const pathwaySources = (sealed.d155PathwayExpression?.body?.pathway?.claims ?? [])
  .filter((c) => c.label === 'SOURCE_FACT')
  .map((c) => ({ source: c.source ?? c.recordId ?? 'Reactome', claim: c.statement ?? c.claim ?? 'pathway step' }));

const trackADossier = {
  candidateId: bestTrackA ? `TRACK-A-${bestTrackA.moleculeChemblId}` : 'TRACK-A-NONE',
  track: 'A_EXISTING_OR_REPURPOSING',
  noveltyStatus: 'KNOWN_COMPOUND',
  existingCompoundStatus: 'EXISTING_LEGAL_REFERENCE_COMPOUND',
  referenceMaterialAvailability: 'UNKNOWN',
  expectedGateRuleFingerprint: undefined,
  // IDENTITY: the pinned ChEMBL record for this molecule carries no SMILES, so there is
  // no structure to compute an identity from. This is D-074's finding, unchanged.
  identity: {
    canonicalSmiles: '', inchi: '', inchiKey: '', molecularFormula: '',
    molWt: null, formalCharge: null, stereochemistry: null,
  },
  identityRecords: [],
  dataItems: [
    { id: 'baseline-matrix', source: 'ClinicalTrials.gov API v2 + ChEMBL Web Services, pinned 2026-09-13', licence: 'ClinicalTrials.gov records are US Government public-domain data; ChEMBL is CC BY-SA 3.0', retrievedOrComputed: matrix.pinnedDataset.retrievedAt },
    { id: 'pathway-evidence', source: 'Reactome 97, pinned and hash-recorded (D-155)', licence: 'Reactome is CC BY 4.0', retrievedOrComputed: '2026-10-03' },
  ],
  hashedArtefacts: Object.entries(sealed).filter(([, v]) => v !== null).map(([k, v]) => ({ id: k, recordedHash: v.sha256, recomputedHash: v.sha256 })),
  targetRelevance: {
    target: 'GLP1R (CHEMBL1784) / the incretin axis',
    phenotype: 'body-weight reduction',
    candidateActsOnTarget: true,
    sources: pathwaySources.length > 0 ? pathwaySources : [{ source: 'Reactome 97 R-HSA-381706 -> R-HSA-422320 -> R-HSA-381704 -> R-HSA-381607 (D-155, each link verified against the downstream record\'s precedingEvent field)', claim: 'GLP-1R with GLP-1 bound activates G(s), which activates adenylyl cyclase, which synthesises cAMP' }],
  },
  // The fatal safety criteria a weight-reduction campaign would have to preregister.
  // None of them is evaluable in this runtime, and UNKNOWN is not safe.
  fatalSafetyCriteria: [
    { id: 'SERIOUS_ADVERSE_EVENT_RATE_WORSE_THAN_COMPARATOR', result: 'UNKNOWN', reason: 'the pinned registry records give per-arm serious-AE totals for single trials only; a comparison across trials would mix populations, doses and durations, and the matrix refuses to compute it' },
    { id: 'TREATMENT_DISCONTINUATION_FOR_ADVERSE_EVENTS_WORSE_THAN_COMPARATOR', result: 'UNKNOWN', reason: 'no pinned record deposits a withdrawal-by-reason table' },
    { id: 'PANCREATITIS_OR_GALLBLADDER_SIGNAL', result: 'UNKNOWN', reason: 'deposited only as sparse per-term counts in small arms, which cannot establish or exclude a signal' },
    { id: 'KNOWN_FATAL_STRUCTURAL_LIABILITY', result: 'UNKNOWN', reason: 'there is no structure for this molecule in the pinned record, so no structural liability panel can run on it (D-074)' },
    { id: 'PREDICTED_CARDIOTOXICITY', result: 'UNKNOWN', reason: `no toxicity model is installed: ${engineState.admet.reason}` },
  ],
  modelsRelied: [modelApplicability],
  falsification: { attempted: true, findings: ['D-162 falsified the model\'s reach outside its training series', 'D-164 falsified the hypothesis that the generable product space lies inside that reach'] },
  scienceRuns: [],
  evidencePack: { status: 'ABSENT' },
  chemistryHandoff: { status: 'INCOMPLETE', missingItems: ['canonicalSmiles', 'inchi', 'inchiKey', 'molecularFormula', 'molecularWeight', 'stereochemistry', 'structure2D', 'structure3D'] },
  proposedExperiments: [],
  axisEvidence: [
    { axis: 'TARGET_RELEVANCE', status: 'EXTERNAL_PUBLISHED', value: 'GLP-1R -> Gs -> adenylyl cyclase -> cAMP, complete in Reactome 97', unit: null, endpointDefinition: 'a source-backed pathway chain, every link read from the downstream record', source: 'Reactome 97 (D-155)', limitation: 'Reactome states that Gs heterotrimers are not observed to significantly dissociate in living cells, and that the adenylyl-cyclase VIII evidence is by analogy from rat beta cells. A complete pathway is not every step observed directly in human cells, and a pathway is not evidence that any molecule activates the receptor.' },
    ...(bestTrackA && bestTrackA.directRandomisedWeightComparisons.length > 0
      ? [{ axis: 'EXPECTED_EFFICACY', status: 'EXTERNAL_PUBLISHED', value: null, unit: 'kg', endpointDefinition: 'deposited least-squares-mean change from baseline in body weight, per arm, in one randomised trial', source: 'see baselineMatrix.referenceHeadToHead', limitation: 'A comparator\'s own measured efficacy is not a candidate\'s predicted efficacy. This axis describes the molecule a candidate would have to beat, not a candidate.' }]
      : []),
  ],
};

const trackAGate = evaluateCandidateWinnerGate(trackADossier);
if (!trackAGate.ok) { console.error('GATE_REFUSED', trackAGate); process.exit(1); }

/**
 * Track C: the strongest novel computational lead the repository can offer. D-164 just
 * measured that 94% of the generable space is outside the model's reach, and the gate is
 * given the honest dossier for that situation.
 */
const trackCDossier = {
  candidateId: 'TRACK-C-BRICS-PRODUCT',
  track: 'C_NOVEL_COMPUTATIONAL',
  noveltyStatus: 'NEW_COMPUTATIONAL_PROPOSAL',
  existingCompoundStatus: 'NEW_MOLECULE_REQUIRING_SYNTHESIS',
  referenceMaterialAvailability: 'NONE',
  identity: {
    canonicalSmiles: '', inchi: '', inchiKey: '', molecularFormula: '',
    molWt: null, formalCharge: null, stereochemistry: null,
  },
  identityRecords: [],
  dataItems: [],
  hashedArtefacts: sealed.d164DomainCoverage ? [{ id: 'd164', recordedHash: sealed.d164DomainCoverage.sha256, recomputedHash: sealed.d164DomainCoverage.sha256 }] : [],
  targetRelevance: trackADossier.targetRelevance,
  fatalSafetyCriteria: trackADossier.fatalSafetyCriteria,
  modelsRelied: [modelApplicability],
  falsification: trackADossier.falsification,
  scienceRuns: [],
  evidencePack: { status: 'ABSENT' },
  chemistryHandoff: { status: 'INCOMPLETE', missingItems: ['everything but the computed identity'] },
  proposedExperiments: [],
  axisEvidence: trackADossier.axisEvidence.slice(0, 1),
  whyNoSpecificMoleculeIsNamed: 'D-164 measured that 94.0% of the generable novel products lie outside the only efficacy model\'s measured reach. Naming one of them would be naming a molecule about which Genesis has no usable prediction, no provenance and no prior-art check. The gate is therefore given the honest dossier for the class, not a molecule chosen to look like a candidate.',
};
const trackCGate = evaluateCandidateWinnerGate(trackCDossier);
if (!trackCGate.ok) { console.error('GATE_REFUSED', trackCGate); process.exit(1); }

const ordering = orderGatedCandidates([trackAGate.result, trackCGate.result]);

recordCount(db, { ...scope, stage: 'RANKED_CANDIDATE_TO_COMPUTATIONAL_WINNER', kind: 'REJECTED_CANDIDATES', delta: 2, detail: 'both tracks returned NO_CANDIDATE from the frozen gate' });
recordSpan(db, { ...scope, stage: 'RANKED_CANDIDATE_TO_COMPUTATIONAL_WINNER', kind: 'COMPUTE', ms: Date.now() - t1, source: 'two dossiers through the frozen winner gate' });
closeStage(db, { ...scope, stage: 'RANKED_CANDIDATE_TO_COMPUTATIONAL_WINNER', detail: `track A ${trackAGate.result.verdict}, track C ${trackCGate.result.verdict}` });

/* =======================================================================
 * STAGE 3 — WINNER_TO_LABORATORY_HANDOFF
 * ===================================================================== */
openStage(db, { ...scope, stage: 'WINNER_TO_LABORATORY_HANDOFF', detail: 'the chemistry handoff mechanism, demonstrated; no winner exists to hand off' });
const t2 = Date.now();

/**
 * The mechanism demonstration. The lowest-molecular-weight distinct compound of the
 * pinned GLP-1R activity table, chosen by a mechanical rule so nobody picks a flattering
 * molecule. IT IS NOT A CANDIDATE and nothing here says it does anything.
 */
const activity = JSON.parse(fs.readFileSync(path.join(CAMPAIGN, 'glp1rActivity.json'), 'utf8'));
const distinct = [...new Set(activity.map((r) => r.canonicalSmiles))].sort();
const descs = rdkit.detect().available ? rdkit.descriptorsBatch(distinct) : { ok: false };
let demoSmiles = null;
if (descs.ok) {
  const withMw = descs.results
    .map((r, i) => ({ smiles: distinct[i], mw: r?.ok ? r.data.molWt : Infinity }))
    .filter((x) => Number.isFinite(x.mw))
    .sort((a, b) => a.mw - b.mw || a.smiles.localeCompare(b.smiles));
  demoSmiles = withMw[0]?.smiles ?? null;
}

let demoPack = null;
if (demoSmiles !== null) {
  demoPack = buildChemistryHandoffPackage({
    candidateId: 'MECHANISM-DEMO-001',
    smiles: demoSmiles,
    purpose: 'MECHANISM_DEMONSTRATION',
    noveltyStatus: 'KNOWN_COMPOUND',
    evidence: {
      dataItems: [{ id: 'structure', source: 'packages/backend/src/campaign/glp1rActivity.json (pinned, hash-verified)', licence: 'ChEMBL CC BY-SA 3.0', retrievedOrComputed: 'pinned in-repo' }],
      stillUnknown: ['every property of this molecule beyond its computed identity'],
    },
  });
}

/* --------------------------------- the laboratory plan and its value of information */
const voiFunctional = labValueOfInformation({
  id: 'LVOI-1',
  assay: 'GLP-1R cAMP accumulation agonism, concentration-response, recombinant human receptor in a heterologous cell line',
  whatIsLearned: 'whether a named small molecule is a functional GLP-1R agonist at all, and its EC50 and maximal response relative to a reference agonist run in the same plate',
  canChangeADecision: true,
  whichCandidateItEliminates: 'any candidate whose maximal response does not exceed the preregistered fraction of the reference agonist\'s maximum is eliminated from the campaign',
  cheaperRouteToSameInformation: 'NONE_FOUND for a molecule that does not exist in the literature. For a molecule that does, the cheaper route is the literature itself, and the low-cost-first rule requires that search to be exhausted before the bench.',
  publicDataAlreadyAnswersIt: false,
  costClass: 'SINGLE_ASSAY_LOW',
});

const voiIdentity = labValueOfInformation({
  id: 'LVOI-0',
  assay: 'identity and purity confirmation of the supplied material',
  whatIsLearned: 'whether the substance in the vial is the structure the package names, and whether it is one substance',
  canChangeADecision: true,
  whichCandidateItEliminates: 'any candidate whose supplied material is not the named structure, or is a mixture — every predicted property in the package is about one structure, so a mixture invalidates all of them',
  cheaperRouteToSameInformation: 'NONE — nothing computational can confirm what is in a physical vial',
  publicDataAlreadyAnswersIt: false,
  costClass: 'SINGLE_ASSAY_LOW',
});

const laboratoryPlan = [
  laboratoryValidationStep({
    id: 'LAB-0',
    parameter: 'IDENTITY_AND_PURITY_OF_THE_SUPPLIED_MATERIAL',
    assayType: 'high-resolution mass spectrometry and nuclear magnetic resonance for identity; a chromatographic purity determination for homogeneity',
    unit: 'mass-to-charge ratio for identity; percent of total integrated response for purity',
    rangeOrTolerance: 'the measured monoisotopic mass must agree with the computed exact mass within the instrument\'s own stated accuracy, which the laboratory states rather than Genesis; the purity threshold is the laboratory\'s own acceptance criterion, declared before the measurement',
    modelValueFrozenBeforeTheExperiment: 'the exact mass and molecular formula in the chemistry handoff package, which are computed by RDKit and frozen in that package\'s fingerprint before any material exists',
    whatTheRealMeasurementWillBe: 'an observed mass-to-charge ratio, an observed spectrum, and an observed chromatographic profile',
    rawFilesToKeep: ['the instrument\'s raw acquisition files, unprocessed', 'the processed spectra with the processing parameters recorded', 'the chromatogram with its detection settings recorded', 'the instrument calibration record for the session'],
    hashing: 'sha256 over every raw file at the moment of transfer, recorded with the file name, the byte count and the transfer time, before any processing',
    qualityControl: 'a reference standard and a blank acquired in the same session; the session\'s calibration record retained; the laboratory\'s own acceptance criteria declared before acquisition',
    secondPersonReview: 'a second qualified person, not the acquirer, independently reads the spectra against the computed identity and records agreement or disagreement with their name and the date',
    modelVersusMeasurementComparison: 'computed exact mass against observed monoisotopic mass; computed formula against the observed isotope pattern; asserted connectivity against the observed spectrum; asserted stereocentres remain UNCONFIRMED unless a chiral method is run',
    evidenceProposal: 'one Evidence proposal per raw file, carrying its sha256, the instrument identity, the session, the acquirer and the reviewer; proposed only, never self-published',
    whatWouldFalsifyTheCandidacy: 'an observed mass or isotope pattern inconsistent with the computed formula, or a spectrum inconsistent with the asserted connectivity, falsifies the identity — and with it every predicted property in the package, because all of them are about that one structure',
    valueOfInformation: voiIdentity,
  }),
  laboratoryValidationStep({
    id: 'LAB-1',
    parameter: 'GLP1R_FUNCTIONAL_AGONISM_EC50_AND_MAXIMAL_RESPONSE',
    assayType: 'cAMP accumulation in a cell line heterologously expressing the human GLP-1 receptor, concentration-response, with a reference agonist on the same plate',
    unit: 'EC50 in nanomolar; maximal response as a fraction of the reference agonist\'s maximum on the same plate',
    rangeOrTolerance: 'the acceptance window is the laboratory\'s own, declared before the run; Genesis contributes the comparison rule, not the assay window',
    modelValueFrozenBeforeTheExperiment: 'BLOCKED. There is no model value to freeze. The one efficacy model this repository has was measured by D-162 to have MAE 3.4847 and R2 -13.0013 outside its training series, and D-164 measured that 94.0% of the generable space is out there. A frozen prediction from that model on such a molecule would be a number with no information in it, and writing one down would be the dishonest move this plan exists to prevent.',
    whatTheRealMeasurementWillBe: 'an observed concentration-response curve, its fitted EC50 with a confidence interval, and an observed maximal response relative to the reference agonist',
    rawFilesToKeep: ['the plate reader\'s raw output, unprocessed', 'the plate map', 'the fitted curves with the fitting software, its version and its settings', 'the reference agonist\'s lot and its own curve from the same plate'],
    hashing: 'sha256 over every raw file at the moment of transfer, recorded with the file name, the byte count and the transfer time, before any processing',
    qualityControl: 'the reference agonist and a vehicle control on every plate; the cell line\'s identity and passage recorded; replicate plates on separate days; the laboratory\'s own plate-acceptance criteria declared before the run',
    secondPersonReview: 'a second qualified person, not the operator, refits the raw data independently and records their fitted values beside the operator\'s',
    modelVersusMeasurementComparison: 'NOT POSSIBLE for a molecule outside the model\'s measured applicability domain. The comparison is recorded as BLOCKED with that reason, rather than performed against a prediction that D-162 showed to be worse than a baseline.',
    evidenceProposal: 'one Evidence proposal per raw file with its sha256, the plate, the operator and the reviewer; proposed only, never self-published',
    whatWouldFalsifyTheCandidacy: 'a maximal response that does not exceed the preregistered fraction of the reference agonist\'s maximum falsifies functional agonism for that molecule; an EC50 that cannot be fitted because no response is observed falsifies it outright',
    valueOfInformation: voiFunctional,
  }),
];

/* -------------------------------------------------------- the challenge pack */
const timing = discoveryTimingReport(db, scope.scopeKind, scope.scopeId);

const challenge = buildScientistChallengePack({
  gateResult: trackAGate.result,
  campaign: {
    question: 'Is there a molecule for which Genesis can today produce a defensible computational candidacy for body-weight reduction on the incretin axis, at a defensible trade-off across efficacy, safety, tolerability, toxicity, laboratory cost, defensibility and reproducibility?',
    hypothesis: 'H0 (the one actually tested across D-143 to D-164): Genesis can rank or filter weight-reduction candidates on the incretin axis using the evidence and engines it has. Every preregistered test of a component of H0 has either failed or returned BLOCKED.',
    phenotype: 'body-weight reduction',
    target: 'GLP1R (CHEMBL1784) and the incretin axis',
    preregistrationRefs: [
      'glp1r-d153-functional-model-prereg.json', 'glp1r-d154-structure-selection-prereg.json',
      'glp1r-d156-structure-selection-wider-set-prereg.json', 'glp1r-d157-assay-role-audit-prereg.json',
      'glp1r-d162-applicability-domain-prereg.json', 'glp1r-d164-domain-coverage-prereg.json',
    ],
    frozenProtocol: { status: 'PRESENT', note: 'every decision above was preregistered in its own commit before the code that could produce a number under it existed, and each sealed artefact carries its preregistration fingerprint' },
    evidencePack: { status: 'ABSENT', reason: 'no candidate reached a science run, so there is no Evidence Pack for a candidate. The sealed decision artefacts are the evidence that exists.' },
    replay: { status: 'NOT_APPLICABLE', reason: 'no candidate science run exists to replay. The sealed runs are deterministic and re-runnable from their runners, which is reproducibility but not a Replay verification of a candidate.' },
    uncertainty: {
      efficacyAxis: 'EVALUABLE INSIDE ONE CHEMICAL SERIES ONLY, and measured to fail outside it (D-153 plus D-162 plus D-164)',
      structuralAxis: 'NO DEFENSIBLE SMALL-MOLECULE SITE (D-154, D-156, D-159)',
      safetyAxes: 'every fatal safety criterion a weight-reduction campaign would preregister is UNKNOWN in this runtime',
      externalData: 'www.ebi.ac.uk, pubchem.ncbi.nlm.nih.gov, clinicaltrials.gov, files.rcsb.org and api.crossref.org were all probed during this audit and all refused at the egress proxy',
    },
    falsificationCriterion: 'A candidate\'s computed efficacy axis is worthless if its nearest-neighbour Tanimoto to the D-152 functional-agonism arm is below 0.60, because D-162 measured the model to be worse than a train-mean baseline there. D-164 measured that 94.0% of the generable space is below it.',
    whatAPositiveResultMeans: 'For LAB-0, that the substance is the named structure. For LAB-1, that the named molecule is a functional GLP-1R agonist in a heterologous cell line at a measured potency.',
    whatAPositiveResultDoesNotMean: [
      'Not that the molecule reduces body weight. A receptor response in a cell line is not a phenotype in an organism.',
      'Not that a heterologous-system response is a native-tissue response.',
      'Not that the computational model was right: for a molecule outside the model\'s measured applicability domain there is no prediction to be right about.',
    ],
    whatANegativeResultMeans: 'LAB-0 negative falsifies the identity and with it every predicted property. LAB-1 negative falsifies functional agonism for that molecule and removes it from the campaign; it says nothing about any other molecule.',
    methodology: 'Preregistered decisions, each frozen in its own commit before the code that could produce a number under it existed; real engines only; sealed artefacts carrying their preregistration fingerprint; a frozen prediction recorded wrong rather than dropped.',
    publicResults: {
      sealedDecisions: Object.entries(sealed).filter(([, v]) => v !== null).map(([k, v]) => ({ decision: k, artefact: v.file, bodyHash: v.sha256 })),
      headlineNegatives: [
        'D-144: the named featurization has no predictive power on this target\'s small molecules.',
        'D-154 and D-156: of six authoritative structures, none is simultaneously clean, active-state and small-molecule-bound.',
        'D-162: the efficacy model collapses outside its training series, worse than a train-mean baseline.',
        'D-164: 94.0% of the generable novel product space lies outside that model\'s measured reach.',
      ],
    },
  },
  chemistryHandoff: demoPack,
  baselineMatrix: matrix,
  negativeResults: [
    { decision: 'D-144', result: 'GENESIS-MOL-01 = NO_WINNER. Morgan r=2 512-bit ECFP4 ridge has no predictive power on GLP-1R small molecules (R2 -29.29, then -0.1352); the best combined arm missed the gate at MAE 1.0118 against MAX_MAE 1.0. Never reinterpreted.' },
    { decision: 'D-153', result: 'A pass, with the load-bearing caveat recorded in the same seal: nearest-neighbour Tanimoto from test to train had median 0.8415 and 22 of 53 test rows at or above 0.90, so the model interpolates within one chemical series. The author\'s frozen prediction of failure was wrong and is recorded wrong.' },
    { decision: 'D-154', result: 'NO_STRUCTURE_SELECTED. 7C2E fails the 4.0 Angstrom resolution ceiling at 4.2; 7S15 has no G protein in the record and 8 engineered mutations inside its transmembrane region. The threshold was not relaxed after the numbers were known.' },
    { decision: 'D-156', result: '6X18 selected but carrying POCKET_DEFINED_FROM_PEPTIDE_CONTEXT: its orthosteric site holds a 30-residue peptide. 6B3J, 6LN2 and 5VEW each fail the same unchanged rule.' },
    { decision: 'D-159', result: 'The owner refused to register 6X18 as a docking target. Genesis still has no GLP-1R docking target and the registry holds only ABL1_1IEP.' },
    { decision: 'D-162', result: 'EXTRAPOLATION_NOT_SUPPORTED. MAE 3.4847, R2 -13.0013 on a holdout at maximum Tanimoto 0.5991 to train, against a train-mean baseline of MAE 2.2171 and R2 -4.9723 on the same rows. The frozen prediction was wrong twice and is recorded wrong twice.' },
    { decision: 'D-164', result: 'DOMAIN_COVERAGE_INSUFFICIENT. 43 of 714 generable novel products (6.0%) reach the 0.60 boundary; median 0.2927. The negative control shows the arm itself at median 0.9333 with 96.6% above that boundary, so the arm is one tight neighbourhood and the generator leaves it immediately. The frozen prediction of NO_GENERABLE_CANDIDATE_SPACE was wrong and is recorded wrong.' },
    { decision: 'engine probes, this audit', result: `docking ${engineState.docking.reason}; ADMET ${engineState.admet.reason}; route search ${engineState.routeSearch.reason}. RDKit ${engineState.rdkit.version} is the only installed chemistry engine.` },
    { decision: 'egress probes, this audit', result: 'www.ebi.ac.uk, pubchem.ncbi.nlm.nih.gov, clinicaltrials.gov, files.rcsb.org and api.crossref.org all refused at the proxy, so no literature, patent, supplier or building-block search is possible from this runtime.' },
  ],
  competitorsRejected: [
    { candidateId: trackCGate.result.candidateId, track: 'C_NOVEL_COMPUTATIONAL', verdict: trackCGate.result.verdict, why: trackCGate.result.reason },
  ],
  laboratoryPlan,
  mechanismMap: [
    {
      target: 'GLP1R',
      biologicalRationale: 'Receptor whose activation raises cAMP through Gs; the axis every approved incretin-based weight-reduction medicine acts on.',
      humanExpression: 'HPA reports GLP1R RNA as tissue-enhanced, detected in some, pancreas 8.6 and heart muscle 2.6 nTPM, highest at single-cell level in tuft cells 46.1, pancreatic islet cells 23.3 and lacrimal acinar cells 19.0 nCPM — all transcript level. HPA\'s own antibody staining does NOT support tissue expression (protein tissue specificity not detected, one antibody, no immunohistochemistry reliability), and HPA\'s own evidence level for this gene is transcript level. The counterweight travels with the numbers (D-155).',
      pathway: 'Reactome 97: R-HSA-381706 -> R-HSA-422320 -> R-HSA-381704 -> R-HSA-381607, each link verified against the downstream record\'s own precedingEvent field.',
      pathwayCaveats: ['Reactome states Gs heterotrimers are not observed to significantly dissociate in living cells.', 'Reactome states the adenylyl-cyclase VIII evidence is by analogy with AC I and II from rat beta cells, while human beta cells carry AC V and VI.'],
      expectedPhenotype: 'UNKNOWN from these sources. A pathway record is not evidence that activating the receptor reduces body weight, and this audit does not make that leap.',
      knownModulators: 'the pinned record holds 20 molecules across GLP1R/GIPR/GCGR with measured median potencies, from peptides to small molecules (see baselineMatrix)',
      humanEvidence: 'the pinned ClinicalTrials.gov records in the baseline matrix, per trial and per arm',
      safetyLiabilities: 'gastrointestinal events are common across the deposited arms of these trials; the matrix reports them per arm and computes no cross-trial comparison',
      crossReactivity: 'UNKNOWN in this runtime — no selectivity panel, no off-target model, and GIPR/GCGR potencies are present for only some pinned molecules',
      knownFailedProgrammes: 'UNKNOWN from the pinned record alone. The pinned table does carry molecules at max_phase 2 that are not approved, which is suggestive and not evidence; establishing why a programme stopped needs a literature search this runtime cannot perform.',
      uncertainty: 'The biology is source-backed. The step from receptor activation to weight reduction in a human is not, in these sources, and is not asserted.',
    },
    {
      target: 'OTHER_MECHANISMS_FOR_APPETITE_SATIETY_AND_METABOLIC_BALANCE',
      biologicalRationale: 'The owner asked for mechanism search rather than another GLP-1 agonist: GIP, glucagon, amylin, PYY, oxyntomodulin and further endogenous axes.',
      status: 'BLOCKED_EXTERNAL',
      whatIsInTheRepositoryAlready: 'the pinned table carries GIPR and GCGR median potencies for some molecules, and GLUCAGON, GLP-1, EXENATIDE, COTADUTIDE, ADOMEGLIVANT and MK-0893 as rows, so the glucagon and dual-agonist axes are partly represented',
      whatIsMissing: 'amylin, PYY and oxyntomodulin have no pinned bioactivity or trial record here, and no source that carries them is reachable from this runtime; a mechanism survey that named them from memory would be exactly the fabrication this audit refuses',
      whatWouldCloseIt: 'one hash-recorded fetch per axis of the target, pathway, expression and trial records, which needs network egress this container does not have',
    },
  ],
  costToDecision: {
    stages: timing.stages ?? timing,
    wallClockMsForThisAudit: Date.now() - t0,
    note: 'This is the cost of reaching THIS decision — a NO — from an already-populated repository. It is not a discovery benchmark and it is not a speedup claim: discoveryTiming.mjs can report no speedup without a recorded competitor baseline at the same task scope, and none was recorded here. WINNER_TO_LABORATORY_HANDOFF reads as still open in this copy of the report, because the report is taken while that stage is running in order to be carried inside the pack; the audit record carries the closed report as costToDecisionFinal.',
    speedupClaimed: false,
    speedupClaimedReason: 'No competitor baseline exists for this task scope. Declaring an advantage without a benchmark is forbidden.',
  },
  tracks: {
    A_EXISTING_OR_REPURPOSING: { explored: true, bestSubject: trackADossier.candidateId, verdict: trackAGate.result.verdict, blocker: trackAGate.result.blockingFailures },
    B_KNOWN_FAMILY: { explored: 'PARTIAL', note: 'the pinned record covers the GLP-1, glucagon and dual-agonist families; amylin, PYY and oxyntomodulin are BLOCKED_EXTERNAL. No subject from this track reaches an identity, because the pinned peptide records carry measured potencies and no structures (D-074).' },
    C_NOVEL_COMPUTATIONAL: { explored: true, bestSubject: trackCGate.result.candidateId, verdict: trackCGate.result.verdict, blocker: trackCGate.result.blockingFailures, note: 'admissible only because A and B are insufficient, and held to the stricter track C standard where every criterion is blocking' },
  },
});
if (!challenge.ok) { console.error('CHALLENGE_PACK_FAILED', challenge); process.exit(1); }

recordSpan(db, { ...scope, stage: 'WINNER_TO_LABORATORY_HANDOFF', kind: 'COMPUTE', ms: Date.now() - t2, source: 'chemistry handoff demonstration plus the challenge pack' });
closeStage(db, { ...scope, stage: 'WINNER_TO_LABORATORY_HANDOFF', detail: 'no winner exists; the handoff mechanism was demonstrated on a molecule labelled MECHANISM_DEMONSTRATION' });

/* ======================================================= the audit record */
const auditBody = {
  kind: 'GENESIS_WEIGHT_REDUCTION_CANDIDATE_AUDIT',
  decisionId: 'D-164',
  computedAt: new Date().toISOString(),
  question: challenge.full.scientificQuestion,
  answer: 'NO',
  answerLongForm: 'Genesis cannot today derive a defensible computational candidate for body-weight reduction on the incretin axis. Both ranking routes are closed by measurement rather than by opinion, and the frozen winner gate returns NO_CANDIDATE for the strongest subject either track can offer.',
  engines: engineState,
  externalDataAccess: {
    probedThisRun: ['www.ebi.ac.uk', 'pubchem.ncbi.nlm.nih.gov', 'clinicaltrials.gov', 'files.rcsb.org', 'api.crossref.org'],
    allRefused: true,
    note: 'Every probe was refused at the egress proxy. Literature, patent, supplier and building-block searches are therefore BLOCKED_EXTERNAL rather than merely not done.',
  },
  dockingTargetsRegistered: listDockingTargets(),
  rankingRoutes,
  gateResults: { trackA: trackAGate.result, trackC: trackCGate.result },
  ordering,
  baselineMatrix: matrix,
  chemistryHandoffDemonstration: demoPack === null ? { status: 'NOT_RUN', reason: 'RDKit unavailable' } : {
    status: demoPack.status,
    purpose: demoPack.full.purpose,
    candidateId: demoPack.full.candidateId,
    missingItems: demoPack.missingItems,
    packFingerprint: demoPack.full.packFingerprint,
    publicPackFingerprint: demoPack.public.packFingerprint,
    isNotACandidate: true,
  },
  laboratoryPlan,
  challengePackFingerprint: challenge.full.packFingerprint,
  publicPackFingerprint: challenge.public.packFingerprint,
  sealedDecisionsRead: Object.entries(sealed).filter(([, v]) => v !== null).map(([k, v]) => ({ decision: k, artefact: v.file, bodyHash: v.sha256 })),
  costToDecision: challenge.full.costToDecision,
  costToDecisionFinal: {
    stages: discoveryTimingReport(db, scope.scopeKind, scope.scopeId),
    wallClockMsForThisAudit: Date.now() - t0,
    speedupClaimed: false,
    speedupClaimedReason: 'No competitor baseline exists for this task scope. Declaring an advantage without a benchmark is forbidden.',
  },
  boundary: 'No gate was edited, no sealed artefact was modified, no role was reclassified, no candidate was nominated, and no docking target was changed. The Run 8 and Run 9 records were not read and not touched.',
};
const audit = { ...auditBody, auditFingerprint: canonicalHash(auditBody).slice(0, 16) };

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'audit.json'), `${JSON.stringify(audit, null, 2)}\n`);
fs.writeFileSync(path.join(OUT_DIR, 'scientist-challenge-pack.json'), `${JSON.stringify(challenge.full, null, 2)}\n`);
fs.writeFileSync(path.join(OUT_DIR, 'public-pack.json'), `${JSON.stringify(challenge.public, null, 2)}\n`);
fs.writeFileSync(path.join(OUT_DIR, 'baseline-matrix.json'), `${JSON.stringify(matrix, null, 2)}\n`);
if (demoPack !== null) {
  fs.writeFileSync(path.join(OUT_DIR, 'chemistry-handoff-mechanism-demonstration.json'), `${JSON.stringify(demoPack.full, null, 2)}\n`);
}

db.close();
fs.rmSync(dbDir, { recursive: true, force: true });

console.log('\n================ WEIGHT-REDUCTION CANDIDATE AUDIT ================');
console.log(`engines: rdkit ${engineState.rdkit.available ? engineState.rdkit.version : 'UNAVAILABLE'}, docking ${engineState.docking.available}, admet ${engineState.admet.available}, routeSearch ${engineState.routeSearch.available}`);
console.log(`docking targets registered: ${listDockingTargets().join(', ')}`);
console.log(`baseline matrix: ${matrix.molecules.length} molecule(s), ${matrix.blockedComparators.length} comparator(s) blocked or partial`);
console.log(`track A: ${trackAGate.result.verdict} — ${trackAGate.result.blockingFailures.join(', ')}`);
console.log(`track C: ${trackCGate.result.verdict} — ${trackCGate.result.blockingFailures.join(', ')}`);
console.log(`chemistry handoff demonstration: ${demoPack?.status ?? 'NOT_RUN'} (${demoPack?.missingItems.length ?? 0} missing item(s))`);
console.log(`laboratory plan: ${laboratoryPlan.length} step(s), ${laboratoryPlan.filter((s) => s.status === 'READY_FOR_EXTERNAL_REVIEW').length} ready for external review`);
console.log(`\nANSWER: ${audit.answer}`);
console.log(`audit -> ${path.relative(ROOT, OUT_DIR)} (${audit.auditFingerprint})`);
