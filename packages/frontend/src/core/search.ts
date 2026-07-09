import { getLabs } from './registry';

/**
 * Indeks wyszukiwania globalnego — płaska lista laboratoriów i ich
 * eksperymentów, budowana z rejestru pluginów (zero duplikacji danych).
 * Filtr jest prostym dopasowaniem podciągu bez uwzględniania wielkości
 * liter i polskich znaków — wystarczające dla ~40 pozycji, bez zależności.
 */

export interface SearchEntry {
  labId: string;
  expId: string; // '__base' dla eksperymentu bazowego laboratorium
  icon: string;
  labName: string;
  expName: string;
  tagline: string;
  keywords: string; // znormalizowany tekst do dopasowania
}

const PL_MAP: Record<string, string> = {
  ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[ąćęłńóśźż]/g, (ch) => PL_MAP[ch] ?? ch)
    .trim();
}

export function buildSearchIndex(): SearchEntry[] {
  const entries: SearchEntry[] = [];
  for (const lab of getLabs()) {
    entries.push({
      labId: lab.id,
      expId: '__base',
      icon: lab.icon,
      labName: lab.name,
      expName: lab.name,
      tagline: lab.tagline,
      keywords: normalize(`${lab.name} ${lab.tagline}`),
    });
    for (const exp of lab.experiments ?? []) {
      entries.push({
        labId: lab.id,
        expId: exp.id,
        icon: lab.icon,
        labName: lab.name,
        expName: exp.name,
        tagline: lab.tagline,
        keywords: normalize(`${lab.name} ${exp.name} ${lab.tagline}`),
      });
    }
  }
  return entries;
}

export function filterSearchIndex(entries: SearchEntry[], query: string): SearchEntry[] {
  const q = normalize(query);
  if (!q) return [];
  return entries.filter((e) => e.keywords.includes(q));
}
