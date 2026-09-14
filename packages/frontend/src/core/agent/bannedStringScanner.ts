import type { SupportedLocale } from './phaseELabels';

/**
 * E6 — MULTILINGUAL, RULE 2: TRUTH-ENGINE I18N (the critical one).
 *
 * Audit finding (Phase 0, item 20): the only banned-string scanner in this
 * repo is `core/biotechData/govDrugDiscoveryE2E.ts::scanForBannedStrings()`,
 * feature-local over `E2E01_BANNED_OUTPUT_STRINGS` (English/Polish
 * comfort-language only — that module predates this mandate and is a
 * shipped, tested government-facing feature; this file does not modify it,
 * to avoid regressing proven behavior). No generic, reusable, multilingual
 * scanner exists anywhere in `core/agent/` or `core/events/` — this module
 * is that scanner, built once, for Phase E's own outputs and any future
 * caller.
 *
 * THE RULE THIS ENFORCES: a truth guarantee that only covers some of the
 * languages a result can be displayed in is not a truth guarantee, it is a
 * hole with a label on it. PL "bezpieczny"/"bez skutków ubocznych"/"cudowny
 * lek"; EN "safe"/"no side effects"/"miracle cure"/"approved replacement";
 * AR "آمن"/"بدون آثار جانبية"/"دواء معجزة"/"بديل معتمد" — all three lists
 * are checked by the SAME function, never three different code paths that
 * could silently diverge.
 */

export const BANNED_STRING_SCANNER_CONTRACT_VERSION = '1.0.0';

export const BANNED_STRINGS: Readonly<Record<SupportedLocale, readonly string[]>> = {
  en: ['safe', 'no side effects', 'miracle cure', 'approved replacement'],
  pl: ['bezpieczny', 'bez skutków ubocznych', 'cudowny lek'],
  ar: ['آمن', 'بدون آثار جانبية', 'دواء معجزة', 'بديل معتمد'],
};

export interface BannedStringHit {
  readonly locale: SupportedLocale;
  readonly matched: string;
  readonly context: string;
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[\p{L}\p{N}]/u.test(ch);
}

/** True if `needle` occurs in `haystack` at a word boundary on both sides — so "safe" does not false-positive inside "safety". Latin-script only (en/pl): Arabic attaches clitics like the definite article "ال" directly to a noun with no space (e.g. "بديل" inside "البديل"), so a boundary requirement would silently stop matching real hits there — Arabic keeps plain substring matching in `scanForBannedStrings` below. */
function includesAtWordBoundary(haystack: string, needle: string): boolean {
  let from = 0;
  for (;;) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) return false;
    const before = index > 0 ? haystack[index - 1] : undefined;
    const after = index + needle.length < haystack.length ? haystack[index + needle.length] : undefined;
    if (!isWordChar(before) && !isWordChar(after)) return true;
    from = index + 1;
  }
}

/** Scans one string in one declared locale. Case-insensitive for en/pl (Latin script), word-boundary matched so "safety gate" does not false-positive on the banned word "safe". Arabic uses exact substring matching (no case, and clitics like the definite article attach without a space — see `includesAtWordBoundary`). */
export function scanForBannedStrings(text: string, locale: SupportedLocale): readonly BannedStringHit[] {
  const hits: BannedStringHit[] = [];
  const haystack = locale === 'ar' ? text : text.toLowerCase();
  for (const phrase of BANNED_STRINGS[locale]) {
    const needle = locale === 'ar' ? phrase : phrase.toLowerCase();
    const matched = locale === 'ar' ? haystack.includes(needle) : includesAtWordBoundary(haystack, needle);
    if (matched) {
      hits.push({ locale, matched: phrase, context: text });
    }
  }
  return hits;
}

/** Scans the SAME underlying content once it has been rendered into all 3 locales — the real Rule 2 guarantee: a hole in any one language is caught. */
export function scanAllLocales(textsByLocale: Readonly<Record<SupportedLocale, string>>): Readonly<Record<SupportedLocale, readonly BannedStringHit[]>> {
  return {
    en: scanForBannedStrings(textsByLocale.en, 'en'),
    pl: scanForBannedStrings(textsByLocale.pl, 'pl'),
    ar: scanForBannedStrings(textsByLocale.ar, 'ar'),
  };
}

