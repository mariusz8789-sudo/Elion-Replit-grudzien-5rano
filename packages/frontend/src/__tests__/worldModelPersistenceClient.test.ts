import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadWorldSnapshotFromBackend,
  saveWorldSnapshotToBackend,
  updateWorldSnapshotOnBackend,
  listWorldSnapshotsFromBackend,
} from '../core/worldModel/persistence/worldPersistenceClient';
import type { WorldSnapshot } from '../core/worldModel/persistence/worldSnapshot';

function fakeResponse(status: number, body: unknown): Response {
  return { status, ok: status >= 200 && status < 300, json: () => Promise.resolve(body) } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const sampleSnapshot = {
  worldId: 'client-city',
  seed: 1,
  branchId: 'branch-1',
  parentBranchId: null,
  forkedAtTick: null,
  specification: { worldId: 'client-city', seed: 1, worldType: ['CITY'] },
  createdAt: '2026-01-01T00:00:00.000Z',
  keyframeTick: 0,
  keyframeSimulatedTime: 0,
  keyframeEntities: [],
  keyframeRelationships: [],
  events: [],
  observations: [],
} as unknown as WorldSnapshot;

describe('worldPersistenceClient: HTTP response handling (mirrors askAI.ts/llmWorldProposalAdapter.ts conventions)', () => {
  it('save: 201 returns the saved snapshot', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(201, { world: sampleSnapshot }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await saveWorldSnapshotToBackend(sampleSnapshot);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.worldId).toBe('client-city');
    expect(fetchMock).toHaveBeenCalledWith('/api/worlds', expect.objectContaining({ method: 'POST' }));
  });

  it('save: 409 reports conflict', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(409, { error: 'already_exists' })));
    const result = await saveWorldSnapshotToBackend(sampleSnapshot);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected not ok');
    expect(result.reason).toBe('conflict');
  });

  it('save: 400 reports invalid with the server-supplied message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(400, { error: 'invalid_world_snapshot', message: 'seed must be a finite number' })));
    const result = await saveWorldSnapshotToBackend(sampleSnapshot);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected not ok');
    expect(result.reason).toBe('invalid');
    expect(result.message).toContain('seed');
  });

  it('save: 503 reports unavailable (no persistence configured)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(503, {})));
    const result = await saveWorldSnapshotToBackend(sampleSnapshot);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected not ok');
    expect(result.reason).toBe('unavailable');
  });

  it('load: 404 reports not-found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(404, { error: 'not_found' })));
    const result = await loadWorldSnapshotFromBackend('missing-city');
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected not ok');
    expect(result.reason).toBe('not-found');
  });

  it('load: 200 returns the snapshot', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(200, { world: sampleSnapshot })));
    const result = await loadWorldSnapshotFromBackend('client-city');
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.branchId).toBe('branch-1');
  });

  it('update: PUTs to the world-specific URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { world: sampleSnapshot }));
    vi.stubGlobal('fetch', fetchMock);
    await updateWorldSnapshotOnBackend(sampleSnapshot);
    expect(fetchMock).toHaveBeenCalledWith('/api/worlds/client-city', expect.objectContaining({ method: 'PUT' }));
  });

  it('list: returns the summary array', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(fakeResponse(200, { worlds: [{ worldId: 'a' }, { worldId: 'b' }] })));
    const result = await listWorldSnapshotsFromBackend();
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.data.map((w) => w.worldId)).toEqual(['a', 'b']);
  });

  it('a network failure is reported as offline, not a crash — the caller can keep using WorldRegistry locally', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const result = await saveWorldSnapshotToBackend(sampleSnapshot);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected not ok');
    expect(result.reason).toBe('offline');
  });
});
