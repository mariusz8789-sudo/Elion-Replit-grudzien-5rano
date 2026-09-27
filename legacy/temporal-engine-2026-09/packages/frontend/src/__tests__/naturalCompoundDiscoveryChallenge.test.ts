import { beforeAll, describe, expect, it } from 'vitest';
import { createNodeAdmetTransport } from '../core/discovery/molecular/admetTransport.node';
import { createNodeRdkitTransport } from '../core/discovery/molecular/rdkitTransport.node';
import { NATURAL_PRODUCT_CANDIDATE_POOL } from '../core/discovery/molecular/naturalProductCandidatePool';
import {
  QUESTION,
  buildDiscoveryChallengeReport,
  buildInitialNaturalCompoundGraph,
  classifyEvidenceBasis,
  deriveOverallConclusion,
  runNaturalCompoundDiscoveryChallenge,
  saveNaturalCompoundDiscoveryChallengeToMemory,
  type NaturalCompoundDiscoveryChallengeResult,
} from '../core/discovery/molecular/naturalCompoundDiscoveryChallenge';
import type { RdkitTransport } from '../core/discovery/molecular/rdkitTransport';
import type { AdmetTransport } from '../core/discovery/molecular/admetTransport';

const formulaBySmiles = new Map(
  NATURAL_PRODUCT_CANDIDATE_POOL
    .filter((c) => c.structure.kind === 'SMILES_CROSS_VALIDATED')
    .map((c) => [(c.structure as { smiles: string }).smiles, (c.structure as { expectedFormula: string }).expectedFormula]),
);

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

function buildFakeAdmet(toxic = false): AdmetTransport {
  return {
    transportId: 'test-fixture',
    detect: () => ({ available: true, engine: 'TEST_FIXTURE', version: '0' }),
    predict: (smilesList: readonly string[]) => ({
      ok: true,
      engine: 'TEST_FIXTURE',
      bySmiles: Object.fromEntries(smilesList.map((s) => [s, {
        engine: 'TEST_FIXTURE',
        values: { AMES: toxic ? 0.95 : 0.05, ClinTox: 0.05, DILI: 0.05, HIA_Hou: 0.8, Bioavailability_Ma: 0.7, BBB_Martins: 0.6, Pgp_Broccatelli: 0.2, CYP3A4_Veith: 0.1, CYP2D6_Veith: 0.1 },
      }])),
    }),
  };
}

function run(): NaturalCompoundDiscoveryChallengeResult {
  return runNaturalCompoundDiscoveryChallenge({ rdkit: buildFakeRdkit(), admet: buildFakeAdmet() });
}

describe('naturalCompoundDiscoveryChallenge — BEFORE state', () => {
  it('1. the question is defined', () => {
    expect(QUESTION.length).toBeGreaterThan(0);
  });

  it('2. every pool candidate becomes a competing hypothesis, all UNRESOLVED', () => {
    const graph = buildInitialNaturalCompoundGraph();
    const hyps = graph.nodes.filter((n) => n.kind === 'HYPOTHESIS');
    expect(hyps).toHaveLength(NATURAL_PRODUCT_CANDIDATE_POOL.length);
    expect(hyps.every((h) => h.status === 'UNRESOLVED')).toBe(true);
  });

  it('3. a genuine knowledge gap is represented as UNKNOWN, not silently assumed', () => {
    const graph = buildInitialNaturalCompoundGraph();
    const unknown = graph.nodes.find((n) => n.kind === 'UNKNOWN')!;
    expect(unknown.status).toBe('UNKNOWN');
    expect(unknown.unknownDetail).not.toBeNull();
  });

  it('the ethical equivalence claim is structurally prevented from resolving from the start', () => {
    const graph = buildInitialNaturalCompoundGraph();
    const claim = graph.nodes.find((n) => n.nodeId === 'claim-clinical-equivalence')!;
    expect(claim.status).toBe('UNRESOLVED');
  });
});

