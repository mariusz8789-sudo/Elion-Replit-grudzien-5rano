/* Proprietary / All Rights Reserved - Genesis OS */
/**
 * THE CHEMISTRY HANDOFF PACKAGE (D-164) — the identity and the evidence a professional
 * chemist needs in order to design execution under their own procedures, safety rules
 * and regulations.
 *
 * ========================= THE ABSOLUTE OWNER CONSTRAINT =========================
 *
 * THIS PACKAGE NEVER CONTAINS AN OPERATIONAL SYNTHESIS PROCEDURE. No quantity, no
 * temperature, no time, no concentration, no pressure, no equivalents, no step-by-step
 * operation. Not as an example, not as a suggestion, not "typically". The package
 * carries IDENTITY, EVIDENCE and CONCEPTUAL chemistry — bond disconnections, classes of
 * commercially available building blocks, a rough step count, which transformation is
 * riskiest, which selectivity problem to expect, which analytical methods confirm
 * identity and purity. The chemist designs the experiment.
 *
 * `assertNonOperational()` enforces this on the serialised package, with a pattern set
 * that catches a number next to a unit of mass, volume, temperature, time, amount or
 * concentration, and the imperative verbs of a laboratory procedure. A package that
 * trips it is not emitted — the generator throws rather than returning something the
 * owner forbade.
 *
 * ============================ EVERY VALUE IS REAL ================================
 *
 * The identity block is computed by real RDKit through the production adapter
 * (`compute/rdkitAdapter.mjs`), on the real molecule. Literature, supplier status,
 * published routes, synthetic accessibility, solubility, stability, aggregation,
 * metabolism and reactivity predictions are NOT computed by this repository and NOT
 * recalled from a model's memory: every one of them comes back `UNKNOWN` or `BLOCKED`
 * with the reason and with what would be needed to close it. There is no code path here
 * that produces a plausible-looking number.
 *
 * A package whose required schema has any unfilled item reports `status: 'INCOMPLETE'`
 * and lists every missing item, so the winner gate's CHEMISTRY_HANDOFF_COMPLETE
 * criterion fails rather than passing on a pack that merely looks full.
 *
 * ================================= TWO PACKS =====================================
 *
 * `buildChemistryHandoffPackage` returns BOTH:
 *   full    — the private pack for our own scientist: structure and everything.
 *   public  — no SMILES, no InChI, no InChIKey, no formula, no structure file, no
 *             handoff items. Candidate id, a structure hash, the mechanism, the
 *             methodology, the results and the Replay proof. Emitted under
 *             IP_REVIEW_REQUIRED and tested to carry no structure.
 */

import { canonicalHash } from '../provenance.mjs';
import { sha256Hex } from '../determinism.mjs';
import * as rdkit from '../compute/rdkitAdapter.mjs';
import * as retro from '../compute/retroAdapter.mjs';

export const CHEMISTRY_HANDOFF_KIND = 'GENESIS_CHEMISTRY_HANDOFF_PACKAGE';
export const CHEMISTRY_HANDOFF_VERSION = 1;

/**
 * Patterns that identify an OPERATIONAL instruction. Deliberately broad: a false alarm
 * costs a rewrite, a miss costs the owner's hard constraint.
 */
