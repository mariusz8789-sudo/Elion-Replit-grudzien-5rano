/**
 * Szkielet i18n — jedno miejsce prawdy dla tekstów UI (nie treści naukowej
 * eksperymentów, która na razie zostaje po polsku w kodzie labów; to
 * osobna, dużo większa decyzja, patrz CONTRIBUTING.md „Dodawanie języka").
 *
 * Dziś aktywny jest wyłącznie `pl` — celowo nie generujemy `en` przez
 * automatyczne tłumaczenie: fizyka wymaga precyzji terminologicznej, którą
 * może zweryfikować tylko native speaker/fizyk, nie zgadywanie. To co jest
 * gotowe: seam (`t()`), mechanizm przełączania (`setLocale`/subskrypcja) i
 * przykład migracji (nawigacja główna, skip link) — reszta stringów w
 * labach zostaje po polsku aż do decyzji o realnym tłumaczeniu.
 */

export type Locale = 'pl' | 'en' | 'es' | 'ar';
export type TextDirection = 'ltr' | 'rtl';

type Dictionary = Record<string, string>;

/**
 * D-129 — `es` and `ar` (UAE deployment, RTL) are selectable. Their dictionaries hold ONLY the
 * Human Explorer / evidence vocabulary supplied by the delivered multilingual pack (not generated
 * here); every other key falls back to Polish through `t()`, visibly. Scientific ids, hashes and
 * symbols are never translated.
 */
export const LOCALE_DIRECTION: Readonly<Record<Locale, TextDirection>> = { pl: 'ltr', en: 'ltr', es: 'ltr', ar: 'rtl' };
export const LOCALE_NATIVE_NAME: Readonly<Record<Locale, string>> = { pl: 'Polski', en: 'English', es: 'Español', ar: 'العربية (الإمارات)' };

const EXPLORER_EN: Dictionary = {
  'explorer.humanExplorer': 'Human Explorer', 'explorer.microscope': 'Microscope', 'explorer.hyperscope': 'Hyperscope', 'explorer.body': 'Human body', 'explorer.systems': 'Body systems',
  'explorer.heart': 'Heart', 'explorer.brain': 'Brain', 'explorer.lungs': 'Lungs', 'explorer.liver': 'Liver', 'explorer.kidneys': 'Kidneys', 'explorer.skin': 'Skin',
  'explorer.tissue': 'Tissue', 'explorer.cell': 'Cell', 'explorer.organelle': 'Organelle', 'explorer.molecule': 'Molecule', 'explorer.dna': 'DNA', 'explorer.rna': 'RNA', 'explorer.atp': 'ATP',
  'explorer.organ': 'Organ', 'explorer.atoms': 'Atoms', 'explorer.stomach': 'Stomach', 'explorer.pancreas': 'Pancreas', 'explorer.smallIntestine': 'Small intestine', 'explorer.systemsRail': 'Body systems', 'explorer.macroToMicro': 'From macro to micro', 'explorer.magnification': 'Magnification', 'explorer.noCapture': 'No capture yet — run an instrument; the image comes only from a sealed session.', 'explorer.scale': 'Scale', 'explorer.notModeled': 'No instrument in this lab models this scale.',
  'explorer.evidence': 'Evidence', 'explorer.provenance': 'Provenance', 'explorer.simulation': 'Simulation', 'explorer.realImage': 'REAL IMAGE', 'explorer.realDataset': 'REAL DATASET',
  'explorer.reconstructed': 'RECONSTRUCTED', 'explorer.simulated': 'SIMULATED', 'explorer.illustrative': 'ILLUSTRATIVE', 'explorer.zoom': 'Zoom', 'explorer.source': 'Source',
  'explorer.unknown': 'Unknown', 'explorer.hypothesis': 'Hypothesis', 'explorer.falsification': 'Falsification', 'explorer.nextTest': 'Next test', 'explorer.fact': 'Fact', 'explorer.verified': 'Verified', 'explorer.insufficientEvidence': 'Insufficient evidence',
};

