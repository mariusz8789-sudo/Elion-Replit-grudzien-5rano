import { fnv1a, canonicalJson } from '../events/hash';
import { createHypothesis, type Hypothesis, type HypothesisGenerationMechanism } from '../experimentFabric/beliefRevision';
import type { FalsificationCriterion } from '../experimentFabric/scientificDiscovery';
import type { CandidateDirection } from './directionFinder';

/**
 * PHASE F, Krok 6 — NOVEL HYPOTHESIS GENERATOR.
 *
 * Takes a `CandidateDirection` (E1, `directionFinder.ts`, already grounded
 * in a real campaign's own facts — REUSED, never re-derived) and produces
 * a `NovelHypothesis`: OBSERVATION -> ANOMALY -> EXPLANATORY GAP ->
 * HYPOTHESIS -> MODEL -> PREDICTION, per the mandate's own chain.
 *
 * `hypothesis` is a REAL `beliefRevision.ts::Hypothesis`, produced by
 * `createHypothesis` UNCHANGED — no second hypothesis representation, no
 * second confidence-update mechanism. This module adds exactly what
 * `beliefRevision.ts` does not carry: a declared mechanism, at least one
 * adversarial competing explanation, and a stated falsifier — mandatory,
 * not optional, because a hypothesis with no way to be wrong and no rival
 * considered is not a scientific hypothesis, it is an assertion.
 *
 * The output status ceiling is `NOVEL_HYPOTHESIS`
 * (`discoveryContracts.ts::DiscoveryStatus`) — this module NEVER produces
 * anything stronger. Promotion to `DISCOVERY_CANDIDATE`/`DISCOVERY` only
 * happens through `discoveryContracts.ts::classifyDiscoveryStatus`, after
 * novelty (Krok 1/4), replication (Krok 3) and self-falsification (Krok 5)
 * — none of which this module touches.
 *
 * `llmAssisted` is a required, disclosed boolean field, never implicit —
 * this generator's OWN logic is deterministic (it assembles a record from
 * caller-supplied text), but a caller that used an LLM to DRAFT the
 * mechanism/competing-explanations/falsifier text must say so.
 */

export const NOVEL_HYPOTHESIS_GENERATOR_CONTRACT_VERSION = '1.0.0';

export interface CompetingExplanation {
  readonly statement: string;
  readonly rationale: string;
}

export interface NovelHypothesis {
  readonly hypothesisId: string;
  readonly parentDirectionId: string;
  readonly parentDirectionFingerprint: string;
  readonly hypothesis: Hypothesis;
  readonly mechanism: string;
  /** At least one required — an adversarial rival explanation for the same observation. */
  readonly competingExplanations: readonly CompetingExplanation[];
  /** What observation would refute this hypothesis — required, never empty. */
  readonly falsifier: string;
  readonly requiredExperiment: string;
  readonly llmAssisted: boolean;
  readonly fingerprint: string;
}

export class NovelHypothesisViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NovelHypothesisViolationError';
  }
}

export interface GenerateNovelHypothesisInput {
  readonly direction: CandidateDirection;
  readonly hypothesisId: string;
  readonly criterion: FalsificationCriterion;
  readonly priorConfidence: number;
  readonly generatedBy?: HypothesisGenerationMechanism;
  readonly mechanism: string;
  readonly competingExplanations: readonly CompetingExplanation[];
  readonly falsifier: string;
  readonly requiredExperiment: string;
  readonly llmAssisted: boolean;
}

/**
 * Refuses to construct a hypothesis missing what makes it scientific: a
 * stated mechanism, at least one competing explanation, a falsifier, and a
 * required experiment. Called INSIDE `generateNovelHypothesis` — there is
 * no path to a `NovelHypothesis` that skips this.
 */
export function assertHypothesisWellFormed(input: Pick<GenerateNovelHypothesisInput, 'mechanism' | 'competingExplanations' | 'falsifier' | 'requiredExperiment'>): void {
  if (input.mechanism.trim().length === 0) {
    throw new NovelHypothesisViolationError('novelHypothesisGenerator: mechanism is required and must be non-empty — a hypothesis with no stated mechanism is not explanatory.');
  }
  if (input.competingExplanations.length === 0) {
    throw new NovelHypothesisViolationError('novelHypothesisGenerator: at least one competing explanation is required — a hypothesis considered against no rival is not yet a real hypothesis, only a preference.');
  }
  if (input.falsifier.trim().length === 0) {
    throw new NovelHypothesisViolationError('novelHypothesisGenerator: falsifier is required and must be non-empty — what observation would refute this?');
  }
  if (input.requiredExperiment.trim().length === 0) {
    throw new NovelHypothesisViolationError('novelHypothesisGenerator: requiredExperiment is required and must be non-empty.');
  }
}

export function generateNovelHypothesis(input: GenerateNovelHypothesisInput): NovelHypothesis {
  assertHypothesisWellFormed(input);

  const hypothesis = createHypothesis(input.hypothesisId, input.criterion, input.priorConfidence, input.generatedBy ?? 'INITIAL');

  const identity = {
    parentDirectionFingerprint: input.direction.fingerprint,
    hypothesisId: input.hypothesisId,
    criterion: input.criterion,
    mechanism: input.mechanism,
    competingExplanations: input.competingExplanations,
    falsifier: input.falsifier,
    requiredExperiment: input.requiredExperiment,
    llmAssisted: input.llmAssisted,
  };

  return {
    hypothesisId: input.hypothesisId,
    parentDirectionId: input.direction.id,
    parentDirectionFingerprint: input.direction.fingerprint,
    hypothesis,
    mechanism: input.mechanism,
    competingExplanations: input.competingExplanations,
    falsifier: input.falsifier,
    requiredExperiment: input.requiredExperiment,
    llmAssisted: input.llmAssisted,
    fingerprint: fnv1a(canonicalJson(identity)),
  };
}
