import { getLabs } from './registry';
import { NAV_SECTIONS } from './navigation';
import { resolvedResearchTopics } from './researchLauncher';

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
  /** Set for Research Launcher actions that start an existing Science Chat command instead of navigating. */
  command?: string;
}

/**
 * Product screens that are not plugin labs, read from the ONE navigation model:
 * the main menu first, then every Research Launcher action (so Zapytaj, the
 * menu and search list the same capabilities). Plugin labs (`#/lab/<id>`) come
 * from `buildSearchIndex` and are not repeated here.
 */
export function buildDestinationIndex(): SearchEntry[] {
  const entries: SearchEntry[] = [];
  const seen = new Set<string>();
  const add = (key: string, icon: string, name: string, tagline: string, extra: string, target: { hash?: string; command?: string }): void => {
    if (seen.has(key) || /^#\/lab\//.test(target.hash ?? '')) return;
    seen.add(key);
    entries.push({ labId: key, expId: '__base', icon, labName: name, expName: name, tagline, ...target, keywords: normalize(`${name} ${tagline} ${extra}`) });
  };
  for (const item of NAV_SECTIONS.flatMap((section) => section.items)) {
    if (item.hash && item.hash !== '#/') add(item.hash, item.icon, item.label, item.description ?? '', item.keywords ?? '', { hash: item.hash });
  }
  for (const { topic, actions } of resolvedResearchTopics()) {
    for (const action of actions) {
      add(action.hash ?? `chat:${action.chatCommand}`, topic.icon, action.label, topic.label, `${topic.label} ${action.keywords ?? ''}`, action.hash ? { hash: action.hash } : { command: action.chatCommand });
    }
  }
  return entries;
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
