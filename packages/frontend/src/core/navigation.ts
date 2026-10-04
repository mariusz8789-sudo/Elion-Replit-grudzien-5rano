/**
 * GENESIS NAVIGATION — the single navigation model for the whole product.
 *
 * Genesis had ~35 hash routes and no global menu, so every screen was reached
 * from a different place and the app read as a pile of separate tools. This
 * module is the one list of where you can go, and `AppShell` (desktop sidebar,
 * mobile tab bar, the More explorer), Search and the profile menus all derive
 * from it. There is no second registry.
 *
 * INFORMATION ARCHITECTURE (owner brief, 3 Oct 2026): six capability groups,
 * never more than two levels (group → place):
 *   HOME · RESEARCH · EXPLORE · PROOF · OPERATIONS · DELIVER
 * Everything else — the long tail of labs, the public-sector tools, platform
 * screens, and the synthetic demos — sits in More, with the demos in their own
 * DEMO group so a toy is never presented as a product.
 *
 * HONESTY RULES:
 *   - Every `hash` here is a route that really resolves in `App.tsx`'s
 *     `parseHash`. A menu entry that navigates nowhere is a lie about the
 *     product, so there are none. Places the brief suggested that have no
 *     screen yet (a separate Replay page) are NOT invented: Replay lives in
 *     Evidence & Replay. Lab handoff and Reports are real screens over the
 *     ResearchRun lab loop and the deliverable routes the backend issues.
 *   - `status: 'planned'` marks a capability whose CORE EXISTS AND RUNS but
 *     whose workspace is not built yet. It renders visibly disabled with the
 *     reason, rather than being hidden (which would understate the system) or
 *     linked (which would overstate it). Sovereign is the remaining one.
 *   - `kind: 'chat'` is an action, not a route — it opens the ONE globally
 *     mounted ScienceChat through `scienceChatBridge`.
 *   - Labels name a capability a person recognises, never an engine, worker,
 *     adapter or internal enum (`customerFacingEngineNames.test.tsx`).
 */

export type NavStatus = 'ready' | 'planned';

export interface NavItem {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  /** A real hash route, or undefined for action items. */
  readonly hash?: string;
  /** Action items (currently only the chat) carry a kind instead of a hash. */
  readonly kind?: 'chat';
  readonly status?: NavStatus;
  /** Required when status is 'planned': what exists, and what does not yet. */
  readonly plannedNote?: string;
  /** Shown in the mobile tab bar (with More). */
  readonly primary?: true;
  /** One-word label for the mobile tab bar. */
  readonly shortLabel?: string;
  /** One plain-language line under the label — what a first-time visitor finds there. */
  readonly description?: string;
  /** An alternative screen of the capability with this id: listed folded under it, never at top level. */
  readonly variantOf?: string;
  /** Synthetic, toy or internal: shown only in the DEMO group, always with a DEMO badge. */
  readonly demo?: true;
}

export interface NavSection {
  readonly id: string;
  readonly label: string;
  readonly items: readonly NavItem[];
}

/**
 * ASK GENESIS — the one command input. It is an action, not a destination: it
 * opens the one global ScienceChat. It heads the Research group and the mobile
 * tab bar.
 */
export const ASK_ITEM: NavItem = { id: 'chat', label: 'Zapytaj Genesis', shortLabel: 'Zapytaj', icon: '✦', kind: 'chat', primary: true, description: 'Opisz zadanie badawcze; Genesis kieruje je do modelu albo do właściwego ekranu' };

/**
 * The main navigation: six groups, one entry per capability. Order inside a
 * group is the order a newcomer needs them.
 */