const pl: Dictionary = {
  'explorer.humanExplorer': 'Eksplorator człowieka', 'explorer.microscope': 'Mikroskop', 'explorer.hyperscope': 'Hyperscope', 'explorer.body': 'Ciało człowieka', 'explorer.systems': 'Układy ciała',
  'explorer.heart': 'Serce', 'explorer.brain': 'Mózg', 'explorer.lungs': 'Płuca', 'explorer.liver': 'Wątroba', 'explorer.kidneys': 'Nerki', 'explorer.skin': 'Skóra',
  'explorer.tissue': 'Tkanka', 'explorer.cell': 'Komórka', 'explorer.organelle': 'Organellum', 'explorer.molecule': 'Cząsteczka', 'explorer.dna': 'DNA', 'explorer.rna': 'RNA', 'explorer.atp': 'ATP',
  'explorer.organ': 'Narząd', 'explorer.atoms': 'Atomy', 'explorer.stomach': 'Żołądek', 'explorer.pancreas': 'Trzustka', 'explorer.smallIntestine': 'Jelito cienkie', 'explorer.systemsRail': 'Układy ciała', 'explorer.macroToMicro': 'Od makro do mikro', 'explorer.magnification': 'Powiększenie', 'explorer.noCapture': 'Brak zdjęcia — uruchom instrument, obraz pochodzi wyłącznie z zapieczętowanej sesji.', 'explorer.scale': 'Skala', 'explorer.notModeled': 'Tej skali żaden instrument w laboratorium nie modeluje.',
  'explorer.evidence': 'Dowód', 'explorer.provenance': 'Pochodzenie danych', 'explorer.simulation': 'Symulacja', 'explorer.realImage': 'RZECZYWISTY OBRAZ', 'explorer.realDataset': 'RZECZYWISTY ZBIÓR DANYCH',
  'explorer.reconstructed': 'REKONSTRUKCJA', 'explorer.simulated': 'SYMULACJA', 'explorer.illustrative': 'ILUSTRACJA', 'explorer.zoom': 'Powiększenie', 'explorer.source': 'Źródło',
  'explorer.unknown': 'Nieznane', 'explorer.hypothesis': 'Hipoteza', 'explorer.falsification': 'Falsyfikacja', 'explorer.nextTest': 'Następny test', 'explorer.fact': 'Fakt', 'explorer.verified': 'Zweryfikowane', 'explorer.insufficientEvidence': 'Niewystarczające dowody',
  'nav.search': 'Szukaj',
  'nav.discoveryLog': 'Dziennik odkryć',
  'nav.glossary': 'Słowniczek',
  'nav.settings': 'Ustawienia',
  'nav.whatIf': 'Co by było, gdyby?',
  'nav.decisionExplorer': 'Decision Explorer',
  'skipLink': 'Przejdź do treści',
};

// Celowo pusty — patrz komentarz u góry pliku. Klucze spadają na `pl` przez
// fallback w t(), więc pusty słownik nie psuje niczego, gdyby ktoś ustawił
// locale='en' zanim tłumaczenie powstanie.
const en: Dictionary = { ...EXPLORER_EN };

