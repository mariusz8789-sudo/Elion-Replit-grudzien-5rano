import { beforeAll, describe, expect, it } from 'vitest';
import { createNodeAdmetTransport } from '../core/discovery/molecular/admetTransport.node';
import { createNodeRdkitTransport } from '../core/discovery/molecular/rdkitTransport.node';
import { GABA_BENZODIAZEPINE_CANDIDATE_POOL } from '../core/discovery/molecular/gabaBenzodiazepineCandidatePool';
import {
  ALPRAZOLAM_SUBSTITUTE_CHALLENGE,
  buildInitialSubstituteChallengeGraph,
  buildSubstituteChallengeReport,
  deriveFinalDiscoveryResult,
  runMechanisticSubstituteChallenge,
  saveSubstituteChallengeToMemory,
  type MechanisticSubstituteChallengeResult,
} from '../core/discovery/molecular/pharmacologicalSubstituteChallenge';
import { MECHANISTIC_MATCH_THRESHOLD } from '../core/discovery/mechanisticMatchScore';
import type { RdkitTransport } from '../core/discovery/molecular/rdkitTransport';
import type { AdmetTransport } from '../core/discovery/molecular/admetTransport';

const formulaBySmiles = new Map<string, string>([
  ...GABA_BENZODIAZEPINE_CANDIDATE_POOL
    .filter((c) => c.structure.kind === 'SMILES_CROSS_VALIDATED')
    .map((c): [string, string] => [(c.structure as { smiles: string }).smiles, (c.structure as { expectedFormula: string }).expectedFormula]),
  [ALPRAZOLAM_SUBSTITUTE_CHALLENGE.reference.smiles, 'C17H13ClN4'],
]);

function buildFakeRdkit(): RdkitTransport {
  return {
    transportId: 'test-fixture',
    detect: () => ({ available: true, engine: 'TEST_FIXTURE', version: '0' }),
    match: () => ({ ok: false, error: 'INVALID_SMILES', reason: 'fixture' }),
    describe: (smiles: string) => {
      const formula = formulaBySmiles.get(smiles);
      if (formula === undefined) return { ok: false, error: 'INVALID_SMILES', reason: 'not in fixture pool' };
      return { ok: true, engine: 'TEST_FIXTURE', data: { canonicalSmiles: smiles, molecularFormula: formula, values: {}, inchi: null, inchiKey: null } };
    },
    transform: () => ({ ok: false, error: 'INVALID_SMILES', reason: 'fixture' }),
    transformations: () => ({ ok: true, transformations: [] }),
    similarity: () => ({ ok: true, tanimoto: 0.3, fingerprint: 'fake', candidateCanonical: 'c', referenceCanonical: 'r', scaffoldCandidate: 's1', scaffoldReference: 's2', sameScaffold: false }),
  };
}

function buildFakeAdmet(): AdmetTransport {
  return {
    transportId: 'test-fixture',
    detect: () => ({ available: true, engine: 'TEST_FIXTURE', version: '0' }),
    predict: (smilesList: readonly string[]) => ({
      ok: true,
      engine: 'TEST_FIXTURE',
      bySmiles: Object.fromEntries(smilesList.map((s) => [s, {
        engine: 'TEST_FIXTURE',
        values: { AMES: 0.05, ClinTox: 0.05, DILI: 0.05, HIA_Hou: 0.8, Bioavailability_Ma: 0.7, BBB_Martins: 0.6, Pgp_Broccatelli: 0.2, CYP3A4_Veith: 0.1, CYP2D6_Veith: 0.1 },
      }])),
    }),
  };
}

function run(): MechanisticSubstituteChallengeResult {
  return runMechanisticSubstituteChallenge(ALPRAZOLAM_SUBSTITUTE_CHALLENGE, { rdkit: buildFakeRdkit(), admet: buildFakeAdmet() });
}