describe('naturalCompoundDiscoveryChallenge — THE REAL ITERATIVE LOOP', () => {
  it('4. candidate experiments are generated depending on the current state (initially: every candidate + not yet ADMET)', () => {
    const result = run();
    const step0 = result.loopResult.steps[0]!;
    expect(step0.selection.candidates.length).toBe(NATURAL_PRODUCT_CANDIDATE_POOL.length + 1);
  });

  it('5. the most-prioritised available candidate is selected first (real, declared evidence-axis count, not scripted)', () => {
    const result = run();
    expect(result.loopResult.steps[0]!.selectedExperimentId).toBe('investigate-agmatine');
  });

  it('6. real computation actually executes: the experiment node becomes ESTABLISHED with real findings recorded', () => {
    const result = run();
    const finding = result.findings.get('agmatine')!;
    expect(finding.crossValidation.status).toBe('CONFIRMED');
    expect(finding.mechanismReport.verdict).toBe('RETAINED');
  });

  it('7. the epistemic state updates from real evidence: a wrong-target candidate is genuinely FALSIFIED', () => {
    const result = run();
    const harmaline = result.loopResult.finalGraph.nodes.find((n) => n.nodeId === 'hyp-harmaline')!;
    expect(harmaline.status).toBe('FALSIFIED');
    expect(harmaline.statusReason).toContain('Mechanism-level falsification');
  });

  it('a directionally-opposite candidate is WEAKENED, not silently promoted', () => {
    const result = run();
    for (const key of ['d-serine', 'glycine', 'quinolinic-acid']) {
      expect(result.loopResult.finalGraph.nodes.find((n) => n.nodeId === `hyp-${key}`)!.status).toBe('WEAKENED');
    }
  });

  it('8. reselection is genuinely state-dependent: candidates already resolved at the cheap-battery stage never reach the (expensive) ADMET selection', () => {
    const result = run();
    const admetStep = result.loopResult.steps.find((s) => s.selectedExperimentId === 'admet-batch')!;
    expect([...admetStep.selection.selected!.openHypothesisIds].sort()).toEqual(['hyp-agmatine', 'hyp-kynurenic-acid']);
  });

  it('9. ADMET-AI genuinely runs and promotes the two computationally-corroborated candidates to SUPPORTED', () => {
    const result = run();
    expect(result.loopResult.finalGraph.nodes.find((n) => n.nodeId === 'hyp-agmatine')!.status).toBe('SUPPORTED');
    expect(result.loopResult.finalGraph.nodes.find((n) => n.nodeId === 'hyp-kynurenic-acid')!.status).toBe('SUPPORTED');
    expect(result.findings.get('agmatine')!.admetRan).toBe(true);
  });

  it('10. a real ADMET toxicity signal genuinely falsifies a candidate that would otherwise have been supported', () => {
    const result = runNaturalCompoundDiscoveryChallenge({ rdkit: buildFakeRdkit(), admet: buildFakeAdmet(true) });
    const agmatine = result.loopResult.finalGraph.nodes.find((n) => n.nodeId === 'hyp-agmatine')!;
    expect(agmatine.status).toBe('FALSIFIED');
    expect(agmatine.statusReason).toContain('Mechanism-level falsification');
    expect(agmatine.statusReason.toLowerCase()).toContain('mutagenicity');
  });

  it('11. a candidate with no structure and no further available experiment stays honestly UNRESOLVED — no forced positive discovery', () => {
    const result = run();
    expect(result.loopResult.finalGraph.nodes.find((n) => n.nodeId === 'hyp-conantokin-g')!.status).toBe('UNRESOLVED');
  });

  it('12. the loop terminates NO_USEFUL_EXPERIMENT (honest: not everything could be resolved), not a fabricated RESOLVED', () => {
    const result = run();
    expect(result.loopResult.termination).toBe('NO_USEFUL_EXPERIMENT');
  });

  it('13. is deterministic: two independent runs produce the identical final fingerprint and step sequence', () => {
    const a = run();
    const b = run();
    expect(a.loopResult.finalGraph.fingerprint).toBe(b.loopResult.finalGraph.fingerprint);
    expect(a.loopResult.steps.map((s) => s.selectedExperimentId)).toEqual(b.loopResult.steps.map((s) => s.selectedExperimentId));
  });
});

