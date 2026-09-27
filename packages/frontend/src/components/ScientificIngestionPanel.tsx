import { useState } from 'react';
import type React from 'react';
import {
  ingestScientificSource,
  type ApiResult,
  type ScientificIngestionResult,
  type ScientificIngestionSource,
} from '../core/backend/client';

/**
 * D-149 — "Ingestia na żywo z hashem". Four public scientific sources, one
 * button each. The panel shows exactly what `/api/ingestion/source`
 * returned: the access status (LIVE / NO_ACCESS / PINNED_FALLBACK), the
 * sha256 of the raw payload, the byte count and the time. It never computes
 * a hash itself and never turns a failed fetch into anything else; a
 * PINNED_FALLBACK row says which repository file the hash came from.
 */

export interface IngestionRowSpec {
  source: ScientificIngestionSource;
  label: string;
  defaultId: string;
  what: string;
}

export const DEFAULT_INGESTION_ROWS: readonly IngestionRowSpec[] = Object.freeze([
  { source: 'pdb', label: 'PDB / RCSB', defaultId: '1IEP', what: 'struktura ABL1 z imatynibem' },
  { source: 'chembl', label: 'ChEMBL', defaultId: 'CHEMBL941', what: 'cząsteczka imatynib' },
  { source: 'uniprot', label: 'UniProt', defaultId: 'P00519', what: 'białko ABL1 (człowiek)' },
  { source: 'clinicaltrials', label: 'ClinicalTrials.gov', defaultId: 'NCT03987919', what: 'badanie SURPASS-2' },
]);

export type IngestionFetcher = (source: ScientificIngestionSource, id: string) => Promise<ApiResult<ScientificIngestionResult>>;

export type IngestionRowState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'done'; result: ScientificIngestionResult }
  | { kind: 'failed'; error: string; message: string };

/** Runs every default row through the given fetcher (the real client by default) — pure over its input, so it is testable without React state. */
export async function runDefaultIngestion(fetcher: IngestionFetcher = ingestScientificSource, rows: readonly IngestionRowSpec[] = DEFAULT_INGESTION_ROWS): Promise<Record<string, IngestionRowState>> {
  const out: Record<string, IngestionRowState> = {};
  for (const row of rows) {
    const r = await fetcher(row.source, row.defaultId);
    out[row.source] = r.ok ? { kind: 'done', result: r.data } : { kind: 'failed', error: r.error, message: r.message };
  }
  return out;
}

export function shortHash(sha256: string | null | undefined): string {
  return sha256 ? `${sha256.slice(0, 12)}…` : '—';
}

function StatusBadge({ status }: { status: ScientificIngestionResult['status'] }): React.ReactElement {
  const cls = status === 'LIVE' ? 'rv-tag rv-tag-good' : status === 'PINNED_FALLBACK' ? 'rv-tag rv-tag-warn' : 'rv-tag rv-tag-bad';
  return <span className={cls} data-testid={`ingestion-status-${status}`}>{status}</span>;
}

export interface ScientificIngestionViewProps {
  rows: readonly IngestionRowSpec[];
  states: Readonly<Record<string, IngestionRowState>>;
  busy: boolean;
  onFetch: () => void;
}

/** Stateless view: everything on screen comes from `states`. */
export function ScientificIngestionView({ rows, states, busy, onFetch }: ScientificIngestionViewProps): React.ReactElement {
  return (
    <section className="rv-card" aria-labelledby="rv-c6" data-testid="scientific-ingestion-panel">
      <p className="rv-kicker">Ingestia na żywo z hashem · D-149</p>
      <h2 id="rv-c6">Ingestia na żywo z hashem</h2>
      <p>
        Cztery publiczne źródła naukowe, jeden przycisk. Każde pobranie zapisuje adres URL, status HTTP, SHA-256 surowej odpowiedzi,
        liczbę bajtów i czas — po stronie serwera, z allowlisty adresów.
      </p>
      <p className="rv-note" data-testid="ingestion-caveat">
        Bez sieci status to NO_ACCESS; wynik przypięty jest oznaczony osobno, nigdy nie udaje pobrania na żywo.
      </p>
      <div className="rv-controls">
        <button type="button" className="rv-btn" disabled={busy} onClick={onFetch} data-testid="ingestion-fetch-live">
          {busy ? 'Pobieranie…' : 'Pobierz na żywo'}
        </button>
      </div>
      <div className="rv-table">
        <table>
          <thead>
            <tr>
              <th>Źródło</th>
              <th>Identyfikator</th>
              <th>Status dostępu</th>
              <th>SHA-256 (12 znaków)</th>
              <th>Pobrano</th>
              <th>Szczegóły</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const st = states[row.source] ?? { kind: 'idle' };
              return (
                <tr key={row.source} data-testid={`ingestion-row-${row.source}`}>
                  <td>{row.label}</td>
                  <td><code>{row.defaultId}</code> <span className="rv-note">{row.what}</span></td>
                  <td>
                    {st.kind === 'idle' && <span className="rv-note">nie pobrano</span>}
                    {st.kind === 'busy' && <span className="rv-note">pobieranie…</span>}
                    {st.kind === 'done' && <StatusBadge status={st.result.status} />}
                    {st.kind === 'failed' && <span className="rv-tag rv-tag-bad">BŁĄD API</span>}
                  </td>
                  <td><code>{st.kind === 'done' ? shortHash(st.result.sha256) : '—'}</code></td>
                  <td>{st.kind === 'done' ? st.result.fetchedAt : '—'}</td>
                  <td className="rv-note">
                    {st.kind === 'done' && (
                      <>
                        HTTP {st.result.httpStatus ?? 'brak'} · {st.result.bytes} B · <code>{st.result.url}</code>
                        {st.result.error ? <> · {st.result.error}</> : null}
                        {st.result.pinned ? (
                          <>
                            {' '}· kopia przypięta: <code>{st.result.pinned.path}</code> ({st.result.pinned.matchesRecord ? 'hash zgodny z zapisem' : 'HASH NIEZGODNY z zapisem'}) — {st.result.pinned.nature}
                          </>
                        ) : null}
                      </>
                    )}
                    {st.kind === 'failed' && <>{st.error}: {st.message}</>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="rv-foot">
        Endpoint: <code>GET /api/ingestion/source?source=&amp;id=</code>, rejestr: <code>GET /api/ingestion/status</code>. Identyfikatory są walidowane
        wzorcem per źródło, a URL budowany wyłącznie z allowlisty (files.rcsb.org, www.ebi.ac.uk/chembl, rest.uniprot.org, clinicaltrials.gov).
      </p>
    </section>
  );
}

export function ScientificIngestionPanel({ fetcher = ingestScientificSource }: { fetcher?: IngestionFetcher }): React.ReactElement {
  const [states, setStates] = useState<Record<string, IngestionRowState>>({});
  const [busy, setBusy] = useState(false);

  const onFetch = (): void => {
    setBusy(true);
    setStates(Object.fromEntries(DEFAULT_INGESTION_ROWS.map((r) => [r.source, { kind: 'busy' } as IngestionRowState])));
    void runDefaultIngestion(fetcher).then((next) => { setStates(next); setBusy(false); });
  };

  return <ScientificIngestionView rows={DEFAULT_INGESTION_ROWS} states={states} busy={busy} onFetch={onFetch} />;
}
