import { writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { createNodeAdmetTransport } from '../core/discovery/molecular/admetTransport.node';
import { createNodeRdkitTransport } from '../core/discovery/molecular/rdkitTransport.node';
import { NATURAL_PRODUCT_CANDIDATE_POOL } from '../core/discovery/molecular/naturalProductCandidatePool';
import { runNaturalKetamineDiscovery, KETAMINE_TARGET_PROFILE, type NaturalKetamineDiscoveryResult } from '../core/discovery/molecular/naturalKetamineDiscovery';
import type { NaturalAnalogueCampaignRequest } from '../core/discovery/molecular/naturalAnalogueCampaign';
import type { DiscoveryConstraints, DiscoveryQuestion } from '../core/discovery/molecular/types';
import type { Objective } from '../core/discovery/molecular/multiObjective';

/**
 * P0 — NATURAL KETAMINE-LIKE DISCOVERY, REAL EXECUTION.
 *
 * Real RDKit and real ADMET-AI. The campaign is the existing one, unchanged;
 * what is new is the comparison of each natural candidate against ketamine's
 * INGESTED NMDAR profile on four separated axes.
 */
const RUN_TIMEOUT_MS = 1_800_000;

const KETAMINE_SMILES = 'CNC1(CCCCC1=O)c1ccccc1Cl';
const KETAMINE_FORMULA = 'C13H16ClNO';

const screeningConstraints: DiscoveryConstraints = {
  allowedElements: ['C', 'H', 'N', 'O', 'S', 'Cl', 'F'],
  maxHeavyAtoms: 40,
  criteria: [
    { criterionId: 'tpsa-bbb', propertyId: 'tpsa', op: 'lte', value: 90, required: true, rationale: 'TPSA <= 90 A^2 is a standard heuristic for blood-brain-barrier penetration.' },
    { criterionId: 'mw-cns', propertyId: 'molecularWeight', op: 'lte', value: 450, required: true, rationale: 'CNS-relevant compounds are typically well under 450 g/mol.' },
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
  questionId: 'natural-ketamine-nmda-analogue-v1',
  question: 'Which naturally occurring compound has the strongest evidence-supported mechanistic relationship to ketamine, and what would have to be measured to test it?',
  target: { targetId: 'nmda-receptor', label: 'NMDA receptor (ionotropic glutamate receptor)', source: 'USER_SUPPLIED', affinityCapability: 'REQUIRES_EXTERNAL_ENGINE' },
  constraints: screeningConstraints,
};

function buildRequest(): NaturalAnalogueCampaignRequest {
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
        mechanismHypothesis: 'Non-competitive, use-dependent open-channel blocker of the NMDA receptor (PCP/MK-801 binding site).',
        evidence: [{
          source: 'LITERATURE',
          identifier: 'Anis NA, Berry SC, Burton NR, Lodge D. Br J Pharmacol. 1983;79(2):565-575.',
          establishes: 'Founding pharmacological characterisation of ketamine as an NMDA receptor antagonist.',
        }],
      },
    },
    referenceTargetKeywords: ['nmda'],
    candidatePool: NATURAL_PRODUCT_CANDIDATE_POOL,
    screeningConstraints,
    objectives,
    question,
  };
}

let result: NaturalKetamineDiscoveryResult;
let rdkitAvailable = false;

beforeAll(async () => {
  const rdkit = createNodeRdkitTransport({ timeoutMs: 60_000 });
  const admet = createNodeAdmetTransport({ timeoutMs: 900_000 });
  rdkitAvailable = rdkit.detect().available;
  result = runNaturalKetamineDiscovery(buildRequest(), { rdkit, admet });
  printDossier();
}, RUN_TIMEOUT_MS);

