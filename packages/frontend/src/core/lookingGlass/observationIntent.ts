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
  /** "Go back to how it was" / "return to baseline" — leaves any branch and resumes the primary run. */
  readonly returningToBaseline: boolean;
  /** Everything this parser could not read out of the sentence. A caller must not fill these in with a default. */
  readonly unresolved: readonly UnresolvedObservationAspect[];
}

// Words after which a captured target phrase must stop, because they open a
// clause about something OTHER than the entity's name — a time reference,
// a mode, or a perspective. Without this, "follow the substance in cause
// and effect view" would capture "substance in cause and effect view" as
// one (unmatchable) entity name instead of "substance".
const TARGET_STOP = 'after|before|at|from|over|while|during|as|in\\s+(?:the\\s+)?(?:cause|system|incident|citizen|scientist|engineer|operator)|po\\b|przed\\b|w\\s+chwili|podczas|jako';
const TARGET_TRIGGERS = new RegExp(`\\b(show me|show|go to|focus on|look at|follow|pokaż|pokaz|idź do|skup się na|śledź|sledz)\\s+(?:the\\s+|a\\s+|an\\s+)?([a-ząćęłńóśźż][a-ząćęłńóśźż0-9\\s-]{1,40}?)(?=\\s+(?:${TARGET_STOP})\\b|[.?!,;]|$)`, 'i');
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
const GO_BACK = /\b(go back|cofnij|wróć|wroc)\b(?!\s+to\s+(?:the\s+)?baseline)/i;
const GO_FORWARD = /\b(go forward|advance|przejdź dalej|przejdz dalej)\b/i;
const BACKWARD_LEAD = /^(go back|cofnij|wróć|wroc)/i;

const UNIT_WORD: Readonly<Record<string, TemporalUnit>> = {
  hour: 'HOUR', hours: 'HOUR', godzin: 'HOUR', godz: 'HOUR',
  day: 'DAY', days: 'DAY', dni: 'DAY', dzień: 'DAY', dzien: 'DAY',
  year: 'YEAR', years: 'YEAR', lat: 'YEAR', lata: 'YEAR',
};

const WHY_QUESTION = /\b(why (did|does|is|has)|dlaczego)\b/i;
const RETURN_BASELINE = /\b(return to (the\s+)?baseline|back to (the\s+)?baseline|reset|wróć do (bazy|stanu wyjściowego)|wroc do (bazy|stanu wyjsciowego))\b/i;
const COMPARISON_TRIGGER = /\b(compare|what if|what would happen if|porówn|porown|co (by było|by bylo|jeśli|jesli) gdyby|co jeśli|co jesli)\b/i;

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

/**
 * Parses a follow-up observation sentence. Pure and deterministic — same
 * input, same output, always. Returns SOMETHING even for a sentence that
 * names nothing at all (mode/perspective/scale still apply against the
 * CURRENT target); the caller decides whether "nothing changed" is a valid
 * outcome.
 */
export function parseObservationIntent(sourceText: string): ObservationIntent {
  const trimmed = sourceText.trim();

  const target = detectTarget(trimmed);
  const time = detectTime(trimmed);
  const event = detectEvent(time);
  const mode = detectMode(trimmed);
  const perspective = detectPerspective(trimmed);
  const scale = detectScale(trimmed);
  const location = detectLocation(trimmed);
  const askingWhy = WHY_QUESTION.test(trimmed);
  const returningToBaseline = RETURN_BASELINE.test(trimmed);
  const comparison = COMPARISON_TRIGGER.test(trimmed) && !returningToBaseline;

  const unresolved: UnresolvedObservationAspect[] = [];
  if (!target && !askingWhy && !comparison && !returningToBaseline && !time && !mode) unresolved.push('TARGET');
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
    returningToBaseline,
    unresolved,
  };
}
