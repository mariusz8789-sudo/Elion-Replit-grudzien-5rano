import { canonicalJson, fnv1a } from '../events/hash';
import {
  loadGeneratedCandidates,
  checkGenerationNotPinned,
  runTier1,
  runTier2,
  selectTop3,
  deepFalsify,
  selectWinner,
  generateResearchRecipe,
  type E2E01GeneratedCandidate,
  type E2E01StageResult,
  type E2E01Top3Entry,
  type E2E01DeepFalsification,
  type E2E01WinnerDecision,
  type E2E01ResearchRecipe,
} from '../biotechData/govDrugDiscoveryE2E';
import { E2E01_PREREGISTRATION, E2E01_POPULATION, E2E01_FALSIFICATION_ATTACKS } from '../biotechData/govDrugDiscoveryE2EPreregistration';
import { runA3GovernmentRecommendation, type A3CandidateView } from '../biotechData/a3GovernmentDrugRecommendation';
import type { A3PopulationSpec } from '../biotechData/a3GovernmentPreregistration';
import { strongestEvidenceClassForEfficacy } from './evidenceClassMapping';
import type { EvidenceCustodyResult } from './evidenceCustody';
import type {
  AdjudicationOutcome,
  Candidate,
  DiscoveryRun,
  ExecutedExperiment,
  FalsificationOutcome,
  FreezeSeal,
  IngestedEvidence,
  OrchestratorAdapters,
  RecipeOutcome,
  StructuredExperimentRequest,
  WinnerRecordRef,
} from './contracts';

/**
 * E2E-01 ORCHESTRATOR ADAPTERS — the SECOND real domain (docs/DECISIONS.md
 * D-059, "C2 gap 1b: problem-in generality"). Same real orchestrator, same
 * generic `OrchestratorAdapters` contract `govLowerHarmAdapters.ts` (D-058)
 * already implements for a different domain — proving the pipeline is a
 * genuine engine, not a single hardcoded scenario.
 *
 * ZERO NEW SCIENCE. Every decision-making call below is an EXISTING,
 * unmodified function from `govDrugDiscoveryE2E.ts` (E2E-01, the real
 * 2671-candidate generated space, GENERATION -> TIER_1 -> TIER_2 -> TOP3 ->
 * 6-attack deep falsification -> `selectWinner`) and
 * `a3GovernmentDrugRecommendation.ts` (`runA3GovernmentRecommendation`,
 * the real population-gated candidate-view builder). This file supplies
 * ONLY the glue mapping those functions' real inputs/outputs onto
 * `OrchestratorAdapters`' generic port shapes.
 *
 * REUSES THE REAL RECIPE BUILDER DIRECTLY — no third domain-scoped recipe
 * projection is needed: `govDrugDiscoveryE2E.ts::generateResearchRecipe`
 * already exists and fits this domain's own `A3CandidateView` shape
 * exactly (unlike LOWER-HARM's `A2CandidateReport` shape, which is why
 * D-058 built `govLowerHarmRecipe.ts` as a third INSTANCE of the same
 * established per-domain pattern rather than forcing a fit here).
 *
 * TOP2 PORT, TOP3 REAL SIZE. `OrchestratorAdapters.top2()`'s signature
 * (contracts.ts) is `(cs: readonly Candidate[]): readonly Candidate[]` —
 * genuinely generic, with no length-2 constraint anywhere in the type or
 * in `orchestrator.ts`'s own stage-push logic; "TOP2" is a stage-name
 * convention, not a runtime contract. This adapter's `top2()` calls the
 * real `selectTop3` with its OWN DEFAULT size (`E2E01_TIER_CRITERIA.top3Size`,
 * i.e. 3) rather than truncating to a pair — truncating would risk
 * changing E2E-01's own real, historically-verified dynamics (the
 * `npm run e2e:gov-drug` anchor, `399221f5`/`f528c881`) for no reason;
 * calling the SAME real function with the SAME real size it already uses
 * preserves them exactly.
 *
 * OUTCOME MAPPING, DISCLOSED. `E2E01Outcome` has 5 values
 * (`WINNER`/`NO_WINNER`/`NO_SAFE_WINNER`/`INSUFFICIENT_EVIDENCE`/
 * `CONFLICTING_EVIDENCE`); the generic orchestrator `Verdict` union has 4
 * (no `NO_SAFE_WINNER`). `NO_SAFE_WINNER` (every TOP3 candidate blocked by
 * the existential safety veto) maps to the generic `NO_WINNER` — no
 * candidate is named either way — with the real, undiminished reason
 * string preserved via `compare()`/diagnostics, never silently dropped.
 */

