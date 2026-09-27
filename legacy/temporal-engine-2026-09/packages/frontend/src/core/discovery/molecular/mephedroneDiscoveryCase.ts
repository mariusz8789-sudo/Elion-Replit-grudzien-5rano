import { ALL_RECORDS } from './opioidBioactivityPack4';
import { KNOWLEDGE_PACK_3_RECORDS } from './knowledgePack3';
import { KNOWLEDGE_PACK_4_RECORDS } from './knowledgePack4';
import type { ComparableMeasurement, ComparisonProfile } from './referenceComparison';
import type { EndToEndDiscoveryRequest } from './endToEndDiscovery';
import type { MechanismPrerequisiteSet } from './mechanismPrerequisite';
import type { Objective } from './multiObjective';
import type { DiscoveryQuestion } from './types';

/**
 * THE MEPHEDRONE / 4-MMC DISCOVERY CASE — the concrete question this engine
 * is executed on.
 *
 * EVERY MEASUREMENT HERE IS READ OUT OF AN INGESTED PACK AT MODULE LOAD.
 * Nothing is retyped, so a value cannot drift away from the record it came
 * from, and a pack that stops containing a record makes the corresponding
 * measurement list shrink rather than silently keeping a stale number.
 *
 * WHAT GENESIS ACTUALLY HAS ON 4-MMC — and this is the honest, load-bearing
 * fact of the whole case: exactly ONE ingested primary record, Pifl 2015's
 * human-striatal-vesicle VMAT2 IC50. The DAT/NET/SERT releaser pharmacology
 * mephedrone is best known for is NOT in any ingested pack. That absence is
 * carried through the run as absence — it is never filled in from general
 * knowledge, and it is the single biggest gap this case reports.
 */
export const MEPHEDRONE_DISCOVERY_CASE_VERSION = '1.0.0';

/** Structures below are cross-checked against these formulas by real RDKit at run time. */
const MEPHEDRONE_SMILES = 'CNC(C)C(=O)c1ccc(C)cc1';
const KETAMINE_SMILES = 'CNC1(c2ccccc2Cl)CCCCC1=O';
const MORPHINE_SMILES = 'CN1CC[C@]23c4c5ccc(O)c4O[C@H]2[C@@H](O)C=C[C@H]3[C@H]1C5';
const DIAZEPAM_SMILES = 'CN1C(=O)CN=C(c2ccccc2)c2cc(Cl)ccc21';
const DOPAMINE_SMILES = 'NCCc1ccc(O)c(O)c1';

function fromPack3(compound: string): ComparableMeasurement[] {
  return KNOWLEDGE_PACK_3_RECORDS
    .filter((r) => r.compound === compound)
    .map((r) => ({
      compound: r.compound,
      target: r.target,
      assay: r.assay,
      parameter: r.parameter,
      value: r.value,
      unit: r.unit,
      model: r.model,
      species: r.species,
      source: r.source,
    }));
}

function fromPack4Nmdar(compound: string): ComparableMeasurement[] {
  return KNOWLEDGE_PACK_4_RECORDS
    .filter((r) => r.compound === compound)
    .map((r) => ({
      compound: r.compound,
      target: r.target,
      assay: r.assay,
      parameter: r.parameter,
      value: r.value,
      unit: r.unit,
      model: r.model,
      species: r.species,
      source: r.source,
    }));
}

function fromOpioidPack(compound: string): ComparableMeasurement[] {
  return ALL_RECORDS
    .filter((r) => r.compound === compound && r.valueStatus === 'EXACT' && r.value !== null)
    .map((r) => ({
      compound: r.compound,
      target: r.target,
      assay: r.assayDescription,
      parameter: r.parameter,
      value: String(r.value),
      unit: r.unit,
      model: r.model,
      species: r.species,
      source: r.source.label,
    }));
}

/**
 * The subject. Its target list contains only VMAT2 because that is the only
 * 4-MMC target with an ingested primary record — see the module doc comment.
 */