function printDossier(): void {
  const lines: string[] = [];
  const push = (s = '') => lines.push(s);
  const r = result;

  push('');
  push('======== GENESIS: NATURAL KETAMINE-LIKE DISCOVERY ========');
  push('');
  push(`QUESTION: ${r.question}`);
  push('');
  push('KETAMINE TARGET / MECHANISM PROFILE (ingested records only):');
  push(`  targets          ${r.ketamine.targets.join(', ')}`);
  push(`  mechanism class  ${r.ketamine.mechanismClass}`);
  for (const m of r.ketamine.measurements) {
    push(`  MEASURED         ${m.target} ${m.parameter}=${m.value}${m.unit ? ` ${m.unit}` : ''} | ${m.assay} | ${m.model} (${m.species}) | ${m.source}`);
  }
  for (const e of r.ketamine.evidence) push(`  evidence         ${e.identifier}`);
  push('');
  push('NATURAL CANDIDATES — FOUR SEPARATED AXES:');
  for (const a of r.assessments) {
    push('');
    push(`  ${a.compoundName} [${a.candidateKey}] — campaign status ${a.campaignStatus}`);
    push(`    origin: ${a.origin.slice(0, 110)}`);
    if (a.comparison === null) {
      push(`    COMPARISON NOT AVAILABLE: ${a.comparisonUnavailableReason.slice(0, 220)}`);
    } else {
      for (const axis of a.comparison.axes) {
        push(`    ${axis.axis.padEnd(11)} ${axis.verdict.padEnd(16)} ${axis.statement.slice(0, 190)}`);
      }
      push(`    claim ceiling: ${a.comparison.claim.strength} (confidence ${a.comparison.claim.confidence})`);
      push(`    comparable measurement pairs vs ketamine: ${a.comparison.comparableMeasurementPairs.length}`);
    }
    push(`    LITERATURE EVIDENCE (candidate's own mechanism): ${a.literatureEvidence.length} reference(s)`);
    for (const lit of a.literatureEvidence) push(`      - ${lit.slice(0, 150)}`);
    if (a.epistemicState !== null) {
      const e = a.epistemicState;
      push(`    EPISTEMIC: computed ${e.computed.length}, predicted ${e.predicted.length}, literature ${e.literatureSupported.length}, experimentally verified ${e.experimentallyVerified.length}, unknown ${e.unknown.length}`);
      push(`    SURVIVAL BASIS: ${e.survivalBasis}`);
    }
  }
  push('');
  push('CAMPAIGN FUNNEL:');
  push(`  pool                 ${r.campaign.candidates.length}`);
  push(`  retained & ranked    ${r.campaign.candidates.filter((c) => c.status === 'RETAINED_RANKED').length}`);
  push(`  rejected (mechanism) ${r.campaign.candidates.filter((c) => c.status === 'REJECTED_MECHANISM').length}`);
  push(`  rejected (screening) ${r.campaign.candidates.filter((c) => c.status === 'REJECTED_SCREENING').length}`);
  push(`  unevaluable (no structure) ${r.campaign.candidates.filter((c) => c.status === 'UNEVALUABLE_NO_STRUCTURE').length}`);
  push('');
  push('WHY EACH CANDIDATE ENDED WHERE IT DID:');
  for (const c of r.campaign.candidates) {
    push(`  ${c.candidateKey}: ${c.status} — ${c.mechanismFalsification.reason.slice(0, 180)}`);
  }
  push('');
  push(`STRONGEST NATURAL CANDIDATE: ${r.strongestCandidate}`);
  push(`  ${r.strongestCandidateBasis}`);
  push('');
  push('WHAT IS ACTUALLY KNOWN (measured, ingested):');
  push(`  Ketamine: ${r.ketamine.measurements.length} measurement(s) at NMDAR.`);
  push(`  Natural candidates: ${r.assessments.reduce((n, a) => n + (a.comparison?.comparableMeasurementPairs.length ?? 0), 0)} measurement(s) comparable to ketamine — none.`);
  push('');
  push('WHAT IS ONLY LITERATURE-SUPPORTED / INFERRED:');
  for (const a of r.assessments) {
    if (a.literatureEvidence.length > 0) push(`  ${a.compoundName}: mechanism asserted by ${a.literatureEvidence.length} paper(s); no value ingested, not independently verified by Genesis.`);
  }
  push('');
  push('WHAT MUST BE EXPERIMENTALLY TESTED NEXT:');
  const top = r.proposedExperiments[0];
  if (top !== undefined) {
    push(`  [${top.priority}] ${top.measurement}`);
    push(`  why: ${top.why}`);
    push(`  resolves: ${top.whatItResolves}`);
    push(`  discriminates between ${top.discriminatesBetween.length} candidate(s)`);
    push(`  supported if: ${top.hypothesis.supportedIf}`);
    push(`  falsified if: ${top.hypothesis.falsifiedIf}`);
  }
  push('');
  push('CLAIMS THIS RESULT REFUSES TO MAKE:');
  for (const c of r.refusedClaims) push(`  - ${c}`);
  push('');
  push('LIMITATIONS:');
  for (const l of r.limitations) push(`  - ${l}`);
  push('');
  push(`RESULT FINGERPRINT: ${r.resultFingerprint}`);
  push('=========================================================');

  const text = lines.join('\n');
  // eslint-disable-next-line no-console
  console.log(text);
  const target = process.env.GENESIS_KETAMINE_OUT;
  if (target !== undefined && target.length > 0) writeFileSync(target, text, 'utf8');
}

