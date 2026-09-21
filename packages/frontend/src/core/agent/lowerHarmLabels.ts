import type { SupportedLocale } from './phaseELabels';
import { isRtl, SUPPORTED_LOCALES } from './phaseELabels';
import type { LowerHarmVerdictLabel } from '../biotechData/govDrugLowerHarmPreregistration';

/**
 * LOWER-HARM / CERN SCREENS — MULTILINGUAL LAYER.
 *
 * Same discipline as `phaseELabels.ts` (E6, Rule 1), reused rather than
 * duplicated: `SupportedLocale`, `SUPPORTED_LOCALES`, `isRtl` are IMPORTED
 * from there, not redefined. This file adds a SEPARATE, closed dictionary
 * for the canonical keys the LOWER-HARM/CERN screens need — it does not
 * widen `phaseELabels.ts`'s own `CanonicalLabelKey` union (that union is
 * closed over Phase E's four modules specifically; these screens are a
 * different feature with their own vocabulary).
 *
 * `LowerHarmVerdictLabel` is imported as a TYPE ONLY from the real
 * preregistration module, exactly as `phaseELabels.ts` imports Phase E's
 * label unions — so this dictionary cannot silently drift from the real
 * verdict vocabulary the ranking stage actually produces.
 *
 * THE PROPERTY THIS FILE EXISTS TO GUARANTEE, RESTATED FROM phaseELabels.ts:
 * nothing in `govDrugLowerHarmRanking.ts`, `govDrugLowerHarmFunnel.ts`, or
 * `cmsOpenDataAdapter.mjs` imports this file, reads a locale, or produces
 * different output depending on language. This is a pure display layer,
 * applied strictly AFTER a real verdict/fingerprint already exists.
 *
 * RULE 6 (Arabic, unverified): every `ar` string here is a professional-
 * register MSA translation written for this task, not a certified native
 * review — `arabicVerificationStatus` is always `'UNVERIFIED'` for `ar`,
 * matching `phaseELabels.ts` exactly.
 */

export const LOWER_HARM_LABELS_CONTRACT_VERSION = '1.0.0';

/** The three conjunct criterion names `govDrugLowerHarmFunnel.ts::decideFunnelVerdict` actually emits — literal, not imported, because that field's own type is a plain `string` there (see its module header for why: G2's own observable ids are open-ended, so the field cannot be a closed union). */
export type LowerHarmConjunctKey = 'G2_SEPARATES_TOP2' | 'AGREES_WITH_PRE_EXPERIMENT_RANK' | 'FAVOURED_CANDIDATE_PASSES_SAFETY_GATE';

export type LowerHarmScreenKey = 'SCREEN_FUNNEL' | 'SCREEN_FALSIFICATION' | 'SCREEN_VERDICT' | 'SCREEN_RECIPE' | 'SCREEN_CERN';

/** Canonical keys for the /physics/cms-z screen (CMS Open Data record 5208). Kept in this same file per the established convention: one multilingual layer for every LOWER-HARM/CERN screen, no per-screen dictionary duplication. */
export type CmsZScreenKey =
  | 'CMS_WHAT_IS_TITLE' | 'CMS_WHAT_IS_NOT_TITLE'
  | 'CMS_IS_1' | 'CMS_IS_2' | 'CMS_IS_3'
  | 'CMS_NOT_1' | 'CMS_NOT_2' | 'CMS_NOT_3'
  | 'CMS_PROVENANCE_TITLE' | 'CMS_PROVENANCE_DATASET' | 'CMS_PROVENANCE_LICENSE'
  | 'CMS_PROVENANCE_COLLECTED_PUBLISHED' | 'CMS_PROVENANCE_SHA256'
  | 'CMS_PROVENANCE_SHA256_MATCH' | 'CMS_PROVENANCE_SHA256_MISMATCH'
  | 'CMS_HISTOGRAM_TITLE' | 'CMS_WINDOW_LABEL' | 'CMS_MEDIAN_LABEL' | 'CMS_EVENT_COUNT_LABEL'
  | 'CMS_AUDIT_TITLE' | 'CMS_AUDIT_OUTDATED_LABEL' | 'CMS_AUDIT_STILL_TRUE_LABEL'
  | 'CMS_LOADING' | 'CMS_UNAVAILABLE_TITLE' | 'CMS_UNAVAILABLE_BODY';

