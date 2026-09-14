import { canonicalJson, fnv1a } from '../events/hash';
import type { EvidenceClass } from '../agent/evidenceProvenance';
import {
  runA2Analysis,
  loadCandidateSummaries,
  type A2CandidateReport,
  type A2CandidateSummary,
  type A2ComparisonType,
} from '../biotechData/a2OzempicSubstitute';
import { rankForLowerHarm, type LowerHarmCandidateResult } from '../biotechData/govDrugLowerHarmRanking';
import {
  checkDiversity,
  freezeFalsificationCriteria,
  runG2Falsification,
  runAdjudication,
  decideFunnelVerdict,
  LOWER_HARM_TOP10_CAP,
  LOWER_HARM_TOP2_CAP,
  type DiversityReport,
  type FrozenFalsificationCriteria,
  type Top2Result,
  type AdjudicatedCandidate,
  type LowerHarmFunnelVerdict,
} from '../biotechData/govDrugLowerHarmFunnel';
import type { GenerateDifferentiatingExperimentResult } from '../agent/differentiatingExperimentGenerator';
import { LOWER_HARM_PREREGISTRATION, LOWER_HARM_SCENARIO_ID } from '../biotechData/govDrugLowerHarmPreregistration';
import { buildLowerHarmRecipe, type LowerHarmResearchRecipe } from '../biotechData/govLowerHarmRecipe';
import { SYNTHETIC_WINNER_SUMMARIES, SYNTHETIC_WINNER_REPORTS } from './syntheticWinnerFixture';
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
 * LOWER-HARM ORCHESTRATOR ADAPTERS (docs/DECISIONS.md D-058, "Winner
 * Promotion Gate E2E completion").
 *
 * THIS FILE CONTAINS ZERO NEW SCIENCE. Every decision-making call below is
 * an EXISTING, unmodified function: `runA2Analysis` (candidate generation +
 * real evidence extraction), `rankForLowerHarm` (ranking + hard filter +
 * safety veto + efficacy floor), `checkDiversity` (mechanism diversity
 * report), `freezeFalsificationCriteria`/`runG2Falsification` (G2
 * differentiating-experiment falsification), `runAdjudication`/
 * `decideFunnelVerdict` (the real safety/governance gate + WINNER/NO_WINNER
 * conjunction), `buildLowerHarmRecipe` (the domain-scoped recipe
 * projection, D-058). This file supplies ONLY the glue that maps those
 * functions' own real inputs/outputs onto `OrchestratorAdapters`' generic
 * port shapes — the exact same role `toyAdapters.ts` (D-055, synthetic) and
 * this file (real) both play against the identical `OrchestratorAdapters`
 * contract. The D-057 Winner Promotion Gate that already sits inside
 * `orchestrator.ts` between adjudication and `buildRecipe` is untouched and
 * applies here exactly as it does to any other adapter.
 *
 * TWO REAL DATASETS, ONE REAL PIPELINE. `createLowerHarmAdapters` takes a
 * candidate-report PROVIDER rather than hardcoding `runA2Analysis()` so the
 * identical decision logic can run over:
 *   - the real pinned ChEMBL/ClinicalTrials.gov data (`PRODUCTION`) — see
 *     `createProductionLowerHarmAdapters()` below, whose honest result is
 *     the real NO_WINNER this scenario has produced since D-050;
 *   - a small, explicitly `SYNTHETIC_TEST_ONLY`-labelled fixture engineered
 *     to legitimately clear every real conjunct (see `syntheticWinnerFixture.ts`)
 *     — the positive WINNER->WinnerRecord->Recipe E2E demonstration the
 *     mandate requires, with the winner genuinely emerging from this same
 *     unmodified pipeline rather than being constructed by hand.
 * Neither dataset is a second engine; both are inputs to the same one.
 *
 * SCOPE, DISCLOSED. `generate()` always returns the SAME fixed candidate
 * space regardless of the `StructuredExperimentRequest` it receives — this
 * mirrors `runA2Analysis()`'s own existing signature (it takes no
 * arguments; it is not a live generative search over an arbitrary NL
 * problem). This adapter is scenario-bound to the LOWER-HARM GLP-1
 * substitute investigation, not a general-purpose candidate generator for
 * any problem statement — genuinely parametrizing generation from free text
 * would itself be "building a new generation engine", which this pass does
 * not do.
 */

