import { fnv1a } from '../events/hash';
import type { TemporalUnit, ViewpointKind } from './scenarioRequest';

/**
 * LOOKING GLASS — OBSERVATION INTELLIGENCE.
 *
 * `scenarioRequest.ts` answers "what world should exist" — once, when a
 * session opens. This answers a different, recurring question: once a
 * world exists, what does the user want to look at RIGHT NOW? "Show me the
 * hospital after the pump failure" names no scenario, no span, no safety
 * class — it names a TARGET, a TIME relative to something that already
 * happened, and nothing else. Building a second `StructuredScenarioRequest`
 * around it would force every follow-up question through a grammar built
 * for opening a world, not looking around inside one.
 *
 * Same discipline as that file: deterministic regex grammar (not a model
 * call — the same sentence must resolve identically every time, and a
 * follow-up's `intentId` is a hash of it, exactly like `requestId`), and an
 * honest `unresolved` list rather than a guessed default. This module
 * reads INTENT only. Whether "the hospital" or "the pump failure" refers to
 * anything real is `observationDirector.ts`'s question, not this one's —
 * the same split `scenarioResolution.ts` already draws for the opening
 * sentence.
 */

export type ObservationMode =
  | 'SCIENTIST' | 'ENGINEER' | 'CITIZEN' | 'SYSTEM' | 'INCIDENT' | 'CAUSE_EFFECT' | 'BEFORE_AFTER';

/**
 * A time reference relative to what the user SAID, not yet resolved against
 * a real clock. `unit: null` on a RELATIVE intent means "one step in
 * whatever unit this world actually advances in" — the director, which
 * knows the world, decides that; this parser does not guess a domain's
 * units from a bare "go back".
 */
export type ObservationTimeIntent =
  | { readonly kind: 'NOW' }
  | { readonly kind: 'ABSOLUTE'; readonly amount: number; readonly unit: TemporalUnit }
  | { readonly kind: 'RELATIVE'; readonly direction: 'FORWARD' | 'BACKWARD'; readonly amount: number; readonly unit: TemporalUnit | null }
  | { readonly kind: 'BEFORE_EVENT'; readonly eventRef: string }
  | { readonly kind: 'AFTER_EVENT'; readonly eventRef: string };

export type UnresolvedObservationAspect = 'TARGET' | 'TIME' | 'EVENT';

