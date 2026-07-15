/**
 * ZEFIR Truth Engine / R&D Kill-Switch — product screen (Commercial Hardening Phase 1).
 *
 * A non-programmer submits a STRUCTURED research proposal and receives an explainable
 * GO / WARN / BLOCK / INSUFFICIENT_DATA decision, the cheapest next falsification test,
 * and a hashed, reproducible decision certificate — before spending money/compute/lab time.
 *
 * It consumes the REAL backend Truth Engine (no hardcoded decisions). Project = tenant.
 * Uses only the existing design system (settings-view / form-grid / pill / metric-grid).
 */
import { useEffect, useState } from 'react';
import { useSession, getToken } from '../core/backend/session';
import {
  listProjects, runTruthAnalysis, listTruthAnalyses, getTruthAnalysis, getNecropolisStats,
  getTruthReport, compareTruthAnalyses,
  type Project, type TruthProposal, type TruthAnalysis, type TruthAnalysisSummary,
  type KillSwitchDecision, type NecropolisStats, type PilotReport, type AnalysisComparison,
} from '../core/backend/client';
import { AccountPanel } from './AccountPanel';
import { PilotReportView } from './PilotReportView';

const DECISION_CLASS: Record<KillSwitchDecision, string> = {
  GO: 'pill-ok', WARN: 'pill-warn', BLOCK: 'pill-danger', INSUFFICIENT_DATA: 'pill-neutral',
};
const DECISION_LABEL: Record<KillSwitchDecision, string> = {
  GO: '✔ GO', WARN: '▲ WARN', BLOCK: '✖ BLOCK', INSUFFICIENT_DATA: '◌ INSUFFICIENT_DATA',
};

