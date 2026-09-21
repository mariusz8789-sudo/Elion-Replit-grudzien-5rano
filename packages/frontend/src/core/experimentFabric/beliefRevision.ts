import type { FalsificationCriterion, HypothesisAssessment } from './scientificDiscovery';
import { evaluateTwoArmRelation } from './falsificationRelation';

/**
 * BELIEF REVISION — the domain-agnostic primitives for a real adaptive reasoning
 * loop: graded confidence that moves with evidence, competing hypotheses that can
 * be ranked, and a real check for which candidate experiment would actually
 * separate two hypotheses. Reuses `FalsificationCriterion`/`HypothesisAssessment`/
 * `evaluateTwoArmRelation` verbatim — this module adds no new verdict vocabulary
 * and no second falsification engine.
 *
 * HONESTY BOUNDARY, stated once here rather than repeated at every function:
 * `updateConfidence` is a DETERMINISTIC, DOCUMENTED HEURISTIC (a log-odds update
 * with a fixed, disclosed weight) — not a calibrated Bayesian posterior over any
 * generative model of the world, because no such model exists in this codebase.
 * It is real, consistent, and testable, and it is exactly as principled as that
 * description and no more. `checkDiscriminability` is a real, checkable structural
 * property (do two criteria disagree on the SAME real numbers), not an
 * information-theoretic (Shannon) quantity — no probability distribution over
 * outcomes is modelled here, so no entropy/mutual-information claim is made.
 *
 * PERSISTENCE, on purpose not this module's job: every `Hypothesis` is a plain,
 * JSON-serializable structure (see the round-trip test in `beliefRevision.test.ts`),
 * so it is designed to be stored verbatim in `agent_run_steps.hypothesis_json`
 * (`packages/backend/src/agentRun.mjs`) — the real, append-only, restart-surviving
 * persistence primitive already built for the Autonomous Core. This module stays a
 * pure state-transition function; a caller (the loop driver) is what actually
 * persists a snapshot after each update, exactly like every other pure computation
 * in this codebase (TemporalEngine, worldCounterfactual, decisionSupport).
 */

export const BELIEF_REVISION_CONTRACT_VERSION = '1.0.0';

/** Which mechanical mechanism produced a hypothesis. Never omitted — a caller must
 * always be able to tell "declared by a human/preregistration" from "mechanically
 * derived from a falsified parent", and by which specific mechanism.
 *
 * `STRUCTURAL_ALTERNATIVE`: the parent's criterion and intervention are kept
 * unchanged; what changes is which registered domain solver the entity is
 * bound to before the intervention runs — a real runtime MODEL update, not a
 * re-interpretation of the evidence (see `structuralAlternative.ts`).
 *
 * `REGIME_FIT_FROM_GRID`: the hypothesis's very existence as a candidate was
 * computed from a pinned real dataset's own grid (which time/partition values
 * actually have data), not declared as a literal by a human — see
 * `core/agent/qe4RegimeInquiryLoop.ts`. Deliberately distinct from `INITIAL`:
 * `INITIAL` means "declared before any mechanical derivation ran", this means
 * "mechanically derived from the shape of the data itself, before any of it
 * has been looked at as evidence".
 *
 * `RESIDUAL_FROM_FIT`: the hypothesis was derived from the WINNING regime's own
 * residuals against real admitted points (a localized fit failure), not from a
 * new measurement — see `deriveResidualHypothesis` in the same file. */
export type HypothesisGenerationMechanism =
  | 'INITIAL'
  | 'RELATION_FLIP'
  | 'TOLERANCE_WIDENED'
  | 'STRUCTURAL_ALTERNATIVE'
  | 'REGIME_FIT_FROM_GRID'
  | 'RESIDUAL_FROM_FIT';

export interface ConfidenceUpdateRecord {
  readonly stepIndex: number;
  readonly beforeConfidence: number;
  readonly afterConfidence: number;
  readonly assessment: HypothesisAssessment;
  /** 0..1, how decisively the real data confirmed or contradicted the criterion —
   * always supplied by the caller from real measured values, never invented here. */
  readonly evidenceMagnitude: number;
  readonly reason: string;
}

