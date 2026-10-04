import { useEffect, useRef, useState } from 'react';
import {
  exportResearchRunRecord, getCustomerDelivery, getLabLoop, getLabPackage, getResearchRun, getResearchRunEvidencePack, listProjects, listResearchRuns,
  runGenesisVerify, type Project, type ResearchRunSummary,
} from '../core/backend/client';
import { useSession } from '../core/backend/session';
import { getActiveKnowledgeProject } from '../core/backend/knowledgeProjectContext';
import { useLocale, type Locale } from '../core/i18n';
import { deliverablesOf, deliveryView, describeReportsFailure, evidencePackFileName, verifyReportFileName, type Deliverable, type Notice } from './reports/reportsModel';
import { ReportsList, ReportsNotice, ReportsUnsigned, type ItemState, type RunDeliverables } from './reports/ReportsView';
import { rText } from './reports/reportsText';
import { packageFileName, packageJson } from './labHandoff/labHandoffModel';
import { downloadBlob } from './verify/verifyModel';
import './verify/verify.css';
import './labHandoff/labHandoff.css';

/**
 * #/reports — the deliverables a project already has, per research run, each one fetched from the route
 * that issues it and handed over as a Blob behind an <a download>. Nothing is assembled in the browser:
 * the bytes saved are the server's (pretty-printed JSON for the Evidence Pack and the lab package, whose
 * fingerprints are canonical; the exact record bytes; the server-rendered Verify HTML).
 */

type ProjectsState = { status: 'loading' } | { status: 'error'; notice: Notice } | { status: 'ready'; projects: Project[] };
type RunsState = { status: 'idle' } | { status: 'loading' } | { status: 'error'; notice: Notice } | { status: 'ready'; runs: ResearchRunSummary[] };

function Hero({ locale }: { locale: Locale }) {
  return (
    <header className="vf-hero">
      <p className="vf-kicker">{rText('kicker', locale)}</p>
      <h1>{rText('title', locale)}</h1>
      <p>{rText('lead', locale)}</p>
    </header>
  );
}

const urlOf = (text: string, mimeType: string): string | null => (typeof URL.createObjectURL === 'function' ? URL.createObjectURL(downloadBlob(text, mimeType)) : null);

