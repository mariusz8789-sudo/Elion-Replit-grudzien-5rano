import { canonicalJson, fnv1a } from '../../events/hash';
import { falsifyCandidate, type CandidateFalsification } from './falsification';
import type { MultiObjectiveResult, RankedCandidate } from './multiObjective';
import type { ProviderDiscoveryResult } from './providerDiscoveryRun';
import { VALUED_STATUSES, type CandidateAssessment, type MoleculeCandidate, type MoleculeProperty } from './types';

/**
 * ETAP 13 — DISCOVERED CANDIDATE → SCIENTIFIC DOSSIER → VALIDATION PLAN →
 * LAB HANDOFF.
 *
 * A dossier is what a candidate needs before anyone spends laboratory time on
 * it. It is NOT a claim that the candidate works, and this module is built so
 * that it cannot accidentally become one.
 *
 * FOUR EVIDENCE GRADES, never collapsed:
 *
 *   COMPUTATION              a real engine computed this from a real structure.
 *   PREDICTION               a model's output. Not an observation.
 *   HYPOTHESIS               a stated expectation with no supporting run.
 *   EXPERIMENTALLY_VALIDATED a real measurement exists. Genesis CANNOT produce
 *                            this grade — it has no laboratory. Nothing in this
 *                            repository may assign it from a computation.
 *
 * The permitted sentence about any candidate here is: "Genesis identified a
 * computational candidate requiring experimental validation." Phrasings that
 * assert discovery, safety or efficacy are refused by `claimStatement()`.
 *
 * SYNTHESIS DISCLOSURE: this module produces planning-level analysis only —
 * route strategy, precursor CATEGORIES, analytical methods, controls,
 * equipment classes. It does not emit operational procedure: no quantities,
 * temperatures, times, addition order or step-by-step sequence. For a
 * candidate flagged as a controlled substance or a psychoactive analogue —
 * and, fail-closed, for any candidate that could not be screened — even the
 * planning-level route section is withheld in favour of an expert handoff
 * specification.
 */
export const DOSSIER_VERSION = '1.0.0';

export type EvidenceGrade = 'COMPUTATION' | 'PREDICTION' | 'HYPOTHESIS' | 'EXPERIMENTALLY_VALIDATED';

/** Maps a property's provenance status onto its evidence grade. */
export function evidenceGradeFor(property: MoleculeProperty): EvidenceGrade | null {
  if (property.value === null || !VALUED_STATUSES.includes(property.status)) return null;
  switch (property.status) {
    case 'COMPUTED': return 'COMPUTATION';
    case 'MODEL_PREDICTION': return 'PREDICTION';
    // A value someone handed us, or a fixture, is an assertion — not a
    // measurement Genesis witnessed. It is never EXPERIMENTALLY_VALIDATED here.
    case 'ACTUAL_SOURCE': return 'COMPUTATION';
    case 'USER_SUPPLIED': return 'HYPOTHESIS';
    case 'TEST_FIXTURE': return 'HYPOTHESIS';
    default: return null;
  }
}

/* ------------------------------------------------------------------ */
/* Regulatory screening — fail-closed                                  */
/* ------------------------------------------------------------------ */

export type ControlledScreenStatus = 'NOT_SCREENED' | 'DECLARED_CONTROLLED' | 'DECLARED_UNCONTROLLED';

export interface RegulatoryContext {
  /**
   * Genesis has NO controlled-substance database. This must be supplied by a
   * caller who checked a real register; it is never inferred from structure.
   */
  controlledScreen: ControlledScreenStatus;
  /** Which register was consulted, when one was. */
  screenedAgainst: string | null;
  /** Declared by the caller: is this a structural analogue of a psychoactive compound? */
  psychoactiveAnalogue: boolean | null;
  notes: readonly string[];
}

export const UNSCREENED_REGULATORY_CONTEXT: RegulatoryContext = {
  controlledScreen: 'NOT_SCREENED',
  screenedAgainst: null,
  psychoactiveAnalogue: null,
  notes: ['No controlled-substance register was consulted. Genesis has no such database and does not infer legal status from structure.'],
};

export type SynthesisDisclosure = 'PLANNING_LEVEL' | 'WITHHELD_PENDING_EXPERT_REVIEW';

