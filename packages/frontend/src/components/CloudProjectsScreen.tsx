import { useCallback, useEffect, useState } from 'react';
import { useSession, getToken } from '../core/backend/session';
import {
  listProjects,
  createProject,
  listMembers,
  addMember,
  listCloudTrials,
  listBranches,
  createBranch,
  listMergeRequests,
  createMergeRequest,
  decideMergeRequest,
  getContributions,
  listKnowledgeMaterials,
  uploadKnowledgeMaterial,
  listProjectSpatialDatasets,
  uploadProjectSpatialDataset,
  type KnowledgeMaterial,
  type ProjectSpatialDataset,
  type Project,
  type Member,
  type CloudTrial,
  type ProjectRole,
  type Branch,
  type MergeRequest,
  type ContributionGraph,
} from '../core/backend/client';
import { AccountPanel } from './AccountPanel';
import { setActiveKnowledgeProject } from '../core/backend/knowledgeProjectContext';
import { normalizeOsmMapXml } from '../core/experimentFabric/spatialImport';

/**
 * Projekty (chmura) — reachable UI trwałości (Milestone 1). Zalogowany
 * użytkownik zakłada współdzielone projekty, zaprasza współpracowników z rolami
 * (RBAC) i przegląda TRWAŁE, reprodukowalne Serie Prób (zamrożone parametry,
 * wyjścia, wersja modelu, autor). Wszystko realnie przechodzi przez backend —
 * to nie makieta. Bez logowania pokazujemy panel konta i jasny komunikat, że
 * aplikacja i tak działa lokalnie.
 */

const ROLE_LABEL: Record<ProjectRole, string> = {
  owner: 'właściciel',
  admin: 'administrator',
  editor: 'edytor',
  viewer: 'obserwator',
};

const STATUS_LABEL: Record<CloudTrial['status'], string> = {
  baseline: 'punkt odniesienia',
  draft: 'robocza',
  promising: 'obiecująca',
  failed: 'nieudana',
};

function canManageMembers(role?: ProjectRole): boolean {
  return role === 'owner' || role === 'admin';
}

const MAX_KNOWLEDGE_FILE_BYTES = 5 * 1024 * 1024;

function knowledgeMimeFor(file: File): 'text/plain' | 'text/markdown' | 'application/pdf' | 'application/json' | null {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return 'application/pdf';
  if (name.endsWith('.md') || name.endsWith('.markdown')) return 'text/markdown';
  if (name.endsWith('.txt')) return 'text/plain';
  if (name.endsWith('.json')) return 'application/json';
  return null;
}

function parseSpatialBbox(raw: string): [number, number, number, number] | null {
  const values = raw.split(',').map((value) => Number(value.trim()));
  if (values.length !== 4 || !values.every(Number.isFinite)) return null;
  const [west, south, east, north] = values;
  if (west >= east || south >= north || west < -180 || east > 180 || south < -90 || north > 90 || east - west > 0.01 || north - south > 0.01) return null;
  return [west, south, east, north];
}

function fileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Nie udało się odczytać pliku.'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      if (comma < 0) reject(new Error('Nieprawidłowy odczyt pliku.'));
      else resolve(result.slice(comma + 1));
    };
    reader.readAsDataURL(file);
  });
}

function formatBytes(value: number | null): string {
  if (value === null) return '—';
  return value < 1024 ? `${value} B` : `${(value / 1024).toFixed(1)} kB`;
}

export function CloudProjectsScreen() {
  const session = useSession();

  if (!session) {
    return (
      <main className="settings-view" id="main-content" tabIndex={-1}>
        <section className="settings-section">
          <h2>Projekty (chmura)</h2>
          <p className="settings-hint">
            Zaloguj się, aby tworzyć współdzielone Projekty i trwałe Serie Prób, które przetrwają restart i pozwolą
            pracować zespołowo (role: właściciel / administrator / edytor / obserwator). Bez logowania Genesis OS działa
            w pełni lokalnie — konto jest opcją współdzielenia.
          </p>
          <AccountPanel />
        </section>
      </main>
    );
  }

  return <ProjectsWorkspace />;
}

