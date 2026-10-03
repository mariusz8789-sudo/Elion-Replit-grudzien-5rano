import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { exportResearchRunRecord, runGenesisVerify, type GenesisVerifyReport, type ResearchRunExperiment } from '../core/backend/client';
import { clearSession } from '../core/backend/session';
import { activeNavId, NAV_ITEMS, NAV_SECTIONS, navVariants } from '../core/navigation';
import { navDescription, navLabel } from '../core/navigationText';
import { buildDestinationIndex, buildGoalIndex, filterSearchIndex } from '../core/search';
import { VerifyScreen } from '../components/VerifyScreen';
import { VerifyView, type VerifyViewProps } from '../components/verify/VerifyView';
import {
  describeVerifyFailure, downloadBlob, explainReport, exportableExperiments, normaliseSha256, readRecordFile, reportFileName, sha256State,
} from '../components/verify/verifyModel';
import * as verifyText from '../components/verify/verifyText';
import { REPO_ROOT } from './fixtures/repoPaths';

/**
 * #/verify — Genesis Verify for a customer. No DOM environment, so the screen is split: the API client runs
 * against a mocked fetch, the model turns the server's report into plain words, and the pure view renders
 * with renderToStaticMarkup. The reports are produced by the backend's own verifySubmittedRecord, so the
 * fixtures have exactly the shape POST /genesis-verify returns. (The real RDKit MATCH path is proven in
 * packages/backend/src/genesisVerify.test.mjs, end to end through the export route.)
 */

type Backend = {
  verifySubmittedRecord: (submission: unknown, opts?: Record<string, unknown>) => GenesisVerifyReport;
  renderVerifyReportHtml: (report: GenesisVerifyReport) => string;
};
type Determinism = { canonicalJson: (v: unknown) => string; sha256Hex: (v: unknown) => string };
let backend: Backend;
let det: Determinism;

beforeAll(async () => {
  backend = await import(pathToFileURL(path.resolve(REPO_ROOT, 'packages/backend/src/genesisVerify.mjs')).href) as Backend;
  det = await import(pathToFileURL(path.resolve(REPO_ROOT, 'packages/backend/src/determinism.mjs')).href) as Determinism;
});

afterEach(() => { clearSession(); vi.unstubAllGlobals(); });

/** Engine product names: allowed only inside the collapsed technical details. */
const ENGINE_NAMES = /rdkit|autodock|\bvina\b|gnina|pyscf|openmm|admet-ai/i;

/** A complete, self-consistent record shaped like researchRunArtifacts.buildExecutionBundle writes it. */
function record(engineId: string, status: string, overrides: Record<string, unknown> = {}) {
  const input = { smiles: 'CC(=O)Oc1ccccc1C(=O)O' };
  const output = { molWt: 180.159 };
  return {
    kind: 'genesis-research-run-execution-bundle/v1', researchRunId: 'rr-1', experimentId: 'x-1',
    predictionFingerprint: 'a'.repeat(64), preregistrationFingerprint: 'b'.repeat(64),
    engine: { engineId, engineLabel: `${engineId === 'rdkit' ? 'RDKit' : 'GNINA'} 2024.03` }, status,
    input, inputHash: det.sha256Hex(det.canonicalJson(input)), output, outputHash: det.sha256Hex(det.canonicalJson(output)),
    ...overrides,
  };
}

const text = (r: Record<string, unknown>) => det.canonicalJson(r);

/** The interface's own visible words: collapsed technical details and the customer's pasted record removed. */
const visible = (html: string) => html.replace(/<details class="vf-tech"[\s\S]*?<\/details>/g, '').replace(/<textarea[\s\S]*?<\/textarea>/g, '');

function viewProps(extra: Partial<VerifyViewProps> = {}): VerifyViewProps {
  return {
    locale: 'pl', projectBar: null, recordText: '', fileName: null, fileNotice: null, declaredSha: '', shaValid: null, busy: false, notice: null,
    result: null, reportUrl: null, reportFileName: null,
    exporter: {
      runs: { status: 'ready', value: [] }, runId: '', experiments: { status: 'idle' }, experimentId: '', exporting: false, exportNotice: null,
      exported: null, exportedUrl: null, onRun: () => {}, onExperiment: () => {}, onGetRecord: () => {},
    },
    onRecordText: () => {}, onFile: () => {}, onSha: () => {}, onVerify: () => {}, onClear: () => {},
    ...extra,
  };
}

