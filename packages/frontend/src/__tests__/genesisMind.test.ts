import { describe, expect, it } from 'vitest';
import { parseProblem } from '../core/orchestrator/nl';
import { canonicalJson, fnv1a } from '../core/events/hash';
import { generateModelSpace, modelSpecFingerprint, type ModelPoint, type ModelSpaceConstraints } from '../core/agent/modelSpace';
import { createPredictionRegistry, registerPrediction, checkPredictionOrdering } from '../core/agent/predictionRegistry';
import { createHypothesis, updateConfidence } from '../core/experimentFabric/beliefRevision';
import { MindKnowledgeIndex } from '../core/mind/knowledgeIndex';
import { buildStructuredProblemExtension } from '../core/mind/problemRepresentation';
import { expectedDiscriminationGain, rankExperimentsByGain, sigmaSeparation, INFORMATION_GAIN_METRIC_DOC } from '../core/mind/informationGain';
import { ResearchStateLog } from '../core/mind/researchState';
import { bridgeSymbolicToModelSpace } from '../core/mind/mathExprModelBridge';
import { computeNoveltyLevel } from '../core/mind/noveltyHarness';
import { createMindAdapters, buildMindPredictionRegistry, type MindPorts } from '../core/mind/mindAdapters';
import { runMindDiscovery, replayMindDiscovery, MindFailClosedError, type RunMindDiscoveryOptions } from '../core/mind/mindDiscovery';
import { runResearch } from '../core/mind/runResearch';
import { EvidenceConnectorStore } from '../core/evidenceConnectors/store';
import type { ConnectorPort, SourceConfig } from '../core/evidenceConnectors/contracts';
import { getGenesisDomain } from '../core/orchestrator/genesisDomainRegistry';
import type { AdjudicationOutcome, Candidate, ProblemRecord } from '../core/orchestrator/contracts';
import type { MindHypothesis } from '../core/mind/contracts';

/**
 * GENESIS MIND — negative-first (docs/DECISIONS.md D-060).
 *
 * Proves the Mind is wired to the REAL, unmodified `runScientificDiscovery`
 * backbone, that every fail-closed path is genuinely reachable, and — the
 * point of the whole exercise — that a Mind run cannot mint a winner out of
 * model-fitting alone: the existing D-057 Winner Promotion Gate still refuses
 * promotion on COMPUTATIONAL evidence (rank 2) against its
 * INDIRECT_RANDOMISED threshold (rank 9).
 */

const H = (value: unknown): string => fnv1a(canonicalJson(value));

// Grounded on the REAL callers' own pattern (biotechData/campaignLabs.ts:81,
// agent/structuralDiscovery.ts:155): xRange is derived from the actual x values.
const XS = [1, 2, 3, 4, 5, 6] as const;
const CONSTRAINTS: ModelSpaceConstraints = {
  maxTerms: 2,
  xRange: { min: Math.min(...XS), max: Math.max(...XS) },
  variables: ['x'],
};

/** ModelPoint is {x, y, sigma} — verified against agent/modelSpace.ts. */
const observe = (x: number): ModelPoint => ({ x, y: 2 * x + 1, sigma: 0.1 });

function realProblem(overrides: Partial<Parameters<typeof parseProblem>[1]> = {}): ProblemRecord {
  return parseProblem(
    'P-MIND',
    {
      text: 'find a lower-harm mechanism that preserves efficacy',
      objectives: [{ metric: 'efficacy', direction: 'maximize', floor: 0.8 }],
      constraints: ['legal'],
      harmAxes: ['safety'],
      evidenceMinimum: '>=1 DIRECT_RANDOMISED',
      ...overrides,
    },
    H,
  );
}

