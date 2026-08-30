import { useCallback, useEffect, useState } from 'react';
import { useSession, getToken } from '../core/backend/session';
import {
  listProjects, listCapabilities, listTargets, createTarget, listCandidates, createCandidate,
  getCandidatePassport, getCandidateRanking,
  type Project, type Capability, type Target, type Candidate, type CandidatePassport, type RankedCandidate,
} from '../core/backend/client';
import { AccountPanel } from './AccountPanel';

/**
 * Drug Discovery — reachable workspace (P6.9). Uczciwy przepływ na Backend
 * Compute Engine: projekt → cel biologiczny → kandydaci (realna cheminformatyka)
 * → paszport (realne właściwości + WIDOCZNE luki zdolności) → ranking. Nic tu nie
 * udaje dokowania/ADMET/toksyczności ani „leku".
 */

const STATUS_LABEL: Record<string, string> = {
  AVAILABLE: 'dostępne', NOT_IMPLEMENTED: 'niezaimplementowane',
  EXTERNAL_ENGINE_REQUIRED: 'wymaga zewn. silnika', MODEL_NOT_VALID_FOR_DOMAIN: 'model poza dziedziną',
};

export function DrugDiscoveryScreen() {
  const session = useSession();
  if (!session) {
    return (
      <main className="settings-view" id="main-content" tabIndex={-1}>
        <section className="settings-section">
          <h2>Drug Discovery</h2>
          <p className="settings-hint">
            Zaloguj się, aby projektować cele biologiczne i oceniać kandydatów obliczeniowych. Platforma liczy realną
            chemię (masa molowa, skład) i JAWNIE oznacza brakujące zdolności (dokowanie, ADMET, toksyczność) — niczego
            nie zmyśla. To nie jest narzędzie diagnostyczne ani deklaracja skuteczności leku.
          </p>
          <AccountPanel />
        </section>
      </main>
    );
  }
  return <DrugWorkspace />;
}

