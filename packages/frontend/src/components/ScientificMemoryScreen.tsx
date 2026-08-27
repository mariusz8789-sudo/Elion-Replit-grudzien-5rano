import { useMemo, useState } from 'react';
import { deleteExperiment, listExperiments, type SavedExperiment } from '../core/scienceMemory';
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

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pl-PL');
}

export function ScientificMemoryScreen() {
  const [records, setRecords] = useState(() => listExperiments());
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
                <div className="stat-row"><span>Honesty</span><span className="val">{record.honesty}</span></div>
                <div className="stat-row"><span>Fingerprint treści</span><span className="val mono">#{record.contentHash}</span></div>
                <div className="stat-row"><span>Parametry</span><span className="val">{Object.keys(record.params).length}</span></div>
              </div>
              <p className="settings-hint">{record.honestyNote}</p>
              <div className="pilot-actions">
                <button className="chip-btn pilot-primary" onClick={() => openRecord(record)}>Otwórz z parametrami</button>
                <button className="chip-btn" onClick={() => downloadJson(record)}>Eksportuj JSON</button>
                <button className="chip-btn danger" onClick={() => removeRecord(record)}>Usuń lokalnie</button>
              </div>
            </article>
          ))}
        </section>
      )}

      <section className="settings-section">
        <h2>Granice funkcji</h2>
        <p className="settings-hint">
          Historia nie dowodzi reprodukcji sama w sobie, nie tworzy Evidence Pack, nie synchronizuje danych z innymi użytkownikami
          i nie uruchamia modeli w tle. Do audytowalnego wyniku użyj Experiment Pilot oraz Evidence / Replay.
        </p>
      </section>
    </main>
  );
}