const HYPOTHESES: readonly MindHypothesis[] = [
  {
    hypothesisId: 'H1', statement: 'efficacy rises linearly with dose', mechanismId: 'M-LINEAR',
    modelSpec: null, symbolic: null, observable: 'efficacy', predictedValue: 0.9, tolerance: 0.05,
    falsificationCriterion: { metric: 'efficacy', relation: 'equal-within-tolerance', expectedValue: 0.9, tolerance: 0.05, rationale: 'linear dose response' },
    competingHypothesisIds: ['H2'], generationRationale: 'residual structure suggested a linear term', provenanceRefs: ['k1'], fingerprint: H('H1'),
  },
  {
    hypothesisId: 'H2', statement: 'efficacy saturates with dose', mechanismId: 'M-SAT',
    modelSpec: null, symbolic: null, observable: 'efficacy', predictedValue: 0.7, tolerance: 0.05,
    falsificationCriterion: { metric: 'efficacy', relation: 'equal-within-tolerance', expectedValue: 0.7, tolerance: 0.05, rationale: 'saturation' },
    competingHypothesisIds: ['H1'], generationRationale: 'competing explanation', provenanceRefs: ['k1'], fingerprint: H('H2'),
  },
];

function ports(overrides: Partial<MindPorts> = {}): MindPorts {
  return {
    backend: { available: true, candidateX: XS, observe, evidenceClass: 'COMPUTATIONAL' },
    isTautological: () => false,
    isFalsified: () => false,
    runSelfFalsification: (specs) => specs.map(() => true),
    adjudicate: () => ({ verdict: 'NO_WINNER' }) as AdjudicationOutcome,
    compare: () => 'the leading form does not separate from its rival beyond measurement error',
    buildRecipe: (winner) => ({ recipeFingerprint: H(winner) }),
    recommendNext: () => 'next: observe at the x that best separates H1 from H2',
    now: () => '2026-01-01T00:00:00Z',
    nowMs: () => 1_767_225_600_000,
    ...overrides,
  };
}

function gen(overrides: Partial<RunMindDiscoveryOptions['gen']> = {}): RunMindDiscoveryOptions['gen'] {
  return {
    constraints: CONSTRAINTS,
    hypotheses: HYPOTHESES,
    fixedRetrievalList: [],
    symbolicCandidates: [],
    gains: [{ experimentLabel: 'x=3', pairIds: ['H1', 'H2'], sigmaSeparation: 2.5, gain: 2.5 }],
    novelty: computeNoveltyLevel([{ candidateId: 'c', lineage: 'MUTATED' }], 'port:noveltyGate.assessNovelty'),
    knowledgeSnapshotFingerprint: H([]),
    researchStateHead: H('head'),
    custodyHash: 'ab12cd34',
    custodyPolicy: 'sha256',
    ...overrides,
  };
}

const synthetic = (overrides: Partial<RunMindDiscoveryOptions> = {}): RunMindDiscoveryOptions => ({
  problem: realProblem(), ports: ports(), gen: gen(), mode: 'SYNTHETIC_TEST_ONLY', ...overrides,
});

const EVIDENCE_SOURCE: SourceConfig = { sourceId: 'MIND_TEST_SOURCE', name: 'mind test source', url: 'internal://mind/test', hashPolicy: 'sha256', category: 'TEST' };
const stablePort: ConnectorPort = { fetchBytes: async () => new TextEncoder().encode('STABLE-MIND-BYTES') };

// ---------------------------------------------------------------------------
// 1-2 Problem formalization + malformed problem (negative first)
// ---------------------------------------------------------------------------
describe('problem formalization (reuses parseProblem, never a second parser)', () => {
  it('a vague problem is NEEDS_INPUT and the Mind refuses to run it', async () => {
    const vague = parseProblem('P-VAGUE', { text: 'find something better' }, H);
    expect(vague.status).toBe('NEEDS_INPUT');
    const result = await runMindDiscovery(synthetic({ problem: vague }));
    expect(result.kind).toBe('EXECUTION_BLOCKED');
    if (result.kind !== 'EXECUTION_BLOCKED') return;
    expect(result.code).toBe('MALFORMED_PROBLEM');
  });

  it('the structured extension references problemId and is deterministic', () => {
    const a = buildStructuredProblemExtension(realProblem(), ['efficacy', 'harm']);
    const b = buildStructuredProblemExtension(realProblem(), ['efficacy', 'harm']);
    expect(a.fingerprint).toBe(b.fingerprint);
    expect(a.problemId).toBe('P-MIND');
    expect(a.falsificationTargets).toEqual(['efficacy floor 0.8']);
  });
});

