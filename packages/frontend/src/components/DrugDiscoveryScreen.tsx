import { useCallback, useEffect, useState } from 'react';
import { useSession, getToken } from '../core/backend/session';
import {
  listProjects, listCapabilities, listTargets, createTarget, listCandidates, createCandidate,
  getCandidatePassport, getCandidateRanking,
  type Project, type Capability, type Target, type Candidate, type CandidatePassport, type RankedCandidate,
} from '../core/backend/client';
import { AccountPanel } from './AccountPanel';
import { useI18n } from '../core/i18n';

/**
 * Drug Discovery — reachable workspace (P6.9). Uczciwy przepływ na Backend
 * Compute Engine: projekt → cel biologiczny → kandydaci (realna cheminformatyka)
 * → paszport (realne właściwości + WIDOCZNE luki zdolności) → ranking. Nic tu nie
 * udaje dokowania/ADMET/toksyczności ani „leku". Wszystkie napisy przez seam i18n.
 */

const STATUS_LABEL_KEYS: Record<string, string> = {
  AVAILABLE: 'dd.status.available', NOT_IMPLEMENTED: 'dd.status.notImplemented',
  EXTERNAL_ENGINE_REQUIRED: 'dd.status.externalEngine', MODEL_NOT_VALID_FOR_DOMAIN: 'dd.status.outOfDomain',
};

export function DrugDiscoveryScreen() {
  const { t } = useI18n();
  const session = useSession();
  if (!session) {
    return (
      <main className="settings-view" id="main-content" tabIndex={-1}>
        <section className="settings-section">
          <h2>Drug Discovery</h2>
          <p className="settings-hint">{t('dd.signin')}</p>
          <AccountPanel />
        </section>
      </main>
    );
  }
  return <DrugWorkspace />;
}

