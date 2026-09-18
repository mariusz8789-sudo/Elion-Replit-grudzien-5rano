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
}

export interface NavSection {
  readonly id: string;
  readonly label: string;
  readonly items: readonly NavItem[];
}

/**
 * THE MENU IS SIX ENTRIES, in a layperson's words (D-118).
 *
 * The previous ten were the system's own vocabulary ("Matrix", "Cyber",
 * "Simulation") — an inventory that asked the visitor to already know
 * Genesis before moving. These six name what a person wants to DO: start,
 * ask, see discoveries, enter the 3D worlds, check the evidence, adjust
 * settings. Every former entry is still reachable — the ones that left the
 * top level moved into `MORE_ITEMS` behind one disclosure. Nothing was
 * deleted; it stopped being shouted.
 */
export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: 'main',
    label: '',
    items: [
      { id: 'home', label: 'Start', icon: '◉', hash: '#/', primary: true, description: 'Pytanie, ostatnie odkrycia, wejścia do światów' },
      { id: 'chat', label: 'Zapytaj', icon: '✦', kind: 'chat', primary: true, description: 'Zadaj pytanie zwykłym językiem' },
      { id: 'discover', label: 'Odkrycia', icon: '◎', hash: '#/research-console', primary: true, description: 'Kandydaci, dowody, falsyfikacja, Winner Gate' },
      { id: 'worlds', label: 'Światy 3D', icon: '◈', hash: '#/worlds', primary: true, description: 'Miasto, laboratorium, molekuła, Discovery Hall' },
      { id: 'memory', label: 'Dowody i pamięć', icon: '▣', hash: '#/memory', primary: true, description: 'Zapisane przebiegi, evidence, replay' },
      { id: 'settings', label: 'Ustawienia', icon: '⚙', hash: '#/settings', description: 'Konto, projekty, tryb badawczy' },
    ],
  },
];

/**
 * Everything the menu no longer shouts. Reachable behind one disclosure, so
 * no capability was lost — it stopped competing with the ten that matter.
 */
export const MORE_ITEMS: readonly NavItem[] = [
  { id: 'tour', label: 'Genesis Tour — przewodnik głosowy', icon: '▶', hash: '#/tour' },
  { id: 'matrix', label: 'Matrix — HUD', icon: '◈', hash: '#/matrix' },
  { id: 'matrix-stage', label: 'Matrix — scena 3D', icon: '◈', hash: '#/matrix-stage' },
  { id: 'matrix-map', label: 'Matrix — mapa systemu', icon: '◈', hash: '#/matrix-map' },
  { id: 'world', label: 'World Engine', icon: '🌍', hash: '#/genesis-world' },
  { id: 'simulation', label: 'Generator symulacji', icon: '🔭', hash: '#/generate' },
  { id: 'science', label: 'Drug Discovery', icon: '🧬', hash: '#/drug' },
  { id: 'cyber', label: 'Cyber', icon: '🛡', hash: '#/cyber' },
  { id: 'clockwork', label: 'CLOCKWORK — terminy urzędu', icon: '⏱', hash: '#/clockwork' },
  { id: 'collider', label: 'Collider — komora detektora', icon: '⚛', hash: '#/collider' },
  { id: 'lab-fpv', label: 'Quantum Lab FPV', icon: '🧪', hash: '#/lab-fpv' },
  { id: 'cern-complex', label: 'Kompleks CERN — 5D', icon: '◉', hash: '#/cern-complex' },
  { id: 'projects', label: 'Projekty (chmura)', icon: '☁', hash: '#/projects' },
  {
    id: 'sovereign', label: 'Sovereign', icon: '🏛', status: 'planned',
    plannedNote: 'Profil instytucjonalny (skala miasta/energii/wody/transportu) — nie istnieje jeszcze ani jako route, ani jako model uprawnień. Wymieniony, żeby nie udawać, że go pomijamy.',
  },
  { id: 'evidence', label: 'Evidence i Replay', icon: '📋', hash: '#/evidence' },
  { id: 'discovery-log', label: 'Dziennik odkryć', icon: '🏆', hash: '#/discovery-log' },
  { id: 'dossier', label: 'Candidate Dossier', icon: '🗂', hash: '#/dossier' },
  { id: 'cde', label: 'Silnik odkryć (CDE)', icon: '🧭', hash: '#/cde' },
  { id: 'campaign', label: 'Kampania naukowa', icon: '⚡', hash: '#/campaign' },
  { id: 'pilot', label: 'Pilot eksperymentu', icon: '🧪', hash: '#/pilot' },
  { id: 'precision', label: 'Precision Reference', icon: '🔬', hash: '#/molecular-reference-analysis' },
  { id: 'conflict', label: 'Konflikt modeli', icon: '⚖', hash: '#/conflict' },
  { id: 'whatif', label: 'Co by było, gdyby?', icon: '🌀', hash: '#/what-if' },
  { id: 'decision-explorer', label: 'Decision Explorer', icon: '🌠', hash: '#/decision-explorer' },
  { id: 'city3d', label: 'Miasto 3D (WebGL)', icon: '🏙', hash: '#/city3d' },
  { id: 'scientific-city', label: 'Scientific City', icon: '🏗', hash: '#/scientific-city' },
  { id: 'first-person-lab', label: 'Laboratorium 1. osoby', icon: '🔬', hash: '#/first-person-lab' },
  { id: 'molecule', label: 'Molecule Lab', icon: '🧪', hash: '#/molecule' },
  { id: 'cell-lab', label: 'Virtual Cell Lab', icon: '🧫', hash: '#/cell-lab' },
  { id: 'looking-glass', label: 'Looking Glass', icon: '🔭', hash: '#/looking-glass' },
  { id: 'myths-theories', label: 'Mity i Teorie', icon: '⚗', hash: '#/myths-theories', description: 'Spekulatywne modele spacetime — jawny sandbox' },
  { id: 'timeline', label: 'Discovery Timeline', icon: '🌌', hash: '#/timeline' },
  { id: 'decipherment', label: 'Deszyfracja', icon: '📜', hash: '#/decipherment' },
  { id: 'glossary', label: 'Słowniczek', icon: '📚', hash: '#/glossary' },
  { id: 'dome-world', label: 'Kopuła vs kula', icon: '🌍', hash: '#/dome-world' },
  { id: 'protection-priority', label: 'Kogo chronić najpierw?', icon: '🛡', hash: '#/protection-priority' },
  { id: 'geodesics', label: 'Fotony wokół czarnej dziury', icon: '🕳', hash: '#/geodesics' },
  { id: 'world-proposal', label: 'Zaproponuj świat', icon: '🧩', hash: '#/world-proposal' },
  { id: 'calibration', label: 'Ile trwa okres zakaźności?', icon: '🔎', hash: '#/calibration' },
  { id: 'inquiry', label: 'Autonomiczne dochodzenie', icon: '🔬', hash: '#/inquiry' },
  { id: 'entanglement', label: 'Miary splątania', icon: '🔗', hash: '#/entanglement' },
];

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