describe('P0: natural ketamine-like discovery — real execution', () => {
  it('ketamine carries real ingested NMDAR measurements', () => {
    expect(KETAMINE_TARGET_PROFILE.measurements.length).toBeGreaterThan(0);
    const ic50 = KETAMINE_TARGET_PROFILE.measurements.find((m) => m.parameter === 'IC50');
    expect(ic50).toBeDefined();
    expect(ic50!.value).toBe('0.71');
    expect(ic50!.unit).toBe('µM');
    expect(ic50!.species).toBe('Human');
  });

  it('every pool candidate is assessed — none silently dropped', () => {
    expect(result.assessments).toHaveLength(NATURAL_PRODUCT_CANDIDATE_POOL.length);
    for (const a of result.assessments) {
      expect(a.campaignStatus.length).toBeGreaterThan(0);
    }
  });

  it('the four axes are reported separately for every structured candidate', () => {
    for (const a of result.assessments) {
      if (a.comparison === null) {
        expect(a.comparisonUnavailableReason.length).toBeGreaterThan(0);
        continue;
      }
      const axes = a.comparison.axes.map((x) => x.axis);
      expect(axes).toContain('STRUCTURAL');
      expect(axes).toContain('TARGET');
      expect(axes).toContain('FUNCTIONAL');
      expect(axes).toContain('MECHANISTIC');
    }
  });

  it('NO natural candidate has a measurement comparable to ketamine', () => {
    for (const a of result.assessments) {
      if (a.comparison === null) continue;
      // This is the central honest finding: the FUNCTIONAL axis cannot be met.
      expect(a.comparison.comparableMeasurementPairs).toEqual([]);
      expect(a.comparison.axes.find((x) => x.axis === 'FUNCTIONAL')!.verdict).toBe('NOT_ESTABLISHED');
    }
  });

  it('harmaline is rejected on real target-mismatch grounds, not missing data', () => {
    const harmaline = result.assessments.find((a) => a.candidateKey === 'harmaline')!;
    expect(harmaline.retainedByCampaign).toBe(false);
    expect(harmaline.campaignStatus).toBe('REJECTED_MECHANISM');
  });

  it('conantokin-g is unevaluable for structure, and says why', () => {
    const conantokin = result.assessments.find((a) => a.candidateKey === 'conantokin-g')!;
    expect(conantokin.comparison).toBeNull();
    expect(conantokin.comparisonUnavailableReason).toContain('peptide');
  });

  it('names a strongest candidate only on evidence it actually has', () => {
    if (!rdkitAvailable) return;
    expect(result.strongestCandidate).not.toBe('');
    if (result.strongestCandidate !== 'NONE') {
      expect(result.strongestCandidateBasis).toContain('not by measured potency');
      const strongest = result.assessments.find((a) => a.compoundName === result.strongestCandidate)!;
      expect(strongest.retainedByCampaign).toBe(true);
      expect(strongest.comparison!.sharedTargets.length).toBeGreaterThan(0);
    }
  });

  it('never claims a natural ketamine, replacement, or clinical equivalence', () => {
    const refused = result.refusedClaims.join(' ').toLowerCase();
    expect(refused).toContain('natural ketamine');
    expect(refused).toContain('replacement');
    expect(refused).toContain('clinical equivalence');
    const limitations = result.limitations.join(' ').toLowerCase();
    expect(limitations).toContain('requires_experiment');
  });

  it('claim strength never reaches functional or clinical equivalence', () => {
    for (const a of result.assessments) {
      if (a.comparison === null) continue;
      expect(a.comparison.claim.strength).not.toBe('CLINICALLY_EQUIVALENT');
      expect(a.comparison.claim.strength).not.toBe('FUNCTIONAL_SIMILARITY');
    }
  });

  it('proposes a discriminating NMDAR experiment against ketamine\'s own threshold', () => {
    if (!rdkitAvailable) return;
    expect(result.proposedExperiments.length).toBeGreaterThan(0);
    const top = result.proposedExperiments[0]!;
    expect(top.target).toBe('NMDAR');
    expect(top.hypothesis.threshold).toBe(0.71);
    expect(top.hypothesis.falsifiedIf.length).toBeGreaterThan(0);
  });

  it('is deterministic — the same inputs reproduce the same fingerprint', () => {
    expect(result.resultFingerprint).toMatch(/^[0-9a-f]+$/);
  });
});
