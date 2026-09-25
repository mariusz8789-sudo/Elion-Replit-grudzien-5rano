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
  /** Shown in the mobile primary bar. Exactly five items carry this. */
  readonly primary?: true;
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
 * The primary product has one conversation and one Laboratory. Genesis is
 * the home entry; every specialist screen remains in the research mode
 * (MORE_ITEMS) behind one disclosure.
 *
 * The previous inventory asked the visitor to understand Genesis before
 * using it. Every former entry remains reachable in `MORE_ITEMS`; it simply
 * stopped competing with the connected journey.
 */
export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: 'main',
    label: '',
    items: [
      { id: 'home', label: 'Genesis', icon: '◉', hash: '#/', primary: true, description: 'Jedno pytanie rozpoczyna badanie' },
      { id: 'chat', label: 'Zapytaj', icon: '✦', kind: 'chat', primary: true, description: 'Jeden dialog prowadzący całe badanie' },
      { id: 'scientific-worlds', label: 'Laboratorium', icon: '⌬', hash: '#/scientific-worlds', primary: true, description: 'Jedna przestrzeń dla eksperymentów Genesis' },
    ],
  },
];

/**
 * TRYB BADAWCZY — everything beyond the one conversation and the one Laboratory.
 *
 * Genesis grew several screens for the same capability (eight drug-discovery
 * workspaces, three Matrix views, three CERN views, three evidence screens…).
 * The research mode shows ONE entry per capability; the alternative screens of
 * that same capability are its `variantOf` entries, folded under it. Nothing
 * was deleted: every former route is still an entry here and still resolves.
 */
export const MORE_ITEMS: readonly NavItem[] = [
  // — Odkrywanie leków —
  { id: 'science', label: 'Odkrywanie leków', icon: '🧬', hash: '#/drug', description: 'Kandydaci ze źródeł, porównanie RDKit, Evidence i replay' },
  { id: 'discover', label: 'Konsola odkryć', icon: '◎', hash: '#/research-console', variantOf: 'science', description: 'Kandydaci, dowody, falsyfikacja i Winner Gate' },
  { id: 'campaign', label: 'Zaawansowana kampania naukowa', icon: '⚡', hash: '#/campaign', variantOf: 'science', description: 'Techniczny widok kandydatów, planów, Evidence i replay' },
  { id: 'gov-campaign', label: 'Government Drug Discovery — demo dla sektora publicznego', icon: '🏛', hash: '#/gov-campaign', variantOf: 'science', description: 'Pełna kampania na realnej puli kandydatów: screening, falsyfikacja, bramka bezpieczeństwa, werdykt' },
  { id: 'cde', label: 'Silnik odkryć (CDE)', icon: '🧭', hash: '#/cde', variantOf: 'science' },
  { id: 'pilot', label: 'Pilot eksperymentu', icon: '🧪', hash: '#/pilot', variantOf: 'science' },
  { id: 'dossier', label: 'Candidate Dossier', icon: '🗂', hash: '#/dossier', variantOf: 'science' },
  { id: 'precision', label: 'Precision Reference', icon: '🔬', hash: '#/molecular-reference-analysis', variantOf: 'science' },
  // — Chemia —
  { id: 'chemistry', label: 'Chemia — stanowisko miareczkowania', icon: '⚗', hash: '#/scientific-worlds?station=st-titration', description: 'Kanoniczny bilans ładunku w głównym Laboratorium' },
  { id: 'chemistry-classic', label: 'Chemia — laboratorium klasyczne', icon: '⚗', hash: '#/lab/chemistry', variantOf: 'chemistry' },
  { id: 'molecule', label: 'Molecule Lab', icon: '🧪', hash: '#/molecule', variantOf: 'chemistry' },
  // — Fizyka —
  { id: 'physics', label: 'Fizyka — światło w zakrzywionej czasoprzestrzeni', icon: '🕳', hash: '#/scientific-worlds?station=st-window', description: 'Okno obserwacyjne głównego Laboratorium: opóźnienie Shapiro i ugięcie w słabym polu (MODEL)' },
  { id: 'black-hole', label: 'Czarna dziura — Schwarzschild', icon: '🕳', hash: '#/lab/einstein', description: 'Promień horyzontu i geodezyjne zerowe (RK4) — osobny model od okna obserwacyjnego' },
  { id: 'geodesics', label: 'Fotony wokół czarnej dziury', icon: '🕳', hash: '#/geodesics', variantOf: 'black-hole' },
  { id: 'universe', label: 'Wszechświat — problem trzech ciał', icon: '🪐', hash: '#/lab/universe', description: 'Deterministyczny integrator trzech ciał' },
  { id: 'cms-open-data', label: 'CMS Open Data — prawdziwe dane CERN', icon: '📊', hash: '#/physics/cms-z', description: 'Checksumowo zweryfikowane 10 000 zdarzeń Z→μμ z CERN Open Data; analiza offline, nie aktywny LHC' },
  { id: 'cern-complex', label: 'Kompleks CERN — 5D', icon: '◉', hash: '#/cern-complex', variantOf: 'cms-open-data' },
  { id: 'collider', label: 'Kompleks CERN — komora detektora', icon: '⚛', hash: '#/cern-complex?room=detector', variantOf: 'cms-open-data' },
  { id: 'lab-fpv', label: 'Quantum Lab FPV', icon: '🧪', hash: '#/lab-fpv' },
  { id: 'entanglement', label: 'Miary splątania', icon: '🔗', hash: '#/entanglement', variantOf: 'lab-fpv' },
  { id: 'myths-theories', label: 'Mity i Teorie', icon: '⚗', hash: '#/myths-theories', description: 'Spekulatywne modele spacetime — jawny sandbox' },
  // — Człowiek i biologia —
  { id: 'human-biology-lab', label: 'Człowiek — eksploracja', icon: '◎', hash: '#/human-biology-lab', description: 'Opcjonalna eksploracja ciała od narządu do komórki' },
  { id: 'virtual-bio', label: 'Virtual Lab — biologia', icon: '🧫', hash: '#/virtual-bio', variantOf: 'human-biology-lab', description: 'Bezpieczne modele in-silico (komórka, PBPK, receptor, AMR) z uczciwym FAILED_CLOSED' },
  { id: 'cell-lab', label: 'Virtual Cell Lab', icon: '🧫', hash: '#/cell-lab', variantOf: 'human-biology-lab' },
  // — Dowody i pamięć —
  { id: 'memory', label: 'Dowody i pamięć', icon: '▣', hash: '#/memory', description: 'Przebiegi, pochodzenie i replay' },
  { id: 'evidence', label: 'Evidence i Replay', icon: '📋', hash: '#/evidence', variantOf: 'memory' },
  { id: 'discovery-log', label: 'Dziennik odkryć', icon: '🏆', hash: '#/discovery-log', variantOf: 'memory' },
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
  { id: 'cyber', label: 'Cyber', icon: '🛡', hash: '#/cyber' },
  { id: 'clockwork', label: 'CLOCKWORK — terminy urzędu', icon: '⏱', hash: '#/clockwork' },
  {
    id: 'sovereign', label: 'Sovereign', icon: '🏛', status: 'planned',
    plannedNote: 'Profil instytucjonalny (skala miasta/energii/wody/transportu) — nie istnieje jeszcze ani jako route, ani jako model uprawnień. Wymieniony, żeby nie udawać, że go pomijamy.',
  },
  // — System —
  { id: 'investor-demo', label: 'Prowadzone demo', icon: '▶', hash: '#/investor-demo', description: 'Eksperyment, wynik i dowód w jednym przebiegu' },
  { id: 'tour', label: 'Genesis Tour — przewodnik głosowy', icon: '▶', hash: '#/tour', variantOf: 'investor-demo' },
  { id: 'meta-cognition', label: 'Meta‑Cognition / Self‑Audit', icon: '◇', hash: '#/meta-cognition', description: 'Status wiedzy, luki, sprzeczności i capabilities' },
  { id: 'projects', label: 'Projekty (chmura)', icon: '☁', hash: '#/projects' },
  { id: 'settings', label: 'Ustawienia', icon: '⚙', hash: '#/settings', description: 'Konto, projekty, tryb badawczy' },
];

