import { useEffect, useMemo, useState } from 'react';
import { runDiscoveryCase } from '../../core/discovery/discoveryEngine';
import { runDemoReplay } from '../../core/discovery/demoReplay';
import { SCENARIOS, SCENARIOS_NOT_MODELED, type ScenarioId } from '../../core/simulation/scenarioEngine';
import type { DiscoveryCase, DiscoveryCaseSpec, DemoReplay } from '../../core/discovery/discoveryCase';
import {
  LOCAL_SIMULATION_SNAPSHOT_KIND,
  LOCAL_SIMULATION_SNAPSHOT_SCHEMA_VERSION,
  BrowserLocalSimulationSnapshotStore,
  listLocalSimulationSnapshots,
  summarizeLocalSimulationSnapshot,
  validateLocalSimulationSnapshot,
  type LocalSimulationSnapshotStore,
  type LocalSimulationSnapshotSummary,
  type LocalSimulationSnapshot,
} from '../../core/discovery/localSimulationSnapshotStore';
import { computeLocalSimulationSnapshotFingerprint } from '../../core/discovery/evidenceCrypto';
import { compareStoredExperiments, type ExperimentComparison } from '../../core/discovery/experimentComparison';
import { codeCommitHash } from '../../core/build/commitHash';
import { storageAvailable } from '../../core/storage';

/**
 * LOCAL_SIMULATION_SNAPSHOT + DEMO_REPLAY — a browser-local DEMO panel inside the
 * synthetic City 3D / Worlds screen. NOT Genesis Evidence, NOT Genesis Replay.
 *
 * It runs a REAL scenario pair through the in-browser epidemic Scenario Engine,
 * writes the result to the viewer's own `localStorage` as a
 * LOCAL_SIMULATION_SNAPSHOT (`BrowserLocalSimulationSnapshotStore`), and re-runs
 * it with `runDemoReplay()`. Everything it produces stays in this browser. It
 * cannot reach the canonical ledger, it is not exportable through any Evidence
 * Pack or report path, and the panel says so to the user in plain words.
 *
 * Canonical Genesis Evidence is the backend ResearchRun loop's single ledger, and
 * canonical Replay is `packages/backend/src/campaign/verify.mjs`; see
 * `packages/backend/src/architecturalInvariants.test.mjs`, which has an invariant
 * dedicated to keeping this panel out of both.
 *
 * DO NOT BUILD THE RESEARCHRUN MIGRATION NOW. The full redirect of this surface
 * into the canonical loop happens only once the epidemic scenario is a real
 * ResearchRun (D-175 in docs/DECISIONS.md).
 */

const RUNNABLE_SCENARIOS: ScenarioId[] = (Object.keys(SCENARIOS) as ScenarioId[]).filter((id) => !SCENARIOS_NOT_MODELED.includes(id));
const CONDITIONS = { nAgents: 200, initialInfected: 8, seed: 4242, days: 45, stepsPerDay: 4 };

function buildSpec(baseline: ScenarioId, variant: ScenarioId): DiscoveryCaseSpec {
  return {
    question: `Czy ${SCENARIOS[variant].label} zmienia szczyt zakażeń względem ${SCENARIOS[baseline].label}?`,
    hypothesis: {
      statement: `${variant} zmienia szczytową liczbę zakaźnych względem ${baseline}.`,
      falsification: { metric: 'peakInfectious', relation: 'less-than', rationale: SCENARIOS[variant].rationale },
      assumptions: ['Interwencja jest przestrzegana przez cały przebieg.'],
    },
    baselineScenario: baseline,
    variantScenario: variant,
    initialConditions: CONDITIONS,
  };
}

/** Same tamper technique this demo engine's own test suite uses to prove DEMO_REPLAY catches drift. */
function tamperedCopy(record: DiscoveryCase): DiscoveryCase {
  const arm = record.arms[0];
  return {
    ...record,
    arms: [
      { ...arm, run: { ...arm.run, summary: { ...arm.run.summary!, peakInfectious: arm.run.summary!.peakInfectious + 500 }, resultFingerprint: 'tampered-fingerprint' } },
      record.arms[1],
    ],
  };
}

const DEMO_REPLAY_LABELS: Record<DemoReplay['status'], string> = {
  MATCH: 'MATCH', WITHIN_TOLERANCE: 'WITHIN_TOLERANCE', DRIFT: 'DRIFT', BLOCKED: 'BLOCKED', NOT_REPRODUCIBLE: 'NOT_REPRODUCIBLE',
};

