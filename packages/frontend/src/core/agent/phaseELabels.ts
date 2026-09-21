import type { ResultLabel, NoveltyLevel } from './noveltyGate';
import type { OrchestratorStopReason } from './campaignOrchestrator';
import type { DirectionGenerationMethod } from './directionFinder';

/**
 * E6 — MULTILINGUAL, RULE 1: CANONICAL MACHINE KEYS + LOCALIZED DISPLAY.
 *
 * Audit finding (Phase 0, item 18): `core/i18n.ts` is a real but essentially
 * empty seam — `Locale('pl'|'en')`, `t()`, only 6 PL nav-string keys, no
 * `en` dictionary (the file's own comment: physics needs terminological
 * precision, not guessing), no `ar`, no locale switcher anywhere. This
 * module does NOT extend that seam (it is scoped to 6 UI nav strings, a
 * different problem) and does NOT build a second general-purpose i18n
 * framework — it is a small, closed dictionary over EXACTLY the canonical
 * label vocabulary Phase E (Kroki 1-6) itself produces:
 * `ResultLabel` (noveltyGate.ts), `NoveltyLevel` (noveltyGate.ts),
 * `OrchestratorStopReason` (campaignOrchestrator.ts),
 * `DirectionGenerationMethod` (directionFinder.ts) — imported as TYPES
 * ONLY, so this file cannot silently drift from the real union if either
 * changes; TypeScript will refuse to compile an incomplete `DICTIONARY`.
 *
 * THE PROPERTY THIS FILE EXISTS TO GUARANTEE: nothing in noveltyGate.ts,
 * directionFinder.ts, or campaignOrchestrator.ts takes a locale parameter,
 * reads this file, or produces different output depending on language —
 * verified structurally (none of those modules import this one) and by
 * `phaseELabels.test.ts`'s own identity tests. `renderLabel` is a PURE
 * function from (canonical key, locale) to display text; it is called
 * AFTER a verdict/fingerprint/replay already exists, never before, and
 * never influences them.
 *
 * RULE 6, STATED EXPLICITLY, NOT BURIED: the Arabic strings below are
 * professional-register MSA translations I (C1) wrote for this task. They
 * are NOT a certified native-speaker guarantee — `arabicVerificationStatus`
 * on every `LabelRender` for `locale: 'ar'` is always `'UNVERIFIED'`, and
 * every consumer of this module (the RTL demo, provenance records) must
 * surface that status rather than presenting Arabic text with the same
 * confidence as the canonical English/Polish.
 */

export const PHASE_E_LABELS_CONTRACT_VERSION = '1.0.0';

export type SupportedLocale = 'en' | 'pl' | 'ar';
export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ['en', 'pl', 'ar'];
export const RTL_LOCALES: readonly SupportedLocale[] = ['ar'];

export function isRtl(locale: SupportedLocale): boolean {
  return RTL_LOCALES.includes(locale);
}

/** Every canonical key this module translates — the union Rule 1 requires TE7.5's completeness check to close over. */
export type CanonicalLabelKey = ResultLabel | NoveltyLevel | OrchestratorStopReason | DirectionGenerationMethod;

export type LocaleEntry = Readonly<Record<SupportedLocale, string>>;

/**
 * Every entry required, for every key, at compile time — `Record<K, V>`
 * with no optional modifier means TypeScript itself refuses to compile a
 * dictionary missing a key or a locale. This is Rule 1's build-failing
 * completeness guarantee, enforced by the type system rather than only by
 * a test.
 */