interface Call { url: string; method: string; auth: string | null; body: unknown }
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

describe('the model reads the server report and says it plainly', () => {
  it('BLOCKED: unknown engine; the plain text names no engine, the technical rows keep the server sentence', () => {
    const report = backend.verifySubmittedRecord(text(record('gnina', 'EXECUTED')));
    expect(report.verdict).toBe('BLOCKED');
    for (const locale of ['pl', 'en'] as const) {
      const view = explainReport(report, locale);
      expect(view.verdict).toBe('BLOCKED');
      expect(view.tone).toBe('idle');
      expect(view.unsigned).toBe(true);
      expect(view.checks.map((c) => c.id)).toEqual(['readable', 'file-hash', 'provenance', 'content-hash', 'ledger-anchor', 'replay']);
      const replay = view.checks.find((c) => c.id === 'replay')!;
      expect(replay.status).toBe('NOT_RUN');
      expect(replay.plain).toBe(verifyText.checkExplain('replay', 'UNKNOWN_ENGINE', locale));
      expect(replay.technical).toMatch(/gnina/);
      const shown = [view.verdictWord, view.meaning, view.replayed ?? '', ...view.checks.flatMap((c) => [c.title, c.statusWord, c.plain]), ...view.notChecked].join('\n');
      expect(shown).not.toMatch(ENGINE_NAMES);
      expect(view.technical.join('\n')).toMatch(/engine: gnina GNINA 2024\.03/);
      // No anchor was consulted, so the honest "would only show as DRIFT" line is there.
      expect(view.notChecked).toContain(verifyText.pairText(verifyText.NOT_CHECKED_TEXT.noAnchor, locale));
    }
    expect(explainReport(report, 'pl').meaning).not.toBe(explainReport(report, 'en').meaning);
  });

  it('TAMPERED: an edited output with stale hashes and a wrong declared sha256', () => {
    const r = record('rdkit', 'EXECUTED');
    const edited = text({ ...r, output: { molWt: 150 } });
    const report = backend.verifySubmittedRecord(edited, { declaredSha256: det.sha256Hex(text(r)) });
    expect(report.verdict).toBe('TAMPERED');
    const view = explainReport(report, 'en');
    expect(view.tone).toBe('bad');
    expect(view.verdictWord).toBe('TAMPERED');
    const by = Object.fromEntries(view.checks.map((c) => [c.id, c]));
    expect(by['file-hash']!.status).toBe('FAIL');
    expect(by['file-hash']!.plain).toBe(verifyText.checkExplain('file-hash', 'FILE_HASH_MISMATCH', 'en'));
    expect(by['content-hash']!.status).toBe('FAIL');
    expect(by.replay!.status).toBe('NOT_RUN');
    expect(by.replay!.plain).toBe(verifyText.checkExplain('replay', 'NOT_RUN', 'en'));
  });

  it('BLOCKED for unreadable input, missing provenance, a non-executed experiment and a bad declared hash', () => {
    const garbage = explainReport(backend.verifySubmittedRecord('not json'), 'pl');
    expect(garbage.checks[0]!.plain).toBe(verifyText.checkExplain('readable', 'NOT_JSON', 'pl'));
    const missing = explainReport(backend.verifySubmittedRecord(text({ ...record('rdkit', 'EXECUTED'), engine: undefined })), 'en');
    expect(missing.checks.find((c) => c.id === 'provenance')!.status).toBe('FAIL');
    expect(missing.checks.find((c) => c.id === 'provenance')!.technical).toMatch(/engine\.engineId/);
    const notRun = explainReport(backend.verifySubmittedRecord(text(record('rdkit', 'BLOCKED_BY_RUNTIME'))), 'en');
    expect(notRun.verdict).toBe('BLOCKED');
    expect(notRun.checks.find((c) => c.id === 'replay')!.plain).toBe(verifyText.checkExplain('replay', 'NOT_AN_EXECUTED_EXPERIMENT', 'en'));
    const badHash = explainReport(backend.verifySubmittedRecord('{}', { declaredSha256: 'xyz' }), 'en');
    expect(badHash.checks.find((c) => c.id === 'file-hash')!.plain).toBe(verifyText.checkExplain('file-hash', 'DECLARED_SHA256_INVALID', 'en'));
  });

  it('MATCH: the replayed capability is named as a capability; every passed check reads as passed', () => {
    // The real RDKit MATCH runs in the backend test; here the BLOCKED report's replay is turned into the MATCH the server would send.
    const base = backend.verifySubmittedRecord(text(record('rdkit', 'BLOCKED_BY_RUNTIME')));
    const match: GenesisVerifyReport = {
      ...base, verdict: 'MATCH', reasons: [],
      checks: base.checks.map((c) => ({ ...c, status: c.id === 'file-hash' || c.id === 'ledger-anchor' ? c.status : 'PASS' })),
      replay: { capability: 'molecular-descriptors', replayEngineVersion: 'RDKit 2024.03', hashMatch: true, maxRelativeDiff: 0, tolerance: 1e-9 },
    };
    const view = explainReport(match, 'pl');
    expect(view.tone).toBe('good');
    expect(view.verdictWord).toBe(verifyText.verdictWord('MATCH', 'pl'));
    expect(view.replayed).toBe(verifyText.pairText(verifyText.CAPABILITY_TEXT['molecular-descriptors']!, 'pl'));
    expect(view.checks.find((c) => c.id === 'replay')!.plain).toBe(verifyText.checkExplain('replay', 'PASS', 'pl'));
    expect(view.technical.join('\n')).toMatch(/replay\.engineVersion: RDKit/);
  });
});

