import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cancelResearchRunJob, controlResearchRun, getResearchRunJob,
  type BytProjection, type GenesisCognitiveState, type ResearchRunControlResult, type ResearchRunQueueJob, type ResearchRunSummary, type ResearchRunView,
} from '../core/backend/client';
import { clearSession, setSession } from '../core/backend/session';
import { activeNavId } from '../core/navigation';
import { FlightControlScreen } from '../components/FlightControlScreen';
import { FlightControlView, type FlightControlViewProps } from '../components/flightControl/FlightControlView';
import { describeControl, describeFailure, describeJobCancel, loadFlightControl, type FlightControlSnapshot } from '../components/flightControl/flightControlModel';
import { REPO_ROOT } from './fixtures/repoPaths';

/**
 * #/flight-control — Kontrola lotów nauki. The project has no DOM test environment, so the screen is
 * split: the data side (`loadFlightControl`, the client control calls) runs against a mocked fetch, and
 * the pure view renders what came back with `renderToStaticMarkup`. The flights and BYT come from the
 * backend's own `projectScienceFlightControl` and `buildBytProjection`, so the fixture has the exact
 * shape the server emits; only the canonical campaign EVENTS (the inputs) are written here.
 */

type BackendFlightControl = { projectScienceFlightControl: (input: unknown) => { flights: Record<string, unknown>[] } };
type BackendByt = { buildBytProjection: (input: unknown) => BytProjection };
let backendFlights: BackendFlightControl;
let backendByt: BackendByt;

beforeAll(async () => {
  backendFlights = await import(pathToFileURL(path.resolve(REPO_ROOT, 'packages/backend/src/campaign/scienceFlightControl.mjs')).href) as BackendFlightControl;
  backendByt = await import(pathToFileURL(path.resolve(REPO_ROOT, 'packages/backend/src/bytProjection.mjs')).href) as BackendByt;
});

afterEach(() => { clearSession(); vi.unstubAllGlobals(); });

const ev = (id: string, type: string, payload: Record<string, unknown>) => ({ id, type, createdAt: 1_790_000_000_000, payload });
const plan = (executionId: string, candidateId: string) => ev(`ev-plan-${executionId}`, 'VIRTUAL_EXPERIMENT_PLANNED', {
  executionId, candidateId, requestedCapability: 'docking.vina', inputFingerprint: `in-${executionId}`,
  researchGate: { verdict: 'ADMIT', reason: 'PREREGISTERED' }, clinicalEfficacy: 'UNKNOWN', claimBoundary: 'IN_SILICO_ONLY',
  budget: { maxComputeSeconds: 60 }, expectation: { observable: 'affinity' },
});

function realByt(): BytProjection {
  const fc = backendFlights.projectScienceFlightControl({
    plans: [plan('exe-verified', 'CHEMBL941'), plan('exe-unbound', 'CHEMBL25')],
    results: [
      ev('ev-res-1', 'VIRTUAL_EXPERIMENT_RESULT', {
        executionId: 'exe-verified', candidateId: 'CHEMBL941', requestedCapability: 'docking.vina', status: 'EXECUTED_COMPUTATIONAL_EXPERIMENT',
        selectedEngine: 'autodock-vina-1.2.5', scienceRunId: 'sr-77', outputFingerprint: 'out-77', durationMs: 4200, epistemicClassification: 'IN_SILICO_SUPPORT',
      }),
      ev('ev-res-2', 'VIRTUAL_EXPERIMENT_RESULT', {
        executionId: 'exe-unbound', candidateId: 'CHEMBL25', requestedCapability: 'docking.vina', status: 'BLOCKED_UNBOUND_ENGINE', reason: 'NO_ENGINE_BOUND',
      }),
    ],
    evidenceLinks: [ev('ev-evi-1', 'VIRTUAL_EVIDENCE_LINKED', { executionId: 'exe-verified', proposalId: 'evp-9' })],
    replays: [ev('ev-rep-1', 'VIRTUAL_REPLAY', { executionId: 'exe-verified', replayStatus: 'REPLAY_MATCH', verificationId: 'ver-3' })],
  });
  const flights = fc.flights.map((f, i) => ({ campaignId: 'camp-1', candidateId: i === 0 ? 'CHEMBL941' : 'CHEMBL25', ...f }));
  return backendByt.buildBytProjection({ runs: [], registry: null, selfModel: null, flightControl: flights });
}