export interface ObservationIntent {
  /** Deterministic: the same sentence always produces the same id. */
  readonly intentId: string;
  readonly rawText: string;
  /** The entity named in the sentence, in the user's own words — resolved against real entities by the director, never normalised here. */
  readonly target: string | null;
  readonly location: string | null;
  readonly time: ObservationTimeIntent | null;
  readonly perspective: ViewpointKind | null;
  /** What to visually center on, when distinct from `target` (e.g. "follow the hospital, focus on the entrance"). Defaults to `target` when unset. */
  readonly focus: string | null;
  readonly mode: ObservationMode | null;
  readonly comparison: boolean;
  /** An event named or implied by the sentence ("the pump failure", "the incident"). */
  readonly event: string | null;
  readonly scale: 'WIDE' | 'MACRO' | 'NORMAL' | null;
  /** "Why did this change happen?" — routes to the cause/effect explainer regardless of target. */
  readonly askingWhy: boolean;
  /** "What changed?" / "Co się zmieniło?" — routes to the delta/explanation flow for the CURRENT
   * target. Distinct from `askingWhy`: this asks for a DIFF, not a CAUSE. */
  readonly askingWhatChanged: boolean;
  /**
   * An imperative command to actually change the world ("turn off the pump", "wyłącz pompę") OR a
   * "what happens if X fails" hypothetical asking for that same intervention's outcome ("co się
   * stanie, jeśli pompa padnie?") — both name a real action the director must EXECUTE (through C3)
   * before anything else in the Scientific Control Loop can answer the question. Distinct from
   * `comparison`, which only means "show me a side-by-side view" and never by itself authorizes a
   * world change.
   */
  readonly interventionRequested: boolean;
  /** "Go back to how it was" / "return to baseline" — leaves any branch and resumes the primary run. */
  readonly returningToBaseline: boolean;
  /**
   * Names a whole SCENARIO to establish, not a follow-up observation on an already-running world —
   * "Pokaż mi miasto podczas ekstremalnego deszczu" / "Show me the city during extreme rainfall".
   * Currently only the one flagship scenario is recognised (Scientific Director mission); `null`
   * for every other sentence, including ordinary target/time/mode requests inside an open world.
   */
  readonly scenarioRequest: 'EXTREME_RAINFALL' | null;
  /** "What's happening?" / "Co się dzieje?" — asks for a grounded status summary of the CURRENT
   * world, distinct from `askingWhy` (a cause question) and `askingWhatChanged` (a diff question). */
  readonly askingWhatIsHappening: boolean;
  /** "What are the assumptions/limits?" / "Jakie są ograniczenia?" — asks for the scenario's own
   * real, event-sourced grounding notes (see `describeScenarioLimitations()`), never a canned
   * disclaimer. Distinct from `askingWhatIsHappening`: a status question, not a grounding question. */
  readonly askingForLimitations: boolean;
  /**
   * Names the ONE counterfactual this mission's flagship scenario explicitly asks about. As of
   * C3 Phase 5, rainfall intensity IS a real parameterized input (rational-method runoff feeding
   * Darcy-Weisbach — see `genesisScientificCity3.ts`'s own module doc), so this is detected so a
   * caller can run the REAL counterfactual rather than either ignoring the question or routing it
   * into an unrelated intervention and calling that "the same thing".
   */
  readonly rainfallCounterfactualQuery: boolean;
  /** The percentage magnitude named in a `rainfallCounterfactualQuery` sentence ("30% lower" -> 30,
   * "30% higher" -> 30 — magnitude only, direction is `rainfallCounterfactualDirection`), or `null`
   * when the query matched but no number could be read out (caller decides the default). */
  readonly rainfallCounterfactualPercent: number | null;
  /** Which way a `rainfallCounterfactualQuery` asked to move rainfall intensity. `null` only when
   * `rainfallCounterfactualQuery` is false — never left for a caller to guess at. */
  readonly rainfallCounterfactualDirection: 'LOWER' | 'HIGHER' | null;
  /** Everything this parser could not read out of the sentence. A caller must not fill these in with a default. */
  readonly unresolved: readonly UnresolvedObservationAspect[];
}

// Words after which a captured target phrase must stop, because they open a
// clause about something OTHER than the entity's name — a time reference,
// a mode, or a perspective. Without this, "follow the substance in cause
// and effect view" would capture "substance in cause and effect view" as
// one (unmatchable) entity name instead of "substance".
const TARGET_STOP = 'after|before|at|from|over|while|during|as|in\\s+(?:the\\s+)?(?:cause|system|incident|citizen|scientist|engineer|operator)|po\\b|przed\\b|w\\s+chwili|podczas|jako';
const TARGET_TRIGGERS = new RegExp(`\\b(show me|show|go to|take me to|focus on|zoom into|zoom in on|zoom on|look at|follow|pokaż|pokaz|idź do|skup się na|przybliż|śledź|sledz)\\s+(?:the\\s+|a\\s+|an\\s+)?([a-ząćęłńóśźż][a-ząćęłńóśźż0-9\\s-]{1,40}?)(?=\\s+(?:${TARGET_STOP})\\b|[.?!,;]|$)`, 'i');
const FOLLOW_TRIGGER = new RegExp(`\\b(follow|śledź|sledz|track)\\s+(?:the\\s+)?([a-ząćęłńóśźż][a-ząćęłńóśźż0-9\\s-]{1,40}?)(?=\\s+(?:${TARGET_STOP})\\b|[.?!,;]|$)`, 'i');

