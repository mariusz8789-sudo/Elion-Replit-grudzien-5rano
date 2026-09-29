/**
 * GENESIS NAVIGATION — the single navigation model for the whole product.
 *
 * Genesis had ~35 hash routes and no global menu, so every screen was reached
 * from a different place and the app read as a pile of separate tools. This
 * module is the one list of where you can go, grouped the way the system
 * actually works, and `AppShell` is the only thing that renders it.
 *
 * HONESTY RULES:
 *   - Every `hash` here is a route that really resolves in `App.tsx`'s
 *     `parseRoute`. A menu entry that navigates nowhere is a lie about the
 *     product, so there are none.
 *   - `status: 'planned'` marks a capability whose CORE EXISTS AND RUNS but
 *     whose workspace is not built yet. It renders visibly disabled with the
 *     reason, rather than being hidden (which would understate the system) or
 *     linked (which would overstate it). Cyber used to be that case — 941
 *     lines of reasoning kernel with no screen — and stopped being it once
 *     `CyberWorkspace` shipped, so its entry became a real link. Sovereign is
 *     the remaining one.
 *   - `kind: 'chat'` is an action, not a route — it opens the ONE globally
 *     mounted ScienceChat through `scienceChatBridge`.
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
  /** Shown in the mobile bottom bar (with Ask and Menu). */
  readonly primary?: true;
  /** One-word label for the mobile bottom bar. */
  readonly shortLabel?: string;
  /** One plain-language line under the label — what a first-time visitor finds there. */
  readonly description?: string;
  /** An alternative screen of the capability with this id: listed folded under it, never at top level. */
  readonly variantOf?: string;
}

export interface NavSection {
  readonly id: string;
  readonly label: string;
  readonly items: readonly NavItem[];
}

/**
 * The eight places a reviewer comes to Genesis for, in the order the owner set:
 * the dashboard, the proofs (drug discovery, Human Explorer, the
 * Reviewer Room, Evidence & Replay), the Laboratory, the real CERN data and
 * the Research Console. The menu is navigation only, so Ask (ASK_ITEM) is not in
 * it. Everything else is under one "Więcej · Scientific OS" disclosure (MORE_ITEMS), grouped and folded so it never becomes a wall.
 */
export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: 'main',
    label: '',
    items: [
      { id: 'home', label: 'Dashboard', shortLabel: 'Home', icon: '◉', hash: '#/', primary: true, description: 'Przegląd: obszary, ostatnie badania, dowody i silniki' },
      { id: 'science', label: 'Drug Discovery', icon: '💊', hash: '#/drug', description: 'Docking, retrosynteza, Evidence i Replay' },
      { id: 'human-biology-lab', label: 'Human Explorer', icon: '🧍', hash: '#/human-biology-lab', description: 'Atlas człowieka: skóra, szkielet, narządy, mózg, komórka' },
      { id: 'reviewer', label: 'Reviewer Room', icon: '🔎', hash: '#/reviewer', description: 'Sprawdź dowody i podpis CSRN' },
      { id: 'evidence', label: 'Evidence & Replay', icon: '📋', hash: '#/evidence', description: 'Pochodzenie wyników i powtórzenie' },
      { id: 'scientific-worlds', label: 'Laboratory', shortLabel: 'Lab', icon: '⌬', hash: '#/scientific-worlds', primary: true, description: 'Jedna przestrzeń dla eksperymentów Genesis' },
      { id: 'cms-open-data', label: 'CERN / CMS', icon: '⚛', hash: '#/physics/cms-z', description: 'Prawdziwe zdarzenia CMS Z→μμ; analiza offline, nie aktywny LHC' },
      { id: 'discover', label: 'Research Console', icon: '◎', hash: '#/research-console', description: 'Kandydaci, dowody, falsyfikacja i Winner Gate' },
    ],
  },
];

/**
 * WIĘCEJ · SCIENTIFIC OS — every module beyond the main list.
 *
 * Genesis grew several screens for the same capability (eight drug-discovery
 * workspaces, three Matrix views, three CERN views, three evidence screens…).
 * The research mode shows ONE entry per capability; the alternative screens of
 * that same capability are its `variantOf` entries, folded under it. Nothing
 * was deleted: every former route is still an entry here and still resolves.
 */