export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: 'home',
    label: '',
    items: [
      { id: 'home', label: 'Start', shortLabel: 'Start', icon: '◉', hash: '#/', primary: true, description: 'Przegląd: obszary, ostatnie badania i dowody' },
    ],
  },
  {
    id: 'research',
    label: 'Badania',
    items: [
      ASK_ITEM,
      { id: 'discover', label: 'Przebiegi badań', shortLabel: 'Przebiegi', icon: '◎', hash: '#/research-console', primary: true, description: 'Uruchom przebieg: kandydaci, dowody, falsyfikacja i bramka zwycięzcy' },
      { id: 'inquiry', label: 'Hipotezy', icon: '🔬', hash: '#/inquiry', description: 'Genesis sam stawia hipotezy i odrzuca te, którym przeczą obliczenia' },
    ],
  },
  {
    id: 'explore',
    label: 'Eksploruj',
    items: [
      { id: 'science', label: 'Odkrywanie leków', icon: '💊', hash: '#/drug', description: 'Kandydaci na lek dla białka: dokowanie, droga syntezy, dowody' },
      { id: 'human-biology-lab', label: 'Biologia człowieka', shortLabel: 'Człowiek', icon: '🧍', hash: '#/human-biology-lab', description: 'Atlas człowieka: ciało, narząd, tkanka, komórka' },
      { id: 'molecule', label: 'Cząsteczki', icon: '🧪', hash: '#/molecule', description: 'Cząsteczka w 3D: geometria, wiązania i właściwości' },
      { id: 'cms-open-data', label: 'Fizyka i CERN', icon: '⚛', hash: '#/physics/cms-z', description: 'Prawdziwe zdarzenia CMS Z→μμ; analiza zapisanych danych, nie działający detektor' },
      { id: 'scientific-worlds', label: 'Laboratorium i symulacje', shortLabel: 'Lab', icon: '⌬', hash: '#/scientific-worlds', description: 'Jedna przestrzeń dla eksperymentów i symulacji Genesis' },
    ],
  },
  {
    id: 'proof',
    label: 'Dowody',
    items: [
      { id: 'evidence', label: 'Dowody i powtórzenie', shortLabel: 'Dowody', icon: '📋', hash: '#/evidence', primary: true, description: 'Skąd pochodzi wynik i czy powtórzenie daje to samo' },
      { id: 'reviewer', label: 'Pokój recenzenta', icon: '🔎', hash: '#/reviewer', description: 'Spróbuj podważyć wynik: dane wejściowe, testy, wyniki negatywne' },
      { id: 'memory', label: 'Pamięć naukowa', icon: '▣', hash: '#/memory', description: 'Zapisane przebiegi, plan zapisany przed wynikiem i pochodzenie' },
      { id: 'verify', label: 'Genesis Verify', icon: '✓', hash: '#/verify', description: 'Wgraj zapis wyniku: odciski, rejestr i powtórzenie obliczenia, raport HTML' },
    ],
  },
  {
    id: 'operations',
    label: 'Operacje',
    items: [
      { id: 'flight-control', label: 'Kontrola lotów nauki', icon: '◎', hash: '#/flight-control', description: 'Przebiegi badań, kolejka zadań i loty eksperymentów; wstrzymaj, wznów, anuluj' },
    ],
  },
  {
    id: 'deliver',
    label: 'Rezultaty',
    items: [
      { id: 'dossier', label: 'Kandydaci', icon: '🗂', hash: '#/dossier', description: 'Zapisani kandydaci z dowodami; pobierz dossier' },
      { id: 'pilot', label: 'Pakiety dowodów i eksport', icon: '🧪', hash: '#/pilot', description: 'Plan → wynik → pakiet dowodów do pobrania i powtórzenia' },
      { id: 'lab-handoff', label: 'Przekazanie do laboratorium', icon: '⚗', hash: '#/lab-handoff', description: 'Prośba o pomiar, paczka dla laboratorium, wynik, sprawdzenie przez drugą osobę i porównanie z obliczeniem' },
      { id: 'reports', label: 'Raporty', icon: '📄', hash: '#/reports', description: 'Pakiety dowodów, zapisy wyników, raporty Verify, paczki laboratoryjne i eksport dla klienta do pobrania' },
    ],
  },
];

/**
 * MORE — every module beyond the main navigation, grouped and folded so it
 * never becomes a wall.
 *
 * Genesis grew several screens for the same capability. More shows ONE entry
 * per capability; the alternative screens of that same capability are its
 * `variantOf` entries, folded under it. Nothing was deleted: every former
 * route is still an entry here or in the main groups, and still resolves.
 */
