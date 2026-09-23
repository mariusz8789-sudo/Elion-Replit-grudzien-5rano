import type { ScienceRun, ScienceRunVerification } from '../core/backend/client';

export interface ScientificResultInspectorProps {
  readonly run: ScienceRun;
  readonly verification?: ScienceRunVerification | 'loading' | 'error';
  readonly onVerify: (runId: string) => void;
}

const REPLAY_LABEL: Readonly<Record<ScienceRunVerification['verdict'], string>> = {
  MATCH: 'MATCH — wynik odtworzony',
  DRIFT: 'DRIFT — wynik różni się od zapisanego',
  ENGINE_VERSION_CHANGED: 'BLOCKED — zmieniła się wersja silnika',
  BLOCKED_BY_RUNTIME: 'BLOCKED — silnik jest niedostępny',
  REPLAY_UNSUPPORTED: 'BLOCKED — brak obsługiwanej ścieżki replay',
};

function replayLabel(value: ScientificResultInspectorProps['verification']): string {
  if (!value) return 'NOT_VERIFIED';
  if (value === 'loading') return 'VERIFYING';
  if (value === 'error') return 'BLOCKED — błąd żądania weryfikacji';
  return REPLAY_LABEL[value.verdict];
}

function provenanceSummary(provenance: Record<string, unknown>): string {
  const values = ['source', 'sourceId', 'runtime', 'model', 'modelVersion']
    .flatMap((key) => {
      const value = provenance[key];
      return value == null ? [] : [`${key}: ${String(value)}`];
    });
  return values.length > 0 ? values.join(' · ') : 'Canonical ScienceRun record; no additional source fields supplied.';
}

/** Read-only view over the canonical backend ScienceRun. It derives no scientific result. */
export function ScientificResultInspector({ run, verification, onVerify }: ScientificResultInspectorProps): JSX.Element {
  const replay = replayLabel(verification);
  const replayGood = verification !== 'loading' && verification !== 'error' && verification?.verdict === 'MATCH';
  return (
    <article className="scientific-result-inspector" data-testid={`scientific-result-${run.id}`}>
      <header>
        <strong>{run.capability}</strong>
        <span className="pill pill-warn">{run.evidenceClass}</span>
        <span className={run.status === 'COMPLETED' || run.status === 'completed' ? 'pill pill-ok' : 'pill pill-warn'}>{run.status}</span>
      </header>
      <dl className="world-director-proof">
        <div><dt>Run</dt><dd><code>{run.id}</code></dd></div>
        <div><dt>Campaign / candidate</dt><dd>{run.campaignId ?? '—'} / {run.candidateId ?? '—'}</dd></div>
        <div><dt>Engine</dt><dd>{run.engine} {run.engineVersion ?? 'version unavailable'} · {run.method ?? 'method unavailable'}</dd></div>
        <div><dt>Input fingerprint</dt><dd><code>{run.inputHash ?? 'UNAVAILABLE'}</code></dd></div>
        <div><dt>Output fingerprint</dt><dd><code>{run.outputHash ?? 'UNAVAILABLE'}</code></dd></div>
        <div><dt>Replay</dt><dd className={replayGood ? 'pill pill-ok' : 'pill pill-warn'}>{replay}</dd></div>
      </dl>
      <p className="muted small" data-testid="scientific-result-provenance"><strong>Provenance:</strong> {provenanceSummary(run.provenance)}</p>
      {run.artifacts.length > 0 && <p className="muted small"><strong>Artifacts:</strong> {run.artifacts.map((artifact) => `${artifact.kind}:${artifact.sha256_16 ?? 'hash unavailable'}`).join(' · ')}</p>}
      {run.warnings.length > 0 && <p className="warn-banner small"><strong>Limitations:</strong> {run.warnings.join('; ')}</p>}
      <p className="muted small" data-testid="scientific-result-claim-boundary">
        Wynik obliczeniowy / in-silico. Nie jest pomiarem laboratoryjnym, obserwacją kliniczną ani potwierdzeniem skuteczności.
      </p>
      <button className="chip-btn" disabled={verification === 'loading'} onClick={() => onVerify(run.id)}>
        {verification === 'loading' ? 'Weryfikacja…' : 'Zweryfikuj przez kanoniczny replay'}
      </button>
    </article>
  );
}