describe('the view', () => {
  it('renders verdict, six checks, what was not checked, the UNSIGNED notice and Blob download links; engines only in details', () => {
    const report = backend.verifySubmittedRecord(text(record('gnina', 'EXECUTED')), { declaredSha256: 'c'.repeat(64) });
    for (const locale of ['pl', 'en'] as const) {
      const html = renderToStaticMarkup(VerifyView(viewProps({
        locale, recordText: text(record('gnina', 'EXECUTED')), result: explainReport(report, locale),
        reportUrl: 'blob:http://localhost/abc', reportFileName: reportFileName(report),
      })));
      expect(html).toContain(`data-verdict="${report.verdict}"`);
      for (const id of ['readable', 'file-hash', 'provenance', 'content-hash', 'ledger-anchor', 'replay']) expect(html).toContain(`data-testid="vf-check-${id}"`);
      expect(html).toContain(verifyText.vText('unsignedTitle', locale));
      expect(html).toMatch(/<a class="vf-btn" href="blob:http:\/\/localhost\/abc" download="genesis-verify-tampered-[a-f0-9]{12}\.html"/);
      expect(html).toContain('target="_blank" rel="noopener noreferrer"');
      expect(html).toMatch(/gnina/i);
      expect(visible(html)).not.toMatch(ENGINE_NAMES);
      expect(visible(html)).not.toMatch(/\bsigned\b|validated|zwalidowan|podpisan/i);
    }
  });

  it('disables Verify until there is a record and the optional hash is valid, and says why', () => {
    const empty = renderToStaticMarkup(VerifyView(viewProps()));
    expect(empty).toMatch(/<button type="submit" class="vf-btn" disabled=""/);
    expect(empty).toContain(verifyText.vText('needRecord', 'pl'));
    const badSha = renderToStaticMarkup(VerifyView(viewProps({ locale: 'en', recordText: '{}', declaredSha: 'xyz', shaValid: false })));
    expect(badSha).toContain(verifyText.vText('shaInvalid', 'en'));
    expect(badSha).toContain('aria-invalid="true"');
    expect(badSha).toMatch(/<button type="submit" class="vf-btn" disabled=""/);
    const ready = renderToStaticMarkup(VerifyView(viewProps({ recordText: '{}' })));
    expect(ready).not.toMatch(/<button type="submit" class="vf-btn" disabled=""/);
    expect(ready).toContain('type="file"');
    expect(ready).toContain('accept="application/json,.json"');
  });

  it('the exporter lists runs and executed experiments by claim, and offers the exported file as a download', () => {
    const html = renderToStaticMarkup(VerifyView(viewProps({
      locale: 'en',
      exporter: {
        runs: { status: 'ready', value: [{ researchRunId: 'rr-1', question: 'Aspirin molecular weight?', status: 'RUNNING', nextStep: 'NONE', events: 9, createdAt: 1 }] },
        runId: 'rr-1', experiments: { status: 'ready', value: [{ experimentId: 'x-1', label: 'Aspirin is below 200 Da.', status: 'EXECUTED' }] }, experimentId: 'x-1',
        exporting: false, exportNotice: null,
        exported: { researchRunId: 'rr-1', experimentId: 'x-1', fileName: 'genesis-record-rr-1-x-1.json', mimeType: 'application/json', record: '{}', sha256: 'd'.repeat(64), size: 2, custody: { status: 'VERIFIED', artifactRef: { sha256: 'd'.repeat(64), size: 2 } } },
        exportedUrl: 'blob:http://localhost/rec', onRun: () => {}, onExperiment: () => {}, onGetRecord: () => {},
      },
    })));
    expect(html).toContain('Aspirin molecular weight?');
    expect(html).toContain('Aspirin is below 200 Da.');
    expect(html).toContain('href="blob:http://localhost/rec" download="genesis-record-rr-1-x-1.json"');
    expect(html).toContain(verifyText.vText('custodyVerified', 'en'));
    const none = renderToStaticMarkup(VerifyView(viewProps({ locale: 'en', exporter: { ...viewProps().exporter, runs: { status: 'ready', value: [] } } })));
    expect(none).toContain(verifyText.vText('noRuns', 'en'));
  });

  it('signed out, the screen asks to sign in and calls nothing', () => {
    const calls = mockFetch({});
    const html = renderToStaticMarkup(<VerifyScreen />);
    expect(html).toContain('data-testid="vf-signed-out"');
    expect(html).toContain('href="#/konto"');
    expect(html).toContain('data-testid="vf-unsigned"');
    expect(calls).toEqual([]);
  });
});