const OPERATIONAL_PATTERNS = Object.freeze([
  // a number next to a unit of mass, volume, amount, concentration, pressure. A
  // multi-letter unit may sit against the number; a one- or two-letter unit must be
  // separated from it, so a chemical identifier like `C8H7Cl2N3O2S` is not a quantity.
  { id: 'QUANTITY', re: /\b\d+(?:[.,]\d+)?\s*(?:mg|kg|µg|ug|mcg|ng|mL|ml|µL|ul|mmol|nmol|µmol|umol|mol|equiv|psi|bar|atm|torr|mmHg)\b/i },
  { id: 'QUANTITY', re: /\b\d+(?:[.,]\d+)?[\s-]+(?:g|L|l|M|mM|µM|uM|nM|N|eq)\b/ },
  { id: 'QUANTITY', re: /\b\d+(?:[.,]\d+)?\s*%\s*(?:w\/w|v\/v|w\/v)/i },
  // a number next to a temperature
  { id: 'TEMPERATURE', re: /\b\d+(?:[.,]\d+)?\s*(?:°\s*[CF]|deg\s*[CF]|degrees?\b)/i },
  { id: 'TEMPERATURE', re: /\b\d+(?:[.,]\d+)?[\s-]+K\b/ },
  // a number next to a duration. Same rule: the one-letter forms need a separator.
  { id: 'TIME', re: /\b\d+(?:[.,]\d+)?\s*(?:sec|secs|second|seconds|min|mins|minute|minutes|hr|hrs|hour|hours|day|days|week|weeks|overnight)\b/i },
  { id: 'TIME', re: /\b\d+(?:[.,]\d+)?[\s-]+(?:s|h|d)\b/i },
  // the imperative verbs of a bench procedure
  { id: 'OPERATION', re: /\b(?:add(?:ed|ition)?\s+dropwise|stir(?:red|ring)?\s+(?:for|at)|reflux(?:ed|ing)?\s+(?:for|at)|heat(?:ed|ing)?\s+(?:to|at|for)|cool(?:ed|ing)?\s+to|quench(?:ed)?\s+with|extract(?:ed)?\s+with|wash(?:ed)?\s+with|dr(?:y|ied)\s+over|concentrat(?:e|ed)\s+(?:in vacuo|under reduced pressure)|recrystalli[sz]ed?\s+from|triturated?\s+with|charge[d]?\s+the\s+(?:flask|vessel|reactor)|under\s+(?:nitrogen|argon)\s+at)\b/i },
  { id: 'STEP_BY_STEP', re: /\b(?:step\s*\d+\s*[:.)-]\s*(?:add|stir|heat|cool|dissolve|charge|filter|wash|dry|quench)|procedure\s*[:.]\s*(?:to\s+a|add|charge|dissolve))/i },
  { id: 'GLASSWARE_WITH_SIZE', re: /\b\d+\s*(?:mL|ml|L|l)\s*(?:round[- ]bottom(?:ed)?\s*)?(?:flask|vessel|vial|reactor|autoclave)\b/i },
]);

/**
 * Keys whose values are machine identifiers, not prose. A SMILES, an InChI, a formula or
 * a hash is a dense string of digits and letters that will collide with any pattern broad
 * enough to catch a real procedure, so the scan skips them BY KEY — never by relaxing the
 * patterns, which would be the move that lets a real procedure through.
 */
const IDENTIFIER_KEYS = Object.freeze(new Set([
  'canonicalSmiles', 'isomericSmiles', 'parentSmiles', 'smiles', 'inchi', 'inchiKey',
  'molecularFormula', 'canonicalTautomerSmiles', 'scaffold',
  'structureHash', 'coordinatesSha256', 'sha256', 'packFingerprint', 'matrixFingerprint',
  'resultFingerprint', 'protocolFingerprint', 'handoffFingerprint', 'outputHash', 'inputHash',
  'recordedHash', 'recomputedHash', 'datasetHash', 'modelFingerprint', 'trainingDataHash',
]));

/**
 * Subtrees that are VERBATIM THIRD-PARTY RECORDS, carried unchanged: trial-registry arm
 * labels, endpoint titles and deposited units. A registry arm titled with a clinical dose
 * is not a synthesis instruction, and rewriting it to satisfy a synthesis guard would
 * falsify an external record. They are skipped BY KEY, and the guard's subject stays what
 * it is — synthesis content written by Genesis.
 *
 * This is the only exemption, it is a whole-subtree one, and a pack that wants to hide
 * synthesis text inside one of these keys would have to be constructed deliberately: a
 * test asserts the exempt keys are exactly this set.
 */
export const EXTERNAL_RECORD_KEYS = Object.freeze(new Set([
  'baselineMatrix', 'referenceHeadToHead', 'bodyWeightEndpoints', 'adverseEventEndpoints',
  'directRandomisedWeightComparisons', 'trials', 'arms', 'armTitle', 'armA', 'armB',
  'briefTitle', 'outcomeTitle', 'unitOfMeasure', 'endpointDefinition',
]));