// Generic nouns that name a QUESTION, not an entity — resolving them against
// the world's real entities would either fail loudly (fine) or, worse,
// coincidentally match something irrelevant. Excluded from target detection
// so "show me the consequence" moves time without inventing a search for an
// entity literally named "consequence".
const GENERIC_TARGET_WORDS = /^(consequence|result|outcome|effect|change|difference|thing|world|scene|view|konsekwencj|wynik|efekt|zmian|różnic|roznic)/i;

const BEFORE_EVENT = /\b(before|prior to|przed)\s+(?:the\s+)?([a-ząćęłńóśźż][a-ząćęłńóśźż0-9\s-]{1,40}?)(?=[.?!,;]|$)/i;
const AFTER_EVENT = /\b(after|following|po)\s+(?:the\s+)?([a-ząćęłńóśźż][a-ząćęłńóśźż0-9\s-]{1,40}?)(?=[.?!,;]|$)/i;
// "N hours later/back" — amount then direction word.
const RELATIVE_TIME = /(\d+)\s*(hours?|godzin|godz|days?|dni|dzień|dzien|years?|lat|lata)\s*(later|earlier|forward|back|później|pozniej|wcześniej|wczesniej|do przodu|do tyłu|do tylu)/i;
// "go back N hours" / "go forward N hours" — direction word then amount.
const RELATIVE_TIME_LED = /\b(go back|cofnij(?:\s+o)?|wróć(?:\s+o)?|wroc(?:\s+o)?|go forward|advance(?:\s+by)?|przejdź(?:\s+o)?|przejdz(?:\s+o)?)\s+(\d+)\s*(hours?|godzin|godz|days?|dni|dzień|dzien|years?|lat|lata)/i;
// "the next N hours" / "następne N godzin" — always forward; "next" never means "go back".
const NEXT_N = /\b(?:the\s+)?next\s+(\d+)\s*(hours?|days?|years?)|\b(?:kolejne|następne|nastepne)\s+(\d+)\s*(godziny|godzin|godz|dni|dzień|dzien|lata|lat)/i;
const GO_BACK = /\b(go back|cofnij|wróć|wroc)\b(?!\s+to\s+(?:the\s+)?baseline)/i;
const GO_FORWARD = /\b(go forward|advance|przejdź dalej|przejdz dalej)\b/i;
const BACKWARD_LEAD = /^(go back|cofnij|wróć|wroc)/i;

const UNIT_WORD: Readonly<Record<string, TemporalUnit>> = {
  hour: 'HOUR', hours: 'HOUR', godzin: 'HOUR', godz: 'HOUR', godziny: 'HOUR',
  day: 'DAY', days: 'DAY', dni: 'DAY', dzień: 'DAY', dzien: 'DAY',
  year: 'YEAR', years: 'YEAR', lat: 'YEAR', lata: 'YEAR',
};