function cognitiveState(overrides: Partial<GenesisCognitiveState> = {}): GenesisCognitiveState {
  return {
    schemaVersion: 1, projectId: 'p1', generatedAt: '2026-10-03T10:00:00.000Z', view: 'MATERIALIZED_VIEW',
    byt: realByt(),
    currentGoals: [], activeQuestions: [], activeHypotheses: [], knowledgeGaps: [], contradictions: [], proposedClaims: [],
    blockedCapabilities: [{ kind: 'ENGINE_RUNTIME', id: 'gnina', blockedBy: 'RUNTIME_NOT_INSTALLED' }],
    pendingExperiments: [
      { kind: 'CAMPAIGN', id: 'camp-2' },
      { kind: 'RESEARCH_RUN_JOB', id: 'job-rr-queued', researchRunId: 'rr-1', hypothesisId: 'H2' },
    ],
    runningExperiments: [
      { kind: 'RESEARCH_RUN_JOB', id: 'job-rr-claimed', researchRunId: 'rr-1', hypothesisId: 'H1', workerId: 'worker-research-run-local', leaseExpiresAt: 1_790_000_030_000, attempts: 1 },
    ],
    awaitingExternalMeasurements: [], recentEvidenceRefs: [], proposedNextActions: [],
    integrity: { researchRuns: [{ runId: 'rr-1', ok: true }], knowledgeRegistry: { ok: true, brokenAt: null, reason: null } },
    ...overrides,
  };
}

const RUNS: ResearchRunSummary[] = [
  { researchRunId: 'rr-1', question: 'Czy imatynib wiąże kinazę ABL silniej niż aspiryna?', status: 'RUNNING', nextStep: 'AWAITING_EXECUTION', events: 7, createdAt: 1_789_990_000_000 },
  { researchRunId: 'rr-2', question: 'Czy pH roztworu spada po dodaniu kwasu?', status: 'PAUSED', nextStep: 'NONE', events: 3, createdAt: 1_789_980_000_000 },
];

const FINISHED: ResearchRunQueueJob = {
  jobId: 'job-rr-done', researchRunId: 'rr-1', experimentId: 'queued-abc', capabilityId: 'research-run-experiment', state: 'DEAD_LETTER',
  // The queue clears worker and lease when a job ends (workerInfrastructureContract.mjs), so they are null here.
  workerId: null, leaseId: null, leaseExpiresAt: null, attempts: 1, maxAttempts: 1, timeoutMs: 120_000,
  payload: { projectId: 'p1', hypothesisId: 'H0' }, result: null, failure: { code: 'LEASE_EXPIRED_AFTER_MAX_ATTEMPTS' }, cancelReason: null, createdAt: 1, updatedAt: 2,
};

interface Call { url: string; method: string; auth: string | null; body: unknown }

/** A fetch that answers by URL and records every call. */
function mockFetch(routes: Record<string, { status?: number; body: unknown } | 'offline'>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({ url, method: init.method ?? 'GET', auth: headers.authorization ?? null, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const route = routes[`${init.method ?? 'GET'} ${url}`];
    if (route === 'offline') throw new TypeError('Failed to fetch');
    if (!route) return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
    return new Response(JSON.stringify(route.body), { status: route.status ?? 200, headers: { 'content-type': 'application/json' } });
  }));
  return calls;
}

function viewProps(snapshot: FlightControlSnapshot | null, extra: Partial<FlightControlViewProps> = {}): FlightControlViewProps {
  return {
    locale: 'pl', snapshot, loading: false, loadNotice: null, finishedJobs: [], details: {}, expanded: new Set(), busy: null, notices: {},
    confirmingCancel: null, onRefresh: () => {}, onControl: () => {}, onAskCancel: () => {}, onCancelJob: () => {}, onToggleDetails: () => {},
    ...extra,
  };
}

