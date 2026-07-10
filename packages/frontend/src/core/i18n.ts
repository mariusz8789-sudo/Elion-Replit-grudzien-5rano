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

export type Locale = 'pl' | 'en';

type Dictionary = Record<string, string>;

const pl: Dictionary = {
  'nav.search': 'Szukaj',
  'nav.discoveryLog': 'Dziennik odkryć',
  'nav.glossary': 'Słowniczek',
  'nav.settings': 'Ustawienia',
  'nav.whatIf': 'Co by było, gdyby?',
  'skipLink': 'Przejdź do treści',
};

// Celowo pusty — patrz komentarz u góry pliku. Klucze spadają na `pl` przez
// fallback w t(), więc pusty słownik nie psuje niczego, gdyby ktoś ustawił
// locale='en' zanim tłumaczenie powstanie.
const en: Dictionary = {};

const DICTIONARIES: Record<Locale, Dictionary> = { pl, en };

let currentLocale: Locale = 'pl';
const listeners = new Set<(locale: Locale) => void>();

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
  listeners.forEach((fn) => fn(currentLocale));
}

export function subscribeLocale(fn: (locale: Locale) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Tłumaczy klucz; brak w aktywnym słowniku spada na polski, brak wszędzie zwraca sam klucz (widoczny błąd, nie cichy pusty tekst). */
export function t(key: string): string {
  return DICTIONARIES[currentLocale][key] ?? pl[key] ?? key;
}