export interface Hypothesis {
  readonly id: string;
  readonly criterion: FalsificationCriterion;
  /** 0..1. Starts at a caller-declared prior (this module invents no default —
   * a hypothesis with no stated prior is a hypothesis nobody has actually
   * committed to yet). */
  readonly confidence: number;
  readonly status: HypothesisAssessment | 'ACTIVE';
  readonly parentHypothesisId: string | null;
  readonly generatedBy: HypothesisGenerationMechanism;
  readonly history: readonly ConfidenceUpdateRecord[];
}

export function createHypothesis(
  id: string,
  criterion: FalsificationCriterion,
  priorConfidence: number,
  generatedBy: HypothesisGenerationMechanism = 'INITIAL',
  parentHypothesisId: string | null = null,
): Hypothesis {
  return {
    id, criterion, confidence: Math.min(0.99, Math.max(0.01, priorConfidence)),
    status: 'ACTIVE', parentHypothesisId, generatedBy, history: [],
  };
}

const CONFIDENCE_FLOOR = 0.01;
const CONFIDENCE_CEIL = 0.99;
/** Fixed, disclosed log-odds step per unit of evidence magnitude. Not fit to any
 * dataset — changing it changes how fast belief moves, not whether it moves in
 * the right direction, which is the property the tests hold it to. */
const LOG_ODDS_WEIGHT = 1.5;

function toLogOdds(p: number): number {
  const clamped = Math.min(CONFIDENCE_CEIL, Math.max(CONFIDENCE_FLOOR, p));
  return Math.log(clamped / (1 - clamped));
}
function fromLogOdds(l: number): number {
  return Math.min(CONFIDENCE_CEIL, Math.max(CONFIDENCE_FLOOR, 1 / (1 + Math.exp(-l))));
}

/**
 * Moves a hypothesis's confidence and appends one real history record — never
 * overwrites a prior record, so `hypothesis.history` is a genuine, growing
 * belief trajectory (the user's own worked example: 0.82 -> 0.61 -> 0.27),
 * not a single overwritten scalar.
 *
 * `evidenceMagnitude` (0..1) must come from the caller's real observation (e.g.
 * `evidenceMagnitudeFromAssessment` in `worldCounterfactual.ts`) — this function
 * does not compute it, only applies it, so it can never silently substitute a
 * fabricated strength for a real one.
 */
export function updateConfidence(
  hypothesis: Hypothesis,
  assessment: HypothesisAssessment,
  evidenceMagnitude: number,
  reason: string,
  stepIndex: number,
): Hypothesis {
  const before = hypothesis.confidence;
  const direction = assessment === 'SUPPORTED_WITHIN_PROTOCOL' ? 1 : assessment === 'FALSIFIED_WITHIN_PROTOCOL' ? -1 : 0;
  const magnitude = Math.min(1, Math.max(0, evidenceMagnitude));
  const after = direction === 0 ? before : fromLogOdds(toLogOdds(before) + direction * LOG_ODDS_WEIGHT * magnitude);
  const record: ConfidenceUpdateRecord = {
    stepIndex, beforeConfidence: before, afterConfidence: after, assessment, evidenceMagnitude: magnitude, reason,
  };
  return {
    ...hypothesis,
    confidence: after,
    status: assessment === 'INCONCLUSIVE' ? hypothesis.status : assessment,
    history: [...hypothesis.history, record],
  };
}

/**
 * How decisively a real measurement confirmed or contradicted a tolerance-band
 * prediction, on the 0..1 scale `updateConfidence` consumes.
 *
 * Lives here rather than in any one domain because the arithmetic is the same
 * wherever a hypothesis predicts a value and a real run produces one:
 * `worldCounterfactual.ts`'s `evidenceMagnitudeFromAssessment` delegates its
 * tolerance branch to this, so the two cannot drift into disagreeing about
 * what "decisive" means.
 *
 * Ratio near 0 (bang on the prediction) and ratio far above 1 (badly outside
 * the band) are both DECISIVE and score high; a result sitting right on the
 * tolerance edge (ratio 1) is the genuinely uninformative case and scores 0.
 * A non-positive tolerance is not a band at all, so it yields 0 rather than a
 * division by zero dressed up as certainty.
 */
export function evidenceMagnitudeWithinTolerance(observed: number, expected: number, tolerance: number): number {
  if (!(tolerance > 0) || !Number.isFinite(observed) || !Number.isFinite(expected)) return 0;
  const ratio = Math.abs(observed - expected) / tolerance;
  return Math.min(1, Math.abs(1 - ratio));
}