/**
 * Fail-closed disclosure policy.
 *
 * Planning-level route analysis is released ONLY when a real register was
 * consulted and returned "not controlled", and the caller also stated the
 * candidate is not a psychoactive analogue. Unknown status resolves to
 * withheld, because "we could not check" is not evidence that a compound is
 * unregulated.
 *
 * Operational procedure — quantities, temperatures, times, addition order,
 * step-by-step sequence — is outside what this module produces in EITHER
 * branch. The gate governs the planning-level section only.
 */
export function synthesisDisclosureFor(regulatory: RegulatoryContext): { level: SynthesisDisclosure; reason: string } {
  if (regulatory.controlledScreen === 'DECLARED_CONTROLLED') {
    return {
      level: 'WITHHELD_PENDING_EXPERT_REVIEW',
      reason: 'Declared a controlled substance. Route analysis is withheld; this candidate requires handoff to a licensed laboratory operating under its own regulatory authorisation.',
    };
  }
  if (regulatory.psychoactiveAnalogue === true) {
    return {
      level: 'WITHHELD_PENDING_EXPERT_REVIEW',
      reason: 'Declared a structural analogue of a psychoactive compound. Route analysis is withheld pending expert and regulatory review.',
    };
  }
  if (regulatory.controlledScreen === 'NOT_SCREENED' || regulatory.psychoactiveAnalogue === null) {
    return {
      level: 'WITHHELD_PENDING_EXPERT_REVIEW',
      reason: 'Regulatory status was not established. "Not checked" is not evidence that a compound is unregulated, so the conservative branch applies until a real register is consulted.',
    };
  }
  return {
    level: 'PLANNING_LEVEL',
    reason: `Screened against ${regulatory.screenedAgainst ?? 'a declared register'} and reported uncontrolled. Planning-level analysis only: no quantities, temperatures, times, addition order or step-by-step procedure.`,
  };
}

/* ------------------------------------------------------------------ */
/* Natural-product provenance                                          */
/* ------------------------------------------------------------------ */

/**
 * Natural-product context. A large share of real medicines are natural
 * products or derived from them, which makes this a legitimate discovery axis
 * worth recording.
 *
 * It is recorded as PROVENANCE, not as a safety signal. Natural origin says
 * nothing about toxicity — many potent toxins are natural products and many
 * natural products are medicines — so nothing in this module lets this field
 * influence a safety statement.
 *
 * Genesis has no natural-product database, so every field here is either
 * supplied by a caller who consulted a real source, or explicitly unknown.
 */
export interface NaturalProductContext {
  /** null = not determined; Genesis cannot decide this itself. */
  knownNaturalProduct: boolean | null;
  /** Organism/source, when a caller supplied one from a real reference. */
  sourceOrganism: string | null;
  /** Literature the caller cited. Genesis does not fabricate references. */
  references: readonly string[];
}

export const UNKNOWN_NATURAL_PRODUCT_CONTEXT: NaturalProductContext = {
  knownNaturalProduct: null,
  sourceOrganism: null,
  references: [],
};

/* ------------------------------------------------------------------ */
/* Dossier                                                             */
/* ------------------------------------------------------------------ */

export interface DossierProperty {
  propertyId: string;
  value: number | null;
  unit: string;
  status: string;
  grade: EvidenceGrade | null;
  engine: string | null;
}

export interface ValidationPlanItem {
  purpose: string;
  /** Analytical method class — named, not parameterised into a procedure. */
  method: string;
  /** What a real run of this method would produce. */
  expectedOutput: string;
  /** Control required for the result to mean anything. */
  control: string;
  /** Which unknown this would resolve. */
  resolves: string;
}

export interface CandidateDossier {
  dossierId: string;
  dossierVersion: string;

  identity: {
    candidateId: string;
    formula: string;
    canonicalSmiles: string | null;
    structureStatus: string;
    structureEngine: string | null;
    origin: string;
    parentFormula: string | null;
    transformation: string | null;
  };

  provenance: {
    generationMethodKind: string;
    generationMethodId: string;
    generationFingerprint: string;
    runFingerprint: string;
    questionId: string;
    question: string;
  };

  computedProperties: readonly DossierProperty[];
  /** Properties with no value, and what each would need. */
  unavailableMeasurements: readonly { propertyId: string; status: string; requires: string }[];

  hypothesis: {
    statement: string;
    grade: EvidenceGrade;
    targetLabel: string;
    targetSource: string;
  };

