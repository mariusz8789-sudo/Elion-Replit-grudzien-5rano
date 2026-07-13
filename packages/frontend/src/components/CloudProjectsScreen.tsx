import { useCallback, useEffect, useState } from 'react';
import { useSession, getToken } from '../core/backend/session';
import {
  listProjects,
  createProject,
  listMembers,
  addMember,
  listCloudTrials,
  type Project,
  type Member,
  type CloudTrial,
  type ProjectRole,
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

function ProjectDetail({ project, onBack }: { project: Project; onBack: () => void }) {
  const [members, setMembers] = useState<Member[] | null>(null);
  const [trials, setTrials] = useState<CloudTrial[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [memberEmail, setMemberEmail] = useState('');
  const [memberRole, setMemberRole] = useState<ProjectRole>('viewer');

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    const [m, t] = await Promise.all([listMembers(token, project.id), listCloudTrials(token, project.id)]);
    if (m.ok) setMembers(m.data);
    else setError(m.message);
    if (t.ok) setTrials(t.data);
  }, [project.id]);

  useEffect(() => { void load(); }, [load]);

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token || !memberEmail.trim()) return;
    const r = await addMember(token, project.id, memberEmail.trim(), memberRole);
    if (r.ok) {
      setMembers(r.data);
      setMemberEmail('');
      setError(null);
    } else {
      setError(r.message);
    }
  }

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
                <option value="admin">administrator (zarządza członkami)</option>
                {project.role === 'owner' && <option value="owner">właściciel</option>}
              </select>
            </label>
            <button className="chip-btn" type="submit" disabled={!memberEmail.trim()}>Dodaj / zmień rolę</button>
          </form>
        )}
      </section>

      <section className="settings-section">
        <h2>Trwałe Serie Prób</h2>
        <p className="settings-hint">
          Każda próba jest zamrożona z prowieniencją: parametry wejściowe, policzone wyjścia, wersja modelu i autor —
          czyli jest reprodukowalna. Próby zapisujesz z panelu „Seria prób" w eksperymentach-grafach (przycisk „☁ do chmury").
        </p>
        {trials === null ? (
          <p className="settings-hint">Ładowanie…</p>
        ) : trials.length === 0 ? (
          <p className="settings-hint">Ten projekt nie ma jeszcze zapisanych prób.</p>
        ) : (
          [...byExperiment.entries()].map(([experimentId, list]) => (
            <div className="cloud-experiment" key={experimentId}>
              <div className="section-label">{experimentId} · {list.length} prób</div>
              <div className="trial-list">
                {list.map((t) => (
                  <div key={t.id} className={`trial-row status-${t.status}`}>
                    <span className="trial-idx">#{String(t.index).padStart(3, '0')}</span>
                    <span className="trial-label">{t.label}</span>
                    <span className={`trial-status status-${t.status}`}>{STATUS_LABEL[t.status]}</span>
                    {t.modelVersion && <span className="cloud-modelver" title="wersja modelu (prowieniencja)">{t.modelVersion}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </main>
  );
}
