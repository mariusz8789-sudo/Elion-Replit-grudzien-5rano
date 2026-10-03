import { useEffect, useMemo, useRef, useState } from 'react';
import {
  exportResearchRunRecord, getResearchRun, listProjects, listResearchRuns, runGenesisVerify,
  type GenesisRecordExport, type GenesisVerifyReport, type Project, type ResearchRunSummary,
} from '../core/backend/client';
import { useSession } from '../core/backend/session';
import { getActiveKnowledgeProject } from '../core/backend/knowledgeProjectContext';
import { useLocale, type Locale } from '../core/i18n';
import { VerifyView, NoticeBox, UnsignedNotice, type Loadable } from './verify/VerifyView';
import {
  describeVerifyFailure, downloadBlob, explainReport, exportableExperiments, normaliseSha256, readRecordFile, reportFileName, sha256State,
  type Notice,
} from './verify/verifyModel';
import { vText } from './verify/verifyText';
import './verify/verify.css';

/**
 * #/verify — GENESIS VERIFY for a customer. Pick a project, add a Genesis record (file, paste, or the
 * record of an executed experiment exported by the server), optionally the sha256 you were given, run
 * Verify, read a plain verdict and download the self-contained HTML report the backend renders.
 * Everything shown comes from POST /genesis-verify; nothing is computed or decided in the browser.
 */

function Hero({ locale }: { locale: Locale }) {
  return (
    <header className="vf-hero">
      <p className="vf-kicker">{vText('kicker', locale)}</p>
      <h1>{vText('title', locale)}</h1>
      <p>{vText('lead', locale)}</p>
    </header>
  );
}

