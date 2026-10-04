import { getLabs } from './registry';
import { SCIENTIFIC_OS, labelOf } from './scientificOs/catalogue';
import { MORE_ITEMS, NAV_SECTIONS } from './navigation';
import { navDescription, navLabel } from './navigationText';
import { getLocale, type Locale } from './i18n';

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
  { hash: '#/verify', icon: '✓', name: 'Verify a Genesis result record', tagline: 'Genesis Verify: fingerprints, ledger and replay, HTML report', extra: 'goal zweryfikuj sprawdz zapis plik raport verify record sha256 hash odcisk' },
  { hash: '#/evidence', icon: '🔁', name: 'Reproduce a result', tagline: 'Replay a run and compare hashes', extra: 'goal powtorz odtworz replay reproduce' },
  { hash: '#/lab-handoff', icon: '⚗', name: 'Send a candidate to a laboratory', tagline: 'Request, package, measurement, review, comparison', extra: 'goal laboratorium wyslij zmierz pomiar lab measure send candidate kandydat' },
  { hash: '#/reports', icon: '📄', name: 'Download a project report', tagline: 'Evidence packs, records, Verify reports and exports', extra: 'goal pobierz raport download report eksport export' },
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
      // The engine is a search word (people type "openmm"), never a shown line.
      keywords: normalize(`${c.name} ${c.what} ${group.name} ${c.source} ${c.engine ?? ''}`),
    })));
}

/**
 * Extra words people type for a place, by navigation id. The places themselves
 * (name, line, route) come from `core/navigation.ts`, the one navigation truth:
 * every main place is searchable, plus the More places listed here. These words
 * only match; they are never shown, so they may name an engine.
 */
const DESTINATION_WORDS: Readonly<Record<string, string>> = {
  discover: 'research console konsola badan run przebieg kandydaci winner gate falsyfikacja',
  inquiry: 'hipoteza hypothesis inquiry dochodzenie autonomiczne',
  science: 'drug discovery leki lek chemia docking dokowanie imatinib vina retrosynteza retrosynthesis',
  'human-biology-lab': 'human explorer czlowiek cialo szkielet mozg narzad anatomia biologia',
  molecule: 'molecule world czasteczka molekula 3d wiazania',
  'cms-open-data': 'cern cms bozon z mion fizyka czastki open data',
  'scientific-worlds': 'laboratorium laboratory symulacja simulation eksperyment',
  evidence: 'dowod replay powtorzenie',
  reviewer: 'recenzent dowod podpis csrn',
  memory: 'pamiec memory prerejestracja preregistration pochodzenie provenance',
  verify: 'weryfikacja zweryfikuj zapis rekord record sha256 hash odcisk raport report tampered drift match',
  'flight-control': 'science flight control kolejka queue worker lease dzierzawa przebieg research run wstrzymaj wznow anuluj pause resume cancel lot',
  dossier: 'candidate dossier kandydat pobierz download',
  pilot: 'eksport export pakiet pack ro-crate pobierz download',
  'lab-handoff': 'laboratorium laboratory lab handoff przekazanie pomiar measurement prosba request paczka package tolerancja tolerance recenzja review porownanie compare wet lab cro',
  reports: 'raport raporty report reports pobierz download pakiet dowodow evidence pack zapis record verify html eksport export klient customer delivery',
  'cern-complex': 'cern lhc fizyka czastki detektor',
  reality: 'reality navigator rzeczywistosc orbita kepler gwiazda planeta galaz wariant scena zapis sceny replay odtworz czas swiata',
};

export function buildDestinationIndex(locale: Locale = getLocale()): SearchEntry[] {
  const places = [
    ...NAV_SECTIONS.flatMap((section) => section.items).filter((item) => item.hash !== undefined && item.hash !== '#/'),
    ...MORE_ITEMS.filter((item) => item.hash !== undefined && DESTINATION_WORDS[item.id] !== undefined),
  ];
  const main = new Set(NAV_SECTIONS.flatMap((section) => section.items).map((item) => item.id));
  return places.map((item) => {
    const name = navLabel(item, locale);
    const tagline = navDescription(item, locale) ?? '';
    // Main places match on their lines too; a More place only on its name and chosen words, so a
    // stray verb in its description ("zmień masę") does not pull Ask's fallback to it.
    const lines = main.has(item.id) ? `${tagline} ${item.description ?? ''} ${navDescription(item, 'en') ?? ''}` : '';
    const words = [item.label, navLabel(item, 'en'), lines, DESTINATION_WORDS[item.id] ?? ''].join(' ');
    return {
      labId: item.hash!, expId: '__base', icon: item.icon, labName: name, expName: name, tagline, hash: item.hash,
      keywords: normalize(`${name} ${words}`),
    };
  });
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