function DrugWorkspace() {
  const { t } = useI18n();
  const statusLabel = (s: string) => (STATUS_LABEL_KEYS[s] ? t(STATUS_LABEL_KEYS[s]) : s);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [targets, setTargets] = useState<Target[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [ranking, setRanking] = useState<RankedCandidate[]>([]);
  const [passport, setPassport] = useState<CandidatePassport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [targetName, setTargetName] = useState('');
  const [targetIndication, setTargetIndication] = useState('');
  const [candLabel, setCandLabel] = useState('');
  const [candFormula, setCandFormula] = useState('');

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    void listCapabilities().then((r) => { if (r.ok) setCapabilities(r.data); });
    void listProjects(token).then((r) => {
      if (r.ok) {
        const writable = r.data.filter((p) => p.role === 'owner' || p.role === 'admin' || p.role === 'editor');
        setProjects(writable);
        if (writable[0]) setProjectId((cur) => cur || writable[0].id);
      }
    });
  }, []);

  const reload = useCallback(async () => {
    const token = getToken();
    if (!token || !projectId) return;
    const [tg, c, r] = await Promise.all([
      listTargets(token, projectId), listCandidates(token, projectId), getCandidateRanking(token, projectId),
    ]);
    if (tg.ok) setTargets(tg.data);
    if (c.ok) setCandidates(c.data);
    if (r.ok) setRanking(r.data);
  }, [projectId]);

  useEffect(() => { setPassport(null); void reload(); }, [reload]);

  async function addTarget(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token || !projectId || !targetName.trim()) return;
    const r = await createTarget(token, projectId, { name: targetName.trim(), indication: targetIndication.trim() });
    if (r.ok) { setTargetName(''); setTargetIndication(''); setError(null); await reload(); } else setError(r.message);
  }

  async function addCandidate(e: React.FormEvent) {
    e.preventDefault();
    const token = getToken();
    if (!token || !projectId || !candFormula.trim()) return;
    const r = await createCandidate(token, projectId, { label: candLabel.trim() || t('dd.cand.default'), formula: candFormula.trim(), targetId: targets[0]?.id });
    if (r.ok) { setCandLabel(''); setCandFormula(''); setError(null); await reload(); } else setError(r.message);
  }

  async function openPassport(candidateId: string) {
    const token = getToken();
    if (!token) return;
    const r = await getCandidatePassport(token, projectId, candidateId);
    if (r.ok) setPassport(r.data); else setError(r.message);
  }

  const rankByCandidate = new Map(ranking.map((r) => [r.candidateId, r]));

  return (
    <main className="settings-view cde-view" id="main-content" tabIndex={-1}>
      <section className="settings-section">
        <h2>{t('dd.title')}</h2>
        <p className="settings-hint">{t('dd.intro')}</p>
        {projects.length === 0 ? (
          <p className="settings-hint">{t('dd.noProject')}</p>
        ) : (
          <label className="account-field">
            <span>{t('dd.project')}</span>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        {error && <div className="account-error" role="alert">{error}</div>}
      </section>

      <section className="settings-section">
        <h2>{t('dd.target.h')}</h2>
        <div className="member-list">
          {targets.map((tg) => (
            <div className="member-row" key={tg.id}>
              <span className="member-name">{tg.name} {tg.indication && <span className="account-email">{tg.indication}</span>}</span>
              <span className="project-role">{tg.evidenceStatus}</span>
            </div>
          ))}
        </div>
        <form className="account-form" onSubmit={addTarget}>
          <label className="account-field"><span>{t('dd.target.name')}</span>
            <input type="text" value={targetName} onChange={(e) => setTargetName(e.target.value)} placeholder={t('dd.ph.target')} /></label>
          <label className="account-field"><span>{t('dd.target.indication')}</span>
            <input type="text" value={targetIndication} onChange={(e) => setTargetIndication(e.target.value)} placeholder={t('dd.ph.indication')} /></label>
          <button className="chip-btn" type="submit" disabled={!targetName.trim()}>{t('dd.target.define')}</button>
        </form>
      </section>

      <section className="settings-section">
        <h2>{t('dd.cand.h')}</h2>
        <form className="account-form" onSubmit={addCandidate}>
          <label className="account-field"><span>{t('dd.cand.label')}</span>
            <input type="text" value={candLabel} onChange={(e) => setCandLabel(e.target.value)} placeholder={t('dd.ph.label')} /></label>
          <label className="account-field"><span>{t('dd.cand.formula')}</span>
            <input type="text" value={candFormula} onChange={(e) => setCandFormula(e.target.value)} placeholder={t('dd.ph.formula')} /></label>
          <button className="chip-btn primary" type="submit" disabled={!candFormula.trim()}>{t('dd.cand.add')}</button>
        </form>
        <div className="trial-list">
          {candidates.map((c) => {
            const rk = rankByCandidate.get(c.id);
            return (
              <div className="trial-row" key={c.id}>
                {rk && <span className="trial-idx">#{rk.rank}</span>}
                <span className="trial-label">{c.label} <span className="cloud-modelver">{c.formula}</span></span>
                <span className="cloud-modelver">{c.molecularWeight ? `${c.molecularWeight.toFixed(2)} g/mol` : '—'}</span>
                <button className="chip-btn tiny" onClick={() => openPassport(c.id)}>{t('dd.passport')}</button>
              </div>
            );
          })}
        </div>
      </section>

      {passport && (
        <section className="settings-section">
          <h2>{t('dd.passport.h')}{passport.label}</h2>
          <div className="cde-verdict rejected" role="status" style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}>
            {passport.verdict}
          </div>

          <div className="section-label">{t('dd.calcProps')}</div>
          <div className="cde-results">
            {Object.entries(passport.calculatedProperties).map(([k, v]) => (
              <div className="cde-result pass" key={k}>
                <span className="cde-result-label">{k}</span>
                <span className="cde-result-actual">{typeof v === 'number' ? v.toFixed(3) : String(v)}</span>
              </div>
            ))}
          </div>

          <div className="section-label">{t('dd.scoreComponents')}</div>
          {passport.scoreComponents.map((s) => (
            <div className="cde-result" key={s.id}>
              <span className={`project-role ${s.kind === 'heuristic' ? 'role-editor' : 'role-owner'}`}>{s.kind === 'heuristic' ? t('dd.heuristic') : t('dd.computed')}</span>
              <span className="cde-result-label">{s.label}</span>
              <span className="cde-result-actual">{s.value}{s.unit ? ` ${s.unit}` : ''}</span>
              {s.note && <span className="cde-result-bound">{s.note}</span>}
            </div>
          ))}

          <div className="section-label">{t('dd.capGaps')}</div>
          <div className="cde-market">
            {passport.capabilityGaps.map((g) => (
              <div className="cde-listing" key={g.id}>
                <span className="cde-listing-name">{g.label}</span>
                <span className="project-role role-viewer">{statusLabel(g.status)}</span>
              </div>
            ))}
          </div>

          <div className="section-label">{t('dd.recommendations')}</div>
          {passport.measurementRecommendations.map((m) => (
            <div className="cde-reason" key={m.capability}>• {m.label} — {m.requires ?? statusLabel(m.status)}</div>
          ))}

          <div className="section-label">{t('dd.reqValidation')}</div>
          {passport.requiredLaboratoryValidation.map((v, i) => <div className="cde-reason" key={i}>• {v}</div>)}

          <p className="settings-hint">{t('dd.uncertainty')}{passport.uncertainty} · runIds: {passport.runIds.join(', ')}</p>
        </section>
      )}

      <section className="settings-section">
        <h2>{t('dd.manifest.h')}</h2>
        <p className="settings-hint">{t('dd.manifest.hint')}</p>
        <div className="cde-market">
          {capabilities.map((c) => (
            <div className="cde-listing" key={c.id}>
              <span className="cde-listing-name">{c.label}</span>
              <span className={`project-role ${c.status === 'AVAILABLE' ? 'role-owner' : 'role-viewer'}`}>{statusLabel(c.status)}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