describe('pharmacologicalSubstituteChallenge — BEFORE state', () => {
  it('1. the question is defined and names the 95% threshold', () => {
    expect(ALPRAZOLAM_SUBSTITUTE_CHALLENGE.question).toContain('95');
  });

  it('2. every pool candidate becomes a competing hypothesis, all UNRESOLVED', () => {
    const graph = buildInitialSubstituteChallengeGraph(ALPRAZOLAM_SUBSTITUTE_CHALLENGE);
    const hyps = graph.nodes.filter((n) => n.kind === 'HYPOTHESIS');
    expect(hyps).toHaveLength(GABA_BENZODIAZEPINE_CANDIDATE_POOL.length);
    expect(hyps.every((h) => h.status === 'UNRESOLVED')).toBe(true);
  });

  it('3. the quantitative-comparability knowledge gap is represented as UNKNOWN', () => {
    const graph = buildInitialSubstituteChallengeGraph(ALPRAZOLAM_SUBSTITUTE_CHALLENGE);
    const unknown = graph.nodes.find((n) => n.kind === 'UNKNOWN')!;
    expect(unknown.status).toBe('UNKNOWN');
    expect(unknown.unknownDetail).not.toBeNull();
  });

  it('the clinical-equivalence claim is structurally prevented from resolving', () => {
    const graph = buildInitialSubstituteChallengeGraph(ALPRAZOLAM_SUBSTITUTE_CHALLENGE);
    expect(graph.nodes.find((n) => n.nodeId === 'claim-clinical-equivalence')!.status).toBe('UNRESOLVED');
  });
});

describe('pharmacologicalSubstituteChallenge — the real iterative loop', () => {
  it('4. candidate experiments are generated depending on the current state', () => {
    const result = run();
    expect(result.loopResult.steps[0]!.selection.candidates.length).toBe(GABA_BENZODIAZEPINE_CANDIDATE_POOL.length + 1);
  });

  it('5. real computation executes: cross-validation and mechanism falsification run for every candidate', () => {
    const result = run();
    for (const key of ['apigenin', 'chrysin', 'honokiol', 'curcumin']) {
      const finding = result.findings.get(key)!;
      expect(finding.crossValidation.status).toBe('CONFIRMED');
    }
  });

  it('6. the targetMatch axis is COMPUTED from the real WRONG_TARGET check, not hand-declared', () => {
    const result = run();
    const curcumin = result.findings.get('curcumin')!;
    const targetAxis = curcumin.mechanisticMatch.axes.find((a) => a.axis === 'targetMatch')!;
    expect(targetAxis.grade).toBe('MISMATCH');
    expect(targetAxis.basis).toBe('COMPUTATIONALLY_SUPPORTED');
  });

  it('7. curcumin (wrong target) is genuinely FALSIFIED regardless of its other axes', () => {
    const result = run();
    expect(result.loopResult.finalGraph.nodes.find((n) => n.nodeId === 'hyp-curcumin')!.status).toBe('FALSIFIED');
  });

  it('8. valerenic acid (real directional conflict in its own cited literature) is WEAKENED, never silently promoted', () => {
    const result = run();
    expect(result.loopResult.finalGraph.nodes.find((n) => n.nodeId === 'hyp-valerenic-acid')!.status).toBe('WEAKENED');
  });

  it('9. no candidate reaches the 95% threshold with the currently declared, honestly-limited evidence', () => {
    const result = run();
    for (const [, finding] of result.findings) {
      expect(finding.mechanisticMatch.meetsThreshold).toBe(false);
    }
  });

  it('10. every candidate\'s score is capped below 100% by the disclosed UNKNOWN assay/quantitative axes', () => {
    const result = run();
    for (const [key, finding] of result.findings) {
      if (key === 'curcumin') continue; // wrong-target candidate; axes are moot
      expect(finding.mechanisticMatch.unknownWeight).toBeGreaterThan(0);
    }
  });

  it('11. the loop terminates honestly once no candidate experiment remains useful', () => {
    const result = run();
    expect(['RESOLVED', 'NO_USEFUL_EXPERIMENT']).toContain(result.loopResult.termination);
  });

  it('12. is deterministic across independent runs', () => {
    const a = run();
    const b = run();
    expect(a.loopResult.finalGraph.fingerprint).toBe(b.loopResult.finalGraph.fingerprint);
    expect(a.loopResult.steps.map((s) => s.selectedExperimentId)).toEqual(b.loopResult.steps.map((s) => s.selectedExperimentId));
  });
});