function SignedInReports({ token, locale }: { token: string; locale: Locale }) {
  const [projects, setProjects] = useState<ProjectsState>({ status: 'loading' });
  const [projectId, setProjectId] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunsState>({ status: 'idle' });
  const [byRun, setByRun] = useState<Record<string, RunDeliverables>>({});
  const [items, setItems] = useState<Record<string, ItemState>>({});
  const urls = useRef<string[]>([]);

  useEffect(() => () => { for (const u of urls.current) URL.revokeObjectURL(u); }, []);

  useEffect(() => {
    let alive = true;
    void listProjects(token).then((r) => {
      if (!alive) return;
      if (!r.ok) { setProjects({ status: 'error', notice: describeReportsFailure(r, locale) }); return; }
      setProjects({ status: 'ready', projects: r.data });
      const preferred = getActiveKnowledgeProject();
      setProjectId(r.data.find((p) => p.id === preferred?.id)?.id ?? r.data[0]?.id ?? null);
    });
    return () => { alive = false; };
    // The locale only words the error; a language switch does not need a second request.
  }, [token]);

  useEffect(() => {
    if (!projectId) return undefined;
    let alive = true;
    setRuns({ status: 'loading' }); setByRun({}); setItems({});
    void listResearchRuns(token, projectId).then(async (r) => {
      if (!alive) return;
      if (!r.ok) { setRuns({ status: 'error', notice: describeReportsFailure(r, locale) }); return; }
      setRuns({ status: 'ready', runs: r.data.researchRuns });
      await Promise.all(r.data.researchRuns.map(async (summary) => {
        const id = summary.researchRunId;
        const [run, lab] = await Promise.all([getResearchRun(token, projectId, id), getLabLoop(token, projectId, id)]);
        if (!alive) return;
        // A lab read that fails only hides lab packages; the run's other deliverables still stand.
        const entry: RunDeliverables = run.ok
          ? { status: 'ready', items: deliverablesOf(projectId, run.data.researchRun, lab.ok ? lab.data.lab : null) }
          : { status: 'error', notice: describeReportsFailure(run, locale) };
        setByRun((m) => ({ ...m, [id]: entry }));
      }));
    });
    return () => { alive = false; };
  }, [projectId, token]);

  const keep = (url: string | null) => { if (url) urls.current.push(url); return url; };
  const set = (key: string, state: ItemState) => setItems((m) => ({ ...m, [key]: state }));

  const onAct = async (item: Deliverable) => {
    if (!projectId) return;
    set(item.key, { status: 'busy' });
    const runId = item.researchRunId;
    if (item.kind === 'evidence-pack') {
      const r = await getResearchRunEvidencePack(token, projectId, runId);
      if (!r.ok) { set(item.key, { status: 'error', notice: describeReportsFailure(r, locale) }); return; }
      set(item.key, { status: 'ready', url: keep(urlOf(`${JSON.stringify(r.data.pack, null, 2)}\n`, 'application/json')), fileName: evidencePackFileName(runId) });
      return;
    }
    if (item.kind === 'record' && item.experimentId) {
      const r = await exportResearchRunRecord(token, projectId, runId, item.experimentId);
      if (!r.ok) { set(item.key, { status: 'error', notice: describeReportsFailure(r, locale) }); return; }
      set(item.key, { status: 'ready', url: keep(urlOf(r.data.record, r.data.mimeType)), fileName: r.data.fileName, sha256: r.data.sha256, size: r.data.size });
      return;
    }
    if (item.kind === 'verify-report' && item.experimentId) {
      const rec = await exportResearchRunRecord(token, projectId, runId, item.experimentId);
      if (!rec.ok) { set(item.key, { status: 'error', notice: describeReportsFailure(rec, locale) }); return; }
      const r = await runGenesisVerify(token, projectId, { record: rec.data.record, declaredSha256: rec.data.sha256, format: 'html' });
      if (!r.ok) { set(item.key, { status: 'error', notice: describeReportsFailure(r, locale) }); return; }
      if (!r.data.html) { set(item.key, { status: 'error', notice: { tone: 'bad', lines: [rText('errOther', locale)], technical: ['html: missing'] } }); return; }
      set(item.key, { status: 'ready', url: keep(urlOf(r.data.html, 'text/html')), fileName: verifyReportFileName(r.data.report.verdict, r.data.report.reportFingerprint), verdict: r.data.report.verdict });
      return;
    }
    if (item.kind === 'lab-package' && item.requestId) {
      const r = await getLabPackage(token, projectId, runId, item.requestId);
      if (!r.ok) { set(item.key, { status: 'error', notice: describeReportsFailure(r, locale) }); return; }
      set(item.key, { status: 'ready', url: keep(urlOf(packageJson(r.data.package), 'application/json')), fileName: packageFileName(r.data.package), sha256: r.data.package.packageHash });
      return;
    }
    if (item.kind === 'customer-delivery') {
      const r = await getCustomerDelivery(token, projectId, runId);
      if (!r.ok) { set(item.key, { status: 'error', notice: describeReportsFailure(r, locale) }); return; }
      const view = deliveryView(r.data, locale);
      set(item.key, view.artifact
        ? { status: 'ready', delivery: view, url: keep(urlOf(view.artifact.content, view.artifact.mediaType)), fileName: view.artifact.fileName, sha256: view.artifact.sha256, size: view.artifact.byteLength }
        : { status: 'ready', delivery: view, url: null, fileName: '' });
    }
  };

  if (projects.status === 'loading') return <p className="vf-muted" role="status">{rText('loadingProjects', locale)}</p>;
  if (projects.status === 'error') return <ReportsNotice notice={{ ...projects.notice, lines: [rText('projectsFailed', locale), ...projects.notice.lines] }} locale={locale} testId="rp-projects-error" />;
  if (projects.projects.length === 0 || !projectId) {
    return (
      <div className="vf-gate" data-testid="rp-no-project">
        <p>{rText('noProject', locale)}</p>
        <a className="vf-btn" href="#/projects">{rText('createProject', locale)}</a>
      </div>
    );
  }

  return (
    <div className="vf-body">
      <div className="lh-pickers">
        <label className="vf-project">
          <span>{rText('project', locale)}</span>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} data-testid="rp-project">
            {projects.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      </div>
      {runs.status === 'loading' ? <p className="vf-muted" role="status">{rText('loadingRuns', locale)}</p> : null}
      {runs.status === 'error' ? <ReportsNotice notice={runs.notice} locale={locale} testId="rp-runs-error" /> : null}
      {runs.status === 'ready' && runs.runs.length === 0 ? (
        <div className="vf-gate" data-testid="rp-no-runs"><p>{rText('noRuns', locale)}</p><a className="vf-btn vf-btn-quiet" href="#/research-console">{rText('openRuns', locale)}</a></div>
      ) : null}
      {runs.status === 'ready' && runs.runs.length > 0 ? <ReportsList locale={locale} runs={runs.runs} byRun={byRun} items={items} onAct={(item) => { void onAct(item); }} /> : null}
    </div>
  );
}

export function ReportsScreen() {
  const session = useSession();
  const locale = useLocale();
  return (
    <main className="vf-room lh-room" id="main-content" tabIndex={-1} lang={locale === 'pl' ? 'pl' : 'en'} data-testid="reports">
      <Hero locale={locale} />
      <ReportsUnsigned locale={locale} />
      {session
        ? <SignedInReports key={session.user.id} token={session.token} locale={locale} />
        : (
          <div className="vf-gate" data-testid="rp-signed-out">
            <p>{rText('signedOut', locale)}</p>
            <a className="vf-btn" href="#/konto">{rText('signIn', locale)}</a>
          </div>
        )}
    </main>
  );
}
