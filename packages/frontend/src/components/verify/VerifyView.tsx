import type { ReactNode } from 'react';
import type { GenesisRecordExport, ResearchRunSummary } from '../../core/backend/client';
import type { Locale } from '../../core/i18n';
import type { Notice, ReportView } from './verifyModel';
import { vText } from './verifyText';

/**
 * #/verify — the pure view. It renders only what it is given (VerifyScreen fetches and holds state), so
 * every state can be rendered in a test with renderToStaticMarkup. Engine names and the server's own
 * sentences appear only inside the collapsed <details> "technical details".
 */

export type Loadable<T> = { status: 'idle' } | { status: 'loading' } | { status: 'error'; notice: Notice } | { status: 'ready'; value: T };

export interface ExporterProps {
  runs: Loadable<ResearchRunSummary[]>;
  runId: string;
  experiments: Loadable<{ experimentId: string; label: string; status: string }[]>;
  experimentId: string;
  exporting: boolean;
  exportNotice: Notice | null;
  exported: GenesisRecordExport | null;
  /** Object URL of the exported record Blob, made by the container. */
  exportedUrl: string | null;
  /** A result screen asked to verify this run ("Verify this result"): the section opens with it picked. */
  preselected?: boolean;
  onRun: (runId: string) => void;
  onExperiment: (experimentId: string) => void;
  onGetRecord: () => void;
}

export interface VerifyViewProps {
  locale: Locale;
  projectBar: ReactNode;
  recordText: string;
  fileName: string | null;
  fileNotice: Notice | null;
  declaredSha: string;
  /** null = empty (optional), false = typed and not a sha256. */
  shaValid: boolean | null;
  busy: boolean;
  notice: Notice | null;
  result: ReportView | null;
  reportUrl: string | null;
  reportFileName: string | null;
  exporter: ExporterProps;
  onRecordText: (text: string) => void;
  onFile: (file: File) => void;
  onSha: (sha: string) => void;
  onVerify: () => void;
  onClear: () => void;
}

export function Technical({ locale, rows, testId }: { locale: Locale; rows: readonly string[]; testId?: string }) {
  if (!rows.length) return null;
  return (
    <details className="vf-tech" data-testid={testId}>
      <summary>{vText('technical', locale)}</summary>
      <ul>{rows.map((r, i) => <li key={`${i}-${r}`}><code>{r}</code></li>)}</ul>
    </details>
  );
}

export function NoticeBox({ notice, locale, testId }: { notice: Notice; locale: Locale; testId: string }) {
  return (
    <div className={`vf-notice vf-tone-${notice.tone}`} role={notice.tone === 'bad' ? 'alert' : 'status'} data-testid={testId}>
      {notice.lines.map((l) => <p key={l}>{l}</p>)}
      <Technical locale={locale} rows={notice.technical} />
    </div>
  );
}

export function UnsignedNotice({ locale }: { locale: Locale }) {
  return (
    <aside className="vf-unsigned" data-testid="vf-unsigned">
      <strong>{vText('unsignedTitle', locale)}</strong>
      <p>{vText('unsignedBody', locale)}</p>
    </aside>
  );
}

