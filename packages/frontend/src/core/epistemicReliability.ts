import { EPISTEMIC_LABELS, type EpistemicStatus } from './generator/recipe';
import type { KnowledgeEpistemicStatus } from './knowledge/supplementalRegistry';
import type { BiotechEpistemicStatus } from './biotechDiscoveryContract';

/**
 * G6 — CANONICAL EPISTEMIC RELIABILITY DICTIONARY (P1).
 *
 * Builds directly on the P0.1 audit in `scienceMemory.ts`
 * (`SavedExperimentEpistemicStatus`), which found SIX pre-existing,
 * independently typed vocabularies feeding one persisted field. That audit
 * deliberately stopped at "consolidation, not a rank or a new meaning" —
 * every stored value was preserved exactly, with no attempt to compare
 * claims ACROSS vocabularies. This module is the next step: of those six,
 * THREE are genuinely the same kind of thing wearing different domain
 * vocabularies — an ordinal "how much scientific support does this claim
 * have" ranking — and are consolidated here into one canonical scale. The
 * other FOUR stay exactly as they are, deliberately untouched, because they
 * answer different questions:
 *
 *   - `HypothesisAssessment` (protocol VERDICT: did this specific falsification
 *     test pass?) — a pass/fail/inconclusive result, not a reliability level.
 *   - `SavedResearchChainManifest['terminalStatus']` (chain LIFECYCLE state) —
 *     workflow status, not a claim's evidentiary basis.
 *   - `DataProvenance` (data ORIGIN: simulated/reference/real-experimental) —
 *     confirmed load-bearing by `realExperimentE2E.test.ts`/
 *     `referenceDataE2E.test.ts`'s exact-string assertions; stays untouched.
 *   - The ad-hoc/process literal bucket (`SIMULATION`/`PREDICTION`/`OBSERVED`/
 *     `RECONSTRUCTED`/`UNKNOWN`/`QUESTION`/`OBSERVATION_RECORDED_NOT_VALIDATED`/
 *     `EXECUTED_REAL_ENGINE`/`EXECUTED_WITH_LIMITATIONS`/`MAX_SUPPORTABLE_CLAIM=…`)
 *     — execution/process states, not reliability claims about a model.
 *
 * The three that DO consolidate:
 *
 *   - `EpistemicStatus` (`generator/recipe.ts`) — already-shipped, 7-tier
 *     scientific-consensus scale, already wired to Polish `EPISTEMIC_LABELS`
 *     in `ScienceChat.tsx`. Per the P0.1 audit's own note ("whoever builds
 *     the next epistemic-status engine should check this file first — it may
 *     already be it"), this becomes the CANONICAL scale: every value already
 *     stored under this type keeps its exact meaning and tier.
 *   - `KnowledgeEpistemicStatus` (`knowledge/supplementalRegistry.ts`) — a
 *     cited claim's nature.
 *   - `BiotechEpistemicStatus` (`biotechDiscoveryContract.ts`) — a biotech
 *     record's evidentiary basis.
 *
 * HARD CONSTRAINT — ZERO BREAKING OF SAVED DATA: this module adds a pure,
 * read-time CLASSIFICATION layer. It does not rename, remap, or touch any
 * stored field, value, or type — `SavedExperiment.epistemicStatus`, the
 * `KnowledgeEpistemicStatus`/`BiotechEpistemicStatus` types themselves, and
 * every literal string already persisted to `localStorage` are all left
 * completely unchanged. `knowledgeToCanonicalReliability`/
 * `biotechToCanonicalReliability` are total, deterministic, side-effect-free
 * functions from an EXISTING typed value to the EXISTING `EpistemicStatus`
 * scale — nothing is written back.
 *
 * One value has no honest place on a reliability ladder at all:
 * `BiotechEpistemicStatus`'s `BLOCKED` is a PROCESS state ("this record's
 * evidentiary work never ran"), not a claim about evidentiary strength — the
 * exact same category error the P0.1 audit already flagged for
 * `GraphEpistemicStatus`'s process-only values. Forcing it onto the ranking
 * would silently misrepresent "we don't have a claim to rank" as "we have a
 * weak claim." `biotechToCanonicalReliability('BLOCKED')` therefore returns
 * `undefined` rather than guessing a tier.
 */
export type { EpistemicStatus as CanonicalReliabilityRank };