  selection: {
    whySelected: string;
    onParetoFront: boolean;
    objectivesConsidered: readonly string[];
    frontCaveat: string;
    alternativesRejected: readonly { formula: string; outcome: string; reason: string }[];
  };

  uncertainty: {
    fragileCriteria: readonly string[];
    robustnessStatement: string;
    untestedRefutations: readonly string[];
  };

  falsification: CandidateFalsification;

  validationPlan: readonly ValidationPlanItem[];

  labHandoff: {
    synthesisDisclosure: SynthesisDisclosure;
    disclosureReason: string;
    /** Planning-level only, and empty when withheld. */
    routeStrategy: readonly string[];
    precursorCategories: readonly string[];
    equipmentClasses: readonly string[];
    expertHandoffSpecification: readonly string[];
  };

  regulatory: RegulatoryContext & { flags: readonly string[] };
  naturalProduct: NaturalProductContext;

  /** What must exist before ANY efficacy or safety claim may be made. */
  evidenceRequiredBeforeClaims: readonly string[];

  nextExperiment: string;

  /** The only sanctioned sentence describing this candidate's status. */
  claimStatement: string;

  dossierFingerprint: string;
}

/** The one permitted framing. Nothing here asserts discovery, safety or efficacy. */
export function claimStatement(): string {
  return 'Genesis identified a computational candidate requiring experimental validation. No efficacy, safety, bioactivity or therapeutic property has been demonstrated.';
}

function unavailableRequirement(status: string): string {
  switch (status) {
    case 'REQUIRES_EXPERIMENT': return 'A laboratory measurement. No computation substitutes for it.';
    case 'REQUIRES_EXTERNAL_ENGINE': return 'An external predictive engine, whose output would be a PREDICTION and not an observation.';
    default: return 'A source that can supply this value; none is connected.';
  }
}

/**
 * The validation plan is derived from what the candidate actually lacks.
 * Methods are named at the level a laboratory would use to plan work — the
 * technique, its expected output and its control — never as a procedure with
 * quantities or conditions.
 */
function buildValidationPlan(
  unavailable: readonly { propertyId: string; status: string; requires: string }[],
  hasStructure: boolean,
): ValidationPlanItem[] {
  const plan: ValidationPlanItem[] = [];

  plan.push({
    purpose: 'Confirm the proposed structure is the substance actually in hand',
    method: 'NMR (1H/13C) and high-resolution mass spectrometry',
    expectedOutput: 'Spectra consistent with the proposed connectivity; accurate mass matching the molecular formula',
    control: 'Authenticated reference standard where one exists; blank and solvent controls',
    resolves: 'structural identity',
  });
  plan.push({
    purpose: 'Establish purity before any property measurement is meaningful',
    method: 'HPLC or UPLC with UV and mass detection',
    expectedOutput: 'Purity as area percent, with impurities above the reporting threshold identified',
    control: 'System suitability run and blank injection',
    resolves: 'sample purity',
  });

  for (const gap of unavailable) {
    if (gap.propertyId === 'logP') {
      plan.push({
        purpose: 'Measure lipophilicity rather than rely on a computed estimate',
        method: 'Shake-flask or chromatographic logD/logP determination',
        expectedOutput: 'Experimental partition coefficient with a stated pH',
        control: 'Compounds of known logP measured in the same run',
        resolves: 'logP',
      });
    }
    if (gap.propertyId === 'targetAffinity') {
      plan.push({
        purpose: 'Establish whether the candidate binds the declared target at all',
        method: 'Binding assay appropriate to the target class (for example SPR, ITC, or a validated biochemical assay)',
        expectedOutput: 'A dose-response curve and an affinity constant with confidence intervals',
        control: 'Known positive and negative reference ligands; vehicle control',
        resolves: 'targetAffinity',
      });
    }
    if (gap.propertyId === 'toxicity' || gap.propertyId === 'safety') {
      plan.push({
        purpose: 'Begin the toxicology sequence that any safety statement would require',
        method: 'In-vitro cytotoxicity panel, then a genotoxicity battery, under the relevant regulatory guidance',
        expectedOutput: 'Concentration-response data with cytotoxicity thresholds',
        control: 'Known cytotoxic and non-cytotoxic reference compounds; vehicle control',
        resolves: gap.propertyId,
      });
    }
    if (gap.propertyId === 'admetAbsorption') {
      plan.push({
        purpose: 'Measure permeability instead of predicting it',
        method: 'Caco-2 or PAMPA permeability assay',
        expectedOutput: 'Apparent permeability coefficient with directionality',
        control: 'High- and low-permeability reference compounds',
        resolves: 'admetAbsorption',
      });
    }
  }

  if (!hasStructure) {
    plan.unshift({
      purpose: 'Resolve a structure before any laboratory work can be specified',
      method: 'Structure elucidation from a real sample, or selection of a specific isomer by an expert',
      expectedOutput: 'A single defined constitution and stereochemistry',
      control: 'Not applicable until a structure exists',
      resolves: 'structural identity',
    });
  }

  return plan;
}

