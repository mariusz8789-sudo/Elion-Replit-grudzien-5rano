/**
 * Cheminformatyka — WYŁĄCZNIE deterministyczne, ścisłe obliczenia (P6.5).
 *
 * Zakres v1 (uczciwy): parsowanie prostego wzoru sumarycznego (bez nawiasów,
 * hydratów, izotopów), masa molowa ze standardowych mas atomowych, udziały
 * masowe, stopień nienasycenia (DoU). To realna chemia obliczeniowa — nie
 * dokujemy, nie liczymy logP/ADMET/toksyczności (patrz manifest zdolności).
 *
 * Masy atomowe: IUPAC 2021 (wartości konwencjonalne), zaokrąglone do stabilnej
 * precyzji. Wystarczające do mas molowych z dokładnością < 0,1%.
 */

export const ATOMIC_WEIGHTS: Record<string, number> = {
  H: 1.008, He: 4.0026, Li: 6.94, Be: 9.0122, B: 10.81, C: 12.011, N: 14.007,
  O: 15.999, F: 18.998, Ne: 20.18, Na: 22.99, Mg: 24.305, Al: 26.982, Si: 28.085,
  P: 30.974, S: 32.06, Cl: 35.45, Ar: 39.948, K: 39.098, Ca: 40.078, Fe: 55.845,
  Co: 58.933, Ni: 58.693, Cu: 63.546, Zn: 65.38, Se: 78.971, Br: 79.904,
  Ag: 107.87, I: 126.9, Pt: 195.08, Au: 196.97,
};

export interface ParsedFormula {
  ok: boolean;
  error?: string;
  counts: Record<string, number>;
}

/**
 * Parsuje wzór sumaryczny typu „C9H8O4". Zwraca liczności pierwiastków.
 * Odrzuca: pusty ciąg, nieznany pierwiastek, znaki spoza [A-Za-z0-9], nawiasy.
 */
export function parseFormula(formula: string): ParsedFormula {
  const raw = String(formula ?? '').trim();
  if (!raw) return { ok: false, error: 'Pusty wzór.', counts: {} };
  if (/[^A-Za-z0-9]/.test(raw)) return { ok: false, error: 'Dozwolone tylko litery i cyfry (bez nawiasów, kropek, ładunków) w v1.', counts: {} };

  const counts: Record<string, number> = {};
  const re = /([A-Z][a-z]?)(\d*)/g;
  let consumed = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    if (m.index !== consumed) break; // luka = nieprawidłowy token (np. mała litera na starcie)
    const el = m[1];
    const n = m[2] === '' ? 1 : parseInt(m[2], 10);
    if (!(el in ATOMIC_WEIGHTS)) return { ok: false, error: `Nieznany pierwiastek „${el}".`, counts: {} };
    counts[el] = (counts[el] ?? 0) + n;
    consumed += m[0].length;
  }
  if (consumed !== raw.length) return { ok: false, error: 'Nie udało się sparsować całego wzoru.', counts: {} };
  if (Object.keys(counts).length === 0) return { ok: false, error: 'Brak pierwiastków.', counts: {} };
  return { ok: true, counts };
}

/** Masa molowa [g/mol] z liczności pierwiastków. */
export function molecularWeight(counts: Record<string, number>): number {
  let mw = 0;
  for (const [el, n] of Object.entries(counts)) mw += (ATOMIC_WEIGHTS[el] ?? 0) * n;
  return mw;
}

/** Udziały masowe pierwiastków (sumują się do 1). */
export function massFractions(counts: Record<string, number>): Record<string, number> {
  const mw = molecularWeight(counts) || 1;
  const out: Record<string, number> = {};
  for (const [el, n] of Object.entries(counts)) out[el] = ((ATOMIC_WEIGHTS[el] ?? 0) * n) / mw;
  return out;
}

/** Łączna liczba atomów. */
export function atomCount(counts: Record<string, number>): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

/**
 * Stopień nienasycenia (Degree of Unsaturation) dla wzorów CHNOX:
 * DoU = (2C + 2 + N − H − X)/2, gdzie X = halogeny (F,Cl,Br,I). Tlen i siarka
 * nie wpływają. Ścisłe dla związków bez nietypowych walencyjności.
 */
export function degreeOfUnsaturation(counts: Record<string, number>): number {
  const c = counts.C ?? 0;
  const n = counts.N ?? 0;
  const h = counts.H ?? 0;
  const x = (counts.F ?? 0) + (counts.Cl ?? 0) + (counts.Br ?? 0) + (counts.I ?? 0);
  return (2 * c + 2 + n - h - x) / 2;
}

/** Kanoniczny wzór Hilla: C, potem H, potem reszta alfabetycznie (bez C → wszystko alfabetycznie). */
export function hillFormula(counts: Record<string, number>): string {
  const els = Object.keys(counts);
  const ordered: string[] = [];
  if (counts.C) {
    ordered.push('C');
    if (counts.H) ordered.push('H');
    ordered.push(...els.filter((e) => e !== 'C' && e !== 'H').sort());
  } else {
    ordered.push(...els.sort());
  }
  return ordered.map((e) => (counts[e] === 1 ? e : `${e}${counts[e]}`)).join('');
}
