import { useEffect, useMemo, useRef, useState } from 'react';
import {
  compareLabObservation, getLabLoop, getLabPackage, getResearchRun, ingestLabObservation, listProjects, listResearchRuns, prepareLabRequest,
  proposeLabEvidence, reviewLabObservation, verifyLabPackage,
  type LabLoopState, type LabPackage, type LabRequest, type LabReviewVerdict, type Project, type ResearchRunSummary, type ResearchRunView,
} from '../core/backend/client';
import { useSession } from '../core/backend/session';
import { getActiveKnowledgeProject } from '../core/backend/knowledgeProjectContext';
import { useLocale, type Locale } from '../core/i18n';
import {
  buildObservation, buildRequestBody, describeLabFailure, describePackageVerification, emptyObservationForm, experimentRows, numericOutputs,
  observationStages, packageFileName, packageJson, parsePackageText, readFileBase64, EMPTY_REQUEST_FORM,
  type Notice, type ObservationForm, type RequestForm,
} from './labHandoff/labHandoffModel';
import { ExperimentsStep, HonestNotice, LabNotice, ObservationStep, PackageStep, RequestStep, ResultsStep } from './labHandoff/LabHandoffView';
import { lText } from './labHandoff/labHandoffText';
import { downloadBlob, readRecordFile } from './verify/verifyModel';
import './verify/verify.css';
import './labHandoff/labHandoff.css';

/**
 * #/lab-handoff — the candidate → laboratory loop of one ResearchRun, for a person. Pick a project and a
 * run, see which experiments may go to a laboratory and why the others may not, prepare a request whose
 * endpoint, unit and tolerance are frozen before any measurement exists, save the UNSIGNED package, check a
 * package that comes back, enter the REAL MEASUREMENT with its raw file (hashed by Genesis), let another
 * person review it, compare model and measurement and propose evidence. Every value and decision comes from
 * the server (researchRunLab.mjs); nothing is computed or decided in the browser.
 */

type Loadable<T> = { status: 'idle' } | { status: 'loading' } | { status: 'error'; notice: Notice } | { status: 'ready'; value: T };
type ProjectsState = { status: 'loading' } | { status: 'error'; notice: Notice } | { status: 'ready'; projects: Project[] };
interface RunState { run: ResearchRunView; lab: LabLoopState }
interface SavedPackage { requestId: string; pkg: LabPackage; url: string | null; fileName: string; text: string }

function Hero({ locale }: { locale: Locale }) {
  return (
    <header className="vf-hero">
      <p className="vf-kicker">{lText('kicker', locale)}</p>
      <h1>{lText('title', locale)}</h1>
      <p>{lText('lead', locale)}</p>
    </header>
  );
}

function objectUrl(text: string): string | null {
  return typeof URL.createObjectURL === 'function' ? URL.createObjectURL(downloadBlob(text, 'application/json')) : null;
}