const DICTIONARY: Readonly<Record<CanonicalLabelKey, LocaleEntry>> = {
  // --- ResultLabel ---------------------------------------------------------
  DISCOVERY: { en: 'Discovery', pl: 'Odkrycie', ar: 'اكتشاف' },
  REPRODUCTION: { en: 'Reproduction', pl: 'Reprodukcja', ar: 'إعادة إنتاج' },
  HYPOTHESIS_UNKNOWN: { en: 'Hypothesis — unknown', pl: 'Hipoteza — nieznane', ar: 'فرضية — غير معروف' },
  NO_ACCESS_DECLARED: { en: 'No access declared', pl: 'Zadeklarowano brak dostępu', ar: 'تم الإعلان عن عدم إمكانية الوصول' },
  // --- NoveltyLevel ---------------------------------------------------------
  UNKNOWN: { en: 'Unknown', pl: 'Nieznane', ar: 'غير معروف' },
  NOT_NEW: { en: 'Not new', pl: 'Nienowe', ar: 'ليس جديدًا' },
  POSSIBLY_NOVEL: { en: 'Possibly novel', pl: 'Możliwie nowe', ar: 'ربما جديد' },
  NOVEL_WITHIN_CHECKED_CORPUS: { en: 'Novel within checked corpus', pl: 'Nowe w obrębie sprawdzonego korpusu', ar: 'جديد ضمن المصادر التي تم فحصها' },
  // --- OrchestratorStopReason -----------------------------------------------
  NO_INFORMATION_GAIN: { en: 'No further information gain', pl: 'Brak dalszego przyrostu informacji', ar: 'لا يوجد مكسب معلوماتي إضافي' },
  NO_FEASIBLE_EXPERIMENT: { en: 'No feasible experiment', pl: 'Brak wykonalnego eksperymentu', ar: 'لا توجد تجربة قابلة للتنفيذ' },
  REDUNDANT_DIRECTION: { en: 'Redundant direction', pl: 'Kierunek nadmiarowy', ar: 'اتجاه زائد عن الحاجة' },
  FALSIFIED_DIRECTION: { en: 'Direction falsified', pl: 'Kierunek sfalsyfikowany', ar: 'تم دحض الاتجاه' },
  INSUFFICIENT_DATA: { en: 'Insufficient data', pl: 'Niewystarczające dane', ar: 'بيانات غير كافية' },
  CONVERGED: { en: 'Converged', pl: 'Zbieżność osiągnięta', ar: 'تم التقارب' },
  MAX_CAMPAIGNS_REACHED: { en: 'Maximum campaigns reached', pl: 'Osiągnięto maksymalną liczbę kampanii', ar: 'تم الوصول إلى الحد الأقصى للحملات' },
  // --- DirectionGenerationMethod ---------------------------------------------
  OBSERVATION_GAP_FOLLOWUP: { en: 'Observation-gap follow-up', pl: 'Kontynuacja luki obserwacyjnej', ar: 'متابعة فجوة في الرصد' },
  UNRESOLVED_SURVIVORS: { en: 'Unresolved rival models', pl: 'Nierozstrzygnięci konkurenci', ar: 'نماذج متنافسة لم يتم حسمها' },
  RESIDUAL_STRUCTURE_UNEXPLAINED: { en: 'Unexplained residual structure', pl: 'Niewyjaśniona struktura residuum', ar: 'بنية متبقية غير مُفسَّرة' },
  CROSS_CAMPAIGN_TRANSFER: { en: 'Cross-campaign transfer refusal', pl: 'Odrzucenie transferu między kampaniami', ar: 'رفض نقل بين حملتين' },
};

export interface LabelRender {
  readonly canonicalKey: CanonicalLabelKey;
  readonly locale: SupportedLocale;
  readonly text: string;
  /** True when the requested locale had no entry and this fell back to English — never a silent substitution. */
  readonly fallback: boolean;
  readonly arabicVerificationStatus: 'VERIFIED' | 'UNVERIFIED' | 'N/A';
}

/**
 * Pure, low-level lookup used directly by tests to exercise the fallback
 * path (Rule 4 / TE7.4) WITHOUT mutating the real, complete `DICTIONARY` —
 * an incomplete `Partial<LocaleEntry>` is a legitimate input here (e.g. a
 * future key added to a union before its translation is written), and this
 * function is what makes that an explicit, flagged fallback rather than a
 * silent `undefined`.
 */
export function lookupTranslation(entry: Partial<LocaleEntry>, canonicalKey: string, locale: SupportedLocale): LabelRender {
  const direct = entry[locale];
  if (direct !== undefined) {
    return {
      canonicalKey: canonicalKey as CanonicalLabelKey,
      locale,
      text: direct,
      fallback: false,
      arabicVerificationStatus: locale === 'ar' ? 'UNVERIFIED' : 'N/A',
    };
  }
  const fallbackText = entry.en ?? `[[UNTRANSLATED:${canonicalKey}]]`;
  return {
    canonicalKey: canonicalKey as CanonicalLabelKey,
    locale,
    text: fallbackText,
    fallback: true,
    arabicVerificationStatus: locale === 'ar' ? 'UNVERIFIED' : 'N/A',
  };
}

/** The real entry point: renders a canonical Phase E label in the requested locale. */
export function renderLabel(canonicalKey: CanonicalLabelKey, locale: SupportedLocale): LabelRender {
  return lookupTranslation(DICTIONARY[canonicalKey], canonicalKey, locale);
}

/** TE7.5 — completeness: every canonical key has all 3 locales, none empty. Used by phaseELabels.test.ts and importable by any future caller that wants to re-check this at runtime. */
export function checkCompleteness(): { readonly complete: boolean; readonly missing: readonly string[] } {
  const missing: string[] = [];
  for (const key of Object.keys(DICTIONARY) as CanonicalLabelKey[]) {
    for (const locale of SUPPORTED_LOCALES) {
      const text = DICTIONARY[key][locale];
      if (!text || text.trim().length === 0) missing.push(`${key}.${locale}`);
    }
  }
  return { complete: missing.length === 0, missing };
}

export function allCanonicalKeys(): readonly CanonicalLabelKey[] {
  return Object.keys(DICTIONARY) as CanonicalLabelKey[];
}
