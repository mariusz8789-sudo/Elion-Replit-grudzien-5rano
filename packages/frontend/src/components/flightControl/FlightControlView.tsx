import type { ReactNode } from 'react';
import type {
  CognitiveResearchRunJob, ResearchRunControlAction, ResearchRunQueueJob, ResearchRunSummary, ResearchRunView, ScienceFlight,
} from '../../core/backend/client';
import type { Locale } from '../../core/i18n';
import {
  blockedDependenciesOf, describeFailure, formatDateTime, leaseText, researchJobsOf, runIntegrity,
  type FlightControlSnapshot, type Notice,
} from './flightControlModel';
import { fcCode, fcText, toneOf, type CodeGroup, type Tone } from './flightControlText';

/**
 * #/flight-control — the pure view. It renders only what it is given (the container fetches), so a
 * test can render it with real-shaped server data and read the markup. Every status word is the
 * server's code named in plain language; every count is a length or a number the server sent.
 */

export type RunDetailState = { status: 'loading' } | { status: 'ready'; view: ResearchRunView } | { status: 'error'; notice: Notice };

export interface FlightControlViewProps {
  locale: Locale;
  snapshot: FlightControlSnapshot | null;
  loading: boolean;
  loadNotice: Notice | null;
  finishedJobs: readonly ResearchRunQueueJob[];
  details: Readonly<Record<string, RunDetailState>>;
  expanded: ReadonlySet<string>;
  busy: string | null;
  notices: Readonly<Record<string, Notice>>;
  confirmingCancel: string | null;
  projectBar?: ReactNode;
  onRefresh: () => void;
  onControl: (researchRunId: string, action: ResearchRunControlAction) => void;
  onAskCancel: (researchRunId: string | null) => void;
  onCancelJob: (researchRunId: string, jobId: string) => void;
  onToggleDetails: (researchRunId: string) => void;
}

function Pill({ code, group, locale }: { code: string | null | undefined; group: CodeGroup; locale: Locale }) {
  return <span className={`fc-pill fc-tone-${toneOf(code)}`} data-code={code ?? ''}>{fcCode(group, code, locale)}</span>;
}

function Technical({ locale, rows }: { locale: Locale; rows: readonly (string | null | undefined | false)[] }) {
  const shown = rows.filter((r): r is string => typeof r === 'string' && r.length > 0);
  if (!shown.length) return null;
  return (
    <details className="fc-tech">
      <summary>{fcText('technical', locale)}</summary>
      <ul>{shown.map((r) => <li key={r}><code>{r}</code></li>)}</ul>
    </details>
  );
}

function NoticeBox({ notice, locale, testId }: { notice: Notice; locale: Locale; testId: string }) {
  return (
    <div className={`fc-notice fc-tone-${notice.tone}`} role={notice.tone === 'bad' ? 'alert' : 'status'} data-testid={testId}>
      {notice.lines.map((line) => <p key={line}>{line}</p>)}
      <Technical locale={locale} rows={notice.technical} />
    </div>
  );
}

const withLead = (notice: Notice, lead: string): Notice => ({ ...notice, lines: [lead, ...notice.lines] });

function Empty({ children, testId }: { children: ReactNode; testId?: string }) {
  return <p className="fc-empty" data-testid={testId}>{children}</p>;
}

/* ---------------- summary ---------------- */

