import type {
  AdjudicationOutcome,
  Candidate,
  DiscoveryRun,
  ExecutedExperiment,
  FalsificationOutcome,
  FreezeSeal,
  IngestedEvidence,
  OrchestratorAdapters,
  ProblemRecord,
  RecipeOutcome,
  WinnerRecordRef,
} from '../orchestrator/contracts';
import { freeze, preRegister, type FrozenProtocol } from '../agent/genesisAdjudicationProtocol';
import {
  estimatedCoefficientCount,
  fitModelSpec,
  generateModelSpace,
  holdoutScore,
  modelSelectionScore,
  modelSpecFingerprint,
  mutateModelSpec,
  renderModelSpec,
  type ModelPoint,
  type ModelSpec,
  type ModelSpaceConstraints,
} from '../agent/modelSpace';
import { createPredictionRegistry, registerPrediction, registryFingerprint, type PredictionRegistry } from '../agent/predictionRegistry';
import { canonicalJson, fnv1a } from '../events/hash';
import { rankExperimentsByGain } from './informationGain';
import type { DiscriminationGainRecord, MindAdapterBundle, MindAdapterDiagnostics, MindHypothesis, MindLineage, NoveltyLevelReport } from './contracts';

/**
 * THE BRIDGE (docs/DECISIONS.md D-060) — the Mind's reasoning products
 * projected onto the D-055 `OrchestratorAdapters` port set.
 *
 * This is the piece that did not exist in any form: `core/agent/**` imported
 * NOTHING from `core/orchestrator/**`, so the Mind's output never reached
 * `runScientificDiscovery`. Every port below delegates; none of them decides
 * anything scientific by itself.
 *
 * WHY THE PORTS ARE SYNCHRONOUS. `OrchestratorAdapters` is synchronous by
 * contract (contracts.ts, untouched). Anything async — custody, real I/O —
 * happens in `mindDiscovery.ts` BEFORE the pipeline starts, and its resolved
 * result is injected here as a plain value. Same pattern as D-059.
 *
 * WHERE THE WINNER COMES FROM. `adjudicate` delegates to an injected real
 * adjudicator; the resulting `WinnerRecordRef` then passes through
 * `orchestrator.ts`'s own D-057 Winner Promotion Gate unchanged. A Mind run
 * whose evidence is `COMPUTATIONAL` will reach a WINNER *verdict* and still
 * have its recipe LOCKED by that gate — that is the gate working, not a bug.
 */

/** The real execution backend. `available: false` is a genuine refusal, never a substituted model output. */
export interface MindBackendPort {
  readonly available: boolean;
  readonly observe: (x: number) => ModelPoint | null;
  readonly candidateX: readonly number[];
  readonly evidenceClass: string;
}

export interface MindPorts {
  readonly backend: MindBackendPort;
  /** -> `agent/tautologyGate.ts` */
  readonly isTautological: (spec: ModelSpec) => boolean;
  /** -> `agent/falsifiedModelRegistry.ts::consultFalsifiedModelRegistry` — never re-propose a falsified form. */
  readonly isFalsified: (spec: ModelSpec) => boolean;
  /** -> `agent/selfFalsificationBattery.ts` (13 probes). */
  readonly runSelfFalsification: (specs: readonly ModelSpec[]) => readonly boolean[];
  /** -> the domain's real D-047 adjudicator. */
  readonly adjudicate: (top2: readonly Candidate[], evidence: readonly ExecutedExperiment[], seal: FreezeSeal) => AdjudicationOutcome;
  readonly compare: (top2: readonly Candidate[], seal: FreezeSeal) => string;
  /** -> a domain-scoped recipe builder; `null` means LOCKED. */
  readonly buildRecipe: (winner: WinnerRecordRef) => RecipeOutcome | null;
  /** -> `agent/nextAction.ts` / `agent/nextQuestion.ts` */
  readonly recommendNext: (run: DiscoveryRun) => string;
  /** Provenance only (D-040 clock rule) — supplied, never read from the system clock. */
  readonly now: () => string;
  /** Epoch ms for `predictionRegistry`'s own numeric `frozenAt`. */
  readonly nowMs: () => number;
}