/**
 * Ascending order of INCREASING scientific confidence — index 0 is the
 * weakest tier, the last index the strongest. Mirrors `EPISTEMIC_LABELS`'s
 * key order in `generator/recipe.ts`; kept as a literal tuple here (rather
 * than `Object.keys(EPISTEMIC_LABELS)`) so the ORDER itself — not just
 * membership — is part of this module's own contract and shows up in a diff
 * if it ever changes.
 */
export const RELIABILITY_RANK_ORDER: readonly EpistemicStatus[] = [
  'UNSUPPORTED_CLAIM',
  'SPECULATIVE_MODEL',
  'THOUGHT_EXPERIMENT',
  'HYPOTHESIS',
  'THEORETICAL_MODEL',
  'WELL_SUPPORTED_MODEL',
  'ESTABLISHED_SCIENCE',
];

/** Numeric position in `RELIABILITY_RANK_ORDER` — higher means more reliable. Throws on a value outside the canonical scale, since that can only mean this module's own table has drifted from `EpistemicStatus`. */
export function reliabilityRankIndex(status: EpistemicStatus): number {
  const index = RELIABILITY_RANK_ORDER.indexOf(status);
  if (index === -1) throw new Error(`Unranked EpistemicStatus value: ${status}`);
  return index;
}

/**
 * Maps a `KnowledgeEpistemicStatus` (a cited claim's nature) onto the
 * canonical `EpistemicStatus` reliability scale. Total and exhaustive: a
 * missing case is a `tsc` error, not a silent `undefined`, because every
 * `KnowledgeEpistemicStatus` value genuinely describes a reliability level
 * (unlike Biotech's `BLOCKED`, see module doc).
 */
export function knowledgeToCanonicalReliability(status: KnowledgeEpistemicStatus): EpistemicStatus {
  switch (status) {
    case 'FACT': return 'ESTABLISHED_SCIENCE';
    case 'MODEL': return 'WELL_SUPPORTED_MODEL';
    case 'THEORY': return 'THEORETICAL_MODEL';
    case 'HYPOTHESIS': return 'HYPOTHESIS';
    // A scenario's own working assumption — not independently evidenced,
    // ranked with the model's own speculative tier rather than a bare guess.
    case 'SCENARIO_ASSUMPTION': return 'SPECULATIVE_MODEL';
    // Explicitly fictional source material carries no real-world scientific
    // support at all — the conservative, honest floor of the scale, not
    // `THOUGHT_EXPERIMENT` (which still frames a genuine physical question).
    case 'FICTIONAL_REFERENCE': return 'UNSUPPORTED_CLAIM';
  }
}

/**
 * Maps a `BiotechEpistemicStatus` (a biotech record's evidentiary basis)
 * onto the canonical `EpistemicStatus` reliability scale — `undefined` for
 * `BLOCKED`, which is a process state, not a reliability claim (see module
 * doc). Every other case is a genuine evidentiary-strength judgment.
 */
export function biotechToCanonicalReliability(status: BiotechEpistemicStatus): EpistemicStatus | undefined {
  switch (status) {
    case 'FACT': return 'ESTABLISHED_SCIENCE';
    // A direct, first-hand observation — strong evidence, but a single
    // biotech observation is not "established science" on its own.
    case 'OBSERVED': return 'WELL_SUPPORTED_MODEL';
    // Secondary, citation-based support — weaker than a direct observation.
    case 'LITERATURE_SUPPORTED': return 'THEORETICAL_MODEL';
    // A forecast not yet checked against evidence is exactly hypothesis-tier.
    case 'PREDICTION': return 'HYPOTHESIS';
    case 'HYPOTHESIS': return 'HYPOTHESIS';
    // An indirect, inferred claim — lower confidence than a stated hypothesis.
    case 'INFERENCE': return 'SPECULATIVE_MODEL';
    // No claim about reliability was ever made; the conservative floor,
    // consistent with `saveExperiment`'s own `?? 'UNKNOWN'` fallback treating
    // UNKNOWN as the baseline, not a mid-tier guess.
    case 'UNKNOWN': return 'UNSUPPORTED_CLAIM';
    // Process state, not a reliability claim — see module doc.
    case 'BLOCKED': return undefined;
  }
}

/** Polish display label for a canonical reliability rank — re-exports `generator/recipe.ts`'s already-shipped, already-wired dictionary rather than duplicating it. */
export function canonicalReliabilityLabel(status: EpistemicStatus): string {
  return EPISTEMIC_LABELS[status];
}
