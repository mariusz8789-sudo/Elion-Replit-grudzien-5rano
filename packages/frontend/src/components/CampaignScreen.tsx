import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession, getToken } from '../core/backend/session';
import {
  listProjects, listToolchain, listCampaigns, createCampaign, getCampaign, startCampaign, cancelCampaign,
  listCampaignCandidates, listCampaignDecisions, getDiscoveryGraph, askCampaignWhy,
  listCampaignScienceRuns, listCampaignConflicts, getScientificComputeReport, runCampaignStage, getAdmetEndpoints, verifyScienceRun,
  type Project, type ToolchainEntry, type Campaign, type CampaignCandidate, type CampaignDecision,
  type DiscoveryGraph, type WhyAnswer, type ScienceRun, type ModelConflict, type ScienceRunVerification, type ScientificComputeReport,
} from '../core/backend/client';
import { AccountPanel } from './AccountPanel';

/**
 * Scientific Acceleration UI (P12) — jeden warsztat Kampanii Naukowej. Każdy
 * licznik i komunikat pochodzi z REALNEGO, utrwalonego stanu kampanii z backendu
 * (RDKit). Zero fałszywych liczników, zero atrapy terminala. Gdy silnik jest
 * BLOCKED_BY_RUNTIME, mówimy o tym wprost — to uczciwa luka, nie porażka.
 */

const DEFAULT_SEEDS = 'c1ccccc1, Oc1ccccc1, Nc1ccccc1, Cc1ccccc1';

export function CampaignScreen() {
  const session = useSession();
  if (!session) {
    return (
      <main className="settings-view" id="main-content" tabIndex={-1}>
        <section className="settings-section">
          <h2>Kampania naukowa</h2>
          <p className="settings-hint">
            Zaloguj się, aby prowadzić kampanie odkrywcze na realnych silnikach (RDKit). Silnik przyspieszenia sam
            wybiera następny eksperyment na podstawie utrwalonych danych — nie zmyśla wyników, nie deklaruje „leku",
            a każdą decyzję da się wyjaśnić dowodem (WHY). To walidacja oprogramowania, nie odkrycie terapeutyczne.
          </p>
          <AccountPanel />
        </section>
      </main>
    );
  }
  return <CampaignWorkspace />;
}

const STATUS_MSG: Record<Campaign['status'], string> = {
  created: 'GOTOWA — czeka na start',
  running: 'WYKONYWANIE KAMPANII…',
  completed: 'WARUNEK STOPU OSIĄGNIĘTY',
  cancelled: 'ANULOWANA',
};

