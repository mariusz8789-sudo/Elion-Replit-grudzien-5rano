import { useEffect, useMemo, useState } from 'react';
import { runDiscoveryCase } from '../../core/discovery/discoveryEngine';
import { replayDiscoveryCase } from '../../core/discovery/discoveryReplay';
import { SCENARIOS, SCENARIOS_NOT_MODELED, type ScenarioId } from '../../core/simulation/scenarioEngine';
import type { DiscoveryCase, DiscoveryCaseSpec, DiscoveryReplay } from '../../core/discovery/discoveryCase';
import {
  EVIDENCE_STORE_SCHEMA_VERSION,
  LocalEvidenceStore,
  listExperimentRegistry,
  summarizeStoredEvidence,
  validateStoredEvidence,
  type EvidenceStore,
  type ExperimentRegistryEntry,
  type StoredEvidence,
} from '../../core/discovery/evidenceStore';
import { computeEvidencePackSha256 } from '../../core/discovery/evidenceCrypto';
import { compareStoredExperiments, type ExperimentComparison } from '../../core/discovery/experimentComparison';
import { codeCommitHash } from '../../core/build/commitHash';
import { storageAvailable } from '../../core/storage';

/**
 * EVIDENCE & REPLAY — the UI consumer of Genesis's existing Discovery Engine
 * (runDiscoveryCase/replayDiscoveryCase/createDiscoveryEvidencePack). This
 * panel does not run a second simulation or invent a second provenance
 * system: it lets the user run a REAL scenario pair through the real
 * pipeline, persists the result (LocalEvidenceStore — new, Genesis had no
 * persistence for this before), and re-verifies it with the real
 * replayDiscoveryCase(). Scenario choices come from the real SCENARIOS
 * registry; nothing here is a fixed demo pair anymore.
 *
 * Runs a Discovery Case directly through Scenario Engine, independent of the
 * WebGL loop in the rest of this screen — not tied to its live clock.
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

/** Same tamper technique the Discovery Engine's own test suite uses to prove replay catches drift. */
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

const REPLAY_LABELS: Record<DiscoveryReplay['status'], string> = {
  MATCH: 'MATCH', WITHIN_TOLERANCE: 'WITHIN_TOLERANCE', DRIFT: 'DRIFT', BLOCKED: 'BLOCKED', NOT_REPRODUCIBLE: 'NOT_REPRODUCIBLE',
};