const WHY_QUESTION = /\b(why (did|does|is|has)|dlaczego)\b/i;
const WHAT_CHANGED_QUESTION = /\b(what changed|what('s| is| has) different|co się zmieniło|co sie zmienilo|co się zmienia|co sie zmienia)\b/i;
const WHAT_IS_HAPPENING_QUESTION = /\b(what'?s happening|what is happening|what is going on|what's going on|co się dzieje|co sie dzieje)\b/i;
// "Assumptions & limits" — Genesis Urban Resilience Engine success criterion 8. Answered from
// `describeScenarioLimitations()`'s real event provenance, not a canned disclaimer, so this is
// matched as its own question rather than folded into WHAT_IS_HAPPENING_QUESTION.
const LIMITATIONS_QUESTION = /\b(what (are|were) the (assumptions|limits|limitations)|show (me )?(the )?(assumptions|limits|limitations)|jakie (są|sa) (założenia|zalozenia|ograniczenia)|pokaż (założenia|zalozenia|ograniczenia)|pokaz (założenia|zalozenia|ograniczenia))\b/i;

// Scenario-opening requests — a whole world/situation to establish, not a follow-up observation.
// Only one flagship scenario is recognised today (Scientific Director mission's own scope rule).
const EXTREME_RAINFALL_SCENARIO = /\b(during|in)\s+(?:the\s+)?extreme rainfall\b|extreme rainfall scenario|podczas\s+ekstremalnego\s+deszczu|ekstremaln\w*\s+deszcz\w*/i;

// The ONE counterfactual this mission's flagship explicitly asks about. Real as of C3 Phase 5
// (rainfall intensity genuinely drives the hydraulics load — see genesisScientificCity3.ts's own
// module doc). Matched independently of COMPARISON_TRIGGER/WHAT_IF_FAILURE below so a caller can
// run the real counterfactual instead of falling into a generic "compare" or an unrelated real
// intervention. Two direction-specific regexes (not one with an alternation over both directions)
// so the caller can tell which way the sentence asked without a second parse — see
// `rainfallCounterfactualDirection` below.
const RAINFALL_INTENSITY_LOWER_QUERY = new RegExp(
  '\\b(rainfall|rain)\\b.{0,40}?\\d{1,3}\\s?%.{0,20}?\\b(lower|less|reduced|weaker)\\b'
  + '|\\d{1,3}\\s?%.{0,20}?\\b(lower|less|reduced|weaker)\\b.{0,40}?\\b(rainfall|rain)\\b'
  + '|\\bdeszcz\\w*\\b.{0,40}?\\d{1,3}\\s?%.{0,20}?\\b(mniejszy|mniej|słabszy|slabszy|niższ\\w*|nizsz\\w*)\\b',
  'i',
);
const RAINFALL_INTENSITY_HIGHER_QUERY = new RegExp(
  '\\b(rainfall|rain)\\b.{0,40}?\\d{1,3}\\s?%.{0,20}?\\b(higher|more|increased|stronger)\\b'
  + '|\\d{1,3}\\s?%.{0,20}?\\b(higher|more|increased|stronger)\\b.{0,40}?\\b(rainfall|rain)\\b'
  + '|\\bdeszcz\\w*\\b.{0,40}?\\d{1,3}\\s?%.{0,20}?\\b(większ\\w*|wieksz\\w*|silniejsz\\w*|wyższ\\w*|wyzsz\\w*)\\b',
  'i',
);
const RETURN_BASELINE = /\b(return to (the\s+)?baseline|back to (the\s+)?baseline|reset|wróć do (bazy|stanu wyjściowego)|wroc do (bazy|stanu wyjsciowego))\b/i;
const COMPARISON_TRIGGER = /\b(compare|what if|what would happen if|porówn|porown|co (by było|by bylo|jeśli|jesli) gdyby|co jeśli|co jesli)\b/i;

// Imperative command: "turn off/shut down/disable/stop/fail the PUMP" / "wyłącz/zatrzymaj/zablokuj
// pompę" — this actually authorizes a world change, unlike a bare observation request.
const INTERVENTION_COMMAND = new RegExp(
  `\\b(?:turn off|shut down|disable|stop|kill|fail)\\s+(?:the\\s+)?([a-z][a-z0-9\\s-]{1,40}?)(?=[.?!,;]|$)`
  + `|\\b(?:wyłącz|wylacz|zatrzymaj|zablokuj)\\s+(?:the\\s+)?([a-ząćęłńóśźż][a-ząćęłńóśźż0-9\\s-]{1,40}?)(?=[.?!,;]|$)`,
  'i',
);
// Hypothetical: "what happens/will happen/would happen if the PUMP fails/stops working" /
// "co się stanie/będzie, jeśli POMPA padnie/przestanie działać/się zepsuje" — names both the
// intervention AND its own target, so the director never has to guess which entity to fail.
// NOTE: no trailing `\b` on the Polish alternation — JS regex `\b` is ASCII-`\w`-only, so it
// silently fails to match right after a diacritic-ending word like "działać" (ends in "ć", not a
// `\w` character) when followed by punctuation or end-of-string. Found live by this file's own
// tests: "...przestanie działać?" never matched with a trailing `\b` in place.
const WHAT_IF_FAILURE = new RegExp(
  `\\bwhat (?:happens|will happen|would happen) if\\s+(?:the\\s+)?([a-z][a-z0-9\\s-]{1,40}?)\\s+(?:fails|stops working|breaks down|goes down)\\b`
  + `|\\bco (?:się|sie) (?:stanie|dzieje)\\b,?\\s*(?:jeśli|jesli|gdy)\\s+(?:the\\s+)?([a-ząćęłńóśźż][a-ząćęłńóśźż0-9\\s-]{1,40}?)\\s+(?:padnie|przestanie działać|przestanie dzialac|się zepsuje|sie zepsuje|ulegnie awarii)`,
  'i',
);

const MODE_WORDS: readonly { readonly pattern: RegExp; readonly mode: ObservationMode }[] = [
  { pattern: /\b(as a scientist|scientist view|jako naukow)\w*/i, mode: 'SCIENTIST' },
  { pattern: /\b(as an engineer|engineer view|as an operator|operator view|jako inżynier|jako inzynier|jako operator)\w*/i, mode: 'ENGINEER' },
  { pattern: /\b(as a citizen|as a resident|citizen view|jako mieszkan|jako obywatel)\w*/i, mode: 'CITIZEN' },
  { pattern: /\b(system view|overview|whole system|cały system|caly system)\w*/i, mode: 'SYSTEM' },
  { pattern: /\b(incident view|the incident|incydent)\w*/i, mode: 'INCIDENT' },
  { pattern: /\b(cause and effect|cause\/effect|przyczyn.{0,3}skutk)\w*/i, mode: 'CAUSE_EFFECT' },
  { pattern: /\b(before and after|before\/after|przed i po)\w*/i, mode: 'BEFORE_AFTER' },
];

const PERSPECTIVE_WORDS: readonly { readonly pattern: RegExp; readonly kind: ViewpointKind }[] = [
  { pattern: /\b(scientist|naukow)\w*/i, kind: 'SCIENTIST_POV' },
  { pattern: /\b(operator|engineer|inżynier|inzynier)\w*/i, kind: 'OPERATOR_POV' },
  { pattern: /\b(citizen|resident|mieszkan)\w*/i, kind: 'ANCHORED_HUMAN' },
  { pattern: /\b(responder|rescuer|ratownik)\w*/i, kind: 'RESPONDER_POV' },
  { pattern: /\b(driver|kierowc)\w*/i, kind: 'DRIVER_POV' },
];

const SCALE_WORDS: readonly { readonly pattern: RegExp; readonly scale: 'WIDE' | 'MACRO' }[] = [
  { pattern: /\b(close-?up|macro|zbliżen|zblizen|zoom in)\w*/i, scale: 'MACRO' },
  { pattern: /\b(wide|overview|from above|z góry|z gory|whole (city|system|world))\w*/i, scale: 'WIDE' },
];

const LOCATION_WORDS = /\b(?:at|in|w)\s+(?:the\s+)?([a-ząćęłńóśźż][a-ząćęłńóśźż0-9\s-]{1,30}?)(?=[.?!,;]|$)/i;

function detectTarget(text: string): string | null {
  const follow = FOLLOW_TRIGGER.exec(text);
  if (follow) return follow[2]!.trim();
  const shown = TARGET_TRIGGERS.exec(text);
  if (shown) {
    const candidate = shown[2]!.trim();
    return GENERIC_TARGET_WORDS.test(candidate) ? null : candidate;
  }
  return null;
}

function detectTime(text: string): ObservationTimeIntent | null {
  const before = BEFORE_EVENT.exec(text);
  if (before) return { kind: 'BEFORE_EVENT', eventRef: before[2]!.trim() };
  const after = AFTER_EVENT.exec(text);
  if (after) return { kind: 'AFTER_EVENT', eventRef: after[2]!.trim() };

  const relative = RELATIVE_TIME.exec(text);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = UNIT_WORD[relative[2]!.toLowerCase()] ?? 'HOUR';
    const direction: 'FORWARD' | 'BACKWARD' = /earlier|back|wcześniej|wczesniej|do tyłu|do tylu/i.test(relative[3]!) ? 'BACKWARD' : 'FORWARD';
    return { kind: 'RELATIVE', direction, amount, unit };
  }

  // "go back N hours" / "go forward N hours" — checked BEFORE the bare
  // GO_BACK/GO_FORWARD fallback below, which would otherwise match just the
  // leading "go back"/"go forward" and silently drop the stated amount.
  const relativeLed = RELATIVE_TIME_LED.exec(text);
  if (relativeLed) {
    const amount = Number(relativeLed[2]);
    const unit = UNIT_WORD[relativeLed[3]!.toLowerCase()] ?? 'HOUR';
    const direction: 'FORWARD' | 'BACKWARD' = BACKWARD_LEAD.test(relativeLed[1]!.trim()) ? 'BACKWARD' : 'FORWARD';
    return { kind: 'RELATIVE', direction, amount, unit };
  }

  // "the next N hours" / "następne N godzin" — the flagship dialogue's own phrasing, distinct from
  // both patterns above ("next" carries no later/earlier/forward/back word, and no leading verb).
  const nextN = NEXT_N.exec(text);
  if (nextN) {
    const amount = Number(nextN[1] ?? nextN[3]);
    const unitWord = (nextN[2] ?? nextN[4])!.toLowerCase();
    const unit = UNIT_WORD[unitWord] ?? 'HOUR';
    return { kind: 'RELATIVE', direction: 'FORWARD', amount, unit };
  }

  if (GO_BACK.test(text)) return { kind: 'RELATIVE', direction: 'BACKWARD', amount: 1, unit: null };
  if (GO_FORWARD.test(text)) return { kind: 'RELATIVE', direction: 'FORWARD', amount: 1, unit: null };

  return null;
}

function detectEvent(time: ObservationTimeIntent | null): string | null {
  if (time?.kind === 'BEFORE_EVENT' || time?.kind === 'AFTER_EVENT') return time.eventRef;
  return null;
}

function detectMode(text: string): ObservationMode | null {
  return MODE_WORDS.find((candidate) => candidate.pattern.test(text))?.mode ?? null;
}

function detectPerspective(text: string): ViewpointKind | null {
  return PERSPECTIVE_WORDS.find((candidate) => candidate.pattern.test(text))?.kind ?? null;
}

function detectScale(text: string): 'WIDE' | 'MACRO' | 'NORMAL' | null {
  return SCALE_WORDS.find((candidate) => candidate.pattern.test(text))?.scale ?? null;
}

function detectLocation(text: string): string | null {
  const match = LOCATION_WORDS.exec(text);
  return match ? match[1]!.trim() : null;
}

interface InterventionDetection {
  readonly requested: boolean;
  /** The entity named by the command/hypothetical itself, when the sentence names one directly
   * (e.g. "turn off the PUMP", "jeśli POMPA padnie") — independent of `detectTarget`'s own trigger
   * words, since neither "wyłącz" nor "co się stanie jeśli" is a target-observation trigger. */
  readonly target: string | null;
}

function detectIntervention(text: string): InterventionDetection {
  const command = INTERVENTION_COMMAND.exec(text);
  if (command) return { requested: true, target: (command[1] ?? command[2])!.trim() };
  const hypothetical = WHAT_IF_FAILURE.exec(text);
  if (hypothetical) return { requested: true, target: (hypothetical[1] ?? hypothetical[2])!.trim() };
  return { requested: false, target: null };
}

/**
 * Parses a follow-up observation sentence. Pure and deterministic — same
 * input, same output, always. Returns SOMETHING even for a sentence that
 * names nothing at all (mode/perspective/scale still apply against the
 * CURRENT target); the caller decides whether "nothing changed" is a valid
 * outcome.
 */
export function parseObservationIntent(sourceText: string): ObservationIntent {
  const trimmed = sourceText.trim();

  const intervention = detectIntervention(trimmed);
  const target = detectTarget(trimmed) ?? intervention.target;
  const time = detectTime(trimmed);
  const event = detectEvent(time);
  const mode = detectMode(trimmed);
  const perspective = detectPerspective(trimmed);
  const scale = detectScale(trimmed);
  const location = detectLocation(trimmed);
  const askingWhy = WHY_QUESTION.test(trimmed);
  const askingWhatChanged = WHAT_CHANGED_QUESTION.test(trimmed);
  const askingWhatIsHappening = WHAT_IS_HAPPENING_QUESTION.test(trimmed);
  const askingForLimitations = LIMITATIONS_QUESTION.test(trimmed);
  const returningToBaseline = RETURN_BASELINE.test(trimmed);
  const comparison = (COMPARISON_TRIGGER.test(trimmed) || intervention.requested) && !returningToBaseline;
  const scenarioRequest: ObservationIntent['scenarioRequest'] = EXTREME_RAINFALL_SCENARIO.test(trimmed) ? 'EXTREME_RAINFALL' : null;
  const rainfallCounterfactualLower = RAINFALL_INTENSITY_LOWER_QUERY.test(trimmed);
  const rainfallCounterfactualHigher = !rainfallCounterfactualLower && RAINFALL_INTENSITY_HIGHER_QUERY.test(trimmed);
  const rainfallCounterfactualQuery = rainfallCounterfactualLower || rainfallCounterfactualHigher;
  const rainfallCounterfactualDirection: ObservationIntent['rainfallCounterfactualDirection'] =
    rainfallCounterfactualLower ? 'LOWER' : rainfallCounterfactualHigher ? 'HIGHER' : null;
  // Separate, minimal extraction (not folded into either query-detection regex's own alternation)
  // so changing how the percentage is read never risks the query-detection regexes themselves.
  const rainfallCounterfactualPercentMatch = rainfallCounterfactualQuery ? /(\d{1,3})\s?%/.exec(trimmed) : null;
  const rainfallCounterfactualPercent = rainfallCounterfactualPercentMatch ? Number(rainfallCounterfactualPercentMatch[1]) : null;

  const unresolved: UnresolvedObservationAspect[] = [];
  if (
    !target && !askingWhy && !askingWhatChanged && !askingWhatIsHappening && !askingForLimitations && !comparison
    && !returningToBaseline && !time && !mode && !scenarioRequest && !rainfallCounterfactualQuery
  ) unresolved.push('TARGET');
  if ((BEFORE_EVENT.test(trimmed) || AFTER_EVENT.test(trimmed)) && !event) unresolved.push('EVENT');

  return {
    intentId: `oi-${fnv1a(trimmed.toLowerCase())}`,
    rawText: trimmed,
    target,
    location,
    time,
    perspective,
    focus: target,
    mode,
    comparison,
    event,
    scale,
    askingWhy,
    askingWhatChanged,
    interventionRequested: intervention.requested,
    scenarioRequest,
    askingWhatIsHappening,
    askingForLimitations,
    rainfallCounterfactualQuery,
    rainfallCounterfactualPercent,
    rainfallCounterfactualDirection,
    returningToBaseline,
    unresolved,
  };
}