// Pack-supplied (GENESIS_ULTIMATE multilingual), verbatim; the pack's own catalog is the source of these strings.
const es: Dictionary = {
  'explorer.humanExplorer': 'Explorador Humano', 'explorer.microscope': 'Microscopio', 'explorer.hyperscope': 'Hipercopio', 'explorer.body': 'Cuerpo humano', 'explorer.systems': 'Sistemas corporales',
  'explorer.heart': 'Corazón', 'explorer.brain': 'Cerebro', 'explorer.lungs': 'Pulmones', 'explorer.liver': 'Hígado', 'explorer.kidneys': 'Riñones', 'explorer.skin': 'Piel',
  'explorer.tissue': 'Tejido', 'explorer.cell': 'Célula', 'explorer.organelle': 'Orgánulo', 'explorer.molecule': 'Molécula', 'explorer.dna': 'ADN', 'explorer.rna': 'ARN', 'explorer.atp': 'ATP',
  'explorer.evidence': 'Evidencia', 'explorer.provenance': 'Procedencia', 'explorer.simulation': 'Simulación', 'explorer.realImage': 'IMAGEN REAL', 'explorer.realDataset': 'CONJUNTO DE DATOS REAL',
  'explorer.reconstructed': 'RECONSTRUIDO', 'explorer.simulated': 'SIMULADO', 'explorer.illustrative': 'ILUSTRATIVO', 'explorer.zoom': 'Zoom', 'explorer.source': 'Fuente',
  'explorer.unknown': 'Desconocido', 'explorer.hypothesis': 'Hipótesis', 'explorer.falsification': 'Falsación', 'explorer.nextTest': 'Siguiente prueba', 'explorer.fact': 'Hecho', 'explorer.verified': 'Verificado', 'explorer.insufficientEvidence': 'Evidencia insuficiente',
};
const ar: Dictionary = {
  'explorer.humanExplorer': 'مستكشف جسم الإنسان', 'explorer.microscope': 'المجهر', 'explorer.hyperscope': 'هايبرسكوب', 'explorer.body': 'جسم الإنسان', 'explorer.systems': 'أجهزة الجسم',
  'explorer.heart': 'القلب', 'explorer.brain': 'الدماغ', 'explorer.lungs': 'الرئتان', 'explorer.liver': 'الكبد', 'explorer.kidneys': 'الكليتان', 'explorer.skin': 'الجلد',
  'explorer.tissue': 'نسيج', 'explorer.cell': 'خلية', 'explorer.organelle': 'عضية', 'explorer.molecule': 'جزيء', 'explorer.dna': 'DNA', 'explorer.rna': 'RNA', 'explorer.atp': 'ATP',
  'explorer.evidence': 'الأدلة', 'explorer.provenance': 'مصدر البيانات', 'explorer.simulation': 'محاكاة', 'explorer.realImage': 'صورة حقيقية', 'explorer.realDataset': 'مجموعة بيانات حقيقية',
  'explorer.reconstructed': 'إعادة بناء', 'explorer.simulated': 'محاكاة', 'explorer.illustrative': 'توضيحية', 'explorer.zoom': 'تكبير', 'explorer.source': 'المصدر',
  'explorer.unknown': 'غير معروف', 'explorer.hypothesis': 'فرضية', 'explorer.falsification': 'التفنيد', 'explorer.nextTest': 'الاختبار التالي', 'explorer.fact': 'حقيقة', 'explorer.verified': 'موثّق', 'explorer.insufficientEvidence': 'أدلة غير كافية',
};

const DICTIONARIES: Record<Locale, Dictionary> = { pl, en, es, ar };
export const SUPPORTED_LOCALES: readonly Locale[] = ['pl', 'en', 'es', 'ar'];

export function isLocale(value: unknown): value is Locale { return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value); }
export function localeDirection(locale: Locale = currentLocale): TextDirection { return LOCALE_DIRECTION[locale]; }

let currentLocale: Locale = 'pl';
const listeners = new Set<(locale: Locale) => void>();

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
  // RTL for Arabic: the document direction follows the locale; ids, hashes and symbols are untouched.
  if (typeof document !== 'undefined') { document.documentElement.dir = LOCALE_DIRECTION[locale]; document.documentElement.lang = locale; }
  listeners.forEach((fn) => fn(currentLocale));
}

export function subscribeLocale(fn: (locale: Locale) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Tłumaczy klucz; brak w aktywnym słowniku spada na polski, brak wszędzie zwraca sam klucz (widoczny błąd, nie cichy pusty tekst). */
export function t(key: string, locale: Locale = currentLocale): string {
  return DICTIONARIES[locale][key] ?? pl[key] ?? key;
}