function operationError(scope: string, cause: unknown): string {
  const detail = cause instanceof Error ? cause.message : 'Nieznany błąd lokalnego zapisu.';
  return `${scope}: ${detail}`;
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

async function saveNewRun(store: EvidenceStore, record: DiscoveryCase): Promise<StoredEvidence> {
  const sha256 = record.evidence ? await computeEvidencePackSha256(record.evidence) : null;
  const entry: StoredEvidence = {
    schemaVersion: EVIDENCE_STORE_SCHEMA_VERSION,
    record,
    sha256,
    codeCommitHash: codeCommitHash(),
    savedAt: Date.now(),
  };
  await store.save(entry);
  return entry;
}

export function EvidenceReplayPanel() {
  const store = useMemo(() => new LocalEvidenceStore(), []);
  const [baseline, setBaseline] = useState<ScenarioId>('BASELINE');
  const [variant, setVariant] = useState<ScenarioId>('CONTACT_REDUCTION');
  const [history, setHistory] = useState<ExperimentRegistryEntry[]>([]);
  const [current, setCurrent] = useState<StoredEvidence | null>(null);
  const [replay, setReplay] = useState<DiscoveryReplay | null>(null);
  const [driftDemo, setDriftDemo] = useState<DiscoveryReplay | null>(null);
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
      setHistory(await listExperimentRegistry(store));
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
      setReplay(fresh.replay);
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
      const validation = await validateStoredEvidence(entry);
      if (!validation.valid) {
        setCurrent(null);
        setReplay(null);
        setDriftDemo(null);
        setComparison(null);
        setIntegrityNotice(`Zapis odrzucony: ${validation.issues.join('; ')}.`);
        return;
      }
      setIntegrityNotice(null);
      setCurrent(entry);
      setReplay(null);
      setDriftDemo(null);
      setComparison(null);
    } catch (cause) {
      setError(operationError('HISTORIA', cause));
    }
  };

  const replayCurrent = async () => {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      const stored = await store.load(current.record.caseId);
      if (!stored) {
        setIntegrityNotice('REPLAY: zapis nie istnieje już w lokalnej historii.');
        return;
      }
      const validation = await validateStoredEvidence(stored);
      if (!validation.valid) {
        setIntegrityNotice(`REPLAY BLOCKED: ${validation.issues.join('; ')}.`);
        setReplay({ status: 'BLOCKED', tolerance: current.record.replayTolerance, arms: [], message: 'Persisted evidence failed integrity validation.' });
        return;
      }
      setIntegrityNotice(null);
      setReplay(replayDiscoveryCase(stored.record));
    } catch (cause) {
      setError(operationError('REPLAY', cause));
    } finally {
      setBusy(false);
    }
  };

  const simulateDrift = () => {
    if (!current) return;
    setDriftDemo(replayDiscoveryCase(tamperedCopy(current.record)));
  };

  const deleteEntry = async (experimentId: string) => {
    setError(null);
    try {
      await store.delete(experimentId);
      if (current?.record.caseId === experimentId) { setCurrent(null); setReplay(null); setDriftDemo(null); }
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
        validateStoredEvidence(current),
        validateStoredEvidence(other),
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

  const exportEvidence = () => {
    if (!current) return;
    const summary = summarizeStoredEvidence(current);
    downloadJson(`${current.record.caseId}.evidence.json`, {
      experiment: summary,
      configuration: { seed: current.record.seed, initialConditions: current.record.initialConditions, scenarios: current.record.scenarios, parameters: current.record.parameters },
      provenance: summary.provenance,
      fingerprints: { input: current.record.inputFingerprint, result: current.record.runFingerprint, sha256: current.sha256 },
      result: current.record.arms.map((arm) => ({ armId: arm.armId, role: arm.role, resultFingerprint: arm.run.resultFingerprint, summary: arm.summary })),
      replayStatus: current.record.replay?.status ?? null,
      evidencePack: current.record.evidence,
    });
  };

  const statusLine = current
    ? `${current.record.scenarios.baseline}/${current.record.scenarios.variant} · replay ${replay ? REPLAY_LABELS[replay.status] : REPLAY_LABELS[current.record.replay?.status ?? 'NOT_REPRODUCIBLE']}`
    : `${history.length} zapisanych`;

  return (
    <div className="world-panel evidence-panel">
      <button
        type="button"
        className="world-panel-heading evidence-panel-toggle"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span>EVIDENCE &amp; REPLAY {expanded ? '▾' : '▸'}</span>
        <small>{statusLine}</small>
      </button>

      {!expanded ? null : (<>
      <div className="evidence-scenario-picker">
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
      <div className="evidence-actions">
        <button className="world-action accent" disabled={busy} onClick={runExperiment}>{busy ? '…' : '▶ Uruchom eksperyment'}</button>
        {current && (
          <>
            <button className="world-action" disabled={busy} onClick={replayCurrent}>↻ Replay</button>
            <button className="world-action ghost" disabled={busy} onClick={simulateDrift}>⚠ Symuluj rozjazd</button>
            <button className="world-action ghost" disabled={busy} onClick={exportEvidence}>⬇ Eksportuj JSON</button>
          </>
        )}
      </div>
      {error && <p className="evidence-error" role="alert">{error}</p>}
      {integrityNotice && <p className="hospital-panel-note evidence-integrity-notice" role="alert">{integrityNotice}</p>}

      {current ? (
        <>
          <div className="epidemic-summary">
            <div className="epidemic-summary-row"><span>model</span><strong>{current.record.model.modelId}@{current.record.model.modelVersion}</strong></div>
            <div className="epidemic-summary-row"><span>seed</span><strong>{current.record.seed}</strong></div>
            <div className="epidemic-summary-row"><span>scenariusze</span><strong>{current.record.scenarios.baseline} / {current.record.scenarios.variant}</strong></div>
            <div className="epidemic-summary-row"><span>code commit</span><strong className="evidence-hash" title={current.codeCommitHash}>{current.codeCommitHash.startsWith('NOT_AVAILABLE') ? current.codeCommitHash : `${current.codeCommitHash.slice(0, 12)}…`}</strong></div>
            <div className="epidemic-summary-row"><span>input fingerprint</span><strong title={current.record.inputFingerprint}>{current.record.inputFingerprint}</strong></div>
            <div className="epidemic-summary-row"><span>result fingerprint</span><strong title={current.record.runFingerprint ?? undefined}>{current.record.runFingerprint ?? '—'}</strong></div>
            <div className="epidemic-summary-row"><span>evidence pack</span><strong>{current.record.evidence && current.record.evidence.missingFields.length === 0 ? 'KOMPLETNY' : `BRAKUJE: ${current.record.evidence?.missingFields.join(', ') ?? 'brak pakietu'}`}</strong></div>
            <div className="epidemic-summary-row"><span>SHA-256</span><strong className="evidence-hash" title={current.sha256 ?? undefined}>{current.sha256 ? `${current.sha256.slice(0, 16)}…` : '—'}</strong></div>
            {replay && (
              <div className={`epidemic-summary-row ${replay.status === 'DRIFT' ? 'accent-row' : ''}`} role="status" aria-live="polite" aria-atomic="true"><span>replay</span><strong>{REPLAY_LABELS[replay.status]}</strong></div>
            )}
          </div>
          {driftDemo && (
            <p className="hospital-panel-note evidence-drift-demo" role="status" aria-live="polite" aria-atomic="true">
              Symulacja rozjazdu (kontrolowana zmiana w zapisanym rekordzie, nie w modelu): replay zwrócił{' '}
              <strong>{REPLAY_LABELS[driftDemo.status]}</strong>
              {driftDemo.status === 'DRIFT' && driftDemo.arms[0]?.differences.length > 0 && (
                <> — różnica: <code>{driftDemo.arms[0].differences[0].field}</code> (oczekiwano {String(driftDemo.arms[0].differences[0].expected)}, otrzymano {String(driftDemo.arms[0].differences[0].actual)}).</>
              )}
            </p>
          )}
        </>
      ) : (
        <p className="world-panel-empty">Brak zapisanego dowodu. Uruchom eksperyment, aby zobaczyć realne odciski, pakiet dowodowy i werdykt replay.</p>
      )}

      <div className="world-panel-heading evidence-subheading"><span>HISTORIA EKSPERYMENTÓW</span><small>{history.length} zapisanych</small></div>
      {localPersistenceAvailable === false && (
        <p className="hospital-panel-note evidence-history-unavailable" role="status" aria-live="polite" aria-atomic="true">
          <strong>LOCAL_PERSISTENCE_UNAVAILABLE:</strong> Przeglądarka nie udostępnia trwałego local storage. Ten widok nie może potwierdzić zapisanej historii eksperymentów.
        </p>
      )}
      {history.length === 0 && localPersistenceAvailable !== false ? (
        <p className="world-panel-empty">Brak zapisanych eksperymentów.</p>
      ) : history.length > 0 ? (
        <ul className="hotspot-list evidence-history">
          {history.map((entry) => (
            <li key={entry.experimentId} className={current?.record.caseId === entry.experimentId ? 'evidence-history-active' : ''}>
              <button className="evidence-history-row" onClick={() => void loadEntry(entry.experimentId)}>
                <span>{entry.scenarioId} · seed {entry.seed} · {new Date(entry.timestamp).toLocaleString('pl-PL')}</span>
                <strong>{entry.status}</strong>
              </button>
              <button className="evidence-history-delete" aria-label={`Usuń ${entry.experimentId}`} onClick={() => void deleteEntry(entry.experimentId)}>×</button>
            </li>
          ))}
        </ul>
      ) : null}

      {current && history.length > 1 && (
        <div className="evidence-compare">
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
        <div className="evidence-comparison-result">
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
        Odcisk wewnętrzny (<code>fnv1a</code>) i replay przez rzeczywiste przeliczenie modelu pochodzą z
        istniejącego Discovery Engine — nie są tu liczone drugi raz. SHA-256 i <code>codeCommitHash</code> to
        nowe warstwy nad tym samym pakietem dowodowym, zapisywane trwale przez <code>LocalEvidenceStore</code>.
      </p>
      </>)}
    </div>
  );
}
