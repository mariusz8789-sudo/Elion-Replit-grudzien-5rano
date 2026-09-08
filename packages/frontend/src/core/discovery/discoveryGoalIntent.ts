/**
 * DISCOVERY GOAL INTENT — the NL front door onto the real, already-working
 * chemistry Discovery Engine (`packages/backend/src/campaign/*`).
 *
 * A repo audit found that engine fully connected end-to-end — generate, score,
 * reject, Pareto-rank, decide-next, iterate, explain, all real, all wired into
 * `CampaignScreen.tsx`/`DrugDiscoveryScreen.tsx` — but reachable only by filling
 * in a UI form. There was no path from a sentence like "find me a candidate with
 * logP around 2, molecular weight under 400, starting from CCO" to a running
 * campaign. This module is exactly that translation, and nothing else: it does
 * not generate molecules, does not score them, does not rank them — every one of
 * those steps already exists and is untouched by this file.
 *
 * Same discipline as `observationIntent.ts`: deterministic regex grammar (not a
 * model call), and an honest `unresolved` list rather than a guessed default. A
 * sentence naming no starting molecule cannot become a campaign — this module
 * refuses rather than inventing a molecule, because open-ended generative
 * chemistry (proposing a genuinely novel scaffold from nothing) does not exist
 * anywhere in this codebase; see the master audit for that finding. A sentence
 * naming a starting molecule but no target property still produces a valid
 * request — the backend's own DEFAULT_OBJECTIVES/DEFAULT_CONSTRAINTS apply,
 * exactly as they already do for a campaign built by hand through the UI.
 */

export type DiscoveryGoalUnresolved = 'STARTING_MOLECULE';

export interface DiscoveryGoalIntent {
  readonly rawText: string;
  /** SMILES tokens found via an explicit marker phrase ("starting from X", "SMILES X") —
   * never a bare heuristic guess at what looks like a molecule. */
  readonly startingSmiles: readonly string[];
  readonly targetLogP: number | null;
  readonly targetMolWt: number | null;
  readonly minLogP: number | null;
  readonly maxLogP: number | null;
  readonly maxMolWt: number | null;
  readonly maxGenerations: number | null;
  readonly unresolved: readonly DiscoveryGoalUnresolved[];
}

export interface DiscoveryCampaignObjective {
  readonly id: string;
  readonly targetProperty: string;
  readonly target: number;
  readonly scale?: number;
}

export interface DiscoveryCampaignConstraint {
  readonly id: string;
  readonly property: string;
  readonly op: 'lte' | 'gte';
  readonly value: number;
}

export interface DiscoveryCampaignRequest {
  readonly objective: string;
  readonly domain: 'DRUG_DISCOVERY';
  readonly startingSmiles: string[];
  readonly objectives?: DiscoveryCampaignObjective[];
  readonly constraints?: DiscoveryCampaignConstraint[];
  readonly budget?: { maxGenerations?: number };
}