export const MORE_ITEMS: readonly NavItem[] = [
  // — Odkrywanie leków —
  { id: 'campaign', label: 'Zaawansowana kampania naukowa', icon: '⚡', hash: '#/campaign', description: 'Techniczny widok kandydatów, planów, Evidence i replay' },
  { id: 'gov-campaign', label: 'Government Drug Discovery — demo dla sektora publicznego', icon: '🏛', hash: '#/gov-campaign', variantOf: 'campaign', description: 'Pełna kampania na realnej puli kandydatów: screening, falsyfikacja, bramka bezpieczeństwa, werdykt' },
  { id: 'cde', label: 'Silnik odkryć (CDE)', icon: '🧭', hash: '#/cde', variantOf: 'campaign' },
  { id: 'pilot', label: 'Pilot eksperymentu', icon: '🧪', hash: '#/pilot', variantOf: 'campaign' },
  { id: 'dossier', label: 'Candidate Dossier', icon: '🗂', hash: '#/dossier', variantOf: 'campaign' },
  { id: 'precision', label: 'Precision Reference', icon: '🔬', hash: '#/molecular-reference-analysis', variantOf: 'campaign' },
  // — Chemia —
  { id: 'chemistry', label: 'Chemia — stanowisko miareczkowania', icon: '⚗', hash: '#/scientific-worlds?station=st-titration', description: 'Kanoniczny bilans ładunku w głównym Laboratorium' },
  { id: 'chemistry-classic', label: 'Chemia — laboratorium klasyczne', icon: '⚗', hash: '#/lab/chemistry', variantOf: 'chemistry' },
  { id: 'molecule', label: 'Molecule Lab', icon: '🧪', hash: '#/molecule', variantOf: 'chemistry' },
  // — Fizyka —
  { id: 'physics', label: 'Fizyka — światło w zakrzywionej czasoprzestrzeni', icon: '🕳', hash: '#/scientific-worlds?station=st-window', description: 'Okno obserwacyjne głównego Laboratorium: opóźnienie Shapiro i ugięcie w słabym polu (MODEL)' },
  { id: 'black-hole', label: 'Czarna dziura — Schwarzschild', icon: '🕳', hash: '#/lab/einstein', description: 'Promień horyzontu i geodezyjne zerowe (RK4) — osobny model od okna obserwacyjnego' },
  { id: 'geodesics', label: 'Fotony wokół czarnej dziury', icon: '🕳', hash: '#/geodesics', variantOf: 'black-hole' },
  { id: 'universe', label: 'Wszechświat — problem trzech ciał', icon: '🪐', hash: '#/lab/universe', description: 'Deterministyczny integrator trzech ciał' },
  // CERN was folded under CMS Open Data as if it were another view of it. It is not: CMS Open Data is
  // an offline analysis of a checksummed event file, the complex is a walk-through world with its own
  // rooms and its own live execution state. Folding the flagship world under a data screen made it
  // read as absent, so it stands as its own capability with the detector chamber folded under it.
  { id: 'cern-complex', label: 'Kompleks CERN', icon: '◉', hash: '#/cern-complex', description: 'Przejście przez halę, tunel i komorę detektora — model zderzeń, oddzielnie od danych CMS' },
  { id: 'collider', label: 'CERN — komora detektora', icon: '⚛', hash: '#/cern-complex?room=detector', variantOf: 'cern-complex' },
  { id: 'lab-fpv', label: 'Quantum Lab FPV', icon: '🧪', hash: '#/lab-fpv' },
  { id: 'entanglement', label: 'Miary splątania', icon: '🔗', hash: '#/entanglement', variantOf: 'lab-fpv' },
  { id: 'myths-theories', label: 'Mity i Teorie', icon: '⚗', hash: '#/myths-theories', description: 'Spekulatywne modele spacetime — jawny sandbox' },
  // — Człowiek i biologia —
  { id: 'virtual-bio', label: 'Virtual Lab — biologia', icon: '🧫', hash: '#/virtual-bio', description: 'Bezpieczne modele in-silico (komórka, PBPK, receptor, AMR) z uczciwym FAILED_CLOSED' },
  { id: 'cell-lab', label: 'Virtual Cell Lab', icon: '🧫', hash: '#/cell-lab', variantOf: 'virtual-bio' },
  // — Dowody i pamięć —
  { id: 'memory', label: 'Dowody i pamięć', icon: '▣', hash: '#/memory', description: 'Przebiegi, pochodzenie i replay' },
  { id: 'discovery-log', label: 'Dziennik odkryć', icon: '🏆', hash: '#/discovery-log', variantOf: 'memory' },
  { id: 'knowledge-sources', label: 'Wiedza i źródła publiczne', icon: '📚', hash: '#/knowledge-sources', variantOf: 'memory', description: 'Propozycje z /ingest — publikuj lub odrzuć jako zalogowany człowiek' },
  // — Światy i symulacje —
  { id: 'worlds', label: 'Wizualizacje i światy', icon: '◈', hash: '#/worlds', description: 'Laboratoria i symulacje przestrzenne Genesis' },
  { id: 'world', label: 'World Engine', icon: '🌍', hash: '#/genesis-world', variantOf: 'worlds' },
  { id: 'simulation', label: 'Generator symulacji', icon: '🔭', hash: '#/generate', variantOf: 'worlds' },
  { id: 'world-director', label: 'World Director', icon: '◉', hash: '#/world-director', variantOf: 'worlds', description: 'Presety świata przez canonical WorldGraph i THREE.js' },
  { id: 'world-proposal', label: 'Zaproponuj świat', icon: '🧩', hash: '#/world-proposal', variantOf: 'worlds' },
  { id: 'city3d', label: 'Miasto 3D (WebGL)', icon: '🏙', hash: '#/city3d', variantOf: 'worlds' },
  { id: 'scientific-city', label: 'Scientific City', icon: '🏗', hash: '#/scientific-city', variantOf: 'worlds' },
  { id: 'first-person-lab', label: 'Laboratorium 1. osoby', icon: '🔬', hash: '#/first-person-lab', variantOf: 'worlds' },
  { id: 'looking-glass', label: 'Looking Glass', icon: '🔭', hash: '#/looking-glass', variantOf: 'worlds' },
  { id: 'timeline', label: 'Discovery Timeline', icon: '🌌', hash: '#/timeline', variantOf: 'worlds' },
  { id: 'mirror', label: 'Genesis Mirror — eksperymentalny', icon: '◐', hash: '#/mirror', variantOf: 'worlds', description: 'Syntetyczny szkielet MirrorTwin bez kamery' },
  { id: 'matrix', label: 'Matrix — HUD', icon: '◈', hash: '#/matrix', variantOf: 'worlds' },
  { id: 'matrix-map', label: 'Matrix — mapa systemu', icon: '◈', hash: '#/matrix-map', variantOf: 'worlds' },
  { id: 'whatif', label: 'Co by było, gdyby?', icon: '🌀', hash: '#/what-if' },
  { id: 'decision-explorer', label: 'Decision Explorer', icon: '🌠', hash: '#/decision-explorer', variantOf: 'whatif' },
  { id: 'conflict', label: 'Konflikt modeli', icon: '⚖', hash: '#/conflict', variantOf: 'whatif' },
  // — Nauka i eksploracja —
  { id: 'inquiry', label: 'Autonomiczne dochodzenie', icon: '🔬', hash: '#/inquiry' },
  { id: 'calibration', label: 'Ile trwa okres zakaźności?', icon: '🔎', hash: '#/calibration', variantOf: 'inquiry' },
  { id: 'dome-world', label: 'Kopuła vs kula', icon: '🌍', hash: '#/dome-world' },
  { id: 'protection-priority', label: 'Kogo chronić najpierw?', icon: '🛡', hash: '#/protection-priority' },
  { id: 'decipherment', label: 'Deszyfracja', icon: '📜', hash: '#/decipherment' },
  { id: 'glossary', label: 'Słowniczek', icon: '📚', hash: '#/glossary' },
  // — Administracja i bezpieczeństwo —
  { id: 'cyber', label: 'Cyber', icon: '🛡', hash: '#/cyber', description: 'Jądro rozumowania o incydentach: hipotezy, dowody i łańcuch custody, bez oskarżeń' },
  { id: 'clockwork', label: 'CLOCKWORK — terminy urzędu', icon: '⏱', hash: '#/clockwork', description: 'Terminy ustawowe spraw urzędu, liczone deterministycznie' },
  {
    id: 'sovereign', label: 'Sovereign', icon: '🏛', status: 'planned',
    plannedNote: 'Profil instytucjonalny (skala miasta/energii/wody/transportu) — nie istnieje jeszcze ani jako route, ani jako model uprawnień. Wymieniony, żeby nie udawać, że go pomijamy.',
  },
  // — System —
  { id: 'investor-demo', label: 'Prowadzone demo', icon: '▶', hash: '#/investor-demo', description: 'Eksperyment, wynik i dowód w jednym przebiegu' },
  { id: 'tour', label: 'Genesis Tour — przewodnik głosowy', icon: '▶', hash: '#/tour', variantOf: 'investor-demo' },
  { id: 'meta-cognition', label: 'Meta‑Cognition / Self‑Audit', icon: '◇', hash: '#/meta-cognition', description: 'Status wiedzy, luki, sprzeczności i capabilities' },
  { id: 'projects', label: 'Projekty (chmura)', icon: '☁', hash: '#/projects' },
  { id: 'account', label: 'Konto — zaloguj się lub załóż konto', icon: '👤', hash: '#/konto', description: 'Logowanie, rejestracja i profil konta (uczeń, student, nauczyciel, badacz, instytucja)' },
  { id: 'settings', label: 'Ustawienia', icon: '⚙', hash: '#/settings', description: 'Konto, projekty, tryb badawczy' },
];