export const MEPHEDRONE_SUBJECT: ComparisonProfile = {
  compound: '4-MMC (mephedrone)',
  smiles: MEPHEDRONE_SMILES,
  expectedFormula: 'C11H15NO',
  targets: ['VMAT2'],
  mechanismClass: 'substituted cathinone acting on monoamine storage/transport',
  measurements: fromPack3('4-MMC'),
  evidence: [
    {
      source: 'LITERATURE',
      identifier: 'pmid:25771452',
      establishes: 'Pifl 2015: 4-MMC inhibits [3H]dopamine vesicular uptake at human striatal VMAT2 with IC50 223 µM — a weak, real, same-compound measurement. It is the only ingested primary record for 4-MMC.',
    },
    {
      source: 'LITERATURE',
      identifier: 'pmid:30345459',
      establishes: 'Saha 2018: substituted cathinones (butylone, pentylone) characterised at human DAT/SERT in HEK293; establishes that this scaffold class engages monoamine transporters, without supplying any 4-MMC value.',
    },
  ],
};

export const KETAMINE_REFERENCE: ComparisonProfile = {
  compound: 'Ketamine',
  smiles: KETAMINE_SMILES,
  expectedFormula: 'C13H16ClNO',
  targets: ['NMDAR'],
  mechanismClass: 'uncompetitive NMDA receptor open-channel blocker',
  measurements: [...fromPack4Nmdar('Ketamine'), ...fromPack3('Ketamine')],
  evidence: [
    {
      source: 'LITERATURE',
      identifier: 'pmid:19371579',
      establishes: 'Gilling 2009: ketamine IC50 0.71 µM at human GluN1/GluN2A NMDAR, whole-cell patch clamp in HEK-293, with kinetic constants from the same assay.',
    },
  ],
};

export const OPIOID_REFERENCE: ComparisonProfile = {
  compound: 'Morphine',
  smiles: MORPHINE_SMILES,
  expectedFormula: 'C17H19NO3',
  targets: ['MOR / OPRM1', 'KOR / OPRK1', 'DOR / OPRD1'],
  mechanismClass: 'opioid receptor agonist (Gi/o-coupled GPCR)',
  measurements: fromOpioidPack('Morphine'),
  evidence: [
    {
      source: 'LITERATURE',
      identifier: 'doi:10.1371/journal.pone.0217371',
      establishes: 'Olson 2019: morphine binding Ki at human MOR/DOR/KOR by [3H]diprenorphine competition in CHO, same-assay across the panel.',
    },
    {
      source: 'LITERATURE',
      identifier: 'PMC12408109',
      establishes: 'Obeng 2025: morphine binding Ki and 35S-GTPgammaS EC50/Emax at human MOR/KOR/DOR — a second, independent same-assay panel that conflicts with Olson on MOR Ki.',
    },
  ],
};

/**
 * The benzodiazepine reference is included BECAUSE it was named, and it is
 * carried with its citation problem intact: Pack #3 marks both Diazepam
 * records NOT_AVAILABLE because the supplied DOI and PMID resolve to
 * unrelated papers. Its measurements therefore come through as they are —
 * with a source Genesis could not accept — and the comparison is reported on
 * that basis rather than quietly dropped.
 */
export const BENZODIAZEPINE_REFERENCE: ComparisonProfile = {
  compound: 'Diazepam',
  smiles: DIAZEPAM_SMILES,
  expectedFormula: 'C16H13ClN2O',
  targets: ['GABA-A (α1-mediated)', 'GABA-A (α2-mediated)'],
  mechanismClass: 'positive allosteric modulator of the GABA-A receptor',
  measurements: fromPack3('Diazepam'),
  evidence: [
    {
      source: 'LITERATURE',
      identifier: 'pack3:diazepam-citation-rejected',
      establishes: 'Pack #3 records both Diazepam entries as NOT_AVAILABLE: the supplied DOI resolves to an unrelated paper and the supplied PMID to a nursing study, so the claim was not accepted as verified.',
    },
  ],
};

/**
 * The natural/endogenous reference. Its target assignment is explicitly
 * USER_SUPPLIED, not an ingested primary record — dopamine's role as the
 * endogenous monoamine-transporter substrate is textbook, and labelling it
 * that way is the difference between citing evidence and citing common
 * knowledge. It carries no measurements, so the functional axis against it
 * resolves to NOT_ESTABLISHED rather than to a number.
 */
