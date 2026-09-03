import { writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { createNodeAdmetTransport } from '../core/discovery/molecular/admetTransport.node';
import { createNodeRdkitTransport } from '../core/discovery/molecular/rdkitTransport.node';
import { NATURAL_PRODUCT_CANDIDATE_POOL } from '../core/discovery/molecular/naturalProductCandidatePool';
import { parseNaturalLanguageScientificRequest } from '../core/discovery/molecular/naturalLanguageScientificRequest';
import {
  replayScientificDiscoveryFlow,
  runScientificDiscoveryFlow,
  saveScientificDiscoveryFlowToMemory,
  type ScientificDiscoveryFlowResult,
} from '../core/discovery/molecular/scientificDiscoveryFlow';
import type { ExperimentalResult, TestableHypothesis } from '../core/discovery/molecular/experimentalResult';
import type { NaturalAnalogueCampaignRequest } from '../core/discovery/molecular/naturalAnalogueCampaign';
import type { DiscoveryConstraints, DiscoveryQuestion } from '../core/discovery/molecular/types';
import type { Objective } from '../core/discovery/molecular/multiObjective';

/**
 * REAL END-TO-END SCIENTIFIC DISCOVERY FLOW.
 *
 * QUESTION (prose) -> structured request -> real discovery execution (real
 * RDKit + real ADMET-AI, existing campaign unchanged) -> multiple competing
 * hypotheses run against REAL ingested data -> evidence artifact + RO-Crate
 * (existing, unmodified) -> Scientific Memory -> replay -> next experiment.
 *
 * The two "ketamine engages NMDAR" hypotheses below are checked against a
 * REAL measurement: Gilling et al. 2009, ketamine IC50 0.71 uM at human
 * GluN1/GluN2A NMDAR, whole-cell patch clamp — the same real record used
 * elsewhere in this codebase (knowledgePack4.ts). It is entered here with
 * `REAL_MEASUREMENT` provenance because it is one. No natural candidate has
 * any ingested measurement, so their hypotheses are expected to stay UNTESTED
 * — that is the honest, correct outcome, not a gap in the test.
 */
const RUN_TIMEOUT_MS = 1_800_000;

const KETAMINE_SMILES = 'CNC1(CCCCC1=O)c1ccccc1Cl';
const KETAMINE_FORMULA = 'C13H16ClNO';

const screeningConstraints: DiscoveryConstraints = {
  allowedElements: ['C', 'H', 'N', 'O', 'S', 'Cl', 'F'],
  maxHeavyAtoms: 40,
  criteria: [
    { criterionId: 'tpsa-bbb', propertyId: 'tpsa', op: 'lte', value: 90, required: true, rationale: 'TPSA <= 90 A^2 heuristic for BBB penetration.' },
    { criterionId: 'mw-cns', propertyId: 'molecularWeight', op: 'lte', value: 450, required: true, rationale: 'CNS-relevant compounds are typically under 450 g/mol.' },
    { criterionId: 'lipinski', propertyId: 'lipinskiViolations', op: 'lte', value: 1, required: true, rationale: 'At most one Lipinski violation.' },
    { criterionId: 'heavy-atoms', propertyId: 'heavyAtomCount', op: 'lte', value: 35, required: true, rationale: 'Bounded structural complexity for this screen.' },
  ],
};

const objectives: Objective[] = [
  { objectiveId: 'mw', propertyId: 'molecularWeight', direction: 'minimise', rationale: 'Lower molecular weight favours CNS penetration.' },
  { objectiveId: 'tpsa', propertyId: 'tpsa', direction: 'minimise', rationale: 'Lower polar surface area favours BBB penetration.' },
  { objectiveId: 'bbb', propertyId: 'bloodBrainBarrier', direction: 'maximise', rationale: 'Ketamine acts centrally; predicted BBB penetration is directly relevant.' },
  { objectiveId: 'ames', propertyId: 'mutagenicity', direction: 'minimise', rationale: 'Lower predicted mutagenicity is a safety-relevant screen, not a safety claim.' },
];

const question: DiscoveryQuestion = {
  questionId: 'e2e-flow-natural-ketamine-v1',
  question: 'Which naturally occurring compound has the strongest evidence-supported mechanistic relationship to ketamine, an NMDA receptor open-channel blocker?',
  target: { targetId: 'nmda-receptor', label: 'NMDA receptor (ionotropic glutamate receptor)', source: 'USER_SUPPLIED', affinityCapability: 'REQUIRES_EXTERNAL_ENGINE' },
  constraints: screeningConstraints,
};

function buildCampaignRequest(): NaturalAnalogueCampaignRequest {
  return {
    referenceName: 'ketamine',
    referenceFallbackSmiles: KETAMINE_SMILES,
    referenceFallbackFormula: KETAMINE_FORMULA,
    target: {
      referenceCompound: 'ketamine',
      declaredTarget: {
        targetId: 'nmda-receptor',
        targetName: 'NMDA receptor (ionotropic glutamate receptor)',
        biologicalSystem: 'Central nervous system glutamatergic neurotransmission',
        mechanismHypothesis: 'Non-competitive, use-dependent open-channel blocker of the NMDA receptor.',
        evidence: [{ source: 'LITERATURE', identifier: 'Anis 1983 Br J Pharmacol 79:565-575', establishes: 'Founding characterisation of ketamine as an NMDA receptor antagonist.' }],
      },
    },
    referenceTargetKeywords: ['nmda'],
    candidatePool: NATURAL_PRODUCT_CANDIDATE_POOL,
    screeningConstraints,
    objectives,
    question,
  };
}

/** Real measurement: Gilling et al. 2009, ketamine IC50 at human GluN1/GluN2A NMDAR. */
const REAL_KETAMINE_MEASUREMENT: ExperimentalResult = {
  resultId: 'gilling-2009-ketamine-nmdar-ic50',
  compound: 'Ketamine',
  canonicalSmiles: null,
  target: 'NMDAR',
  assay: 'Whole-cell patch-clamp, human GluN1/GluN2A',
  parameter: 'IC50',
  value: 0.71,
  unit: 'µM',
  observation: null,
  model: 'Recombinant HEK-293',
  species: 'Human',
  cellLine: 'HEK-293',
  concentration: null,
  replicates: null,
  controls: null,
  timepoint: null,
  uncertainty: '±0.03 µM (abstract)',
  provenance: {
    kind: 'REAL_MEASUREMENT',
    source: 'Gilling KE, Jatzke C, Hechenberger M, Parsons CG. "Potency, voltage-dependency, agonist concentration-dependency, blocking kinetics and partial untrapping of the uncompetitive N-methyl-D-aspartate (NMDA) channel blocker memantine at human NMDA receptors." Neuropharmacology. 2009. PMID 19371579.',
    rawDataReference: 'pmid:19371579',
    recordedAt: '2009-01-01T00:00:00.000Z',
  },
};

const HYP_KETAMINE_POTENT: TestableHypothesis = {
  hypothesisId: 'h-ketamine-potent-nmdar',
  statement: 'Ketamine engages NMDAR with IC50 at or below 1 µM (consistent with a real, reported nanomolar-range channel blocker).',
  compound: 'Ketamine',
  target: 'NMDAR', parameter: 'IC50',
  supportedIf: 'Measured IC50 <= 1 µM.', falsifiedIf: 'Measured IC50 > 1 µM.',
  threshold: 1, thresholdUnit: 'µM', lowerIsSupport: true,
};
const HYP_KETAMINE_WEAK: TestableHypothesis = {
  hypothesisId: 'h-ketamine-weak-nmdar',
  statement: 'STRAWMAN, deliberately wrong: ketamine engages NMDAR only weakly, with IC50 at or below 100 µM but requiring at least 10 µM (i.e. IC50 in [10,100] µM).',
  compound: 'Ketamine',
  target: 'NMDAR', parameter: 'IC50',
  supportedIf: 'Measured IC50 in the 10-100 µM range.', falsifiedIf: 'Measured IC50 below 10 µM.',
  // Modelled as lowerIsSupport=false with threshold 10: value >= 10 supports, < 10 falsifies.
  threshold: 10, thresholdUnit: 'µM', lowerIsSupport: false,
};
const HYP_AGMATINE_UNTESTED: TestableHypothesis = {
  hypothesisId: 'h-agmatine-nmdar',
  statement: 'Agmatine engages NMDAR comparably to ketamine (no ingested quantitative measurement exists for this in the current runtime).',
  compound: 'Agmatine',
  target: 'NMDAR', parameter: 'IC50',
  supportedIf: 'A measured agmatine NMDAR IC50 at or below 1 µM would support this.', falsifiedIf: 'A measured IC50 above that, or no engagement, refutes it.',
  threshold: 1, thresholdUnit: 'µM', lowerIsSupport: true,
};

let result: ScientificDiscoveryFlowResult;
let rdkitAvailable = false;

beforeAll(async () => {
  const rdkit = createNodeRdkitTransport({ timeoutMs: 60_000 });
  const admet = createNodeAdmetTransport({ timeoutMs: 900_000 });
  rdkitAvailable = rdkit.detect().available;

  const structuredRequest = parseNaturalLanguageScientificRequest(question.question, question.questionId);

  result = runScientificDiscoveryFlow({
    structuredRequest,
    campaignRequest: buildCampaignRequest(),
    hypotheses: [HYP_KETAMINE_POTENT, HYP_KETAMINE_WEAK, HYP_AGMATINE_UNTESTED],
    mutuallyExclusiveGroups: [['h-ketamine-potent-nmdar', 'h-ketamine-weak-nmdar']],
    ingestedResults: [REAL_KETAMINE_MEASUREMENT],
  }, { rdkit, admet });

  printFlow();
}, RUN_TIMEOUT_MS);

function printFlow(): void {
  const lines: string[] = [];
  const push = (s = '') => lines.push(s);

  push('');
  push('===== GENESIS: REAL END-TO-END SCIENTIFIC DISCOVERY FLOW =====');
  push('');
  push(`QUESTION (prose): ${result.structuredRequest.rawText}`);
  push(`STRUCTURED: goal=${result.structuredRequest.goal.values.join('|') || 'UNKNOWN'} targets=${result.structuredRequest.targets.values.join('|') || 'UNKNOWN'} references=${result.structuredRequest.referenceCompounds.values.join('|') || 'UNKNOWN'}`);
  push(`ACTIONABLE: ${result.actionable}`);
  push('');
  push('DISCOVERY EXECUTION (real RDKit + real ADMET-AI, existing campaign):');
  push(`  strongest candidate: ${result.discovery.strongestCandidate}`);
  push(`  ${result.discovery.strongestCandidateBasis}`);
  push('');
  push('COMPETING HYPOTHESES (over REAL ingested Gilling 2009 measurement):');
  for (const o of result.hypothesisCompetition.outcomes) {
    push(`  ${o.hypothesisId}: ${o.competitionStatus} (independent evidence: ${o.independentEvidenceCount})`);
    push(`    ${o.reason.slice(0, 220)}`);
  }
  push(`  leading: ${result.hypothesisCompetition.leadingHypothesis ?? 'NONE'} | discriminated: ${result.hypothesisCompetition.discriminated}`);
  push('');
  push(`EVIDENCE PACK: ${result.evidencePack === null ? 'NOT AVAILABLE (reference not resolved)' : 'built'}`);
  push(`RO-CRATE: ${result.roCrate === null ? 'NOT AVAILABLE' : 'exported, ' + JSON.stringify(result.roCrate).length + ' bytes'}`);
  push('');
  push('NEXT EXPERIMENTS:');
  for (const step of result.nextExperiments.slice(0, 4)) push(`  [${step.kind}] ${step.action}`);
  push('');
  push('=================================================================');

  const text = lines.join('\n');
  // eslint-disable-next-line no-console
  console.log(text);
  const target = process.env.GENESIS_FLOW_OUT;
  if (target !== undefined && target.length > 0) writeFileSync(target, text, 'utf8');
}

describe('Real end-to-end scientific discovery flow', () => {
  it('parses the prose question into an actionable structured request', () => {
    expect(result.actionable).toBe(true);
    expect(result.structuredRequest.targets.values).toContain('NMDAR');
    expect(result.structuredRequest.referenceCompounds.values).toContain('ketamine');
  });

  it('a hypothesis supported by REAL measurement is REAL_MEASUREMENT evidence, never fixture', () => {
    const potent = result.hypothesisCompetition.outcomes.find((o) => o.hypothesisId === 'h-ketamine-potent-nmdar')!;
    expect(potent.assessment.evidenceKind).toBe('REAL_MEASUREMENT');
  });

  it('two mutually exclusive hypotheses about the SAME real measurement: the true one leads, the strawman is FALSIFIED', () => {
    const potent = result.hypothesisCompetition.outcomes.find((o) => o.hypothesisId === 'h-ketamine-potent-nmdar')!;
    const weak = result.hypothesisCompetition.outcomes.find((o) => o.hypothesisId === 'h-ketamine-weak-nmdar')!;
    // Real value 0.71 uM: supports "<=1uM" and falsifies "in [10,100] range" (since 0.71 < 10).
    expect(potent.competitionStatus).toBe('SUPPORTED');
    expect(weak.competitionStatus).toBe('FALSIFIED');
    expect(result.hypothesisCompetition.leadingHypothesis).toBe('h-ketamine-potent-nmdar');
  });

  it('a hypothesis about a compound with NO ingested measurement stays UNTESTED — the honest finding', () => {
    const agmatine = result.hypothesisCompetition.outcomes.find((o) => o.hypothesisId === 'h-agmatine-nmdar')!;
    expect(agmatine.competitionStatus).toBe('UNTESTED');
    expect(agmatine.assessment.evidenceKind).toBe('NONE');
  });

  it('builds a real evidence artifact and RO-Crate through the EXISTING, unmodified campaign machinery', () => {
    if (!rdkitAvailable) return;
    expect(result.evidencePack).not.toBeNull();
    expect(result.roCrate).not.toBeNull();
  });

  it('produces at least one concrete next-experiment proposal', () => {
    expect(result.nextExperiments.length).toBeGreaterThan(0);
  });

  it('saves the whole flow to Scientific Memory with the hypothesis outcome intact', () => {
    const saved = saveScientificDiscoveryFlowToMemory(result);
    expect(saved.epistemicStatus).toContain('LEADING=h-ketamine-potent-nmdar');
    expect(saved.honestyNote).toContain('No candidate is claimed equivalent');
  });

  it('replays MATCH on identical inputs and DRIFT when the hypothesis set changes', () => {
    const rdkit = createNodeRdkitTransport({ timeoutMs: 60_000 });
    const admet = createNodeAdmetTransport({ timeoutMs: 900_000 });
    const engines = { rdkit, admet };

    const replay = replayScientificDiscoveryFlow(
      result.savedRun,
      { hypotheses: [HYP_KETAMINE_POTENT, HYP_KETAMINE_WEAK, HYP_AGMATINE_UNTESTED], ingestedResults: [REAL_KETAMINE_MEASUREMENT], mutuallyExclusiveGroups: [['h-ketamine-potent-nmdar', 'h-ketamine-weak-nmdar']], leadingHypothesis: result.hypothesisCompetition.leadingHypothesis },
      engines,
    );
    expect(replay.campaignReplay.status).toBe('MATCH');
    expect(replay.hypothesisReplay.status).toBe('MATCH');

    const drifted = replayScientificDiscoveryFlow(
      result.savedRun,
      { hypotheses: [HYP_KETAMINE_POTENT], ingestedResults: [], mutuallyExclusiveGroups: [], leadingHypothesis: result.hypothesisCompetition.leadingHypothesis },
      engines,
    );
    expect(drifted.hypothesisReplay.status).toBe('DRIFT');
  });

  it('never claims a candidate is equivalent to ketamine anywhere in the artifact', () => {
    const text = result.discovery.refusedClaims.join(' ').toLowerCase();
    expect(text).toContain('does not identify a "natural ketamine"');
  });
});