function ProjectsWorkspace() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [selected, setSelected] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const r = await listProjects(token);
    if (r.ok) {
      setProjects(r.data);
      setError(null);
    } else {
      setError(r.message);
      setProjects([]);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token || !newName.trim()) return;
    setCreating(true);
    const r = await createProject(token, newName.trim());
    setCreating(false);
    if (r.ok) {
      setNewName('');
      await refresh();
      setSelected(r.data);
    } else {
      setError(r.message);
    }
  }

  if (selected) {
    return <ProjectDetail project={selected} onBack={() => { setSelected(null); void refresh(); }} />;
  }

  return (
    <main className="settings-view" id="main-content" tabIndex={-1}>
      <section className="settings-section">
        <h2>Twoje projekty</h2>
        {error && <div className="account-error" role="alert">{error}</div>}
        {projects === null ? (
          <p className="settings-hint">Ładowanie…</p>
        ) : projects.length === 0 ? (
          <p className="settings-hint">Nie masz jeszcze żadnego projektu. Utwórz pierwszy poniżej.</p>
        ) : (
          <div className="project-list">
            {projects.map((p) => (
              <button key={p.id} className="project-row" onClick={() => setSelected(p)}>
                <span className="project-name">{p.name}</span>
                <span className={`project-role role-${p.role}`}>{p.role ? ROLE_LABEL[p.role] : ''}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="settings-section">
        <h2>Nowy projekt</h2>
        <form className="account-form" onSubmit={handleCreate}>
          <label className="account-field">
            <span>Nazwa projektu</span>
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={120} required />
          </label>
          <button className="chip-btn primary" type="submit" disabled={creating || !newName.trim()}>
            {creating ? 'Tworzenie…' : '✚ Utwórz projekt'}
          </button>
        </form>
        <p className="settings-hint">
          Zostaniesz właścicielem. Współpracowników z rolami dodasz w szczegółach projektu.
        </p>
      </section>
    </main>
  );
}

const MERGE_STATUS_LABEL: Record<MergeRequest['status'], string> = {
  open: 'otwarte',
  approved: 'zatwierdzone',
  rejected: 'odrzucone',
  merged: 'scalone',
};

function ProjectDetail({ project, onBack }: { project: Project; onBack: () => void }) {
  useEffect(() => {
    setActiveKnowledgeProject(project);
    return () => setActiveKnowledgeProject(null);
  }, [project]);

  const [members, setMembers] = useState<Member[] | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranch, setActiveBranch] = useState<string>('');
  const [trials, setTrials] = useState<CloudTrial[] | null>(null);
  const [mrs, setMrs] = useState<MergeRequest[]>([]);
  const [contrib, setContrib] = useState<ContributionGraph | null>(null);
  const [materials, setMaterials] = useState<KnowledgeMaterial[] | null>(null);
  const [spatialDatasets, setSpatialDatasets] = useState<ProjectSpatialDataset[] | null>(null);
  const [knowledgeFile, setKnowledgeFile] = useState<File | null>(null);
  const [knowledgeTitle, setKnowledgeTitle] = useState('');
  const [knowledgeTopics, setKnowledgeTopics] = useState('');
  const [knowledgeSourceUrl, setKnowledgeSourceUrl] = useState('');
  const [uploadingKnowledge, setUploadingKnowledge] = useState(false);
  const [spatialFile, setSpatialFile] = useState<File | null>(null);
  const [spatialLabel, setSpatialLabel] = useState('');
  const [spatialBbox, setSpatialBbox] = useState('');
  const [uploadingSpatial, setUploadingSpatial] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<ProjectRole>('viewer');
  const [newBranch, setNewBranch] = useState('');
  const [forkOnCreate, setForkOnCreate] = useState(true);
  const [mrTarget, setMrTarget] = useState('');

  const canWrite = project.role === 'owner' || project.role === 'admin' || project.role === 'editor';
  const canReview = project.role === 'owner' || project.role === 'admin';

  const loadStatic = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const [m, b, mr, c, k, spatial] = await Promise.all([
      listMembers(token, project.id),
      listBranches(token, project.id),
      listMergeRequests(token, project.id),
      getContributions(token, project.id),
      listKnowledgeMaterials(token, project.id),
      listProjectSpatialDatasets(token, project.id),
    ]);
    if (m.ok) setMembers(m.data);
    if (b.ok) {
      setBranches(b.data);
      setActiveBranch((cur) => cur || b.data.find((x) => x.name === 'main')?.id || b.data[0]?.id || '');
    }
    if (mr.ok) setMrs(mr.data);
    if (c.ok) setContrib(c.data);
    if (k.ok) setMaterials(k.data);
    if (spatial.ok) setSpatialDatasets(spatial.data);
  }, [project.id]);

  const loadTrials = useCallback(async (branchId: string) => {
    const token = getToken();
    if (!token || !branchId) return;
    const t = await listCloudTrials(token, project.id, undefined, branchId);
    if (t.ok) setTrials(t.data);
  }, [project.id]);

  useEffect(() => { void loadStatic(); }, [loadStatic]);
  useEffect(() => { if (activeBranch) void loadTrials(activeBranch); }, [activeBranch, loadTrials]);

  async function handleKnowledgeUpload(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token || !knowledgeFile) return;
    const mimeType = knowledgeMimeFor(knowledgeFile);
    if (!mimeType) {
      setError('Obsługiwane są wyłącznie pliki PDF, TXT, MD i JSON.');
      return;
    }
    if (knowledgeFile.size > MAX_KNOWLEDGE_FILE_BYTES) {
      setError('Maksymalny rozmiar materiału wiedzy to 5 MB.');
      return;
    }
    setUploadingKnowledge(true);
    try {
      const contentBase64 = await fileAsBase64(knowledgeFile);
      const result = await uploadKnowledgeMaterial(token, project.id, {
        fileName: knowledgeFile.name,
        mimeType,
        title: knowledgeTitle.trim() || undefined,
        topics: knowledgeTopics.split(',').map((topic) => topic.trim()).filter(Boolean),
        sourceUrl: knowledgeSourceUrl.trim() || undefined,
        contentBase64,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setKnowledgeFile(null);
      setKnowledgeTitle('');
      setKnowledgeTopics('');
      setKnowledgeSourceUrl('');
      setError(null);
      await loadStatic();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Nie udało się przygotować pliku do uploadu.');
    } finally {
      setUploadingKnowledge(false);
    }
  }

  async function handleSpatialUpload(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    const bbox = parseSpatialBbox(spatialBbox);
    if (!token || !spatialFile) return;
    if (!bbox) {
      setError('BBOX musi mieć format west,south,east,north, mieścić się w EPSG:4326 i nie przekraczać 0,01° × 0,01°.');
      return;
    }
    if (spatialFile.size > 7 * 1024 * 1024) {
      setError('Maksymalny rozmiar artefaktu OSM XML to 7 MB.');
      return;
    }
    setUploadingSpatial(true);
    try {
      const xml = await spatialFile.text();
      const dataset = normalizeOsmMapXml(xml, { bbox, sourceTimestamp: new Date().toISOString() });
      const result = await uploadProjectSpatialDataset(token, project.id, {
        label: spatialLabel.trim() || spatialFile.name,
        dataset,
        originalBase64: await fileAsBase64(spatialFile),
      });
      if (!result.ok) { setError(result.message); return; }
      setSpatialFile(null);
      setSpatialLabel('');
      setSpatialBbox('');
      setError(null);
      await loadStatic();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Nie udało się przygotować artefaktu GIS.');
    } finally {
      setUploadingSpatial(false);
    }
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token || !memberEmail.trim()) return;
    const r = await addMember(token, project.id, memberEmail.trim(), memberRole);
    if (r.ok) { setMembers(r.data); setMemberEmail(''); setError(null); }
    else setError(r.message);
  }

  async function handleCreateBranch(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token || !newBranch.trim()) return;
    const r = await createBranch(token, project.id, newBranch.trim(), { baseBranchId: activeBranch, fork: forkOnCreate });
    if (r.ok) { setNewBranch(''); setError(null); await loadStatic(); setActiveBranch(r.data.id); }
    else setError(r.message);
  }

  async function handleOpenMr() {
    const token = getToken();
    if (!token || !mrTarget || mrTarget === activeBranch) return;
    const src = branches.find((b) => b.id === activeBranch);
    const tgt = branches.find((b) => b.id === mrTarget);
    const r = await createMergeRequest(token, project.id, activeBranch, mrTarget, `Scal ${src?.name} → ${tgt?.name}`);
    if (r.ok) { setError(null); await loadStatic(); } else setError(r.message);
  }

  async function handleDecide(mrId: string, approve: boolean) {
    const token = getToken();
    if (!token) return;
    const r = await decideMergeRequest(token, project.id, mrId, approve);
    if (r.ok) { setError(null); await loadStatic(); if (activeBranch) await loadTrials(activeBranch); }
    else setError(r.message);
  }

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? id.slice(0, 6);

  // Grupuj próby po eksperymencie — każda seria to osobny „notatnik" reprodukowalny.
  const byExperiment = new Map<string, CloudTrial[]>();
  for (const t of trials ?? []) {
    const arr = byExperiment.get(t.experimentId) ?? [];
    arr.push(t);
    byExperiment.set(t.experimentId, arr);
  }

  return (
    <main className="settings-view" id="main-content" tabIndex={-1}>
      <button className="chip-btn" onClick={onBack}>← Wszystkie projekty</button>

      <section className="settings-section">
        <h2>{project.name}</h2>
        <div className="stat-row">
          <span>Twoja rola</span>
          <span className={`project-role role-${project.role}`}>{project.role ? ROLE_LABEL[project.role] : ''}</span>
        </div>
        {error && <div className="account-error" role="alert">{error}</div>}
      </section>

      <section className="settings-section">
        <h2>Gałęzie (Scientific Git)</h2>
        <p className="settings-hint">
          Gałąź to nazwana linia pracy. Odgałęzienie kopiuje bieżące próby z rodowodem — możesz badać wariant hipotezy,
          nie ruszając „main". Scalanie wnosi wyniki do innej gałęzi po recenzji; nic nie jest nadpisywane.
        </p>
        <div className="branch-bar">
          {branches.map((b) => (
            <button
              key={b.id}
              className={`branch-chip${b.id === activeBranch ? ' active' : ''}`}
              aria-pressed={b.id === activeBranch}
              onClick={() => setActiveBranch(b.id)}
            >
              ⑂ {b.name}
            </button>
          ))}
        </div>
        {canWrite && (
          <form className="account-form" onSubmit={handleCreateBranch}>
            <label className="account-field">
              <span>Nowa gałąź (z „{branchName(activeBranch)}")</span>
              <input type="text" value={newBranch} onChange={(e) => setNewBranch(e.target.value)} maxLength={80} placeholder="np. hipoteza-A" />
            </label>
            <label className="toggle-inline">
              <input type="checkbox" checked={forkOnCreate} onChange={(e) => setForkOnCreate(e.target.checked)} />
              <span>skopiuj istniejące próby (fork)</span>
            </label>
            <button className="chip-btn" type="submit" disabled={!newBranch.trim()}>⑂ Utwórz gałąź</button>
          </form>
        )}
      </section>

      <section className="settings-section">
        <h2>Historia wersji · gałąź „{branchName(activeBranch)}"</h2>
        <p className="settings-hint">
          Uporządkowana, niezmienna historia prób tej gałęzi. Każda próba to „commit" z autorem, znacznikiem czasu i
          zamrożoną prowieniencją (parametry, wyjścia, wersja modelu). Próby zapisujesz z eksperymentów-grafów (przycisk „☁ do chmury").
        </p>
        {trials === null ? (
          <p className="settings-hint">Ładowanie…</p>
        ) : trials.length === 0 ? (
          <p className="settings-hint">Ta gałąź nie ma jeszcze zapisanych prób.</p>
        ) : (
          [...byExperiment.entries()].map(([experimentId, list]) => (
            <div className="cloud-experiment" key={experimentId}>
              <div className="section-label">{experimentId} · {list.length} prób</div>
              <div className="trial-list">
                {list.map((t) => (
                  <div key={t.id} className={`trial-row status-${t.status}`}>
                    <span className="trial-idx">#{String(t.index).padStart(3, '0')}</span>
                    <span className="trial-label">{t.label}{t.parentId && <span className="trial-fork" title="rodowód: odbita/scalona z innej próby"> ⑂</span>}</span>
                    <span className={`trial-status status-${t.status}`}>{STATUS_LABEL[t.status]}</span>
                    {t.modelVersion && <span className="cloud-modelver" title="wersja modelu (prowieniencja)">{t.modelVersion}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      <section className="settings-section">
        <h2>Scalenia (recenzja)</h2>
        {canWrite && branches.length > 1 && (
          <div className="mr-open">
            <label className="account-field">
              <span>Scal „{branchName(activeBranch)}" do:</span>
              <select value={mrTarget} onChange={(e) => setMrTarget(e.target.value)}>
                <option value="">— wybierz gałąź docelową —</option>
                {branches.filter((b) => b.id !== activeBranch).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <button className="chip-btn" onClick={handleOpenMr} disabled={!mrTarget}>Zgłoś scalenie do recenzji</button>
          </div>
        )}
        {mrs.length === 0 ? (
          <p className="settings-hint">Brak zgłoszeń scalenia.</p>
        ) : (
          <div className="mr-list">
            {mrs.map((mr) => (
              <div key={mr.id} className={`mr-row status-${mr.status}`}>
                <div className="mr-main">
                  <span className="mr-title">{mr.title}</span>
                  <span className="mr-branches">{branchName(mr.sourceBranchId)} → {branchName(mr.targetBranchId)}</span>
                </div>
                <span className={`mr-status status-${mr.status}`}>{MERGE_STATUS_LABEL[mr.status]}{mr.status === 'merged' ? ` (${mr.mergedCount})` : ''}</span>
                {mr.status === 'open' && canReview && (
                  <div className="mr-actions">
                    <button className="chip-btn tiny" onClick={() => handleDecide(mr.id, true)} title="Zatwierdź i scal">✓ scal</button>
                    <button className="chip-btn tiny danger" onClick={() => handleDecide(mr.id, false)} title="Odrzuć">✕</button>
                  </div>
                )}
                {mr.status === 'open' && !canReview && <span className="mr-hint">czeka na recenzję (admin+)</span>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="settings-section">
        <h2>Biblioteka wiedzy</h2>
        <p className="settings-hint">
          Materiał zachowuje oryginalny plik, wersję, hash i provenance. Jest oznaczony jako materiał użytkownika bez recenzji:
          może być znaleziony jako źródło, ale nie zmienia automatycznie solvera ani wyniku symulacji.
        </p>
        {materials === null ? (
          <p className="settings-hint">Ładowanie materiałów…</p>
        ) : materials.length === 0 ? (
          <p className="settings-hint">Brak dodanych materiałów.</p>
        ) : (
          <div className="trial-list">
            {materials.map((material) => (
              <div className="trial-row" key={material.id}>
                <span className="trial-label">{material.title} <span className="cloud-modelver">v{material.currentVersion}</span></span>
                <span className="trial-status">{material.epistemicStatus === 'USER_PROVIDED_UNREVIEWED' ? 'materiał użytkownika — bez recenzji' : material.epistemicStatus}</span>
                <span className="account-email" title={material.contentSha256 ?? undefined}>{formatBytes(material.byteSize)} · SHA-256 {material.contentSha256?.slice(0, 12) ?? '—'}</span>
              </div>
            ))}
          </div>
        )}
        {canWrite && (
          <form className="account-form" onSubmit={handleKnowledgeUpload}>
            <label className="account-field">
              <span>Plik źródłowy (PDF, TXT, MD lub JSON; maks. 5 MB)</span>
              <input type="file" accept=".pdf,.txt,.md,.markdown,.json" onChange={(e) => setKnowledgeFile(e.target.files?.[0] ?? null)} required />
            </label>
            <label className="account-field">
              <span>Tytuł źródła (opcjonalnie)</span>
              <input type="text" value={knowledgeTitle} onChange={(e) => setKnowledgeTitle(e.target.value)} maxLength={180} placeholder="np. Majorana — notatki z seminarium" />
            </label>
            <label className="account-field">
              <span>Tematy, rozdzielone przecinkami</span>
              <input type="text" value={knowledgeTopics} onChange={(e) => setKnowledgeTopics(e.target.value)} maxLength={600} placeholder="quantum, Majorana, topological matter" />
            </label>
            <label className="account-field">
              <span>Publiczny adres źródła (opcjonalnie)</span>
              <input type="url" value={knowledgeSourceUrl} onChange={(e) => setKnowledgeSourceUrl(e.target.value)} maxLength={2000} placeholder="https://…" />
            </label>
            <button className="chip-btn primary" type="submit" disabled={uploadingKnowledge || !knowledgeFile}>
              {uploadingKnowledge ? 'Indeksowanie…' : '↑ Dodaj materiał do biblioteki'}
            </button>
          </form>
        )}
      </section>

      <section className="settings-section">
        <h2>Warstwy GIS</h2>
        <p className="settings-hint">
          Artefakt OSM XML jest zachowywany wraz z SHA-256, bboxem, timestampem i atrybucją. Stanowi wyłącznie read-only geometrię źródłową;
          nie tworzy drugiego World State, nie zmienia agentów ani nie jest automatycznie nakładany na świat bez jawnej kalibracji projektu.
        </p>
        {spatialDatasets === null ? (
          <p className="settings-hint">Ładowanie artefaktów GIS…</p>
        ) : spatialDatasets.length === 0 ? (
          <p className="settings-hint">Brak dodanych artefaktów GIS.</p>
        ) : (
          <div className="trial-list">
            {spatialDatasets.map((spatial) => (
              <div className="trial-row" key={spatial.id}>
                <span className="trial-label">{spatial.label} <span className="cloud-modelver">{spatial.dataset.crs}</span></span>
                <span className="trial-status">{spatial.dataset.provenance.featureCount} obiektów · {spatial.dataset.attribution}</span>
                <span className="account-email" title={spatial.originalSha256}>SHA-256 {spatial.originalSha256.slice(0, 12)} · {new Date(spatial.createdAt).toLocaleString('pl-PL')}</span>
              </div>
            ))}
          </div>
        )}
        {canWrite && (
          <form className="account-form" onSubmit={handleSpatialUpload}>
            <label className="account-field">
              <span>Źródłowy plik OSM XML (maks. 7 MB)</span>
              <input type="file" accept=".osm,.xml,text/xml,application/xml" onChange={(e) => setSpatialFile(e.target.files?.[0] ?? null)} required />
            </label>
            <label className="account-field">
              <span>Nazwa artefaktu (opcjonalnie)</span>
              <input type="text" value={spatialLabel} onChange={(e) => setSpatialLabel(e.target.value)} maxLength={160} placeholder="np. Ceuta — fragment źródłowy OSM" />
            </label>
            <label className="account-field">
              <span>BBOX EPSG:4326: west,south,east,north</span>
              <input type="text" value={spatialBbox} onChange={(e) => setSpatialBbox(e.target.value)} required placeholder="-5.3240,35.8885,-5.3235,35.8890" />
            </label>
            <button className="chip-btn primary" type="submit" disabled={uploadingSpatial || !spatialFile}>
              {uploadingSpatial ? 'Normalizowanie i zapisywanie…' : '↑ Dodaj źródłowy artefakt GIS'}
            </button>
          </form>
        )}
      </section>

      <section className="settings-section">
        <h2>Graf kontrybucji</h2>
        {contrib === null ? (
          <p className="settings-hint">Ładowanie…</p>
        ) : contrib.totalTrials === 0 ? (
          <p className="settings-hint">Brak prób do podsumowania.</p>
        ) : (
          <>
            <p className="settings-hint">Łącznie {contrib.totalTrials} prób. Liczone z realnego autorstwa (nie metryka szacunkowa).</p>
            <div className="contrib-list">
              {contrib.contributors.map((c) => (
                <div className="contrib-row" key={c.userId}>
                  <span className="contrib-name">{c.displayName} <span className="account-email">{c.email}</span></span>
                  <span className="contrib-bar" aria-hidden="true">
                    <span className="contrib-fill" style={{ width: `${Math.round((c.trials / contrib.totalTrials) * 100)}%` }} />
                  </span>
                  <span className="contrib-count">{c.trials}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="settings-section">
        <h2>Współpracownicy</h2>
        {members === null ? (
          <p className="settings-hint">Ładowanie…</p>
        ) : (
          <div className="member-list">
            {members.map((m) => (
              <div className="member-row" key={m.userId}>
                <span className="member-name">{m.displayName} <span className="account-email">{m.email}</span></span>
                <span className={`project-role role-${m.role}`}>{ROLE_LABEL[m.role]}</span>
              </div>
            ))}
          </div>
        )}
        {canManageMembers(project.role) && (
          <form className="account-form" onSubmit={handleAddMember}>
            <label className="account-field">
              <span>E-mail współpracownika</span>
              <input type="email" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} required />
            </label>
            <label className="account-field">
              <span>Rola</span>
              <select value={memberRole} onChange={(e) => setMemberRole(e.target.value as ProjectRole)}>
                <option value="viewer">obserwator (odczyt)</option>
                <option value="editor">edytor (zapis prób)</option>
                <option value="admin">administrator (zarządza członkami, recenzuje scalenia)</option>
                {project.role === 'owner' && <option value="owner">właściciel</option>}
              </select>
            </label>
            <button className="chip-btn" type="submit" disabled={!memberEmail.trim()}>Dodaj / zmień rolę</button>
          </form>
        )}
      </section>
    </main>
  );
}
