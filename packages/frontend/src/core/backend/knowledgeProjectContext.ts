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

let active: ActiveKnowledgeProject | null = null;
const listeners = new Set<(project: ActiveKnowledgeProject | null) => void>();

export function setActiveKnowledgeProject(project: Pick<Project, 'id' | 'name'> | null): void {
  active = project ? { id: project.id, name: project.name } : null;
  for (const listener of listeners) listener(active);
}

export function getActiveKnowledgeProject(): ActiveKnowledgeProject | null {
  return active;
}

export function subscribeActiveKnowledgeProject(listener: (project: ActiveKnowledgeProject | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