export function hasAnyBannedString(hitsByLocale: Readonly<Record<SupportedLocale, readonly BannedStringHit[]>>): boolean {
  return Object.values(hitsByLocale).some((hits) => hits.length > 0);
}

/**
 * ACTIVE-COLLIDER / LIVE-SIMULATION CLAIM DETECTOR — negation-aware.
 *
 * A SEPARATE concern from `BANNED_STRINGS` above: those are flat, unconditional
 * substring bans (a comfort-language word is never acceptable, in any context).
 * This detector is different because the required disclosure text is REQUIRED
 * to contain the trigger words ("live", "simulation", …) precisely in order to
 * deny them ("NOT A LIVE COLLIDER / NOT A SIMULATION"). A flat ban on those
 * words would make the honest disclosure banner itself fail the scan — exactly
 * backwards. So this scanner only flags a trigger word when it is NOT preceded,
 * within a short window, by a negation marker in the same language: it catches
 * "Genesis is live and simulating collisions" but passes "NOT A LIVE COLLIDER,
 * NOT A SIMULATION" / "NIE NA ŻYWO, NIE SYMULACJA" / "ليس مباشرًا وليس محاكاة".
 */
const ACTIVE_CLAIM_TRIGGER_WORDS: Readonly<Record<SupportedLocale, readonly string[]>> = {
  en: ['live', 'real-time', 'realtime', 'simulation', 'simulating', 'active collider'],
  pl: ['na żywo', 'symulacja', 'symuluje', 'symulacji', 'aktywny zderzacz'],
  ar: ['مباشر', 'محاكاة', 'مصادم نشط'],
};

const NEGATION_MARKERS: Readonly<Record<SupportedLocale, readonly string[]>> = {
  en: ['not a', 'not', 'no ', 'never', 'isn\'t', 'is not'],
  pl: ['nie jest', 'nie', 'brak', 'to nie'],
  ar: ['ليس', 'لا يوجد', 'لا'],
};

/** How many characters immediately before a trigger word are searched for a negation marker. */
const NEGATION_WINDOW_CHARS = 40;

export interface ActiveClaimHit {
  readonly locale: SupportedLocale;
  readonly matched: string;
  readonly context: string;
}

/**
 * Scans one string in one declared locale for an UNNEGATED claim that Genesis
 * is a live/active collider or is running a simulation. Case-insensitive for
 * en/pl; exact substring for ar.
 */
export function scanForActiveColliderClaims(text: string, locale: SupportedLocale): readonly ActiveClaimHit[] {
  const hits: ActiveClaimHit[] = [];
  const haystack = locale === 'ar' ? text : text.toLowerCase();
  const negations = NEGATION_MARKERS[locale];
  for (const rawTrigger of ACTIVE_CLAIM_TRIGGER_WORDS[locale]) {
    const trigger = locale === 'ar' ? rawTrigger : rawTrigger.toLowerCase();
    let searchFrom = 0;
    for (;;) {
      const index = haystack.indexOf(trigger, searchFrom);
      if (index === -1) break;
      searchFrom = index + trigger.length;
      const windowStart = Math.max(0, index - NEGATION_WINDOW_CHARS);
      const precedingWindow = haystack.slice(windowStart, index);
      const isNegated = negations.some((marker) => precedingWindow.includes(locale === 'ar' ? marker : marker.toLowerCase()));
      if (!isNegated) {
        hits.push({ locale, matched: rawTrigger, context: text });
      }
    }
  }
  return hits;
}

/** Scans the SAME underlying content once it has been rendered into all 3 locales, same discipline as `scanAllLocales`. */
export function scanAllLocalesForActiveColliderClaims(textsByLocale: Readonly<Record<SupportedLocale, string>>): Readonly<Record<SupportedLocale, readonly ActiveClaimHit[]>> {
  return {
    en: scanForActiveColliderClaims(textsByLocale.en, 'en'),
    pl: scanForActiveColliderClaims(textsByLocale.pl, 'pl'),
    ar: scanForActiveColliderClaims(textsByLocale.ar, 'ar'),
  };
}

export function hasAnyActiveColliderClaim(hitsByLocale: Readonly<Record<SupportedLocale, readonly ActiveClaimHit[]>>): boolean {
  return Object.values(hitsByLocale).some((hits) => hits.length > 0);
}