// ---------------------------------------------------------------------------
// 3 Knowledge provenance (negative first)
// ---------------------------------------------------------------------------
describe('knowledge index (extends KnowledgeEpistemicStatus, never a parallel axis)', () => {
  it('an LLM statement offered as FACT is downgraded to HYPOTHESIS', async () => {
    const index = new MindKnowledgeIndex();
    const record = await index.add({ itemId: 'k1', status: 'FACT', claim: 'the model asserted it', provenanceRefs: [], provenanceRanks: [3], llmAssisted: true });
    expect(record.status).toBe('HYPOTHESIS');
  });

  it('a non-LLM FACT keeps its status, and weakest-link is the minimum rank', async () => {
    const index = new MindKnowledgeIndex();
    const record = await index.add({ itemId: 'k2', status: 'FACT', claim: 'measured value', provenanceRefs: ['r1'], provenanceRanks: [6, 3, 4], llmAssisted: false });
    expect(record.status).toBe('FACT');
    expect(record.weakestLinkRank).toBe(3);
  });

  it('the snapshot fingerprint is order-independent', async () => {
    const a = new MindKnowledgeIndex();
    await a.add({ itemId: 'x', status: 'MODEL', claim: 'a', provenanceRefs: [], provenanceRanks: [5], llmAssisted: false });
    await a.add({ itemId: 'y', status: 'MODEL', claim: 'b', provenanceRefs: [], provenanceRanks: [5], llmAssisted: false });
    const b = new MindKnowledgeIndex();
    await b.add({ itemId: 'y', status: 'MODEL', claim: 'b', provenanceRefs: [], provenanceRanks: [5], llmAssisted: false });
    await b.add({ itemId: 'x', status: 'MODEL', claim: 'a', provenanceRefs: [], provenanceRanks: [5], llmAssisted: false });
    expect(await a.snapshotFingerprint()).toBe(await b.snapshotFingerprint());
  });
});

// ---------------------------------------------------------------------------
// 4 + 12 Hypothesis / evidence update via the REAL beliefRevision engine
// ---------------------------------------------------------------------------
describe('hypothesis + evidence update (reuses experimentFabric/beliefRevision)', () => {
  it('confidence rises on support and the prior hypothesis object is never mutated', () => {
    const h = createHypothesis('h1', { metric: 'efficacy', relation: 'equal-within-tolerance', expectedValue: 0.9, tolerance: 0.05, rationale: 'r' }, 0.5);
    const updated = updateConfidence(h, 'SUPPORTED_WITHIN_PROTOCOL', 0.7, 'observed within tolerance', 0);
    expect(updated.confidence).toBeGreaterThan(h.confidence);
    expect(updated.history.length).toBe(1);
    expect(h.history.length).toBe(0);
  });

  it('a falsifying observation is recorded as FALSIFIED_WITHIN_PROTOCOL', () => {
    const h = createHypothesis('h2', { metric: 'efficacy', relation: 'equal-within-tolerance', expectedValue: 0.9, tolerance: 0.05, rationale: 'r' }, 0.5);
    const updated = updateConfidence(h, 'FALSIFIED_WITHIN_PROTOCOL', 0.9, 'outside tolerance', 0);
    expect(updated.status).toBe('FALSIFIED_WITHIN_PROTOCOL');
    expect(updated.confidence).toBeLessThan(h.confidence);
  });
});

