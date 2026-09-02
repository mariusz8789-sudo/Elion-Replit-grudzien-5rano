import { writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { createNodeAdmetTransport } from '../core/discovery/molecular/admetTransport.node';
import { createNodeRdkitTransport } from '../core/discovery/molecular/rdkitTransport.node';
import { mephedroneDiscoveryRequest } from '../core/discovery/molecular/mephedroneDiscoveryCase';
import { MEPHEDRONE_REQUIREMENTS } from '../core/discovery/molecular/mephedroneRequirements';
import { runDiscoveryRound, diffRounds, type DiscoveryRound } from '../core/discovery/molecular/discoveryLoop';
import type { ExperimentalResult, TestableHypothesis } from '../core/discovery/molecular/experimentalResult';
import type { Objective } from '../core/discovery/molecular/multiObjective';

/**
 * CLOSED-LOOP DISCOVERY — REAL EXECUTION, three rounds.
 *
 * ROUND 1  question + requirements -> candidates -> ranking -> next experiment
 * ROUND 2  a measurement is ingested -> hypothesis assessed -> front re-ranked
 * ROUND 3  the updated hypothesis drives a NEW generation round
 *
 * The round-2 measurement is a TEST_FIXTURE and is labelled as one on every
 * object and every rendered line. Genesis has no VMAT2 assay, so no real value
 * exists; the fixture exists ONLY to prove the control flow carries a result
 * into a re-ranking. Its VALUES are declared here; the STRUCTURES it binds to
 * are whatever the real round-1 run actually produced.
 */
const RUN_TIMEOUT_MS = 1_800_000;

/** Reference yardstick: 4-MMC's own measured VMAT2 IC50 (Pifl 2015), in µM. */
const REFERENCE_VMAT2_IC50_UM = 223;

const VMAT2_HYPOTHESIS: TestableHypothesis = {
  hypothesisId: 'h-vmat2-ic50',
  statement: 'At least one front candidate engages VMAT2 with an IC50 at or below 4-MMC\'s own measured 223 µM.',
  target: 'VMAT2',
  parameter: 'IC50',
  supportedIf: 'A measured IC50 at or below 223 µM would support extrapolating the reference mechanism to that candidate.',
  falsifiedIf: 'A measured IC50 above 223 µM, or no detectable inhibition, refutes the extrapolation for that candidate.',
  threshold: REFERENCE_VMAT2_IC50_UM,
  thresholdUnit: 'µM',
  lowerIsSupport: true,
};

let round1: DiscoveryRound;
let round2: DiscoveryRound;
let round3: DiscoveryRound;
let fixtures: ExperimentalResult[] = [];

function fixtureResult(smiles: string, valueUm: number, index: number): ExperimentalResult {
  return {
    resultId: `fixture-vmat2-${index}`,
    compound: `round1-front-candidate-${index}`,
    canonicalSmiles: smiles,
    target: 'VMAT2',
    assay: '[3H]dopamine vesicular uptake inhibition',
    parameter: 'IC50',
    value: valueUm,
    unit: 'µM',
    observation: null,
    model: 'Human striatal vesicles',
    species: 'Human',
    cellLine: null,
    concentration: null,
    replicates: 3,
    controls: 'vehicle',
    timepoint: null,
    uncertainty: null,
    provenance: {
      kind: 'TEST_FIXTURE',
      source: 'Synthetic stand-in for a VMAT2 uptake-inhibition measurement. NOT a real result; exists only to exercise the closed-loop control flow.',
      rawDataReference: null,
      recordedAt: '2026-01-01T00:00:00.000Z',
    },
  };
}

beforeAll(async () => {
  // ONE transport pair across all rounds, so RDKit/ADMET caches carry over.
  const rdkit = createNodeRdkitTransport({ timeoutMs: 60_000 });
  const admet = createNodeAdmetTransport({ timeoutMs: 900_000 });
  const engines = { rdkit, admet };

  // ---------- ROUND 1 ----------
  round1 = runDiscoveryRound({
    roundNumber: 1,
    discovery: mephedroneDiscoveryRequest(),
    requirements: MEPHEDRONE_REQUIREMENTS,
    ingestedResults: [],
    hypotheses: [VMAT2_HYPOTHESIS],
  }, engines);

  // ---------- ROUND 2 ----------
  // The fixture binds to the two structures round 1 actually put on the front.
  const frontSmiles = round1.front
    .map((id) => round1.result.evaluatedCandidates.find((c) => c.candidateId === id)?.structure.canonicalSmiles)
    .filter((s): s is string => typeof s === 'string')
    .slice(0, 2);
  fixtures = frontSmiles.map((smiles, i) => fixtureResult(smiles, i === 0 ? 41 : 118, i));

  // Once a measurement exists it becomes a real objective — that is what makes
  // the re-ranking come from data rather than from a tuned bonus.
  const measuredObjective: Objective = {
    objectiveId: 'lower-measured-vmat2-ic50',
    propertyId: 'measured_vmat2_ic50',
    direction: 'minimise',
    rationale: 'Measured VMAT2 IC50. In this run the values are TEST_FIXTURE stand-ins, labelled as such everywhere.',
  };
  const round2Request = mephedroneDiscoveryRequest();
  round2 = runDiscoveryRound({
    roundNumber: 2,
    discovery: { ...round2Request, objectives: [...round2Request.objectives, measuredObjective] },
    requirements: MEPHEDRONE_REQUIREMENTS,
    ingestedResults: fixtures,
    hypotheses: [VMAT2_HYPOTHESIS],
  }, engines);

  // ---------- ROUND 3 ----------
  // The updated hypothesis drives a NEW generation round: the nitrile
  // requirement was violated in round 1, so that transformation is dropped and
  // the search deepens around what survived.
  const round3Request = mephedroneDiscoveryRequest();
  round3 = runDiscoveryRound({
    roundNumber: 3,
    discovery: {
      ...round3Request,
      transformations: round3Request.transformations.filter((t) => t !== 'add-nitrile'),
      maxCandidates: 40,
    },
    requirements: MEPHEDRONE_REQUIREMENTS,
    ingestedResults: fixtures,
    hypotheses: [VMAT2_HYPOTHESIS],
  }, engines);

  printLoop();
}, RUN_TIMEOUT_MS);

function printLoop(): void {
  const lines: string[] = [];
  const push = (s = '') => lines.push(s);
  const d12 = diffRounds(round1, round2);
  const d23 = diffRounds(round2, round3);

  push('');
  push('============ GENESIS CLOSED-LOOP DISCOVERY ============');
  push('');
  push(`QUESTION: ${round1.result.question.question}`);
  push('');
  push('REQUIREMENTS (machine-readable, drive generation and admissibility):');
  for (const r of MEPHEDRONE_REQUIREMENTS) {
    push(`  ${r.requirementId} [${r.kind}]${r.mandatory ? ' MANDATORY' : ''}: ${r.statement}`);
  }
  push('');

  for (const round of [round1, round2, round3]) {
    push(`---------------- ROUND ${round.roundNumber} ----------------`);
    const f = round.result.funnel;
    push(`  funnel: attempted ${f.attempted} (discarded ${f.discardedByGenerator}) -> generated ${f.generated} -> screened ${f.screeningRetained} -> mechanism ${f.mechanismNotExcluded} -> front ${f.paretoFront}`);
    push(`  funnel conserved: ${f.conserved}${f.conserved ? '' : ` — ${f.conservationNotes.join(' ')}`}`);
    push(`  discard reasons: ${JSON.stringify(round.result.generatorDiscards.byReason)}`);
    push(`  requirements: admissible ${round.requirementBatch.admissible.length}, inadmissible ${round.requirementBatch.inadmissible.length}`);
    push(`  requirements unmet by every candidate: ${round.requirementBatch.unmetByEveryCandidate.join(', ') || 'none'}`);
    push(`  epistemic: ${round.result.epistemicSummary.headline}`);
    push(`  bound results: ${round.boundResults.length} (${round.boundResults.map((b) => `${b.resultId}->${b.candidateId} [${b.kind}]`).join(', ') || 'none'})`);
    for (const a of round.hypothesisAssessments) {
      push(`  hypothesis ${a.hypothesisId}: ${a.status} [evidence: ${a.evidenceKind}]`);
      push(`    ${a.reasoning}`);
    }
    push(`  front (${round.front.length}): ${round.front.slice(0, 6).join(', ')}${round.front.length > 6 ? ', ...' : ''}`);
    const top = round.proposedExperiments[0];
    if (top !== undefined) {
      push(`  NEXT EXPERIMENT: [${top.priority}] ${top.measurement}`);
      push(`    why: ${top.why}`);
      push(`    resolves: ${top.whatItResolves}`);
      push(`    discriminates between ${top.discriminatesBetween.length} candidate(s)`);
      push(`    supported if: ${top.hypothesis.supportedIf}`);
      push(`    falsified if: ${top.hypothesis.falsifiedIf}`);
      if (top.predictedSpread !== null) push(`    predicted spread: ${top.predictedSpread.toFixed(4)} — ${top.spreadInterpretation}`);
    }
    push('');
  }

  push('---------------- ROUND DELTAS ----------------');
  push(`  R1 -> R2: ${d12.explanation}`);
  push(`     entered: ${d12.entered.join(', ') || 'none'}`);
  push(`     left:    ${d12.left.length} candidate(s)`);
  push(`  R2 -> R3: ${d23.explanation}`);
  push(`     entered: ${d23.entered.length} candidate(s)`);
  push('');
  push('EVIDENCE TRAIL (provenance labels intact):');
  for (const f of fixtures) {
    push(`  ${f.provenance.kind === 'TEST_FIXTURE' ? '[TEST_FIXTURE] ' : ''}${f.compound} ${f.target} ${f.parameter}=${f.value} ${f.unit}`);
  }
  push('');
  push(`FINGERPRINTS: R1=${round1.roundFingerprint} R2=${round2.roundFingerprint} R3=${round3.roundFingerprint}`);
  push('=======================================================');

  const text = lines.join('\n');
  // eslint-disable-next-line no-console
  console.log(text);
  const target = process.env.GENESIS_LOOP_OUT;
  if (target !== undefined && target.length > 0) writeFileSync(target, text, 'utf8');
}

describe('closed-loop discovery: three real rounds', () => {
  it('ROUND 1 runs the full pipeline and proposes a discriminating experiment', () => {
    expect(round1.result.funnel.generated).toBeGreaterThan(0);
    expect(round1.front.length).toBeGreaterThan(0);
    expect(round1.proposedExperiments.length).toBeGreaterThan(0);
    // With no VMAT2 value anywhere, the pivot experiment must lead.
    expect(round1.proposedExperiments[0]!.priority).toBe('UNMEASURED_PIVOT');
  });

  it('ROUND 1 hypothesis is UNTESTED — no result has been ingested yet', () => {
    const assessment = round1.hypothesisAssessments.find((a) => a.hypothesisId === 'h-vmat2-ic50')!;
    expect(assessment.status).toBe('UNTESTED');
    expect(assessment.evidenceKind).toBe('NONE');
  });

  it('requirements actually bite: the nitrile requirement excludes real candidates', () => {
    expect(round1.requirementBatch.inadmissible.length).toBeGreaterThan(0);
    const violators = round1.requirementBatch.reports.filter((r) => r.violated.includes('avoid-nitrile'));
    expect(violators.length).toBeGreaterThan(0);
    // Every candidate can say why it exists.
    for (const report of round1.requirementBatch.reports) {
      expect(report.generationReason.length).toBeGreaterThan(0);
    }
  });

  it('the funnel conserves in every round', () => {
    for (const round of [round1, round2, round3]) {
      expect(round.result.funnel.conserved, `round ${round.roundNumber}: ${round.result.funnel.conservationNotes.join(' ')}`).toBe(true);
      const f = round.result.funnel;
      expect(f.attempted).toBe(f.generated + f.discardedByGenerator);
    }
  });

  it('ROUND 2 binds the fixture to the exact structures it was measured on', () => {
    expect(round2.boundResults.length).toBe(fixtures.length);
    for (const bound of round2.boundResults) {
      expect(bound.kind).toBe('TEST_FIXTURE');
    }
    expect(round2.unboundResults).toEqual([]);
  });

  it('ROUND 2 updates the hypothesis from the ingested result', () => {
    const assessment = round2.hypothesisAssessments.find((a) => a.hypothesisId === 'h-vmat2-ic50')!;
    expect(assessment.status).toBe('SUPPORTED');
    expect(assessment.decidingResultIds.length).toBe(fixtures.length);
    // A fixture-driven update must never read as experimental verification.
    expect(assessment.evidenceKind).toBe('TEST_FIXTURE');
    expect(assessment.reasoning).toContain('[TEST_FIXTURE]');
  });

  it('a TEST_FIXTURE never becomes an ACTUAL_SOURCE property', () => {
    for (const candidate of round2.result.evaluatedCandidates) {
      for (const property of candidate.properties) {
        if (property.propertyId.startsWith('measured_')) {
          expect(property.status).toBe('TEST_FIXTURE');
          expect(property.engine).toContain('TEST_FIXTURE');
        }
      }
    }
  });

  it('the ingested measurement actually re-ranks the front', () => {
    const delta = diffRounds(round1, round2);
    expect(delta.unchanged).toBe(false);
    expect(delta.explanation.length).toBeGreaterThan(0);
    // The measured candidates are the only ones evaluable on every objective.
    expect(round2.front.length).toBeLessThan(round1.front.length);
  });

  it('ROUND 3 generates a NEW candidate set under the updated requirements', () => {
    expect(round3.result.discovery.batch.transformations).not.toContain('add-nitrile');
    expect(round3.result.funnel.generated).toBeGreaterThan(0);
    // Dropping the nitrile transformation must remove the nitrile violators.
    const violators = round3.requirementBatch.reports.filter((r) => r.violated.includes('avoid-nitrile'));
    expect(violators.length).toBe(0);
  });

  it('rounds are individually fingerprinted and a changed round changes its fingerprint', () => {
    expect(round1.roundFingerprint).not.toBe(round2.roundFingerprint);
    expect(round2.roundFingerprint).not.toBe(round3.roundFingerprint);
  });

  it('the loop never claims safety, efficacy or clinical equivalence', () => {
    const text = [round1, round2, round3].flatMap((r) => r.result.limitations).join(' ').toLowerCase();
    expect(text).toContain('not a claim of safety');
    expect(text).toContain('requires_experiment');
  });

  it('every proposed experiment states what would falsify the hypothesis', () => {
    for (const round of [round1, round2, round3]) {
      for (const proposal of round.proposedExperiments) {
        expect(proposal.hypothesis.falsifiedIf.length).toBeGreaterThan(0);
        expect(proposal.whatItResolves.length).toBeGreaterThan(0);
      }
    }
  });

  it('no proposed experiment fabricates cost, duration or feasibility', () => {
    for (const round of [round1, round2, round3]) {
      for (const proposal of round.proposedExperiments) {
        const text = `${proposal.why} ${proposal.whatItResolves} ${proposal.limitations.join(' ')}`.toLowerCase();
        expect(text).not.toMatch(/\$\d|\d+\s*(usd|eur|hours|days|weeks)\b/);
      }
    }
  });
});
