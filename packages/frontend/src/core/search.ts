import { getLabs } from './registry';
import { SCIENTIFIC_OS, labelOf } from './scientificOs/catalogue';

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
  /** Set for capabilities reached through Ask: open Ask with this command filled in ('' = empty Ask). */
  ask?: string;
}

/**
 * Human goals come first: what a person wants to do, in their words, pointing at
 * the screen that does it. Then the product workflows (DESTINATIONS), then every
 * capability of More · Scientific OS, and the plugin labs last.
 */
const GOALS: readonly { hash: string; icon: string; name: string; tagline: string; extra: string }[] = [
  { hash: '#/drug', icon: '🎯', name: 'Find drug candidates for a target', tagline: 'Docking campaign with Evidence and Replay', extra: 'goal cel lek kandydat bialko target znajdz' },
  { hash: '#/reviewer', icon: '🧐', name: 'Check whether a result is real', tagline: 'Try to break it in the Reviewer Room', extra: 'goal sprawdz wynik prawdziwy weryfikacja tamper' },
  { hash: '#/evidence', icon: '🔁', name: 'Reproduce a result', tagline: 'Replay a run and compare hashes', extra: 'goal powtorz odtworz replay reproduce' },
  { hash: '#/human-biology-lab', icon: '🫀', name: 'Explore the human body', tagline: 'Body → organ → tissue → cell', extra: 'goal cialo anatomia organ narzad komorka' },
  { hash: '#/physics/cms-z', icon: '📈', name: 'Look at real particle-physics data', tagline: 'CMS Open Data, Z boson peak', extra: 'goal dane fizyka czastki cern' },
  { hash: '#/research-console?panel=gov', icon: '📑', name: 'Check a claim against a clinical trial', tagline: 'D-063 claim audit on SURPASS-2', extra: 'goal twierdzenie badanie kliniczne claim audit d-063 surpass rzad government' },
  { hash: '#/clockwork', icon: '⏱', name: 'Track statutory deadlines of a public office', tagline: 'CLOCKWORK', extra: 'goal termin urzad kpa deadline government' },
  { hash: '#/more', icon: '▦', name: 'See everything Genesis can do', tagline: 'More · Scientific OS, with honest statuses', extra: 'goal wszystko wiecej more katalog capabilities' },
];

export function buildGoalIndex(): SearchEntry[] {
  return GOALS.map((g) => ({
    labId: `goal:${g.hash}`, expId: '__base', icon: g.icon, labName: g.name, expName: g.name, tagline: g.tagline, hash: g.hash,
    keywords: normalize(`${g.name} ${g.tagline} ${g.extra}`),
  }));
}

/** Every catalogue capability that has a door (a route or Ask). Found by typing, not listed on a blank query. */
export function buildCapabilityIndex(): SearchEntry[] {
  return SCIENTIFIC_OS.flatMap((group) => group.items
    .filter((c) => c.hash !== undefined || c.ask !== undefined)
    .map((c) => ({
      labId: `cap:${c.id}`, expId: 'capability', icon: '▦', labName: group.name, expName: c.name,
      tagline: `${labelOf(c.state)} · ${c.what}`,
      ...(c.hash !== undefined ? { hash: c.hash } : { ask: c.ask }),
      keywords: normalize(`${c.name} ${c.what} ${group.name} ${c.source}`),
    })));
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