function operationError(scope: string, cause: unknown): string {
  const detail = cause instanceof Error ? cause.message : 'Nieznany błąd lokalnego zapisu.';
  return `${scope}: ${detail}`;
}

export function formatLocalSimulationSnapshotStatusLine(
  current: LocalSimulationSnapshot | null,
  historyLength: number,
  demoReplayResult: DemoReplay | null,
): string {
  if (!current) return `${historyLength} zapisanych`;
  const verdict = demoReplayResult
    ? `DEMO_REPLAY ${DEMO_REPLAY_LABELS[demoReplayResult.status]}`
    : `snapshot ${DEMO_REPLAY_LABELS[current.record.demoReplay?.status ?? 'NOT_REPRODUCIBLE']}`;
  return `${current.record.scenarios.baseline}/${current.record.scenarios.variant} · ${verdict}`;
}

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function saveNewRun(store: LocalSimulationSnapshotStore, record: DiscoveryCase): Promise<LocalSimulationSnapshot> {
  const snapshotFingerprint = record.snapshotPack ? await computeLocalSimulationSnapshotFingerprint(record.snapshotPack) : null;
  const entry: LocalSimulationSnapshot = {
    kind: LOCAL_SIMULATION_SNAPSHOT_KIND,
    schemaVersion: LOCAL_SIMULATION_SNAPSHOT_SCHEMA_VERSION,
    record,
    snapshotFingerprint,
    codeCommitHash: codeCommitHash(),
    savedAt: Date.now(),
  };
  await store.save(entry);
  return entry;
}