export interface DossierInputs {
  result: ProviderDiscoveryResult;
  ranking: MultiObjectiveResult;
  regulatory?: RegulatoryContext;
  naturalProduct?: NaturalProductContext;
  /** Hypothesis the caller declared BEFORE the run. Never invented here. */
  hypothesisStatement?: string;
}

/**
 * Builds the dossier for the best-ranked candidate, or returns null when there
 * is no retained candidate — an empty result never becomes an empty dossier
 * that looks like a finding.
 */
export function buildLeadCandidateDossier(inputs: DossierInputs): CandidateDossier | null {
  const { result, ranking } = inputs;
  const regulatory = inputs.regulatory ?? UNSCREENED_REGULATORY_CONTEXT;
  const naturalProduct = inputs.naturalProduct ?? UNKNOWN_NATURAL_PRODUCT_CONTEXT;

  const lead: RankedCandidate | undefined = ranking.retained.find((r) => r.onParetoFront) ?? ranking.retained[0];
  if (lead === undefined) return null;

  const candidate: MoleculeCandidate | undefined = result.batch.candidates.find((c) => c.candidateId === lead.candidateId);
  const assessment: CandidateAssessment | undefined = result.assessments.find((a) => a.candidateId === lead.candidateId);
  if (candidate === undefined || assessment === undefined) return null;

  const computedProperties: DossierProperty[] = candidate.properties
    .filter((p) => p.value !== null && VALUED_STATUSES.includes(p.status))
    .map((p) => ({
      propertyId: p.propertyId,
      value: p.value,
      unit: p.unit,
      status: p.status,
      grade: evidenceGradeFor(p),
      engine: p.engine,
    }));

  const unavailableMeasurements = candidate.properties
    .filter((p) => p.value === null || !VALUED_STATUSES.includes(p.status))
    .map((p) => ({ propertyId: p.propertyId, status: p.status, requires: unavailableRequirement(p.status) }));

  const falsification = falsifyCandidate(candidate, assessment, result.question.constraints);
  const disclosure = synthesisDisclosureFor(regulatory);
  const withheld = disclosure.level === 'WITHHELD_PENDING_EXPERT_REVIEW';

  const alternativesRejected = [...ranking.rejected, ...ranking.unevaluable, ...ranking.blocked]
    .filter((r) => r.candidateId !== lead.candidateId)
    .map((r) => ({ formula: r.formula, outcome: r.outcome, reason: r.justification }));

  const regulatoryFlags: string[] = [];
  if (regulatory.controlledScreen === 'NOT_SCREENED') regulatoryFlags.push('NOT_SCREENED_AGAINST_CONTROLLED_SUBSTANCE_REGISTER');
  if (regulatory.controlledScreen === 'DECLARED_CONTROLLED') regulatoryFlags.push('DECLARED_CONTROLLED_SUBSTANCE');
  if (regulatory.psychoactiveAnalogue === true) regulatoryFlags.push('DECLARED_PSYCHOACTIVE_ANALOGUE');
  if (regulatory.psychoactiveAnalogue === null) regulatoryFlags.push('PSYCHOACTIVE_ANALOGUE_STATUS_UNKNOWN');
  regulatoryFlags.push('NO_HUMAN_OR_ANIMAL_USE_IS_SUPPORTED_BY_THIS_DOCUMENT');

  const routeStrategy = withheld ? [] : [
    'Identify a disconnection strategy from commercially available starting material classes, at the level of bond disconnections rather than operations.',
    'Prefer routes whose steps are precedented in the primary literature; cite the precedent rather than restating it.',
    'Assess whether stereochemistry must be set, and if so whether by a chiral pool source, an asymmetric method, or resolution.',
    'Have a synthetic chemist review feasibility, hazard profile and waste implications before any work is planned.',
  ];

  const precursorCategories = withheld ? [] : [
    'Commercially available aromatic or heteroaromatic building blocks matching the core scaffold',
    'Standard protecting-group reagent classes appropriate to the functional groups present',
    'Common coupling reagent classes, selected by the chemist performing the work',
  ];

  const dossierBody = {
    dossierVersion: DOSSIER_VERSION,
    identity: {
      candidateId: candidate.candidateId,
      formula: candidate.formula,
      canonicalSmiles: candidate.structure.canonicalSmiles,
      structureStatus: candidate.structure.status,
      structureEngine: candidate.structure.engine,
      origin: candidate.origin,
      parentFormula: candidate.parentFormula,
      transformation: candidate.transformation,
    },
    provenance: {
      generationMethodKind: result.generationCapability.kind,
      generationMethodId: result.generationCapability.methodId,
      generationFingerprint: result.generationFingerprint,
      runFingerprint: result.resultFingerprint,
      questionId: result.question.questionId,
      question: result.question.question,
    },
    computedProperties,
    unavailableMeasurements,
    hypothesis: {
      statement: inputs.hypothesisStatement
        ?? `Candidate ${candidate.formula} satisfies the physicochemical criteria declared for "${result.question.questionId}". This is a statement about declared computable bounds, not about biological activity.`,
      grade: 'HYPOTHESIS' as const,
      targetLabel: result.question.target.label,
      targetSource: result.question.target.source,
    },
    selection: {
      whySelected: lead.justification,
      onParetoFront: lead.onParetoFront,
      objectivesConsidered: ranking.objectives.map((o) => o.objectiveId),
      frontCaveat: ranking.frontCaveat,
      alternativesRejected,
    },
    uncertainty: {
      fragileCriteria: falsification.fragileCriteria,
      robustnessStatement: falsification.robustnessStatement,
      untestedRefutations: falsification.checks.filter((c) => c.kind === 'REQUIRES_EXTERNAL').map((c) => c.checkId),
    },
    falsification,
    validationPlan: buildValidationPlan(unavailableMeasurements, candidate.structure.canonicalSmiles !== null),
    labHandoff: {
      synthesisDisclosure: disclosure.level,
      disclosureReason: disclosure.reason,
      routeStrategy,
      precursorCategories,
      equipmentClasses: withheld ? [] : [
        'Standard synthetic organic laboratory with fume hood and appropriate engineering controls',
        'Analytical suite: NMR, LC-MS, HPLC',
        'Purification: chromatography and crystallisation capability',
      ],
      expertHandoffSpecification: [
        'This document is a planning artefact for qualified researchers operating under institutional oversight. It is not a procedure and cannot be executed as one.',
        'No quantities, temperatures, reaction times, addition order or step-by-step sequence are provided in any branch of this document.',
        withheld
          ? 'Route analysis is withheld for this candidate. A licensed laboratory must derive any route itself under its own regulatory authorisation and ethical approval.'
          : 'Route strategy is stated at the level of disconnections only; a synthetic chemist must design and risk-assess the actual chemistry.',
        'Institutional review, regulatory authorisation and a documented risk assessment are prerequisites to any laboratory work.',
      ],
    },
    regulatory: { ...regulatory, flags: regulatoryFlags },
    naturalProduct,
    evidenceRequiredBeforeClaims: [
      'Confirmed structural identity and purity from a real, characterised sample.',
      'Independently reproduced measurement of every property currently held only as a computation or a prediction.',
      'Direct evidence of activity against the declared target, from a validated assay with positive and negative controls.',
      'A toxicology package appropriate to the intended context, under the relevant regulatory guidance.',
      'Peer review and independent replication.',
      'Until all of the above exist, no efficacy claim, no safety claim and no therapeutic claim is supportable — and natural origin, if any, does not substitute for any item on this list.',
    ],
    nextExperiment: unavailableMeasurements.length > 0
      ? `Resolve ${unavailableMeasurements[0]!.propertyId} first: it is the earliest unknown that could refute this candidate, and it requires ${unavailableMeasurements[0]!.requires.toLowerCase()}`
      : 'Independently reproduce the computed properties on a synthesised, characterised sample.',
    claimStatement: claimStatement(),
  };

  const dossierFingerprint = fnv1a(canonicalJson(dossierBody));

  return { ...dossierBody, dossierId: `dossier_${dossierFingerprint}`, dossierFingerprint };
}