/** Highest confidence first. Ties keep their relative input order (stable sort). */
export function rankHypotheses(hypotheses: readonly Hypothesis[]): readonly Hypothesis[] {
  return [...hypotheses]
    .map((h, i) => ({ h, i }))
    .sort((a, b) => (b.h.confidence - a.h.confidence) || (a.i - b.i))
    .map((x) => x.h);
}

/** Still in contention: not yet decided against real data. A FALSIFIED/SUPPORTED
 * hypothesis has already been judged and does not compete on confidence alone —
 * it is a closed question, however high its confidence happened to sit before. */
export function activeHypotheses(hypotheses: readonly Hypothesis[]): readonly Hypothesis[] {
  return hypotheses.filter((h) => h.status === 'ACTIVE' || h.status === 'INCONCLUSIVE');
}

export interface DiscriminabilityCheck {
  readonly discriminates: boolean;
  readonly why: string;
}

/**
 * Would this candidate (baseline, hypothetical-intervention) pair make the two
 * hypotheses predict DIFFERENT outcomes? A real, checkable structural property:
 * `evaluateTwoArmRelation` is run for BOTH criteria against the SAME two numbers,
 * and the candidate discriminates exactly when the two `met` verdicts disagree.
 * If both criteria are decided the same way by the same numbers, no experiment
 * producing those numbers can tell the hypotheses apart, however far apart their
 * current confidences are.
 */
export function checkDiscriminability(
  h1: Hypothesis, h2: Hypothesis, baseline: number, candidateIntervention: number,
): DiscriminabilityCheck {
  const o1 = evaluateTwoArmRelation(h1.criterion, baseline, candidateIntervention);
  const o2 = evaluateTwoArmRelation(h2.criterion, baseline, candidateIntervention);
  if (!o1.applicable || !o2.applicable) {
    return { discriminates: false, why: "At least one hypothesis's criterion is not decidable from a two-arm comparison at this candidate value." };
  }
  if (o1.met !== o2.met) {
    return {
      discriminates: true,
      why: `At intervention=${candidateIntervention}: "${h1.criterion.rationale}" would be ${o1.met ? 'SUPPORTED' : 'FALSIFIED'}, `
        + `while "${h2.criterion.rationale}" would be ${o2.met ? 'SUPPORTED' : 'FALSIFIED'} — this candidate separates the two hypotheses.`,
    };
  }
  return {
    discriminates: false,
    why: `At intervention=${candidateIntervention}, both hypotheses are ${o1.met ? 'SUPPORTED' : 'FALSIFIED'} — this candidate cannot tell them apart.`,
  };
}

/**
 * Scans `candidateInterventions` IN ORDER and returns the FIRST one that
 * discriminates h1 from h2, or `null` when none of the offered candidates do —
 * an honest refusal rather than picking a non-discriminating candidate anyway.
 * This does not search a continuous intervention space or invent candidate
 * values: the caller (the domain-specific experiment driver, which alone knows
 * what magnitudes are physically meaningful) supplies the list.
 */
export function selectMostDiscriminatingExperiment(
  h1: Hypothesis, h2: Hypothesis, baseline: number, candidateInterventions: readonly number[],
): { readonly intervention: number; readonly check: DiscriminabilityCheck } | null {
  for (const candidate of candidateInterventions) {
    const check = checkDiscriminability(h1, h2, baseline, candidate);
    if (check.discriminates) return { intervention: candidate, check };
  }
  return null;
}

/**
 * The audit-facing shape from the Reasoning Core priority: every field is real
 * data already computed elsewhere, assembled here — not a chain-of-thought log,
 * an AUDITABLE RECORD of what was observed, believed, and decided at one step.
 */
export interface ReasoningTraceEntry {
  readonly stepIndex: number;
  readonly observation: string;
  readonly interpretation: string;
  readonly hypotheses: readonly { readonly id: string; readonly confidence: number; readonly status: Hypothesis['status'] }[];
  readonly evidenceFor: readonly string[];
  readonly evidenceAgainst: readonly string[];
  readonly confidenceUpdates: readonly ConfidenceUpdateRecord[];
  readonly chosenAction: string;
  readonly whyThisAction: string;
  readonly result: string | null;
  readonly nextBeliefState: readonly { readonly id: string; readonly confidence: number; readonly status: Hypothesis['status'] }[];
}