describe('API client', () => {
  it('POST /genesis-verify sends the record text, the trimmed hash and format=html with the bearer token', async () => {
    const report = backend.verifySubmittedRecord('{}');
    const calls = mockFetch({ 'POST /api/projects/p1/genesis-verify': { body: { report, html: backend.renderVerifyReportHtml(report) } } });
    const r = await runGenesisVerify('tok', 'p1', { record: '{"a":1}', declaredSha256: 'e'.repeat(64), format: 'html' });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.data.report.verdict).toBe('BLOCKED'); expect(r.data.html).toMatch(/UNSIGNED/); }
    expect(calls[0]).toEqual({ url: '/api/projects/p1/genesis-verify', method: 'POST', auth: 'Bearer tok', body: { record: '{"a":1}', declaredSha256: 'e'.repeat(64), format: 'html' } });
    await runGenesisVerify('tok', 'p1', { record: '{}', declaredSha256: null });
    expect(calls[1]!.body).toEqual({ record: '{}' });
  });

  it('GET the record export with encoded ids; failures read plainly', async () => {
    const calls = mockFetch({
      'GET /api/projects/p1/research-runs/rr%2F1/experiments/x%201/record': { body: { fileName: 'f.json', record: '{}', sha256: 'f'.repeat(64) } },
      'GET /api/projects/p1/research-runs/rr/experiments/x/record': { status: 409, body: { error: 'NOT_EXECUTED' } },
    });
    const ok = await exportResearchRunRecord('tok', 'p1', 'rr/1', 'x 1');
    expect(ok.ok).toBe(true);
    expect(calls[0]!.method).toBe('GET');
    const bad = await exportResearchRunRecord('tok', 'p1', 'rr', 'x');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(describeVerifyFailure(bad, 'en').lines).toEqual([verifyText.vText('exportNotExecuted', 'en')]);
  });

  it('maps transport and admission failures to plain sentences, keeping the code in the technical rows', () => {
    const f = (status: number, error: string) => describeVerifyFailure({ ok: false, status, error, message: 'm' }, 'pl');
    expect(f(0, 'offline').lines[0]).toBe(verifyText.vText('errOffline', 'pl'));
    expect(f(401, 'unauthorized').lines[0]).toBe(verifyText.vText('errSignedOut', 'pl'));
    expect(f(403, 'forbidden').lines[0]).toBe(verifyText.vText('errForbidden', 'pl'));
    expect(f(503, 'compute_busy').lines[0]).toBe(verifyText.vText('errBusy', 'pl'));
    expect(f(429, 'compute_rate_limited').lines[0]).toBe(verifyText.vText('errRateLimited', 'pl'));
    expect(f(413, 'payload_too_large').lines[0]).toBe(verifyText.vText('errTooLarge', 'pl'));
    expect(f(500, 'boom').lines[0]).toBe(verifyText.vText('errOther', 'pl'));
    expect(f(500, 'boom').technical[0]).toContain('500 boom');
  });
});