// ---------------------------------------------------------------------------
// 5-6 Mechanism diversity is real identity; generation produces distinct forms
// ---------------------------------------------------------------------------
describe('model generation (reuses modelSpace, never re-implemented)', () => {
  it('every enumerated form has a distinct fingerprint — diversity cannot be faked by renaming', () => {
    const space = generateModelSpace(CONSTRAINTS);
    const fingerprints = space.map(modelSpecFingerprint);
    expect(fingerprints.length).toBeGreaterThan(1);
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
  });

  it('the adapter reports real distinct mechanism classes in diagnostics', () => {
    const { diagnostics } = createMindAdapters({ problem: realProblem(), ports: ports(), gen: gen() });
    expect(diagnostics.distinctMechanismClasses).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// 7-8 Prediction registration + freeze ordering (negative first)
// ---------------------------------------------------------------------------
describe('predictions (reuses predictionRegistry, freeze-ordering already solved there)', () => {
  it('a prediction observed BEFORE it was frozen is reported VIOLATED', () => {
    const registry = createPredictionRegistry('R-NEG');
    registerPrediction(registry, {
      predictionId: 'P1', claim: 'efficacy is 0.9', value: 0.9, interval: { low: 0.85, high: 0.95 },
      discriminatesAgainst: ['H2'], frozenAt: 2_000,
    });
    const check = checkPredictionOrdering(registry, { predictionId: 'P1', observedAt: 1_000, observedValue: 0.9 });
    expect(check.ordering).toBe('VIOLATED');
  });

  it('a prediction frozen BEFORE observation is FROZEN_BEFORE_OBSERVED', () => {
    const registry = buildMindPredictionRegistry(HYPOTHESES, 'R-POS', 1_000);
    const check = checkPredictionOrdering(registry, { predictionId: 'H1', observedAt: 2_000, observedValue: 0.9 });
    expect(check.ordering).toBe('FROZEN_BEFORE_OBSERVED');
    expect(check.withinInterval).toBe(true);
  });

  it('a hypothesis that discriminates against nothing is refused by the real registry (fail-closed MISSING_PREDICTION)', async () => {
    const lonely: MindHypothesis = { ...HYPOTHESES[0]!, competingHypothesisIds: [] };
    const result = await runMindDiscovery(synthetic({ gen: gen({ hypotheses: [lonely] }) }));
    expect(result.kind).toBe('EXECUTION_BLOCKED');
    if (result.kind !== 'EXECUTION_BLOCKED') return;
    expect(result.code).toBe('MISSING_PREDICTION');
  });
});

// ---------------------------------------------------------------------------
// 9-10 Information gain (the one NEW primitive) — negative first
// ---------------------------------------------------------------------------
describe('expected discrimination gain (NEW: no numeric information gain existed)', () => {
  it('an experiment with zero pooled sigma discriminates nothing — gain 0, never Infinity', () => {
    expect(sigmaSeparation({ hypothesisA: 'a', hypothesisB: 'b', predictedDifference: 1, pooledSigma: 0 })).toBe(0);
    expect(expectedDiscriminationGain([{ hypothesisA: 'a', hypothesisB: 'b', predictedDifference: 1, pooledSigma: 0 }])).toBe(0);
  });

  it('no pairs means no discrimination', () => { expect(expectedDiscriminationGain([])).toBe(0); });

  it('ranks the more separating experiment first, deterministically', () => {
    const ranked = rankExperimentsByGain(['weak', 'strong'], (label) => (label === 'strong' ? 3 : 0.2));
    expect(ranked[0]).toBe('strong');
  });

  it('documents what it is NOT — no bits, no entropy, no candidate ranking', () => {
    expect(INFORMATION_GAIN_METRIC_DOC.doesNotMean).toContain('bits');
    expect(INFORMATION_GAIN_METRIC_DOC.doesNotMean).toContain('entropy reduction');
  });
});

// ---------------------------------------------------------------------------
// 11 ResearchState transitions (negative first)
// ---------------------------------------------------------------------------
describe('research state log (append-only, hash-chained)', () => {
  it('a tampered head fails chain verification', async () => {
    const log = new ResearchStateLog();
    await log.append('PROBLEM_FORMALIZED', 't', { a: 1 });
    expect(await log.verifyChain()).toBe(true);
    (log as unknown as { head: string }).head = 'tampered';
    expect(await log.verifyChain()).toBe(false);
  });

  it('events keep their order and the chain verifies end to end', async () => {
    const log = new ResearchStateLog();
    await log.append('PROBLEM_FORMALIZED', 't', { a: 1 });
    await log.append('HYPOTHESES_GENERATED', 't', { n: 2 });
    await log.append('TERMINAL', 't', { terminal: 'NO_WINNER' });
    const events = await log.events();
    expect(events.map((e) => e.seq)).toEqual([0, 1, 2]);
    expect(await log.verifyChain()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 13 Self-falsification delegated to the real 13-probe battery
// ---------------------------------------------------------------------------
describe('self-falsification', () => {
  it('the battery port is genuinely invoked with the real TOP2 model specs', async () => {
    const seen: number[] = [];
    await runMindDiscovery(synthetic({ ports: ports({ runSelfFalsification: (specs) => { seen.push(specs.length); return specs.map(() => true); } }) }));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0]).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 16-17 NO_WINNER, and the D-057 gate still refusing a computational winner
// ---------------------------------------------------------------------------
describe('verdicts through the real, unmodified orchestrator', () => {
  it('NO_WINNER leaves the recipe LOCKED', async () => {
    const result = await runMindDiscovery(synthetic());
    expect(result.kind).toBe('RUN');
    if (result.kind !== 'RUN') return;
    expect(result.verdict).toBe('NO_WINNER');
    expect(result.recipeFingerprint).toBeUndefined();
    expect(result.stages.find((s) => s.stage === '18_RECIPE_OR_LOCK')?.status).toBe('LOCKED');
    expect(result.stages.length).toBe(20);
  });

  it('THE KEY PROPERTY: a WINNER verdict on COMPUTATIONAL evidence is still refused promotion by the existing D-057 gate', async () => {
    const winner: AdjudicationOutcome = {
      verdict: 'WINNER',
      winner: { winnerId: 'W', verdict: 'WINNER', conjunctionOk: true, fingerprints: { run: '1', prereg: '1', seal: '1' } },
    };
    const result = await runMindDiscovery(synthetic({ ports: ports({ adjudicate: () => winner }) }));
    expect(result.kind).toBe('RUN');
    if (result.kind !== 'RUN') return;
    // The adjudicator said WINNER...
    expect(result.verdict).toBe('WINNER');
    // ...and the gate still refused, because COMPUTATIONAL (rank 2) is below INDIRECT_RANDOMISED (rank 9).
    expect(result.winner).toBeUndefined();
    expect(result.recipeFingerprint).toBeUndefined();
    const stage = result.stages.find((s) => s.stage === '18_RECIPE_OR_LOCK');
    expect(stage?.status).toBe('LOCKED');
    expect(stage?.note).toContain('NO_PROMOTION');
    expect(stage?.note).toContain('EVIDENCE_STRENGTH');
  });
});

// ---------------------------------------------------------------------------
// 18 Replay determinism
// ---------------------------------------------------------------------------
describe('replay', () => {
  it('two identical runs produce an identical audit fingerprint', async () => {
    const { ok } = await replayMindDiscovery(synthetic());
    expect(ok).toBe(true);
  });

  it('a blocked run replays to an identical blocked fingerprint', async () => {
    const { ok, first } = await replayMindDiscovery(synthetic({ problem: parseProblem('P-V', { text: 'vague' }, H) }));
    expect(first.kind).toBe('EXECUTION_BLOCKED');
    expect(ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 19-21 Synthetic/real boundary, economic firewall, backend fail-closed
// ---------------------------------------------------------------------------
describe('production boundary and firewalls (negative first)', () => {
  it('PRODUCTION without a custody-verified source is refused', async () => {
    const result = await runMindDiscovery({ problem: realProblem(), ports: ports(), gen: gen(), mode: 'PRODUCTION' });
    expect(result.kind).toBe('EXECUTION_BLOCKED');
    if (result.kind !== 'EXECUTION_BLOCKED') return;
    expect(result.code).toBe('INVALID_EVIDENCE_PROVENANCE');
  });

  it('PRODUCTION with a drifted artifact is refused and the drift is explicit', async () => {
    const store = new EvidenceConnectorStore();
    let call = 0;
    const drifting: ConnectorPort = { fetchBytes: async () => { call += 1; return new TextEncoder().encode(call === 1 ? 'ORIGINAL' : 'DRIFTED'); } };
    const result = await runMindDiscovery({ problem: realProblem(), ports: ports(), gen: gen(), mode: 'PRODUCTION', evidence: { store, source: EVIDENCE_SOURCE, port: drifting } });
    expect(result.kind).toBe('EXECUTION_BLOCKED');
    if (result.kind !== 'EXECUTION_BLOCKED') return;
    expect(result.code).toBe('INVALID_EVIDENCE_PROVENANCE');
    expect(result.evidenceCustody?.ok).toBe(false);
  });

  it('PRODUCTION with real custody but an unavailable backend is refused — no substituted model output', async () => {
    const result = await runMindDiscovery({
      problem: realProblem(), gen: gen(), mode: 'PRODUCTION',
      ports: ports({ backend: { available: false, candidateX: XS, observe, evidenceClass: 'COMPUTATIONAL' } }),
      evidence: { store: new EvidenceConnectorStore(), source: EVIDENCE_SOURCE, port: stablePort },
    });
    expect(result.kind).toBe('EXECUTION_BLOCKED');
    if (result.kind !== 'EXECUTION_BLOCKED') return;
    expect(result.code).toBe('BACKEND_UNAVAILABLE');
    expect(result.evidenceCustody?.ok).toBe(true); // custody passed; the backend is what refused
  });

  it('the execute port itself throws rather than fabricating an observation', () => {
    const { adapters } = createMindAdapters({
      problem: realProblem(), gen: gen(),
      ports: ports({ backend: { available: false, candidateX: XS, observe, evidenceClass: 'COMPUTATIONAL' } }),
    });
    expect(() => adapters.execute(['x=1'])).toThrow(/BACKEND_UNAVAILABLE/);
  });

  it('ECONOMIC FIREWALL: injecting cost/ROI/public-value fields cannot change the ranked order', () => {
    const { adapters } = createMindAdapters({ problem: realProblem(), ports: ports(), gen: gen() });
    const clean = adapters.generate({ problemId: 'P-MIND', modelFamilies: [], seedBase: 7, paramGridNote: '' });
    const polluted = clean.map((c) => ({ ...c, costEUR: Math.random() * 1e9, roiScore: 99, publicValueScore: 100 }) as unknown as Candidate);
    expect(H(adapters.rank(polluted).map((c) => c.candidateId))).toBe(H(adapters.rank(clean).map((c) => c.candidateId)));
  });

  it('the frozen ranking rule declares no economic term at all', () => {
    const { adapters } = createMindAdapters({ problem: realProblem(), ports: ports(), gen: gen() });
    const seal = adapters.seal(realProblem());
    const rule = JSON.parse(seal.decisionRule) as { economicTerms: readonly string[]; features: readonly string[] };
    expect(rule.economicTerms).toEqual([]);
    expect(rule.features).toEqual(['modelSelectionScore', 'holdoutScore']);
  });
});

// ---------------------------------------------------------------------------
// 22 Novelty level — computed from lineage, not asserted
// ---------------------------------------------------------------------------
describe('novelty harness (§7)', () => {
  it('retrieval alone is L0, and the level is justified by lineage evidence', () => {
    const report = computeNoveltyLevel([{ candidateId: 'a', lineage: 'FIXED_LIST' }], 'port:noveltyGate');
    expect(report.level).toBe(0);
    expect(report.perCandidate[0]?.evidence).toContain('not asserted');
  });

  it('mutation reaches L2 and outranks the initial space', () => {
    const report = computeNoveltyLevel([{ candidateId: 'a', lineage: 'INITIAL_SPACE' }, { candidateId: 'b', lineage: 'MUTATED' }], 'port:noveltyGate');
    expect(report.level).toBe(2);
  });

  it('a form the ModelBasis vocabulary cannot express becomes a SYMBOLIC MODEL_CANDIDATE (the L3 route)', () => {
    const result = bridgeSymbolicToModelSpace('sin(x) * x', null, () => null);
    expect(result.kind).toBe('SYMBOLIC_CANDIDATE_ONLY');
    expect(result.symbolic?.status).toBe('MODEL_CANDIDATE');
    expect(result.predictor(0)).toBeCloseTo(0, 10);
  });

  it('a form the vocabulary CAN express goes back through the real ModelSpec path, not the symbolic one', () => {
    const spec = generateModelSpace(CONSTRAINTS)[0]!;
    const result = bridgeSymbolicToModelSpace('x', null, () => spec);
    expect(result.kind).toBe('EXPRESSIBLE_AS_MODEL_SPEC');
    expect(result.symbolic).toBeNull();
  });

  it('the adapter derives lineage from real fingerprint-set membership', () => {
    const { diagnostics } = createMindAdapters({ problem: realProblem(), ports: ports(), gen: gen() });
    expect(diagnostics.lineage.length).toBeGreaterThan(0);
    expect(diagnostics.lineage.every((entry) => ['FIXED_LIST', 'INITIAL_SPACE', 'MUTATED', 'SYMBOLIC_COMPOSITION'].includes(entry.lineage))).toBe(true);
    expect(diagnostics.initialSpaceFingerprints.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 15 + 23 The outer loop
// ---------------------------------------------------------------------------
describe('runResearch — the outer multi-round loop', () => {
  it('stops on the caller\'s scientific decision and reports NO_WINNER with that reason', async () => {
    const result = await runResearch({
      problem: realProblem(), maxRounds: 4, now: () => 't',
      makeRoundOptions: () => synthetic(),
      shouldContinue: (_r, round) => (round === 0 ? { continue: true, reason: 'discrimination remains' } : { continue: false, reason: 'NO_INFORMATION_GAIN' }),
    });
    expect(result.rounds.length).toBe(2);
    expect(result.terminal).toBe('NO_WINNER');
    expect(result.stopReason).toBe('NO_INFORMATION_GAIN');
    expect(result.chainVerified).toBe(true);
  });

  it('exhausting the round budget is SCIENTIFIC_STOP, never a verdict about the science', async () => {
    const result = await runResearch({
      problem: realProblem(), maxRounds: 1, now: () => 't',
      makeRoundOptions: () => synthetic(),
      shouldContinue: () => ({ continue: true, reason: 'more to do' }),
    });
    expect(result.terminal).toBe('SCIENTIFIC_STOP');
  });

  it('a blocked round terminates the loop as EXECUTION_BLOCKED', async () => {
    const result = await runResearch({
      problem: realProblem(), maxRounds: 3, now: () => 't',
      makeRoundOptions: () => synthetic({ problem: parseProblem('P-V', { text: 'vague' }, H) }),
      shouldContinue: () => ({ continue: true, reason: 'x' }),
    });
    expect(result.terminal).toBe('EXECUTION_BLOCKED');
    expect(result.stopReason).toBe('MALFORMED_PROBLEM');
  });
});

// ---------------------------------------------------------------------------
// 24-25 Registry + typed fail-closed codes
// ---------------------------------------------------------------------------
describe('registry and fail-closed discipline', () => {
  it('the existing domain registry still fails closed on an unknown id', () => {
    expect(() => getGenesisDomain('NOT_A_DOMAIN')).toThrow();
  });

  it('MindFailClosedError carries a typed code and a FAIL_CLOSED-prefixed message', () => {
    const error = new MindFailClosedError('replay drifted', 'REPLAY_MISMATCH');
    expect(error.code).toBe('REPLAY_MISMATCH');
    expect(error.message).toContain('FAIL_CLOSED[REPLAY_MISMATCH]');
  });

  it('every result is frozen — a run record can never be edited after the fact', async () => {
    const result = await runMindDiscovery(synthetic());
    expect(Object.isFrozen(result)).toBe(true);
  });
});
