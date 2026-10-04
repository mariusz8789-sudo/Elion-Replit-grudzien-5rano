import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  compareLabObservation, getCustomerDelivery, getLabLoop, getLabPackage, getResearchRunEvidencePack, ingestLabObservation, prepareLabRequest, proposeLabEvidence,
  reviewLabObservation, verifyLabPackage,
  type LabComparison, type LabLoopState, type LabObservation, type LabRequest, type ResearchRunExperiment, type ResearchRunView,
} from '../core/backend/client';
import { clearSession } from '../core/backend/session';
import { ENGINE_NAME_PATTERN, TECHNICAL_DETAILS_ATTR } from '../core/capabilityNames';
import { activeNavId, NAV_SECTIONS } from '../core/navigation';
import { navDescription, navLabel, TRANSLATED_NAV_IDS } from '../core/navigationText';
import { buildDestinationIndex, buildGoalIndex, filterSearchIndex } from '../core/search';
import {
  buildObservation, buildRequestBody, bytesToBase64, comparisonView, describeLabFailure, describePackageVerification, emptyObservationForm, experimentRows,
  labEligibility, numericOutputs, observationStages, packageFileName, parseMeasuredValue, parseNonNegative, EMPTY_REQUEST_FORM, type ApiFailure,
} from '../components/labHandoff/labHandoffModel';
import { ExperimentsStep, HonestNotice, ObservationStep, PackageStep, RequestStep, ResultsStep } from '../components/labHandoff/LabHandoffView';
import { lText } from '../components/labHandoff/labHandoffText';
import { deliverablesOf, deliveryView, describeReportsFailure, evidencePackFileName, verifyReportFileName } from '../components/reports/reportsModel';
import { ReportsList, ReportsUnsigned } from '../components/reports/ReportsView';
import { rText } from '../components/reports/reportsText';

/**
 * DELIVER: #/lab-handoff and #/reports. No DOM environment, so each screen is split: the API client runs
 * against a mocked fetch, the model turns the server's codes into words, and the pure views render with
 * renderToStaticMarkup. The real path (real backend, real RDKit, real browser) is
 * scripts/lab-handoff-ui-proof.mjs; the backend gates themselves are proven in
 * packages/backend/src/researchRunLab.e2e.test.mjs.
 */

afterEach(() => { clearSession(); vi.unstubAllGlobals(); });

const LOCALES = ['pl', 'en'] as const;
/** What a person reads: every `data-technical-details` section removed, tags stripped, accessible attributes kept. */
function customerText(html: string): string {
  const open = new RegExp(`<(details|section|div)\\b[^>]*\\b${TECHNICAL_DETAILS_ATTR}\\b[^>]*>`, 'g');
  let out = html;
  for (let m = open.exec(out); m !== null; m = open.exec(out)) {
    const end = out.indexOf(`</${m[1]}>`, m.index);
    out = out.slice(0, m.index) + out.slice(end + m[1]!.length + 3);
    open.lastIndex = m.index;
  }
  const attributes = [...out.matchAll(/\b(?:title|aria-label|placeholder|alt)="([^"]*)"/g)].map((x) => x[1]);
  return `${out.replace(/<[^>]*>/g, ' ')} ${attributes.join(' ')}`;
}
/** A claim of a signature or a validation that does not exist (UNSIGNED / NIEPODPISANA never match: no word boundary). */
const SIGNED_CLAIM = /\b(signed|certified|validated|podpisan[aey]?|certyfikowan|zwalidowan)\b/i;

/* ---------------- fixtures shaped like the server's own answers ---------------- */