/** Chrome shared by the LOWER-HARM funnel screen's 4 tabs (run button, empty states, per-tab section headings). */
export type LowerHarmUiKey =
  | 'RUN_BUTTON' | 'RUN_AGAIN_BUTTON' | 'BUSY_LABEL' | 'EMPTY_STATE' | 'ERROR_PREFIX'
  | 'TAB_CANDIDATE_POOL' | 'TAB_HARD_FILTER' | 'TAB_DIVERSITY' | 'TAB_TOP10' | 'TAB_TOP2'
  | 'FALSIFICATION_CRITERIA_TITLE' | 'FALSIFICATION_RESULT_TITLE' | 'VERDICT_CONJUNCTS_TITLE';

export type LowerHarmCanonicalKey = LowerHarmVerdictLabel | LowerHarmConjunctKey | LowerHarmScreenKey | CmsZScreenKey | LowerHarmUiKey | 'RECIPE_LOCKED_TITLE' | 'RECIPE_LOCKED_BODY' | 'RECIPE_UNLOCKED_NOT_IMPLEMENTED_TITLE' | 'RECIPE_UNLOCKED_NOT_IMPLEMENTED_BODY' | 'CERN_OFFLINE_BANNER' | 'CERN_SCREEN_HINT';

export type LocaleEntry = Readonly<Record<SupportedLocale, string>>;

