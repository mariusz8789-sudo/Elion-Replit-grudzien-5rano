import type { ProjectSpatialDataset } from './client';

export interface ActiveSpatialOverlay {
  projectId: string;
  datasetId: string;
  label: string;
  /** Acknowledged scenario mapping: bbox fills the synthetic world, not a geodetic calibration. */
  calibration: 'SCENARIO_BBOX_TO_WORLD';
}

const STORAGE_KEY = 'genesis.active-spatial-overlay.v1';
let active: ActiveSpatialOverlay | null = null;
const listeners = new Set<(overlay: ActiveSpatialOverlay | null) => void>();

function readStored(): ActiveSpatialOverlay | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.projectId !== 'string' || typeof parsed.datasetId !== 'string' || typeof parsed.label !== 'string' || parsed.calibration !== 'SCENARIO_BBOX_TO_WORLD') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getActiveSpatialOverlay(): ActiveSpatialOverlay | null {
  active ??= readStored();
  return active;
}

export function setActiveSpatialOverlay(dataset: Pick<ProjectSpatialDataset, 'projectId' | 'id' | 'label'> | null): void {
  active = dataset
    ? { projectId: dataset.projectId, datasetId: dataset.id, label: dataset.label, calibration: 'SCENARIO_BBOX_TO_WORLD' }
    : null;
  try {
    if (active) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(active));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Persistence is an optional convenience only; the in-memory selection remains valid.
  }
  for (const listener of listeners) listener(active);
}

export function subscribeActiveSpatialOverlay(listener: (overlay: ActiveSpatialOverlay | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