function experiment(id: string, over: Partial<ResearchRunExperiment> = {}): ResearchRunExperiment {
  return {
    experimentId: id,
    frozen: { hypothesisId: `h-${id}`, claim: `Claim ${id}`, engineId: 'rdkit', input: { smiles: 'CCO' }, inputHash: 'i'.repeat(64), protocolId: 'p', predictionFingerprint: 'a'.repeat(64), preregistrationFingerprint: 'b'.repeat(64), criteria: [] },
    execution: { status: 'EXECUTED', engine: { engineId: 'rdkit', engineLabel: 'RDKit', version: '2026.03' }, output: { molWt: 180.159, crippenLogP: 1.31, formula: 'C9H8O4' }, inputHash: 'i'.repeat(64), outputHash: 'o'.repeat(64), scienceRunId: 'sr', startedAt: '', finishedAt: '' },
    falsification: { verdict: 'SUPPORTED_WITHIN_PROTOCOL', scope: 's', criteria: [] },
    evidence: { evidenceProposalId: `ev-${id}`, status: 'PROPOSED', publication: 'REQUIRES_HUMAN_APPROVAL' },
    next: { replay: { verdict: 'MATCH' }, proposal: { action: 'HUMAN_REVIEW', reason: 'r' }, decidedBy: 'rule' },
    ...over,
  };
}

const request: LabRequest = {
  requestId: 'LABREQ-1', requestFingerprint: '1', researchRunId: 'rr', experimentId: 'x1', candidateRef: 'research-run:rr:x1', candidateInput: { smiles: 'CCO' },
  objective: 'o', endpoint: { endpointId: 'measured-logp', assay: 'logP, external measurement', expectedUnit: 'log10', tolerance: { absolute: 0.5, relative: null }, comparisonOutputKey: 'crippenLogP' },
  modelBinding: { outputKey: 'crippenLogP', modelValue: 1.31, unit: 'log10', outputHash: 'o'.repeat(64), inputHash: 'i'.repeat(64), scienceRunId: 'sr', predictionFingerprint: 'a', preregistrationFingerprint: 'b' },
  computationalEvidence: { evidenceProposalId: 'ev-x1', evidenceStatus: 'PROPOSED', replayVerdict: 'MATCH', protocolVerdict: 'SUPPORTED_WITHIN_PROTOCOL' },
  externalProvider: { providerId: 'fixture-lab', providerType: 'ACADEMIC_LAB' }, requestedBy: 'u-owner', status: 'READY_FOR_EXTERNAL_LAB_REVIEW', requiresHumanApproval: true,
  executionAuthority: 'EXTERNAL_LAB_ONLY', labels: { modelValue: 'GENESIS COMPUTATION', labResult: 'REAL MEASUREMENT' }, claimBoundary: 'boundary',
};

function observation(over: Partial<LabObservation> = {}): LabObservation {
  return {
    observationId: 'LABOBS-1', observationFingerprint: '1', requestId: 'LABREQ-1', endpointId: 'measured-logp', value: 1.19, unit: 'log10', observedAt: '2026-10-03T10:00:00.000Z',
    methodReference: 'M-1', rawArtifactSha256: 'f'.repeat(64), rawArtifactIntegrity: { level: 'VERIFIED_BY_GENESIS', byteLength: 10, limitation: 'bytes only' },
    source: { labId: 'fixture-lab', providerType: 'ACADEMIC_LAB', externalObservationId: 'OBS-1', sourceUri: 'https://lab.example.test/1' },
    quality: { status: 'QC_PASSED', confidence: 0.5, notes: null }, ingestedBy: 'u-owner', status: 'INGESTED_UNREVIEWED', evidenceClass: 'REAL MEASUREMENT', clinicalEfficacy: 'UNKNOWN',
    review: null, ...over,
  };
}

const comparison: LabComparison = {
  comparisonId: 'LABCMP-1', requestId: 'LABREQ-1', observationId: 'LABOBS-1', experimentId: 'x1', endpointId: 'measured-logp', outputKey: 'crippenLogP',
  model: { label: 'GENESIS COMPUTATION', value: 1.31, outputHash: 'o'.repeat(64) }, measurement: { label: 'REAL MEASUREMENT', value: 1.19, observationId: 'LABOBS-1' },
  unit: 'log10', delta: -0.12, deltaAbs: 0.12, deltaRel: 0.09, toleranceChecks: [{ kind: 'absolute', threshold: 0.5, actual: 0.12, pass: true }],
  verdict: 'AGREES_WITHIN_TOLERANCE', clinicalEfficacy: 'UNKNOWN', claimBoundary: 'boundary',
};

