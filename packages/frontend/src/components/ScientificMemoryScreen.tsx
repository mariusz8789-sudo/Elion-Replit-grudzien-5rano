import { useMemo, useState } from 'react';
import { deleteExperiment, listExperiments, type SavedExperiment } from '../core/scienceMemory';
import { classifyStoredEvidencePack, getStoredEvidencePackReplayVerdict, listScientificEvidencePacks, serializeScientificEvidencePack, type StoredEvidencePack } from '../core/experimentFabric';
import { setPendingScenario } from '../core/scenarioBridge';
import { buildPinnedChEMBLCaffeineDiscovery } from '../core/biotechData/chembl';
import { buildPinnedChEMBLAdenosineDiscovery } from '../core/biotechData/adenosine';
import { buildPinnedChEMBLTheophyllineDiscovery } from '../core/biotechData/theophylline';
import { replaySavedBiotechComparison, replaySavedBiotechDiscoveryArtifact } from '../core/scienceMemory';
import { openSavedScenarioInWorld } from '../core/simulation/scenarioWorldReplay';
import type { SavedScenarioReplay } from '../core/simulation/scenarioMemory';
import { replaySavedScenarioCounterfactual, type SavedScenarioCounterfactualReplay } from '../core/simulation/scenarioCounterfactual';
import { replaySavedCompositionCompute, type CompositionComputeReplay } from '../core/naturalCompositionCompute';

