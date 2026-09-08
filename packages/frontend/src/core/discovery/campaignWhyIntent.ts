/**
 * CAMPAIGN WHY INTENT — the NL surface onto the real, already-existing
 * explainability API for the chemistry Discovery Engine (`campaign/why.mjs`,
 * exposed at `GET /api/projects/:id/campaigns/:cid/why?kind=...`).
 *
 * `why.mjs`'s own doc states its own discipline: every answer is constructed
 * from PERSISTED campaign data (lineage, decisions, events, Scientific Runs) —
 * "zero fikcyjnego wstecznego uzasadnienia" (no fictional after-the-fact
 * justification). This module adds nothing to that reasoning; it only maps a
 * question sentence onto WHICH of the 9 real `why` kinds answers it. Reading a
 * persisted why-answer needs no RDKit at runtime, unlike candidate generation —
 * this is why this piece was built directly tonight instead of the fragment-
 * recombination work (RDKit is unavailable in this sandbox and could not be
 * verified; see the master audit and the commit message for that decision).
 *
 * Same discipline as `observationIntent.ts`/`discoveryGoalIntent.ts`:
 * deterministic regex grammar, honest `unresolved` when no kind matches — never
 * a guessed default `kind`, since guessing wrong would answer a different
 * question than the one actually asked.
 */

export type CampaignWhyKind =
  | 'candidate' | 'status' | 'pareto' | 'engine' | 'strategy'
  | 'next-experiment' | 'stop' | 'stage-selection' | 'conflict';

export type CampaignWhyUnresolved = 'KIND';

export interface CampaignWhyIntent {
  readonly rawText: string;
  readonly kind: CampaignWhyKind | null;
  /** "at generation 3" — read from the sentence when present; `null` otherwise
   * (the caller supplies the current campaign's generation when relevant,
   * exactly as it already supplies which candidate is selected — see module
   * doc for why a candidate ID is never parsed out of free text). */
  readonly generation: number | null;
  readonly unresolved: readonly CampaignWhyUnresolved[];
}

// Checked in this order: most specific phrasing first, so e.g. "why this next
// experiment" (a real, distinct `next-experiment` kind) is never swallowed by
// a more generic "why" pattern meant for `status`.
const STATUS_WHY = /\b(why (was|is) (this candidate|this|it|the candidate) (rejected|retained|kept|dropped)|why (did|does) (this|it) (fail|pass))\b/i;
const STATUS_WHY_PL = /\bdlaczego (ten kandydat|to|kandydat)?\s*(został|zostal)?\s*(odrzucon\w*|zachowan\w*)\b/i;

const PARETO_WHY = /\b(why (is|was) (this|it|the candidate) on the pareto front|is (this|it) pareto[- ]optimal|pareto[- ]dominan\w*)\b/i;
const PARETO_WHY_PL = /\bdlaczego\b.{0,20}?na froncie pareto/i;

const ENGINE_WHY = /\b(which|what) (engine|model)\b.{0,20}?(computed|calculated|ran|used|policz\w*)/i;
const ENGINE_WHY_PL = /\bktóry silnik\b|\bjaki silnik\b|\bjaki model\b/i;

const CONFLICT_WHY = /\bmodel conflict\b|\bwhy (do|did) the models disagree\b/i;
const CONFLICT_WHY_PL = /\bkonflikt modeli\b/i;

const STAGE_SELECTION_WHY = /\bwhy (was|is) (this|it) selected for (the stage|docking|screening)\b/i;

const STOP_WHY = /\bwhy (did|has|does) the campaign stop(ped)?\b|\bwhy did (it|this) stop\b/i;
const STOP_WHY_PL = /\bdlaczego (kampania )?(się |sie )?zatrzymała\b/i;

const STRATEGY_WHY = /\bwhy (did|does) the strategy change\b|\bwhy (was|is) the strategy\b/i;
const STRATEGY_WHY_PL = /\bdlaczego (strategia|zmieniono strategię|zmieniono strategie)/i;

const NEXT_EXPERIMENT_WHY = /\bwhat('s| is| should)? (genesis )?(do )?next\b|\bwhy this (next )?experiment\b|\bwhat experiment (should|will) (genesis )?run next\b/i;
const NEXT_EXPERIMENT_WHY_PL = /\bco dalej\b|\bjaki (będzie|bedzie) następny eksperyment\b|\bdlaczego ten eksperyment\b/i;

const LINEAGE_WHY = /\bwhere did (this|it) come from\b|\bwhy does (this|it) exist\b|\bwhat('s| is) (its|this candidate'?s) (origin|lineage)\b|\bhow was (this|it) (generated|created)\b/i;
const LINEAGE_WHY_PL = /\bskąd (się )?wzię\w*|\bjak (to|ten kandydat) powsta\w*/i;

const GENERATION_REF = /\bgeneration\s*(\d+)\b/i;
const GENERATION_REF_PL = /\bgenerac(?:ja|ji)\s*(\d+)\b/i;

const KIND_PATTERNS: readonly { readonly kind: CampaignWhyKind; readonly patterns: readonly RegExp[] }[] = [
  { kind: 'next-experiment', patterns: [NEXT_EXPERIMENT_WHY, NEXT_EXPERIMENT_WHY_PL] },
  { kind: 'stop', patterns: [STOP_WHY, STOP_WHY_PL] },
  { kind: 'strategy', patterns: [STRATEGY_WHY, STRATEGY_WHY_PL] },
  { kind: 'pareto', patterns: [PARETO_WHY, PARETO_WHY_PL] },
  { kind: 'conflict', patterns: [CONFLICT_WHY, CONFLICT_WHY_PL] },
  { kind: 'stage-selection', patterns: [STAGE_SELECTION_WHY] },
  { kind: 'engine', patterns: [ENGINE_WHY, ENGINE_WHY_PL] },
  { kind: 'status', patterns: [STATUS_WHY, STATUS_WHY_PL] },
  { kind: 'candidate', patterns: [LINEAGE_WHY, LINEAGE_WHY_PL] },
];

/**
 * Parses a "why" question about a chemistry-campaign candidate/decision. Pure
 * and deterministic. `kind: null` (with `unresolved` carrying `'KIND'`) when
 * no recognized phrasing matches — the caller must not guess a kind, since a
 * wrong guess answers a question that wasn't asked.
 */
export function parseCampaignWhyQuestion(sourceText: string): CampaignWhyIntent {
  const trimmed = sourceText.trim();

  let kind: CampaignWhyKind | null = null;
  for (const entry of KIND_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(trimmed))) { kind = entry.kind; break; }
  }

  const generationMatch = GENERATION_REF.exec(trimmed) ?? GENERATION_REF_PL.exec(trimmed);
  const generation = generationMatch ? Number(generationMatch[1]) : null;

  return {
    rawText: trimmed,
    kind,
    generation,
    unresolved: kind === null ? ['KIND'] : [],
  };
}
