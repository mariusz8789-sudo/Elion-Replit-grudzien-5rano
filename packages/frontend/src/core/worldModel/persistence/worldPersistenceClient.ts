import type { WorldSnapshot } from './worldSnapshot';

/**
 * WORLD PERSISTENCE — BACKEND CLIENT (Genesis Scientific World Model 4.0,
 * Priority 1.1). Mirrors `narrator/askAI.ts`'s EXACT client pattern (the
 * same pattern `generation/llmWorldProposalAdapter.ts` already follows for
 * `/api/world-proposal`): relative URL, `content-type: application/json`,
 * a discriminated-union result so a caller never has to guess what failed,
 * every non-2xx status mapped to an honest, specific reason. This module
 * knows nothing about `WorldRegistry`'s in-memory bookkeeping or how a
 * `TemporalEngine` is serialized — `worldSnapshot.ts` already owns that;
 * this is purely the transport.
 */
export type WorldPersistenceResult<T> = { ok: true; data: T } | { ok: false; reason: 'not-found' | 'conflict' | 'unavailable' | 'invalid' | 'offline' | 'error'; message: string };

async function toResult<T>(res: Response, extract: (body: unknown) => T): Promise<WorldPersistenceResult<T>> {
  if (res.status === 404) return { ok: false, reason: 'not-found', message: 'Świat nie został znaleziony w trwałym magazynie.' };
  if (res.status === 409) return { ok: false, reason: 'conflict', message: 'Świat o tym identyfikatorze jest już zapisany.' };
  if (res.status === 503) return { ok: false, reason: 'unavailable', message: 'Trwały magazyn nie jest dostępny w tym wdrożeniu.' };
  if (res.status === 400) {
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    return { ok: false, reason: 'invalid', message: data?.message ?? 'Nieprawidłowe dane świata.' };
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    return { ok: false, reason: 'error', message: data?.message ?? 'Magazyn światów chwilowo niedostępny — spróbuj ponownie.' };
  }
  const body = (await res.json()) as unknown;
  return { ok: true, data: extract(body) };
}

async function request<T>(input: RequestInfo, init: RequestInit, extract: (body: unknown) => T): Promise<WorldPersistenceResult<T>> {
  try {
    const res = await fetch(input, init);
    return await toResult(res, extract);
  } catch {
    return { ok: false, reason: 'offline', message: 'Brak połączenia z backendem — świat pozostaje dostępny lokalnie w WorldRegistry.' };
  }
}

/** Saves a NEW world snapshot. Rejects (reason: 'conflict') if `snapshot.worldId` is already saved — use `updateWorldSnapshotOnBackend` for that. */
export function saveWorldSnapshotToBackend(snapshot: WorldSnapshot): Promise<WorldPersistenceResult<WorldSnapshot>> {
  return request(
    '/api/worlds',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(snapshot) },
    (body) => (body as { world: WorldSnapshot }).world,
  );
}

/** Replaces an already-saved world's snapshot (e.g. after further ticks/interventions). */
export function updateWorldSnapshotOnBackend(snapshot: WorldSnapshot): Promise<WorldPersistenceResult<WorldSnapshot>> {
  return request(
    `/api/worlds/${encodeURIComponent(snapshot.worldId)}`,
    { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(snapshot) },
    (body) => (body as { world: WorldSnapshot }).world,
  );
}

export function loadWorldSnapshotFromBackend(worldId: string): Promise<WorldPersistenceResult<WorldSnapshot>> {
  return request(`/api/worlds/${encodeURIComponent(worldId)}`, { method: 'GET' }, (body) => (body as { world: WorldSnapshot }).world);
}

export interface WorldSnapshotSummary {
  worldId: string;
  parentWorldId?: string;
  seed: number;
  branchId: string;
  parentBranchId: string | null;
  forkedAtTick: number | null;
  createdAt: string;
  updatedAt: number;
}

export function listWorldSnapshotsFromBackend(): Promise<WorldPersistenceResult<readonly WorldSnapshotSummary[]>> {
  return request('/api/worlds', { method: 'GET' }, (body) => (body as { worlds: readonly WorldSnapshotSummary[] }).worlds);
}