function CampaignWorkspace() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [toolchain, setToolchain] = useState<ToolchainEntry[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [candidates, setCandidates] = useState<CampaignCandidate[]>([]);
  const [decisions, setDecisions] = useState<CampaignDecision[]>([]);
  const [graph, setGraph] = useState<DiscoveryGraph | null>(null);
  const [scienceRuns, setScienceRuns] = useState<ScienceRun[]>([]);
  const [computeReport, setComputeReport] = useState<ScientificComputeReport | null>(null);
  const [verifications, setVerifications] = useState<Record<string, ScienceRunVerification | 'loading' | 'error'>>({});
  const [conflicts, setConflicts] = useState<ModelConflict[]>([]);
  const [admetEndpointCount, setAdmetEndpointCount] = useState<number | null>(null);
  const [why, setWhy] = useState<{ label: string; a: WhyAnswer } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [objective, setObjective] = useState('MPO benchmark: crippenLogP≈2.5, molWt≈350 (walidacja oprogramowania)');
  const [seeds, setSeeds] = useState(DEFAULT_SEEDS);
  const [maxGen, setMaxGen] = useState(4);

  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    void listToolchain().then((r) => { if (r.ok) setToolchain(r.data); });
    void getAdmetEndpoints().then((r) => { if (r.ok) setAdmetEndpointCount(r.data.length); });
    void listProjects(token).then((r) => {
      if (r.ok) {
        const writable = r.data.filter((p) => p.role === 'owner' || p.role === 'admin' || p.role === 'editor');
        setProjects(writable);
        if (writable[0]) setProjectId((cur) => cur || writable[0].id);
      }
    });
  }, []);

  const reloadCampaigns = useCallback(async () => {
    const token = getToken();
    if (!token || !projectId) return;
    const r = await listCampaigns(token, projectId);
    if (r.ok) setCampaigns(r.data);
  }, [projectId]);

  useEffect(() => { void reloadCampaigns(); }, [reloadCampaigns]);

  const loadDetail = useCallback(async (campaignId: string) => {
    const token = getToken();
    if (!token || !projectId) return;
    const [c, cands, decs, g, sr, cf, report] = await Promise.all([
      getCampaign(token, projectId, campaignId),
      listCampaignCandidates(token, projectId, campaignId),
      listCampaignDecisions(token, projectId, campaignId),
      getDiscoveryGraph(token, projectId, campaignId),
      listCampaignScienceRuns(token, projectId, campaignId),
      listCampaignConflicts(token, projectId, campaignId),
      getScientificComputeReport(token, projectId, campaignId),
    ]);
    if (c.ok) setSelected(c.data);
    if (cands.ok) setCandidates(cands.data);
    if (decs.ok) setDecisions(decs.data);
    if (g.ok) setGraph(g.data);
    if (sr.ok) setScienceRuns(sr.data);
    if (cf.ok) setConflicts(cf.data);
    if (report.ok) setComputeReport(report.data);
    return c.ok ? c.data : null;
  }, [projectId]);

  // Odpytywanie stanu podczas biegu — wyłącznie realny, utrwalony stan.
  const startPolling = useCallback((campaignId: string) => {
    if (pollRef.current) window.clearInterval(pollRef.current);
    pollRef.current = window.setInterval(async () => {
      const c = await loadDetail(campaignId);
      if (c && (c.status === 'completed' || c.status === 'cancelled')) {
        if (pollRef.current) window.clearInterval(pollRef.current);
        pollRef.current = null;
        void reloadCampaigns();
      }
    }, 2000);
  }, [loadDetail, reloadCampaigns]);

  useEffect(() => () => { if (pollRef.current) window.clearInterval(pollRef.current); }, []);

  async function onCreate() {
    const token = getToken();
    if (!token || !projectId) return;
    setError(null); setBusy(true);
    const startingSmiles = seeds.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);
    const r = await createCampaign(token, projectId, { objective, startingSmiles, budget: { maxGenerations: maxGen } });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    await reloadCampaigns();
    await loadDetail(r.data.id);
  }

  async function onStart(c: Campaign) {
    const token = getToken();
    if (!token || !projectId) return;
    setError(null); setBusy(true);
    const r = await startCampaign(token, projectId, c.id);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    await loadDetail(c.id);
    startPolling(c.id);
  }

  async function onCancel(c: Campaign) {
    const token = getToken();
    if (!token || !projectId) return;
    await cancelCampaign(token, projectId, c.id);
    await loadDetail(c.id);
  }

  async function onRunStage(c: Campaign) {
    const token = getToken();
    if (!token || !projectId) return;
    setError(null); setBusy(true);
    const r = await runCampaignStage(token, projectId, c.id, {
      admet: { enabled: true }, // wynik naukowy na WSZYSTKICH zachowanych kandydatach; bez progów = brak odrzuceń (jawne, nie ukryte)
      docking: { enabled: true, budget: 3 },
      quantum: { enabled: true, budget: 2 },
    });
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    startPolling(c.id); // etapy ciężkie trwają; odświeżaj utrwalony stan
    window.setTimeout(() => { void loadDetail(c.id); }, 3000);
  }

  async function onVerifyRun(runId: string) {
    const token = getToken();
    if (!token || !projectId || !selected) return;
    setVerifications((prev) => ({ ...prev, [runId]: 'loading' }));
    const r = await verifyScienceRun(token, projectId, selected.id, runId);
    setVerifications((prev) => ({ ...prev, [runId]: r.ok ? r.data : 'error' }));
  }

  async function onWhy(kind: string, label: string, candidate?: string, generation?: number) {
    const token = getToken();
    if (!token || !projectId || !selected) return;
    const r = await askCampaignWhy(token, projectId, selected.id, { kind, candidate, generation });
    if (r.ok) setWhy({ label, a: r.data });
  }

  const rdkit = toolchain.find((t) => t.toolId === 'rdkit');
  const s = selected?.stats;
  const paretoCandidates = candidates.filter((c) => c.pareto);

  return (
    <main className="settings-view" id="main-content" tabIndex={-1}>
      <section className="settings-section">
        <h2>Silnik Przyspieszenia Naukowego</h2>
        <p className="settings-hint">
          Adaptacyjne sterowanie kampanią obliczeniową na realnych silnikach. Silnik analizuje utrwalone dane i sam
          wybiera następny eksperyment; każda decyzja jest zapisana i wyjaśnialna. Bez fałszywej nauki, bez fałszywej
          autonomii, bez deklaracji terapeutycznych.
        </p>

        {/* Zweryfikowane silniki (Toolchain) */}
        <div className="settings-subsection">
          <h3>Zweryfikowane silniki</h3>
          {toolchain.length === 0 && <p className="settings-hint">Ładowanie rejestru silników…</p>}
          <ul className="plain-list">
            {toolchain.map((t) => (
              <li key={t.toolId}>
                <strong>{t.engineName}</strong> — <StatusPill status={t.status} />{' '}
                {t.version ? <span className="muted">v{t.version}</span> : null}{' '}
                <span className="muted">({t.license})</span>
                {t.validation && (
                  <span className="muted"> · przypadki referencyjne: {t.validation.filter((v) => v.pass).length}/{t.validation.length} PASS</span>
                )}
                {t.status !== 'AVAILABLE' && t.reason ? <div className="muted small">luka: {t.reason}</div> : null}
              </li>
            ))}
          </ul>
        </div>

        {rdkit && rdkit.status !== 'AVAILABLE' && (
          <p className="warn-banner">
            Silnik molekularny jest {rdkit.status}. Kampanie molekularne wymagają RDKit (pip install rdkit). To uczciwy
            stan zdolności — nie będą zwracane zmyślone wyniki.
          </p>
        )}
      </section>

      {/* Tworzenie kampanii */}
      <section className="settings-section">
        <h3>Nowa kampania (Drug Discovery — walidacja)</h3>
        {projects.length === 0 ? (
          <p className="settings-hint">Najpierw utwórz projekt w „☁ Projekty", aby prowadzić kampanie.</p>
        ) : (
          <div className="form-grid">
            <label>Projekt
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label>Cel naukowy
              <input value={objective} onChange={(e) => setObjective(e.target.value)} />
            </label>
            <label>Molekuły startowe (SMILES, po przecinku)
              <input value={seeds} onChange={(e) => setSeeds(e.target.value)} />
            </label>
            <label>Limit generacji (budżet)
              <input type="number" min={1} max={8} value={maxGen} onChange={(e) => setMaxGen(Number(e.target.value))} />
            </label>
            <button className="primary-btn" disabled={busy} onClick={() => void onCreate()}>Utwórz kampanię</button>
          </div>
        )}
        {error && <p className="error-text">{error}</p>}
      </section>

      {/* Lista kampanii */}
      <section className="settings-section">
        <h3>Kampanie</h3>
        {campaigns.length === 0 && <p className="settings-hint">Brak kampanii w tym projekcie.</p>}
        <ul className="plain-list">
          {campaigns.map((c) => (
            <li key={c.id}>
              <button className="link-btn" onClick={() => void loadDetail(c.id)}>{c.objective}</button>{' '}
              <span className="muted">[{c.status}]</span>{' '}
              {c.status === 'created' && <button className="chip-btn" disabled={busy} onClick={() => void onStart(c)}>▶ Start</button>}
              {c.status === 'running' && <button className="chip-btn" onClick={() => void onCancel(c)}>■ Anuluj</button>}
            </li>
          ))}
        </ul>
      </section>

      {/* Warsztat wybranej kampanii */}
      {selected && (
        <section className="settings-section">
          <h3>Warsztat: {selected.objective}</h3>
          <p className="status-line"><strong>Status:</strong> {STATUS_MSG[selected.status]}
            {selected.status === 'running' && <> · generacja {selected.currentGeneration}/{selected.budget.maxGenerations}</>}
            {selected.stopReason && <> · <span className="muted">{selected.stopReason}</span></>}
          </p>

          <div className="metric-grid">
            <Metric label="Generacja" value={selected.currentGeneration} />
            <Metric label="Wygenerowani" value={s?.candidatesGenerated ?? 0} />
            <Metric label="Poprawni" value={s?.valid ?? 0} />
            <Metric label="Niepoprawni" value={s?.invalid ?? 0} />
            <Metric label="Duplikaty" value={s?.duplicates ?? 0} />
            <Metric label="Odrzuceni" value={s?.rejected ?? 0} />
            <Metric label="Zachowani" value={s?.retained ?? 0} />
            <Metric label="Front Pareto" value={s?.paretoFront ?? 0} />
            <Metric label="Różnorodność" value={s?.diversity != null ? s.diversity.toFixed(3) : '—'} />
            <Metric label="Hiperobjętość" value={s?.hypervolume != null ? s.hypervolume.toFixed(2) : '—'} />
            <Metric label="Decyzje" value={s?.decisions ?? 0} />
          </div>

          <div className="settings-subsection">
            <h4>Bieżąca strategia wyszukiwania</h4>
            <p className="muted small">
              Wybór rodziców: {selected.strategy.parentSelection ?? '—'} · wagi transformacji:{' '}
              {selected.strategy.transformationWeights
                ? Object.entries(selected.strategy.transformationWeights).map(([k, v]) => `${k}:${v}`).join(', ')
                : '—'}
            </p>
            <h4>Ostatnia decyzja strategiczna</h4>
            {selected.lastDecision
              ? <p className="muted small">gen {selected.lastDecision.generation}: <strong>{selected.lastDecision.decision}</strong> — {selected.lastDecision.purpose}{' '}
                  <button className="chip-btn" onClick={() => void onWhy('strategy', 'Zmiana strategii', undefined, selected.lastDecision!.generation)}>WHY</button></p>
              : <p className="muted small">Brak decyzji (kampania jeszcze nie ruszyła).</p>}
            <h4>Warunek stopu</h4>
            <p className="muted small">
              {selected.stopReason
                ? <>Zatrzymano: <strong>{selected.stopReason}</strong>{' '}<button className="chip-btn" onClick={() => void onWhy('stop', 'Dlaczego stop', undefined)}>WHY</button></>
                : `Budżet: ${selected.budget.maxGenerations} generacji, ${selected.budget.maxGeneratedCandidates} kandydatów (twardy limit zasobów).`}
            </p>
          </div>

          {/* Decyzje: dowód zmiany zachowania między generacjami */}
          {decisions.length > 0 && (
            <div className="settings-subsection">
              <h4>Historia decyzji (następny eksperyment)</h4>
              <ol className="plain-list small">
                {decisions.map((d) => (
                  <li key={d.id}>gen {d.generation}: <strong>{d.decision}</strong> — {d.purpose}{' '}
                    <button className="chip-btn" onClick={() => void onWhy('next-experiment', `Decyzja gen ${d.generation}`, undefined, d.generation)}>WHY</button></li>
                ))}
              </ol>
            </div>
          )}

          {/* Front Pareto */}
          {paretoCandidates.length > 0 && (
            <div className="settings-subsection">
              <h4>Front Pareto ({paretoCandidates.length})</h4>
              <ul className="plain-list small">
                {paretoCandidates.slice(0, 12).map((c) => (
                  <li key={c.id}>
                    <code>{c.canonicalSmiles}</code>{' '}
                    <span className="muted">MW {c.descriptors.molWt?.toFixed?.(1) ?? '—'}, logP {c.descriptors.crippenLogP?.toFixed?.(2) ?? '—'}</span>{' '}
                    <button className="chip-btn" onClick={() => void onWhy('candidate', `Kandydat ${c.canonicalSmiles}`, c.id)}>WHY istnieje</button>{' '}
                    <button className="chip-btn" onClick={() => void onWhy('engine', `Silnik dla ${c.canonicalSmiles}`, c.id)}>Który silnik</button>{' '}
                    <button className="chip-btn" onClick={() => void onWhy('pareto', `Pareto ${c.canonicalSmiles}`, c.id)}>Dlaczego Pareto</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Graf odkryć */}
          {graph && (
            <div className="settings-subsection">
              <h4>Graf odkryć</h4>
              <p className="muted small">
                {graph.stats.nodes} węzłów, {graph.stats.edges} krawędzi (z {graph.stats.candidates} kandydatów, {graph.stats.decisions} decyzji).
                Zbudowany wyłącznie z utrwalonych zdarzeń — bez dekoracyjnych danych.
              </p>
            </div>
          )}

          {/* Etapy multi-fidelity (ciężkie silniki) */}
          {selected.status === 'completed' && (
            <div className="settings-subsection">
              <h4>Etapy multi-fidelity (ciężkie silniki)</h4>
              <p className="muted small">
                RDKit (tanie) → ADMET/toksyczność ({admetEndpointCount ?? '…'} endpointów, wszyscy zachowani kandydaci) → dokowanie (średnie,
                Pareto-wyselekcjonowani) → chemia kwantowa (drogie, budżetowana). Wyniki to MODEL_ESTIMATE — bez
                deklaracji powinowactwa/bezpieczeństwa/terapii.
              </p>
              <button className="primary-btn" disabled={busy} onClick={() => void onRunStage(selected)}>
                ▶ Uruchom ADMET + toksyczność + dokowanie + chemię kwantową
              </button>
            </div>
          )}

          {/* Ciężkie Scientific Runs (realne artefakty + prowieniencja) */}
          {computeReport && (
            <div className="settings-subsection">
              <h4>Unified Scientific Compute Report</h4>
              <p className="muted small">
                Report <code>{computeReport.reportId}</code> · {computeReport.compoundCount} unikalnych związków · evidence: <strong>{computeReport.evidence}</strong>
              </p>
              <ul className="plain-list small">
                {computeReport.stages.map((stage) => (
                  <li key={stage.capability}><strong>{stage.capability}</strong> — {stage.status} · {stage.runIds.length} run(s) · replay: {stage.runIds.map((id) => computeReport.replay.find((r) => r.runId === id)?.status ?? 'NOT_VERIFIED').join(', ') || '—'}</li>
                ))}
              </ul>
              <p className="muted small">Źródło: {computeReport.provenance.source}. {computeReport.limitations.join(' ')}</p>
            </div>
          )}

          {/* Ciężkie Scientific Runs (realne artefakty + prowieniencja) */}
          {scienceRuns.length > 0 && (
            <div className="settings-subsection">
              <h4>Ciężkie przebiegi naukowe ({scienceRuns.length})</h4>
              <ul className="plain-list small">
                {scienceRuns.slice(0, 20).map((r) => (
                  <li key={r.id}>
                    <strong>{r.capability}</strong> · {r.engine} {r.engineVersion} · <span className="pill pill-warn">{r.evidenceClass}</span>
                    <div className="muted">
                      {r.capability === 'molecular-docking' && <>best {String((r.outputs as Record<string, unknown>).bestAffinityKcalMol)} {r.units.bestAffinityKcalMol}</>}
                      {r.capability === 'quantum-chemistry' && <>E {String((r.outputs as Record<string, unknown>).energyHartree)} Ha, gap {String((r.outputs as Record<string, unknown>).homoLumoGapEv)} eV</>}
                      {r.capability === 'admet-estimation' && <>MW {fmtNum((r.outputs as Record<string, unknown>).molecular_weight)}, logP {fmtNum((r.outputs as Record<string, unknown>).logP)}, BBB {fmtProb((r.outputs as Record<string, unknown>).BBB_Martins)}, HIA {fmtProb((r.outputs as Record<string, unknown>).HIA_Hou)}</>}
                      {r.capability === 'toxicity-risk-estimation' && <>hERG {fmtProb((r.outputs as Record<string, unknown>).hERG)}, AMES {fmtProb((r.outputs as Record<string, unknown>).AMES)}, DILI {fmtProb((r.outputs as Record<string, unknown>).DILI)}, ClinTox {fmtProb((r.outputs as Record<string, unknown>).ClinTox)}</>}
                      {' · '}method {r.method} · inHash {r.inputHash?.slice(0, 8)} · outHash {r.outputHash?.slice(0, 8)} · {r.durationMs} ms
                    </div>
                    {r.artifacts.length > 0 && <div className="muted small">artefakty: {r.artifacts.map((a) => `${a.kind}(${a.sha256_16 ?? ''})`).join(', ')}</div>}
                    {r.warnings.length > 0 && <div className="warn-banner small">{r.warnings.join('; ')}</div>}
                    <div className="muted small">
                      <button className="chip-btn" disabled={verifications[r.id] === 'loading'} onClick={() => void onVerifyRun(r.id)}>
                        {verifications[r.id] === 'loading' ? 'Weryfikacja…' : 'Zweryfikuj (powtórz obliczenie)'}
                      </button>
                      {' '}<VerdictBadge v={verifications[r.id]} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Konflikty międzysilnikowe (MCRE) */}
          {conflicts.length > 0 && (
            <div className="settings-subsection">
              <h4>Konflikty modeli (MCRE) — {conflicts.length}</h4>
              <ul className="plain-list small">
                {conflicts.map((c, i) => (
                  <li key={i}>
                    <strong>{c.classification}</strong> <code>{c.smiles}</code>:{' '}
                    {c.resultA.engine} = {c.resultA.value} ({c.resultA.verdict}) vs {c.resultB.engine} = {c.resultB.value} {c.resultB.unit ?? ''} ({c.resultB.verdict})
                    <div className="muted">{c.applicability} → <strong>{c.recommendation}</strong></div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Panel WHY */}
          {why && (
            <div className="settings-subsection why-panel">
              <h4>WHY — {why.label}</h4>
              <p>{why.a.ok ? why.a.answer : why.a.reason}</p>
              {why.a.evidence != null && <pre className="evidence">{JSON.stringify(why.a.evidence, null, 2)}</pre>}
              <button className="chip-btn" onClick={() => setWhy(null)}>Zamknij</button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="metric-cell">
      <span className="metric-value">{value}</span>
      <span className="metric-label">{label}</span>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const good = status === 'AVAILABLE';
  return <span className={good ? 'pill pill-ok' : 'pill pill-warn'}>{status}</span>;
}

/** Realna liczba fizykochemiczna (MW, logP…) — brak wartości oznacza brakujący endpoint, nigdy zmyśloną liczbę. */
function fmtNum(v: unknown): string {
  return typeof v === 'number' ? v.toFixed(2) : '—';
}

/** Prawdopodobieństwo klasyfikacyjne [0,1] z zespołu ADMET-AI (MODEL_ESTIMATE) — nigdy SAFE/NON-TOXIC. */
function fmtProb(v: unknown): string {
  return typeof v === 'number' ? `${(v * 100).toFixed(1)}%` : '—';
}

const VERDICT_LABEL: Record<ScienceRunVerification['verdict'], string> = {
  MATCH: 'ZGODNE — powtórne obliczenie potwierdza wynik',
  DRIFT: 'DRYF — realna rozbieżność liczbowa (patrz szczegóły)',
  ENGINE_VERSION_CHANGED: 'ZMIANA WERSJI SILNIKA — porównanie niejednoznaczne',
  BLOCKED_BY_RUNTIME: 'SILNIK NIEDOSTĘPNY — nie da się powtórzyć teraz',
  REPLAY_UNSUPPORTED: 'BRAK ŚCIEŻKI WERYFIKACJI dla tej zdolności',
};

/** Priority B: wynik replay-weryfikacji jednego Scientific Run — nigdy binarne pass/fail. */
function VerdictBadge({ v }: { v: ScienceRunVerification | 'loading' | 'error' | undefined }) {
  if (v == null || v === 'loading') return null;
  if (v === 'error') return <span className="pill pill-warn">błąd weryfikacji</span>;
  const good = v.verdict === 'MATCH';
  return (
    <span className={good ? 'pill pill-ok' : 'pill pill-warn'} title={JSON.stringify(v.detail)}>
      {VERDICT_LABEL[v.verdict]}
    </span>
  );
}