async function loaded(state: GenesisCognitiveState, runs: ResearchRunSummary[] | { status: number; body: unknown }): Promise<FlightControlSnapshot> {
  mockFetch({
    'GET /api/projects/p1/cognitive-state': { body: { cognitiveState: state } },
    'GET /api/projects/p1/research-runs': Array.isArray(runs) ? { body: { researchRuns: runs } } : runs,
  });
  const r = await loadFlightControl('tok', 'p1', () => 1_790_000_000_000);
  if (!r.ok) throw new Error(`load failed: ${r.error}`);
  return r.snapshot;
}

describe('Flight Control renders the real server fields', () => {
  it('loads cognitive state and the run list with the bearer token, and keeps both', async () => {
    const calls = mockFetch({
      'GET /api/projects/p1/cognitive-state': { body: { cognitiveState: cognitiveState() } },
      'GET /api/projects/p1/research-runs': { body: { researchRuns: RUNS } },
    });
    const r = await loadFlightControl('tok', 'p1');
    expect(r.ok).toBe(true);
    expect(calls.map((c) => `${c.method} ${c.url}`).sort()).toEqual(['GET /api/projects/p1/cognitive-state', 'GET /api/projects/p1/research-runs']);
    expect(calls.every((c) => c.auth === 'Bearer tok')).toBe(true);
  });

  it('shows runs, queued/claimed/finished jobs with worker and lease, flights and blocked dependencies', async () => {
    const snapshot = await loaded(cognitiveState(), RUNS);
    const html = renderToStaticMarkup(<FlightControlView {...viewProps(snapshot, { finishedJobs: [FINISHED] })} />);
    // runs, their status and the next step, named from the server codes
    expect(html).toContain('Czy imatynib wiąże kinazę ABL silniej niż aspiryna?');
    expect(html).toContain('data-status="RUNNING"');
    expect(html).toContain('w toku');
    expect(html).toContain('wstrzymany');
    expect(html).toContain('czeka na uruchomienie eksperymentu');
    expect(html).toContain('7 zdarzeń w łańcuchu');
    expect(html).toContain('łańcuch zdarzeń zgodny');
    // controls follow the run status: RUNNING can pause, PAUSED can resume
    expect(html).toMatch(/data-testid="fc-run-rr-1"[\s\S]*?Wstrzymaj/);
    expect(html).toMatch(/data-testid="fc-run-rr-2"[\s\S]*?Wznów/);
    // lease queue: the campaign row is not a ResearchRun job and is not shown as one
    expect(html).toContain('data-testid="fc-job-job-rr-queued"');
    expect(html).toContain('data-testid="fc-job-job-rr-claimed"');
    expect(html).not.toContain('camp-2');
    expect(html).toContain('worker-research-run-local');
    expect(html).toMatch(/Dzierżawa do<\/dt><dd>\d{2}:\d{2}:\d{2}<\/dd>/);
    expect(html).toContain('data-testid="fc-job-job-rr-done"');
    expect(html).toContain('porzucone po wygaśnięciu');
    expect(html).toContain('LEASE_EXPIRED_AFTER_MAX_ATTEMPTS');
    expect(html).toMatch(/data-testid="fc-job-job-rr-done"[\s\S]*?serwer nie zachowuje go po zakończeniu zadania/);
    // flights from the backend projection
    expect(html).toContain('CHEMBL941');
    expect(html).toContain('data-status="VERIFIED"');
    expect(html).toContain('dopuszczony');
    expect(html).toContain('autodock-vina-1.2.5');
    expect(html).toContain('w budżecie');
    expect(html).toContain('zgodny');
    expect(html).toContain('zaproponowany, czeka na człowieka');
    expect(html).toContain('brak silnika dla zdolności');
    // blocked dependencies: the engine from the self model and the unbound flight
    expect(html).toContain('gnina');
    expect(html).toContain('RUNTIME_NOT_INSTALLED');
    expect(html).toContain('Lot zatrzymany przez zależność');
    // the counts are lengths and server numbers
    expect(html).toMatch(/data-testid="fc-sum-runs"><dt>przebiegi<\/dt><dd>2<\/dd>/);
    expect(html).toMatch(/data-testid="fc-sum-verified"><dt>zweryfikowane<\/dt><dd>1<\/dd>/);
    expect(html).toMatch(/data-testid="fc-sum-blocked"><dt>zablokowane<\/dt><dd>1<\/dd>/);
    // ids live under Szczegóły techniczne
    expect(html).toContain('<summary>Szczegóły techniczne</summary>');
  });

  it('shows hypotheses and experiment state from the run detail when it is opened', async () => {
    const snapshot = await loaded(cognitiveState(), RUNS);
    const view: ResearchRunView = {
      researchRunId: 'rr-1', question: RUNS[0]!.question, nextStep: 'AWAITING_EXECUTION',
      plan: { hypotheses: [{ hypothesisId: 'H1', claim: 'Imatynib ma niższą energię wiązania niż aspiryna.' }] },
      experiments: [{
        experimentId: 'x-1',
        frozen: { hypothesisId: 'H1', claim: 'Imatynib ma niższą energię wiązania niż aspiryna.', engineId: 'vina', input: {}, inputHash: 'ih', protocolId: 'p', predictionFingerprint: 'pf', preregistrationFingerprint: 'rf', criteria: [] },
        execution: null, falsification: { verdict: 'FALSIFIED_WITHIN_PROTOCOL', scope: 's', criteria: [] }, evidence: null, next: null,
      }],
      researchState: { chain: { ok: true }, events: [] },
    };
    const html = renderToStaticMarkup(<FlightControlView {...viewProps(snapshot, { expanded: new Set(['rr-1']), details: { 'rr-1': { status: 'ready', view } } })} />);
    expect(html).toContain('Imatynib ma niższą energię wiązania niż aspiryna.');
    expect(html).toContain('obalona w ramach protokołu');
    expect(html).toContain('jeszcze nie wykonany');
    expect(html).toContain('aria-expanded="true"');
  });
});

