import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ResearchRunExperiment, ResearchRunView } from '../core/backend/client';
import {
  latestResult, noteLatestResult, rememberVerifyTarget, resetVerifyTargets, takeVerifyTarget, verifyHref, verifyTargetFromHash,
} from '../core/verifyTarget';
import { VerifyResultLink } from '../components/verify/VerifyResultLink';
import { VerifyView, type VerifyViewProps } from '../components/verify/VerifyView';
import { preselectExperiment, preselectProject, preselectRun } from '../components/verify/verifyModel';
import { RunDetail } from '../components/flightControl/FlightControlView';
import { runResearchRunAction, type ResearchRunClient } from '../core/scienceChat/researchRunTurn';
import { activeNavId } from '../core/navigation';

/**
 * "ZWERYFIKUJ TEN WYNIK / VERIFY THIS RESULT" — Flight Control experiment rows, the chat's research-run
 * answers and the Reviewer Room hand one executed experiment to Genesis Verify, which opens with the
 * project, run and experiment picked. The target travels as in-app state (survives a plain `#/verify`)
 * and as route params on the hash; Verify picks only ids the server lists.
 */

afterEach(() => { resetVerifyTargets(); vi.unstubAllGlobals(); });

const TARGET = { projectId: 'p1', researchRunId: 'rr-1', experimentId: 'x-1' };

describe('the handoff', () => {
  it('the link carries the ids as route params of #/verify, which the menu still recognises', () => {
    expect(verifyHref(TARGET)).toBe('#/verify?project=p1&run=rr-1&experiment=x-1');
    expect(verifyTargetFromHash(verifyHref(TARGET))).toEqual(TARGET);
    expect(verifyTargetFromHash('#/verify')).toBeNull();
    expect(verifyTargetFromHash('#/evidence?run=rr-1')).toBeNull();
    expect(activeNavId(verifyHref(TARGET))).toBe('verify');
  });

  it('in-app state wins over the hash, is consumed once, and a plain #/verify still gets it', () => {
    rememberVerifyTarget(TARGET);
    expect(takeVerifyTarget('#/verify')).toEqual(TARGET);
    expect(takeVerifyTarget('#/verify')).toBeNull();
    expect(takeVerifyTarget('#/verify?run=rr-2')).toEqual({ projectId: null, researchRunId: 'rr-2', experimentId: null });
    expect(latestResult()).toEqual(TARGET);
    noteLatestResult({ researchRunId: 'rr-9' });
    expect(latestResult()).toEqual({ researchRunId: 'rr-9' });
  });

  it('the router sends #/verify?… to the Verify screen', () => {
    const app = readFileSync(fileURLToPath(new URL('../App.tsx', import.meta.url)), 'utf8');
    expect(app).toContain(`if (h === '#/verify' || h.startsWith('#/verify?')) return { kind: 'verify' };`);
  });

  it('the link is a plain anchor with the PL and EN words', () => {
    const pl = renderToStaticMarkup(<VerifyResultLink target={TARGET} locale="pl" />);
    expect(pl).toContain('href="#/verify?project=p1&amp;run=rr-1&amp;experiment=x-1"');
    expect(pl).toContain('Zweryfikuj ten wynik');
    expect(renderToStaticMarkup(<VerifyResultLink target={TARGET} locale="en" />)).toContain('Verify this result');
  });
});

describe('Verify preselects only what the server lists', () => {
  it('project, run and experiment', () => {
    expect(preselectProject(['p0', 'p1'], TARGET, 'p0')).toBe('p1');
    expect(preselectProject(['p0'], TARGET, 'p0')).toBe('p0');
    expect(preselectProject(['p0', 'p2'], null, 'p2')).toBe('p2');
    expect(preselectProject([], TARGET, null)).toBeNull();
    expect(preselectRun(TARGET, [{ researchRunId: 'rr-1' }])).toBe('rr-1');
    expect(preselectRun(TARGET, [{ researchRunId: 'rr-other' }])).toBeNull();
    expect(preselectRun(null, [{ researchRunId: 'rr-1' }])).toBeNull();
    expect(preselectExperiment(TARGET, [{ experimentId: 'x-1' }])).toBe('x-1');
    expect(preselectExperiment(TARGET, [{ experimentId: 'x-2' }])).toBeNull();
  });

  it('the "from an executed experiment" section opens with the picked run and says why', () => {
    const props: VerifyViewProps = {
      locale: 'pl', projectBar: null, recordText: '', fileName: null, fileNotice: null, declaredSha: '', shaValid: null, busy: false, notice: null,
      result: null, reportUrl: null, reportFileName: null,
      exporter: {
        runs: { status: 'ready', value: [{ researchRunId: 'rr-1', question: 'Masa aspiryny?', status: 'RUNNING', nextStep: 'NONE', events: 3, createdAt: 1 }] },
        runId: 'rr-1', experiments: { status: 'ready', value: [{ experimentId: 'x-1', label: 'Poniżej 200 Da.', status: 'EXECUTED' }] }, experimentId: 'x-1',
        exporting: false, exportNotice: null, exported: null, exportedUrl: null, preselected: true,
        onRun: () => {}, onExperiment: () => {}, onGetRecord: () => {},
      },
      onRecordText: () => {}, onFile: () => {}, onSha: () => {}, onVerify: () => {}, onClear: () => {},
    };
    const html = renderToStaticMarkup(VerifyView(props));
    expect(html).toMatch(/<details class="vf-from-run" data-testid="vf-from-run" open="" data-preselected="true">/);
    expect(html).toContain('Wybrano wynik, który chcesz zweryfikować');
    expect(html).toMatch(/<option value="x-1" selected="">/);
    const closed = renderToStaticMarkup(VerifyView({ ...props, exporter: { ...props.exporter, preselected: false } }));
    expect(closed).not.toContain('open=""');
  });
});