export const ENDOGENOUS_REFERENCE: ComparisonProfile = {
  compound: 'Dopamine',
  smiles: DOPAMINE_SMILES,
  expectedFormula: 'C8H11NO2',
  targets: ['DAT', 'NET', 'SERT', 'VMAT2'],
  mechanismClass: 'endogenous monoamine transporter substrate',
  measurements: [],
  evidence: [
    {
      source: 'USER_SUPPLIED',
      identifier: 'textbook-designation',
      establishes: 'Dopamine is the endogenous substrate of DAT and of VMAT2. This is a textbook designation supplied to the campaign, NOT an ingested primary record, and no quantitative value is attached to it.',
    },
  ],
};

export const MEPHEDRONE_REFERENCES: readonly ComparisonProfile[] = [
  KETAMINE_REFERENCE,
  OPIOID_REFERENCE,
  BENZODIAZEPINE_REFERENCE,
  ENDOGENOUS_REFERENCE,
];

/**
 * Necessary structural and exposure conditions for the subject's mechanism.
 *
 * Each is anchored to an ingested record, and each is a NECESSARY condition
 * only: failing one excludes a candidate from THIS mechanism hypothesis,
 * passing all of them establishes nothing about activity. The exposure bounds
 * are declared heuristics for CNS availability, labelled as such — they are
 * not measurements and not thresholds any experiment in this runtime
 * established.
 */
export const MEPHEDRONE_PREREQUISITES: MechanismPrerequisiteSet = {
  referenceCompound: '4-MMC (mephedrone)',
  mechanism: 'central monoamine storage/transport activity of the substituted-cathinone scaffold',
  pharmacophore: [
    {
      prerequisiteId: 'aromatic-ring',
      smarts: 'c1ccccc1',
      requirement: 'REQUIRED',
      rationale: 'The substituted-cathinone scaffold characterised at monoamine transporters is built on an aryl ring; a candidate without one is outside the scaffold class the ingested evidence describes.',
      evidenceRef: 'Saha 2018 (pmid:30345459); Pifl 2015 (pmid:25771452)',
    },
    {
      prerequisiteId: 'basic-amine',
      smarts: '[NX3;H2,H1,H0;!$(N-C=O);!$(N-S=O);!$(N-[a])]',
      requirement: 'REQUIRED',
      rationale: 'Monoamine transporter and VMAT2 recognition in this scaffold class depends on a protonatable aliphatic nitrogen; an amide or aniline nitrogen does not substitute for it.',
      evidenceRef: 'Saha 2018 (pmid:30345459); Pifl 2015 (pmid:25771452)',
    },
    {
      prerequisiteId: 'beta-keto-cathinone',
      smarts: '[CX3](=O)[CX4][NX3]',
      requirement: 'REQUIRED',
      rationale: 'The beta-keto group adjacent to the amine-bearing carbon is what distinguishes a cathinone from a plain phenethylamine, and is the feature the ingested cathinone records share.',
      evidenceRef: 'Saha 2018 (pmid:30345459); Pifl 2015 (pmid:25771452)',
    },
  ],
  exposure: [
    {
      prerequisiteId: 'cns-tpsa',
      propertyId: 'tpsa',
      max: 90,
      rationale: 'A central mechanism requires CNS exposure. TPSA above ~90 A^2 is a widely used heuristic bound for CNS availability — a declared heuristic, not a measurement.',
      evidenceRef: 'declared campaign heuristic (physicochemical, not experimental)',
    },
    {
      prerequisiteId: 'cns-molecular-weight',
      propertyId: 'molecularWeight',
      max: 450,
      rationale: 'Same reasoning as TPSA: a molecule far outside the CNS-drug mass range is unlikely to reach the compartment where the reference mechanism operates.',
      evidenceRef: 'declared campaign heuristic (physicochemical, not experimental)',
    },
    {
      prerequisiteId: 'predicted-bbb-penetration',
      propertyId: 'bloodBrainBarrier',
      min: 0.5,
      rationale: 'ADMET-AI predicted probability of blood-brain-barrier penetration. A MODEL PREDICTION, never a measurement; it excludes candidates the model puts on the wrong side of its own decision boundary.',
      evidenceRef: 'ADMET-AI model prediction (MODEL_PREDICTION status)',
    },
  ],
};