describe('Flight Control empty states are honest', () => {
  it('no runs, no jobs, no flights, unknown self model, no hypotheses', async () => {
    const byt = realByt();
    const state = cognitiveState({
      pendingExperiments: [], runningExperiments: [],
      blockedCapabilities: { status: 'UNKNOWN', reason: 'SELF_MODEL_UNAVAILABLE' },
      byt: { ...byt, scienceFlightControl: { ...byt.scienceFlightControl, status: 'AVAILABLE', flights: [], verified: 0, blocked: 0, rejectedUntraceableRecords: 0 } as BytProjection['scienceFlightControl'] },
    });
    const snapshot = await loaded(state, []);
    const html = renderToStaticMarkup(<FlightControlView {...viewProps(snapshot)} />);
    expect(html).toContain('W tym projekcie nie ma jeszcze żadnego przebiegu badań.');
    expect(html).toContain('Nic nie czeka w kolejce.');
    expect(html).toContain('Żaden pracownik nie wykonuje teraz zadania.');
    expect(html).toContain('Serwer nie podaje listy zakończonych zadań.');
    expect(html).toContain('Brak lotów: żadna kampania Virtual Lab w tym projekcie nie zaplanowała jeszcze eksperymentu.');
    expect(html).toContain('nie wiadomo, które silniki są zablokowane');
    expect(html).toMatch(/data-testid="fc-sum-runs"><dt>przebiegi<\/dt><dd>0<\/dd>/);

    const noPlan: ResearchRunView = { researchRunId: 'rr-1', question: 'q', nextStep: 'PROPOSE_PLAN', plan: null, experiments: [], researchState: { chain: { ok: true }, events: [] } };
    const withRun = await loaded(state, [RUNS[0]!]);
    const detail = renderToStaticMarkup(<FlightControlView {...viewProps(withRun, { expanded: new Set(['rr-1']), details: { 'rr-1': { status: 'ready', view: noPlan } } })} />);
    expect(detail).toContain('Brak danych o hipotezach w tym widoku.');
  });

  it('Flight Control the server did not compute is not shown as zero flights', async () => {
    const byt = backendByt.buildBytProjection({ runs: [], registry: null, selfModel: null, flightControl: null });
    const snapshot = await loaded(cognitiveState({ byt }), RUNS);
    const html = renderToStaticMarkup(<FlightControlView {...viewProps(snapshot)} />);
    expect(html).toContain('Serwer nie przeliczył kontroli lotów w tym widoku.');
    expect(html).toMatch(/data-testid="fc-sum-flights"><dt>loty<\/dt><dd>—<\/dd>/);
  });

  it('signed out: a plain message and a way to sign in, no request', () => {
    const calls = mockFetch({});
    const html = renderToStaticMarkup(<FlightControlScreen />);
    expect(html).toContain('data-testid="fc-signed-out"');
    expect(html).toContain('Zaloguj się, żeby zobaczyć przebiegi badań swojego projektu.');
    expect(html).toContain('href="#/konto"');
    expect(calls).toEqual([]);
  });

  it('signed in: starts by checking the projects, not by showing data', () => {
    setSession({ token: 't', user: { id: 'u', email: 'a@b.pl', displayName: 'A', createdAt: 1 }, expiresInMs: 1 });
    const html = renderToStaticMarkup(<FlightControlScreen />);
    expect(html).toContain('Sprawdzam Twoje projekty');
    expect(html).not.toContain('fc-signed-out');
  });
});