function lab(over: Partial<LabLoopState> = {}): LabLoopState {
  return { researchRunId: 'rr', requests: [request], observations: [], comparisons: [], evidenceLinks: [], nextResearchAction: { action: 'AWAIT_EXTERNAL_OBSERVATION' }, clinicalEfficacy: 'UNKNOWN', claimBoundary: 'boundary', labFingerprint: 'lf', ...over };
}

const failure = (status: number, error: string, reason: string | null = null): ApiFailure => ({ ok: false, status, error, message: '', responseBody: { error, reason } });

/* ---------------- client ---------------- */

describe('lab and deliverable client calls hit the backend routes', () => {
  it('every call uses the route, method and body api.mjs serves', async () => {
    const calls: Array<{ url: string; method: string; body: unknown; auth: string | null }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, method: String(init.method), body: init.body ? JSON.parse(String(init.body)) : undefined, auth: (init.headers as Record<string, string>).authorization ?? null });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));
    const endpoint = { endpointId: 'e', assay: 'a', outputKey: 'k', expectedUnit: 'u', tolerance: { absolute: 1 } };
    await getLabLoop('t', 'p', 'r/1');
    await prepareLabRequest('t', 'p', 'r/1', { experimentId: 'x', endpoint });
    await getLabPackage('t', 'p', 'r/1', 'LABREQ-1');
    await verifyLabPackage('t', 'p', 'r/1', { kind: 'K' });
    await ingestLabObservation('t', 'p', 'r/1', 'LABREQ-1', { ...buildObservationFixture() });
    await reviewLabObservation('t', 'p', 'r/1', 'LABOBS-1', 'ACCEPTED_AS_OBSERVATION', 'checked');
    await compareLabObservation('t', 'p', 'r/1', 'LABOBS-1');
    await proposeLabEvidence('t', 'p', 'r/1', 'LABOBS-1');
    await getResearchRunEvidencePack('t', 'p', 'r/1');
    await getCustomerDelivery('t', 'p', 'r/1');
    const base = '/api/projects/p/research-runs/r%2F1';
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `GET ${base}/lab`, `POST ${base}/lab/requests`, `GET ${base}/lab/requests/LABREQ-1/package`, `POST ${base}/lab/package`, `POST ${base}/lab/observations`,
      `POST ${base}/lab/observations/LABOBS-1`, `POST ${base}/lab/observations/LABOBS-1/compare`, `POST ${base}/lab/observations/LABOBS-1/evidence`,
      `GET ${base}/evidence-pack`, `POST ${base}/customer-delivery`,
    ]);
    expect(calls.every((c) => c.auth === 'Bearer t')).toBe(true);
    expect(calls[1]!.body).toEqual({ experimentId: 'x', endpoint });
    expect(calls[3]!.body).toEqual({ package: { kind: 'K' } });
    expect((calls[4]!.body as { requestId: string }).requestId).toBe('LABREQ-1');
    // The reviewer is the signed-in person: no reviewer name is ever sent.
    expect(calls[5]!.body).toEqual({ verdict: 'ACCEPTED_AS_OBSERVATION', note: 'checked' });
    expect(calls[9]!.body).toEqual({ includeExportArtifact: true });
  });

  it('a refusal keeps the server code and reason for the screen', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'REVIEWER_CANNOT_BE_INGESTER', reason: null }), { status: 409 })));
    const r = await reviewLabObservation('t', 'p', 'r', 'o', 'ACCEPTED_AS_OBSERVATION');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe('REVIEWER_CANNOT_BE_INGESTER');
      expect(describeLabFailure(r, 'en').lines[0]).toMatch(/cannot review it/);
    }
  });
});

function buildObservationFixture() {
  const draft = buildObservation(request, { ...emptyObservationForm(request), value: '1.19', observedAt: '2026-10-03T10:00', methodReference: 'M', externalObservationId: 'OBS-1', sourceUri: 'https://x' }, 'AAAA');
  if (!draft.ok) throw new Error('fixture');
  return draft.observation;
}