export const MORE_ITEMS: readonly NavItem[] = [
  // — Nauki o życiu —
  { id: 'campaign', label: 'Zaawansowana kampania naukowa', icon: '⚡', hash: '#/campaign', description: 'Widok specjalisty: kandydaci, plany, dowody i powtórzenie' },
  { id: 'gov-campaign', label: 'Odkrywanie leków dla sektora publicznego', icon: '🏛', hash: '#/gov-campaign', variantOf: 'campaign', description: 'Pełna kampania na realnej puli kandydatów: przesiew, falsyfikacja, bramka bezpieczeństwa, werdykt' },
  { id: 'cde', label: 'Silnik odkryć', icon: '🧭', hash: '#/cde', variantOf: 'campaign' },
  { id: 'precision', label: 'Analiza referencyjna cząsteczki', icon: '🔬', hash: '#/molecular-reference-analysis', variantOf: 'campaign' },
  { id: 'chemistry', label: 'Chemia — stanowisko miareczkowania', icon: '⚗', hash: '#/scientific-worlds?station=st-titration', description: 'Bilans ładunku w głównym Laboratorium' },
  { id: 'chemistry-classic', label: 'Chemia — laboratorium klasyczne', icon: '⚗', hash: '#/lab/chemistry', variantOf: 'chemistry' },
  { id: 'virtual-bio', label: 'Wirtualne laboratorium biologii', icon: '🧫', hash: '#/virtual-bio', description: 'Modele dydaktyczne: komórka, farmakokinetyka, receptor, oporność na antybiotyki' },
  { id: 'cell-lab', label: 'Wirtualna komórka', icon: '🧫', hash: '#/cell-lab', variantOf: 'virtual-bio' },
  // — Fizyka i kosmos —
  { id: 'physics', label: 'Fizyka — światło w zakrzywionej czasoprzestrzeni', icon: '🕳', hash: '#/scientific-worlds?station=st-window', description: 'Okno obserwacyjne Laboratorium: opóźnienie Shapiro i ugięcie światła (model)' },
  { id: 'black-hole', label: 'Czarna dziura — Schwarzschild', icon: '🕳', hash: '#/lab/einstein', description: 'Promień horyzontu i tory światła wokół czarnej dziury' },
  { id: 'geodesics', label: 'Fotony wokół czarnej dziury', icon: '🕳', hash: '#/geodesics', variantOf: 'black-hole' },
  { id: 'universe', label: 'Wszechświat — problem trzech ciał', icon: '🪐', hash: '#/lab/universe', description: 'Ruch trzech ciał liczony krok po kroku' },
  // CMS Open Data (main nav) is an offline analysis of a checksummed event file; the complex is a
  // walk-through world with a model collider. Two capabilities, so the complex stands on its own here.
  { id: 'cern-complex', label: 'Kompleks CERN', icon: '◉', hash: '#/cern-complex', description: 'Przejście przez halę, tunel i komorę detektora — model zderzeń, oddzielnie od danych CMS' },
  { id: 'collider', label: 'CERN — komora detektora', icon: '⚛', hash: '#/cern-complex?room=detector', variantOf: 'cern-complex' },
  { id: 'lab-fpv', label: 'Laboratorium kwantowe', icon: '🧪', hash: '#/lab-fpv' },
  { id: 'entanglement', label: 'Miary splątania', icon: '🔗', hash: '#/entanglement', variantOf: 'lab-fpv' },
  // — Decyzje i sektor publiczny —
  { id: 'clockwork', label: 'CLOCKWORK — terminy urzędu', icon: '⏱', hash: '#/clockwork', description: 'Terminy ustawowe spraw urzędu, liczone deterministycznie' },
  { id: 'whatif', label: 'Co by było, gdyby?', icon: '🌀', hash: '#/what-if', description: 'Rozgałęzienie w momencie decyzji i porównanie skutków' },
  { id: 'decision-explorer', label: 'Eksplorator decyzji', icon: '🌠', hash: '#/decision-explorer', variantOf: 'whatif' },
  { id: 'conflict', label: 'Konflikt modeli', icon: '⚖', hash: '#/conflict', variantOf: 'whatif' },
  { id: 'protection-priority', label: 'Kogo chronić najpierw?', icon: '🛡', hash: '#/protection-priority' },
  {
    id: 'sovereign', label: 'Sovereign', icon: '🏛', status: 'planned',
    plannedNote: 'Profil instytucjonalny (skala miasta/energii/wody/transportu) — nie istnieje jeszcze ani jako route, ani jako model uprawnień. Wymieniony, żeby nie udawać, że go pomijamy.',
  },
  // — Nauka i wiedza —
  { id: 'investor-demo', label: 'Prowadzone demo', icon: '▶', hash: '#/investor-demo', description: 'Eksperyment, wynik i dowód w jednym przebiegu' },
  { id: 'tour', label: 'Przewodnik głosowy', icon: '▶', hash: '#/tour', variantOf: 'investor-demo' },
  { id: 'glossary', label: 'Słowniczek', icon: '📚', hash: '#/glossary' },
  { id: 'dome-world', label: 'Kopuła vs kula', icon: '🌍', hash: '#/dome-world' },
  { id: 'calibration', label: 'Ile trwa okres zakaźności?', icon: '🔎', hash: '#/calibration' },
  { id: 'knowledge-sources', label: 'Wiedza i źródła publiczne', icon: '📚', hash: '#/knowledge-sources', description: 'Propozycje źródeł — człowiek publikuje albo odrzuca każde z nich' },
  { id: 'meta-cognition', label: 'Samoaudyt Genesis', icon: '◇', hash: '#/meta-cognition', description: 'Co Genesis wie, gdzie sobie przeczy i czego mu brakuje' },
  { id: 'discovery-log', label: 'Dziennik odkryć', icon: '🏆', hash: '#/discovery-log' },
  // — Konto i platforma —
  { id: 'account', label: 'Konto — zaloguj się lub załóż konto', icon: '👤', hash: '#/konto', description: 'Logowanie, rejestracja i profil konta' },
  { id: 'projects', label: 'Projekty (chmura)', icon: '☁', hash: '#/projects' },
  { id: 'settings', label: 'Ustawienia', icon: '⚙', hash: '#/settings', description: 'Konto, projekty, tryb badawczy' },
  // — DEMO: pokazy i eksperymenty wewnętrzne (syntetyczne, nie są dowodem) —
  { id: 'worlds', label: 'Światy i symulacje kryzysów', icon: '◈', hash: '#/worlds', demo: true, description: 'Syntetyczne światy: miasto, powódź, pożar, epidemia — scenariusze, nie prognozy' },
  { id: 'world', label: 'World Engine', icon: '🌍', hash: '#/genesis-world', variantOf: 'worlds', demo: true },
  { id: 'simulation', label: 'Generator symulacji', icon: '🔭', hash: '#/generate', variantOf: 'worlds', demo: true },
  { id: 'world-director', label: 'World Director', icon: '◉', hash: '#/world-director', variantOf: 'worlds', demo: true, description: 'Opis tekstowy → świat 3D' },
  { id: 'world-proposal', label: 'Zaproponuj świat', icon: '🧩', hash: '#/world-proposal', variantOf: 'worlds', demo: true },
  { id: 'city3d', label: 'Miasto 3D', icon: '🏙', hash: '#/city3d', variantOf: 'worlds', demo: true },
  { id: 'scientific-city', label: 'Scientific City', icon: '🏗', hash: '#/scientific-city', variantOf: 'worlds', demo: true },
  { id: 'first-person-lab', label: 'Laboratorium — scenariusze', icon: '🔬', hash: '#/first-person-lab', variantOf: 'worlds', demo: true },
  { id: 'looking-glass', label: 'Looking Glass', icon: '🔭', hash: '#/looking-glass', variantOf: 'worlds', demo: true },
  { id: 'timeline', label: 'Discovery Timeline', icon: '🌌', hash: '#/timeline', variantOf: 'worlds', demo: true },
  { id: 'reality', label: 'Nawigator rzeczywistości — orbita i jej warianty', icon: '🪐', hash: '#/reality', variantOf: 'worlds', demo: true, description: 'Zmień masę gwiazdy lub orbitę, porównaj warianty, zapisz scenę i policz ją ponownie' },
  { id: 'mirror', label: 'Genesis Mirror', icon: '◐', hash: '#/mirror', demo: true, description: 'Syntetyczny szkielet bez kamery' },
  { id: 'matrix-map', label: 'Matrix — mapa systemu', icon: '◈', hash: '#/matrix-map', demo: true, description: 'Każdy przebieg i jego powiązania' },
  { id: 'matrix', label: 'Matrix — HUD', icon: '◈', hash: '#/matrix', variantOf: 'matrix-map', demo: true },
  { id: 'myths-theories', label: 'Mity i teorie', icon: '⚗', hash: '#/myths-theories', demo: true, description: 'Spekulatywne modele czasoprzestrzeni — jawna piaskownica' },
  { id: 'decipherment', label: 'Deszyfracja', icon: '📜', hash: '#/decipherment', demo: true },
  { id: 'cyber', label: 'Cyber', icon: '🛡', hash: '#/cyber', demo: true, description: 'Dochodzenie po incydencie na zabawkowej aplikacji: hipotezy i dowody, bez oskarżeń' },
];