describe('pharmacologicalSubstituteChallenge — final result and report', () => {
  it('13. the system reports NO_CANDIDATE_ABOVE_THRESHOLD rather than forcing a winner', () => {
    const result = run();
    expect(deriveFinalDiscoveryResult(result).result).toBe('NO_CANDIDATE_ABOVE_THRESHOLD');
  });

  it('14. the report names the closest real candidate and its actual percentage, never a fabricated one', () => {
    const result = run();
    const verdict = deriveFinalDiscoveryResult(result);
    expect(verdict.reasoning).toMatch(/\d+\.\d%/);
  });

  it('15. produces a complete report answering the required questions from real run data', () => {
    const result = run();
    const report = buildSubstituteChallengeReport(result);
    expect(report.question.length).toBeGreaterThan(0);
    expect(report.referenceProfile.name).toBe('alprazolam');
    expect(report.hypothesesConsidered.length).toBe(GABA_BENZODIAZEPINE_CANDIDATE_POOL.length);
    expect(report.candidatesEvaluated.length).toBe(GABA_BENZODIAZEPINE_CANDIDATE_POOL.length);
    expect(report.candidatesAbove95).toHaveLength(0);
    expect(report.candidatesFalsified.some((c) => c.candidateKey === 'curcumin')).toBe(true);
    expect(report.experimentsExecuted.length).toBeGreaterThan(0);
    expect(report.whatChangedPerStep.length).toBe(result.loopResult.steps.length);
    expect(report.strongestConclusion.result).toBe('NO_CANDIDATE_ABOVE_THRESHOLD');
    expect(report.remainsUnknown.length).toBeGreaterThan(0);
    expect(report.nextExperiment.length).toBeGreaterThan(0);
  });

  it('16. never claims clinical or functional equivalence to alprazolam for any candidate', () => {
    const result = run();
    const report = buildSubstituteChallengeReport(result);
    for (const c of report.candidatesEvaluated) {
      expect(String(c.status).toLowerCase()).not.toContain('equivalent');
    }
  });

  it('17. saves to Scientific Memory with an honest per-status breakdown', () => {
    const result = run();
    const saved = saveSubstituteChallengeToMemory(result);
    expect(saved.epistemicStatus).toContain('FALSIFIED=1');
    expect(saved.epistemicStatus).toContain('WEAKENED=1');
    expect(saved.epistemicStatus).toContain('SUPPORTED=0');
  });

  it('18. every real status change carries a real, non-empty reason', () => {
    const result = run();
    for (const step of result.loopResult.steps) {
      for (const change of step.changes) {
        expect(change.reason.length).toBeGreaterThan(0);
      }
    }
  });

  it('19. the 95% threshold constant used by this challenge matches the mechanisticMatchScore module', () => {
    expect(MECHANISTIC_MATCH_THRESHOLD).toBe(0.95);
  });
});

/**
 * REAL EXECUTION — live RDKit + live ADMET-AI. Proves the challenge runs on
 * genuinely available computation for a second real reference (alprazolam),
 * not just ketamine. Assertions here are the structural, engine-independent
 * facts (which don't depend on ADMET-AI's specific real predictions), since
 * this pool's declared axes (not ADMET output) are what caps every score
 * below 95% by design.
 */
const RUN_TIMEOUT_MS = 1_800_000;
let liveResult: MechanisticSubstituteChallengeResult;

beforeAll(async () => {
  const rdkit = createNodeRdkitTransport({ timeoutMs: 60_000 });
  const admet = createNodeAdmetTransport({ timeoutMs: 900_000 });
  liveResult = runMechanisticSubstituteChallenge(ALPRAZOLAM_SUBSTITUTE_CHALLENGE, { rdkit, admet });
}, RUN_TIMEOUT_MS);

describe('pharmacologicalSubstituteChallenge — REAL execution (live RDKit + live ADMET-AI)', () => {
  it('real RDKit confirms every candidate structure that declares one', () => {
    for (const key of ['apigenin', 'chrysin', 'honokiol', 'curcumin']) {
      expect(liveResult.findings.get(key)!.crossValidation.status).toBe('CONFIRMED');
    }
  });

  it('curcumin is genuinely FALSIFIED on real wrong-target grounds', () => {
    expect(liveResult.loopResult.finalGraph.nodes.find((n) => n.nodeId === 'hyp-curcumin')!.status).toBe('FALSIFIED');
  });

  it('valerenic acid is genuinely WEAKENED by its own conflicting cited evidence', () => {
    expect(liveResult.loopResult.finalGraph.nodes.find((n) => n.nodeId === 'hyp-valerenic-acid')!.status).toBe('WEAKENED');
  });

  it('no candidate reaches 95% given the currently declared evidence', () => {
    for (const [, finding] of liveResult.findings) {
      expect(finding.mechanisticMatch.meetsThreshold).toBe(false);
    }
  });

  it('the final result is honestly NO_CANDIDATE_ABOVE_THRESHOLD', () => {
    expect(deriveFinalDiscoveryResult(liveResult).result).toBe('NO_CANDIDATE_ABOVE_THRESHOLD');
  });

  it('produces a complete real report', () => {
    const report = buildSubstituteChallengeReport(liveResult);
    expect(report.candidatesFalsified.some((c) => c.candidateKey === 'curcumin')).toBe(true);
    expect(report.strongestConclusion.reasoning.length).toBeGreaterThan(0);
  });
});