export class LowerHarmFailClosedError extends Error {
  constructor(
    message: string,
    public readonly code: 'TOP2_INCOMPLETE' | 'NO_CANDIDATE_REPORTS' | 'PORTS_CALLED_OUT_OF_ORDER',
  ) {
    super(`FAIL_CLOSED[${code}]: ${message}`);
    this.name = 'LowerHarmFailClosedError';
  }
}

const hash = (value: unknown): string => fnv1a(canonicalJson(value));

/** Deterministic, never wall-clock — two runs over identical input must produce an identical seal (D-040 clock-rule precedent, same convention `toyAdapters.ts` already uses). */
const FIXED_SEAL_TIME = '1970-01-01T00:00:00Z';

/** Sorted, non-null engaged-target signature — the same structural projection `checkDiversity`'s own (unexported) `mechanismSignature` computes on a report, applied here to the pre-evidence `A2CandidateSummary` so `generate()` can label a real mechanism class before any trial data is consulted. */
function engagedTargetsSignature(summary: A2CandidateSummary): string {
  const t = summary.medianPotencyNMByTarget;
  const engaged = (['glp1r', 'gipr', 'gcgr'] as const).filter((k) => t[k] !== null);
  return [...engaged].sort().join('+') || '(none)';
}

/** Audit-layer classification only (mirrors `a2AdjudicationReferenceImplementation.ts`'s own "decision-inert" evidenceProvenance annotation, D-047): maps A2's own comparison-type vocabulary onto the shared `EvidenceClass` union for the orchestrator's evidence inventory. Never fed back into `falsifyCandidate`/`scoreCandidate`. */
function evidenceClassOf(comparisonType: A2ComparisonType): EvidenceClass {
  if (comparisonType === 'DIRECT_HEAD_TO_HEAD') return 'DIRECT_RANDOMISED';
  if (comparisonType === 'NAIVE_INDIRECT') return 'INDIRECT_RANDOMISED';
  return 'UNVERIFIED';
}

/** The strongest evidence class among a candidate's own efficacy entries. */
function strongestEvidenceClassFor(report: A2CandidateReport): EvidenceClass {
  const RANK: Readonly<Record<EvidenceClass, number>> = {
    DIRECT_RANDOMISED: 10, INDIRECT_RANDOMISED: 9, POOLED_META: 8, NETWORK_META: 7, OBSERVATIONAL: 6,
    REGULATORY_LABEL: 5, POST_MARKETING: 4, MECHANISTIC: 3, COMPUTATIONAL: 2, UNVERIFIED: 1,
  };
  let best: EvidenceClass = 'UNVERIFIED';
  for (const e of report.efficacy) {
    const cls = evidenceClassOf(e.comparisonType);
    if (RANK[cls] > RANK[best]) best = cls;
  }
  return best;
}

function toGeneratedCandidate(summary: A2CandidateSummary): Candidate {
  return {
    candidateId: summary.moleculeChemblId,
    mechanismClass: engagedTargetsSignature(summary),
    score: 0,
    riskGrade: 'UNSCREENED',
    evidenceRefs: [],
  };
}

function toQualifyingCandidate(r: LowerHarmCandidateResult): Candidate {
  return {
    candidateId: r.report.summary.moleculeChemblId,
    mechanismClass: engagedTargetsSignature(r.report.summary),
    score: r.lowerHarmScore ?? 0,
    riskGrade: 'QUALIFIES',
    evidenceRefs: r.report.efficacy.map((e) => `ctgov:${e.nctId}`),
  };
}

export interface LowerHarmAdapterDiagnostics {
  eliminatedDetail(): readonly { readonly candidateId: string; readonly reason: string }[];
  diversity(): DiversityReport | null;
  g2Result(): GenerateDifferentiatingExperimentResult | null;
  verdict(): LowerHarmFunnelVerdict | null;
  adjudicated(): readonly AdjudicatedCandidate[];
  recipe(): LowerHarmResearchRecipe | null;
  runFingerprint(): string | null;
}