// Explicit markers only — a bare token that merely LOOKS like it could be a
// SMILES string is not accepted as one; false positives here would silently
// start a real campaign against a molecule nobody actually named.
const STARTING_SMILES = /\b(?:starting from|based on|smiles)[:\s]+([A-Za-z0-9@+\-[\]()=#/\\%.]{2,120})/gi;
const STARTING_SMILES_PL = /\b(?:zaczynając od|zaczynajac od|na podstawie|smiles)[:\s]+([A-Za-z0-9@+\-[\]()=#/\\%.]{2,120})/gi;

const TARGET_LOGP = /\blog\s*p\b\s*(?:of|around|near|approximately|target(?:ing)?|≈|~)\s*(-?\d+(?:\.\d+)?)/i;
const TARGET_LOGP_PL = /\blog\s*p\b.{0,15}?(?:około|okolo|na poziomie|celu)\s*(-?\d+(?:\.\d+)?)/i;

const TARGET_MOLWT = /\b(?:molecular weight|mw)\b\s*(?:of|around|near|approximately|target(?:ing)?|≈|~)\s*(\d+(?:\.\d+)?)/i;
const TARGET_MOLWT_PL = /\b(?:masa cząsteczkowa|masa czasteczkowa|mw)\b.{0,15}?(?:około|okolo|na poziomie)\s*(\d+(?:\.\d+)?)/i;

const LOGP_BETWEEN = /\blog\s*p\b\s*(?:between|pomiędzy|pomiedzy)\s*(-?\d+(?:\.\d+)?)\s*(?:and|i|-)\s*(-?\d+(?:\.\d+)?)/i;
const LOGP_MIN = /\blog\s*p\b\s*(?:above|over|greater than|powyżej|powyzej|>)\s*(-?\d+(?:\.\d+)?)/i;
const LOGP_MAX = /\blog\s*p\b\s*(?:below|under|less than|poniżej|ponizej|<)\s*(-?\d+(?:\.\d+)?)/i;

const MOLWT_MAX = /\b(?:molecular weight|mw)\b\s*(?:under|below|less than|poniżej|ponizej|mniej niż|mniej niz|<)\s*(\d+(?:\.\d+)?)/i;

const MAX_GENERATIONS = /\b(?:up to|max(?:imum)?)\s*(\d+)\s*generations?\b|\b(?:do|maksymalnie)\s*(\d+)\s*generacji\b/i;

function extractStartingSmiles(text: string): string[] {
  const found: string[] = [];
  for (const pattern of [STARTING_SMILES, STARTING_SMILES_PL]) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      // Strip a sentence-final period: a trailing "." with nothing after it is not a
      // meaningful SMILES disconnected-fragment separator, just end-of-sentence punctuation.
      const token = match[1]!.trim().replace(/\.+$/, '');
      if (token && !found.includes(token)) found.push(token);
    }
  }
  return found;
}

/**
 * Parses a discovery-goal sentence. Pure and deterministic — same input, same
 * output, always. Returns SOMETHING even for a sentence naming no starting
 * molecule; the caller (`buildCampaignRequest`) decides whether that's a valid
 * outcome, exactly like `observationIntent.ts`'s own split between parsing and
 * execution.
 */
export function parseDiscoveryGoal(sourceText: string): DiscoveryGoalIntent {
  const trimmed = sourceText.trim();

  const startingSmiles = extractStartingSmiles(trimmed);

  const targetLogPMatch = TARGET_LOGP.exec(trimmed) ?? TARGET_LOGP_PL.exec(trimmed);
  const targetLogP = targetLogPMatch ? Number(targetLogPMatch[1]) : null;

  const targetMolWtMatch = TARGET_MOLWT.exec(trimmed) ?? TARGET_MOLWT_PL.exec(trimmed);
  const targetMolWt = targetMolWtMatch ? Number(targetMolWtMatch[1]) : null;

  const between = LOGP_BETWEEN.exec(trimmed);
  let minLogP: number | null = null;
  let maxLogP: number | null = null;
  if (between) {
    const a = Number(between[1]);
    const b = Number(between[2]);
    minLogP = Math.min(a, b);
    maxLogP = Math.max(a, b);
  } else {
    const minMatch = LOGP_MIN.exec(trimmed);
    if (minMatch) minLogP = Number(minMatch[1]);
    const maxMatch = LOGP_MAX.exec(trimmed);
    if (maxMatch) maxLogP = Number(maxMatch[1]);
  }

  const maxMolWtMatch = MOLWT_MAX.exec(trimmed);
  const maxMolWt = maxMolWtMatch ? Number(maxMolWtMatch[1]) : null;

  const generationsMatch = MAX_GENERATIONS.exec(trimmed);
  const maxGenerations = generationsMatch ? Number(generationsMatch[1] ?? generationsMatch[2]) : null;

  const unresolved: DiscoveryGoalUnresolved[] = [];
  if (startingSmiles.length === 0) unresolved.push('STARTING_MOLECULE');

  return {
    rawText: trimmed,
    startingSmiles,
    targetLogP,
    targetMolWt,
    minLogP,
    maxLogP,
    maxMolWt,
    maxGenerations,
    unresolved,
  };
}

/**
 * Builds the real campaign-creation request body from a parsed intent, or an
 * honest refusal reason when the intent cannot become a real campaign. Never
 * fabricates a starting molecule or a target value the sentence didn't name —
 * an objective/constraint the sentence didn't mention is simply OMITTED, so the
 * backend's own `DEFAULT_OBJECTIVES`/`DEFAULT_CONSTRAINTS` apply (identical to
 * a campaign built by hand through the existing UI, never a silently different
 * default invented here).
 */
export function buildCampaignRequest(intent: DiscoveryGoalIntent): DiscoveryCampaignRequest | { readonly error: string } {
  if (intent.unresolved.includes('STARTING_MOLECULE')) {
    return {
      error: 'Genesis needs at least one real starting molecule (e.g. "starting from CCO") to run a discovery '
        + 'campaign — it does not yet generate a candidate scaffold from nothing.',
    };
  }

  const objectives: DiscoveryCampaignObjective[] = [];
  if (intent.targetLogP !== null) objectives.push({ id: 'logp-distance', targetProperty: 'crippenLogP', target: intent.targetLogP, scale: 1 });
  if (intent.targetMolWt !== null) objectives.push({ id: 'mw-distance', targetProperty: 'molWt', target: intent.targetMolWt, scale: 100 });

  const constraints: DiscoveryCampaignConstraint[] = [];
  if (intent.maxMolWt !== null) constraints.push({ id: 'mw-max', property: 'molWt', op: 'lte', value: intent.maxMolWt });
  if (intent.minLogP !== null) constraints.push({ id: 'logp-range-lo', property: 'crippenLogP', op: 'gte', value: intent.minLogP });
  if (intent.maxLogP !== null) constraints.push({ id: 'logp-range-hi', property: 'crippenLogP', op: 'lte', value: intent.maxLogP });

  return {
    objective: intent.rawText,
    domain: 'DRUG_DISCOVERY',
    startingSmiles: intent.startingSmiles.slice(),
    ...(objectives.length > 0 ? { objectives } : {}),
    ...(constraints.length > 0 ? { constraints } : {}),
    ...(intent.maxGenerations !== null ? { budget: { maxGenerations: intent.maxGenerations } } : {}),
  };
}