/* ---------------- model ---------------- */

describe('which experiments may go to a laboratory, and why not', () => {
  it('only SUPPORTED + replay MATCH + Evidence PROPOSED is eligible; each other case names the server gate', () => {
    expect(labEligibility(experiment('ok'))).toEqual({ eligible: true });
    expect(labEligibility(experiment('f', { falsification: { verdict: 'FALSIFIED_WITHIN_PROTOCOL', scope: '', criteria: [] } }))).toEqual({ eligible: false, reason: 'NOT_SUPPORTED_WITHIN_PROTOCOL' });
    expect(labEligibility(experiment('d', { next: { replay: { verdict: 'DRIFT' }, proposal: { action: 'HUMAN_REVIEW', reason: '' }, decidedBy: '' } }))).toEqual({ eligible: false, reason: 'REPLAY_NOT_MATCHED' });
    expect(labEligibility(experiment('n', { execution: null }))).toEqual({ eligible: false, reason: 'EXPERIMENT_NOT_CLOSED_WITH_REAL_EXECUTION' });
    expect(labEligibility(experiment('e', { evidence: { evidenceProposalId: '', status: 'PROPOSED', publication: 'REQUIRES_HUMAN_APPROVAL' } }))).toEqual({ eligible: false, reason: 'EVIDENCE_PROPOSAL_MISSING' });
  });

  it('rows say why in plain words, mark existing requests and keep the engine for technical details', () => {
    const rows = experimentRows([experiment('x1'), experiment('x2', { falsification: { verdict: 'FALSIFIED_WITHIN_PROTOCOL', scope: '', criteria: [] } })], [request], 'en');
    expect(rows[0]).toMatchObject({ eligible: true, hasRequest: true, why: null });
    expect(rows[1]!.why).toMatch(/falsified/i);
    expect(rows[1]!.verdictWord).toBe('FALSIFIED within its protocol');
    expect(rows.flatMap((r) => [r.claim, r.why, r.verdictWord, r.replayWord]).join(' ')).not.toMatch(ENGINE_NAME_PATTERN);
    expect(rows[0]!.technical.join(' ')).toMatch(/rdkit/);
  });

  it('only numeric outputs can be compared', () => {
    expect(numericOutputs(experiment('x'))).toEqual([{ key: 'molWt', value: 180.159 }, { key: 'crippenLogP', value: 1.31 }]);
    expect(numericOutputs(undefined)).toEqual([]);
  });
});

describe('the request is complete before it is sent', () => {
  it('a tolerance is required, and numbers must be non-negative', () => {
    const filled = { ...EMPTY_REQUEST_FORM, endpointId: 'measured-logp', assay: 'logP', outputKey: 'crippenLogP', expectedUnit: 'log10' };
    expect(buildRequestBody('x1', filled)).toEqual({ ok: false, missing: ['toleranceAbsolute'] });
    expect(buildRequestBody('x1', { ...filled, toleranceRelative: '-1' })).toMatchObject({ ok: false });
    const ok = buildRequestBody('x1', { ...filled, toleranceAbsolute: '0,5', labName: 'Lab A', providerType: 'CRO' });
    expect(ok).toEqual({ ok: true, body: { experimentId: 'x1', endpoint: { endpointId: 'measured-logp', assay: 'logP', outputKey: 'crippenLogP', expectedUnit: 'log10', tolerance: { absolute: 0.5 } }, externalProvider: { providerId: 'Lab A', providerType: 'CRO' } } });
    expect(buildRequestBody('x1', EMPTY_REQUEST_FORM)).toMatchObject({ ok: false, missing: expect.arrayContaining(['endpointId', 'assay', 'outputKey', 'expectedUnit']) });
    expect(parseNonNegative('')).toBeNull();
    expect(parseNonNegative('abc')).toBeNaN();
  });
});