const DICTIONARY: Readonly<Record<LowerHarmCanonicalKey, LocaleEntry>> = {
  // --- LowerHarmVerdictLabel (govDrugLowerHarmPreregistration.ts) ----------
  WINNER: { en: 'Winner', pl: 'Zwycięzca', ar: 'الفائز' },
  NO_WINNER: { en: 'No winner', pl: 'Brak zwycięzcy', ar: 'لا يوجد فائز' },
  CONFLICTING_EVIDENCE: { en: 'Conflicting evidence', pl: 'Sprzeczne dowody', ar: 'أدلة متضاربة' },
  INSUFFICIENT_EVIDENCE: { en: 'Insufficient evidence', pl: 'Niewystarczające dowody', ar: 'أدلة غير كافية' },
  // --- Funnel WINNER conjuncts (govDrugLowerHarmFunnel.ts) -----------------
  G2_SEPARATES_TOP2: { en: 'G2 separates the TOP2 pair', pl: 'G2 rozdziela parę TOP2', ar: 'يفصل G2 بين زوج أفضل اثنين' },
  AGREES_WITH_PRE_EXPERIMENT_RANK: { en: 'Agrees with the pre-experiment rank', pl: 'Zgadza się z rankingiem sprzed eksperymentu', ar: 'يتفق مع الترتيب قبل التجربة' },
  FAVOURED_CANDIDATE_PASSES_SAFETY_GATE: { en: 'Favoured candidate passes the safety gate', pl: 'Faworyzowany kandydat przechodzi bramkę bezpieczeństwa', ar: 'المرشح المفضل يجتاز بوابة السلامة' },
  // --- Screen titles ---------------------------------------------------------
  SCREEN_FUNNEL: { en: 'LOWER-HARM / Funnel', pl: 'LOWER-HARM / Lejek', ar: 'LOWER-HARM / القمع' },
  SCREEN_FALSIFICATION: { en: 'Falsification', pl: 'Falsyfikacja', ar: 'التفنيد' },
  SCREEN_VERDICT: { en: 'Verdict', pl: 'Werdykt', ar: 'الحكم' },
  SCREEN_RECIPE: { en: 'Research Recipe', pl: 'Receptura badawcza', ar: 'الوصفة البحثية' },
  SCREEN_CERN: { en: 'CERN Z→μμ', pl: 'CERN Z→μμ', ar: 'CERN Z→μμ' },
  // --- Recipe lock ------------------------------------------------------------
  RECIPE_LOCKED_TITLE: { en: 'Research Recipe — LOCKED', pl: 'Receptura badawcza — ZABLOKOWANA', ar: 'الوصفة البحثية — مقفلة' },
  RECIPE_LOCKED_BODY: { en: 'No recipe is generated without a real WinnerRecord from the funnel. The current run has no winner.', pl: 'Receptura nie powstaje bez rzeczywistego WinnerRecord z lejka. Bieżący przebieg nie wskazał zwycięzcy.', ar: 'لا يتم إنشاء وصفة بدون سجل فائز حقيقي من القمع. لا يوجد فائز في التشغيل الحالي.' },
  RECIPE_UNLOCKED_NOT_IMPLEMENTED_TITLE: { en: 'Research Recipe — winner found, generator not yet built', pl: 'Receptura badawcza — zwycięzca wskazany, generator jeszcze nie zbudowany', ar: 'الوصفة البحثية — تم تحديد فائز، المولّد لم يُبنَ بعد' },
  RECIPE_UNLOCKED_NOT_IMPLEMENTED_BODY: { en: 'A WinnerRecord exists, but no LOWER-HARM Research Recipe generator has been built yet. This screen will not fabricate recipe content for a real winner.', pl: 'Istnieje WinnerRecord, ale generator receptury badawczej LOWER-HARM nie został jeszcze zbudowany. Ten ekran nie sfabrykuje treści receptury dla realnego zwycięzcy.', ar: 'يوجد سجل فائز، لكن لم يتم بناء مولّد وصفة بحثية LOWER-HARM بعد. لن تُنشئ هذه الشاشة محتوى وصفة مُختلَقًا لفائز حقيقي.' },
  // --- LOWER-HARM funnel screen chrome ------------------------------------------
  RUN_BUTTON: { en: 'Run the funnel', pl: 'Uruchom lejek', ar: 'تشغيل القمع' },
  RUN_AGAIN_BUTTON: { en: 'Run again', pl: 'Uruchom ponownie', ar: 'تشغيل مرة أخرى' },
  BUSY_LABEL: { en: 'Computing…', pl: 'Liczę…', ar: 'جارٍ الحساب…' },
  EMPTY_STATE: { en: 'Nothing is computed until you click. That is deliberate: this screen never shows a result that did not run.', pl: 'Nic nie jest policzone, dopóki nie klikniesz. To celowe: ekran nie pokazuje wyniku, którego nie było.', ar: 'لا يُحسب شيء حتى تنقر. هذا متعمد: لا تعرض هذه الشاشة نتيجة لم تُشغَّل فعليًا.' },
  ERROR_PREFIX: { en: 'The funnel stopped on an assertion', pl: 'Lejek zatrzymał się asercją', ar: 'توقّف القمع عند تأكيد' },
  TAB_CANDIDATE_POOL: { en: 'Candidate pool', pl: 'Pula kandydatów', ar: 'مجموعة المرشحين' },
  TAB_HARD_FILTER: { en: 'Hard filter', pl: 'Twardy filtr', ar: 'التصفية الصارمة' },
  TAB_DIVERSITY: { en: 'Diversity / redundancy', pl: 'Różnorodność / redundancja', ar: 'التنوع / التكرار' },
  TAB_TOP10: { en: 'TOP10', pl: 'TOP10', ar: 'أفضل 10' },
  TAB_TOP2: { en: 'TOP2', pl: 'TOP2', ar: 'أفضل 2' },
  FALSIFICATION_CRITERIA_TITLE: { en: 'Frozen falsification criteria (before G2 ran)', pl: 'Zamrożone kryteria falsyfikacji (przed uruchomieniem G2)', ar: 'معايير التفنيد المجمّدة (قبل تشغيل G2)' },
  FALSIFICATION_RESULT_TITLE: { en: 'G2 differentiating experiment — result', pl: 'Eksperyment różnicujący G2 — wynik', ar: 'تجربة G2 التفريقية — النتيجة' },
  VERDICT_CONJUNCTS_TITLE: { en: 'Required conjuncts (every one must hold for WINNER)', pl: 'Wymagane koniunkty (każdy musi się spełnić dla WINNER)', ar: 'الشروط المطلوبة (يجب تحقق الجميع للفوز)' },
  // --- CERN offline banner ------------------------------------------------------
  CERN_OFFLINE_BANNER: { en: 'OFFLINE ANALYSIS OF HISTORICAL OPEN DATA — NOT A LIVE COLLIDER / NOT A SIMULATION', pl: 'ANALIZA OFFLINE HISTORYCZNYCH DANYCH OTWARTYCH — TO NIE JEST AKTYWNY ZDERZACZ / TO NIE JEST SYMULACJA', ar: 'تحليل غير متصل لبيانات مفتوحة تاريخية — ليس مصادمًا مباشرًا وليس محاكاة' },
  CERN_SCREEN_HINT: { en: 'Descriptive statistics computed once from a fixed, checksum-verified 2011 dataset, published 2019.', pl: 'Statystyki opisowe policzone raz z ustalonego, zweryfikowanego sumą kontrolną zbioru z 2011, opublikowanego w 2019.', ar: 'إحصاءات وصفية محسوبة مرة واحدة من مجموعة بيانات ثابتة من عام 2011 تم التحقق منها بالمجموع الاختباري، نُشرت عام 2019.' },
  // --- /physics/cms-z screen: "what this IS / IS NOT" section --------------------
  CMS_WHAT_IS_TITLE: { en: 'What this IS', pl: 'Czym to JEST', ar: 'ما هو هذا' },
  CMS_WHAT_IS_NOT_TITLE: { en: 'What this is NOT', pl: 'Czym to NIE JEST', ar: 'ما ليس هذا' },
  CMS_IS_1: { en: 'A verified read and analysis of 10,000 real Z→μμ events (CMS, 2011)', pl: 'Zweryfikowany odczyt i analiza 10 000 rzeczywistych zdarzeń Z→μμ (CMS, 2011)', ar: 'قراءة وتحليل موثقان لعدد 10,000 حدث حقيقي Z→μμ (CMS، 2011)' },
  CMS_IS_2: { en: 'A sha256 checksum match between the file on disk and the expected published checksum', pl: 'Zgodność sumy kontrolnej sha256 pliku na dysku z oczekiwaną, opublikowaną sumą', ar: 'تطابق بصمة sha256 للملف على القرص مع البصمة المنشورة المتوقعة' },
  CMS_IS_3: { en: 'A real pipeline: HTTP API over an unmodified Python worker, checksum-gated before every run', pl: 'Realny pipeline: HTTP API nad niezmodyfikowanym workerem Python, bramkowany sumą kontrolną przed każdym uruchomieniem', ar: 'خط أنابيب حقيقي: واجهة HTTP فوق عامل بايثون غير معدَّل، مُحكَم ببصمة التحقق قبل كل تشغيل' },
  CMS_NOT_1: { en: 'Not a collider simulation — no beam model, no QCD event generator, no detector reconstruction', pl: 'Nie jest symulacją zderzacza — brak modelu wiązki, generatora zdarzeń QCD, rekonstrukcji detektora', ar: 'ليس محاكاة لمصادم — لا يوجد نموذج للحزمة ولا مولد أحداث QCD ولا إعادة بناء للكاشف' },
  CMS_NOT_2: { en: 'Not live — this is an offline analysis of 2011 data, published in 2019', pl: 'Nie na żywo — to analiza offline danych z 2011, opublikowanych w 2019', ar: 'ليس مباشرًا — هذا تحليل غير متصل لبيانات 2011 نُشرت عام 2019' },
  CMS_NOT_3: { en: 'Not a new discovery, a Z boson mass measurement, or a Standard Model test', pl: 'Nie jest nowym odkryciem, pomiarem masy bozonu Z ani testem Modelu Standardowego', ar: 'ليس اكتشافًا جديدًا ولا قياسًا لكتلة بوزون Z ولا اختبارًا للنموذج المعياري' },
  // --- Provenance panel -------------------------------------------------------
  CMS_PROVENANCE_TITLE: { en: 'Provenance / custody', pl: 'Pochodzenie / łańcuch dowodowy', ar: 'المصدر / سلسلة الحيازة' },
  CMS_PROVENANCE_DATASET: { en: 'Dataset', pl: 'Zbiór danych', ar: 'مجموعة البيانات' },
  CMS_PROVENANCE_LICENSE: { en: 'License', pl: 'Licencja', ar: 'الترخيص' },
  CMS_PROVENANCE_COLLECTED_PUBLISHED: { en: 'Collected / published', pl: 'Zebrano / opublikowano', ar: 'تم الجمع / النشر' },
  CMS_PROVENANCE_SHA256: { en: 'sha256', pl: 'sha256', ar: 'sha256' },
  CMS_PROVENANCE_SHA256_MATCH: { en: 'matches expected checksum', pl: 'zgodny z oczekiwaną sumą kontrolną', ar: 'يطابق البصمة المتوقعة' },
  CMS_PROVENANCE_SHA256_MISMATCH: { en: 'MISMATCH — do not trust this run', pl: 'NIEZGODNOŚĆ — nie ufaj temu przebiegowi', ar: 'عدم تطابق — لا تثق بهذا التشغيل' },
  // --- Histogram panel ---------------------------------------------------------
  CMS_HISTOGRAM_TITLE: { en: 'Dimuon invariant-mass histogram', pl: 'Histogram masy niezmienniczej dimionów', ar: 'مخطط كتلة ثنائي الميوون الثابتة' },
  CMS_WINDOW_LABEL: { en: 'Events in the 80–100 GeV window', pl: 'Zdarzenia w oknie 80–100 GeV', ar: 'الأحداث ضمن نافذة 80–100 GeV' },
  CMS_MEDIAN_LABEL: { en: 'Median dimuon mass', pl: 'Mediana masy dimionowej', ar: 'الوسيط لكتلة ثنائي الميوون' },
  CMS_EVENT_COUNT_LABEL: { en: 'Source events', pl: 'Zdarzenia źródłowe', ar: 'الأحداث المصدرية' },
  // --- Audit annotation ---------------------------------------------------------
  CMS_AUDIT_TITLE: { en: 'Audit annotation', pl: 'Adnotacja audytu', ar: 'ملاحظة التدقيق' },
  CMS_AUDIT_OUTDATED_LABEL: { en: 'Partly outdated by this pipeline', pl: 'Częściowo nieaktualne wobec tego pipeline’u', ar: 'أصبح جزئيًا قديمًا بفعل خط الأنابيب هذا' },
  CMS_AUDIT_STILL_TRUE_LABEL: { en: 'Still true', pl: 'Nadal prawdziwe', ar: 'ما زال صحيحًا' },
  // --- Loading / unavailable states ------------------------------------------
  CMS_LOADING: { en: 'Loading real data from the backend…', pl: 'Wczytywanie realnych danych z backendu…', ar: 'جارٍ تحميل البيانات الحقيقية من الخادم…' },
  CMS_UNAVAILABLE_TITLE: { en: 'Data unavailable', pl: 'Dane niedostępne', ar: 'البيانات غير متوفرة' },
  CMS_UNAVAILABLE_BODY: { en: 'The backend could not verify the checksum-pinned source file. No substitute or synthetic result is shown.', pl: 'Backend nie mógł zweryfikować pliku źródłowego przypiętego sumą kontrolną. Nie pokazano żadnego zastępczego ani syntetycznego wyniku.', ar: 'تعذّر على الخادم التحقق من ملف المصدر المثبت ببصمة التحقق. لا يُعرض أي بديل أو نتيجة اصطناعية.' },
};

