import { useMemo, useState } from 'react';
import { deleteExperiment, listExperiments, type SavedExperiment } from '../core/scienceMemory';
import { classifyStoredEvidencePack, getStoredEvidencePackReplayVerdict, listScientificEvidencePacks, serializeScientificEvidencePack, type StoredEvidencePack } from '../core/experimentFabric';
import { setPendingScenario } from '../core/scenarioBridge';

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
  const countLabel = useMemo(() => `${records.length} ${records.length === 1 ? 'zapis' : 'zapisów'}`, [records.length]);

  const openRecord = (record: SavedExperiment) => {
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
          {records.map((record) => (
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
                </>}
                <div className="stat-row"><span>Honesty</span><span className="val">{record.honesty}</span></div>
                <div className="stat-row"><span>Fingerprint treści</span><span className="val mono">#{record.contentHash}</span></div>
                <div className="stat-row"><span>Parametry</span><span className="val">{Object.keys(record.params).length}</span></div>
                {record.evidencePackId && <div className="stat-row"><span>Evidence Pack</span><span className="val mono">{record.evidencePackId}</span></div>}
                {record.replayIdentity && <div className="stat-row"><span>Replay identity</span><span className="val mono">{record.replayIdentity.capsuleId} · {record.replayIdentity.planId} · {record.replayIdentity.confirmationId}</span></div>}
              </div>
              <p className="settings-hint">{record.honestyNote}</p>
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
                <button className="chip-btn pilot-primary" onClick={() => openRecord(record)}>Otwórz z parametrami</button>
                {record.evidencePackId && <button className="chip-btn" onClick={() => { window.location.hash = `#/pilot?mode=protocol&replay=${encodeURIComponent(record.evidencePackId!)}`; }}>Otwórz Evidence replay</button>}
                <button className="chip-btn" onClick={() => downloadJson(record)}>Eksportuj JSON</button>
                <button className="chip-btn danger" onClick={() => removeRecord(record)}>Usuń lokalnie</button>
              </div>
            </article>
          ))}
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
            </div>
            <p className="settings-hint">{snapshotVerdict === 'MATCH' ? 'MATCH pochodzi z zapisanego snapshotu armów; nie oznacza nowego uruchomienia.' : snapshotVerdict === 'DRIFT' ? 'DRIFT zapisany w snapshotcie; wykonaj jawny rerun, aby porównać aktualny wynik.' : 'BLOCKED: zapis nie zawiera pełnego wykonanego replay; nie traktuj go jako potwierdzenia.'}</p>
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