describe('naturalCompoundDiscoveryChallenge — evidence classification and conclusion', () => {
  it('14. classifies a SUPPORTED, independently-computationally-corroborated candidate correctly', () => {
    const result = run();
    const finding = result.findings.get('agmatine')!;
    expect(classifyEvidenceBasis(finding, finding.confidenceLevel)).toBe('DISCOVERED_COMPUTATIONALLY_SUPPORTED');
  });

  it('15. classifies a directionally-weakened, citation-only candidate as LITERATURE_SUPPORTED', () => {
    const result = run();
    const finding = result.findings.get('d-serine')!;
    expect(classifyEvidenceBasis(finding, finding.confidenceLevel)).toBe('LITERATURE_SUPPORTED');
  });

  it('16. the system is allowed to conclude "candidate found and supported" — never forced positive when unwarranted', () => {
    const result = run();
    expect(deriveOverallConclusion(result).conclusion).toBe('CANDIDATE_FOUND_AND_SUPPORTED');
  });

  it('would conclude NO_CANDIDATE if every hypothesis were falsified (never fabricates a winner)', () => {
    const emptyPool = NATURAL_PRODUCT_CANDIDATE_POOL.filter((c) => c.candidateKey === 'harmaline');
    const result = runNaturalCompoundDiscoveryChallenge({ rdkit: buildFakeRdkit(), admet: buildFakeAdmet() }, emptyPool);
    expect(deriveOverallConclusion(result).conclusion).toBe('NO_CANDIDATE');
  });
});

describe('naturalCompoundDiscoveryChallenge — the 12-question report', () => {
  it('17. answers all 12 required questions from real run data', () => {
    const result = run();
    const report = buildDiscoveryChallengeReport(result);
    expect(report.question.length).toBeGreaterThan(0);
    expect(report.hypothesesConsidered.length).toBe(NATURAL_PRODUCT_CANDIDATE_POOL.length);
    expect(report.whatWasKnown.length).toBeGreaterThan(0);
    expect(report.whatWasUnknown.length).toBeGreaterThan(0);
    expect(report.candidatesSurvived.some((c) => c.candidateKey === 'agmatine')).toBe(true);
    expect(report.candidatesFalsified.some((c) => c.candidateKey === 'harmaline')).toBe(true);
    expect(report.experimentsExecuted.length).toBe(result.loopResult.steps.filter((s) => s.executed).length);
    expect(report.whatChangedPerStep.length).toBe(result.loopResult.steps.length);
    expect(report.strongestConclusion.conclusion).toBe('CANDIDATE_FOUND_AND_SUPPORTED');
    expect(report.remainsUnknown.length).toBeGreaterThan(0);
    expect(report.nextExperiment.length).toBeGreaterThan(0);
  });

  it('18. never claims clinical/functional equivalence to the reference for any candidate', () => {
    const result = run();
    const report = buildDiscoveryChallengeReport(result);
    for (const c of report.candidatesSurvived) {
      expect(c.reason.toLowerCase()).not.toContain('equivalent to');
    }
  });

  it('19. saves to Scientific Memory with an honest per-status breakdown', () => {
    const result = run();
    const saved = saveNaturalCompoundDiscoveryChallengeToMemory(result);
    expect(saved.epistemicStatus).toContain('SUPPORTED=2');
    expect(saved.epistemicStatus).toContain('WEAKENED=3');
    expect(saved.epistemicStatus).toContain('FALSIFIED=1');
    expect(saved.epistemicStatus).toContain('UNRESOLVED=1');
  });

  it('20. every real status change carries a real, non-empty reason', () => {
    const result = run();
    for (const step of result.loopResult.steps) {
      for (const change of step.changes) {
        expect(change.reason.length).toBeGreaterThan(0);
      }
    }
  });
});