/** Collects the PROSE of a package: every string value that is not a machine identifier. */
function prosePartsOf(value, key = null, out = []) {
  if (key !== null && (IDENTIFIER_KEYS.has(key) || EXTERNAL_RECORD_KEYS.has(key))) return out;
  if (typeof value === 'string') { out.push(value); return out; }
  if (value === null || typeof value !== 'object') return out;
  if (Array.isArray(value)) { for (const v of value) prosePartsOf(v, key, out); return out; }
  for (const [k, v] of Object.entries(value)) prosePartsOf(v, k, out);
  return out;
}

/**
 * Throws if the package reads as an operational procedure. Exported so a caller that
 * assembles its own pack can run the same check at its own boundary.
 */
export function assertNonOperational(pack, { where = 'chemistry handoff package' } = {}) {
  const text = typeof pack === 'string' ? pack : prosePartsOf(pack).join('\n');
  const hits = OPERATIONAL_PATTERNS.filter((p) => p.re.test(text)).map((p) => p.id);
  if (hits.length > 0) {
    throw new Error(`${where} contains operational synthesis content (${hits.join(', ')}) — the owner forbids quantities, temperatures, times, concentrations and step-by-step operations in this package`);
  }
  return true;
}

/** The required schema. An item not filled from a real source or computation is missing. */
export const REQUIRED_ITEMS = Object.freeze([
  'candidateId', 'canonicalSmiles', 'isomericSmiles', 'inchi', 'inchiKey', 'molecularFormula',
  'molecularWeight', 'chargeAndProtonationState', 'stereochemistry', 'tautomersAndProtomers',
  'structure2D', 'structure3D', 'provenanceAndLicencePerDataItem', 'compoundClass',
  'referenceCompoundSuppliers', 'publishedRoutesOrAnalogousClasses', 'syntheticAccessibility',
  'knownChemicalAndStabilityRisks', 'predictedSolubilityProblems', 'predictedStabilityProblems',
  'predictedAggregationProblems', 'predictedStereochemistryProblems', 'predictedMetabolismProblems',
  'predictedReactivityProblems', 'evidencePack', 'replay', 'allEngineResultsIncludingNegative',
  'rankingAgainstCompetitors', 'whyItWon', 'stillUnknown', 'firstLaboratoryMeasurements',
  'laboratoryResultsThatWouldFalsifyIt', 'literatureWithIdentifiers',
  'conceptualRetrosyntheticDisconnections', 'commerciallyAvailableBuildingBlockClasses',
  'roughStepCount', 'riskiestTransformations', 'expectedSelectivityProblems',
  'identityAndPurityConfirmationMethods',
]);

/** An item that is genuinely unavailable. Never a number, never a guess. */
const unavailable = (status, reason, whatWouldCloseIt) => Object.freeze({
  status, value: null, reason, whatWouldCloseIt,
});

const UNKNOWN = (reason, whatWouldCloseIt) => unavailable('UNKNOWN', reason, whatWouldCloseIt);
const BLOCKED = (reason, whatWouldCloseIt) => unavailable('BLOCKED', reason, whatWouldCloseIt);

/** Is this item filled? A `status` of UNKNOWN or BLOCKED means no. */
function isFilled(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'object' && !Array.isArray(v) && typeof v.status === 'string') {
    return v.status !== 'UNKNOWN' && v.status !== 'BLOCKED' && v.status !== 'INCOMPLETE';
  }
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'string') return v.trim() !== '';
  return true;
}

/**
 * The identity block, from real RDKit. Returns `{ ok:false }` when RDKit is unavailable:
 * there is no fallback identity, because an identity nobody computed is not an identity.
 */