const numOr = (s: string): number | undefined => {
  if (s.trim() === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};
const lines = (s: string): string[] => s.split('\n').map((x) => x.trim()).filter(Boolean);

export function TruthEngineScreen() {
  const session = useSession();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [history, setHistory] = useState<TruthAnalysisSummary[]>([]);
  const [necro, setNecro] = useState<NecropolisStats | null>(null);
  const [result, setResult] = useState<TruthAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compareSel, setCompareSel] = useState<string[]>([]);
  const [comparison, setComparison] = useState<AnalysisComparison | null>(null);
  const [report, setReport] = useState<PilotReport | null>(null);

  // Proposal fields
  const [problemStatement, setProblemStatement] = useState('');
  const [proposedMechanism, setProposedMechanism] = useState('');
  const [claimedResult, setClaimedResult] = useState('');
  const [assumptions, setAssumptions] = useState('');
  const [physicalConstraints, setPhysicalConstraints] = useState('');
  const [materials, setMaterials] = useState('');
  const [requiredCapabilities, setRequiredCapabilities] = useState('');
  const [requestedDomains, setRequestedDomains] = useState('');
  const [expectedPerformance, setExpectedPerformance] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [evidence, setEvidence] = useState('');
  const [equationsJson, setEquationsJson] = useState('');
  // Structured numeric inputs
  const [energyIn, setEnergyIn] = useState(''); const [energyOut, setEnergyOut] = useState('');
  const [efficiency, setEfficiency] = useState('');
  const [flowQ, setFlowQ] = useState(''); const [flowV, setFlowV] = useState(''); const [flowT, setFlowT] = useState('');
  const [powerP, setPowerP] = useState(''); const [powerE, setPowerE] = useState(''); const [powerT, setPowerT] = useState('');
  const [tempValue, setTempValue] = useState(''); const [tempMax, setTempMax] = useState('');
  const [presValue, setPresValue] = useState(''); const [presMax, setPresMax] = useState('');
  // Necropolis matching
  const [context, setContext] = useState('');
  const [paramVectorJson, setParamVectorJson] = useState('');

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    void listProjects(token).then((r) => {
      if (r.ok) {
        const writable = r.data.filter((p) => p.role === 'owner' || p.role === 'admin' || p.role === 'editor');
        setProjects(writable);
        setProjectId((cur) => cur || (writable[0]?.id ?? ''));
      }
    });
  }, [session]);

  useEffect(() => {
    const token = getToken();
    if (!token || !projectId) return;
    void listTruthAnalyses(token, projectId).then((r) => { if (r.ok) setHistory(r.data); });
    void getNecropolisStats(token, projectId).then((r) => { if (r.ok) setNecro(r.data); });
  }, [projectId, result]);

  if (!session) {
    return (
      <div className="settings-view">
        <h2>🛑 Truth Engine / R&amp;D Kill-Switch</h2>
        <p className="settings-hint">Zaloguj się, aby uruchamiać deterministyczne analizy pre-flight w kontekście projektu (najemcy).</p>
        <AccountPanel />
      </div>
    );
  }

  function buildProposal(): TruthProposal {
    const p: TruthProposal = {};
    if (problemStatement.trim()) p.problemStatement = problemStatement.trim();
    if (proposedMechanism.trim()) p.proposedMechanism = proposedMechanism.trim();
    if (claimedResult.trim()) p.claimedResult = claimedResult.trim();
    if (assumptions.trim()) p.assumptions = lines(assumptions);
    if (physicalConstraints.trim()) p.physicalConstraints = lines(physicalConstraints);
    if (requiredCapabilities.trim()) p.requiredCapabilities = lines(requiredCapabilities);
    if (requestedDomains.trim()) p.requestedDomains = lines(requestedDomains);
    if (expectedPerformance.trim()) p.expectedPerformance = expectedPerformance.trim();
    if (estimatedCost.trim()) p.estimatedCost = estimatedCost.trim();
    if (evidence.trim()) p.evidence = lines(evidence);
    if (materials.trim()) {
      p.materials = lines(materials).map((m) => {
        const [name, maxTemp, maxPressure] = m.split(',').map((x) => x.trim());
        return { name, ...(numOr(maxTemp ?? '') != null ? { maxTemp: numOr(maxTemp) } : {}), ...(numOr(maxPressure ?? '') != null ? { maxPressure: numOr(maxPressure) } : {}) };
      });
    }
    const eIn = numOr(energyIn); const eOut = numOr(energyOut);
    if (eIn != null || eOut != null) p.energy = { ...(eIn != null ? { input: eIn } : {}), ...(eOut != null ? { output: eOut } : {}) };
    if (numOr(efficiency) != null) p.efficiency = numOr(efficiency);
    if (numOr(flowQ) != null && numOr(flowV) != null && numOr(flowT) != null) p.flow = { volumetricFlow: numOr(flowQ), volume: numOr(flowV), time: numOr(flowT) };
    if (numOr(powerP) != null && numOr(powerE) != null && numOr(powerT) != null) p.power = { power: numOr(powerP), energy: numOr(powerE), time: numOr(powerT) };
    const opTemp = numOr(tempValue) != null ? { value: numOr(tempValue), ...(numOr(tempMax) != null ? { max: numOr(tempMax) } : {}) } : undefined;
    const opPres = numOr(presValue) != null ? { value: numOr(presValue), ...(numOr(presMax) != null ? { max: numOr(presMax) } : {}) } : undefined;
    if (opTemp || opPres) p.operating = { ...(opTemp ? { temperature: opTemp } : {}), ...(opPres ? { pressure: opPres } : {}) };
    if (context.trim()) p.context = context.trim();
    if (equationsJson.trim()) { try { const eq = JSON.parse(equationsJson); if (Array.isArray(eq)) p.equations = eq; } catch { /* invalid JSON ignored — never crash */ } }
    if (paramVectorJson.trim()) { try { const pv = JSON.parse(paramVectorJson); if (pv && typeof pv === 'object') p.parameterVector = pv; } catch { /* ignore */ } }
    return p;
  }

  async function onRun() {
    const token = getToken();
    if (!token || !projectId) { setError('Wybierz projekt.'); return; }
    setError(null); setBusy(true); setResult(null);
    const r = await runTruthAnalysis(token, projectId, buildProposal());
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    setResult(r.data);
  }

  async function openHistory(id: string) {
    const token = getToken();
    if (!token || !projectId) return;
    const r = await getTruthAnalysis(token, projectId, id);
    if (r.ok) setResult(r.data);
  }

  function toggleCompare(id: string) {
    setComparison(null);
    setCompareSel((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id].slice(-2)));
  }

  async function doCompare() {
    const token = getToken();
    if (!token || !projectId || compareSel.length !== 2) return;
    // Order by creation (history is newest-first): earlier = second selected, later = first.
    const idxA = history.findIndex((h) => h.id === compareSel[0]);
    const idxB = history.findIndex((h) => h.id === compareSel[1]);
    const [earlier, later] = idxA > idxB ? [compareSel[0], compareSel[1]] : [compareSel[1], compareSel[0]];
    const r = await compareTruthAnalyses(token, projectId, earlier, later);
    if (r.ok) setComparison(r.data); else setError(r.message);
  }

  async function openReport(id: string) {
    const token = getToken();
    if (!token || !projectId) return;
    const r = await getTruthReport(token, projectId, id);
    if (r.ok) setReport(r.data); else setError(r.message);
  }

  return (
    <div className="settings-view truth-engine">
      <h2>🛑 Truth Engine / R&amp;D Kill-Switch</h2>
      <p className="settings-hint">
        Deterministyczna decyzja pre-flight <strong>zanim</strong> wydasz budżet: GO / WARN / BLOCK / INSUFFICIENT_DATA,
        najtańszy test falsyfikujący i podpisany certyfikat. GO jest warunkiem <em>koniecznym, nie wystarczającym</em> —
        nie jest twierdzeniem o poprawności naukowej. BLOCK dotyczy podanych założeń i zakodowanych sprawdzeń, nie „niemożliwości we wszechświecie".
      </p>

      <section className="settings-section">
        <h3>1 · Kontekst</h3>
        <div className="form-grid">
          <label>Projekt (najemca)
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.length === 0 && <option value="">— brak projektów z prawem zapisu —</option>}
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        </div>
        {necro && <p className="small muted">Pamięć porażek tego najemcy (Necropolis): <strong>{necro.total}</strong> region(ów).</p>}
      </section>

      <section className="settings-section">
        <h3>2 · Propozycja badawcza</h3>
        <div className="form-grid">
          <label>Problem
            <textarea rows={2} value={problemStatement} onChange={(e) => setProblemStatement(e.target.value)} placeholder="Co próbujesz osiągnąć?" />
          </label>
          <label>Proponowany mechanizm
            <textarea rows={2} value={proposedMechanism} onChange={(e) => setProposedMechanism(e.target.value)} />
          </label>
          <label>Roszczony wynik
            <textarea rows={2} value={claimedResult} onChange={(e) => setClaimedResult(e.target.value)} placeholder="Np. sprawność 45%, przepływ 2 m³/s…" />
          </label>
          <label>Założenia (jedno na linię)
            <textarea rows={3} value={assumptions} onChange={(e) => setAssumptions(e.target.value)} placeholder="izotermicznie&#10;stan ustalony" />
          </label>
          <label>Ograniczenia fizyczne (jedno na linię)
            <textarea rows={2} value={physicalConstraints} onChange={(e) => setPhysicalConstraints(e.target.value)} />
          </label>
          <label>Materiały (nazwa, maxTemp, maxPressure — jeden na linię)
            <textarea rows={2} value={materials} onChange={(e) => setMaterials(e.target.value)} placeholder="PVC, 60&#10;stal, 400, 250" />
          </label>
          <label>Wymagane zdolności (jedna na linię)
            <textarea rows={2} value={requiredCapabilities} onChange={(e) => setRequiredCapabilities(e.target.value)} placeholder="molecular-docking" />
          </label>
          <label>Domeny wymagające wiedzy (jedna na linię)
            <textarea rows={2} value={requestedDomains} onChange={(e) => setRequestedDomains(e.target.value)} placeholder="oxygen-transfer-efficiency" />
          </label>
          <label>Oczekiwana wydajność
            <input value={expectedPerformance} onChange={(e) => setExpectedPerformance(e.target.value)} />
          </label>
          <label>Szacowany koszt
            <input value={estimatedCost} onChange={(e) => setEstimatedCost(e.target.value)} />
          </label>
          <label>Dowody / źródła
            <textarea rows={2} value={evidence} onChange={(e) => setEvidence(e.target.value)} />
          </label>
        </div>
      </section>

      <section className="settings-section">
        <h3>3 · Dane strukturalne (dla deterministycznych ograniczeń)</h3>
        <p className="settings-hint">Puste pola są pomijane (SKIPPED) — nigdy nie stają się cichym GO.</p>
        <div className="form-grid truth-numeric">
          <label>Energia wejściowa<input type="number" value={energyIn} onChange={(e) => setEnergyIn(e.target.value)} /></label>
          <label>Energia użyteczna wyj.<input type="number" value={energyOut} onChange={(e) => setEnergyOut(e.target.value)} /></label>
          <label>Sprawność (0–1)<input type="number" value={efficiency} onChange={(e) => setEfficiency(e.target.value)} /></label>
          <label>Przepływ Q<input type="number" value={flowQ} onChange={(e) => setFlowQ(e.target.value)} /></label>
          <label>Objętość V<input type="number" value={flowV} onChange={(e) => setFlowV(e.target.value)} /></label>
          <label>Czas t (przepływ)<input type="number" value={flowT} onChange={(e) => setFlowT(e.target.value)} /></label>
          <label>Moc P<input type="number" value={powerP} onChange={(e) => setPowerP(e.target.value)} /></label>
          <label>Energia E<input type="number" value={powerE} onChange={(e) => setPowerE(e.target.value)} /></label>
          <label>Czas t (moc)<input type="number" value={powerT} onChange={(e) => setPowerT(e.target.value)} /></label>
          <label>Temperatura pracy<input type="number" value={tempValue} onChange={(e) => setTempValue(e.target.value)} /></label>
          <label>Temp. maks.<input type="number" value={tempMax} onChange={(e) => setTempMax(e.target.value)} /></label>
          <label>Ciśnienie pracy<input type="number" value={presValue} onChange={(e) => setPresValue(e.target.value)} /></label>
          <label>Ciśnienie maks.<input type="number" value={presMax} onChange={(e) => setPresMax(e.target.value)} /></label>
          <label>Kontekst (Necropolis)<input value={context} onChange={(e) => setContext(e.target.value)} placeholder="reactor" /></label>
        </div>
        <details>
          <summary>Zaawansowane: równania (JSON) i wektor parametrów (JSON)</summary>
          <div className="form-grid">
            <label>Równania (JSON: [{'{'}symbol, terms:[{'{'}symbol, dimension{'}'}]{'}'}])
              <textarea rows={3} value={equationsJson} onChange={(e) => setEquationsJson(e.target.value)} />
            </label>
            <label>Wektor parametrów (JSON, dla dopasowania Necropolis)
              <textarea rows={2} value={paramVectorJson} onChange={(e) => setParamVectorJson(e.target.value)} placeholder='{"T": 905}' />
            </label>
          </div>
        </details>
      </section>

      <div className="form-grid">
        <button className="primary-btn" disabled={busy || !projectId} onClick={() => void onRun()}>
          {busy ? 'Analiza…' : 'Uruchom analizę pre-flight'}
        </button>
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}

      {result && (
        <TruthResult result={result} onReport={() => result.id && void openReport(result.id)} />
      )}

      <section className="settings-section">
        <h3>Historia analiz (ten najemca)</h3>
        <p className="settings-hint">Zaznacz dwie analizy, aby je porównać (co się zmieniło, czy Necropolis wpłynął na późniejszą).</p>
        {history.length === 0 && <p className="muted small">Brak analiz.</p>}
        <ul className="plain-list truth-history">
          {history.map((h) => (
            <li key={h.id}>
              <label className="truth-history-row">
                <input type="checkbox" checked={compareSel.includes(h.id)} onChange={() => toggleCompare(h.id)} />
                <button className="link-btn" onClick={() => void openHistory(h.id)}>
                  <span className={`pill ${DECISION_CLASS[h.decision]}`}>{h.decision}</span>{' '}
                  <code className="small">{h.decisionHash.slice(0, 16)}…</code>
                </button>
                <button className="chip-btn tiny" onClick={() => void openReport(h.id)}>Raport</button>
              </label>
            </li>
          ))}
        </ul>
        {compareSel.length === 2 && <button className="chip-btn primary" onClick={() => void doCompare()}>Porównaj wybrane</button>}
        {comparison && <ComparisonView cmp={comparison} />}
      </section>

      {report && (
        <div className="truth-report-overlay" role="dialog" aria-label="Raport pilotażowy">
          <div className="truth-report-actions no-print">
            <button className="chip-btn primary" onClick={() => window.print()}>Drukuj / zapisz PDF</button>
            <button className="chip-btn" onClick={() => setReport(null)}>Zamknij</button>
          </div>
          <PilotReportView report={report} />
        </div>
      )}
    </div>
  );
}