describe('helpers', () => {
  it('sha256 field: empty is optional, 64 hex (any case, padded) is valid, anything else is not', () => {
    expect(sha256State('')).toBeNull();
    expect(sha256State(`  ${'A'.repeat(64)} `)).toBe(true);
    expect(normaliseSha256(` ${'A'.repeat(64)}`)).toBe('a'.repeat(64));
    expect(sha256State('abc')).toBe(false);
    expect(sha256State('g'.repeat(64))).toBe(false);
  });

  it('only executed experiments are exportable, labelled by their frozen claim', () => {
    const x = (id: string, executed: boolean, claim: string | null): ResearchRunExperiment => ({
      experimentId: id, frozen: claim ? { hypothesisId: 'H', claim, engineId: 'rdkit', input: {}, inputHash: '', protocolId: '', predictionFingerprint: '', preregistrationFingerprint: '', criteria: [] } : null,
      execution: executed ? { status: 'EXECUTED', engine: { engineId: 'rdkit', engineLabel: null, version: null }, output: {}, inputHash: '', outputHash: '', scienceRunId: null, startedAt: '', finishedAt: '' } : null,
      falsification: null, evidence: null, next: null,
    });
    expect(exportableExperiments([x('a', true, 'Claim A'), x('b', false, 'Claim B'), x('c', true, null)])).toEqual([
      { experimentId: 'a', label: 'Claim A', status: 'EXECUTED' }, { experimentId: 'c', label: 'c', status: 'EXECUTED' },
    ]);
  });

  it('reads an uploaded file as text and builds a typed Blob for downloads', async () => {
    expect(await readRecordFile(new Blob(['{"k":"ż"}'], { type: 'application/json' }))).toBe('{"k":"ż"}');
    const blob = downloadBlob('<p>x</p>', 'text/html');
    expect(blob.type).toBe('text/html;charset=utf-8');
    expect(await blob.text()).toBe('<p>x</p>');
  });

  it('no customer sentence names an engine product or claims a signature or validation', () => {
    const all: string[] = [];
    const walk = (v: unknown) => { if (typeof v === 'string') all.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
    walk([verifyText.VERDICT_TEXT, verifyText.STATUS_TEXT, verifyText.CHECK_TITLE, verifyText.CAPABILITY_TEXT, verifyText.NOT_CHECKED_TEXT]);
    for (const key of ['title', 'lead', 'unsignedTitle', 'unsignedBody', 'reportLead', 'verify', 'fromRunLead'] as const) all.push(verifyText.vText(key, 'pl'), verifyText.vText(key, 'en'));
    for (const id of ['readable', 'file-hash', 'provenance', 'content-hash', 'ledger-anchor', 'replay']) {
      for (const code of ['PASS', 'FAIL', 'NOT_RUN', ...(verifyText.CHECK_REASONS[id] ?? [])]) {
        for (const locale of ['pl', 'en'] as const) { const s = verifyText.checkExplain(id, code, locale); if (s) all.push(s); }
      }
    }
    expect(all.length).toBeGreaterThan(50);
    for (const s of all) {
      expect(s).not.toMatch(ENGINE_NAMES);
      expect(s).not.toMatch(/\bsigned\b|validated|zwalidowan|podpisan/i);
    }
  });
});

describe('navigation and search reach #/verify', () => {
  it('one menu entry, a place of its own in the Proof group, with an English label', () => {
    expect(activeNavId('#/verify')).toBe('verify');
    const item = NAV_ITEMS.find((i) => i.id === 'verify')!;
    expect(NAV_SECTIONS.find((s) => s.id === 'proof')!.items).toContain(item);
    expect(navVariants('memory')).not.toContain(item);
    expect(navLabel(item, 'en')).toBe('Genesis Verify');
    expect(navDescription(item, 'en')).toMatch(/replay/);
  });

  it('search finds it by goal and by destination, in Polish and English words', () => {
    expect(filterSearchIndex(buildGoalIndex(), 'verify').map((e) => e.hash)).toContain('#/verify');
    expect(filterSearchIndex(buildDestinationIndex(), 'weryfikacja').map((e) => e.hash)).toEqual(['#/verify']);
    expect(filterSearchIndex(buildDestinationIndex(), 'sha256').map((e) => e.hash)).toEqual(['#/verify']);
  });
});