/** The research-mode label, shared by the desktop sidebar and the mobile sheet. */
export const RESEARCH_MODE_LABEL = 'More · Scientific OS';

/**
 * The first entry of the More disclosure: the whole catalogue on one page
 * (`#/more`), every capability with its audit status.
 */
export const MORE_OVERVIEW_ITEM: NavItem = { id: 'scientific-os', label: 'All capabilities', icon: '▦', hash: '#/more', description: 'Wszystko w 7 grupach, ze statusem z audytu' };

/**
 * One entry per capability, in the owner's groups (29 Sep 2026, same as
 * `core/scientificOs/catalogue.ts`); `variantOf` entries fold under their capability.
 */
const GROUPS: readonly { id: string; label: string; ids: readonly string[] }[] = [
  { id: 'more-ls', label: 'Life Sciences', ids: ['campaign', 'chemistry', 'virtual-bio'] },
  { id: 'more-evidence', label: 'Evidence & Verification', ids: ['memory', 'meta-cognition'] },
  { id: 'more-public', label: 'Government & Public Sector', ids: ['clockwork', 'protection-priority', 'cyber', 'sovereign'] },
  { id: 'more-physics', label: 'Physics, Quantum & CERN', ids: ['physics', 'black-hole', 'universe', 'cern-complex', 'lab-fpv'] },
  { id: 'more-worlds', label: 'World & Digital Twin', ids: ['worlds', 'whatif'] },
  { id: 'more-learning', label: 'Education', ids: ['investor-demo', 'inquiry', 'dome-world', 'glossary'] },
  { id: 'more-system', label: 'Platform', ids: ['account', 'projects', 'settings'] },
  { id: 'more-showcase', label: 'Showcases (experiments)', ids: ['myths-theories', 'decipherment'] },
];

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

