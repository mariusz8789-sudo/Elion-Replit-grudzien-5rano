import type { Project } from './client';

/**
 * Jawnie wybrany projekt jest wyłącznie kontekstem uprawnień dla source-bound
 * retrieval. Nie przechowuje dokumentów, nie indeksuje tekstu i nie zastępuje
 * backendowego Knowledge Registry.
 */
export interface ActiveKnowledgeProject {
  id: string;
  name: string;
}

const STORAGE_KEY = 'genesis.active-research-project.v1';

function loadPersistedProject(): ActiveKnowledgeProject | null {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ActiveKnowledgeProject>;
    return typeof parsed.id === 'string' && typeof parsed.name === 'string' ? { id: parsed.id, name: parsed.name } : null;
  } catch {
    return null;
  }
}

let active: ActiveKnowledgeProject | null = loadPersistedProject();
const listeners = new Set<(project: ActiveKnowledgeProject | null) => void>();

export function setActiveKnowledgeProject(project: Pick<Project, 'id' | 'name'> | null): void {
  active = project ? { id: project.id, name: project.name } : null;
  try {
    if (typeof window !== 'undefined') {
      if (active) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
      else window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // A denied storage write must not break the in-memory research context.
  }
  for (const listener of listeners) listener(active);
}

export function getActiveKnowledgeProject(): ActiveKnowledgeProject | null {
  return active;
}

export function subscribeActiveKnowledgeProject(listener: (project: ActiveKnowledgeProject | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
