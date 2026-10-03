import type { ExploreState } from './anatomyExplore';

/**
 * Notes and saved views of the anatomy explorer: kept in this browser only (nothing is sent anywhere).
 * Storage can be missing or blocked (private window); then the explorer simply works without them.
 */

export interface SavedView {
  readonly id: string;
  readonly title: string;
  readonly savedAt: string;
  readonly explore: ExploreState;
  readonly onlySystem: string | null;
  readonly peeled: readonly string[];
}

const NOTES_KEY = 'genesis.anatomy.notes.v1';
const VIEWS_KEY = 'genesis.anatomy.views.v1';
const MAX_VIEWS = 12;

function read<T>(key: string, fallback: T): T {
  try { const raw = globalThis.localStorage?.getItem(key); return raw ? JSON.parse(raw) as T : fallback; } catch { return fallback; }
}
function write(key: string, value: unknown): boolean {
  try { globalThis.localStorage?.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

/** Where a note belongs: the structure, else the organ, else the region, else the whole body. */
export function notePlace(state: ExploreState): string {
  if (state.structure) return `s:${state.system ?? state.organId ?? ''}:${state.structure}`;
  if (state.organId) return `o:${state.organId}`;
  return state.regionId ? `r:${state.regionId}` : 'body';
}

export function readNote(place: string): string { return read<Record<string, string>>(NOTES_KEY, {})[place] ?? ''; }

export function writeNote(place: string, text: string): boolean {
  const notes = read<Record<string, string>>(NOTES_KEY, {});
  if (text.trim()) notes[place] = text.trim(); else delete notes[place];
  return write(NOTES_KEY, notes);
}

export function readViews(): SavedView[] {
  const views = read<unknown>(VIEWS_KEY, []);
  return Array.isArray(views) ? views.filter((v): v is SavedView => typeof v === 'object' && v !== null && typeof (v as SavedView).id === 'string' && typeof (v as SavedView).explore === 'object') : [];
}

export function saveView(view: Omit<SavedView, 'id' | 'savedAt'>, now = new Date()): SavedView[] {
  const next: SavedView = { ...view, id: `${now.getTime()}`, savedAt: now.toISOString() };
  const views = [next, ...readViews()].slice(0, MAX_VIEWS);
  write(VIEWS_KEY, views);
  return views;
}

export function deleteView(id: string): SavedView[] {
  const views = readViews().filter((v) => v.id !== id);
  write(VIEWS_KEY, views);
  return views;
}