function identityFromRdkit(smiles) {
  const d = rdkit.detect();
  if (!d?.available) {
    return { ok: false, code: 'BLOCKED_BY_RUNTIME', reason: `RDKit unavailable: ${d?.reason ?? 'unknown'}` };
  }
  const desc = rdkit.descriptors(smiles);
  if (!desc.ok) return { ok: false, code: 'IDENTITY_NOT_COMPUTABLE', reason: desc.error ?? 'descriptors failed' };
  const liab = rdkit.liabilities(smiles);
  const stereo = typeof rdkit.stereochemistry === 'function' ? rdkit.stereochemistry(smiles) : { ok: false, error: 'adapter_has_no_stereochemistry_command' };
  const geom = rdkit.embed3d(smiles);
  return {
    ok: true,
    engine: desc.engine ?? d.engine ?? null,
    descriptors: desc.data,
    liabilities: liab.ok ? liab.data : null,
    liabilityCatalogs: liab.ok ? liab.catalogs ?? null : null,
    stereo: stereo.ok ? stereo : null,
    stereoError: stereo.ok ? null : (stereo.error ?? stereo.reason ?? 'unavailable'),
    geometry: geom.ok ? geom : null,
    geometryError: geom.ok ? null : (geom.error ?? geom.reason ?? 'unavailable'),
  };
}

/**
 * Builds the package for one molecule.
 *
 * @param {object} input
 * @param {string} input.candidateId
 * @param {string} input.smiles the molecule, as the pipeline holds it
 * @param {string} input.purpose 'CANDIDATE_HANDOFF' or 'MECHANISM_DEMONSTRATION'
 * @param {object} [input.evidence] projections the caller already has (Evidence, Replay,
 *   engine results, ranking, why it won, falsification). Anything absent is reported
 *   missing rather than invented.
 * @param {string} [input.noveltyStatus]
 */