describe('the observation carries the raw file for Genesis to hash', () => {
  it('requires the raw file and every source field; dates become ISO', () => {
    const form = emptyObservationForm(request);
    expect(form).toMatchObject({ unit: 'log10', labId: 'fixture-lab', providerType: 'ACADEMIC_LAB' });
    const missing = buildObservation(request, form, null);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.missing).toEqual(expect.arrayContaining(['value', 'observedAt', 'methodReference', 'externalObservationId', 'sourceUri', 'rawFile']));
    const obs = buildObservationFixture();
    expect(obs.endpointId).toBe('measured-logp');
    expect(obs.value).toBe(1.19);
    expect(obs.observedAt).toMatch(/^2026-10-03T\d\d:00:00\.000Z$/);
    expect(obs.rawArtifactBase64).toBe('AAAA');
    expect(parseMeasuredValue('-1,5')).toBe(-1.5);
    expect(parseMeasuredValue('1e-3')).toBe(0.001);
    expect(parseMeasuredValue('x')).toBeNull();
  });

  it('base64 of raw bytes round-trips, including bytes above 0x7f', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 200, 255]);
    expect(Buffer.from(bytesToBase64(bytes), 'base64')).toEqual(Buffer.from(bytes));
  });
});

describe('refusals are said plainly', () => {
  it('the gates the brief names', () => {
    const en = (f: ApiFailure) => describeLabFailure(f, 'en').lines[0];
    expect(en(failure(409, 'BLOCKED', 'NOT_SUPPORTED_WITHIN_PROTOCOL'))).toMatch(/falsified/i);
    expect(en(failure(422, 'INVALID_ENDPOINT', 'a request names an endpoint, never a wet-lab procedure'))).toMatch(/synthesis, culture or dosing/);
    expect(en(failure(422, 'INVALID_ENDPOINT', 'an explicit tolerance is required before the measurement exists'))).toMatch(/tolerance must be given/);
    expect(en(failure(409, 'REVIEWER_CANNOT_BE_INGESTER'))).toMatch(/Someone else has to/);
    expect(en(failure(422, 'QC_FAILED_CANNOT_BE_ACCEPTED'))).toMatch(/failed quality control cannot be accepted/);
    expect(en(failure(409, 'MODEL_VALUE_CHANGED'))).toMatch(/changed since the request/);
    expect(describeLabFailure(failure(409, 'REVIEWER_CANNOT_BE_INGESTER'), 'pl').lines[0]).toMatch(/nie może go sama sprawdzić/);
    expect(en(failure(0, 'offline'))).toBe(lText('errOffline', 'en'));
    const n = describeLabFailure(failure(422, 'INVALID_ENDPOINT', 'procedure'), 'en');
    expect(n.technical.join(' ')).toMatch(/422 INVALID_ENDPOINT/);
  });

  it('package verification: intact is integrity only; tampering is named', () => {
    expect(describePackageVerification({ ok: true, status: 'VALID_INTEGRITY_ONLY', signature: 'UNSIGNED', failures: [] }, 'en')).toMatchObject({ tone: 'good', lines: [lText('pkgValid', 'en')] });
    const bad = describePackageVerification({ ok: false, status: 'REJECTED', signature: 'UNSIGNED', failures: ['PACKAGE_HASH_MISMATCH', 'SIGNATURE_STATUS_CLAIMED'] }, 'en');
    expect(bad.tone).toBe('bad');
    expect(bad.lines.join(' ')).toMatch(/someone changed it/i);
    expect(bad.lines.join(' ')).toMatch(/no signing key/);
  });
});

