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
import { useI18n } from '../core/i18n';

/**
 * Projekty (chmura) — reachable UI trwałości (Milestone 1). Zalogowany
 * użytkownik zakłada współdzielone projekty, zaprasza współpracowników z rolami
 * (RBAC) i przegląda TRWAŁE, reprodukowalne Serie Prób. Wszystkie napisy przez seam i18n.
 */

const ROLE_LABEL_KEYS: Record<ProjectRole, string> = {
  owner: 'cp.role.owner', admin: 'cp.role.admin', editor: 'cp.role.editor', viewer: 'cp.role.viewer',
};
const STATUS_LABEL_KEYS: Record<CloudTrial['status'], string> = {
  baseline: 'cp.status.baseline', draft: 'cp.status.draft', promising: 'cp.status.promising', failed: 'cp.status.failed',
};
const MERGE_STATUS_KEYS: Record<MergeRequest['status'], string> = {
  open: 'cp.mr.open', approved: 'cp.mr.approved', rejected: 'cp.mr.rejected', merged: 'cp.mr.merged',
};

function canManageMembers(role?: ProjectRole): boolean {
  return role === 'owner' || role === 'admin';
}

export function CloudProjectsScreen() {
  const { t } = useI18n();
  const session = useSession();

  if (!session) {
    return (
      <main className="settings-view" id="main-content" tabIndex={-1}>
        <section className="settings-section">
          <h2>{t('cp.title')}</h2>
          <p className="settings-hint">{t('cp.signin')}</p>
          <AccountPanel />
        </section>
      </main>
    );
  }

  return <ProjectsWorkspace />;
}