export const MEPHEDRONE_QUESTION: DiscoveryQuestion = {
  questionId: 'q_4mmc_scaffold_analogues_v1',
  question:
    'Starting from 4-MMC (mephedrone), which ring-substituted analogues of the same cathinone scaffold '
    + 'retain the structural and exposure prerequisites of its documented mechanism, while differing in '
    + 'predicted ADMET liabilities — and what would have to be measured to test any of them?',
  target: {
    targetId: 'VMAT2',
    label:
      'Vesicular monoamine transporter 2 — the only target with an ingested primary record for the subject '
      + 'compound (Pifl 2015, human striatal vesicles, IC50 223 µM). Genesis has no affinity engine for it, '
      + 'so no candidate receives a predicted affinity at this target.',
    source: 'ACTUAL_SOURCE',
    affinityCapability: 'REQUIRES_EXPERIMENT',
  },
  constraints: {
    allowedElements: ['C', 'H', 'N', 'O', 'F', 'Cl'],
    maxHeavyAtoms: 30,
    criteria: [
      { criterionId: 'molecular-weight', propertyId: 'molecularWeight', op: 'lte', value: 450, required: true, rationale: 'Keeps candidates in a mass range where the declared CNS heuristics are meaningful.' },
      { criterionId: 'logp-window', propertyId: 'logP', op: 'range', value: 0, valueMax: 5, required: true, rationale: 'Excludes candidates too polar or too lipophilic for the exposure route the mechanism needs.' },
      { criterionId: 'hbd-limit', propertyId: 'hbd', op: 'lte', value: 3, required: true, rationale: 'Hydrogen-bond donor count above this range is associated with poor CNS availability.' },
      { criterionId: 'rotatable-bonds', propertyId: 'rotatableBonds', op: 'lte', value: 8, required: false, rationale: 'Conformational flexibility, reported but not used to reject.' },
    ],
  },
};

/**
 * Objectives are kept SEPARATE on purpose — no single blended score. Each
 * names the real property it reads, and ADMET objectives are model
 * predictions, which the ranking result states in its own caveat.
 */
export const MEPHEDRONE_OBJECTIVES: readonly Objective[] = [
  { objectiveId: 'lower-mutagenicity', propertyId: 'mutagenicity', direction: 'minimise', rationale: 'Predicted Ames-positive probability (ADMET-AI). A prediction, not a genotoxicity result.' },
  { objectiveId: 'lower-liver-injury', propertyId: 'liverInjury', direction: 'minimise', rationale: 'Predicted drug-induced liver injury probability (ADMET-AI).' },
  { objectiveId: 'lower-clinical-toxicity', propertyId: 'clinicalToxicity', direction: 'minimise', rationale: 'Predicted clinical-trial toxicity failure probability (ADMET-AI).' },
  { objectiveId: 'higher-absorption', propertyId: 'admetAbsorption', direction: 'maximise', rationale: 'Predicted high human intestinal absorption probability (ADMET-AI).' },
  { objectiveId: 'cathinone-like-logp', propertyId: 'logP', direction: 'target', targetValue: 1.7856, rationale: 'The real RDKit Crippen logP of 4-MMC itself (1.7856), used as the reference point candidates are compared against.' },
];

export function mephedroneDiscoveryRequest(): EndToEndDiscoveryRequest {
  return {
    question: MEPHEDRONE_QUESTION,
    subject: MEPHEDRONE_SUBJECT,
    references: MEPHEDRONE_REFERENCES,
    prerequisites: MEPHEDRONE_PREREQUISITES,
    // Exactly the transformations the RDKit worker really implements.
    transformations: ['add-fluoro', 'add-chloro', 'add-hydroxyl', 'add-methyl', 'add-amino', 'add-nitrile'],
    depth: 2,
    maxCandidates: 60,
    objectives: MEPHEDRONE_OBJECTIVES,
  };
}