describe('review, comparison and evidence stages', () => {
  it('the person who entered a result cannot accept it; QC_FAILED can never be accepted', () => {
    const state = lab({ observations: [observation(), observation({ observationId: 'LABOBS-2', quality: { status: 'QC_FAILED', confidence: 0.5, notes: null } })] });
    const asOwner = observationStages(state, 'u-owner');
    expect(asOwner[0]).toMatchObject({ enteredByMe: true, canReview: false, canAccept: false });
    const asReviewer = observationStages(state, 'u-reviewer');
    expect(asReviewer[0]).toMatchObject({ enteredByMe: false, canReview: true, canAccept: true, accepted: false });
    expect(asReviewer[1]).toMatchObject({ canReview: true, canAccept: false });
  });

  it('an accepted observation shows its comparison and evidence link', () => {
    const accepted = observation({ review: { observationId: 'LABOBS-1', requestId: 'LABREQ-1', verdict: 'ACCEPTED_AS_OBSERVATION', reviewerId: 'u-reviewer', note: null, reviewFingerprint: 'r' } });
    const [stage] = observationStages(lab({ observations: [accepted], comparisons: [comparison], evidenceLinks: [{ observationId: 'LABOBS-1', requestId: 'LABREQ-1', proposalId: 'prop-1', evidenceContentHash: null, mode: 'PROPOSE_ONLY', status: 'PENDING_HUMAN_PUBLICATION', evidenceClass: 'REAL MEASUREMENT' }] }), 'u-reviewer');
    expect(stage).toMatchObject({ accepted: true, evidenceProposalId: 'prop-1' });
    const view = comparisonView(stage!.comparison!, 'pl');
    expect(view).toMatchObject({ verdictWord: 'ZGODNE w ramach tolerancji', tone: 'good', model: '1.31', measured: '1.19', unit: 'log10' });
    // Floating-point noise from the server's subtraction is not shown; the exact value stays technical.
    const noisy = comparisonView({ ...comparison, delta: -0.1201000000000001 }, 'en');
    expect(noisy.delta).toBe('-0.1201');
    expect(noisy.technical).toContain('delta: -0.1201000000000001');
    expect(view.checks[0]).toMatchObject({ kind: 'bezwzględna', pass: true });
  });

  it('the package file name carries the request and its fingerprint', () => {
    expect(packageFileName({ requestId: 'LABREQ-ab/c', packageHash: '0123456789abcdef' })).toBe('genesis-lab-package-LABREQ-ab_c-0123456789ab.json');
  });
});

/* ---------------- views ---------------- */

describe('the lab handoff screen in Polish and English', () => {
  for (const locale of LOCALES) {
    it(`${locale.toUpperCase()}: every step names capabilities, never engines, and never claims a signature`, () => {
      const rows = experimentRows([experiment('x1'), experiment('x2', { falsification: { verdict: 'FALSIFIED_WITHIN_PROTOCOL', scope: '', criteria: [] } })], [request], locale);
      const accepted = observation({ review: { observationId: 'LABOBS-1', requestId: 'LABREQ-1', verdict: 'ACCEPTED_AS_OBSERVATION', reviewerId: 'u-reviewer', note: null, reviewFingerprint: 'r' } });
      const state = lab({ observations: [accepted, observation({ observationId: 'LABOBS-2' })], comparisons: [comparison] });
      const pkg = { kind: 'K', packageVersion: 'v', requestId: 'LABREQ-1', requestFingerprint: '1', forLaboratory: { candidate: { identity: 'CCO', reference: 'r' }, objective: 'o', endpoint: { endpointId: 'measured-logp', assay: 'a', expectedUnit: 'log10' }, pleaseReturn: ['the raw artifact file itself'], status: 'UNKNOWN', labels: { genesisSide: 'GENESIS COMPUTATION', yourResult: 'REAL MEASUREMENT' } }, integrity: { signature: { status: 'UNSIGNED', statement: 'UNSIGNED.' }, method: 'fingerprints' }, humanApproval: { required: true, state: 'PENDING', note: '' }, claimBoundary: 'b', technicalDetails: { engines: ['rdkit'] }, packageHash: 'h'.repeat(64) };
      const noop = () => {};
      const html = renderToStaticMarkup(
        <>
          <HonestNotice locale={locale} />
          <ExperimentsStep locale={locale} rows={rows} onPrepare={noop} />
          <RequestStep locale={locale} claim="Claim x1" outputs={numericOutputs(experiment('x1'))} form={EMPTY_REQUEST_FORM} missing={['toleranceAbsolute']} busy={false} notice={null} onChange={noop} onSubmit={noop} onCancel={noop} />
          <PackageStep locale={locale} requests={[request]} claimOf={() => 'Claim x1'} busyRequestId={null} saved={{ requestId: 'LABREQ-1', pkg, url: 'blob:x', fileName: 'f.json' }} notice={null} verifyBusy={false} verifyNotice={null} onGetPackage={noop} onVerifyFile={noop} onVerifySaved={noop} />
          <ObservationStep locale={locale} requests={[request]} requestId="LABREQ-1" form={emptyObservationForm(request)} file={{ name: 'raw.csv', size: 12 }} missing={[]} busy={false} notice={null} onRequest={noop} onChange={noop} onFile={noop} onSubmit={noop} />
          <ResultsStep locale={locale} lab={state} stages={observationStages(state, 'u-owner')} reviewDraft={{}} busy={null} notices={{}} onReviewDraft={noop} onReview={noop} onCompare={noop} onPropose={noop} />
        </>,
      );
      const text = customerText(html);
      expect(text.match(ENGINE_NAME_PATTERN)).toBeNull();
      expect(text.match(SIGNED_CLAIM)).toBeNull();
      // The engine is kept, one click away.
      expect(html).toMatch(/data-technical-details[\s\S]*rdkit/);
      // The honest notice, the gates and the labels are visible.
      expect(text).toContain(lText('honestNoPartner', locale));
      expect(text).toContain('UNSIGNED');
      expect(text).toContain(lText('step2Lead', locale));
      expect(text).toContain('REAL MEASUREMENT');
      expect(text).toContain(lText('youEntered', locale));
      expect(html).toContain('download="f.json"');
      expect(html).toContain('data-verdict="AGREES_WITHIN_TOLERANCE"');
      expect(html).toContain('data-eligible="no"');
    });
  }

  it('signed out, the screen asks to sign in and still states the honest boundary', async () => {
    const { LabHandoffScreen } = await import('../components/LabHandoffScreen');
    const html = renderToStaticMarkup(<LabHandoffScreen />);
    expect(html).toContain('data-testid="lh-signed-out"');
    expect(html).toContain('data-testid="lh-honest"');
    expect(customerText(html).match(SIGNED_CLAIM)).toBeNull();
  });
});