function SignedInLabHandoff({ token, userId, locale }: { token: string; userId: string; locale: Locale }) {
  const [projects, setProjects] = useState<ProjectsState>({ status: 'loading' });
  const [projectId, setProjectId] = useState<string | null>(null);
  const [runs, setRuns] = useState<Loadable<ResearchRunSummary[]>>({ status: 'idle' });
  const [runId, setRunId] = useState('');
  const [state, setState] = useState<Loadable<RunState>>({ status: 'idle' });
  const [requestFor, setRequestFor] = useState<string | null>(null);
  const [requestForm, setRequestForm] = useState<RequestForm>(EMPTY_REQUEST_FORM);
  const [requestMissing, setRequestMissing] = useState<string[]>([]);
  const [requestNotice, setRequestNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedPackage | null>(null);
  const [packageNotice, setPackageNotice] = useState<Notice | null>(null);
  const [verifyNotice, setVerifyNotice] = useState<Notice | null>(null);
  const [obsRequestId, setObsRequestId] = useState('');
  const [obsForm, setObsForm] = useState<ObservationForm>(emptyObservationForm(null));
  const [rawFile, setRawFile] = useState<{ name: string; size: number; base64: string } | null>(null);
  const [obsMissing, setObsMissing] = useState<string[]>([]);
  const [obsNotice, setObsNotice] = useState<Notice | null>(null);
  const [reviewDraft, setReviewDraft] = useState<Record<string, { verdict: LabReviewVerdict | ''; note: string }>>({});
  const [notices, setNotices] = useState<Record<string, Notice>>({});
  const generation = useRef(0);
  const obsRequestRef = useRef('');

  useEffect(() => {
    let alive = true;
    void listProjects(token).then((r) => {
      if (!alive) return;
      if (!r.ok) { setProjects({ status: 'error', notice: describeLabFailure(r, locale) }); return; }
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
    setRuns({ status: 'loading' }); setRunId(''); setState({ status: 'idle' });
    void listResearchRuns(token, projectId).then((r) => {
      if (!alive) return;
      setRuns(r.ok ? { status: 'ready', value: r.data.researchRuns } : { status: 'error', notice: describeLabFailure(r, locale) });
    });
    return () => { alive = false; };
  }, [projectId, token]);

  useEffect(() => () => { if (saved?.url) URL.revokeObjectURL(saved.url); }, [saved]);

  const load = async (id: string, keepView = false) => {
    if (!projectId || !id) { setState({ status: 'idle' }); return; }
    const mine = ++generation.current;
    if (!keepView) setState({ status: 'loading' });
    const [run, lab] = await Promise.all([getResearchRun(token, projectId, id), getLabLoop(token, projectId, id)]);
    if (mine !== generation.current) return;
    if (!run.ok) { setState({ status: 'error', notice: describeLabFailure(run, locale) }); return; }
    if (!lab.ok) { setState({ status: 'error', notice: describeLabFailure(lab, locale) }); return; }
    setState({ status: 'ready', value: { run: run.data.researchRun, lab: lab.data.lab } });
    // Keep the picked request when the run still has it, else offer the newest one.
    const requests = lab.data.lab.requests;
    const current = obsRequestRef.current;
    const next = requests.some((r) => r.requestId === current) ? current : requests.at(-1)?.requestId ?? '';
    if (next !== current) pickObsRequest(next, requests);
  };

  const pickObsRequest = (id: string, requests: readonly LabRequest[]) => {
    obsRequestRef.current = id;
    setObsRequestId(id);
    setObsForm(emptyObservationForm(requests.find((r) => r.requestId === id) ?? null));
    setObsMissing([]);
  };

  const onRun = (id: string) => {
    setRunId(id); setRequestFor(null); setSaved(null); setPackageNotice(null); setVerifyNotice(null); setObsNotice(null); setNotices({}); setRawFile(null);
    void load(id);
  };

  const ready = state.status === 'ready' ? state.value : null;
  const rows = useMemo(() => (ready ? experimentRows(ready.run.experiments, ready.lab.requests, locale) : []), [ready, locale]);
  const stages = useMemo(() => (ready ? observationStages(ready.lab, userId) : []), [ready, userId]);
  const requestExperiment = ready?.run.experiments.find((x) => x.experimentId === requestFor);
  const claimOf = (experimentId: string) => ready?.run.experiments.find((x) => x.experimentId === experimentId)?.frozen?.claim ?? experimentId;

  const onPrepareOpen = (experimentId: string) => {
    setRequestFor(experimentId); setRequestMissing([]); setRequestNotice(null);
    const outputs = numericOutputs(ready?.run.experiments.find((x) => x.experimentId === experimentId));
    setRequestForm({ ...EMPTY_REQUEST_FORM, outputKey: outputs.length === 1 ? outputs[0]!.key : '' });
  };

  const onRequestSubmit = async () => {
    if (!projectId || !runId || !requestFor) return;
    const draft = buildRequestBody(requestFor, requestForm);
    if (!draft.ok) { setRequestMissing(draft.missing); return; }
    setRequestMissing([]); setRequestNotice(null); setBusy('request');
    const r = await prepareLabRequest(token, projectId, runId, draft.body);
    setBusy(null);
    if (!r.ok) { setRequestNotice(describeLabFailure(r, locale)); return; }
    setRequestFor(null);
    pickObsRequest(r.data.request.requestId, [r.data.request]);
    await load(runId, true);
  };

  const onGetPackage = async (requestId: string) => {
    if (!projectId || !runId) return;
    setBusy(`package:${requestId}`); setPackageNotice(null);
    const r = await getLabPackage(token, projectId, runId, requestId);
    setBusy(null);
    if (!r.ok) { setPackageNotice(describeLabFailure(r, locale)); return; }
    const text = packageJson(r.data.package);
    setSaved({ requestId, pkg: r.data.package, url: objectUrl(text), fileName: packageFileName(r.data.package), text });
  };

  const verifyText = async (text: string) => {
    if (!projectId || !runId) return;
    const parsed = parsePackageText(text);
    if (!parsed.ok) { setVerifyNotice({ tone: 'bad', lines: [lText('notJson', locale)], technical: [] }); return; }
    setBusy('verify'); setVerifyNotice(null);
    const r = await verifyLabPackage(token, projectId, runId, parsed.value);
    setBusy(null);
    setVerifyNotice(r.ok ? describePackageVerification(r.data.verification, locale) : describeLabFailure(r, locale));
  };

  const onVerifyFile = async (file: File) => {
    try { await verifyText(await readRecordFile(file)); } catch (error) {
      setVerifyNotice({ tone: 'bad', lines: [lText('fileFailed', locale)], technical: [String((error as Error)?.message ?? error)] });
    }
  };

  const onObsFile = async (file: File) => {
    try {
      const read = await readFileBase64(file);
      setRawFile({ name: file.name, size: read.size, base64: read.base64 }); setObsMissing((m) => m.filter((k) => k !== 'rawFile'));
    } catch (error) {
      setRawFile(null); setObsNotice({ tone: 'bad', lines: [lText('fileFailed', locale)], technical: [String((error as Error)?.message ?? error)] });
    }
  };

  const onObsSubmit = async () => {
    if (!projectId || !runId || !ready) return;
    const request = ready.lab.requests.find((r) => r.requestId === obsRequestId);
    if (!request) return;
    const draft = buildObservation(request, obsForm, rawFile?.base64 ?? null);
    if (!draft.ok) { setObsMissing(draft.missing); return; }
    setObsMissing([]); setObsNotice(null); setBusy('observation');
    const r = await ingestLabObservation(token, projectId, runId, request.requestId, draft.observation);
    setBusy(null);
    if (!r.ok) { setObsNotice(describeLabFailure(r, locale)); return; }
    setObsNotice({ tone: 'good', lines: [`${lText('observationSaved', locale)} ${r.data.observation.rawArtifactSha256}`], technical: [`observationId: ${r.data.observation.observationId}`, `integrity: ${r.data.observation.rawArtifactIntegrity.level}`] });
    setRawFile(null); setObsForm(emptyObservationForm(request));
    await load(runId, true);
  };

  const act = async (key: string, run: () => Promise<{ ok: true } | { ok: false; status: number; error: string; message: string; responseBody?: unknown }>) => {
    setBusy(key);
    setNotices(({ [key]: _drop, ...rest }) => rest);
    const r = await run();
    setBusy(null);
    if (!r.ok) setNotices((n) => ({ ...n, [key]: describeLabFailure(r, locale) }));
    await load(runId, true);
  };

  const onReview = (observationId: string) => {
    const draft = reviewDraft[observationId];
    if (!projectId || !draft?.verdict) return;
    void act(`review:${observationId}`, () => reviewLabObservation(token, projectId, runId, observationId, draft.verdict as LabReviewVerdict, draft.note.trim() || undefined));
  };
  const onCompare = (observationId: string) => { if (projectId) void act(`compare:${observationId}`, () => compareLabObservation(token, projectId, runId, observationId)); };
  const onPropose = (observationId: string) => { if (projectId) void act(`evidence:${observationId}`, () => proposeLabEvidence(token, projectId, runId, observationId)); };

  if (projects.status === 'loading') return <p className="vf-muted" role="status">{lText('loadingProjects', locale)}</p>;
  if (projects.status === 'error') return <LabNotice notice={{ ...projects.notice, lines: [lText('projectsFailed', locale), ...projects.notice.lines] }} locale={locale} testId="lh-projects-error" />;
  if (projects.projects.length === 0 || !projectId) {
    return (
      <div className="vf-gate" data-testid="lh-no-project">
        <p>{lText('noProject', locale)}</p>
        <a className="vf-btn" href="#/projects">{lText('createProject', locale)}</a>
      </div>
    );
  }

  return (
    <div className="vf-body">
      <div className="lh-pickers">
        <label className="vf-project">
          <span>{lText('project', locale)}</span>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} data-testid="lh-project">
            {projects.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        {runs.status === 'loading' ? <p className="vf-muted" role="status">{lText('loadingRuns', locale)}</p> : null}
        {runs.status === 'error' ? <LabNotice notice={runs.notice} locale={locale} testId="lh-runs-error" /> : null}
        {runs.status === 'ready' && runs.value.length === 0 ? (
          <div className="vf-gate" data-testid="lh-no-runs"><p>{lText('noRuns', locale)}</p><a className="vf-btn vf-btn-quiet" href="#/research-console">{lText('openRuns', locale)}</a></div>
        ) : null}
        {runs.status === 'ready' && runs.value.length > 0 ? (
          <label className="vf-project">
            <span>{lText('run', locale)}</span>
            <select value={runId} onChange={(e) => onRun(e.target.value)} data-testid="lh-run">
              <option value="">{lText('chooseRun', locale)}</option>
              {runs.value.map((r) => <option key={r.researchRunId} value={r.researchRunId}>{r.question}</option>)}
            </select>
          </label>
        ) : null}
      </div>

      {state.status === 'loading' ? <p className="vf-muted" role="status">{lText('loadingRun', locale)}</p> : null}
      {state.status === 'error' ? <LabNotice notice={state.notice} locale={locale} testId="lh-run-error" /> : null}
      {ready ? (
        <>
          <div className="vf-actions"><button type="button" className="vf-btn vf-btn-quiet" onClick={() => { void load(runId, true); }} data-testid="lh-refresh">{lText('refresh', locale)}</button></div>
          <ExperimentsStep locale={locale} rows={rows} onPrepare={onPrepareOpen} />
          {requestFor ? (
            <RequestStep
              locale={locale}
              claim={claimOf(requestFor)}
              outputs={numericOutputs(requestExperiment)}
              form={requestForm}
              missing={requestMissing}
              busy={busy === 'request'}
              notice={requestNotice}
              onChange={(patch) => { setRequestForm((f) => ({ ...f, ...patch })); setRequestNotice(null); }}
              onSubmit={() => { void onRequestSubmit(); }}
              onCancel={() => setRequestFor(null)}
            />
          ) : null}
          <PackageStep
            locale={locale}
            requests={ready.lab.requests}
            claimOf={claimOf}
            busyRequestId={busy?.startsWith('package:') ? busy.slice('package:'.length) : null}
            saved={saved}
            notice={packageNotice}
            verifyBusy={busy === 'verify'}
            verifyNotice={verifyNotice}
            onGetPackage={(id) => { void onGetPackage(id); }}
            onVerifyFile={(f) => { void onVerifyFile(f); }}
            onVerifySaved={() => { if (saved) void verifyText(saved.text); }}
          />
          <ObservationStep
            locale={locale}
            requests={ready.lab.requests}
            requestId={obsRequestId}
            form={obsForm}
            file={rawFile}
            missing={obsMissing}
            busy={busy === 'observation'}
            notice={obsNotice}
            onRequest={(id) => pickObsRequest(id, ready.lab.requests)}
            onChange={(patch) => { setObsForm((f) => ({ ...f, ...patch })); setObsNotice(null); }}
            onFile={(f) => { void onObsFile(f); }}
            onSubmit={() => { void onObsSubmit(); }}
          />
          <ResultsStep
            locale={locale}
            lab={ready.lab}
            stages={stages}
            reviewDraft={reviewDraft}
            busy={busy}
            notices={notices}
            onReviewDraft={(id, patch) => setReviewDraft((d) => ({ ...d, [id]: { ...(d[id] ?? { verdict: '', note: '' }), ...patch } }))}
            onReview={onReview}
            onCompare={onCompare}
            onPropose={onPropose}
          />
        </>
      ) : null}
    </div>
  );
}

export function LabHandoffScreen() {
  const session = useSession();
  const locale = useLocale();
  return (
    <main className="vf-room lh-room" id="main-content" tabIndex={-1} lang={locale === 'pl' ? 'pl' : 'en'} data-testid="lab-handoff">
      <Hero locale={locale} />
      <HonestNotice locale={locale} />
      {session
        ? <SignedInLabHandoff key={session.user.id} token={session.token} userId={session.user.id} locale={locale} />
        : (
          <div className="vf-gate" data-testid="lh-signed-out">
            <p>{lText('signedOut', locale)}</p>
            <a className="vf-btn" href="#/konto">{lText('signIn', locale)}</a>
          </div>
        )}
    </main>
  );
}