/** An object URL for a Blob of `text`, revoked when the text changes or the screen unmounts. */
function useBlobUrl(text: string | null, mimeType: string): string | null {
  const url = useMemo(() => (text === null || typeof URL.createObjectURL !== 'function' ? null : URL.createObjectURL(downloadBlob(text, mimeType))), [text, mimeType]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url;
}

type ProjectsState = { status: 'loading' } | { status: 'error'; notice: Notice } | { status: 'ready'; projects: Project[] };
type ExperimentOption = { experimentId: string; label: string; status: string };

function SignedInVerify({ token, locale }: { token: string; locale: Locale }) {
  const [projects, setProjects] = useState<ProjectsState>({ status: 'loading' });
  const [projectId, setProjectId] = useState<string | null>(null);
  const [recordText, setRecordText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileNotice, setFileNotice] = useState<Notice | null>(null);
  const [declaredSha, setDeclaredSha] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [report, setReport] = useState<GenesisVerifyReport | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [runs, setRuns] = useState<Loadable<ResearchRunSummary[]>>({ status: 'idle' });
  const [runId, setRunId] = useState('');
  const [experiments, setExperiments] = useState<Loadable<ExperimentOption[]>>({ status: 'idle' });
  const [experimentId, setExperimentId] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<Notice | null>(null);
  const [exported, setExported] = useState<GenesisRecordExport | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    let alive = true;
    void listProjects(token).then((r) => {
      if (!alive) return;
      if (!r.ok) { setProjects({ status: 'error', notice: describeVerifyFailure(r, locale) }); return; }
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
    ++generation.current;
    setRuns({ status: 'loading' }); setRunId(''); setExperiments({ status: 'idle' }); setExperimentId('');
    setExported(null); setExportNotice(null); setReport(null); setHtml(null); setNotice(null);
    void listResearchRuns(token, projectId).then((r) => {
      if (!alive) return;
      setRuns(r.ok ? { status: 'ready', value: r.data.researchRuns } : { status: 'error', notice: describeVerifyFailure(r, locale) });
    });
    return () => { alive = false; };
  }, [projectId, token]);

  const reportUrl = useBlobUrl(html, 'text/html');
  const exportedUrl = useBlobUrl(exported?.record ?? null, exported?.mimeType ?? 'application/json');
  const result = useMemo(() => (report ? explainReport(report, locale) : null), [report, locale]);

  const resetResult = () => { setReport(null); setHtml(null); setNotice(null); };

  const onRun = async (id: string) => {
    setRunId(id); setExperimentId(''); setExported(null); setExportNotice(null);
    if (!id || !projectId) { setExperiments({ status: 'idle' }); return; }
    setExperiments({ status: 'loading' });
    const r = await getResearchRun(token, projectId, id);
    setExperiments(r.ok ? { status: 'ready', value: exportableExperiments(r.data.researchRun.experiments) } : { status: 'error', notice: describeVerifyFailure(r, locale) });
  };

  const onGetRecord = async () => {
    if (!projectId || !runId || !experimentId) return;
    setExporting(true); setExportNotice(null);
    const r = await exportResearchRunRecord(token, projectId, runId, experimentId);
    setExporting(false);
    if (!r.ok) { setExported(null); setExportNotice(describeVerifyFailure(r, locale)); return; }
    setExported(r.data);
    setRecordText(r.data.record);
    setFileName(r.data.fileName);
    setFileNotice(null);
    setDeclaredSha(r.data.sha256);
    resetResult();
  };

  const onFile = async (file: File) => {
    try {
      const text = await readRecordFile(file);
      setRecordText(text); setFileName(file.name); setFileNotice(null); setExported(null); resetResult();
    } catch (error) {
      setFileNotice({ tone: 'bad', lines: [vText('fileFailed', locale)], technical: [String((error as Error)?.message ?? error)] });
    }
  };

  const onVerify = async () => {
    if (!projectId || !recordText.trim() || sha256State(declaredSha) === false) return;
    const mine = ++generation.current;
    setBusy(true); resetResult();
    const sha = normaliseSha256(declaredSha);
    const r = await runGenesisVerify(token, projectId, { record: recordText, declaredSha256: sha || null, format: 'html' });
    setBusy(false);
    if (mine !== generation.current) return;
    if (!r.ok) { setNotice(describeVerifyFailure(r, locale)); return; }
    setReport(r.data.report);
    setHtml(r.data.html ?? null);
  };

  const onClear = () => {
    setRecordText(''); setFileName(null); setFileNotice(null); setDeclaredSha(''); setExported(null); setExportNotice(null); resetResult();
  };

  if (projects.status === 'loading') return <p className="vf-muted" role="status">{vText('loadingProjects', locale)}</p>;
  if (projects.status === 'error') {
    return <NoticeBox notice={{ ...projects.notice, lines: [vText('projectsFailed', locale), ...projects.notice.lines] }} locale={locale} testId="vf-projects-error" />;
  }
  if (projects.projects.length === 0 || !projectId) {
    return (
      <div className="vf-gate" data-testid="vf-no-project">
        <p>{vText('noProject', locale)}</p>
        <a className="vf-btn" href="#/projects">{vText('createProject', locale)}</a>
      </div>
    );
  }

  const projectBar = projects.projects.length > 1
    ? (
      <label className="vf-project">
        <span>{vText('project', locale)}</span>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)} data-testid="vf-project">
          {projects.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
    )
    : <p className="vf-project"><span>{vText('project', locale)}</span> <strong>{projects.projects[0]!.name}</strong></p>;

  return (
    <VerifyView
      locale={locale}
      projectBar={projectBar}
      recordText={recordText}
      fileName={fileName}
      fileNotice={fileNotice}
      declaredSha={declaredSha}
      shaValid={sha256State(declaredSha)}
      busy={busy}
      notice={notice}
      result={result}
      reportUrl={reportUrl}
      reportFileName={report ? reportFileName(report) : null}
      exporter={{
        runs, runId, experiments, experimentId, exporting, exportNotice, exported, exportedUrl,
        onRun: (id) => { void onRun(id); },
        onExperiment: setExperimentId,
        onGetRecord: () => { void onGetRecord(); },
      }}
      onRecordText={(t) => { setRecordText(t); setFileName(null); setExported(null); resetResult(); }}
      onFile={(f) => { void onFile(f); }}
      onSha={(s) => { setDeclaredSha(s); resetResult(); }}
      onVerify={() => { void onVerify(); }}
      onClear={onClear}
    />
  );
}

export function VerifyScreen() {
  const session = useSession();
  const locale = useLocale();
  return (
    <main className="vf-room" id="main-content" tabIndex={-1} lang={locale === 'pl' ? 'pl' : 'en'} data-testid="verify">
      <Hero locale={locale} />
      <UnsignedNotice locale={locale} />
      {session
        ? <SignedInVerify token={session.token} locale={locale} />
        : (
          <div className="vf-gate" data-testid="vf-signed-out">
            <p>{vText('signedOut', locale)}</p>
            <a className="vf-btn" href="#/konto">{vText('signIn', locale)}</a>
          </div>
        )}
    </main>
  );
}
