import { useCallback, useEffect, useRef, useState } from 'react';
import {
  cancelResearchRunJob, controlResearchRun, getResearchRun, getResearchRunJob, listProjects,
  type Project, type ResearchRunControlAction, type ResearchRunQueueJob,
} from '../core/backend/client';
import { useSession } from '../core/backend/session';
import { getActiveKnowledgeProject } from '../core/backend/knowledgeProjectContext';
import { useLocale, type Locale } from '../core/i18n';
import { FlightControlView, type RunDetailState } from './flightControl/FlightControlView';
import {
  describeControl, describeFailure, describeJobCancel, loadFlightControl, researchJobsOf, type FlightControlSnapshot, type Notice,
} from './flightControl/flightControlModel';
import { fcText } from './flightControl/flightControlText';
import './flightControl/flightControl.css';

/**
 * #/flight-control — KONTROLA LOTÓW NAUKI. The screen over the backend Science Flight Control: research
 * runs and their controls, the lease queue of ResearchRun jobs (worker, lease, attempts) and the
 * Virtual Lab flights from BYT. It fetches, the view renders; nothing on screen is typed in by hand.
 */

const POLL_MS = 15_000;

function Hero({ locale }: { locale: Locale }) {
  return (
    <header className="fc-hero">
      <p className="fc-kicker">{fcText('kicker', locale)}</p>
      <h1>{fcText('title', locale)}</h1>
      <p>{fcText('lead', locale)}</p>
    </header>
  );
}

type ProjectsState = { status: 'loading' } | { status: 'error'; notice: Notice } | { status: 'ready'; projects: Project[] };

