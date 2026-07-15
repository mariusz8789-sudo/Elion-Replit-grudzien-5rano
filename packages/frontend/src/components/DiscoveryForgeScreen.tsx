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

const DEFAULT_SEEDS = 'aspirin, CC(=O)Oc1ccccc1C(=O)O\nibuprofen, CC(C)Cc1ccc(C(C)C(=O)O)cc1\nparacetamol, CC(=O)Nc1ccc(O)cc1';

export function DiscoveryForgeScreen() {
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
        <p className="settings-hint">Zaloguj się, aby uruchamiać autonomiczne kampanie obliczeniowe w kontekście projektu (najemcy).</p>
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
    if (!token || !projectId) { setError('Wybierz projekt.'); return; }
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
        Autonomiczna, wielogeneracyjna kampania obliczeniowa: generacja analogów (realny RDKit) → lejek → krytyk →
        pamięć porażek → <strong>mutacja planu</strong> → następna generacja. Wynik to <em>kandydaci obliczeniowi</em> —
        hipotezy do walidacji, NIE zwalidowane leki. Dokowanie/MD/QM są jawnie zablokowane, gdy brak realnych wejść.
      </p>

      <section className="settings-section">
        <div className="form-grid">
          <label>Projekt (najemca)
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.length === 0 && <option value="">— brak projektów z prawem zapisu —</option>}
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label>Grand Challenge
            <input value={challenge} onChange={(e) => setChallenge(e.target.value)} />
          </label>
          <label>Scaffoldy startowe (nazwa, SMILES — jeden na linię)
            <textarea rows={3} value={seedsText} onChange={(e) => setSeedsText(e.target.value)} />
          </label>
          <label>Maks. masa molowa<input type="number" value={maxMolWt} onChange={(e) => setMaxMolWt(Number(e.target.value))} /></label>
          <label>Liczba generacji<input type="number" min={1} max={4} value={maxGen} onChange={(e) => setMaxGen(Number(e.target.value))} /></label>
          <button className="primary-btn" disabled={busy || !projectId} onClick={() => void onRun()}>
            {busy ? 'Kampania w toku (realne silniki)…' : 'Uruchom autonomiczną kampanię'}
          </button>
        </div>
        {error && <p className="error-text" role="alert">{error}</p>}
      </section>

      {result && <DossierView result={result} />}
    </div>
  );
}

function DossierView({ result }: { result: DiscoveryRunResult }) {
  const d: DiscoveryDossier = result.dossier;
  const mutated = d.planMutations.some((m) => m.previousPlanHash !== m.newPlanHash);
  return (
    <section className="settings-section truth-result">
      <h3>Discovery Dossier</h3>
      <div className="metric-grid">
        <div className="metric-cell"><span className="metric-label">Status</span><span className="metric-value">{d.finalStatus}</span></div>
        <div className="metric-cell"><span className="metric-label">Powód stopu</span><span className="metric-value">{d.stopReason ?? '—'}</span></div>
        <div className="metric-cell"><span className="metric-label">Kandydaci</span><span className="metric-value">{d.rankedComputationalCandidates.length}</span></div>
        <div className="metric-cell"><span className="metric-label">Hash dossier</span><code className="small">{d.dossierHash.slice(0, 16)}…</code></div>
      </div>

      <div className={`truth-block ${mutated ? '' : 'muted'}`}>
        <h4>Dowód autonomii — mutacje planu {mutated ? '✔' : '(brak)'}</h4>
        {d.planMutations.length === 0 && <p className="muted small">Brak mutacji (kampania jednogeneracyjna lub natychmiastowa konwergencja).</p>}
        <ul className="plain-list small">
          {d.planMutations.map((m, i) => (
            <li key={i}>
              gen {m.generation}: <strong>{m.mutationType}</strong> ({m.trigger}) —{' '}
              <code>{m.previousPlanHash.slice(0, 10)}…</code> → <code>{m.newPlanHash.slice(0, 10)}…</code>
              {' '}<span className={m.previousPlanHash !== m.newPlanHash ? 'ok-text' : 'muted'}>{m.previousPlanHash !== m.newPlanHash ? 'ZMIANA' : 'bez zmian'}</span>
              <div className="muted">{m.rationale.join('; ')}</div>
            </li>
          ))}
        </ul>
      </div>

      <div className="truth-block">
        <h4>Historia generacji</h4>
        <ul className="plain-list small">
          {d.generationHistory.map((g) => (
            <li key={g.generation}>gen {g.generation}: {g.cohortSize} kandydat(ów) via [{g.transformsUsed.join(', ')}] · plan <code>{g.planHash.slice(0, 10)}…</code></li>
          ))}
        </ul>
      </div>

      {d.failureRegionsAvoided.length > 0 && (
        <div className="truth-block">
          <h4>Unikanie martwych końców (Necropolis)</h4>
          <p className="small ok-text">{d.failureRegionsAvoided.length} kandydat(ów) pominięto jako znane martwe końce w kolejnych generacjach.</p>
        </div>
      )}

      <div className="truth-block">
        <h4>Silniki</h4>
        <p className="small"><strong>Wykonane:</strong> {d.enginesExecuted.join(', ')}</p>
        <p className="small muted"><strong>Zablokowane (uczciwie):</strong> {d.enginesSkipped.map((e) => `${e.engine} — ${e.reason}`).join(' · ')}</p>
      </div>

      <div className="truth-block">
        <h4>Ranking kandydatów obliczeniowych</h4>
        {d.rankedComputationalCandidates.length === 0 && <p className="small muted">Brak ocalałych — uczciwy wynik negatywny (żaden zmyślony zwycięzca).</p>}
        <ul className="plain-list small truth-stages">
          {d.rankedComputationalCandidates.map((c, i) => (
            <li key={c.id}>#{i + 1} <code>{c.canonical}</code> · rank {c.rank} · nowość: {c.novelty}</li>
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
