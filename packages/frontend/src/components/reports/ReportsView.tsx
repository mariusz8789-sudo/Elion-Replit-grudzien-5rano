import type { ResearchRunSummary } from '../../core/backend/client';
import type { Locale } from '../../core/i18n';
import { verdictWord } from '../verify/verifyText';
import { deliverableLine, deliverableTitle, type Deliverable, type DeliveryView, type Notice } from './reportsModel';
import { rText } from './reportsText';

/**
 * #/reports — the pure view: one card per research run, one row per deliverable the server issues for it.
 * The container fetches; this renders what it is given, so every state renders in a test. Engine names,
 * hashes and route codes live only in `data-technical-details` sections.
 */

export type ItemState =
  | { status: 'idle' }
  | { status: 'busy' }
  | { status: 'error'; notice: Notice }
  | { status: 'ready'; url: string | null; fileName: string; sha256?: string; size?: number; verdict?: string; delivery?: DeliveryView };

export type RunDeliverables =
  | { status: 'loading' }
  | { status: 'error'; notice: Notice }
  | { status: 'ready'; items: Deliverable[] };

function Tech({ locale, rows }: { locale: Locale; rows: readonly string[] }) {
  if (!rows.length) return null;
  return (
    <details className="vf-tech" data-technical-details>
      <summary>{rText('technical', locale)}</summary>
      <ul>{rows.map((r, i) => <li key={`${i}-${r}`}><code>{r}</code></li>)}</ul>
    </details>
  );
}

export function ReportsNotice({ notice, locale, testId }: { notice: Notice; locale: Locale; testId: string }) {
  return (
    <div className={`vf-notice vf-tone-${notice.tone}`} role={notice.tone === 'bad' ? 'alert' : 'status'} data-testid={testId}>
      {notice.lines.map((l) => <p key={l}>{l}</p>)}
      <Tech locale={locale} rows={notice.technical} />
    </div>
  );
}

export function ReportsUnsigned({ locale }: { locale: Locale }) {
  return (
    <aside className="vf-unsigned" data-testid="rp-unsigned">
      <strong>{rText('unsignedTitle', locale)}</strong>
      <p>{rText('unsignedBody', locale)}</p>
    </aside>
  );
}

function actionWords(item: Deliverable, busy: boolean, locale: Locale): string {
  if (item.kind === 'verify-report') return rText(busy ? 'building' : 'build', locale);
  if (item.kind === 'customer-delivery') return rText(busy ? 'checking' : 'check', locale);
  return rText(busy ? 'getting' : 'get', locale);
}

function DeliverableRow({ item, state, locale, onAct }: { item: Deliverable; state: ItemState; locale: Locale; onAct: (item: Deliverable) => void }) {
  const busy = state.status === 'busy';
  const ready = state.status === 'ready' ? state : null;
  return (
    <li className="lh-card" data-testid={`rp-item-${item.kind}`} data-key={item.key}>
      <div className="vf-check-head"><span className="vf-check-title">{deliverableTitle(item.kind, locale)}</span></div>
      {item.subject ? <p className="lh-facts">{item.subject}</p> : null}
      <p className="vf-muted">{deliverableLine(item.kind, locale)}</p>
      <div className="vf-actions">
        <button type="button" className="vf-btn vf-btn-quiet" disabled={busy} onClick={() => onAct(item)} data-testid="rp-act">{actionWords(item, busy, locale)}</button>
        {item.href && item.kind === 'verify-report' ? <a className="vf-btn vf-btn-quiet" href={item.href}>{rText('openVerify', locale)}</a> : null}
        {item.href && item.kind === 'lab-package' ? <a className="vf-btn vf-btn-quiet" href={item.href}>{rText('openLab', locale)}</a> : null}
      </div>
      {state.status === 'error' ? <ReportsNotice notice={state.notice} locale={locale} testId="rp-item-error" /> : null}
      {ready?.delivery ? (
        <div className={`vf-notice vf-tone-${ready.delivery.tone}`} role="status" data-testid="rp-delivery" data-status={ready.delivery.status}>
          <p><strong>{ready.delivery.statusWord}</strong></p>
          <p>{rText(ready.delivery.exportAllowed ? 'exportReady' : 'exportBlocked', locale)}</p>
          {ready.delivery.blockers.length ? <><p>{rText('blockers', locale)}:</p><ul className="vf-not-checked">{ready.delivery.blockers.map((b) => <li key={b}>{b}</li>)}</ul></> : null}
          <Tech locale={locale} rows={ready.delivery.technical} />
        </div>
      ) : null}
      {ready && ready.url ? (
        <div className="vf-exported" data-testid="rp-ready">
          {ready.verdict ? <p>{rText('verdictWas', locale)}: <strong>{verdictWord(ready.verdict, locale)}</strong></p> : null}
          {ready.sha256 ? <p className="vf-meta">{rText('fingerprint', locale)}: <code>{ready.sha256}</code>{ready.size !== undefined ? ` · ${ready.size} ${rText('bytes', locale)}` : ''}</p> : null}
          <div className="vf-actions">
            <a className="vf-btn" href={ready.url} download={ready.fileName} data-testid="rp-save">{rText(item.kind === 'verify-report' ? 'saveHtml' : 'save', locale)}</a>
            {item.kind === 'verify-report' ? <a className="vf-btn vf-btn-quiet" href={ready.url} target="_blank" rel="noopener noreferrer" data-testid="rp-open">{rText('openHtml', locale)}</a> : null}
          </div>
        </div>
      ) : null}
      <Tech locale={locale} rows={item.technical} />
    </li>
  );
}

export interface ReportsListProps {
  locale: Locale;
  runs: readonly ResearchRunSummary[];
  byRun: Record<string, RunDeliverables>;
  items: Record<string, ItemState>;
  onAct: (item: Deliverable) => void;
}

export function ReportsList({ locale, runs, byRun, items, onAct }: ReportsListProps) {
  return (
    <ul className="lh-list" data-testid="rp-runs">
      {runs.map((run) => {
        const entry = byRun[run.researchRunId] ?? { status: 'loading' as const };
        return (
          <li key={run.researchRunId} className="lh-step" data-testid="rp-run" data-run-id={run.researchRunId}>
            <h2>{run.question}</h2>
            {entry.status === 'loading' ? <p className="vf-muted" role="status">{rText('loadingRuns', locale)}</p> : null}
            {entry.status === 'error' ? <ReportsNotice notice={{ ...entry.notice, lines: [rText('runFailed', locale), ...entry.notice.lines] }} locale={locale} testId="rp-run-error" /> : null}
            {entry.status === 'ready' && entry.items.length === 0 ? <p className="vf-muted" data-testid="rp-nothing">{rText('nothingYet', locale)}</p> : null}
            {entry.status === 'ready' && entry.items.length > 0 ? (
              <ul className="lh-list">
                {entry.items.map((item) => <DeliverableRow key={item.key} item={item} state={items[item.key] ?? { status: 'idle' }} locale={locale} onAct={onAct} />)}
              </ul>
            ) : null}
            <Tech locale={locale} rows={[`researchRunId: ${run.researchRunId}`, `status: ${run.status}`, `nextStep: ${run.nextStep}`]} />
          </li>
        );
      })}
    </ul>
  );
}