function ComparisonView({ cmp }: { cmp: AnalysisComparison }) {
  return (
    <div className="truth-block truth-comparison">
      <h4>Porównanie analiz</h4>
      <p className="small">
        Wcześniejsza <span className={`pill ${DECISION_CLASS[cmp.from]}`}>{cmp.from}</span>
        {' → '}późniejsza <span className={`pill ${DECISION_CLASS[cmp.to]}`}>{cmp.to}</span>
      </p>
      <p className={`small ${cmp.decisionChanged ? 'ok-text' : 'muted'}`}>
        Decyzja {cmp.decisionChanged ? 'ZMIENIŁA SIĘ' : 'bez zmian'} · hash {cmp.decisionHashChanged ? 'inny' : 'identyczny'}
      </p>
      {cmp.necropolis.newlyInfluenced && <p className="small error-text">Necropolis wpłynął na późniejszą decyzję (nowy martwy koniec dopasowany).</p>}
      {Object.entries(cmp.findingsChanged).map(([k, v]) => (
        (v.added.length > 0 || v.removed.length > 0) && (
          <div key={k} className="small">
            <strong>{k}:</strong>
            {v.added.length > 0 && <span className="error-text"> +{v.added.join('; ')}</span>}
            {v.removed.length > 0 && <span className="ok-text"> −{v.removed.join('; ')}</span>}
          </div>
        )
      ))}
    </div>
  );
}