function Exporter({ locale, x }: { locale: Locale; x: ExporterProps }) {
  let body: ReactNode;
  if (x.runs.status === 'loading' || x.runs.status === 'idle') body = <p className="vf-muted" role="status">{vText('loadingRuns', locale)}</p>;
  else if (x.runs.status === 'error') body = <NoticeBox notice={{ ...x.runs.notice, lines: [vText('runsFailed', locale), ...x.runs.notice.lines] }} locale={locale} testId="vf-runs-error" />;
  else if (x.runs.value.length === 0) body = <p className="vf-muted" data-testid="vf-no-runs">{vText('noRuns', locale)}</p>;
  else {
    const exps = x.experiments;
    body = (
      <>
        <label className="vf-field">
          <span>{vText('pickRun', locale)}</span>
          <select value={x.runId} onChange={(e) => x.onRun(e.target.value)} data-testid="vf-run">
            <option value="">{vText('chooseRun', locale)}</option>
            {x.runs.value.map((r) => <option key={r.researchRunId} value={r.researchRunId}>{r.question}</option>)}
          </select>
        </label>
        {x.runId && (exps.status === 'loading' ? <p className="vf-muted" role="status">{vText('loadingRuns', locale)}</p>
          : exps.status === 'error' ? <NoticeBox notice={exps.notice} locale={locale} testId="vf-experiments-error" />
            : exps.status === 'ready' && exps.value.length === 0 ? <p className="vf-muted" data-testid="vf-no-executed">{vText('noExecuted', locale)}</p>
              : exps.status === 'ready' ? (
                <>
                  <label className="vf-field">
                    <span>{vText('pickExperiment', locale)}</span>
                    <select value={x.experimentId} onChange={(e) => x.onExperiment(e.target.value)} data-testid="vf-experiment">
                      <option value="">{vText('chooseExperiment', locale)}</option>
                      {exps.value.map((e) => <option key={e.experimentId} value={e.experimentId}>{e.label}</option>)}
                    </select>
                  </label>
                  <div className="vf-actions">
                    <button type="button" className="vf-btn vf-btn-quiet" disabled={!x.experimentId || x.exporting} onClick={x.onGetRecord} data-testid="vf-get-record">
                      {x.exporting ? vText('gettingRecord', locale) : vText('getRecord', locale)}
                    </button>
                  </div>
                </>
              ) : null)}
        {x.exportNotice && <NoticeBox notice={x.exportNotice} locale={locale} testId="vf-export-notice" />}
        {x.exported && (
          <div className="vf-exported" data-testid="vf-exported">
            <p>{vText('recordReady', locale)}</p>
            <p className="vf-muted">{x.exported.custody.status === 'VERIFIED' ? vText('custodyVerified', locale) : vText('custodyNone', locale)}</p>
            {x.exportedUrl && <a className="vf-btn vf-btn-quiet" href={x.exportedUrl} download={x.exported.fileName} data-testid="vf-download-record">{vText('downloadRecord', locale)}</a>}
            <Technical locale={locale} rows={[`file: ${x.exported.fileName}`, `sha256: ${x.exported.sha256}`, `size: ${x.exported.size}`, `custody: ${x.exported.custody.status}`]} />
          </div>
        )}
      </>
    );
  }
  return (
    <details className="vf-from-run" data-testid="vf-from-run" open={x.preselected || undefined} data-preselected={x.preselected ? 'true' : undefined}>
      <summary>{vText('fromRunTitle', locale)}</summary>
      <p className="vf-muted">{vText(x.preselected ? 'preselected' : 'fromRunLead', locale)}</p>
      {body}
    </details>
  );
}

const formatWhen = (iso: string, locale: Locale): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(locale === 'pl' ? 'pl-PL' : 'en-GB');
};

function Result({ locale, r, reportUrl, reportFileName }: { locale: Locale; r: ReportView; reportUrl: string | null; reportFileName: string | null }) {
  return (
    <section className="vf-result" aria-labelledby="vf-result-title" data-testid="vf-result">
      <h2 id="vf-result-title" className="vf-visually-hidden">{vText('resultTitle', locale)}</h2>
      <div className={`vf-verdict vf-tone-${r.tone}`} data-testid="vf-verdict" data-verdict={r.verdict} tabIndex={-1} role="status" aria-live="polite">
        <span className="vf-kicker">{vText('resultTitle', locale)}</span>
        <strong>{r.verdictWord}</strong>
        <p>{r.meaning}</p>
        {r.replayed && <p className="vf-muted">{vText('replayedAs', locale)}: {r.replayed}</p>}
      </div>
      {r.unsigned && <UnsignedNotice locale={locale} />}

      <h3>{vText('checksTitle', locale)}</h3>
      <ol className="vf-checks">
        {r.checks.map((c) => (
          <li key={c.id} className={`vf-check vf-tone-${c.tone}`} data-testid={`vf-check-${c.id}`} data-status={c.status}>
            <div className="vf-check-head"><span className="vf-badge">{c.statusWord}</span><span className="vf-check-title">{c.title}</span></div>
            <p>{c.plain}</p>
          </li>
        ))}
      </ol>

      <h3>{vText('notCheckedTitle', locale)}</h3>
      <ul className="vf-not-checked">{r.notChecked.map((n) => <li key={n}>{n}</li>)}</ul>

      <div className="vf-report" data-testid="vf-report">
        <h3>{vText('reportTitle', locale)}</h3>
        <p className="vf-muted">{vText('reportLead', locale)}</p>
        {reportUrl && reportFileName ? (
          <div className="vf-actions">
            <a className="vf-btn" href={reportUrl} download={reportFileName} data-testid="vf-download-report">{vText('downloadReport', locale)}</a>
            <a className="vf-btn vf-btn-quiet" href={reportUrl} target="_blank" rel="noopener noreferrer" data-testid="vf-open-report">{vText('openReport', locale)}</a>
          </div>
        ) : <p className="vf-muted" role="status">{vText('preparingReport', locale)}</p>}
        <p className="vf-meta">{vText('reportFingerprint', locale)}: <code>{r.reportFingerprint}</code> · {vText('generatedAt', locale)} <time dateTime={r.generatedAt}>{formatWhen(r.generatedAt, locale)}</time></p>
      </div>

      <Technical locale={locale} rows={[...r.checks.map((c) => `${c.id} ${c.status}: ${c.technical}`), ...r.technical]} testId="vf-result-technical" />
    </section>
  );
}