export class E2E01FailClosedError extends Error {
  constructor(
    message: string,
    public readonly code: 'TOP3_INCOMPLETE' | 'A3_NOT_ANSWERED' | 'PORTS_CALLED_OUT_OF_ORDER',
  ) {
    super(`FAIL_CLOSED[${code}]: ${message}`);
    this.name = 'E2E01FailClosedError';
  }
}

const hash = (value: unknown): string => fnv1a(canonicalJson(value));
const FIXED_SEAL_TIME = '1970-01-01T00:00:00Z';
const TOP10_CAP = 10;

function engagedTargetsSignature(t: { readonly glp1r: number | null; readonly gipr: number | null; readonly gcgr: number | null }): string {
  const engaged = (['glp1r', 'gipr', 'gcgr'] as const).filter((k) => t[k] !== null);
  return [...engaged].sort().join('+') || '(none)';
}

export interface E2E01AdapterDiagnostics {
  generationCheck(): ReturnType<typeof checkGenerationNotPinned> | null;
  tier1(): E2E01StageResult | null;
  tier2(): E2E01StageResult | null;
  top3(): readonly E2E01Top3Entry[];
  falsifications(): readonly E2E01DeepFalsification[];
  decision(): E2E01WinnerDecision | null;
  recipe(): E2E01ResearchRecipe | null;
  runFingerprint(): string | null;
  evidenceCustody(): EvidenceCustodyResult | null;
}

export interface E2E01AdapterBundle {
  readonly adapters: OrchestratorAdapters;
  readonly diagnostics: E2E01AdapterDiagnostics;
}

export interface CreateE2E01AdaptersOptions {
  readonly generatedCandidates?: () => readonly E2E01GeneratedCandidate[];
  readonly population?: A3PopulationSpec;
  /** Already-resolved D-059 custody result for PRODUCTION runs; null for none/SYNTHETIC_TEST_ONLY. */
  readonly evidenceCustody?: EvidenceCustodyResult | null;
}