function SignedInFlightControl({ token, locale }: { token: string; locale: Locale }) {
  const [projects, setProjects] = useState<ProjectsState>({ status: 'loading' });
  const [projectId, setProjectId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<FlightControlSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadNotice, setLoadNotice] = useState<Notice | null>(null);
  const [finishedJobs, setFinishedJobs] = useState<ResearchRunQueueJob[]>([]);
  const [details, setDetails] = useState<Record<string, RunDetailState>>({});
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [notices, setNotices] = useState<Record<string, Notice>>({});
  const [confirmingCancel, setConfirmingCancel] = useState<string | null>(null);
  /** jobId → researchRunId of every ResearchRun job this screen has seen, so a job that leaves the open queue can be read back. */
  const knownJobs = useRef(new Map<string, string>());
  const generation = useRef(0);

  useEffect(() => {
    let alive = true;
    void listProjects(token).then((r) => {
      if (!alive) return;
      if (!r.ok) { setProjects({ status: 'error', notice: describeFailure(r, locale) }); return; }
      setProjects({ status: 'ready', projects: r.data });
      const preferred = getActiveKnowledgeProject();
      setProjectId(r.data.find((p) => p.id === preferred?.id)?.id ?? r.data[0]?.id ?? null);
    });
    return () => { alive = false; };
    // The locale only words the error; a language switch does not need a second request.
  }, [token]);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    const mine = ++generation.current;
    setLoading(true);
    const r = await loadFlightControl(token, projectId);
    if (mine !== generation.current) return;
    setLoading(false);
    if (!r.ok) { setLoadNotice(describeFailure(r, locale)); return; }
    setLoadNotice(null);
    setSnapshot(r.snapshot);
    const jobs = researchJobsOf(r.snapshot.state);
    const open = new Set<string>();
    for (const j of [...jobs.queued, ...jobs.claimed]) { open.add(j.id); knownJobs.current.set(j.id, j.researchRunId); }
    const closed = [...knownJobs.current.entries()].filter(([id]) => !open.has(id));
    const read = await Promise.all(closed.map(([jobId, runId]) => getResearchRunJob(token, projectId, runId, jobId)));
    if (mine !== generation.current) return;
    setFinishedJobs(read.flatMap((x) => (x.ok ? [x.data.job] : [])));
  }, [token, projectId, locale]);

  useEffect(() => {
    knownJobs.current = new Map();
    setSnapshot(null); setFinishedJobs([]); setDetails({}); setExpanded(new Set()); setNotices({});
    void refresh();
    // Only a project change resets the screen; `refresh` changes with the locale too.
  }, [projectId, token]);

  const openJobs = snapshot ? researchJobsOf(snapshot.state) : null;
  const hasOpenJobs = openJobs ? openJobs.queued.length + openJobs.claimed.length > 0 : false;
  useEffect(() => {
    if (!hasOpenJobs) return undefined;
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh(); }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [hasOpenJobs, refresh]);

  const loadDetail = useCallback(async (runId: string) => {
    if (!projectId) return;
    setDetails((d) => ({ ...d, [runId]: { status: 'loading' } }));
    const r = await getResearchRun(token, projectId, runId);
    setDetails((d) => ({ ...d, [runId]: r.ok ? { status: 'ready', view: r.data.researchRun } : { status: 'error', notice: describeFailure(r, locale) } }));
  }, [token, projectId, locale]);

  const onToggleDetails = (runId: string) => {
    const opening = !expanded.has(runId);
    const next = new Set(expanded);
    if (opening) next.add(runId); else next.delete(runId);
    setExpanded(next);
    if (opening) void loadDetail(runId);
  };

  const onControl = async (runId: string, action: ResearchRunControlAction) => {
    if (!projectId) return;
    setBusy(runId);
    const r = await controlResearchRun(token, projectId, runId, action);
    setBusy(null);
    setConfirmingCancel(null);
    if (r.ok) {
      for (const id of [...r.data.queue.withdrawn, ...r.data.queue.inFlight, ...r.data.queue.requeued, ...r.data.queue.refused]) knownJobs.current.set(id, runId);
      setNotices((n) => ({ ...n, [runId]: describeControl(action, r.data, locale) }));
      if (expanded.has(runId)) setDetails((d) => ({ ...d, [runId]: { status: 'ready', view: r.data.researchRun } }));
    } else {
      setNotices((n) => ({ ...n, [runId]: describeFailure(r, locale) }));
    }
    await refresh();
  };

  const onCancelJob = async (runId: string, jobId: string) => {
    if (!projectId) return;
    setBusy(jobId);
    const r = await cancelResearchRunJob(token, projectId, runId, jobId);
    setBusy(null);
    knownJobs.current.set(jobId, runId);
    setNotices((n) => ({ ...n, [jobId]: r.ok ? describeJobCancel(r.data.job, locale) : describeFailure(r, locale) }));
    await refresh();
  };

  if (projects.status === 'loading') return <p className="fc-muted" role="status">{fcText('loadingProjects', locale)}</p>;
  if (projects.status === 'error') {
    return (
      <div className={`fc-notice fc-tone-bad`} role="alert" data-testid="fc-projects-error">
        <p>{fcText('projectsFailed', locale)}</p>
        {projects.notice.lines.map((l) => <p key={l}>{l}</p>)}
      </div>
    );
  }
  if (projects.projects.length === 0 || !projectId) {
    return (
      <div className="fc-gate" data-testid="fc-no-project">
        <p>{fcText('noProject', locale)}</p>
        <a className="fc-btn" href="#/projects">{fcText('createProject', locale)}</a>
      </div>
    );
  }

  const projectBar = projects.projects.length > 1
    ? (
      <label className="fc-project">
        <span>{fcText('project', locale)}</span>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {projects.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
    )
    : <p className="fc-project"><span>{fcText('project', locale)}</span> <strong>{projects.projects[0]!.name}</strong></p>;

  return (
    <FlightControlView
      locale={locale}
      snapshot={snapshot}
      loading={loading}
      loadNotice={loadNotice}
      finishedJobs={finishedJobs}
      details={details}
      expanded={expanded}
      busy={busy}
      notices={notices}
      confirmingCancel={confirmingCancel}
      projectBar={projectBar}
      onRefresh={() => { void refresh(); }}
      onControl={(runId, action) => { void onControl(runId, action); }}
      onAskCancel={setConfirmingCancel}
      onCancelJob={(runId, jobId) => { void onCancelJob(runId, jobId); }}
      onToggleDetails={onToggleDetails}
    />
  );
}

export function FlightControlScreen() {
  const session = useSession();
  const locale = useLocale();
  return (
    <main className="fc-room" id="main-content" tabIndex={-1} lang={locale === 'pl' ? 'pl' : 'en'} data-testid="flight-control">
      <Hero locale={locale} />
      {session
        ? <SignedInFlightControl token={session.token} locale={locale} />
        : (
          <div className="fc-gate" data-testid="fc-signed-out">
            <p>{fcText('signedOut', locale)}</p>
            <a className="fc-btn" href="#/konto">{fcText('signIn', locale)}</a>
          </div>
        )}
    </main>
  );
}
