/**
 * NATURAL LANGUAGE → STRUCTURED SCIENTIFIC REQUEST.
 *
 * A person writes a scientific problem in prose. Genesis must extract what it
 * can NAME EXPLICITLY and mark everything else UNKNOWN — never infer a target,
 * mechanism or constraint that the text does not actually contain.
 *
 * THIS IS A LEXICON MATCH, NOT AN LLM CALL, AND THAT IS DELIBERATE.
 *
 * A rule-based extractor is auditable: every field in the output can be traced
 * to the literal substring that produced it. A model call could not offer that
 * guarantee without its own evidence trail, and building a second unaudited
 * inference layer on top of a discovery engine whose entire point is refusing
 * unaudited inference would defeat the engine's purpose. The lexicon is small
 * on purpose and is expected to grow by adding entries, not by replacing the
 * approach.
 *
 * AMBIGUITY IS REPRESENTED, NEVER RESOLVED SILENTLY: if the text matches two
 * targets, both are kept and `ambiguous: true` is set rather than picking one.
 */
export const NATURAL_LANGUAGE_SCIENTIFIC_REQUEST_VERSION = '1.0.0';

export type ExtractedFieldStatus = 'FOUND' | 'UNKNOWN' | 'AMBIGUOUS';

export interface ExtractedField<T> {
  status: ExtractedFieldStatus;
  values: readonly T[];
  /** The literal substring(s) of the input that produced this field. Empty when UNKNOWN. */
  matchedText: readonly string[];
}

function unknown<T>(): ExtractedField<T> {
  return { status: 'UNKNOWN', values: [], matchedText: [] };
}

function found<T>(values: readonly T[], matchedText: readonly string[]): ExtractedField<T> {
  return { status: values.length > 1 ? 'AMBIGUOUS' : 'FOUND', values, matchedText };
}

export interface StructuredScientificRequest {
  requestId: string;
  rawText: string;
  goal: ExtractedField<'DISCOVER_CANDIDATE' | 'COMPARE_COMPOUNDS' | 'EXPLAIN_MECHANISM' | 'DESIGN_ANALOGUE'>;
  effect: ExtractedField<string>;
  domain: ExtractedField<'PHARMACOLOGY' | 'BIOCHEMISTRY' | 'PHYSICS' | 'ENVIRONMENT' | 'EPIDEMIOLOGY'>;
  targets: ExtractedField<string>;
  mechanisms: ExtractedField<string>;
  referenceCompounds: ExtractedField<string>;
  /** Constraints named as requirements, e.g. "natural", "reduce toxicity". Free text, not yet a Requirement object. */
  constraintPhrases: ExtractedField<string>;
  evidenceRequirement: ExtractedField<'REQUIRE_MEASURED' | 'ACCEPT_PREDICTED' | 'REQUIRE_HUMAN_DATA'>;
  /** Every field that came back UNKNOWN, named, so a caller can ask a follow-up rather than guess. */
  unresolvedFields: readonly string[];
}

interface LexiconEntry<T> {
  value: T;
  /** Case-insensitive literal phrases that trigger this value. */
  phrases: readonly string[];
}

const GOAL_LEXICON: readonly LexiconEntry<StructuredScientificRequest['goal']['values'][number]>[] = [
  { value: 'DISCOVER_CANDIDATE', phrases: ['find a compound', 'find candidates', 'find a candidate', 'identify a natural', 'which naturally occurring', 'which compound', 'discover'] },
  { value: 'COMPARE_COMPOUNDS', phrases: ['compare', 'versus', ' vs ', 'how does'] },
  { value: 'EXPLAIN_MECHANISM', phrases: ['why does', 'explain the mechanism', 'how does it work', 'mechanism of'] },
  { value: 'DESIGN_ANALOGUE', phrases: ['design an analogue', 'analogues of', 'design a candidate that'] },
];

const DOMAIN_LEXICON: readonly LexiconEntry<StructuredScientificRequest['domain']['values'][number]>[] = [
  { value: 'PHARMACOLOGY', phrases: ['receptor', 'drug', 'compound', 'pharmacolog', 'ligand'] },
  { value: 'BIOCHEMISTRY', phrases: ['enzyme', 'metabolite', 'protein', 'biochemi'] },
  { value: 'PHYSICS', phrases: ['particle', 'quantum', 'thermodynam', 'physics'] },
  { value: 'ENVIRONMENT', phrases: ['water quality', 'contaminant', 'environmental', 'pollutant'] },
  { value: 'EPIDEMIOLOGY', phrases: ['epidemic', 'infection rate', 'cohort study', 'incidence of'] },
];

/** Named biological targets Genesis's evidence layer already recognises. */
const TARGET_LEXICON: readonly LexiconEntry<string>[] = [
  { value: 'NMDAR', phrases: ['nmda', 'n-methyl-d-aspartate'] },
  { value: 'VMAT2', phrases: ['vmat2', 'vesicular monoamine transporter'] },
  { value: 'DAT', phrases: ['dopamine transporter', ' dat '] },
  { value: 'SERT', phrases: ['serotonin transporter', ' sert '] },
  { value: 'MOR', phrases: ['mu opioid', 'mor receptor', 'mu-opioid'] },
  { value: 'GABA-A', phrases: ['gaba-a', 'gaba receptor'] },
];

const MECHANISM_LEXICON: readonly LexiconEntry<string>[] = [
  { value: 'open-channel blocker', phrases: ['channel blocker', 'open-channel block'] },
  { value: 'competitive antagonist', phrases: ['competitive antagonist'] },
  { value: 'agonist', phrases: [' agonist', 'agonism'] },
  { value: 'reuptake inhibitor', phrases: ['reuptake inhibit', 'uptake inhibit'] },
  { value: 'allosteric modulator', phrases: ['allosteric'] },
];

