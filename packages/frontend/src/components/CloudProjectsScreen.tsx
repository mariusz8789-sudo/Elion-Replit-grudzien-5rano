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
  type Project,
  type Member,
  type CloudTrial,
  type ProjectRole,
  type Branch,
  type MergeRequest,
  type ContributionGraph,
} from '../core/backend/client';
import { AccountPanel } from './AccountPanel';

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
  const [members, setMembers] = useState<Member[] | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranch, setActiveBranch] = useState<string>('');
  const [trials, setTrials] = useState<CloudTrial[] | null>(null);
  const [mrs, setMrs] = useState<MergeRequest[]>([]);
  const [contrib, setContrib] = useState<ContributionGraph | null>(null);
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
    const [m, b, mr, c] = await Promise.all([
      listMembers(token, project.id),
      listBranches(token, project.id),
      listMergeRequests(token, project.id),
      getContributions(token, project.id),
    ]);
    if (m.ok) setMembers(m.data);
    if (b.ok) {
      setBranches(b.data);
      setActiveBranch((cur) => cur || b.data.find((x) => x.name === 'main')?.id || b.data[0]?.id || '');
    }
    if (mr.ok) setMrs(mr.data);
    if (c.ok) setContrib(c.data);
  }, [project.id]);

  const loadTrials = useCallback(async (branchId: string) => {
    const token = getToken();
    if (!token || !branchId) return;
    const t = await listCloudTrials(token, project.id, undefined, branchId);
    if (t.ok) setTrials(t.data);
  }, [project.id]);

  useEffect(() => { void loadStatic(); }, [loadStatic]);
  useEffect(() => { if (activeBranch) void loadTrials(activeBranch); }, [activeBranch, loadTrials]);

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