function downloadJson(record: SavedExperiment): void {
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${record.contentHash}-${record.experimentId}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadEvidencePack(record: StoredEvidencePack): void {
  const blob = new Blob([serializeScientificEvidencePack(record.pack)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${record.pack.evidencePackId}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pl-PL');
}

export function ScientificMemoryScreen() {
  const [records, setRecords] = useState(() => listExperiments());
  const [evidencePacks] = useState(() => listScientificEvidencePacks());
  const [notice, setNotice] = useState<string | null>(null);
  const [artifactReplay, setArtifactReplay] = useState<Record<string, string>>({});
  const [scenarioReplay, setScenarioReplay] = useState<Record<string, SavedScenarioReplay>>({});
  const [counterfactualReplay, setCounterfactualReplay] = useState<Record<string, SavedScenarioCounterfactualReplay>>({});
  const [computeReplay, setComputeReplay] = useState<Record<string, CompositionComputeReplay>>({});
  const countLabel = useMemo(() => `${records.length} ${records.length === 1 ? 'zapis' : 'zapisów'}`, [records.length]);

  /**
   * Odtwarza zapisany przebieg PRZELICZAJĄC model od nowa i — wyłącznie przy
   * MATCH — otwiera świat 3D. Werdykt inny niż MATCH nie ma czego przekazać,
   * więc nawigacja po prostu się nie odbywa.
   */
  const replayScenarioRecord = (record: SavedExperiment, mode: 'open' | 'verify' | 'drift') => {
    const result = openSavedScenarioInWorld(record.scenario, {
      recordId: record.contentHash,
      ...(mode === 'drift' ? { overrideParams: { r0: (record.scenario?.params.r0 ?? 2.5) + 1 } } : {}),
    });
    setScenarioReplay((current) => ({ ...current, [record.id]: result.replay }));
    if (mode === 'open' && result.opened) {
      window.location.hash = '#/city3d';
      return;
    }
    if (mode === 'open') {
      setNotice(`Świat 3D nie został otwarty: odtworzenie zakończyło się werdyktem ${result.replay.status}. Niezweryfikowany przebieg nie trafia do sceny.`);
    }
  };

  /** Odtwarza OBA ramiona kontrfaktyku i przelicza różnicę. Zapisane liczby są porównywane, nie odczytywane. */
  const replayCounterfactualRecord = (record: SavedExperiment, tamper: boolean) => {
    const saved = tamper && record.counterfactual
      ? { ...record.counterfactual, metrics: record.counterfactual.metrics.map((metric, index) => index === 0 ? { ...metric, absoluteDelta: metric.absoluteDelta + 1 } : metric) }
      : record.counterfactual;
    setCounterfactualReplay((current) => ({ ...current, [record.id]: replaySavedScenarioCounterfactual(saved) }));
  };

  const openRecord = (record: SavedExperiment) => {
    if (record.scenario) {
      replayScenarioRecord(record, 'open');
      return;
    }
    const route = record.execution?.route;
    if (route?.kind === 'hypothetical-visualization') {
      window.location.hash = route.hash;
      return;
    }
    if (route?.kind === 'live-world') {
      setNotice('Zapisany live-world jest wskaźnikiem historycznego runu; sesyjna instancja wygasła. Otwórz Pilota, aby wykonać jawny rerun.');
      window.location.hash = '#/pilot';
      return;
    }
    if (route?.kind === 'lab') {
      setPendingScenario(route.labId, record.params, route.experimentId);
      window.location.hash = `#/lab/${route.labId}`;
      return;
    }
    setPendingScenario(record.labId, record.params, record.experimentId);
    window.location.hash = `#/lab/${record.labId}`;
  };

  const removeRecord = (record: SavedExperiment) => {
    deleteExperiment(record.id);
    setRecords(listExperiments());
    setNotice(`Usunięto lokalny zapis „${record.experimentName}”.`);
  };

  return (
    <main className="settings-view" id="main-content" tabIndex={-1}>
      <section className="settings-section">
        <h2>Pamięć Naukowa</h2>
        <p className="settings-hint">
          {countLabel}. To są lokalne zapisy tej przeglądarki, nie współdzielone konto ani Evidence Pack.
          Każdy rekord zachowuje model, parametry, migawkę wyniku, status epistemiczny i deterministyczny fingerprint treści.
        </p>
        {notice && <p className="settings-hint" role="status">{notice}</p>}
      </section>

      {records.length === 0 ? (
        <section className="settings-section">
          <h2>Brak zapisanych eksperymentów</h2>
          <p className="settings-hint">Otwórz laboratorium, uruchom model i wpisz w Science Chat „zapisz eksperyment”.</p>
          <button className="chip-btn pilot-primary" onClick={() => { window.location.hash = '#/pilot'; }}>Otwórz Pilota eksperymentu</button>
        </section>
      ) : (
        <section className="settings-section" aria-label="Zapisane eksperymenty">
          {records.map((record) => {
            const biotechReplayReports = record.biotech?.artifact?.reports ?? [
              buildPinnedChEMBLCaffeineDiscovery().report,
              buildPinnedChEMBLAdenosineDiscovery().report,
              buildPinnedChEMBLTheophyllineDiscovery().report,
            ];
            const biotechReplay = record.biotech?.comparison
              ? replaySavedBiotechComparison(record.biotech.comparison, biotechReplayReports)
              : undefined;
            const artifact = record.biotech?.artifact;
            const runArtifactReplay = (mode: 'match' | 'drift' | 'blocked') => {
              const lineage = { activityIds: record.biotech?.activityIds, assayIds: record.biotech?.assayIds, computeRuns: artifact?.computeRuns, sourceRecords: artifact?.sourceRecords, activityRecords: artifact?.activityRecords, neurobiology: artifact?.neurobiology };
              const persistedReports = artifact?.reports ?? [];
              const result = mode === 'blocked' ? replaySavedBiotechDiscoveryArtifact(undefined, []) : replaySavedBiotechDiscoveryArtifact(artifact, persistedReports, mode === 'drift' ? { ...lineage, activityIds: [...(lineage.activityIds ?? []), 'controlled-drift'] } : lineage);
              setArtifactReplay((current) => ({ ...current, [record.id]: `${result.status} — ${result.reason}` }));
            };
            return (
            <article className="settings-section" key={record.id}>
              <h2>{record.experimentName}</h2>
              <p className="settings-hint">{formatDate(record.createdAt)} · {record.labId}/{record.experimentId}</p>
              <div className="stat-list">
                <div className="stat-row"><span>Status epistemiczny</span><span className="val">{record.epistemicStatus || 'NOT_SPECIFIED'}</span></div>
                {record.execution && <>
                  <div className="stat-row"><span>Status runu</span><span className="val">{record.execution.status}</span></div>
                  <div className="stat-row"><span>Origin</span><span className="val">{record.execution.resultOrigin}</span></div>
                  <div className="stat-row"><span>Run / provenance</span><span className="val mono">{record.execution.runId} · {record.execution.runFingerprint}</span></div>
                </>}
                {record.biotech && <>
                  <div className="stat-row"><span>Biotech target</span><span className="val">{record.biotech.candidateId}</span></div>
                  <div className="stat-row"><span>Evidence IDs</span><span className="val mono">{record.biotech.evidenceIds.join(', ') || 'brak'}</span></div>
                  {record.biotech.comparison && <>
                    <div className="stat-row"><span>Candidate comparison</span><span className="val">{record.biotech.comparison.candidateIds.length} candidates · {record.biotech.comparison.epistemicStatus}</span></div>
                    <div className="stat-row"><span>Comparison fingerprint</span><span className="val mono">{record.biotech.comparison.scientificFingerprint}</span></div>
                    <div className="stat-row"><span>Comparison boundary</span><span className="val">PREDICTION · {record.biotech.comparison.uncertainty}</span></div>
                    {biotechReplay && <div className="stat-row"><span>Comparison replay integrity</span><span className="val">{biotechReplay.status}</span></div>}
                  </>}
                  {artifact && <>
                    <div className="stat-row"><span>Unified Discovery Artifact</span><span className="val">{artifact.candidateIds.length} candidates · {artifact.computeRuns.length} compute runs</span></div>
                    <div className="stat-row"><span>Artifact fingerprint</span><span className="val mono">{artifact.artifactFingerprint}</span></div>
                    <div className="stat-row"><span>Artifact lineage</span><span className="val mono">{artifact.sourceIds.length} sources · {artifact.activityIds.length} activities · {artifact.assayIds.length} assays</span></div>
                    <div className="stat-row"><span>Validation requests</span><span className="val mono">{artifact.validationRequestIds.length ? artifact.validationRequestIds.join(', ') : 'BLOCKED / not yet executable'}</span></div>
                    {artifact.neurobiology && <div className="stat-row"><span>Neurobiology</span><span className="val">{artifact.neurobiology.receptor} · {artifact.neurobiology.receptorFamily} · {artifact.neurobiology.neurotransmitterSystem} · {artifact.neurobiology.pathway.status} · {artifact.neurobiology.mechanism.status}</span></div>}
                    {artifact.combinationHypothesis && <>
                      <div className="stat-row"><span>Combination hypothesis</span><span className="val mono">{artifact.combinationHypothesis.combinationId} · {artifact.combinationHypothesis.status}</span></div>
                      <div className="stat-row"><span>Combination coverage</span><span className="val">evidence {artifact.combinationHypothesis.coveredEvidenceIds.length} · targets {artifact.combinationHypothesis.coveredTargetIds.length} · mechanisms {artifact.combinationHypothesis.coveredMechanismIds.length} · missing evidence {artifact.combinationHypothesis.missingEvidenceIds.length}</span></div>
                      <div className="stat-row"><span>Combination uncertainty</span><span className="val">{artifact.combinationHypothesis.uncertainty}</span></div>
                      <details className="settings-details"><summary>Combination validation plan</summary>{artifact.combinationHypothesis.validationPlan.map((step) => <p className="settings-hint" key={step}>{step}</p>)}</details>
                    </>}
                    {artifactReplay[record.id] && <div className="stat-row"><span>Full artifact replay</span><span className="val">{artifactReplay[record.id]}</span></div>}
                    {artifact.compositionCompute && <div className="stat-row"><span>Per-hypothesis compute</span><span className="val">{artifact.compositionCompute.reduce((sum, entry) => sum + entry.executedRunCount, 0)} wykonanych runów w {artifact.compositionCompute.length} kompozycjach</span></div>}
                    {computeReplay[record.id] && <div className="stat-row"><span>Integralność zapisanego compute</span><span className="val">{computeReplay[record.id]!.status} · zweryfikowano {computeReplay[record.id]!.verifiedRecordCount}</span></div>}
                  </>}
                </>}
                {record.scenario && <>
                  <div className="stat-row"><span>Scenario Engine</span><span className="val">{record.scenario.label} · {record.scenario.days} dni × {record.scenario.stepsPerDay} kroków · interwencja od dnia {record.scenario.interventionStartDay}</span></div>
                  <div className="stat-row"><span>Silnik / kontrakt pamięci</span><span className="val mono">{record.scenario.engineVersion} · {record.scenario.contractVersion}</span></div>
                  <div className="stat-row"><span>Odcisk wyniku</span><span className="val mono">{record.scenario.resultFingerprint}</span></div>
                  <div className="stat-row"><span>Odcisk epidemii / wejścia</span><span className="val mono">{record.scenario.epidemicFingerprint} · {record.scenario.inputFingerprint}</span></div>
                  <div className="stat-row"><span>Status epistemiczny przebiegu</span><span className="val">{record.scenario.epistemicStatus} — model nieskalibrowany, nie prognoza</span></div>
                  {scenarioReplay[record.id] && <>
                    <div className="stat-row"><span>Werdykt odtworzenia</span><span className="val">{scenarioReplay[record.id]!.status}</span></div>
                    <div className="stat-row"><span>Odcisk oczekiwany / otrzymany</span><span className="val mono">{scenarioReplay[record.id]!.expectedResultFingerprint ?? 'brak'} · {scenarioReplay[record.id]!.actualResultFingerprint ?? 'brak'}</span></div>
                  </>}
                </>}
                {record.counterfactual && <>
                  <div className="stat-row"><span>Kontrfaktyk</span><span className="val">{record.counterfactual.baseline.label} (dzień {record.counterfactual.baseline.interventionStartDay}) → {record.counterfactual.variant.label} (dzień {record.counterfactual.variant.interventionStartDay})</span></div>
                  <div className="stat-row"><span>Zmienione wymiary</span><span className="val">parametry: {record.counterfactual.changedParameters.join(', ') || 'brak'} · czas: {record.counterfactual.changedTiming.join(', ') || 'brak'} · pojemność: {record.counterfactual.changedCapacity.join(', ') || 'brak'}</span></div>
                  <div className="stat-row"><span>Dzień rozjazdu światów</span><span className="val">{record.counterfactual.firstDivergentDay === null ? 'brak rozjazdu epidemicznego' : `dzień ${record.counterfactual.firstDivergentDay}`}</span></div>
                  <div className="stat-row"><span>Odcisk kontrfaktyku</span><span className="val mono">{record.counterfactual.counterfactualFingerprint}</span></div>
                  {record.counterfactual.metrics.map((metric) => (
                    <div className="stat-row" key={metric.key}>
                      <span>Δ {metric.key}</span>
                      <span className="val mono">{metric.baseline} → {metric.variant} ({metric.absoluteDelta >= 0 ? '+' : ''}{Number(metric.absoluteDelta.toFixed(4))}{metric.relativeDeltaPercent === null ? '' : `, ${metric.relativeDeltaPercent >= 0 ? '+' : ''}${metric.relativeDeltaPercent.toFixed(1)}%`})</span>
                    </div>
                  ))}
                  {counterfactualReplay[record.id] && <>
                    <div className="stat-row"><span>Werdykt odtworzenia kontrfaktyku</span><span className="val">{counterfactualReplay[record.id]!.status}</span></div>
                    <div className="stat-row"><span>Ramiona</span><span className="val">baseline={counterfactualReplay[record.id]!.baselineStatus ?? 'brak'} · variant={counterfactualReplay[record.id]!.variantStatus ?? 'brak'}</span></div>
                  </>}
                </>}
                <div className="stat-row"><span>Honesty</span><span className="val">{record.honesty}</span></div>
                <div className="stat-row"><span>Fingerprint treści</span><span className="val mono">#{record.contentHash}</span></div>
                <div className="stat-row"><span>Parametry</span><span className="val">{Object.keys(record.params).length}</span></div>
                {record.execution?.route && <div className="stat-row"><span>Route</span><span className="val mono">{record.execution.route.kind}</span></div>}
                {record.evidencePackId && <div className="stat-row"><span>Evidence Pack</span><span className="val mono">{record.evidencePackId}</span></div>}
                {record.replayIdentity && <div className="stat-row"><span>Replay identity</span><span className="val mono">{record.replayIdentity.capsuleId} · {record.replayIdentity.planId} · {record.replayIdentity.confirmationId}</span></div>}
              </div>
              <p className="settings-hint">{record.honestyNote}</p>
              {counterfactualReplay[record.id] && (
                <>
                  <p className="settings-hint" role="status">
                    Odtworzenie kontrfaktyku: {counterfactualReplay[record.id]!.status} — {counterfactualReplay[record.id]!.reason}{' '}
                    Oba ramiona wykonano ponownie, a różnica została przeliczona.
                  </p>
                  {counterfactualReplay[record.id]!.differences.length > 0 && (
                    <details className="settings-details" open>
                      <summary>Różnice odtworzenia ({counterfactualReplay[record.id]!.differences.length})</summary>
                      <div className="stat-list">
                        {counterfactualReplay[record.id]!.differences.map((difference) => (
                          <div className="stat-row" key={difference.field}>
                            <span>{difference.field}</span>
                            <span className="val mono">{String(difference.expected)} → {String(difference.actual)}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </>
              )}
              {scenarioReplay[record.id] && (
                <>
                  <p className="settings-hint" role="status">
                    Odtworzenie przebiegu: {scenarioReplay[record.id]!.status} — {scenarioReplay[record.id]!.reason}{' '}
                    Model policzono od nowa z zapisanych wejść; zapisana seria nie jest źródłem tego werdyktu.
                  </p>
                  {scenarioReplay[record.id]!.differences.length > 0 && (
                    <details className="settings-details" open>
                      <summary>Różnice ({scenarioReplay[record.id]!.differences.length})</summary>
                      <div className="stat-list">
                        {scenarioReplay[record.id]!.differences.map((difference) => (
                          <div className="stat-row" key={difference.field}>
                            <span>{difference.field}</span>
                            <span className="val mono">{String(difference.expected)} → {String(difference.actual)}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </>
              )}
              {biotechReplay && <p className="settings-hint">Replay comparison: {biotechReplay.status} — {biotechReplay.reason} Nie jest to biologiczne wykonanie ani świeży pomiar.</p>}
              {computeReplay[record.id] && <p className="settings-hint" role="status">Zapisane compute: {computeReplay[record.id]!.status} — {computeReplay[record.id]!.reason}</p>}
              {record.execution?.summary && <p className="settings-hint">{record.execution.summary}</p>}
              {record.biotech && record.biotech.provenance.length > 0 && (
                <details className="settings-details">
                  <summary>Provenance źródeł ({record.biotech.provenance.length})</summary>
                  <div className="stat-list">
                    {record.biotech.provenance.map((source) => (
                      <div className="stat-row" key={`${source.source}:${source.sourceId}`}>
                        <span>{source.source} / {source.sourceId} · {source.status}</span>
                        <span className="val mono">{source.sourceVersion ?? 'wersja niepodana'}{source.sourceUrl ? <> · <a href={source.sourceUrl} target="_blank" rel="noreferrer">źródło</a></> : ''}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {record.observations && (
                <details className="settings-details">
                  <summary>Obserwacje ({Math.max(0, ...Object.values(record.observations).map((value) => Array.isArray(value) ? value.length : 1))} próbek, {Object.keys(record.observations).length} serii)</summary>
                  <div className="stat-list">
                    {Object.entries(record.observations).map(([key, value]) => (
                      <div className="stat-row" key={key}><span>{key}</span><span className="val mono">{Array.isArray(value) ? value.slice(-3).join(', ') : String(value)}</span></div>
                    ))}
                  </div>
                </details>
              )}
              {record.analysis && record.analysis.length > 0 && (
                <details className="settings-details">
                  <summary>Analiza nagrania ({record.analysis.length} bloków)</summary>
                  {record.analysis.map((block) => (
                    <section key={`${block.title}:${block.body}`}>
                      <strong>{block.title}</strong>
                      <p className="settings-hint">{block.body}</p>
                    </section>
                  ))}
                </details>
              )}
              <div className="pilot-actions">
                <button className="chip-btn pilot-primary" onClick={() => openRecord(record)}>{record.scenario ? 'Odtwórz i otwórz w 3D' : 'Otwórz z parametrami'}</button>
                {record.counterfactual && <>
                  <button className="chip-btn pilot-primary" onClick={() => replayCounterfactualRecord(record, false)}>Odtwórz oba ramiona</button>
                  <button className="chip-btn" onClick={() => replayCounterfactualRecord(record, true)}>Podmień różnicę → DRIFT</button>
                </>}
                {record.scenario && <>
                  <button className="chip-btn" onClick={() => replayScenarioRecord(record, 'verify')}>Sam werdykt odtworzenia</button>
                  <button className="chip-btn" onClick={() => replayScenarioRecord(record, 'drift')}>Zmień R₀ → pokaż DRIFT</button>
                </>}
                {record.evidencePackId && <button className="chip-btn" onClick={() => { window.location.hash = `#/pilot?mode=protocol&replay=${encodeURIComponent(record.evidencePackId!)}`; }}>Otwórz Evidence replay</button>}
                <button className="chip-btn" onClick={() => downloadJson(record)}>Eksportuj JSON</button>
                {artifact && <>
                  <button className="chip-btn pilot-primary" onClick={() => { window.location.hash = `#/dossier?candidate=${encodeURIComponent(artifact.reports[0]?.candidateId ?? '')}`; }}>Open Candidate Dossier</button>
                  <button className="chip-btn pilot-primary" onClick={() => runArtifactReplay('match')}>Replay artifact</button>
                  {artifact.compositionCompute && <>
                    <button className="chip-btn" onClick={() => setComputeReplay((current) => ({ ...current, [record.id]: replaySavedCompositionCompute(artifact.compositionCompute) }))}>Zweryfikuj zapisane compute</button>
                    <button className="chip-btn" onClick={() => setComputeReplay((current) => ({ ...current, [record.id]: replaySavedCompositionCompute(artifact.compositionCompute!.map((entry) => ({ ...entry, runtimes: entry.runtimes.map((runtime) => ({ ...runtime, componentRecords: runtime.componentRecords.map((componentRecord) => componentRecord.status === 'EXECUTED' ? { ...componentRecord, outputs: { ...componentRecord.outputs, tampered: 1 } } : componentRecord) })) }))) }))}>Podmień wynik → DRIFT</button>
                  </>}
                  <button className="chip-btn" onClick={() => runArtifactReplay('drift')}>Test DRIFT</button>
                  <button className="chip-btn" onClick={() => runArtifactReplay('blocked')}>Test BLOCKED</button>
                </>}
                <button className="chip-btn danger" onClick={() => removeRecord(record)}>Usuń lokalnie</button>
              </div>
            </article>
            );
          })}
        </section>
      )}

      <section className="settings-section" aria-label="Lokalne Evidence Packs">
        <h2>Evidence Packs lokalne</h2>
        <p className="settings-hint">
          {evidencePacks.length} zapisanych snapshotów Evidence Pack na tym urządzeniu. To pełne rekordy wyników zapisane po wykonaniu Pilota;
          zapis lokalny nie jest jeszcze dowodem ponownego uruchomienia backendu.
        </p>
        {evidencePacks.length === 0 ? <p className="settings-hint">Brak lokalnych Evidence Packs. Wykonaj zatwierdzony Protocol/A-B w Pilocie.</p> : evidencePacks.map((record) => {
          const snapshotVerdict = getStoredEvidencePackReplayVerdict(record.pack);
          return (
          <article className="settings-section" key={record.pack.evidencePackId}>
            <h2 className="mono">{record.pack.evidencePackId}</h2>
            <p className="settings-hint">Zapisano: {formatDate(record.savedAt)} · {record.pack.runCount} runów · model {record.pack.protocol.hypothesis.modelId}</p>
            <div className="stat-list">
              <div className="stat-row"><span>Snapshot schema</span><span className="val">{classifyStoredEvidencePack(record.pack)}</span></div>
              <div className="stat-row"><span>Persisted replay verdict</span><span className="val">{snapshotVerdict}</span></div>
              <div className="stat-row"><span>Source</span><span className="val">real runs only: {String(record.pack.runs.length > 0)}</span></div>
              {record.pack.externalObservationComparison && <>
                <div className="stat-row"><span>Independent observation</span><span className="val">{record.pack.externalObservationComparison.observable} · {record.pack.externalObservationComparison.comparisons.map((item) => `${item.nuclide}=${item.status}`).join(', ')}</span></div>
                <div className="stat-row"><span>Observation error</span><span className="val">MAE {record.pack.externalObservationComparison.meanAbsoluteError.toPrecision(5)} · RMSE {record.pack.externalObservationComparison.rootMeanSquareError.toPrecision(5)} {record.pack.externalObservationComparison.unit}</span></div>
                <div className="stat-row"><span>Calibration</span><span className="val">{record.pack.externalObservationComparison.calibration.status}</span></div>
              </>}
            </div>
            <p className="settings-hint">{snapshotVerdict === 'MATCH' ? 'MATCH pochodzi z zapisanego snapshotu armów; nie oznacza nowego uruchomienia.' : snapshotVerdict === 'DRIFT' ? 'DRIFT zapisany w snapshotcie; wykonaj jawny rerun, aby porównać aktualny wynik.' : 'BLOCKED: zapis nie zawiera pełnego wykonanego replay; nie traktuj go jako potwierdzenia.'}</p>
            {record.pack.externalObservationComparison && <p className="settings-hint">AME2020 source: {record.pack.externalObservationComparison.provenance.sourceUrl}; raw SHA-256: {record.pack.externalObservationComparison.provenance.rawPayloadSha256}. This is an independent observation comparison, not a calibrated accuracy claim.</p>}
            <div className="pilot-actions">
              <button className="chip-btn pilot-primary" onClick={() => { window.location.hash = `#/pilot?mode=protocol&replay=${encodeURIComponent(record.pack.evidencePackId)}`; }}>Otwórz do jawnego rerun</button>
              <button className="chip-btn" onClick={() => downloadEvidencePack(record)}>Eksportuj Evidence Pack JSON</button>
            </div>
          </article>
          );
        })}
      </section>

      <section className="settings-section">
        <h2>Granice funkcji</h2>
        <p className="settings-hint">
          Historia nie dowodzi reprodukcji sama w sobie, nie synchronizuje danych z innymi użytkownikami i nie uruchamia modeli w tle.
          Evidence Pack snapshot jest lokalnym rekordem pochodzącym z realnego runu; pełny backend replay nadal wymaga jawnego ponownego wykonania w Experiment Pilot.
        </p>
      </section>
    </main>
  );
}
