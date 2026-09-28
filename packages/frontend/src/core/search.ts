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
  /** Set for product screens outside the plugin registry: navigate here instead of `#/lab/<labId>`. */
  hash?: string;
}

/** Product screens that are not plugin labs (so the registry never listed them), in grant order. */
const DESTINATIONS: readonly { hash: string; icon: string; name: string; tagline: string; extra: string }[] = [
  { hash: '#/drug', icon: '💊', name: 'Drug Discovery', tagline: 'Docking, retrosynteza, Evidence i Replay', extra: 'leki lek chemia docking imatinib vina' },
  { hash: '#/human-biology-lab', icon: '🧍', name: 'Human Explorer', tagline: 'Atlas człowieka: skóra, szkielet, narządy, mózg', extra: 'czlowiek cialo szkielet mozg narzad anatomia biologia' },
  { hash: '#/reviewer', icon: '🔎', name: 'Reviewer Room', tagline: 'Sprawdź dowody i podpis CSRN', extra: 'recenzent dowod podpis csrn' },
  { hash: '#/evidence', icon: '📋', name: 'Evidence & Replay', tagline: 'Pochodzenie wyników i powtórzenie', extra: 'dowod replay powtorzenie' },
  { hash: '#/cern-complex', icon: '⚛', name: 'Kompleks CERN', tagline: 'Hala, tunel i komora detektora', extra: 'cern lhc fizyka czastki detektor' },
  { hash: '#/physics/cms-z', icon: '⚛', name: 'CERN CMS Z→μμ', tagline: 'Prawdziwe dane CMS: pik bozonu Z', extra: 'cern cms bozon z mion fizyka czastki open data' },
];

export function buildDestinationIndex(): SearchEntry[] {
  return DESTINATIONS.map((d) => ({
    labId: d.hash, expId: '__base', icon: d.icon, labName: d.name, expName: d.name, tagline: d.tagline, hash: d.hash,
    keywords: normalize(`${d.name} ${d.tagline} ${d.extra}`),
  }));
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
