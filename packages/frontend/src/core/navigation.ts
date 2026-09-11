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
 *     linked (which would overstate it). Cyber is the live example: 941 lines
 *     of reasoning kernel, planner and investigation that today surface only
 *     as a record label in the Matrix.
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
}

export interface NavSection {
  readonly id: string;
  readonly label: string;
  readonly items: readonly NavItem[];
}

export const NAV_SECTIONS: readonly NavSection[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    items: [
      { id: 'home', label: 'Command Center', icon: '◉', hash: '#/', primary: true },
      { id: 'chat', label: 'Science Chat', icon: '✦', kind: 'chat', primary: true },
      { id: 'matrix', label: 'Matrix', icon: '◈', hash: '#/matrix', primary: true },
      { id: 'projects', label: 'Projekty', icon: '☁', hash: '#/projects' },
    ],
  },
  {
    id: 'create',
    label: 'Twórz',
    items: [
      { id: 'generate', label: 'Generator symulacji', icon: '🔭', hash: '#/generate', primary: true },
      { id: 'world', label: 'World Engine', icon: '🌍', hash: '#/genesis-world' },
      { id: 'whatif', label: 'Co by było, gdyby?', icon: '🌀', hash: '#/what-if' },
      { id: 'decision-explorer', label: 'Decision Explorer', icon: '🌠', hash: '#/decision-explorer' },
    ],
  },
  {
    id: 'science',
    label: 'Nauka',
    items: [
      { id: 'drug', label: 'Drug Discovery', icon: '💊', hash: '#/drug' },
      { id: 'cde', label: 'Silnik odkryć (CDE)', icon: '🧭', hash: '#/cde' },
      { id: 'campaign', label: 'Kampania naukowa', icon: '⚡', hash: '#/campaign' },
      { id: 'pilot', label: 'Pilot eksperymentu', icon: '🧪', hash: '#/pilot' },
      { id: 'precision', label: 'Precision Reference', icon: '🔬', hash: '#/molecular-reference-analysis' },
      { id: 'conflict', label: 'Konflikt modeli', icon: '⚖', hash: '#/conflict' },
    ],
  },
  {
    id: 'evidence',
    label: 'Evidence i pamięć',
    items: [
      { id: 'evidence', label: 'Evidence i Replay', icon: '📋', hash: '#/evidence' },
      { id: 'memory', label: 'Pamięć Naukowa', icon: '🧠', hash: '#/memory' },
      { id: 'discovery-log', label: 'Dziennik odkryć', icon: '🏆', hash: '#/discovery-log' },
      { id: 'dossier', label: 'Candidate Dossier', icon: '🗂', hash: '#/dossier' },
    ],
  },
  {
    id: 'world',
    label: 'Świat i symulacja',
    items: [
      { id: 'city3d', label: 'Miasto 3D (WebGL)', icon: '🏙', hash: '#/city3d', primary: true },
      { id: 'scientific-city', label: 'Scientific City', icon: '🏗', hash: '#/scientific-city' },
      { id: 'first-person-lab', label: 'Laboratorium 1. osoby', icon: '🔬', hash: '#/first-person-lab' },
      { id: 'molecule', label: 'Molecule Lab', icon: '🧪', hash: '#/molecule' },
      { id: 'cell-lab', label: 'Virtual Cell Lab', icon: '🧫', hash: '#/cell-lab' },
      { id: 'looking-glass', label: 'Looking Glass', icon: '🔭', hash: '#/looking-glass' },
      { id: 'timeline', label: 'Discovery Timeline', icon: '🌌', hash: '#/timeline' },
    ],
  },
  {
    id: 'systems',
    label: 'Systemy',
    items: [
      {
        id: 'cyber', label: 'Cyber', icon: '🛡', status: 'planned',
        plannedNote: 'Rdzeń działa (reasoning kernel, EIG test planner, investigation, evidence) — workspace jeszcze nie zbudowany. Przebiegi cyber są dziś widoczne w Matrix i Pamięci Naukowej.',
      },
      { id: 'glossary', label: 'Słowniczek', icon: '📚', hash: '#/glossary' },
      { id: 'settings', label: 'Ustawienia', icon: '⚙', hash: '#/settings' },
    ],
  },
];

/** Flat view, for lookups and for the mobile primary bar. */
export const NAV_ITEMS: readonly NavItem[] = NAV_SECTIONS.flatMap((section) => section.items);

export const PRIMARY_NAV_ITEMS: readonly NavItem[] = NAV_ITEMS.filter((item) => item.primary);

/**
 * Which nav item the current hash corresponds to, or null when the route has
 * no menu entry (deep links like `#/lab/:id`, `#/investor-demo`, `#/hf-slice`
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