function List({ title, items, kind }: { title: string; items: string[]; kind?: 'bad' | 'good' | 'warn' }) {
  if (!items || items.length === 0) return null;
  const cls = kind === 'bad' ? 'error-text' : kind === 'good' ? 'ok-text' : 'muted';
  return (
    <div className="truth-block">
      <h4>{title}</h4>
      <ul className={`plain-list ${cls}`}>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  );
}

function TruthResult({ result, onReport }: { result: TruthAnalysis; onReport: () => void }) {
  const d = result.decision;
  const f = d.cheapestFalsificationTest;
  return (
    <section className="settings-section truth-result">
      <div className="truth-result-head">
        <h3>Decyzja R&amp;D Kill-Switch</h3>
        {result.id && <button className="chip-btn" onClick={onReport}>Raport pilotażowy</button>}
      </div>
      <div className="metric-grid">
        <div className="metric-cell"><span className="metric-label">Decyzja</span><span className={`pill ${DECISION_CLASS[d.decision]} metric-value`}>{DECISION_LABEL[d.decision]}</span></div>
        <div className="metric-cell"><span className="metric-label">Siła decyzji</span><span className="metric-value">{d.decisionStrength}</span></div>
        <div className="metric-cell"><span className="metric-label">Hash decyzji</span><code className="small">{result.certificate.decisionHash.slice(0, 16)}…</code></div>
        <div className="metric-cell"><span className="metric-label">Hash propozycji</span><code className="small">{result.proposalHash.slice(0, 16)}…</code></div>
      </div>

      <h4>Potok analizy</h4>
      <ul className="plain-list truth-stages">
        {result.stages.map((s) => (
          <li key={s.stage} className={`stage-${s.status.toLowerCase()}`}>
            <span className="stage-status">{s.status}</span> {s.stage}
            {s.status === 'SKIPPED' && s.missing.length > 0 && <span className="muted small"> — brak: {s.missing.join(', ')}</span>}
          </li>
        ))}
      </ul>

      <List title="Powody, by ZABIĆ projekt" items={d.reasonsToKill} kind="bad" />
      <List title="Niespójności wymiarowe" items={d.dimensionalInconsistencies} kind="bad" />
      <List title="Naruszenia ograniczeń fizycznych" items={d.physicalConstraintViolations} kind="bad" />
      <List title="Naruszenia ograniczeń (rejestr)" items={d.constraintViolations.map((c) => `${c.id}: ${c.detail}`)} kind="bad" />
      <List title="Znane martwe końce (Necropolis)" items={d.knownDeadEndSimilarities} kind="bad" />
      <List title="Brakujące informacje" items={d.missingInformation} kind="warn" />
      <List title="Nierozstrzygnięte założenia" items={d.unresolvedAssumptions} kind="warn" />
      <List title="Luki zdolności" items={d.capabilityGaps} kind="warn" />
      <List title="Domeny bez zakodowanej wiedzy" items={d.unsupportedDomains.map((u) => `${u.domain}: ${u.reason}`)} kind="warn" />
      <List title="Powody, by NIE zabijać" items={d.reasonsNotToKill} kind="good" />

      {f && (
        <div className="truth-block">
          <h4>Najtańszy test falsyfikujący</h4>
          <p className="small">Cel: <strong>{f.targetAssumption}</strong></p>
          <p className="small">Test: {f.recommendedTestType} <span className="muted">({f.relativeCostClass})</span></p>
          <p className="small">Wejście: {f.requiredInput}</p>
          <p className="muted small">{f.priorityReason}</p>
          {f.expertReviewRequested && <p className="pill pill-warn">Wymaga przeglądu eksperta</p>}
        </div>
      )}

      <div className="truth-block">
        <h4>Certyfikat</h4>
        <p className="small">Schemat: <code>{result.certificate.schema}</code></p>
        <p className="small">Silniki wykonane: {result.certificate.enginesExecuted.join(', ')}</p>
        <p className="small muted">Silniki pominięte: {result.certificate.enginesSkipped.map((s) => `${s.stage} (${s.reason})`).join('; ')}</p>
        <p className="muted small">{d.boundedClaim}</p>
      </div>
    </section>
  );
}