/** Reference compounds already present in Genesis's evidence layer. Extending this list is how the lexicon grows. */
const COMPOUND_LEXICON: readonly LexiconEntry<string>[] = [
  { value: 'ketamine', phrases: ['ketamine'] },
  { value: 'mephedrone', phrases: ['mephedrone', '4-mmc', '4 mmc'] },
  { value: 'morphine', phrases: ['morphine'] },
  { value: 'diazepam', phrases: ['diazepam'] },
  { value: 'agmatine', phrases: ['agmatine'] },
];

const EVIDENCE_REQUIREMENT_LEXICON: readonly LexiconEntry<StructuredScientificRequest['evidenceRequirement']['values'][number]>[] = [
  { value: 'REQUIRE_MEASURED', phrases: ['measured evidence only', 'only measured', 'real assay', 'directly measured'] },
  { value: 'REQUIRE_HUMAN_DATA', phrases: ['in humans', 'human data', 'human trial'] },
  { value: 'ACCEPT_PREDICTED', phrases: ['prediction is fine', 'model prediction is acceptable', 'estimate is fine'] },
];

const CONSTRAINT_PHRASE_PATTERNS: readonly string[] = [
  'naturally occurring', 'natural product', 'reduce toxicity', 'reduce liability', 'lower mutagenicity',
  'cns penetrant', 'blood-brain barrier', 'orally available', 'without invented', 'no clinical equivalence',
];

function extractLexicon<T>(text: string, lexicon: readonly LexiconEntry<T>[]): ExtractedField<T> {
  const values: T[] = [];
  const matched: string[] = [];
  const lower = text.toLowerCase();
  for (const entry of lexicon) {
    const hit = entry.phrases.find((p) => lower.includes(p.toLowerCase()));
    if (hit !== undefined) {
      values.push(entry.value);
      matched.push(hit);
    }
  }
  return values.length === 0 ? unknown<T>() : found(values, matched);
}

function extractConstraintPhrases(text: string): ExtractedField<string> {
  const lower = text.toLowerCase();
  const matched = CONSTRAINT_PHRASE_PATTERNS.filter((p) => lower.includes(p));
  return matched.length === 0 ? unknown<string>() : found(matched, matched);
}

/**
 * Extracts the "effect" as a short noun phrase around a recognised verb of
 * intent ("reduce X", "increase X", "block X"). Anything not matching this
 * shape is UNKNOWN — Genesis does not attempt free-form phrase extraction.
 */
function extractEffectPhrase(text: string): ExtractedField<string> {
  const match = text.match(/\b(reduce|increase|block|inhibit|enhance|antagonise|antagonize)\s+([a-zA-Z0-9\- ]{3,40}?)(?:[.,;]|$)/i);
  if (match === null) return unknown<string>();
  return found([`${match[1]!.toLowerCase()} ${match[2]!.trim()}`], [match[0]]);
}

export function parseNaturalLanguageScientificRequest(rawText: string, requestId: string): StructuredScientificRequest {
  const goal = extractLexicon(rawText, GOAL_LEXICON);
  const domain = extractLexicon(rawText, DOMAIN_LEXICON);
  const targets = extractLexicon(rawText, TARGET_LEXICON);
  const mechanisms = extractLexicon(rawText, MECHANISM_LEXICON);
  const referenceCompounds = extractLexicon(rawText, COMPOUND_LEXICON);
  const evidenceRequirement = extractLexicon(rawText, EVIDENCE_REQUIREMENT_LEXICON);
  const constraintPhrases = extractConstraintPhrases(rawText);
  const effect = extractEffectPhrase(rawText);

  const fields: Record<string, ExtractedField<unknown>> = {
    goal, effect, domain, targets, mechanisms, referenceCompounds, constraintPhrases, evidenceRequirement,
  };
  const unresolvedFields = Object.entries(fields).filter(([, f]) => f.status === 'UNKNOWN').map(([name]) => name);

  return {
    requestId,
    rawText,
    goal,
    effect,
    domain,
    targets,
    mechanisms,
    referenceCompounds,
    constraintPhrases,
    evidenceRequirement,
    unresolvedFields,
  };
}

/** True only when the request names enough to be actionable without guessing anything. */
export function isActionableRequest(request: StructuredScientificRequest): boolean {
  return request.goal.status !== 'UNKNOWN'
    && (request.targets.status !== 'UNKNOWN' || request.referenceCompounds.status !== 'UNKNOWN');
}

export function describeStructuredRequest(request: StructuredScientificRequest): string {
  const parts = [
    `goal=${request.goal.status === 'UNKNOWN' ? 'UNKNOWN' : request.goal.values.join('|')}`,
    `domain=${request.domain.status === 'UNKNOWN' ? 'UNKNOWN' : request.domain.values.join('|')}`,
    `targets=${request.targets.status === 'UNKNOWN' ? 'UNKNOWN' : request.targets.values.join('|')}`,
    `mechanisms=${request.mechanisms.status === 'UNKNOWN' ? 'UNKNOWN' : request.mechanisms.values.join('|')}`,
    `references=${request.referenceCompounds.status === 'UNKNOWN' ? 'UNKNOWN' : request.referenceCompounds.values.join('|')}`,
  ];
  const suffix = request.unresolvedFields.length > 0 ? ` | UNRESOLVED: ${request.unresolvedFields.join(', ')}` : '';
  return parts.join(' ') + suffix;
}