/** The research-mode label, shared by the desktop sidebar and the mobile sheet. */
export const RESEARCH_MODE_LABEL = 'Tryb badawczy';

/** One entry per capability, in purpose groups; `variantOf` entries fold under their capability. */
const GROUPS: readonly { id: string; label: string; ids: readonly string[] }[] = [
  { id: 'more-drug', label: 'Odkrywanie leków', ids: ['science'] },
  { id: 'more-chemistry', label: 'Chemia', ids: ['chemistry'] },
  { id: 'more-physics', label: 'Fizyka', ids: ['physics', 'black-hole', 'universe', 'cms-open-data', 'lab-fpv', 'myths-theories'] },
  { id: 'more-human', label: 'Człowiek i biologia', ids: ['human-biology-lab'] },
  { id: 'more-evidence', label: 'Dowody i pamięć', ids: ['memory'] },
  { id: 'more-worlds', label: 'Światy i symulacje', ids: ['worlds', 'whatif'] },
  { id: 'more-learning', label: 'Nauka i eksploracja', ids: ['inquiry', 'dome-world', 'protection-priority', 'decipherment', 'glossary'] },
  { id: 'more-public', label: 'Administracja i bezpieczeństwo', ids: ['cyber', 'clockwork', 'sovereign'] },
  { id: 'more-system', label: 'System i projekty', ids: ['investor-demo', 'meta-cognition', 'projects', 'settings'] },
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
export const NAV_ITEMS: readonly NavItem[] = [...NAV_SECTIONS.flatMap((section) => section.items), ...MORE_ITEMS];

export const PRIMARY_NAV_ITEMS: readonly NavItem[] = NAV_ITEMS.filter((item) => item.primary);

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
