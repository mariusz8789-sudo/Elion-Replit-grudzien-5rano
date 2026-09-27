/**
 * campaignSync (Genesis 2.1, Part 2) — cienka warstwa synchronizacji kampanii z
 * backendem. Klient pozostaje OFFLINE-FIRST: localStorage jest natychmiastowym źródłem
 * prawdy, a to lustro w chmurze sprawia, że kampanie przeżywają wylogowanie/restart/
 * nowe urządzenie. Migracja starych danych = push lokalnych kampanii na serwer przy
 * pierwszej synchronizacji. Logika wstrzykiwalna (deps) → testowalna bez sieci.
 */
import {
  fetchCampaignsRemote, fetchCampaignRemote, saveCampaignRemote, deleteCampaignRemote,
  type ApiResult, type RemoteCampaignMeta, type RemoteCampaign,
} from './backend/client';
import { listCampaigns, saveCampaign, type Campaign } from './campaigns';

export interface SyncDeps {
  listRemote: (token: string) => Promise<ApiResult<RemoteCampaignMeta[]>>;
  fetchRemote: (token: string, id: string) => Promise<ApiResult<RemoteCampaign>>;
  saveRemote: (token: string, id: string, data: unknown) => Promise<ApiResult<RemoteCampaign>>;
  deleteRemote: (token: string, id: string) => Promise<ApiResult<{ ok: boolean }>>;
  localList: (ownerId: string) => Campaign[];
  localSave: (c: Campaign) => void;
}

const realDeps: SyncDeps = {
  listRemote: fetchCampaignsRemote, fetchRemote: fetchCampaignRemote,
  saveRemote: saveCampaignRemote, deleteRemote: deleteCampaignRemote,
  localList: listCampaigns, localSave: (c) => { saveCampaign(c); },
};

/**
 * Dwukierunkowa synchronizacja przy logowaniu: pobierz kampanie z serwera, których
 * brak lokalnie (nowe urządzenie), i wypchnij lokalne, których brak na serwerze
 * (migracja z localStorage). Nie nadpisuje istniejących lokalnych edycji.
 */
export async function syncCampaigns(token: string, ownerId: string, deps: SyncDeps = realDeps): Promise<{ pushed: number; pulled: number }> {
  if (!token || !ownerId) return { pushed: 0, pulled: 0 };
  const remoteRes = await deps.listRemote(token);
  const remote = remoteRes.ok ? remoteRes.data : [];
  const remoteIds = new Set(remote.map((r) => r.id));
  const local = deps.localList(ownerId);
  const localIds = new Set(local.map((c) => c.id));
  let pulled = 0, pushed = 0;

  for (const meta of remote) {
    if (localIds.has(meta.id)) continue; // present locally → keep local (offline-first)
    const full = await deps.fetchRemote(token, meta.id);
    if (full.ok && full.data?.data && typeof full.data.data === 'object') { deps.localSave(full.data.data as Campaign); pulled += 1; }
  }
  for (const c of local) {
    if (remoteIds.has(c.id)) continue; // already on server
    const r = await deps.saveRemote(token, c.id, c);
    if (r.ok) pushed += 1;
  }
  return { pushed, pulled };
}

/** Write-through jednej kampanii na serwer (po lokalnym zapisie). Best-effort. */
export async function pushCampaign(token: string, campaign: Campaign, deps: SyncDeps = realDeps): Promise<boolean> {
  if (!token || !campaign?.id) return false;
  const r = await deps.saveRemote(token, campaign.id, campaign);
  return r.ok;
}

/** Usunięcie kampanii również na serwerze. Best-effort. */
export async function removeCampaignRemote(token: string, id: string, deps: SyncDeps = realDeps): Promise<boolean> {
  if (!token || !id) return false;
  const r = await deps.deleteRemote(token, id);
  return r.ok;
}
