/**
 * Autonomous Discovery Forge — product screen (Final WOW Mandate).
 * A non-programmer picks a project, supplies seed scaffolds + bounds, runs a REAL
 * multi-generation computational campaign, and sees the Discovery Dossier: generation
 * history, PLAN MUTATIONS (the autonomy proof), Necropolis avoidance, engines executed vs.
 * honestly capability-blocked, and ranked COMPUTATIONAL candidates. No fabricated science.
 */
import { useEffect, useState } from 'react';
import { useSession, getToken } from '../core/backend/session';
import {
  listProjects, runDiscoveryCampaign,
  type Project, type DiscoveryRunResult, type DiscoveryDossier,
} from '../core/backend/client';
import { AccountPanel } from './AccountPanel';
import { useI18n } from '../core/i18n';

const DEFAULT_SEEDS = 'aspirin, CC(=O)Oc1ccccc1C(=O)O\nibuprofen, CC(C)Cc1ccc(C(C)C(=O)O)cc1\nparacetamol, CC(=O)Nc1ccc(O)cc1';

export function DiscoveryForgeScreen() {
  const { t } = useI18n();
  const session = useSession();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [seedsText, setSeedsText] = useState(DEFAULT_SEEDS);
  const [challenge, setChallenge] = useState('Computational developability optimization of textbook analogues');
  const [maxMolWt, setMaxMolWt] = useState(320);
  const [maxGen, setMaxGen] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DiscoveryRunResult | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    void listProjects(token).then((r) => {
      if (r.ok) {
        const w = r.data.filter((p) => p.role === 'owner' || p.role === 'admin' || p.role === 'editor');
        setProjects(w); setProjectId((c) => c || (w[0]?.id ?? ''));
      }
    });
  }, [session]);

  if (!session) {
    return (
      <div className="settings-view">
        <h2>🧬 Autonomous Discovery Forge</h2>
        <p className="settings-hint">{t('df.signin')}</p>
        <AccountPanel />
      </div>
    );
  }

  function parseSeeds() {
    return seedsText.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
      const [name, smiles] = l.split(',').map((x) => x.trim());
      return { name: name || 'seed', smiles: smiles || name };
    }).filter((s) => s.smiles);
  }

  async function onRun() {
    const token = getToken();
    if (!token || !projectId) { setError(t('df.err.pickProject')); return; }
    setError(null); setBusy(true); setResult(null);
    const r = await runDiscoveryCampaign(token, projectId, { seeds: parseSeeds(), challenge: { grandChallenge: challenge, maxMolWt, maxAlerts: 0 }, maxGenerations: maxGen, maxCandidatesPerGen: 14 });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setResult(r.data);
  }

  return (
    <div className="settings-view discovery-forge">
      <h2>🧬 Autonomous Discovery Forge</h2>
      <p className="settings-hint">
        {t('df.intro.a')}<strong>{t('df.intro.b')}</strong>{t('df.intro.c')}<em>{t('df.intro.d')}</em>{t('df.intro.e')}
      </p>

      <section className="settings-section">
        <div className="form-grid">
          <label>{t('df.label.project')}
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.length === 0 && <option value="">{t('df.noWritableProjects')}</option>}
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label>Grand Challenge
            <input value={challenge} onChange={(e) => setChallenge(e.target.value)} />
          </label>
          <label>{t('df.label.seeds')}
            <textarea rows={3} value={seedsText} onChange={(e) => setSeedsText(e.target.value)} />
          </label>
          <label>{t('df.label.maxMolWt')}<input type="number" value={maxMolWt} onChange={(e) => setMaxMolWt(Number(e.target.value))} /></label>
          <label>{t('df.label.generations')}<input type="number" min={1} max={4} value={maxGen} onChange={(e) => setMaxGen(Number(e.target.value))} /></label>
          <button className="primary-btn" disabled={busy || !projectId} onClick={() => void onRun()}>
            {busy ? t('df.busy') : t('df.run')}
          </button>
        </div>
        {error && <p className="error-text" role="alert">{error}</p>}
      </section>

      {result && <DossierView result={result} />}
    </div>
  );
}