describe('Pause, resume and cancel call the real routes', () => {
  const result = (status: string, queue: Partial<ResearchRunControlResult['queue']> = {}) => ({
    ok: true, status, researchRun: { researchRunId: 'rr-1' }, queue: { withdrawn: [], inFlight: [], requeued: [], refused: [], ...queue },
  });

  it.each([
    ['pause', 'PAUSED'],
    ['resume', 'RUNNING'],
    ['cancel', 'CANCELLED'],
  ] as const)('%s → POST /api/projects/p1/research-runs/rr-1/%s', async (action, status) => {
    const calls = mockFetch({ [`POST /api/projects/p1/research-runs/rr-1/${action}`]: { body: result(status) } });
    const r = await controlResearchRun('tok', 'p1', 'rr-1', action);
    expect(r.ok).toBe(true);
    expect(calls).toEqual([{ url: `/api/projects/p1/research-runs/rr-1/${action}`, method: 'POST', auth: 'Bearer tok', body: {} }]);
  });

  it('the pause result states that a job a worker is already executing cannot be interrupted and finishes', async () => {
    mockFetch({ 'POST /api/projects/p1/research-runs/rr-1/pause': { body: result('PAUSED', { withdrawn: ['job-rr-queued'], inFlight: ['job-rr-claimed'] }) } });
    const r = await controlResearchRun('tok', 'p1', 'rr-1', 'pause');
    if (!r.ok) throw new Error('pause failed');
    const notice = describeControl('pause', r.data, 'pl');
    expect(notice.lines).toContain('Przebieg wstrzymany.');
    expect(notice.lines.join(' ')).toContain('Zadania, które pracownik już wykonuje, nie da się przerwać — dokończy się do końca.');
    expect(notice.lines).toContain('Wycofane z kolejki: 1');
    expect(notice.lines).toContain('Wykonywane dalej (dokończą się): 1');
    // said even when nothing is in flight right now, because it is how pause works
    const quiet = describeControl('pause', { ...r.data, queue: { withdrawn: [], inFlight: [], requeued: [], refused: [] } }, 'pl');
    expect(quiet.lines.join(' ')).toContain('nie da się przerwać');
    expect(describeControl('pause', r.data, 'en').lines.join(' ')).toContain('cannot be interrupted — it finishes');
    // and the view shows it in the run row
    const snapshot = await loaded(cognitiveState(), RUNS);
    const html = renderToStaticMarkup(<FlightControlView {...viewProps(snapshot, { notices: { 'rr-1': notice } })} />);
    expect(html).toMatch(/data-testid="fc-notice-rr-1"[\s\S]*nie da się przerwać/);
  });

  it('a single job: cancel and read back go to the experiment-jobs routes', async () => {
    const cancelled = { ...FINISHED, jobId: 'job-rr-queued', state: 'CANCELLED', cancelReason: 'USER_REQUEST' };
    const calls = mockFetch({
      'POST /api/projects/p1/research-runs/rr-1/experiment-jobs/job-rr-queued/cancel': { body: { job: cancelled } },
      'GET /api/projects/p1/research-runs/rr-1/experiment-jobs/job-rr-done': { body: { job: FINISHED } },
    });
    const c = await cancelResearchRunJob('tok', 'p1', 'rr-1', 'job-rr-queued');
    const g = await getResearchRunJob('tok', 'p1', 'rr-1', 'job-rr-done');
    expect(calls.map((x) => `${x.method} ${x.url}`)).toEqual([
      'POST /api/projects/p1/research-runs/rr-1/experiment-jobs/job-rr-queued/cancel',
      'GET /api/projects/p1/research-runs/rr-1/experiment-jobs/job-rr-done',
    ]);
    if (!c.ok || !g.ok) throw new Error('job call failed');
    expect(describeJobCancel(c.data.job, 'pl').lines).toEqual(['Zadanie anulowane w kolejce.']);
    expect(g.data.job.state).toBe('DEAD_LETTER');
  });
});

