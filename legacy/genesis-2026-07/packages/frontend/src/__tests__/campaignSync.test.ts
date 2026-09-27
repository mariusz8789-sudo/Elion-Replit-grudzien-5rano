/**
 * campaignSync (Genesis 2.1, Part 2) — offline-first cloud mirror. Verifies migration
 * (local → server) and new-device hydration (server → local) without touching the
 * network, via injected deps.
 */
import { describe, expect, it, vi } from 'vitest';
import { syncCampaigns, pushCampaign, type SyncDeps } from '../core/campaignSync';
import type { Campaign } from '../core/campaigns';

const camp = (id: string, name: string): Campaign => ({
  id, ownerId: 'u1', name, description: '', goal: '', owner: 'u1@lab.io',
  createdAt: 1, status: 'ACTIVE', molecules: [],
});

function makeDeps(over: Partial<SyncDeps> = {}): SyncDeps {
  return {
    listRemote: vi.fn(async () => ({ ok: true, data: [] })),
    fetchRemote: vi.fn(async () => ({ ok: false, status: 404, error: 'x', message: 'x' })),
    saveRemote: vi.fn(async (_t, id) => ({ ok: true, data: { id, data: {}, createdAt: 1, updatedAt: 2 } })),
    deleteRemote: vi.fn(async () => ({ ok: true, data: { ok: true } })),
    localList: vi.fn(() => []),
    localSave: vi.fn(),
    ...over,
  } as SyncDeps;
}

describe('syncCampaigns', () => {
  it('migrates local-only campaigns up to the server (push)', async () => {
    const deps = makeDeps({ localList: () => [camp('c1', 'A'), camp('c2', 'B')] });
    const r = await syncCampaigns('tok', 'u1', deps);
    expect(r.pushed).toBe(2);
    expect(r.pulled).toBe(0);
    expect(deps.saveRemote).toHaveBeenCalledTimes(2);
  });

  it('hydrates server-only campaigns down to a fresh device (pull)', async () => {
    const saved: Campaign[] = [];
    const deps = makeDeps({
      listRemote: async () => ({ ok: true, data: [{ id: 'c9', name: 'Cloud', status: 'ACTIVE', molecules: 3, createdAt: 1, updatedAt: 5 }] }),
      fetchRemote: async (_t, id) => ({ ok: true, data: { id, data: camp('c9', 'Cloud'), createdAt: 1, updatedAt: 5 } }),
      localList: () => [],
      localSave: (c) => { saved.push(c); },
    });
    const r = await syncCampaigns('tok', 'u1', deps);
    expect(r.pulled).toBe(1);
    expect(saved[0].name).toBe('Cloud');
  });

  it('does not overwrite a campaign that exists locally (offline-first wins)', async () => {
    const deps = makeDeps({
      listRemote: async () => ({ ok: true, data: [{ id: 'c1', name: 'server', status: 'ACTIVE', molecules: 0, createdAt: 1, updatedAt: 9 }] }),
      localList: () => [camp('c1', 'local')],
    });
    const r = await syncCampaigns('tok', 'u1', deps);
    expect(r.pulled).toBe(0);       // present locally → not pulled
    expect(deps.fetchRemote).not.toHaveBeenCalled();
  });

  it('is a no-op without a token or owner', async () => {
    const deps = makeDeps();
    expect(await syncCampaigns('', 'u1', deps)).toEqual({ pushed: 0, pulled: 0 });
    expect(deps.listRemote).not.toHaveBeenCalled();
  });
});

describe('pushCampaign', () => {
  it('write-through returns true on success, false without a token', async () => {
    const deps = makeDeps();
    expect(await pushCampaign('tok', camp('c1', 'A'), deps)).toBe(true);
    expect(await pushCampaign('', camp('c1', 'A'), deps)).toBe(false);
  });
});