function DossierView({ result }: { result: DiscoveryRunResult }) {
  const { t } = useI18n();
  const d: DiscoveryDossier = result.dossier;
  const mutated = d.planMutations.some((m) => m.previousPlanHash !== m.newPlanHash);
  return (
    <section className="settings-section truth-result">
      <h3>Discovery Dossier</h3>
      <div className="metric-grid">
        <div className="metric-cell"><span className="metric-label">{t('df.status')}</span><span className="metric-value">{d.finalStatus}</span></div>
        <div className="metric-cell"><span className="metric-label">{t('df.stopReason')}</span><span className="metric-value">{d.stopReason ?? '—'}</span></div>
        <div className="metric-cell"><span className="metric-label">{t('df.candidates')}</span><span className="metric-value">{d.rankedComputationalCandidates.length}</span></div>
        <div className="metric-cell"><span className="metric-label">{t('df.dossierHash')}</span><code className="small">{d.dossierHash.slice(0, 16)}…</code></div>
      </div>

      <div className={`truth-block ${mutated ? '' : 'muted'}`}>
        <h4>{t('df.autonomyProof')}{mutated ? '✔' : t('df.noMutation')}</h4>
        {d.planMutations.length === 0 && <p className="muted small">{t('df.noMutations')}</p>}
        <ul className="plain-list small">
          {d.planMutations.map((m, i) => (
            <li key={i}>
              gen {m.generation}: <strong>{m.mutationType}</strong> ({m.trigger}) —{' '}
              <code>{m.previousPlanHash.slice(0, 10)}…</code> → <code>{m.newPlanHash.slice(0, 10)}…</code>
              {' '}<span className={m.previousPlanHash !== m.newPlanHash ? 'ok-text' : 'muted'}>{m.previousPlanHash !== m.newPlanHash ? t('df.changed') : t('df.unchanged')}</span>
              <div className="muted">{m.rationale.join('; ')}</div>
            </li>
          ))}
        </ul>
      </div>

      <div className="truth-block">
        <h4>{t('df.genHistory')}</h4>
        <ul className="plain-list small">
          {d.generationHistory.map((g) => (
            <li key={g.generation}>{t('df.genLine', { gen: g.generation, n: g.cohortSize, transforms: g.transformsUsed.join(', ') })}<code>{g.planHash.slice(0, 10)}…</code></li>
          ))}
        </ul>
      </div>

      {d.failureRegionsAvoided.length > 0 && (
        <div className="truth-block">
          <h4>{t('df.necropolis')}</h4>
          <p className="small ok-text">{t('df.necropolisNote', { n: d.failureRegionsAvoided.length })}</p>
        </div>
      )}

      <div className="truth-block">
        <h4>{t('df.engines')}</h4>
        <p className="small"><strong>{t('df.executed')}</strong> {d.enginesExecuted.join(', ')}</p>
        <p className="small muted"><strong>{t('df.blocked')}</strong> {d.enginesSkipped.map((e) => `${e.engine} — ${e.reason}`).join(' · ')}</p>
      </div>

      <div className="truth-block">
        <h4>{t('df.ranking')}</h4>
        {d.rankedComputationalCandidates.length === 0 && <p className="small muted">{t('df.noSurvivors')}</p>}
        <ul className="plain-list small truth-stages">
          {d.rankedComputationalCandidates.map((c, i) => (
            <li key={c.id}>#{i + 1} <code>{c.canonical}</code> · rank {c.rank} · {t('df.novelty')}: {c.novelty}</li>
          ))}
        </ul>
      </div>

      <footer className="pilot-report-footer">
        <p className="small muted">{d.limitationStatement}</p>
        <p className="small muted">{d.classification}</p>
      </footer>
    </section>
  );
}