/* ---------------- reports ---------------- */

const runView = (experiments: ResearchRunExperiment[]): ResearchRunView => ({
  researchRunId: 'rr', question: 'Q', plan: null, experiments, nextStep: 'NONE', researchState: { chain: { ok: true }, events: [] },
});

describe('reports list only what the server issues', () => {
  it('nothing before an executed experiment; then pack, record, Verify report, lab package and customer export', () => {
    expect(deliverablesOf('p', runView([experiment('x', { execution: null })]), null)).toEqual([]);
    const list = deliverablesOf('p', runView([experiment('x1'), experiment('x2', { execution: null })]), lab());
    expect(list.map((d) => d.kind)).toEqual(['evidence-pack', 'record', 'verify-report', 'lab-package', 'customer-delivery']);
    expect(list.find((d) => d.kind === 'verify-report')!.href).toBe('#/verify?project=p&run=rr&experiment=x1');
    expect(new Set(list.map((d) => d.key)).size).toBe(list.length);
    expect(evidencePackFileName('rr/1')).toBe('genesis-evidence-pack-rr_1.json');
    expect(verifyReportFileName('MATCH', 'abcdef0123456789')).toBe('genesis-verify-match-abcdef012345.html');
  });

  it('a blocked customer delivery says why; a ready one hands over the server artifact', () => {
    const blocked = deliveryView({ delivery: { status: 'BLOCKED_SCIENTIFIC_INCOMPLETE', exportAllowed: false, scientificBlockers: ['LITERATURE_SNAPSHOT_MISSING'], deliveryFingerprint: 'd', delivered: false, approvalBoundary: 'b' }, exportArtifact: { ok: false, status: 'EXPORT_BLOCKED' } }, 'en');
    expect(blocked).toMatchObject({ exportAllowed: false, artifact: null, statusWord: 'Blocked: the run is scientifically incomplete', blockers: ['no saved literature snapshot'] });
    const ready = deliveryView({ delivery: { status: 'READY_FOR_AUTHORISED_EXPORT', exportAllowed: true, scientificBlockers: [], deliveryFingerprint: 'd', delivered: false, approvalBoundary: 'b' }, exportArtifact: { ok: true, status: 'AUTHORISED_EXPORT_ARTIFACT_READY', artifact: { fileName: 'g.json', mediaType: 'application/json', byteLength: 2, sha256: 's', content: '{}' } } }, 'en');
    expect(ready).toMatchObject({ exportAllowed: true, tone: 'good' });
    expect(ready.artifact!.fileName).toBe('g.json');
  });

  it('a refused deliverable is plain, with blockers kept technical', () => {
    const n = describeReportsFailure({ ok: false, status: 409, error: 'BLOCKED', message: '', responseBody: { error: 'BLOCKED', blockers: ['NO_EXECUTED_EXPERIMENT'] } }, 'en');
    expect(n.lines).toEqual([rText('errBlocked', 'en')]);
    expect(n.technical).toContain('blocker: NO_EXECUTED_EXPERIMENT');
  });

  for (const locale of LOCALES) {
    it(`${locale.toUpperCase()}: the rendered list names no engine and claims no signature`, () => {
      const items = deliverablesOf('p', runView([experiment('x1')]), lab());
      const html = renderToStaticMarkup(
        <>
          <ReportsUnsigned locale={locale} />
          <ReportsList
            locale={locale}
            runs={[{ researchRunId: 'rr', question: 'Q', status: 'RUNNING', nextStep: 'NONE', events: 3, createdAt: 0 }, { researchRunId: 'r2', question: 'Q2', status: 'RUNNING', nextStep: 'NONE', events: 1, createdAt: 0 }]}
            byRun={{ rr: { status: 'ready', items }, r2: { status: 'ready', items: [] } }}
            items={{ [items[2]!.key]: { status: 'ready', url: 'blob:r', fileName: 'r.html', verdict: 'MATCH' } }}
            onAct={() => {}}
          />
        </>,
      );
      const text = customerText(html);
      expect(text.match(ENGINE_NAME_PATTERN)).toBeNull();
      expect(text.match(SIGNED_CLAIM)).toBeNull();
      expect(html).toMatch(/data-technical-details[\s\S]*rdkit/);
      expect(text).toContain(rText('nothingYet', locale));
      expect(html).toContain('download="r.html"');
      expect(html).toContain('target="_blank"');
    });
  }

  it('signed out, Reports asks to sign in', async () => {
    const { ReportsScreen } = await import('../components/ReportsScreen');
    const html = renderToStaticMarkup(<ReportsScreen />);
    expect(html).toContain('data-testid="rp-signed-out"');
    expect(html).toContain('data-testid="rp-unsigned"');
  });
});