/** Builds one fresh, independently-stateful `OrchestratorAdapters` for the real E2E-01 domain. */
export function createE2E01Adapters(opts: CreateE2E01AdaptersOptions = {}): E2E01AdapterBundle {
  const population = opts.population ?? (E2E01_POPULATION as A3PopulationSpec);
  const generatedFn = opts.generatedCandidates ?? loadGeneratedCandidates;

  let generated: readonly E2E01GeneratedCandidate[] = [];
  let viewById = new Map<string, A3CandidateView>();
  let generationCheckCache: ReturnType<typeof checkGenerationNotPinned> | null = null;
  let tier1Cache: E2E01StageResult | null = null;
  let tier2Cache: E2E01StageResult | null = null;
  let top3Cache: readonly E2E01Top3Entry[] = [];
  let sealFingerprintCache: string | null = null;
  let falsificationsCache: readonly E2E01DeepFalsification[] = [];
  let runFingerprintCache: string | null = null;
  let decisionCache: E2E01WinnerDecision | null = null;
  let recipeCache: E2E01ResearchRecipe | null = null;

  function frozenCriteriaFingerprint(): string {
    return hash({
      scenarioId: E2E01_PREREGISTRATION.scenarioId,
      top3Ids: [...top3Cache.map((c) => c.moleculeChemblId)].sort(),
      attacks: E2E01_FALSIFICATION_ATTACKS,
      preregistrationFingerprint: E2E01_PREREGISTRATION.fingerprint,
    });
  }

  const adapters: OrchestratorAdapters = {
    generate(_req: StructuredExperimentRequest): readonly Candidate[] {
      generated = generatedFn();
      return generated.map((c) => ({
        candidateId: c.moleculeChemblId,
        mechanismClass: engagedTargetsSignature(c.medianPotencyNMByTarget),
        score: 0,
        riskGrade: 'UNSCREENED',
        evidenceRefs: [],
      }));
    },

    normalizeDedup(cs: readonly Candidate[]): readonly Candidate[] {
      const seen = new Set<string>();
      return cs.filter((c) => {
        if (seen.has(c.candidateId)) return false;
        seen.add(c.candidateId);
        return true;
      });
    },

    hardFilter(cs: readonly Candidate[]): readonly Candidate[] {
      generationCheckCache = checkGenerationNotPinned(generated);

      const a3 = runA3GovernmentRecommendation(population);
      if (a3.status !== 'ANSWERED') {
        throw new E2E01FailClosedError(`A3 government recommendation did not answer for the sealed population — REQUIRED_POLICY_INPUT contract changed`, 'A3_NOT_ANSWERED');
      }
      const candidateViews = a3.answerRecord.candidateViews;
      viewById = new Map(candidateViews.map((v) => [v.report.summary.moleculeChemblId, v]));

      const tier1 = runTier1(generated);
      tier1Cache = tier1;
      const tier2 = runTier2(tier1.survivorIds, generated, candidateViews);
      tier2Cache = tier2;

      return tier2.survivorIds.map((id) => {
        const view = viewById.get(id);
        const inputCandidate = cs.find((c) => c.candidateId === id);
        return {
          candidateId: id,
          mechanismClass: inputCandidate?.mechanismClass ?? '(unknown)',
          score: view?.report.score.weightedScore ?? 0,
          riskGrade: 'QUALIFIES',
          evidenceRefs: view?.report.efficacy.map((e) => `ctgov:${e.nctId}`) ?? [],
        };
      });
    },

    diversity(cs: readonly Candidate[]): readonly Candidate[] {
      return cs; // reports, never eliminates — same convention as govLowerHarmAdapters.ts's own diversity() port
    },

    rank(cs: readonly Candidate[]): readonly Candidate[] {
      return [...cs].sort((a, b) => b.score - a.score);
    },

    top10(cs: readonly Candidate[]): readonly Candidate[] {
      return cs.slice(0, TOP10_CAP);
    },

    top2(cs: readonly Candidate[]): readonly Candidate[] {
      if (tier2Cache === null) throw new E2E01FailClosedError('top2() called before hardFilter() populated Tier-2 survivors', 'PORTS_CALLED_OUT_OF_ORDER');
      const candidateViews = [...viewById.values()];
      // Real TOP3 (this domain's own established shortlist size) — see this module's header for why this is not truncated to a literal pair.
      const top3 = selectTop3(tier2Cache.survivorIds, candidateViews);
      if (top3.length < 2) {
        throw new E2E01FailClosedError(`only ${top3.length} candidate(s) reached TOP3 — no pair exists to falsify against each other.`, 'TOP3_INCOMPLETE');
      }
      top3Cache = top3;
      return top3.map((entry) => cs.find((c) => c.candidateId === entry.moleculeChemblId) ?? { candidateId: entry.moleculeChemblId, mechanismClass: '(unknown)', score: entry.weightedScore, riskGrade: 'QUALIFIES', evidenceRefs: [] });
    },

    seal(problem): FreezeSeal {
      if (top3Cache.length === 0) throw new E2E01FailClosedError('seal() called before top2() produced a real TOP3', 'PORTS_CALLED_OUT_OF_ORDER');
      const fp = frozenCriteriaFingerprint();
      sealFingerprintCache = fp;
      return {
        decisionRule: 'selectWinner (govDrugDiscoveryE2E.ts, unmodified): safety-veto exclusion, then all 6 preregistered falsification attacks, then conflicting-direction check',
        falsificationCriteria: `${E2E01_FALSIFICATION_ATTACKS.length} preregistered attacks: ${E2E01_FALSIFICATION_ATTACKS.join(', ')}`,
        evidenceMinimum: problem.evidenceMinimum,
        comparisonRule: `E2E01_PREREGISTRATION fingerprint=${E2E01_PREREGISTRATION.fingerprint}`,
        sealFingerprint: fp,
        sealedAt: FIXED_SEAL_TIME,
      };
    },

    verifySealUnchanged(seal: FreezeSeal): boolean {
      if (top3Cache.length === 0 || sealFingerprintCache === null) return false;
      const recomputed = frozenCriteriaFingerprint();
      return recomputed === seal.sealFingerprint && recomputed === sealFingerprintCache;
    },

    planExperiments(t2: readonly Candidate[]): readonly string[] {
      return t2.map((c) => `e2e01-deepfalsify::${c.candidateId}`);
    },

    execute(_plan: readonly string[]): readonly ExecutedExperiment[] {
      if (top3Cache.length === 0) throw new E2E01FailClosedError('execute() called before top2() produced a real TOP3', 'PORTS_CALLED_OUT_OF_ORDER');
      falsificationsCache = top3Cache
        .map((entry) => viewById.get(entry.moleculeChemblId))
        .filter((v): v is A3CandidateView => v !== undefined)
        .map((v) => deepFalsify(v, population));

      return top3Cache.map((entry) => {
        const view = viewById.get(entry.moleculeChemblId);
        return {
          experimentId: `e2e01-deepfalsify::${entry.moleculeChemblId}`,
          evidenceClass: view === undefined ? 'UNVERIFIED' as const : strongestEvidenceClassForEfficacy(view.report.efficacy),
          summary: { observationCount: view?.report.efficacy.length ?? 0, weightedScore: entry.weightedScore },
        };
      });
    },

    ingestEvidence(_executed: readonly ExecutedExperiment[]): readonly IngestedEvidence[] {
      const custody = opts.evidenceCustody ?? null;
      // Deliberately NOT including `custody.record.artifact.artifactId` here — see
      // the identical note in `govLowerHarmAdapters.ts::ingestEvidence()`: the
      // D-057 store mints a fresh artifactId on every ingest even when content is
      // unchanged ("re-affirmed"), so embedding it would break replay determinism
      // (mandate item 14) for two back-to-back PRODUCTION runs. The artifactId is
      // still recorded in full on the run's own `evidenceCustody.record.artifact`.
      const custodySuffix = custody === null
        ? ''
        : ` [custody: ${custody.ok ? 'FROZEN+replay-verified' : 'FAILED'} hash=${custody.record?.artifact?.hash ?? 'n/a'} hashPolicy=${custody.record?.artifact?.hashPolicy ?? 'n/a'}]`;
      return top3Cache.flatMap((entry) => {
        const view = viewById.get(entry.moleculeChemblId);
        return (view?.report.efficacy ?? []).map((e) => ({
          ref: `ctgov:${e.nctId}`,
          provenance: `ChEMBL Web Services + ClinicalTrials.gov API v2 (gov-drug-discovery-e2e generated space)${custodySuffix}`,
        }));
      });
    },

    falsify(t2: readonly Candidate[]): FalsificationOutcome {
      if (falsificationsCache.length === 0) throw new E2E01FailClosedError('falsify() called before execute() ran deep falsification', 'PORTS_CALLED_OUT_OF_ORDER');
      const byId = new Map(falsificationsCache.map((f) => [f.moleculeChemblId, f]));
      const survived = t2.map((c) => byId.get(c.candidateId)?.survivedAll ?? false);
      const unresolvedTotal = falsificationsCache.reduce((n, f) => n + f.unresolvedCounterevidence.length, 0);
      return { survived, note: `${E2E01_FALSIFICATION_ATTACKS.length} preregistered attacks per candidate; ${unresolvedTotal} unresolved counterevidence finding(s) across TOP3.` };
    },

    adjudicate(): AdjudicationOutcome {
      if (tier2Cache === null) throw new E2E01FailClosedError('adjudicate() called before hardFilter() populated Tier-2', 'PORTS_CALLED_OUT_OF_ORDER');
      const decision = selectWinner(top3Cache, falsificationsCache, tier2Cache.survivorIds.length);
      decisionCache = decision;

      runFingerprintCache = hash({
        preregistration: E2E01_PREREGISTRATION.fingerprint,
        generated: generated.length,
        tier1: tier1Cache?.survivorIds ?? [],
        tier2: tier2Cache.survivorIds,
        top3: top3Cache.map((c) => ({ id: c.moleculeChemblId, score: c.weightedScore, vetoed: c.vetoed })),
        falsifications: falsificationsCache.map((f) => ({ id: f.moleculeChemblId, survivedAll: f.survivedAll, unresolved: f.unresolvedCounterevidence.length })),
        outcome: decision.outcome,
        winnerId: decision.winnerId,
      });

      // NO_SAFE_WINNER maps to the generic NO_WINNER — see this module's header ("outcome mapping, disclosed").
      if (decision.outcome !== 'WINNER' || decision.winnerId === null) return { verdict: 'NO_WINNER' };

      const winner: WinnerRecordRef = {
        winnerId: decision.winnerId,
        verdict: 'WINNER',
        conjunctionOk: true,
        fingerprints: {
          runFingerprint: runFingerprintCache,
          preregistrationFingerprint: E2E01_PREREGISTRATION.fingerprint,
          sealFingerprint: sealFingerprintCache ?? '',
        },
      };
      return { verdict: 'WINNER', winner };
    },

    compare(): string {
      return decisionCache?.reason ?? 'no verdict computed yet';
    },

    buildRecipe(winner: WinnerRecordRef): RecipeOutcome | null {
      if (decisionCache === null || runFingerprintCache === null) return null;
      const view = viewById.get(winner.winnerId);
      const recipe = generateResearchRecipe(decisionCache, view, runFingerprintCache);
      if (recipe === null) return null;
      recipeCache = recipe;
      return { recipeFingerprint: fnv1a(canonicalJson(recipe)) };
    },

    recommendNext(run: DiscoveryRun): string {
      if (run.verdict === 'WINNER' && run.winner !== undefined) {
        return `Replicate ${run.winner.winnerId} in an independent trial population before any institutional action.`;
      }
      const leader = top3Cache[0];
      return `${decisionCache?.outcome ?? 'NO_WINNER'}: ${decisionCache?.reason ?? 'no candidate named'}. Next question: a randomized head-to-head trial of ${leader?.prefName ?? 'the leading Tier-2 survivor'} against the reference, powered for both efficacy and the preregistered adverse-event categories.`;
    },

    hash,
  };

  const diagnostics: E2E01AdapterDiagnostics = {
    generationCheck: () => generationCheckCache,
    tier1: () => tier1Cache,
    tier2: () => tier2Cache,
    top3: () => top3Cache,
    falsifications: () => falsificationsCache,
    decision: () => decisionCache,
    recipe: () => recipeCache,
    runFingerprint: () => runFingerprintCache,
    evidenceCustody: () => opts.evidenceCustody ?? null,
  };

  return { adapters, diagnostics };
}