describe('Backend errors are shown as they are', () => {
  it('a refused transition names the state the server reported, with the code under technical details', async () => {
    mockFetch({ 'POST /api/projects/p1/research-runs/rr-1/pause': { status: 409, body: { error: 'INVALID_CONTROL_TRANSITION', from: 'CANCELLED', action: 'PAUSE' } } });
    const r = await controlResearchRun('tok', 'p1', 'rr-1', 'pause');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const notice = describeFailure(r, 'pl');
    expect(notice.tone).toBe('bad');
    expect(notice.lines).toEqual(['Serwer odmówił: przebieg jest teraz w stanie „anulowany”.']);
    expect(notice.technical[0]).toContain('409 · INVALID_CONTROL_TRANSITION');
    const snapshot = await loaded(cognitiveState(), RUNS);
    const html = renderToStaticMarkup(<FlightControlView {...viewProps(snapshot, { notices: { 'rr-1': notice } })} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Serwer odmówił: przebieg jest teraz w stanie „anulowany”.');
    expect(html).toContain('INVALID_CONTROL_TRANSITION');
  });

  it('403 says the user lacks editor rights; offline says there is no connection', async () => {
    mockFetch({ 'POST /api/projects/p1/research-runs/rr-1/cancel': { status: 403, body: { error: 'forbidden' } } });
    const forbidden = await controlResearchRun('tok', 'p1', 'rr-1', 'cancel');
    if (forbidden.ok) throw new Error('expected a refusal');
    expect(describeFailure(forbidden, 'pl').lines[0]).toContain('nie masz w tym projekcie uprawnień edytora');

    mockFetch({ 'POST /api/projects/p1/research-runs/rr-1/resume': 'offline' });
    const offline = await controlResearchRun('tok', 'p1', 'rr-1', 'resume');
    if (offline.ok) throw new Error('expected offline');
    expect(describeFailure(offline, 'pl').lines).toEqual(['Brak połączenia z serwerem.']);
  });

  it('a failed cognitive-state load is a failure, not an empty screen; a failed run list is reported beside the rest', async () => {
    mockFetch({
      'GET /api/projects/p1/cognitive-state': { status: 500, body: { error: 'internal' } },
      'GET /api/projects/p1/research-runs': { body: { researchRuns: RUNS } },
    });
    const failed = await loadFlightControl('tok', 'p1');
    expect(failed.ok).toBe(false);
    if (failed.ok) return;
    const html = renderToStaticMarkup(<FlightControlView {...viewProps(null, { loadNotice: describeFailure(failed, 'pl') })} />);
    expect(html).toContain('Nie udało się pobrać stanu z serwera.');
    expect(html).toContain('500 · internal');
    expect(html).not.toContain('fc-summary');

    const partial = await loaded(cognitiveState(), { status: 503, body: { error: 'unavailable' } });
    const partialHtml = renderToStaticMarkup(<FlightControlView {...viewProps(partial)} />);
    expect(partialHtml).toContain('Lista przebiegów nie przyszła z serwera.');
    expect(partialHtml).toMatch(/data-testid="fc-sum-runs"><dt>przebiegi<\/dt><dd>—<\/dd>/);
    expect(partialHtml).toContain('CHEMBL941');
  });
});

describe('Flight Control is reachable', () => {
  it('the menu entry resolves to its own route', () => {
    expect(activeNavId('#/flight-control')).toBe('flight-control');
  });

  it('English follows the language switch', async () => {
    const snapshot = await loaded(cognitiveState(), RUNS);
    const html = renderToStaticMarkup(<FlightControlView {...viewProps(snapshot, { locale: 'en' })} />);
    expect(html).toContain('Research runs');
    expect(html).toContain('Job queue');
    expect(html).toContain('Technical details');
  });
});
