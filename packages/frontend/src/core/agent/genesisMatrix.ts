import type { ReplayVerdict } from '../matrixFoundation/replayVerdict';
import type { WorldEvidenceBundle } from '../worldModel/evidence/worldEvidenceBundle';
import type { DiscoveryOutcome } from './discoveryOrchestrator';
import type { HypothesisAssessment } from '../experimentFabric/scientificDiscovery';
import type { AdmissionStatus, QuestionShape } from './discoveryStrategy';
import { assessModelSufficiency, type ModelSufficiencyVerdict } from './modelSufficiency';
import type { NextAction } from './nextAction';

/**
 * GENESIS MATRIX — the cross-cutting JOIN, not a second state system.
 *
 * WHY THIS FILE EXISTS. `core/matrixFoundation/` names four determinism
 * primitives (`worldStateFingerprint`, `ruleSetFingerprint`, `replayVerdict`,
 * `headlessStepper`) — real, but not the thing the name promises elsewhere in
 * this project's planning documents: a view that actually SPANS world → time →
 * space → experiment → hypothesis → model → observation → data → Evidence →
 * Replay → agent → result → next experiment. Nothing joined those together.
 * This module is that join, and nothing more.
 *
 * WHY IT HOLDS NO STATE. Every field below is read from a type that already
 * exists and is already produced by a real run: `StrategyRun` (the orchestrator
 * adapters), `Admission` (capability standing), and optionally
 * `WorldEvidenceBundle` (evidence + its own carried `BundleReplay`). This
 * module executes nothing, stores nothing, and invents nothing — it is a pure
 * projection, so a "second parallel state system" is structurally impossible:
 * there is no state here to diverge from the one source of truth.
 *
 * WHY IT NEVER READS `StrategyRun.native`. `native` is deliberately typed
 * `unknown` so a caller cannot build a feature that secretly depends on one
 * loop's internal shape leaking through the shared contract (`discoveryStrategy.ts`'s
 * own doc). This view is built ONLY from the contract's public surface —
 * `StrategyRound`'s `why`/`what`/`reference`/`observed`/`predicted`, exactly the
 * fields the C2 live-experiment-scene brief was told to render from. A
 * consequence, stated rather than hidden: SPACE (which entity, where) is not
 * on `StrategyRound` at all, and this view reports that honestly as `null`
 * rather than reaching into `native` to fabricate it.
 *
 * WHY EVIDENCE IS OPTIONAL. Not every run a caller holds has a bundle built for
 * it yet — building one is a separate, deliberate step
 * (`buildWorldDiscoveryEvidenceBundle`, `scienceMemory.ts`). Passing `null`
 * here is an honest statement that a run has no evidence attached, never a
 * silent gap.
 */

export const GENESIS_MATRIX_CONTRACT_VERSION = '1.0.0';

/** One row: one round of one investigation, joined against its evidence. */
export interface GenesisMatrixEntry {
  // TIME — the one axis every `StrategyRound` carries, whichever loop ran it.
  readonly round: number;
  // SPACE — honestly null: no entity/location field exists on `StrategyRound`.
  // A future contract change that adds one should widen this, not this file
  // inventing a value the round never reported.
  readonly entityId: null;
  // EXPERIMENT
  readonly what: string;
  readonly why: string;
  // HYPOTHESIS + RESULT, per hypothesis this round judged (one for MECHANISM,
  // every surviving hypothesis for PARAMETER — see `StrategyRound.verdicts`'s
  // own doc for why the count differs).
  readonly verdicts: readonly {
    readonly hypothesisId: string;
    readonly assessment: HypothesisAssessment;
    readonly predicted: number | null;
  }[];
  // OBSERVATION
  readonly reference: number | null;
  readonly observed: number | null;
}