const executed = (experimentId: string, done: boolean): ResearchRunExperiment => ({
  experimentId,
  frozen: { hypothesisId: 'H1', claim: `Claim ${experimentId}`, engineId: 'rdkit', input: {}, inputHash: 'ih', protocolId: 'p', predictionFingerprint: 'pf', preregistrationFingerprint: 'rf', criteria: [] },
  execution: done ? { status: 'EXECUTED', engine: { engineId: 'rdkit', engineLabel: 'RDKit', version: '2024.09.1' }, output: {}, inputHash: 'ih', outputHash: 'oh', scienceRunId: null, startedAt: 't0', finishedAt: 't1' } : null,
  falsification: null, evidence: null, next: null,
});

describe('Flight Control experiment rows', () => {
  it('an executed experiment links to Verify with its project, run and experiment; one not executed does not', () => {
    const view: ResearchRunView = {
      researchRunId: 'rr-1', question: 'Q', nextStep: 'AWAITING_EXECUTION', plan: null,
      experiments: [executed('x-1', true), executed('x-2', false)], researchState: { chain: { ok: true }, events: [] },
    };
    const html = renderToStaticMarkup(<RunDetail state={{ status: 'ready', view }} locale="pl" projectId="p1" />);
    expect(html).toContain('data-testid="fc-verify-x-1"');
    expect(html).toContain('href="#/verify?project=p1&amp;run=rr-1&amp;experiment=x-1"');
    expect(html).not.toContain('data-testid="fc-verify-x-2"');
    expect(html).toContain('Zweryfikuj ten wynik');
    expect(renderToStaticMarkup(<RunDetail state={{ status: 'ready', view }} locale="en" projectId="p1" />)).toContain('Verify this result');
  });
});

describe('the Reviewer Room', () => {
  it('offers to verify the latest result of this visit, or opens Verify on its picker when there is none', async () => {
    vi.stubGlobal('window', { location: { hash: '#/reviewer' }, localStorage: { getItem: () => null, setItem: () => {} }, addEventListener: () => {}, removeEventListener: () => {} });
    const { ReviewerRoomScreen } = await import('../components/ReviewerRoomScreen');
    const none = renderToStaticMarkup(<ReviewerRoomScreen />);
    expect(none).toContain('data-testid="rv-verify-none"');
    expect(none).toContain('href="#/verify"');
    noteLatestResult(TARGET);
    const html = renderToStaticMarkup(<ReviewerRoomScreen />);
    expect(html).toContain('data-testid="rv-verify-this-result"');
    expect(html).toContain('Verify this result');
    expect(html).toContain('href="#/verify?project=p1&amp;run=rr-1&amp;experiment=x-1"');
  }, 30_000);
});

describe('the chat research-run answer', () => {
  const ok = <T,>(data: T) => ({ ok: true as const, data });
  const run = (experiments: ResearchRunExperiment[]): ResearchRunView => ({ researchRunId: 'run-1', question: 'Q', plan: { hypotheses: [] }, experiments, nextStep: 'AWAITING_EXECUTION', researchState: { chain: { ok: true }, events: [] } });
  const client = (x: ResearchRunExperiment): ResearchRunClient => ({
    startResearchRun: async () => ok({ deduped: false, researchRun: run([]) }),
    proposeResearchPlan: async () => ok({ deduped: false, researchRun: run([]) }),
    executeResearchExperiment: async () => ok({ status: 'EXECUTED' as const, deduped: false, experimentId: x.experimentId, experiment: x, researchRun: run([x]) }),
  } as unknown as ResearchRunClient);

  it('carries the Verify target of the executed experiment, and none when nothing was executed', async () => {
    const done = await runResearchRunAction({ type: 'researchRun', op: 'start', question: 'Q' }, { token: 't', projectId: 'p1', researchRunId: null }, client(executed('exp-1', true)));
    expect(done.verify).toEqual({ projectId: 'p1', researchRunId: 'run-1', experimentId: 'exp-1' });
    const notDone = await runResearchRunAction({ type: 'researchRun', op: 'start', question: 'Q' }, { token: 't', projectId: 'p1', researchRunId: null }, client(executed('exp-2', false)));
    expect(notDone.verify).toBeUndefined();
  });
});