export interface LabelRender {
  readonly canonicalKey: LowerHarmCanonicalKey;
  readonly locale: SupportedLocale;
  readonly text: string;
  readonly fallback: boolean;
  readonly arabicVerificationStatus: 'VERIFIED' | 'UNVERIFIED' | 'N/A';
}

export function lookupTranslation(entry: Partial<LocaleEntry>, canonicalKey: string, locale: SupportedLocale): LabelRender {
  const direct = entry[locale];
  if (direct !== undefined) {
    return { canonicalKey: canonicalKey as LowerHarmCanonicalKey, locale, text: direct, fallback: false, arabicVerificationStatus: locale === 'ar' ? 'UNVERIFIED' : 'N/A' };
  }
  const fallbackText = entry.en ?? `[[UNTRANSLATED:${canonicalKey}]]`;
  return { canonicalKey: canonicalKey as LowerHarmCanonicalKey, locale, text: fallbackText, fallback: true, arabicVerificationStatus: locale === 'ar' ? 'UNVERIFIED' : 'N/A' };
}

export function renderLowerHarmLabel(canonicalKey: LowerHarmCanonicalKey, locale: SupportedLocale): LabelRender {
  return lookupTranslation(DICTIONARY[canonicalKey], canonicalKey, locale);
}

export function checkLowerHarmLabelCompleteness(): { readonly complete: boolean; readonly missing: readonly string[] } {
  const missing: string[] = [];
  for (const key of Object.keys(DICTIONARY) as LowerHarmCanonicalKey[]) {
    for (const locale of SUPPORTED_LOCALES) {
      const text = DICTIONARY[key][locale];
      if (!text || text.trim().length === 0) missing.push(`${key}.${locale}`);
    }
  }
  return { complete: missing.length === 0, missing };
}

/** Every dictionary string, grouped by locale — the exact shape `bannedStringScanner.ts::scanAllLocales` expects. Used by the banned-strings test over every new label at once. */
export function allLowerHarmTextsByLocale(): Readonly<Record<SupportedLocale, string>> {
  const joined: Record<SupportedLocale, string[]> = { en: [], pl: [], ar: [] };
  for (const key of Object.keys(DICTIONARY) as LowerHarmCanonicalKey[]) {
    for (const locale of SUPPORTED_LOCALES) joined[locale].push(DICTIONARY[key][locale]);
  }
  return { en: joined.en.join(' \n '), pl: joined.pl.join(' \n '), ar: joined.ar.join(' \n ') };
}

export { isRtl, SUPPORTED_LOCALES };