export function VerifyView(p: VerifyViewProps) {
  const { locale } = p;
  const canVerify = p.recordText.trim().length > 0 && p.shaValid !== false && !p.busy;
  return (
    <div className="vf-body">
      {p.projectBar}
      <form className="vf-form" onSubmit={(e) => { e.preventDefault(); if (canVerify) p.onVerify(); }} data-testid="vf-form">
        <h2>{vText('stepRecord', locale)}</h2>
        <p className="vf-muted">{vText('stepRecordLead', locale)}</p>
        <label className="vf-file">
          <input type="file" accept="application/json,.json" onChange={(e) => { const f = e.target.files?.[0]; if (f) p.onFile(f); e.target.value = ''; }} data-testid="vf-file" />
          <span className="vf-btn vf-btn-quiet">{vText('uploadFile', locale)}</span>
          {p.fileName && <span className="vf-file-name">{vText('fileLoaded', locale)}: <strong>{p.fileName}</strong></span>}
        </label>
        {p.fileNotice && <NoticeBox notice={p.fileNotice} locale={locale} testId="vf-file-notice" />}
        <label className="vf-field">
          <span>{vText('pasteLabel', locale)}</span>
          <textarea value={p.recordText} onChange={(e) => p.onRecordText(e.target.value)} placeholder={vText('pastePlaceholder', locale)} rows={6} spellCheck={false} data-testid="vf-record" />
          {p.recordText.length > 0 && <small className="vf-muted">{new Blob([p.recordText]).size} {vText('bytesSuffix', locale)}</small>}
        </label>
        <label className="vf-field">
          <span>{vText('shaLabel', locale)}</span>
          <input type="text" inputMode="text" autoComplete="off" spellCheck={false} value={p.declaredSha} onChange={(e) => p.onSha(e.target.value)} aria-invalid={p.shaValid === false} aria-describedby="vf-sha-hint" data-testid="vf-sha" />
          <small id="vf-sha-hint" className={p.shaValid === false ? 'vf-error' : 'vf-muted'}>{p.shaValid === false ? vText('shaInvalid', locale) : vText('shaHint', locale)}</small>
        </label>
        <Exporter locale={locale} x={p.exporter} />
        <div className="vf-actions">
          <button type="submit" className="vf-btn" disabled={!canVerify} data-testid="vf-verify">{p.busy ? vText('verifying', locale) : vText('verify', locale)}</button>
          <button type="button" className="vf-btn vf-btn-quiet" onClick={p.onClear} disabled={p.busy}>{vText('clear', locale)}</button>
        </div>
        {!p.recordText.trim() && <p className="vf-muted">{vText('needRecord', locale)}</p>}
      </form>
      {p.notice && <NoticeBox notice={p.notice} locale={locale} testId="vf-notice" />}
      {p.result && <Result locale={locale} r={p.result} reportUrl={p.reportUrl} reportFileName={p.reportFileName} />}
    </div>
  );
}