/** Flat view, for lookups and for the mobile primary bar. */
export const NAV_ITEMS: readonly NavItem[] = [...NAV_SECTIONS.flatMap((section) => section.items), MORE_OVERVIEW_ITEM, ...MORE_ITEMS];

/**
 * ASK — the one command input. It is an action, not a destination, so it is
 * not in the menu (the menu is navigation only); it sits in the mobile bottom
 * bar between Home and Lab and opens the one global ScienceChat.
 */
export const ASK_ITEM: NavItem = { id: 'chat', label: 'Ask', icon: '✦', kind: 'chat', description: 'Opisz zadanie badawcze; Genesis kieruje je do modelu, silnika albo zweryfikowanego ekranu' };

/** Mobile bottom bar, left to right: Home, Ask, Lab (AppShell adds Menu). */
export const PRIMARY_NAV_ITEMS: readonly NavItem[] = (() => {
  const [home, ...rest] = NAV_ITEMS.filter((item) => item.primary);
  return home ? [home, ASK_ITEM, ...rest] : [ASK_ITEM, ...rest];
})();

/**
 * Which nav item the current hash corresponds to, or null when the route has
 * no menu entry (deep links like `#/lab/:id`, `#/investor-demo`, `#/discovery-hall`, `#/hf-slice`
 * are reachable and intentionally not in the menu). Longest match wins so
 * `#/timeline?mode=place` still highlights Discovery Timeline.
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