/** The More label, shared by the desktop sidebar and the mobile explorer. */
export const RESEARCH_MODE_LABEL = 'Więcej · wszystkie moduły';

/**
 * The first entry of More: the whole catalogue on one page (`#/more`), every
 * capability with its audit status.
 */
export const MORE_OVERVIEW_ITEM: NavItem = { id: 'scientific-os', label: 'Wszystkie możliwości', icon: '▦', hash: '#/more', description: 'Pełny katalog, każda pozycja ze statusem z audytu' };

/** More groups; `variantOf` entries fold under their capability. The DEMO group is always last. */
const GROUPS: readonly { id: string; label: string; ids: readonly string[] }[] = [
  { id: 'more-ls', label: 'Nauki o życiu', ids: ['campaign', 'chemistry', 'virtual-bio'] },
  { id: 'more-physics', label: 'Fizyka i kosmos', ids: ['physics', 'black-hole', 'universe', 'cern-complex', 'lab-fpv'] },
  { id: 'more-public', label: 'Decyzje i sektor publiczny', ids: ['clockwork', 'whatif', 'protection-priority', 'sovereign'] },
  { id: 'more-learning', label: 'Nauka i wiedza', ids: ['investor-demo', 'glossary', 'dome-world', 'calibration', 'knowledge-sources', 'meta-cognition', 'discovery-log'] },
  { id: 'more-system', label: 'Konto i platforma', ids: ['account', 'projects', 'settings'] },
  // Synthetic worlds, toys and internal experiments. The catalogue files Cyber under "Demo only", and
  // the owner's rule is that Worlds, crisis and city simulations are synthetic DEMO: never a product group.
  { id: 'more-showcase', label: 'DEMO · pokazy i eksperymenty', ids: ['worlds', 'mirror', 'matrix-map', 'myths-theories', 'decipherment', 'cyber'] },
];