export function LocalSimulationSnapshotPanel() {
  const store = useMemo(() => new BrowserLocalSimulationSnapshotStore(), []);
  const [baseline, setBaseline] = useState<ScenarioId>('BASELINE');
  const [variant, setVariant] = useState<ScenarioId>('CONTACT_REDUCTION');
  const [history, setHistory] = useState<LocalSimulationSnapshotSummary[]>([]);
  const [current, setCurrent] = useState<LocalSimulationSnapshot | null>(null);
  const [demoReplayResult, setDemoReplay] = useState<DemoReplay | null>(null);
  const [driftDemo, setDriftDemo] = useState<DemoReplay | null>(null);
  const [compareWithId, setCompareWithId] = useState<string>('');
  const [comparison, setComparison] = useState<ExperimentComparison | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [integrityNotice, setIntegrityNotice] = useState<string | null>(null);
  // SSR cannot probe browser storage. In a browser, do not conflate an
  // unavailable durable registry with an empty list of saved experiments.
  const localPersistenceAvailable = typeof window === 'undefined' ? null : storageAvailable();

  const refreshHistory = async () => {
    try {
      setHistory(await listLocalSimulationSnapshots(store));
    } catch (cause) {
      setError(operationError('HISTORIA', cause));
    }
  };
  useEffect(() => { void refreshHistory(); }, [store]);

  const runExperiment = async () => {
    setBusy(true);
    setError(null);
    setDriftDemo(null);
    setComparison(null);
    try {
      const fresh = runDiscoveryCase(buildSpec(baseline, variant));
      const entry = await saveNewRun(store, fresh);
      setCurrent(entry);
      setDemoReplay(fresh.demoReplay);
      await refreshHistory();
    } catch (cause) {
      setError(operationError('EKSPERYMENT', cause));
    } finally {
      setBusy(false);
    }
  };

  const loadEntry = async (experimentId: string) => {
    setError(null);
    try {
      const entry = await store.load(experimentId);
      if (!entry) return;
      const validation = await validateLocalSimulationSnapshot(entry);
      if (!validation.valid) {
        setCurrent(null);
        setDemoReplay(null);
        setDriftDemo(null);
        setComparison(null);
        setIntegrityNotice(`Zapis odrzucony: ${validation.issues.join('; ')}.`);
        return;
      }
      setIntegrityNotice(null);
      setCurrent(entry);
      setDemoReplay(null);
      setDriftDemo(null);
      setComparison(null);
    } catch (cause) {
      setError(operationError('HISTORIA', cause));
    }
  };

  const runDemoReplayOnCurrent = async () => {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      const stored = await store.load(current.record.caseId);
      if (!stored) {
        setIntegrityNotice('DEMO_REPLAY: zapis nie istnieje już w lokalnej historii.');
        return;
      }
      const validation = await validateLocalSimulationSnapshot(stored);
      if (!validation.valid) {
        setIntegrityNotice(`DEMO_REPLAY BLOCKED: ${validation.issues.join('; ')}.`);
        setDemoReplay({ status: 'BLOCKED', tolerance: current.record.demoReplayTolerance, arms: [], message: 'Zapisana migawka nie przeszła walidacji spójności.' });
        return;
      }
      setIntegrityNotice(null);
      setDemoReplay(runDemoReplay(stored.record));
    } catch (cause) {
      setError(operationError('DEMO_REPLAY', cause));
    } finally {
      setBusy(false);
    }
  };

  const simulateDrift = () => {
    if (!current) return;
    setDriftDemo(runDemoReplay(tamperedCopy(current.record)));
  };

  const deleteEntry = async (experimentId: string) => {
    setError(null);
    try {
      await store.delete(experimentId);
      if (current?.record.caseId === experimentId) { setCurrent(null); setDemoReplay(null); setDriftDemo(null); }
      await refreshHistory();
    } catch (cause) {
      setError(operationError('USUWANIE', cause));
    }
  };

  const runComparison = async () => {
    if (!current || !compareWithId) return;
    setError(null);
    try {
      const other = await store.load(compareWithId);
      if (!other) {
        setIntegrityNotice('PORÓWNANIE: wybrany zapis nie istnieje już w lokalnej historii.');
        return;
      }
      const [currentValidation, otherValidation] = await Promise.all([
        validateLocalSimulationSnapshot(current),
        validateLocalSimulationSnapshot(other),
      ]);
      if (!currentValidation.valid || !otherValidation.valid) {
        const issues = [...currentValidation.issues, ...otherValidation.issues];
        setIntegrityNotice(`PORÓWNANIE BLOCKED: ${issues.join('; ')}.`);
        setComparison(null);
        return;
      }
      setIntegrityNotice(null);
      setComparison(compareStoredExperiments(current, other));
    } catch (cause) {
      setError(operationError('PORÓWNANIE', cause));
    }
  };

  /**
   * Hands the viewer their OWN browser-local snapshot back as a file. This is not an
   * Evidence Pack export and not a report path: it is a local download, the payload is
   * labelled LOCAL_SIMULATION_SNAPSHOT, and nothing about it reaches a Genesis ledger.
   */
  const downloadLocalSnapshotJson = () => {
    if (!current) return;
    const summary = summarizeLocalSimulationSnapshot(current);
    downloadJson(`${current.record.caseId}.local-simulation-snapshot.json`, {
      kind: current.kind,
      notGenesisEvidence: 'Lokalna migawka symulacji DEMO z tej przeglądarki. To nie jest Genesis Evidence ani Genesis Replay.',
      experiment: summary,
      configuration: { seed: current.record.seed, initialConditions: current.record.initialConditions, scenarios: current.record.scenarios, parameters: current.record.parameters },
      provenance: summary.provenance,
      fingerprints: { input: current.record.inputFingerprint, result: current.record.runFingerprint, snapshotFingerprint: current.snapshotFingerprint },
      result: current.record.arms.map((arm) => ({ armId: arm.armId, role: arm.role, resultFingerprint: arm.run.resultFingerprint, summary: arm.summary })),
      demoReplayStatus: current.record.demoReplay?.status ?? null,
      snapshotPack: current.record.snapshotPack,
    });
  };

  const statusLine = formatLocalSimulationSnapshotStatusLine(current, history.length, demoReplayResult);

  return (
    <div className="world-panel local-snapshot-panel">
      <button
        type="button"
        className="world-panel-heading local-snapshot-panel-toggle"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span>LOCAL_SIMULATION_SNAPSHOT (DEMO) {expanded ? '▾' : '▸'}</span>
        <small>{statusLine}</small>
      </button>

      {!expanded ? null : (<>
      <p className="hospital-panel-note local-snapshot-not-evidence" role="note">
        <strong>DEMO:</strong> to lokalna migawka symulacji (LOCAL_SIMULATION_SNAPSHOT) przechowywana
        w tej przeglądarce, na tym urządzeniu. <strong>To nie jest Genesis Evidence ani Genesis Replay.</strong>{' '}
        Nic z tego panelu nie trafia do kanonicznego rejestru Genesis, nie da się tego wyeksportować
        jako Evidence Pack ani wstawić do raportu. Ponowne przeliczenie poniżej to DEMO_REPLAY.
      </p>
      <div className="local-snapshot-scenario-picker">
        <label>baseline
          <select value={baseline} onChange={(e) => setBaseline(e.target.value as ScenarioId)}>
            {RUNNABLE_SCENARIOS.map((id) => <option key={id} value={id}>{SCENARIOS[id].label}</option>)}
          </select>
        </label>
        <label>wariant
          <select value={variant} onChange={(e) => setVariant(e.target.value as ScenarioId)}>
            {RUNNABLE_SCENARIOS.map((id) => <option key={id} value={id}>{SCENARIOS[id].label}</option>)}
          </select>
        </label>
      </div>
      <div className="local-snapshot-actions">
        <button className="world-action accent" disabled={busy} onClick={runExperiment}>{busy ? '…' : '▶ Uruchom eksperyment'}</button>
        {current && (
          <>
            <button className="world-action" disabled={busy} onClick={runDemoReplayOnCurrent}>↻ DEMO_REPLAY</button>
            <button className="world-action ghost" disabled={busy} onClick={simulateDrift}>⚠ Symuluj rozjazd</button>
            <button className="world-action ghost" disabled={busy} onClick={downloadLocalSnapshotJson}>⬇ Pobierz migawkę (JSON)</button>
          </>
        )}
      </div>
      {error && <p className="local-snapshot-error" role="alert">{error}</p>}
      {integrityNotice && <p className="hospital-panel-note local-snapshot-integrity-notice" role="alert">{integrityNotice}</p>}

      {current ? (
        <>
          <div className="epidemic-summary">
            <div className="epidemic-summary-row"><span>model</span><strong>{current.record.model.modelId}@{current.record.model.modelVersion}</strong></div>
            <div className="epidemic-summary-row"><span>seed</span><strong>{current.record.seed}</strong></div>
            <div className="epidemic-summary-row"><span>scenariusze</span><strong>{current.record.scenarios.baseline} / {current.record.scenarios.variant}</strong></div>
            <div className="epidemic-summary-row"><span>code commit</span><strong className="local-snapshot-hash" title={current.codeCommitHash}>{current.codeCommitHash.startsWith('NOT_AVAILABLE') ? current.codeCommitHash : `${current.codeCommitHash.slice(0, 12)}…`}</strong></div>
            <div className="epidemic-summary-row"><span>input fingerprint</span><strong title={current.record.inputFingerprint}>{current.record.inputFingerprint}</strong></div>
            <div className="epidemic-summary-row"><span>result fingerprint</span><strong title={current.record.runFingerprint ?? undefined}>{current.record.runFingerprint ?? '—'}</strong></div>
            <div className="epidemic-summary-row"><span>snapshot</span><strong>{current.record.snapshotPack && current.record.snapshotPack.missingFields.length === 0 ? 'KOMPLETNA' : `BRAKUJE: ${current.record.snapshotPack?.missingFields.join(', ') ?? 'brak migawki'}`}</strong></div>
            <div className="epidemic-summary-row"><span>snapshot fingerprint (SHA-256, bez podpisu)</span><strong className="local-snapshot-hash" title={current.snapshotFingerprint ?? undefined}>{current.snapshotFingerprint ? `${current.snapshotFingerprint.slice(0, 16)}…` : '—'}</strong></div>
            {demoReplayResult && (
              <div className={`epidemic-summary-row ${demoReplayResult.status === 'DRIFT' ? 'accent-row' : ''}`} role="status" aria-live="polite" aria-atomic="true"><span>DEMO_REPLAY</span><strong>{DEMO_REPLAY_LABELS[demoReplayResult.status]}</strong></div>
            )}
          </div>
          {driftDemo && (
            <p className="hospital-panel-note local-snapshot-drift-demo" role="status" aria-live="polite" aria-atomic="true">
              Symulacja rozjazdu (kontrolowana zmiana w zapisanej migawce, nie w modelu): DEMO_REPLAY zwrócił{' '}
              <strong>{DEMO_REPLAY_LABELS[driftDemo.status]}</strong>
              {driftDemo.status === 'DRIFT' && driftDemo.arms[0]?.differences.length > 0 && (
                <> — różnica: <code>{driftDemo.arms[0].differences[0].field}</code> (oczekiwano {String(driftDemo.arms[0].differences[0].expected)}, otrzymano {String(driftDemo.arms[0].differences[0].actual)}).</>
              )}
            </p>
          )}
        </>
      ) : (
        <p className="world-panel-empty">Brak zapisanej migawki. Uruchom eksperyment DEMO, aby zobaczyć realne odciski, migawkę i werdykt DEMO_REPLAY.</p>
      )}

      <div className="world-panel-heading local-snapshot-subheading"><span>HISTORIA MIGAWEK (LOKALNIE)</span><small>{history.length} zapisanych</small></div>
      {localPersistenceAvailable === false && (
        <p className="hospital-panel-note local-snapshot-history-unavailable" role="status" aria-live="polite" aria-atomic="true">
          <strong>LOCAL_PERSISTENCE_UNAVAILABLE:</strong> Przeglądarka nie udostępnia trwałego local storage. Ten widok nie może potwierdzić zapisanej historii migawek.
        </p>
      )}
      {history.length === 0 && localPersistenceAvailable !== false ? (
        <p className="world-panel-empty">Brak zapisanych migawek.</p>
      ) : history.length > 0 ? (
        <ul className="hotspot-list local-snapshot-history">
          {history.map((entry) => (
            <li key={entry.experimentId} className={current?.record.caseId === entry.experimentId ? 'local-snapshot-history-active' : ''}>
              <button className="local-snapshot-history-row" onClick={() => void loadEntry(entry.experimentId)}>
                <span>{entry.scenarioId} · seed {entry.seed} · {new Date(entry.timestamp).toLocaleString('pl-PL')}</span>
                <strong>{entry.status}</strong>
              </button>
              <button className="local-snapshot-history-delete" aria-label={`Usuń ${entry.experimentId}`} onClick={() => void deleteEntry(entry.experimentId)}>×</button>
            </li>
          ))}
        </ul>
      ) : null}

      {current && history.length > 1 && (
        <div className="local-snapshot-compare">
          <label>porównaj z
            <select value={compareWithId} onChange={(e) => setCompareWithId(e.target.value)}>
              <option value="">— wybierz eksperyment —</option>
              {history.filter((h) => h.experimentId !== current.record.caseId).map((h) => (
                <option key={h.experimentId} value={h.experimentId}>{h.scenarioId} · seed {h.seed} · {new Date(h.timestamp).toLocaleDateString('pl-PL')}</option>
              ))}
            </select>
          </label>
          <button className="world-action" disabled={!compareWithId} onClick={runComparison}>Porównaj</button>
        </div>
      )}
      {comparison && (
        <div className="local-snapshot-comparison-result">
          <div className="epidemic-summary-row"><span>status</span><strong>{comparison.status === 'BLOCKED' ? comparison.blockedReason : comparison.matchStatus}</strong></div>
          {comparison.inputDifferences.length > 0 && (
            <p className="hospital-panel-note">Różnice wejść: {comparison.inputDifferences.join('; ')}</p>
          )}
          {comparison.resultDeltas && (
            <>
              {(['baseline', 'variant'] as const).map((role) => (
                <ul key={role} className="hotspot-list">
                  {comparison.resultDeltas![role].filter((d) => d.absoluteDelta !== 0).map((d) => (
                    <li key={`${role}-${d.key}`}><span>{role}.{d.key}</span><strong>{d.baseline} → {d.variant}</strong></li>
                  ))}
                </ul>
              ))}
            </>
          )}
          <p className="hospital-panel-note">{comparison.message}</p>
        </div>
      )}

      <p className="hospital-panel-note">
        Odcisk wewnętrzny (<code>fnv1a</code>) i DEMO_REPLAY przez rzeczywiste przeliczenie modelu
        pochodzą z przeglądarkowego silnika scenariuszy. SHA-256 i <code>codeCommitHash</code> opisują
        tę jedną migawkę i są zapisywane lokalnie przez{' '}
        <code>BrowserLocalSimulationSnapshotStore</code> w <code>localStorage</code> tej przeglądarki.
        SHA-256 to odcisk, nie podpis — Genesis nie ma klucza podpisującego, a kanoniczne paczki
        dowodowe są NIEPODPISANE i opisywane jako odciski i replay. Kanoniczne Genesis Evidence i
        Genesis Replay powstają w pętli ResearchRun na backendzie, nie tutaj.
      </p>
      </>)}
    </div>
  );
}