/* ---------------- navigation and search ---------------- */

describe('both screens are places in DELIVER, in PL and EN, and searchable', () => {
  it('menu entries, routes, labels and search', () => {
    const deliver = NAV_SECTIONS.find((s) => s.id === 'deliver')!.items.map((i) => i.id);
    expect(deliver).toEqual(expect.arrayContaining(['lab-handoff', 'reports']));
    expect(activeNavId('#/lab-handoff')).toBe('lab-handoff');
    expect(activeNavId('#/reports')).toBe('reports');
    expect(TRANSLATED_NAV_IDS).toEqual(expect.arrayContaining(['lab-handoff', 'reports']));
    const item = NAV_SECTIONS.flatMap((s) => s.items).find((i) => i.id === 'lab-handoff')!;
    expect(navLabel(item, 'pl')).toBe('Przekazanie do laboratorium');
    expect(navLabel(item, 'en')).toBe('Lab handoff');
    expect(navLabel(item, 'ar')).toBe('Lab handoff');
    expect(navDescription(item, 'en')).toMatch(/review/);
    const index = [...buildGoalIndex(), ...buildDestinationIndex('pl')];
    expect(filterSearchIndex(index, 'laboratorium').some((e) => e.hash === '#/lab-handoff')).toBe(true);
    expect(filterSearchIndex(index, 'raporty').some((e) => e.hash === '#/reports')).toBe(true);
  });
});