export interface MindGeneratorInput {
  readonly constraints: ModelSpaceConstraints;
  readonly hypotheses: readonly MindHypothesis[];
  /** L0 control: forms handed in from a list, so the novelty harness can tell retrieval from generation. */
  readonly fixedRetrievalList: readonly ModelSpec[];
  readonly symbolicCandidates: readonly ModelSpec[];
  readonly gains: readonly DiscriminationGainRecord[];
  readonly novelty: NoveltyLevelReport;
  readonly knowledgeSnapshotFingerprint: string;
  readonly researchStateHead: string;
  /** D-059 custody: the STABLE hash + policy. NEVER the artifactId — the store mints a fresh one per ingest and it would break replay. */
  readonly custodyHash: string;
  readonly custodyPolicy: string;
}

export interface CreateMindAdaptersOptions {
  readonly problem: ProblemRecord;
  readonly ports: MindPorts;
  readonly gen: MindGeneratorInput;
}

/** The frozen ranking rule. Contains model-fit features ONLY — the empty `economicTerms` is asserted by test, so an economic field cannot be added here unnoticed. */
const RANKING_RULE = Object.freeze({
  features: Object.freeze(['modelSelectionScore', 'holdoutScore'] as const),
  economicTerms: Object.freeze([] as readonly string[]),
});

/**
 * Registers one prediction per hypothesis through the REAL, unmodified
 * `predictionRegistry` — including its own guards, which are the point:
 * an empty `discriminatesAgainst` throws ("a prediction that distinguishes
 * this claim from no named alternative is trivially satisfiable"), and
 * `mindDiscovery` converts that into a fail-closed `MISSING_PREDICTION`.
 */
export function buildMindPredictionRegistry(hypotheses: readonly MindHypothesis[], registryId: string, frozenAt: number): PredictionRegistry {
  const registry = createPredictionRegistry(registryId);
  for (const hypothesis of hypotheses) {
    registerPrediction(registry, {
      predictionId: hypothesis.hypothesisId,
      claim: `${hypothesis.observable} = ${hypothesis.predictedValue} (±${hypothesis.tolerance}) — ${hypothesis.statement}`,
      value: hypothesis.predictedValue,
      interval: { low: hypothesis.predictedValue - hypothesis.tolerance, high: hypothesis.predictedValue + hypothesis.tolerance },
      discriminatesAgainst: hypothesis.competingHypothesisIds,
      frozenAt,
    });
  }
  return registry;
}