function DrugWorkspace() {
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
    const [t, c, r] = await Promise.all([
      listTargets(token, projectId), listCandidates(token, projectId), getCandidateRanking(token, projectId),
    ]);
    if (t.ok) setTargets(t.data);
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
    const r = await createCandidate(token, projectId, { label: candLabel.trim() || 'Kandydat', formula: candFormula.trim(), targetId: targets[0]?.id });
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
        <h2>Drug Discovery — projektowanie obliczeniowe</h2>
        <p className="settings-hint">
          Uczciwy przepływ: cel → kandydaci → paszport → ranking. Liczymy realną chemię; brakujące zdolności są widoczne.
          „Kandydat obliczeniowy" ≠ lek. Każdy wymaga walidacji laboratoryjnej.
        </p>
        {projects.length === 0 ? (
          <p className="settings-hint">Nie masz projektu z prawem zapisu. Utwórz projekt w zakładce „Projekty".</p>
        ) : (
          <label className="account-field">
            <span>Projekt</span>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        {error && <div className="account-error" role="alert">{error}</div>}
      </section>

      <section className="settings-section">
        <h2>Cel biologiczny</h2>
        <div className="member-list">
          {targets.map((t) => (
            <div className="member-row" key={t.id}>
              <span className="member-name">{t.name} {t.indication && <span className="account-email">{t.indication}</span>}</span>
              <span className="project-role">{t.evidenceStatus}</span>
            </div>
          ))}
        </div>
        <form className="account-form" onSubmit={addTarget}>
          <label className="account-field"><span>Nazwa celu (gen/białko)</span>
            <input type="text" value={targetName} onChange={(e) => setTargetName(e.target.value)} placeholder="np. EGFR" /></label>
          <label className="account-field"><span>Wskazanie</span>
            <input type="text" value={targetIndication} onChange={(e) => setTargetIndication(e.target.value)} placeholder="np. NSCLC" /></label>
          <button className="chip-btn" type="submit" disabled={!targetName.trim()}>Zdefiniuj cel</button>
        </form>
      </section>

      <section className="settings-section">
        <h2>Kandydaci molekularni</h2>
        <form className="account-form" onSubmit={addCandidate}>
          <label className="account-field"><span>Etykieta</span>
            <input type="text" value={candLabel} onChange={(e) => setCandLabel(e.target.value)} placeholder="np. Aspiryna (ref)" /></label>
          <label className="account-field"><span>Wzór sumaryczny (v1: bez nawiasów)</span>
            <input type="text" value={candFormula} onChange={(e) => setCandFormula(e.target.value)} placeholder="np. C9H8O4" /></label>
          <button className="chip-btn primary" type="submit" disabled={!candFormula.trim()}>Dodaj kandydata</button>
        </form>
        <div className="trial-list">
          {candidates.map((c) => {
            const rk = rankByCandidate.get(c.id);
            return (
              <div className="trial-row" key={c.id}>
                {rk && <span className="trial-idx">#{rk.rank}</span>}
                <span className="trial-label">{c.label} <span className="cloud-modelver">{c.formula}</span></span>
                <span className="cloud-modelver">{c.molecularWeight ? `${c.molecularWeight.toFixed(2)} g/mol` : '—'}</span>
                <button className="chip-btn tiny" onClick={() => openPassport(c.id)}>paszport</button>
              </div>
            );
          })}
        </div>
      </section>

      {passport && (
        <section className="settings-section">
          <h2>Paszport kandydata · {passport.label}</h2>
          <div className="cde-verdict rejected" role="status" style={{ borderColor: 'var(--gold)', color: 'var(--gold)' }}>
            {passport.verdict}
          </div>

          <div className="section-label">Tożsamość i struktura</div>
          <div className="cde-results">
            <div className="cde-result"><span className="cde-result-label">Candidate ID</span><span className="cde-result-actual">{passport.candidateId}</span></div>
            <div className="cde-result"><span className="cde-result-label">Target ID</span><span className="cde-result-actual">{passport.targetId ?? 'NOT_AVAILABLE'}</span></div>
            <div className="cde-result"><span className="cde-result-label">Formula</span><span className="cde-result-actual">{passport.representation.formula ?? 'NOT_AVAILABLE'}</span></div>
            <div className="cde-result"><span className="cde-result-label">SMILES</span><span className="cde-result-actual">{passport.representation.smiles ?? 'NOT_AVAILABLE'}</span></div>
            <div className="cde-result"><span className="cde-result-label">Charge</span><span className="cde-result-actual">{passport.representation.charge}</span></div>
          </div>

          <div className="section-label">Modele i źródło</div>
          <div className="cde-results">
            {passport.modelsExecuted.length > 0 ? passport.modelsExecuted.map((model) => (
              <div className="cde-result" key={`${model.modelId}-${model.version ?? 'unknown'}`}>
                <span className="project-role role-owner">{model.status}</span>
                <span className="cde-result-label">{model.modelId}</span>
                <span className="cde-result-actual">{model.version ?? 'VERSION_UNKNOWN'}</span>
              </div>
            )) : <div className="cde-reason">NOT_AVAILABLE — brak zarejestrowanego modelu wykonawczego.</div>}
          </div>
          <p className="settings-hint">Źródło zewnętrzne: NOT_AVAILABLE w tym paszporcie. Nie traktuj identyfikatora kandydata jako dowodu pochodzenia.</p>

          <div className="section-label">Policzone właściwości (realne)</div>
          <div className="cde-results">
            {Object.keys(passport.calculatedProperties).length > 0 ? Object.entries(passport.calculatedProperties).map(([k, v]) => (
              <div className="cde-result pass" key={k}>
                <span className="cde-result-label">{k}</span>
                <span className="cde-result-actual">{typeof v === 'number' ? v.toFixed(3) : String(v)}</span>
              </div>
            )) : <div className="cde-reason">NOT_AVAILABLE — brak policzonych właściwości.</div>}
          </div>

          <div className="section-label">Składniki oceny</div>
          {passport.scoreComponents.map((s) => (
            <div className="cde-result" key={s.id}>
              <span className={`project-role ${s.kind === 'heuristic' ? 'role-editor' : 'role-owner'}`}>{s.kind === 'heuristic' ? 'heurystyka' : 'obliczone'}</span>
              <span className="cde-result-label">{s.label}</span>
              <span className="cde-result-actual">{s.value}{s.unit ? ` ${s.unit}` : ''}</span>
              {s.note && <span className="cde-result-bound">{s.note}</span>}
            </div>
          ))}

          <div className="section-label">Luki zdolności (CAPABILITY GAP DETECTED)</div>
          <div className="cde-market">
            {passport.capabilityGaps.map((g) => (
              <div className="cde-listing" key={g.id}>
                <span className="cde-listing-name">{g.label}</span>
                <span className="project-role role-viewer">{STATUS_LABEL[g.status] ?? g.status}</span>
              </div>
            ))}
          </div>

          <div className="section-label">Rekomendowane pomiary / obliczenia</div>
          {passport.measurementRecommendations.map((m) => (
            <div className="cde-reason" key={m.capability}>• {m.label} — {m.requires ?? STATUS_LABEL[m.status]}</div>
          ))}

          <div className="section-label">Wymagana walidacja laboratoryjna</div>
          {passport.requiredLaboratoryValidation.map((v, i) => <div className="cde-reason" key={i}>• {v}</div>)}

          <p className="settings-hint">Niepewność: {passport.uncertainty} · runIds: {passport.runIds.join(', ')}</p>
        </section>
      )}

      <section className="settings-section">
        <h2>Manifest zdolności obliczeniowych</h2>
        <p className="settings-hint">Co Genesis Lab realnie liczy, a co wymaga zewnętrznego silnika. Metody niedostępne NIGDY nie zwracają zmyślonych liczb.</p>
        <div className="cde-market">
          {capabilities.map((c) => (
            <div className="cde-listing" key={c.id}>
              <span className="cde-listing-name">{c.label}</span>
              <span className={`project-role ${c.status === 'AVAILABLE' ? 'role-owner' : 'role-viewer'}`}>{STATUS_LABEL[c.status] ?? c.status}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