/** The whole investigation, as one joined view. */
export interface GenesisMatrixView {
  readonly contractVersion: string;
  /**
   * WORLD — `domainId` is the one world/system identifier `StrategyRun` itself
   * carries; the substrate-specific id (WorldGraph `worldId` vs Fabric
   * `systemId`) lives only in `native` and is not read here.
   *
   * Null for a REFUSED outcome, honestly: `DiscoveryRefused` carries no
   * domain or question at all — admission is checked from the caller's raw
   * request, before a `StrategyRun` (the only place either lives) exists.
   * Inventing a value here to keep the field non-nullable would be exactly
   * the fabrication this module's own doc forbids.
   */
  readonly domainId: string | null;
  readonly question: string | null;
  // MODEL — which shape, and which strategy, answered this question.
  readonly shape: QuestionShape;
  readonly strategyId: string | null;
  // AGENT — the capability standing this run actually had.
  readonly admission: AdmissionStatus;
  readonly admissionCaveat: string | null;
  readonly refusalReason: string | null;
  // EXPERIMENT — one entry per round, or empty when the question was refused.
  readonly entries: readonly GenesisMatrixEntry[];
  // RESULT
  readonly stopReason: string | null;
  readonly resultFingerprint: string | null;
  readonly limitations: readonly string[];
  readonly openQuestions: readonly string[];
  // NEXT EXPERIMENT
  readonly nextExperiment: NextAction | null;
  // EVIDENCE + REPLAY — one bundle per run, not per round, so it sits here
  // rather than being repeated on every entry.
  readonly evidence: { readonly bundleId: string; readonly replayVerdict: ReplayVerdict } | null;
  /**
   * MODEL SUFFICIENCY (P4) — did the declared search space explain the
   * observation at all? A cross-cutting read over the whole run, so it belongs
   * on the join rather than on any single round. Null for a REFUSED outcome:
   * nothing ran, so there is no space to judge.
   */
  readonly sufficiency: ModelSufficiencyVerdict | null;
}

/**
 * Builds the joined view from a real orchestrator outcome.
 *
 * `evidence`, when supplied, MUST be the bundle for THIS SAME run — this
 * function has no way to verify that and does not try to; pairing the wrong
 * bundle with a run is a caller error, the same trust boundary
 * `objectiveOverride` already places on its caller.
 */
export function buildGenesisMatrixView(
  outcome: DiscoveryOutcome,
  evidence: WorldEvidenceBundle | null = null,
): GenesisMatrixView {
  const evidenceView = evidence ? { bundleId: evidence.bundleId, replayVerdict: evidence.replay.verdict } : null;

  if (outcome.status === 'REFUSED') {
    return {
      contractVersion: GENESIS_MATRIX_CONTRACT_VERSION,
      domainId: null,
      question: null,
      shape: outcome.shape,
      strategyId: null,
      admission: outcome.admission.status,
      admissionCaveat: outcome.admission.caveat,
      refusalReason: outcome.admission.why,
      entries: [],
      stopReason: null,
      resultFingerprint: null,
      limitations: [],
      openQuestions: [],
      nextExperiment: null,
      evidence: evidenceView,
      sufficiency: null,
    };
  }

  const { run } = outcome;
  return {
    contractVersion: GENESIS_MATRIX_CONTRACT_VERSION,
    domainId: run.domainId,
    question: run.question,
    shape: outcome.shape,
    strategyId: run.strategyId,
    admission: outcome.admission.status,
    admissionCaveat: outcome.admission.caveat,
    refusalReason: null,
    entries: run.rounds.map((round) => ({
      round: round.round,
      entityId: null,
      what: round.what,
      why: round.why,
      verdicts: round.verdicts,
      reference: round.reference,
      observed: round.observed,
    })),
    stopReason: run.stopReason,
    resultFingerprint: run.resultFingerprint,
    limitations: run.limitations,
    openQuestions: run.openQuestions,
    nextExperiment: run.nextExperiment,
    evidence: evidenceView,
    sufficiency: assessModelSufficiency(run),
  };
}