export function buildChemistryHandoffPackage(input) {
  const {
    candidateId, smiles, purpose = 'CANDIDATE_HANDOFF',
    evidence = {}, noveltyStatus = 'PRIOR_ART_UNVERIFIED',
    compoundClass = null,
  } = input ?? {};

  if (typeof candidateId !== 'string' || candidateId.trim() === '') return { ok: false, code: 'NO_CANDIDATE_ID' };
  if (typeof smiles !== 'string' || smiles.trim() === '') return { ok: false, code: 'NO_STRUCTURE' };

  const id = identityFromRdkit(smiles);
  const retroState = retro.detect();

  const items = {
    candidateId,

    // ---- identity: real, computed now, by the production adapter ----------------
    canonicalSmiles: id.ok ? id.descriptors.canonicalSmiles : BLOCKED(id.reason, 'an RDKit runtime (GENESIS_RDKIT_PYTHON)'),
    isomericSmiles: id.ok
      ? { status: 'COMPUTED', value: id.descriptors.canonicalSmiles, note: 'RDKit MolToSmiles is called at its default isomericSmiles=true, so the canonical SMILES above IS the canonical isomeric SMILES; they are one string, reported twice rather than invented twice.' }
      : BLOCKED(id.reason, 'an RDKit runtime'),
    inchi: id.ok ? (id.descriptors.inchi ?? UNKNOWN('RDKit built without the InChI module', 'an RDKit build with InChI support')) : BLOCKED(id.reason, 'an RDKit runtime'),
    inchiKey: id.ok ? (id.descriptors.inchiKey ?? UNKNOWN('RDKit built without the InChI module', 'an RDKit build with InChI support')) : BLOCKED(id.reason, 'an RDKit runtime'),
    molecularFormula: id.ok ? id.descriptors.molecularFormula : BLOCKED(id.reason, 'an RDKit runtime'),
    molecularWeight: id.ok
      ? { status: 'COMPUTED', averageMolWt: id.descriptors.molWt, exactMolWt: id.descriptors.exactMolWt, unit: 'Da', engine: id.engine }
      : BLOCKED(id.reason, 'an RDKit runtime'),
    chargeAndProtonationState: id.ok
      ? {
        status: 'COMPUTED',
        formalCharge: id.descriptors.formalCharge,
        protonationStateUsedInComputation: 'As written in the input SMILES. No protonation-state prediction engine is installed in this runtime, so no pH-dependent microspecies was computed and none is assumed.',
        pHAssumed: null,
        pKaPrediction: UNKNOWN('no pKa predictor is installed in this runtime', 'a pKa engine, or a measured pKa from the literature'),
      }
      : BLOCKED(id.reason, 'an RDKit runtime'),
    stereochemistry: id.ok
      ? (id.stereo
        ? { status: 'COMPUTED', ...id.stereo, engine: id.engine }
        : UNKNOWN(`stereocentre enumeration unavailable: ${id.stereoError}`, 'the stereochemistry command of the RDKit adapter'))
      : BLOCKED(id.reason, 'an RDKit runtime'),
    tautomersAndProtomers: id.ok
      ? (id.stereo?.tautomers
        ? { status: 'COMPUTED', ...id.stereo.tautomers, note: 'RDKit MolStandardize tautomer enumeration. The canonical tautomer is RDKit\'s scoring choice, not a statement about which tautomer predominates in any solvent. Protomers were not enumerated: no protonation engine is installed.' }
        : UNKNOWN(`tautomer enumeration unavailable: ${id.stereoError ?? 'not computed'}`, 'the stereochemistry command of the RDKit adapter'))
      : BLOCKED(id.reason, 'an RDKit runtime'),
    structure2D: id.ok
      ? { status: 'COMPUTED', representation: 'canonical isomeric SMILES', value: id.descriptors.canonicalSmiles, note: 'The SMILES IS the 2D structure Genesis used. No depiction image is generated, because an image adds nothing a chemist cannot regenerate from this string and could drift from it.' }
      : BLOCKED(id.reason, 'an RDKit runtime'),
    structure3D: id.ok
      ? (id.geometry
        ? {
          status: 'COMPUTED',
          method: `RDKit ETKDG embedding then ${id.geometry.forceField} minimisation, seed ${id.geometry.seed ?? 42}`,
          nAtoms: id.geometry.nAtoms,
          nBonds: id.geometry.nBonds,
          formalCharge: id.geometry.charge,
          coordinatesSha256: sha256Hex(JSON.stringify(id.geometry.atoms ?? [])),
          note: 'One minimised conformer, deterministic for this seed. It is NOT a bound pose, NOT a solution structure and NOT a crystal structure, and no conformational ensemble was generated.',
        }
        : UNKNOWN(`3D embedding unavailable: ${id.geometryError}`, 'an RDKit runtime that can embed this molecule'))
      : BLOCKED(id.reason, 'an RDKit runtime'),

    // ---- provenance, class ------------------------------------------------------
    provenanceAndLicencePerDataItem: Array.isArray(evidence.dataItems) && evidence.dataItems.length > 0
      ? evidence.dataItems
      : UNKNOWN('the caller supplied no per-item provenance and licence list', 'a dossier whose every data item carries source, licence and a retrieval or computation record'),
    compoundClass: compoundClass ?? (noveltyStatus === 'KNOWN_COMPOUND'
      ? 'KNOWN_COMPOUND'
      : noveltyStatus === 'NEW_COMPUTATIONAL_PROPOSAL'
        ? 'NEW_COMPUTATIONAL_PROPOSAL'
        : UNKNOWN('novelty is unverified: no prior-art search was performed', 'a prior-art search against a structure database, which needs network egress this runtime does not have')),

    // ---- everything below is NOT computable in this runtime ---------------------
    referenceCompoundSuppliers: BLOCKED('no supplier catalogue is reachable from this runtime and none is pinned in this repository', 'a hash-recorded fetch of a supplier catalogue, or a licensed catalogue shipped with the backend'),
    publishedRoutesOrAnalogousClasses: BLOCKED('no literature or patent index is reachable from this runtime and none is pinned in this repository', 'a hash-recorded literature or patent search'),
    syntheticAccessibility: retroState.available
      ? UNKNOWN('the route-search engine is installed but was not run for this molecule', 'one route search for this molecule, recorded as a Science Run')
      : BLOCKED(`the route-search engine is unavailable: ${retroState.reason ?? 'unknown'}`, retroState.installed ? 'the engine\'s model files, which are not shipped with Genesis for licence reasons' : 'an installed route-search engine plus its model files'),
    knownChemicalAndStabilityRisks: id.ok && id.liabilities
      ? {
        status: 'PARTIAL_COMPUTED',
        structuralAlerts: id.liabilities.structuralAlerts ?? [],
        structuralAlertCount: id.liabilities.structuralAlertCount ?? null,
        catalogs: id.liabilityCatalogs,
        qed: id.liabilities.qed ?? null,
        whatThisIs: 'Deterministic substructure matches against published screening-deck filter catalogues, computed by RDKit. An alert is a flag for assay interference or a known reactive motif, read from a published rule set.',
        whatThisIsNot: 'Not a toxicity prediction, not a stability measurement, not target-specific, and not a statement that the molecule is safe when the list is empty.',
        measuredStabilityData: UNKNOWN('no measured stability data for this molecule is in this repository', 'a literature value with its citation, or a measurement'),
      }
      : BLOCKED(id.ok ? 'the liability panel did not compute' : id.reason, 'an RDKit runtime'),
    predictedSolubilityProblems: BLOCKED('no solubility model is installed in this runtime', 'an ADMET engine within its licence gate, or a measured solubility with its citation'),
    predictedStabilityProblems: BLOCKED('no stability model is installed in this runtime', 'a stability-prediction engine, or measured data with its citation'),
    predictedAggregationProblems: BLOCKED('no aggregation model is installed in this runtime', 'an aggregation predictor, or a measured dynamic-light-scattering or nephelometry result'),
    predictedStereochemistryProblems: id.ok && id.stereo
      ? {
        status: 'PARTIAL_COMPUTED',
        unassignedStereocentres: id.stereo.unassignedAtomStereocentres ?? null,
        note: 'An unassigned stereocentre is a real identity problem: it means the structure above does not name one molecule. Whether a given centre is configurationally labile, or epimerises, is not computed here.',
        configurationalStabilityPrediction: UNKNOWN('no configurational-stability model is installed in this runtime', 'literature on the nearest analogues, or a measurement'),
      }
      : BLOCKED(id.ok ? `stereocentre enumeration unavailable: ${id.stereoError}` : id.reason, 'an RDKit runtime with the stereochemistry command'),
    predictedMetabolismProblems: BLOCKED('no metabolism or cytochrome-P450 model is installed in this runtime', 'an ADMET engine within its licence gate'),
    predictedReactivityProblems: id.ok && id.liabilities
      ? {
        status: 'PARTIAL_COMPUTED',
        reactiveMotifAlerts: (id.liabilities.structuralAlerts ?? []),
        note: 'Reactive-motif alerts come from the same published filter catalogues as the risk item above. No quantum-chemical reactivity calculation was run for this molecule.',
        quantumReactivity: UNKNOWN('no quantum calculation was run for this molecule', 'one quantum Science Run, recorded with its Replay'),
      }
      : BLOCKED(id.ok ? 'the liability panel did not compute' : id.reason, 'an RDKit runtime'),

    // ---- the evidence trail, projected from what the caller actually has --------
    evidencePack: isFilled(evidence.evidencePack) ? evidence.evidencePack : UNKNOWN('no Evidence Pack projection was supplied', 'an Evidence Pack covering every science run this candidate relies on, including the negative ones'),
    replay: isFilled(evidence.replay) ? evidence.replay : UNKNOWN('no Replay projection was supplied', 'a canonical Replay verification with verdict MATCH for every science run relied on'),
    allEngineResultsIncludingNegative: Array.isArray(evidence.engineResults) && evidence.engineResults.length > 0
      ? evidence.engineResults
      : UNKNOWN('no engine results were supplied, negative or otherwise', 'the campaign\'s science-run list, with the failures kept in it'),
    rankingAgainstCompetitors: isFilled(evidence.ranking) ? evidence.ranking : UNKNOWN('no ranking against competitors was supplied', 'a gate result per competitor and an ordering that does not collapse the axes into one number'),
    whyItWon: isFilled(evidence.whyItWon) ? evidence.whyItWon : UNKNOWN('nothing won: no candidate reached the gate', 'a candidate that reaches COMPUTATIONAL_CANDIDATE under the frozen winner gate'),
    stillUnknown: Array.isArray(evidence.stillUnknown) && evidence.stillUnknown.length > 0
      ? evidence.stillUnknown
      : UNKNOWN('the caller supplied no list of open questions', 'the campaign\'s own uncertainty projection'),
    firstLaboratoryMeasurements: Array.isArray(evidence.firstLaboratoryMeasurements) && evidence.firstLaboratoryMeasurements.length > 0
      ? evidence.firstLaboratoryMeasurements
      : UNKNOWN('no laboratory measurement plan was supplied', 'a preregistered measurement plan with a frozen model value and a falsification criterion'),
    laboratoryResultsThatWouldFalsifyIt: Array.isArray(evidence.falsifyingLaboratoryResults) && evidence.falsifyingLaboratoryResults.length > 0
      ? evidence.falsifyingLaboratoryResults
      : UNKNOWN('no falsification criterion for a laboratory result was supplied', 'a preregistered criterion, frozen before the measurement'),

    // ---- NON-OPERATIONAL synthesis intelligence --------------------------------
    literatureWithIdentifiers: BLOCKED('no literature index with DOIs or patent identifiers is reachable from this runtime and none is pinned in this repository', 'a hash-recorded literature and patent search for this molecule and its nearest analogues'),
    conceptualRetrosyntheticDisconnections: retroState.available
      ? UNKNOWN('the route-search engine is installed but was not run for this molecule', 'one route search, read for its DISCONNECTIONS only and never for an operational procedure')
      : BLOCKED(`the route-search engine is unavailable: ${retroState.reason ?? 'unknown'}`, 'an installed route-search engine plus its model files'),
    commerciallyAvailableBuildingBlockClasses: BLOCKED('no building-block catalogue is reachable from this runtime and none is pinned in this repository', 'a hash-recorded fetch of a building-block catalogue'),
    roughStepCount: retroState.available
      ? UNKNOWN('the route-search engine is installed but was not run for this molecule', 'one route search, read for its depth')
      : BLOCKED(`the route-search engine is unavailable: ${retroState.reason ?? 'unknown'}`, 'an installed route-search engine plus its model files'),
    riskiestTransformations: BLOCKED('without a route search there is no transformation list to rank for risk', 'a route search, then a chemist\'s own reading of its disconnections'),
    expectedSelectivityProblems: BLOCKED('without a route search there is no transformation list to assess for selectivity', 'a route search, then a chemist\'s own reading of its disconnections'),
    identityAndPurityConfirmationMethods: id.ok
      ? {
        status: 'DERIVED_FROM_STRUCTURE',
        // Method NAMES only, derived from what the computed identity makes checkable.
        // No instrument setting, no quantity, no time, no temperature.
        methods: [
          { method: 'HIGH_RESOLUTION_MASS_SPECTROMETRY', confirms: `the molecular formula ${id.descriptors.molecularFormula} and the exact mass ${id.descriptors.exactMolWt} Da`, whyThisOne: 'the formula and exact mass are the two identity values this package computed, so they are the two a mass measurement can contradict' },
          { method: 'NUCLEAR_MAGNETIC_RESONANCE', confirms: 'the connectivity the canonical SMILES asserts', whyThisOne: 'the structure is an assertion about connectivity and nothing in this package has tested it' },
          ...(id.stereo && (id.stereo.assignedAtomStereocentres ?? 0) > 0
            ? [{ method: 'CHIRAL_SEPARATION_OR_CHIROPTICAL_MEASUREMENT', confirms: `the ${id.stereo.assignedAtomStereocentres} assigned stereocentre(s)`, whyThisOne: 'a stereocentre asserted in the SMILES is unconfirmed until it is measured' }]
            : []),
          { method: 'CHROMATOGRAPHIC_PURITY_DETERMINATION', confirms: 'that the sample is one substance', whyThisOne: 'every predicted property in this package is about one structure, so a mixture invalidates all of them' },
        ],
        boundary: 'Method NAMES and what each would confirm. No instrument configuration, no sample preparation and no operating condition is given: the chemist and the analyst choose those under their own procedures.',
      }
      : BLOCKED(id.reason, 'an RDKit runtime'),
  };

  const missingItems = REQUIRED_ITEMS.filter((k) => !isFilled(items[k]));
  const status = missingItems.length === 0 ? 'COMPLETE' : 'INCOMPLETE';

  const structureHash = id.ok ? sha256Hex(id.descriptors.canonicalSmiles) : null;
  const ipReview = noveltyStatus === 'KNOWN_COMPOUND' ? 'PASS' : 'IP_REVIEW_REQUIRED';

  const fullBody = {
    kind: CHEMISTRY_HANDOFF_KIND,
    contractVersion: CHEMISTRY_HANDOFF_VERSION,
    packVisibility: 'PRIVATE_FULL',
    purpose,
    purposeNote: purpose === 'MECHANISM_DEMONSTRATION'
      ? 'MECHANISM DEMONSTRATION ONLY. This molecule is not a candidate, is not proposed for any indication, and was chosen because it exercises every branch of the generator. Nothing in this package says it does anything.'
      : 'A computational candidate handoff. Not a measurement, not clinical efficacy, not safety clearance.',
    candidateId,
    status,
    missingItems,
    missingItemsNote: 'An item listed here is genuinely absent from this runtime and this repository. It is not an estimate withheld for caution; there is no value. The winner gate\'s CHEMISTRY_HANDOFF_COMPLETE criterion fails while this list is non-empty.',
    structureHash,
    ipReview,
    noveltyStatus,
    engine: { rdkit: id.ok ? id.engine : null, routeSearch: retroState.available ? (retroState.engineVersion ?? 'AVAILABLE') : `UNAVAILABLE: ${retroState.reason ?? 'unknown'}` },
    enginesAreNotOpenSourceClaim: 'This package makes no licensing claim about any engine. Each engine\'s own licence governs its use.',
    items,
    operationalSynthesisProcedure: 'NEVER_INCLUDED',
    operationalSynthesisProcedureReason: 'The owner\'s constraint: this package carries identity and evidence so that a professional chemist designs execution under their own procedures, safety rules and regulations. It contains no quantity, temperature, duration, concentration or step-by-step operation, and the generator refuses to emit a package that does.',
    unsigned: true,
    unsignedReason: 'There is no signing key in this system. This package is UNSIGNED and its integrity rests on the hashes it carries.',
    claimBoundary: 'A structure, its computed identity, and the state of the evidence around it. Not a measurement of any molecule in any organism, not a medicine, and never a claim that adverse effects are absent.',
  };

  // The public pack: the candidate id, a hash, and the method — no structure at all.
  const publicBody = {
    kind: CHEMISTRY_HANDOFF_KIND,
    contractVersion: CHEMISTRY_HANDOFF_VERSION,
    packVisibility: 'PUBLIC_NO_STRUCTURE',
    purpose,
    candidateId,
    structureHash,
    structureWithheld: true,
    structureWithheldReason: ipReview === 'IP_REVIEW_REQUIRED'
      ? 'IP_REVIEW_REQUIRED: the structure is a new computational proposal or its novelty is unverified, so no SMILES, InChI, InChIKey, formula or structure file appears in a public pack until a review clears it.'
      : 'A public pack carries no structure by default; the full pack is the route to it.',
    mechanism: isFilled(evidence.mechanism) ? evidence.mechanism : UNKNOWN('no mechanism projection was supplied', 'the campaign\'s target-relevance record'),
    methodology: isFilled(evidence.methodology) ? evidence.methodology : UNKNOWN('no methodology projection was supplied', 'the campaign\'s preregistration and engine list'),
    results: isFilled(evidence.publicResults) ? evidence.publicResults : UNKNOWN('no public result projection was supplied', 'the campaign\'s sealed results, including the negative ones'),
    replayProof: isFilled(evidence.replay) ? evidence.replay : UNKNOWN('no Replay projection was supplied', 'a canonical Replay verification with verdict MATCH'),
    chemistryHandoffIncluded: false,
    handoffStatus: status,
    unsigned: true,
    claimBoundary: 'A method and a result, with no structure. Not a medicine, not a clinical finding, and never a claim that adverse effects are absent.',
  };

  // The owner's constraint, enforced on the bytes that would actually leave here.
  assertNonOperational(fullBody, { where: 'the private chemistry handoff package' });
  assertNonOperational(publicBody, { where: 'the public pack' });

  return {
    ok: true,
    status,
    missingItems,
    full: { ...fullBody, packFingerprint: canonicalHash(fullBody).slice(0, 16) },
    public: { ...publicBody, packFingerprint: canonicalHash(publicBody).slice(0, 16) },
  };
}