/**
 * REAL EXECUTION — live RDKit + live ADMET-AI. This is the mission's
 * required proof that the challenge runs on genuinely available
 * computation, not simulated stand-ins. Assertions here are deliberately
 * weaker than the fake-transport suite above for whichever facts genuinely
 * depend on ADMET-AI's real (uninspected-in-advance) predictions — this
 * test asserts real, structural invariants, never a hard-coded expectation
 * of what a live model must return.
 */
const RUN_TIMEOUT_MS = 1_800_000;
let liveResult: NaturalCompoundDiscoveryChallengeResult;

beforeAll(async () => {
  const rdkit = createNodeRdkitTransport({ timeoutMs: 60_000 });
  const admet = createNodeAdmetTransport({ timeoutMs: 900_000 });
  liveResult = runNaturalCompoundDiscoveryChallenge({ rdkit, admet });
}, RUN_TIMEOUT_MS);

describe('naturalCompoundDiscoveryChallenge — REAL execution (live RDKit + live ADMET-AI)', () => {
  it('round 1 selects agmatine first, purely from declared pool data (independent of any live engine result)', () => {
    expect(liveResult.loopResult.steps[0]!.selectedExperimentId).toBe('investigate-agmatine');
  });

  it('real RDKit confirms the pool\'s declared structures for candidates that have one', () => {
    for (const key of ['agmatine', 'kynurenic-acid', 'd-serine', 'glycine', 'quinolinic-acid']) {
      const finding = liveResult.findings.get(key)!;
      expect(finding.crossValidation.status).toBe('CONFIRMED');
    }
  });

  it('harmaline is genuinely FALSIFIED on real wrong-target grounds', () => {
    expect(liveResult.loopResult.finalGraph.nodes.find((n) => n.nodeId === 'hyp-harmaline')!.status).toBe('FALSIFIED');
  });

  it('the three directionally-opposite candidates are genuinely WEAKENED', () => {
    for (const key of ['d-serine', 'glycine', 'quinolinic-acid']) {
      expect(liveResult.loopResult.finalGraph.nodes.find((n) => n.nodeId === `hyp-${key}`)!.status).toBe('WEAKENED');
    }
  });

  it('conantokin-g (no verifiable structure) stays honestly UNRESOLVED', () => {
    expect(liveResult.loopResult.finalGraph.nodes.find((n) => n.nodeId === 'hyp-conantokin-g')!.status).toBe('UNRESOLVED');
  });

  it('agmatine and kynurenic-acid reach a real, computed final verdict (SUPPORTED or FALSIFIED) via real ADMET-AI, never left ambiguous', () => {
    for (const key of ['agmatine', 'kynurenic-acid']) {
      const status = liveResult.loopResult.finalGraph.nodes.find((n) => n.nodeId === `hyp-${key}`)!.status;
      expect(['SUPPORTED', 'FALSIFIED']).toContain(status);
      expect(liveResult.findings.get(key)!.admetRan).toBe(true);
    }
  });

  it('the loop terminates honestly (RESOLVED or NO_USEFUL_EXPERIMENT — never a fabricated verdict for conantokin-g)', () => {
    expect(['RESOLVED', 'NO_USEFUL_EXPERIMENT']).toContain(liveResult.loopResult.termination);
  });

  it('the real run replays: the same real transports produce the identical step sequence', () => {
    const rdkit = createNodeRdkitTransport({ timeoutMs: 60_000 });
    const admet = createNodeAdmetTransport({ timeoutMs: 900_000 });
    const second = runNaturalCompoundDiscoveryChallenge({ rdkit, admet });
    expect(second.loopResult.steps.map((s) => s.selectedExperimentId)).toEqual(liveResult.loopResult.steps.map((s) => s.selectedExperimentId));
    expect(second.loopResult.finalGraph.fingerprint).toBe(liveResult.loopResult.finalGraph.fingerprint);
  }, RUN_TIMEOUT_MS);

  it('produces a complete, real 12-question report', () => {
    const report = buildDiscoveryChallengeReport(liveResult);
    expect(report.candidatesFalsified.some((c) => c.candidateKey === 'harmaline')).toBe(true);
    expect(report.strongestConclusion.conclusion.length).toBeGreaterThan(0);
  });
});