export interface LowerHarmAdapterBundle {
  readonly adapters: OrchestratorAdapters;
  readonly diagnostics: LowerHarmAdapterDiagnostics;
}

export interface CreateLowerHarmAdaptersOptions {
  /** The full mechanism-derived candidate space for `generate()`'s own audit-visible output. */
  readonly allCandidateSummaries: () => readonly A2CandidateSummary[];
  /** The evidence-augmented reports `hardFilter()` onward actually ranks/falsifies/adjudicates. */
  readonly candidateReports: () => readonly A2CandidateReport[];
}

/**
 * Builds one fresh, independently-stateful `OrchestratorAdapters` (plus a
 * read-only diagnostics side-channel for UI/audit/tests — never consulted
 * by `orchestrator.ts` itself, so it can carry richer real detail than the
 * generic port contract allows without widening that contract). A fresh
 * instance must be created per run: state (`top2State`, `g2Cache`, ...) is
 * scoped to one `runScientificDiscovery` call.
 */
export function createLowerHarmAdapters(opts: CreateLowerHarmAdaptersOptions): LowerHarmAdapterBundle {
  const reportById = new Map<string, A2CandidateReport>();
  const lowerHarmById = new Map<string, LowerHarmCandidateResult>();
  let eliminatedDetail: { candidateId: string; reason: string }[] = [];
  let diversityReport: DiversityReport | null = null;
  let top2State: Top2Result | null = null;
  let frozenCriteria: FrozenFalsificationCriteria | null = null;
  let g2Cache: GenerateDifferentiatingExperimentResult | null = null;
  let runFingerprintCache: string | null = null;
  let adjudicatedCache: readonly AdjudicatedCandidate[] = [];
  let verdictCache: LowerHarmFunnelVerdict | null = null;
  let recipeCache: LowerHarmResearchRecipe | null = null;

  const adapters: OrchestratorAdapters = {
    generate(_req: StructuredExperimentRequest): readonly Candidate[] {
      return opts.allCandidateSummaries().map(toGeneratedCandidate);
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
      const reports = opts.candidateReports();
      reportById.clear();
      for (const r of reports) reportById.set(r.summary.moleculeChemblId, r);

      const ranked = rankForLowerHarm(reports);
      lowerHarmById.clear();
      for (const r of ranked) lowerHarmById.set(r.report.summary.moleculeChemblId, r);

      const noEvidence = cs.filter((c) => !reportById.has(c.candidateId)).map((c) => ({
        candidateId: c.candidateId,
        reason: 'INSUFFICIENT_EVIDENCE: no usable trial data in this run — excluded before ranking.',
      }));
      const rankEliminated = ranked.filter((r) => r.lowerHarmScore === null).map((r) => ({
        candidateId: r.report.summary.moleculeChemblId,
        reason: r.eliminationReason ?? 'eliminated',
      }));
      eliminatedDetail = [...noEvidence, ...rankEliminated];

      return ranked.filter((r) => r.lowerHarmScore !== null).map(toQualifyingCandidate);
    },

    diversity(cs: readonly Candidate[]): readonly Candidate[] {
      const results = cs.map((c) => lowerHarmById.get(c.candidateId)).filter((r): r is LowerHarmCandidateResult => r !== undefined);
      diversityReport = checkDiversity(results);
      return cs; // reports, never eliminates — same convention as govDrugLowerHarmFunnel.ts's own checkDiversity call site
    },

    rank(cs: readonly Candidate[]): readonly Candidate[] {
      // Already in `rankForLowerHarm`'s own descending order from hardFilter() — no second ranking system.
      return cs;
    },

    top10(cs: readonly Candidate[]): readonly Candidate[] {
      return cs.slice(0, LOWER_HARM_TOP10_CAP);
    },

    top2(cs: readonly Candidate[]): readonly Candidate[] {
      const candidates = cs.slice(0, LOWER_HARM_TOP2_CAP).map((c) => lowerHarmById.get(c.candidateId)).filter((r): r is LowerHarmCandidateResult => r !== undefined);
      const excluded = cs.slice(LOWER_HARM_TOP2_CAP).map((c) => ({ candidateId: c.candidateId, reason: `Ranked outside the top ${LOWER_HARM_TOP2_CAP}.` }));
      if (candidates.length < 2) {
        throw new LowerHarmFailClosedError(
          `only ${candidates.length} candidate(s) reached TOP2 — no pair exists to falsify. This function's WINNER/NO_WINNER contract requires a real pair and refuses to guess one (same fail-closed refusal as runLowerHarmFunnel()).`,
          'TOP2_INCOMPLETE',
        );
      }
      top2State = { candidates, excluded };
      return cs.slice(0, LOWER_HARM_TOP2_CAP);
    },

    seal(problem): FreezeSeal {
      if (top2State === null) throw new LowerHarmFailClosedError('seal() called before top2() produced a real pair', 'PORTS_CALLED_OUT_OF_ORDER');
      const criteria = freezeFalsificationCriteria(top2State);
      frozenCriteria = criteria;
      return {
        decisionRule: 'G2_SEPARATES_TOP2 AND AGREES_WITH_PRE_EXPERIMENT_RANK AND FAVOURED_CANDIDATE_PASSES_SAFETY_GATE (govDrugLowerHarmFunnel.ts::decideFunnelVerdict, unmodified)',
        falsificationCriteria: `G2_DIFFERENTIATING_EXPERIMENT, discriminabilityThreshold=${criteria.discriminabilityThreshold}sigma, safetyGateMethod=PRACTICAL_CANDIDATE_GATE`,
        evidenceMinimum: problem.evidenceMinimum,
        comparisonRule: `LOWER_HARM_PREREGISTRATION safety-dominant ranking, fingerprint=${LOWER_HARM_PREREGISTRATION.fingerprint}`,
        sealFingerprint: criteria.fingerprint,
        sealedAt: FIXED_SEAL_TIME,
      };
    },

    verifySealUnchanged(seal: FreezeSeal): boolean {
      if (top2State === null || frozenCriteria === null) return false;
      const recomputed = freezeFalsificationCriteria(top2State);
      return recomputed.fingerprint === seal.sealFingerprint && recomputed.fingerprint === frozenCriteria.fingerprint;
    },

    planExperiments(t2: readonly Candidate[]): readonly string[] {
      return t2.map((c) => `lower-harm-g2::${c.candidateId}`);
    },

    execute(_plan: readonly string[]): readonly ExecutedExperiment[] {
      if (top2State === null) throw new LowerHarmFailClosedError('execute() called before top2() produced a real pair', 'PORTS_CALLED_OUT_OF_ORDER');
      g2Cache = runG2Falsification(top2State);
      runFingerprintCache = hash({
        scenarioId: LOWER_HARM_SCENARIO_ID,
        preregistrationFingerprint: LOWER_HARM_PREREGISTRATION.fingerprint,
        candidateReportIds: top2State.candidates.map((c) => c.report.summary.moleculeChemblId).sort(),
        falsificationCriteriaFingerprint: frozenCriteria?.fingerprint ?? null,
        g2Result: g2Cache,
      });
      return top2State.candidates.map((c) => ({
        experimentId: `lower-harm-g2::${c.report.summary.moleculeChemblId}`,
        evidenceClass: strongestEvidenceClassFor(c.report),
        summary: { observationCount: c.report.efficacy.length, lowerHarmScore: c.lowerHarmScore ?? 0 },
      }));
    },

    ingestEvidence(_executed: readonly ExecutedExperiment[]): readonly IngestedEvidence[] {
      if (top2State === null) return [];
      return top2State.candidates.flatMap((c) => c.report.efficacy.map((e) => ({
        ref: `ctgov:${e.nctId}`,
        provenance: 'ChEMBL Web Services + ClinicalTrials.gov API v2 (a2-ozempic-substitute pinned dataset)',
      })));
    },

    falsify(t2: readonly Candidate[]): FalsificationOutcome {
      const g2 = g2Cache;
      if (g2 === null) throw new LowerHarmFailClosedError('falsify() called before execute() ran G2', 'PORTS_CALLED_OUT_OF_ORDER');
      const note = g2.outcome === 'EXPERIMENT_SELECTED'
        ? `G2 differentiating experiment on "${g2.spec.observableId}": falsificationPower=${(g2.spec.falsificationPower * 100).toFixed(0)}%, ${g2.spec.unresolvedPairs.length} unresolved pair(s) (tau=1sigma).`
        : `NO_DISCRIMINATING_EXPERIMENT_AVAILABLE: ${g2.reason}`;
      // G2 assesses discriminability; it does not itself eliminate a candidate — elimination is
      // the ADJUDICATION stage's job (decideFunnelVerdict), matching govDrugLowerHarmFunnel.ts's own separation.
      return { survived: t2.map(() => true), note };
    },

    adjudicate(): AdjudicationOutcome {
      if (top2State === null || g2Cache === null || runFingerprintCache === null) {
        throw new LowerHarmFailClosedError('adjudicate() called before execute() populated top2State/g2Cache/runFingerprint', 'PORTS_CALLED_OUT_OF_ORDER');
      }
      const adjudicated = runAdjudication(top2State, g2Cache, runFingerprintCache);
      adjudicatedCache = adjudicated;
      const verdict = decideFunnelVerdict(top2State, g2Cache, adjudicated);
      verdictCache = verdict;

      if (verdict.label === 'NO_WINNER' || verdict.winnerId === null) return { verdict: 'NO_WINNER' };

      const winner: WinnerRecordRef = {
        winnerId: verdict.winnerId,
        verdict: 'WINNER',
        conjunctionOk: verdict.conjuncts.every((c) => c.held),
        fingerprints: {
          runFingerprint: runFingerprintCache,
          preregistrationFingerprint: LOWER_HARM_PREREGISTRATION.fingerprint,
          falsificationCriteriaFingerprint: frozenCriteria?.fingerprint ?? '',
        },
      };
      return { verdict: 'WINNER', winner };
    },

    compare(): string {
      return verdictCache?.reason ?? 'no verdict computed yet';
    },

    buildRecipe(winner: WinnerRecordRef): RecipeOutcome | null {
      if (!winner.conjunctionOk) return null;
      const report = reportById.get(winner.winnerId);
      if (report === undefined) return null;
      const recipe = buildLowerHarmRecipe(report, runFingerprintCache ?? winner.fingerprints.runFingerprint ?? '');
      if (recipe === null) return null;
      recipeCache = recipe;
      return { recipeFingerprint: recipe.recipeFingerprint };
    },

    recommendNext(run: DiscoveryRun): string {
      if (run.verdict === 'WINNER' && run.winner !== undefined) {
        return `Replicate ${run.winner.winnerId} in an independent trial population before any institutional action — a single funnel pass is not independent confirmation.`;
      }
      const failed = verdictCache?.conjuncts.filter((c) => !c.held).map((c) => c.criterion).join(', ') ?? 'unknown';
      return `NO_WINNER: unresolved conjunct(s) [${failed}]. Next question: acquire additional direct-comparison evidence for the TOP2 pair, or accept the null finding as this run's real result.`;
    },

    hash,
  };

  const diagnostics: LowerHarmAdapterDiagnostics = {
    eliminatedDetail: () => eliminatedDetail,
    diversity: () => diversityReport,
    g2Result: () => g2Cache,
    verdict: () => verdictCache,
    adjudicated: () => adjudicatedCache,
    recipe: () => recipeCache,
    runFingerprint: () => runFingerprintCache,
  };

  return { adapters, diagnostics };
}

/** The real, pinned-data adapters — see this module's header for why its honest result is NO_WINNER. */
export function createProductionLowerHarmAdapters(): LowerHarmAdapterBundle {
  return createLowerHarmAdapters({
    allCandidateSummaries: loadCandidateSummaries,
    candidateReports: () => runA2Analysis().candidateReports,
  });
}

/**
 * The `SYNTHETIC_TEST_ONLY` positive-path adapters (see `syntheticWinnerFixture.ts`
 * for exactly what is and is not synthetic here). Same real pipeline, same
 * real decision functions — only the input evidence differs from
 * `createProductionLowerHarmAdapters()`.
 */
export function createSyntheticWinnerLowerHarmAdapters(): LowerHarmAdapterBundle {
  return createLowerHarmAdapters({
    allCandidateSummaries: () => SYNTHETIC_WINNER_SUMMARIES,
    candidateReports: () => SYNTHETIC_WINNER_REPORTS,
  });
}