function Summary({ snapshot, locale }: { snapshot: FlightControlSnapshot; locale: Locale }) {
  const jobs = researchJobsOf(snapshot.state);
  const fc = snapshot.state.byt.scienceFlightControl;
  const computed = fc.status === 'AVAILABLE';
  const items: { key: string; value: number | string; label: string; tone: Tone }[] = [
    { key: 'runs', value: snapshot.runs ? snapshot.runs.length : '—', label: fcText('sumRuns', locale), tone: 'idle' },
    { key: 'queued', value: jobs.queued.length, label: fcText('sumQueued', locale), tone: jobs.queued.length ? 'warn' : 'idle' },
    { key: 'claimed', value: jobs.claimed.length, label: fcText('sumClaimed', locale), tone: jobs.claimed.length ? 'warn' : 'idle' },
    { key: 'flights', value: computed ? fc.flights.length : '—', label: fcText('sumFlights', locale), tone: 'idle' },
    { key: 'verified', value: computed ? fc.verified : '—', label: fcText('sumVerified', locale), tone: computed && fc.verified ? 'good' : 'idle' },
    { key: 'blocked', value: computed ? fc.blocked : '—', label: fcText('sumBlocked', locale), tone: computed && fc.blocked ? 'bad' : 'idle' },
  ];
  return (
    <dl className="fc-summary" data-testid="fc-summary">
      {items.map((i) => (
        <div key={i.key} className={`fc-gauge fc-tone-${i.tone}`} data-testid={`fc-sum-${i.key}`}>
          <dt>{i.label}</dt>
          <dd>{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------------- runs ---------------- */

function RunDetail({ state, locale }: { state: RunDetailState | undefined; locale: Locale }) {
  if (!state || state.status === 'loading') return <p className="fc-muted" role="status">{fcText('detailLoading', locale)}</p>;
  if (state.status === 'error') return <NoticeBox notice={state.notice} locale={locale} testId="fc-run-detail-error" />;
  const { view } = state;
  const hypotheses = view.plan?.hypotheses ?? [];
  return (
    <div className="fc-run-detail">
      <h4>{fcText('hypotheses', locale)}</h4>
      {hypotheses.length === 0
        ? <Empty testId="fc-no-hypotheses">{fcText('noHypotheses', locale)}</Empty>
        : (
          <ul className="fc-hyps">
            {hypotheses.map((h) => (
              <li key={h.hypothesisId}>
                <span>{h.claim}</span>
                <Technical locale={locale} rows={[`hypothesisId: ${h.hypothesisId}`, h.experimentProposal?.engineId && `engineId: ${h.experimentProposal.engineId}`]} />
              </li>
            ))}
          </ul>
        )}
      <h4>{fcText('experiments', locale)}</h4>
      {view.experiments.length === 0
        ? <Empty>{fcText('noExperiments', locale)}</Empty>
        : (
          <ul className="fc-exps">
            {view.experiments.map((x) => (
              <li key={x.experimentId}>
                <p className="fc-exp-claim">{x.frozen?.claim ?? x.experimentId}</p>
                <dl className="fc-facts">
                  <div><dt>{fcText('engine', locale)}</dt><dd>{x.execution?.engine.engineLabel ?? x.execution?.engine.engineId ?? x.frozen?.engineId ?? '—'}</dd></div>
                  <div><dt>{fcText('execution', locale)}</dt><dd>{x.execution ? x.execution.status : fcText('notExecuted', locale)}</dd></div>
                  <div><dt>{fcText('verdict', locale)}</dt><dd>{x.falsification ? <Pill code={x.falsification.verdict} group="verdict" locale={locale} /> : fcText('noVerdict', locale)}</dd></div>
                  <div><dt>{fcText('evidence', locale)}</dt><dd>{x.evidence ? fcText('evidenceProposed', locale) : fcText('noEvidence', locale)}</dd></div>
                  <div><dt>{fcText('replay', locale)}</dt><dd>{x.next?.replay ? <Pill code={x.next.replay.verdict} group="replayStatus" locale={locale} /> : fcText('noReplay', locale)}</dd></div>
                </dl>
                <Technical locale={locale} rows={[
                  `experimentId: ${x.experimentId}`,
                  x.frozen && `inputHash: ${x.frozen.inputHash}`,
                  x.execution && `outputHash: ${x.execution.outputHash}`,
                  x.execution?.scienceRunId && `scienceRunId: ${x.execution.scienceRunId}`,
                  x.evidence && `evidenceProposalId: ${x.evidence.evidenceProposalId}`,
                  x.next?.replay?.verificationId && `verificationId: ${x.next.replay.verificationId}`,
                ]} />
              </li>
            ))}
          </ul>
        )}
    </div>
  );
}

function RunRow({ run, props }: { run: ResearchRunSummary; props: FlightControlViewProps }) {
  const { locale, busy, notices, confirmingCancel, expanded, details, snapshot } = props;
  const integrity = snapshot ? runIntegrity(snapshot.state, run.researchRunId) : null;
  const canPause = run.status === 'RUNNING';
  const canResume = run.status === 'PAUSED';
  const canCancel = run.status === 'RUNNING' || run.status === 'PAUSED';
  const isBusy = busy === run.researchRunId;
  const open = expanded.has(run.researchRunId);
  const notice = notices[run.researchRunId];
  return (
    <li className={`fc-run fc-rail-${toneOf(run.status)}`} data-testid={`fc-run-${run.researchRunId}`} data-status={run.status}>
      <div className="fc-run-head">
        <h3>{run.question}</h3>
        <Pill code={run.status} group="runStatus" locale={locale} />
      </div>
      <p className="fc-run-meta">
        <span>{fcText('nextStep', locale)}: <strong>{fcCode('nextStep', run.nextStep, locale)}</strong></span>
        <span>{run.events} {fcText('events', locale)}</span>
        <span>{fcText('startedAt', locale)} {formatDateTime(run.createdAt, locale)}</span>
        {integrity !== null && (
          <span className={integrity ? 'fc-ok' : 'fc-broken'}>{integrity ? fcText('integrityOk', locale) : fcText('integrityBroken', locale)}</span>
        )}
      </p>
      {(canPause || canResume || canCancel) && (
        <div className="fc-actions">
          {canPause && <button type="button" className="fc-btn" disabled={isBusy} onClick={() => props.onControl(run.researchRunId, 'pause')}>{isBusy ? fcText('working', locale) : fcText('pause', locale)}</button>}
          {canResume && <button type="button" className="fc-btn" disabled={isBusy} onClick={() => props.onControl(run.researchRunId, 'resume')}>{isBusy ? fcText('working', locale) : fcText('resume', locale)}</button>}
          {canCancel && confirmingCancel !== run.researchRunId && (
            <button type="button" className="fc-btn fc-btn-quiet" disabled={isBusy} onClick={() => props.onAskCancel(run.researchRunId)}>{fcText('cancel', locale)}</button>
          )}
        </div>
      )}
      {canCancel && confirmingCancel === run.researchRunId && (
        <div className="fc-confirm" role="group" aria-label={fcText('cancel', locale)}>
          <p>{fcText('cancelWarning', locale)}</p>
          <div className="fc-actions">
            <button type="button" className="fc-btn fc-btn-danger" disabled={isBusy} onClick={() => props.onControl(run.researchRunId, 'cancel')}>{isBusy ? fcText('working', locale) : fcText('confirmCancel', locale)}</button>
            <button type="button" className="fc-btn fc-btn-quiet" disabled={isBusy} onClick={() => props.onAskCancel(null)}>{fcText('keep', locale)}</button>
          </div>
        </div>
      )}
      {notice && <NoticeBox notice={notice} locale={locale} testId={`fc-notice-${run.researchRunId}`} />}
      <button type="button" className="fc-disclose" aria-expanded={open} onClick={() => props.onToggleDetails(run.researchRunId)}>
        {open ? fcText('hideDetails', locale) : fcText('showDetails', locale)}
      </button>
      {open && <RunDetail state={details[run.researchRunId]} locale={locale} />}
      <Technical locale={locale} rows={[`researchRunId: ${run.researchRunId}`, `status: ${run.status}`, `nextStep: ${run.nextStep}`]} />
    </li>
  );
}

function RunsSection(props: FlightControlViewProps & { snapshot: FlightControlSnapshot }) {
  const { snapshot, locale } = props;
  return (
    <section className="fc-section fc-runs-section" aria-labelledby="fc-runs-h" data-testid="fc-runs">
      <header className="fc-section-head">
        <h2 id="fc-runs-h">{fcText('runsTitle', locale)}</h2>
        <p>{fcText('runsLead', locale)}</p>
      </header>
      {snapshot.runs === null && snapshot.runsFailure && (
        <NoticeBox notice={withLead(describeFailure(snapshot.runsFailure, locale), fcText('partialRuns', locale))} locale={locale} testId="fc-runs-error" />
      )}
      {snapshot.runs !== null && snapshot.runs.length === 0 && <Empty testId="fc-runs-empty">{fcText('runsEmpty', locale)}</Empty>}
      {snapshot.runs !== null && snapshot.runs.length > 0 && (
        <ol className="fc-run-list">
          {snapshot.runs.map((run) => <RunRow key={run.researchRunId} run={run} props={props} />)}
        </ol>
      )}
    </section>
  );
}

/* ---------------- job queue ---------------- */

interface Ticket {
  jobId: string;
  researchRunId: string;
  state: string;
  workerId: string | null;
  leaseExpiresAt: number | null;
  attempts: number | null;
  hypothesisId: string | null;
  failureCode: string | null;
  cancelReason: string | null;
}

const fromCognitive = (j: CognitiveResearchRunJob, state: string): Ticket => ({
  jobId: j.id, researchRunId: j.researchRunId, state, workerId: j.workerId ?? null, leaseExpiresAt: j.leaseExpiresAt ?? null,
  attempts: typeof j.attempts === 'number' ? j.attempts : null, hypothesisId: j.hypothesisId, failureCode: null, cancelReason: null,
});

const fromJob = (j: ResearchRunQueueJob): Ticket => ({
  jobId: j.jobId, researchRunId: j.researchRunId, state: j.state, workerId: j.workerId, leaseExpiresAt: j.leaseExpiresAt,
  attempts: j.attempts, hypothesisId: j.payload?.hypothesisId ?? null, failureCode: typeof j.failure?.code === 'string' ? j.failure.code : null,
  cancelReason: j.cancelReason,
});

function TicketCard({ ticket, lane, props, question }: { ticket: Ticket; lane: 'queued' | 'claimed' | 'finished'; props: FlightControlViewProps; question: string | null }) {
  const { locale, snapshot, busy, notices } = props;
  const now = snapshot?.loadedAt ?? 0;
  const lease = leaseText(ticket.leaseExpiresAt, now, locale);
  const isBusy = busy === ticket.jobId;
  const notice = notices[ticket.jobId];
  return (
    <li className={`fc-ticket fc-rail-${toneOf(ticket.state)}`} data-testid={`fc-job-${ticket.jobId}`} data-state={ticket.state}>
      <p className="fc-ticket-run">{question ?? fcText('ofRun', locale)}</p>
      <dl className="fc-facts">
        {lane === 'finished' && <div><dt>{fcText('laneFinished', locale)}</dt><dd><Pill code={ticket.state} group="jobState" locale={locale} /></dd></div>}
        <div><dt>{fcText('worker', locale)}</dt><dd>{ticket.workerId ? <code>{ticket.workerId}</code> : fcText(lane === 'finished' ? 'clearedAfterEnd' : 'noWorker', locale)}</dd></div>
        {lane === 'claimed' && <div><dt>{fcText('leaseUntil', locale)}</dt><dd className={lease.expired ? 'fc-broken' : undefined}>{lease.text}</dd></div>}
        {ticket.attempts !== null && <div><dt>{fcText('attempts', locale)}</dt><dd>{ticket.attempts}</dd></div>}
        <div><dt>{fcText('hypothesis', locale)}</dt><dd>{ticket.hypothesisId ? <code>{ticket.hypothesisId}</code> : fcText('nextHypothesis', locale)}</dd></div>
        {(ticket.failureCode || ticket.cancelReason) && <div><dt>{fcText('failure', locale)}</dt><dd><code>{ticket.failureCode ?? ticket.cancelReason}</code></dd></div>}
      </dl>
      {lane !== 'finished' && (
        <div className="fc-actions">
          <button type="button" className="fc-btn fc-btn-quiet" disabled={isBusy} onClick={() => props.onCancelJob(ticket.researchRunId, ticket.jobId)}>
            {isBusy ? fcText('working', locale) : fcText('cancelJob', locale)}
          </button>
        </div>
      )}
      {notice && <NoticeBox notice={notice} locale={locale} testId={`fc-notice-${ticket.jobId}`} />}
      <Technical locale={locale} rows={[`jobId: ${ticket.jobId}`, `researchRunId: ${ticket.researchRunId}`, `state: ${ticket.state}`]} />
    </li>
  );
}

function JobsSection(props: FlightControlViewProps & { snapshot: FlightControlSnapshot }) {
  const { snapshot, locale, finishedJobs } = props;
  const jobs = researchJobsOf(snapshot.state);
  const open = new Set([...jobs.queued, ...jobs.claimed].map((j) => j.id));
  const finished = finishedJobs.filter((j) => !open.has(j.jobId) && j.state !== 'QUEUED' && j.state !== 'CLAIMED');
  const questionOf = (id: string) => snapshot.runs?.find((r) => r.researchRunId === id)?.question ?? null;
  const lanes: { key: 'queued' | 'claimed' | 'finished'; title: string; empty: string; tickets: Ticket[] }[] = [
    { key: 'queued', title: fcText('laneQueued', locale), empty: fcText('queuedEmpty', locale), tickets: jobs.queued.map((j) => fromCognitive(j, 'QUEUED')) },
    { key: 'claimed', title: fcText('laneClaimed', locale), empty: fcText('claimedEmpty', locale), tickets: jobs.claimed.map((j) => fromCognitive(j, 'CLAIMED')) },
    { key: 'finished', title: fcText('laneFinished', locale), empty: fcText('finishedEmpty', locale), tickets: finished.map(fromJob) },
  ];
  return (
    <section className="fc-section" aria-labelledby="fc-jobs-h" data-testid="fc-jobs">
      <header className="fc-section-head">
        <h2 id="fc-jobs-h">{fcText('jobsTitle', locale)}</h2>
        <p>{fcText('jobsLead', locale)}</p>
      </header>
      <div className="fc-lanes">
        {lanes.map((lane) => (
          <div key={lane.key} className={`fc-lane fc-lane-${lane.key}`} data-testid={`fc-lane-${lane.key}`}>
            <h3><span>{lane.title}</span><span className="fc-count">{lane.tickets.length}</span></h3>
            {lane.tickets.length === 0
              ? <Empty>{lane.empty}</Empty>
              : <ul>{lane.tickets.map((t) => <TicketCard key={t.jobId} ticket={t} lane={lane.key} props={props} question={questionOf(t.researchRunId)} />)}</ul>}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- flights ---------------- */

function stageTone(flight: ScienceFlight, stage: 'preflight' | 'execution' | 'evidence' | 'replay'): Tone {
  if (stage === 'preflight') return toneOf(flight.preflight.decision);
  if (stage === 'execution') {
    const d = flight.executionDelta;
    if (!d.observed) return 'idle';
    if (d.inputIntegrity === 'DRIFT' || d.budgetVerdict === 'EXCEEDED') return 'bad';
    return flight.failureAttribution?.layer === 'ENGINE' ? 'bad' : 'good';
  }
  if (stage === 'evidence') return toneOf(flight.evidenceUpdate.status);
  return flight.replay.status === 'NOT_YET_REPLAYED' ? 'idle' : toneOf(flight.replay.status);
}

function FlightCard({ flight, locale }: { flight: ScienceFlight; locale: Locale }) {
  const d = flight.executionDelta;
  const failedChecks = flight.preflight.checks.filter((c) => c.status !== 'PASS');
  const f = flight.failureAttribution;
  return (
    <li className="fc-flight" data-testid={`fc-flight-${flight.executionId ?? flight.flightFingerprint}`} data-status={flight.status}>
      <div className="fc-flight-head">
        <h3>{fcText('candidate', locale)} <span className="fc-mono">{flight.candidateId}</span></h3>
        <Pill code={flight.status} group="flightStatus" locale={locale} />
      </div>
      <ol className="fc-path">
        <li className={`fc-stage fc-tone-${stageTone(flight, 'preflight')}`}>
          <h4>{fcText('stagePreflight', locale)}</h4>
          <p><Pill code={flight.preflight.decision} group="preflightDecision" locale={locale} /></p>
          <ul className="fc-checks">
            {(failedChecks.length ? failedChecks : flight.preflight.checks).map((c) => (
              <li key={c.check} className={c.status === 'PASS' ? 'fc-ok' : 'fc-broken'}>
                {fcCode('check', c.check, locale)}: {fcCode('checkStatus', c.status, locale)}
              </li>
            ))}
          </ul>
        </li>
        <li className={`fc-stage fc-tone-${stageTone(flight, 'execution')}`}>
          <h4>{fcText('stageExecution', locale)}</h4>
          {!d.observed
            ? <p className="fc-muted">{fcText('notObserved', locale)}</p>
            : (
              <dl className="fc-facts">
                <div><dt>{fcText('inputIntegrity', locale)}</dt><dd>{fcCode('inputIntegrity', d.inputIntegrity, locale)}</dd></div>
                <div><dt>{fcText('selectedEngine', locale)}</dt><dd>{d.selectedEngine ?? '—'}</dd></div>
                <div><dt>{fcText('budget', locale)}</dt><dd>{fcCode('budgetVerdict', d.budgetVerdict, locale)}{typeof d.computeBudgetSeconds === 'number' ? ` · ${d.computeBudgetSeconds} s` : ''}</dd></div>
                {typeof d.actualDurationMs === 'number' && <div><dt>{fcText('duration', locale)}</dt><dd>{d.actualDurationMs} ms</dd></div>}
              </dl>
            )}
          <p className="fc-small">{fcText('plannedCapability', locale)}: <span className="fc-mono">{d.plannedCapability ?? '—'}</span></p>
        </li>
        <li className={`fc-stage fc-tone-${stageTone(flight, 'evidence')}`}>
          <h4>{fcText('stageEvidence', locale)}</h4>
          <p>{fcCode('evidenceStatus', flight.evidenceUpdate.status, locale)}</p>
        </li>
        <li className={`fc-stage fc-tone-${stageTone(flight, 'replay')}`}>
          <h4>{fcText('stageReplay', locale)}</h4>
          <p>{fcCode('replayStatus', flight.replay.status, locale)}</p>
        </li>
      </ol>
      {f && (
        <p className="fc-stop" data-testid="fc-flight-failure">
          <strong>{fcText('stoppedAt', locale)}: {fcCode('failureLayer', f.layer, locale)}</strong>
          {' · '}{f.retryable ? fcText('retryable', locale) : fcText('notRetryable', locale)}
        </p>
      )}
      <p className="fc-small">
        {fcText('epistemic', locale)}: {fcCode('epistemic', flight.bytUpdate.epistemicState, locale)}
        {d.observedClassification ? ` · ${fcText('classification', locale)}: ${d.observedClassification}` : ''}
        {' · '}{fcText('inSilicoNote', locale)}
      </p>
      <Technical locale={locale} rows={[
        `campaignId: ${flight.campaignId}`,
        flight.executionId && `executionId: ${flight.executionId}`,
        `flightFingerprint: ${flight.flightFingerprint}`,
        `status: ${flight.status}`,
        flight.preflight.inputFingerprint && `inputFingerprint: ${flight.preflight.inputFingerprint}`,
        f && `failure: ${f.layer} / ${f.code}${f.reason ? ` / ${f.reason}` : ''}`,
        flight.bytUpdate.scienceRunRef, flight.bytUpdate.evidenceRef, flight.bytUpdate.replayRef,
        flight.preflight.source && `preflight event: ${flight.preflight.source.eventId}`,
        d.source && `result event: ${d.source.eventId}`,
      ]} />
    </li>
  );
}

function FlightsSection({ snapshot, locale }: { snapshot: FlightControlSnapshot; locale: Locale }) {
  const fc = snapshot.state.byt.scienceFlightControl;
  return (
    <section className="fc-section" aria-labelledby="fc-flights-h" data-testid="fc-flights">
      <header className="fc-section-head">
        <h2 id="fc-flights-h">{fcText('flightsTitle', locale)}</h2>
        <p>{fcText('flightsLead', locale)}</p>
      </header>
      {fc.status !== 'AVAILABLE' && <Empty testId="fc-flights-not-computed">{fcText('flightsNotComputed', locale)}</Empty>}
      {fc.status === 'AVAILABLE' && fc.flights.length === 0 && <Empty testId="fc-flights-empty">{fcText('flightsEmpty', locale)}</Empty>}
      {fc.status === 'AVAILABLE' && fc.flights.length > 0 && (
        <ul className="fc-flight-list">{fc.flights.map((flight) => <FlightCard key={flight.flightFingerprint} flight={flight} locale={locale} />)}</ul>
      )}
      {fc.status === 'AVAILABLE' && fc.rejectedUntraceableRecords > 0 && (
        <p className="fc-small fc-broken">{fcText('rejected', locale)}: {fc.rejectedUntraceableRecords}</p>
      )}
      <Technical locale={locale} rows={[`scienceFlightControl.status: ${fc.status}`, fc.limitation]} />
    </section>
  );
}

/* ---------------- blocked dependencies ---------------- */

function BlockedSection({ snapshot, locale }: { snapshot: FlightControlSnapshot; locale: Locale }) {
  const { selfModelKnown, items } = blockedDependenciesOf(snapshot.state);
  return (
    <section className="fc-section fc-blocked" aria-labelledby="fc-blocked-h" data-testid="fc-blocked">
      <header className="fc-section-head">
        <h2 id="fc-blocked-h">{fcText('blockedTitle', locale)}</h2>
        <p>{fcText('blockedLead', locale)}</p>
      </header>
      {!selfModelKnown && <Empty testId="fc-blocked-unknown">{fcText('blockedUnknown', locale)}</Empty>}
      {selfModelKnown && items.length === 0 && <Empty testId="fc-blocked-none">{fcText('blockedNone', locale)}</Empty>}
      {items.length > 0 && (
        <ul className="fc-deps">
          {items.map((item) => (
            <li key={`${item.kind}:${item.id}`} className="fc-dep">
              <span className="fc-dep-kind">
                {item.kind === 'ENGINE_RUNTIME' ? fcText('blockedEngine', locale) : item.kind === 'NO_ADAPTER' ? fcText('blockedAdapter', locale) : fcText('blockedFlight', locale)}
              </span>
              <span className="fc-mono">{item.kind === 'FLIGHT' ? item.flight.candidateId : item.id}</span>
              <span className="fc-small">
                {fcText('blockedBy', locale)}: {item.kind === 'FLIGHT' ? `${fcCode('failureLayer', item.layer, locale)} · ${item.code}` : (item.blockedBy ?? '—')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ---------------- the screen ---------------- */

export function FlightControlView(props: FlightControlViewProps) {
  const { locale, snapshot, loading, loadNotice } = props;
  return (
    <div className="fc-body">
      <div className="fc-toolbar">
        {props.projectBar}
        <div className="fc-refresh">
          {snapshot && <span className="fc-small">{fcText('stateAt', locale)} {new Date(snapshot.loadedAt).toLocaleTimeString(locale === 'pl' ? 'pl-PL' : 'en-GB')}</span>}
          <button type="button" className="fc-btn fc-btn-quiet" onClick={props.onRefresh} disabled={loading}>{loading ? fcText('working', locale) : fcText('refresh', locale)}</button>
        </div>
      </div>
      {loadNotice && <NoticeBox notice={withLead(loadNotice, fcText('loadFailed', locale))} locale={locale} testId="fc-load-error" />}
      {!snapshot && loading && <p className="fc-muted" role="status">{fcText('loading', locale)}</p>}
      {snapshot && (
        <>
          <Summary snapshot={snapshot} locale={locale} />
          <div className="fc-grid">
            <RunsSection {...props} snapshot={snapshot} />
            <BlockedSection snapshot={snapshot} locale={locale} />
          </div>
          <JobsSection {...props} snapshot={snapshot} />
          <FlightsSection snapshot={snapshot} locale={locale} />
        </>
      )}
    </div>
  );
}