/** The id of the DEMO group, for the shell's badge and note. */
export const DEMO_SECTION_ID = 'more-showcase';

const byId = new Map(MORE_ITEMS.map((item) => [item.id, item] as const));

export const MORE_SECTIONS: readonly NavSection[] = GROUPS.map((group) => ({
  id: group.id,
  label: group.label,
  items: group.ids.map((id) => byId.get(id)).filter((item): item is NavItem => item !== undefined),
}));

/** The alternative screens of one capability (empty for most entries). */
export function navVariants(id: string): readonly NavItem[] {
  return MORE_ITEMS.filter((item) => item.variantOf === id);
}

/** Flat view, for lookups. */
export const NAV_ITEMS: readonly NavItem[] = [...NAV_SECTIONS.flatMap((section) => section.items), MORE_OVERVIEW_ITEM, ...MORE_ITEMS];

/**
 * Mobile tab bar, left to right: Start, Zapytaj, Przebiegi, Dowody (AppShell
 * adds More, whose explorer holds everything else). Few fixed, always visible
 * targets in plain words (Apple HIG tab bars, NN/g on hidden navigation).
 */
export const PRIMARY_NAV_ITEMS: readonly NavItem[] = NAV_SECTIONS.flatMap((section) => section.items).filter((item) => item.primary);

/**
 * Which nav item the current hash corresponds to, or null when the route has
 * no menu entry (deep links like `#/lab/:id`, `#/discovery-hall`, `#/hf-slice`
 * are reachable and intentionally not in the menu). Longest match wins so
 * `#/scientific-worlds?station=st-titration` highlights Chemistry.
 */
export function activeNavId(hash: string): string | null {
  const normalized = hash === '' || hash === '#' ? '#/' : hash;
  let best: NavItem | null = null;
  for (const item of NAV_ITEMS) {
    if (!item.hash) continue;
    if (item.hash === '#/') {
      if (normalized === '#/') best = item;
      continue;
    }
    if (normalized === item.hash || normalized.startsWith(`${item.hash}?`)) {
      if (!best || (best.hash ?? '').length < item.hash.length) best = item;
    }
  }
  return best ? best.id : null;
}

/** The main group holding the active place, so the shell can keep it unfolded. */
export function sectionOfNavId(id: string | null): string | null {
  if (id === null) return null;
  const variantParent = MORE_ITEMS.find((item) => item.id === id)?.variantOf;
  const target = variantParent ?? id;
  for (const section of [...NAV_SECTIONS, ...MORE_SECTIONS]) {
    if (section.items.some((item) => item.id === target)) return section.id;
  }
  return null;
}

/** Event the shell fires to open the one global Search (App owns the overlay). */
export const OPEN_SEARCH_EVENT = 'genesis:open-search';

export function requestOpenSearch(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(OPEN_SEARCH_EVENT));
}
