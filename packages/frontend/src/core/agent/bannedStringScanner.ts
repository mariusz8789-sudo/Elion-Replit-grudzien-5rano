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

/** Scans one string in one declared locale. Case-insensitive for en/pl (Latin script); exact substring for ar (Arabic has no case). */
export function scanForBannedStrings(text: string, locale: SupportedLocale): readonly BannedStringHit[] {
  const hits: BannedStringHit[] = [];
  const haystack = locale === 'ar' ? text : text.toLowerCase();
  for (const phrase of BANNED_STRINGS[locale]) {
    const needle = locale === 'ar' ? phrase : phrase.toLowerCase();
    if (haystack.includes(needle)) {
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