export function createMindAdapters(options: CreateMindAdaptersOptions): MindAdapterBundle {
  const { ports, gen } = options;

  const initialSpace = generateModelSpace(gen.constraints);
  const initialFingerprints = new Set(initialSpace.map(modelSpecFingerprint));
  const fixedFingerprints = new Set(gen.fixedRetrievalList.map(modelSpecFingerprint));
  const mutated = initialSpace.flatMap((parent) => mutateModelSpec(parent, gen.constraints));
  const mutatedFingerprints = new Set(mutated.map(modelSpecFingerprint));
  const symbolicFingerprints = new Set(gen.symbolicCandidates.map(modelSpecFingerprint));

  const pool: readonly ModelSpec[] = [...gen.fixedRetrievalList, ...initialSpace, ...mutated, ...gen.symbolicCandidates];
  const specByFingerprint = new Map(pool.map((spec) => [modelSpecFingerprint(spec), spec]));

  // Lineage is decided by real fingerprint-set membership, in strictly increasing
  // order of novelty — a form present in both the initial space and the mutation
  // output is INITIAL_SPACE, never upgraded to MUTATED.
  const lineageOf = (fingerprint: string): MindLineage => {
    if (fixedFingerprints.has(fingerprint)) return 'FIXED_LIST';
    if (initialFingerprints.has(fingerprint)) return 'INITIAL_SPACE';
    if (mutatedFingerprints.has(fingerprint)) return 'MUTATED';
    if (symbolicFingerprints.has(fingerprint)) return 'SYMBOLIC_COMPOSITION';
    return 'INITIAL_SPACE';
  };

  const observationCache = new Map<number, ModelPoint>();
  const observeOnce = (x: number): ModelPoint | null => {
    if (!ports.backend.available) return null;
    const cached = observationCache.get(x);
    if (cached !== undefined) return cached;
    const point = ports.backend.observe(x);
    if (point !== null) observationCache.set(x, point);
    return point;
  };
  const observedPoints = (): readonly ModelPoint[] =>
    ports.backend.candidateX.map(observeOnce).filter((point): point is ModelPoint => point !== null);

  const scoreCache = new Map<string, number>();
  const scoreSpec = (spec: ModelSpec): number => {
    const fingerprint = modelSpecFingerprint(spec);
    const cached = scoreCache.get(fingerprint);
    if (cached !== undefined) return cached;
    const points = observedPoints();
    let score = Number.NEGATIVE_INFINITY;
    if (points.length > 0) {
      const fit = fitModelSpec(spec, points);
      if (fit.ok) {
        // Both terms are real model-fit quality measures from modelSpace.ts. No economic input exists on this path.
        score = modelSelectionScore(fit.rss, estimatedCoefficientCount(spec), points.length) + (holdoutScore(spec, points) ?? 0);
      }
    }
    scoreCache.set(fingerprint, score);
    return score;
  };
  const scoreOfCandidate = (candidate: Candidate): number => {
    const spec = specByFingerprint.get(candidate.candidateId);
    return spec === undefined ? Number.NEGATIVE_INFINITY : scoreSpec(spec);
  };

  /** Mechanism identity is the REAL rendered form — never a renamed variant, so diversity cannot be faked. */
  const toCandidate = (spec: ModelSpec): Candidate =>
    Object.freeze({
      candidateId: modelSpecFingerprint(spec),
      mechanismClass: renderModelSpec(spec),
      score: 0,
      riskGrade: 'UNSCREENED',
      evidenceRefs: Object.freeze([] as readonly string[]),
    });

  let frozenSeal: FrozenProtocol<typeof RANKING_RULE> | null = null;

  const adapters: OrchestratorAdapters = {
    generate: () => pool.map(toCandidate),

    normalizeDedup: (candidates) => {
      const seen = new Set<string>();
      return candidates.filter((candidate) => {
        if (seen.has(candidate.candidateId)) return false;
        seen.add(candidate.candidateId);
        return true;
      });
    },

    hardFilter: (candidates) =>
      candidates.filter((candidate) => {
        const spec = specByFingerprint.get(candidate.candidateId);
        return spec !== undefined && !ports.isTautological(spec) && !ports.isFalsified(spec);
      }),

    // Reports, never eliminates — the same convention govLowerHarmAdapters.ts and
    // govE2E01Adapters.ts already use. The real count is in diagnostics.
    diversity: (candidates) => candidates,

    rank: (candidates) => [...candidates].sort((a, b) => scoreOfCandidate(b) - scoreOfCandidate(a)),

    top10: (candidates) => candidates.slice(0, 10),
    top2: (candidates) => candidates.slice(0, 2),

    seal: (problem: ProblemRecord): FreezeSeal => {
      // Reuses the D-047 protocol's own preRegister+freeze rather than inventing a freeze.
      const pre = preRegister({
        protocolId: `MIND-PREREG-${problem.problemId}`,
        subjectId: problem.problemId,
        question: problem.nlInput,
        rule: RANKING_RULE,
        declaredAt: ports.now(),
      });
      frozenSeal = freeze(pre, ports.now());
      return Object.freeze({
        decisionRule: canonicalJson(RANKING_RULE),
        falsificationCriteria: 'selfFalsificationBattery (13 preregistered probes) + each hypothesis\'s own frozen falsification criterion',
        evidenceMinimum: problem.evidenceMinimum,
        comparisonRule: 'modelSelectionScore + holdoutScore over the frozen model pool',
        sealFingerprint: frozenSeal.ruleFingerprint,
        sealedAt: frozenSeal.frozenAt,
      });
    },

    verifySealUnchanged: (seal: FreezeSeal) => frozenSeal !== null && frozenSeal.ruleFingerprint === seal.sealFingerprint,

    planExperiments: (): readonly string[] => {
      const labels = ports.backend.candidateX.map((x) => `x=${x}`);
      const gainOf = (label: string): number => gen.gains.find((record) => record.experimentLabel === label)?.gain ?? 0;
      return rankExperimentsByGain(labels, gainOf).slice(0, 3);
    },

    execute: (plan): readonly ExecutedExperiment[] => {
      if (!ports.backend.available) {
        throw new MindBackendUnavailableError('required execution backend is unavailable — refusing to substitute a model output for an observation');
      }
      return plan.map((experimentId) => {
        const x = Number(experimentId.replace('x=', ''));
        const point = Number.isFinite(x) ? observeOnce(x) : null;
        return Object.freeze({
          experimentId,
          evidenceClass: ports.backend.evidenceClass,
          summary: Object.freeze({ x: Number.isFinite(x) ? x : 0, observationCount: point === null ? 0 : 1, y: point?.y ?? Number.NaN }),
        });
      });
    },

    // Custody travels as the STABLE hash + policy. artifactId is deliberately absent — see MindGeneratorInput.
    ingestEvidence: (executed): readonly IngestedEvidence[] =>
      executed.map((experiment) =>
        Object.freeze({ ref: experiment.experimentId, provenance: `mind-backend custody hash=${gen.custodyHash} hashPolicy=${gen.custodyPolicy}` }),
      ),

    falsify: (top2): FalsificationOutcome => {
      const specs = top2.map((candidate) => specByFingerprint.get(candidate.candidateId)).filter((spec): spec is ModelSpec => spec !== undefined);
      return { survived: ports.runSelfFalsification(specs), note: 'selfFalsificationBattery (13 preregistered probes) via port — not re-implemented here' };
    },

    adjudicate: (top2, evidence, seal) => ports.adjudicate(top2, evidence, seal),
    compare: (top2, seal) => ports.compare(top2, seal),
    buildRecipe: (winner) => ports.buildRecipe(winner),
    recommendNext: (run) => ports.recommendNext(run),
    hash: (value) => fnv1a(canonicalJson(value)),
  };

  const diagnostics: MindAdapterDiagnostics = Object.freeze({
    hypotheses: gen.hypotheses,
    predictionsRegistryFingerprint: registryFingerprint(
      buildMindPredictionRegistry(gen.hypotheses, `MIND-PRED-${options.problem.problemId}`, ports.nowMs()),
    ),
    discriminationGains: gen.gains,
    noveltyLevel: gen.novelty,
    researchStateHead: gen.researchStateHead,
    knowledgeSnapshotFingerprint: gen.knowledgeSnapshotFingerprint,
    initialSpaceFingerprints: [...initialFingerprints],
    lineage: pool.map((spec) => {
      const fingerprint = modelSpecFingerprint(spec);
      return { candidateId: fingerprint, lineage: lineageOf(fingerprint) };
    }),
    distinctMechanismClasses: new Set(pool.map(renderModelSpec)).size,
  });

  return { adapters, diagnostics };
}

/** Thrown by the `execute` port only. `mindDiscovery` converts it into a structured `EXECUTION_BLOCKED` result. */
export class MindBackendUnavailableError extends Error {
  constructor(message: string) {
    super(`FAIL_CLOSED[BACKEND_UNAVAILABLE]: ${message}`);
    this.name = 'MindBackendUnavailableError';
  }
}