function ProjectsWorkspace() {
  const { t } = useI18n();
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
        <h2>{t('cp.yourProjects')}</h2>
        {error && <div className="account-error" role="alert">{error}</div>}
        {projects === null ? (
          <p className="settings-hint">{t('cp.loading')}</p>
        ) : projects.length === 0 ? (
          <p className="settings-hint">{t('cp.noProjects')}</p>
        ) : (
          <div className="project-list">
            {projects.map((p) => (
              <button key={p.id} className="project-row" onClick={() => setSelected(p)}>
                <span className="project-name">{p.name}</span>
                <span className={`project-role role-${p.role}`}>{p.role ? t(ROLE_LABEL_KEYS[p.role]) : ''}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="settings-section">
        <h2>{t('cp.newProject')}</h2>
        <form className="account-form" onSubmit={handleCreate}>
          <label className="account-field">
            <span>{t('cp.projectName')}</span>
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={120} required />
          </label>
          <button className="chip-btn primary" type="submit" disabled={creating || !newName.trim()}>
            {creating ? t('cp.creating') : t('cp.createProject')}
          </button>
        </form>
        <p className="settings-hint">{t('cp.ownerHint')}</p>
      </section>
    </main>
  );
}

function ProjectDetail({ project, onBack }: { project: Project; onBack: () => void }) {
  const { t } = useI18n();
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
    const tr = await listCloudTrials(token, project.id, undefined, branchId);
    if (tr.ok) setTrials(tr.data);
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
    const r = await createMergeRequest(token, project.id, activeBranch, mrTarget, t('cp.mergeName', { src: src?.name ?? '', tgt: tgt?.name ?? '' }));
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
  for (const tr of trials ?? []) {
    const arr = byExperiment.get(tr.experimentId) ?? [];
    arr.push(tr);
    byExperiment.set(tr.experimentId, arr);
  }

  return (
    <main className="settings-view" id="main-content" tabIndex={-1}>
      <button className="chip-btn" onClick={onBack}>{t('cp.allProjects')}</button>

      <section className="settings-section">
        <h2>{project.name}</h2>
        <div className="stat-row">
          <span>{t('cp.yourRole')}</span>
          <span className={`project-role role-${project.role}`}>{project.role ? t(ROLE_LABEL_KEYS[project.role]) : ''}</span>
        </div>
        {error && <div className="account-error" role="alert">{error}</div>}
      </section>

      <section className="settings-section">
        <h2>{t('cp.branches.h')}</h2>
        <p className="settings-hint">{t('cp.branches.hint')}</p>
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
              <span>{t('cp.newBranch', { base: branchName(activeBranch) })}</span>
              <input type="text" value={newBranch} onChange={(e) => setNewBranch(e.target.value)} maxLength={80} placeholder={t('cp.newBranch.ph')} />
            </label>
            <label className="toggle-inline">
              <input type="checkbox" checked={forkOnCreate} onChange={(e) => setForkOnCreate(e.target.checked)} />
              <span>{t('cp.forkCopy')}</span>
            </label>
            <button className="chip-btn" type="submit" disabled={!newBranch.trim()}>{t('cp.createBranch')}</button>
          </form>
        )}
      </section>

      <section className="settings-section">
        <h2>{t('cp.versionHistory', { branch: branchName(activeBranch) })}</h2>
        <p className="settings-hint">{t('cp.versionHistory.hint')}</p>
        {trials === null ? (
          <p className="settings-hint">{t('cp.loading')}</p>
        ) : trials.length === 0 ? (
          <p className="settings-hint">{t('cp.noBranchTrials')}</p>
        ) : (
          [...byExperiment.entries()].map(([experimentId, list]) => (
            <div className="cloud-experiment" key={experimentId}>
              <div className="section-label">{experimentId} · {t('cp.trialsCount', { n: list.length })}</div>
              <div className="trial-list">
                {list.map((tr) => (
                  <div key={tr.id} className={`trial-row status-${tr.status}`}>
                    <span className="trial-idx">#{String(tr.index).padStart(3, '0')}</span>
                    <span className="trial-label">{tr.label}{tr.parentId && <span className="trial-fork" title={t('cp.trial.forkTitle')}> ⑂</span>}</span>
                    <span className={`trial-status status-${tr.status}`}>{t(STATUS_LABEL_KEYS[tr.status])}</span>
                    {tr.modelVersion && <span className="cloud-modelver" title={t('cp.trial.modelverTitle')}>{tr.modelVersion}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </section>

      <section className="settings-section">
        <h2>{t('cp.merges.h')}</h2>
        {canWrite && branches.length > 1 && (
          <div className="mr-open">
            <label className="account-field">
              <span>{t('cp.mergeTo', { branch: branchName(activeBranch) })}</span>
              <select value={mrTarget} onChange={(e) => setMrTarget(e.target.value)}>
                <option value="">{t('cp.chooseBranch')}</option>
                {branches.filter((b) => b.id !== activeBranch).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
            <button className="chip-btn" onClick={handleOpenMr} disabled={!mrTarget}>{t('cp.requestMerge')}</button>
          </div>
        )}
        {mrs.length === 0 ? (
          <p className="settings-hint">{t('cp.noMerges')}</p>
        ) : (
          <div className="mr-list">
            {mrs.map((mr) => (
              <div key={mr.id} className={`mr-row status-${mr.status}`}>
                <div className="mr-main">
                  <span className="mr-title">{mr.title}</span>
                  <span className="mr-branches">{branchName(mr.sourceBranchId)} → {branchName(mr.targetBranchId)}</span>
                </div>
                <span className={`mr-status status-${mr.status}`}>{t(MERGE_STATUS_KEYS[mr.status])}{mr.status === 'merged' ? ` (${mr.mergedCount})` : ''}</span>
                {mr.status === 'open' && canReview && (
                  <div className="mr-actions">
                    <button className="chip-btn tiny" onClick={() => handleDecide(mr.id, true)} title={t('cp.mergeTitle')}>{t('cp.merge')}</button>
                    <button className="chip-btn tiny danger" onClick={() => handleDecide(mr.id, false)} title={t('cp.rejectTitle')}>✕</button>
                  </div>
                )}
                {mr.status === 'open' && !canReview && <span className="mr-hint">{t('cp.awaitReview')}</span>}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="settings-section">
        <h2>{t('cp.contrib.h')}</h2>
        {contrib === null ? (
          <p className="settings-hint">{t('cp.loading')}</p>
        ) : contrib.totalTrials === 0 ? (
          <p className="settings-hint">{t('cp.noContrib')}</p>
        ) : (
          <>
            <p className="settings-hint">{t('cp.contribTotal', { n: contrib.totalTrials })}</p>
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
        <h2>{t('cp.collaborators.h')}</h2>
        {members === null ? (
          <p className="settings-hint">{t('cp.loading')}</p>
        ) : (
          <div className="member-list">
            {members.map((m) => (
              <div className="member-row" key={m.userId}>
                <span className="member-name">{m.displayName} <span className="account-email">{m.email}</span></span>
                <span className={`project-role role-${m.role}`}>{t(ROLE_LABEL_KEYS[m.role])}</span>
              </div>
            ))}
          </div>
        )}
        {canManageMembers(project.role) && (
          <form className="account-form" onSubmit={handleAddMember}>
            <label className="account-field">
              <span>{t('cp.memberEmail')}</span>
              <input type="email" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} required />
            </label>
            <label className="account-field">
              <span>{t('cp.role')}</span>
              <select value={memberRole} onChange={(e) => setMemberRole(e.target.value as ProjectRole)}>
                <option value="viewer">{t('cp.roleOpt.viewer')}</option>
                <option value="editor">{t('cp.roleOpt.editor')}</option>
                <option value="admin">{t('cp.roleOpt.admin')}</option>
                {project.role === 'owner' && <option value="owner">{t('cp.role.owner')}</option>}
              </select>
            </label>
            <button className="chip-btn" type="submit" disabled={!memberEmail.trim()}>{t('cp.addChangeRole')}</button>
          </form>
        )}
      </section>
    </main>
  );
}
