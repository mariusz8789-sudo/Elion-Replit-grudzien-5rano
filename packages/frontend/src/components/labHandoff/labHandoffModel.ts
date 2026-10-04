import type {
  ApiResult, LabComparison, LabEndpointInput, LabLoopState, LabObservation, LabObservationInput, LabPackage, LabPackageVerification,
  LabProviderType, LabQualityStatus, LabRequest, ResearchRunExperiment,
} from '../../core/backend/client';
import type { Locale } from '../../core/i18n';
import {
  COMPARISON_TEXT, INELIGIBLE_TEXT, NEXT_ACTION_TEXT, PACKAGE_FAILURE_TEXT, PROTOCOL_VERDICT_TEXT, REFUSAL_TEXT, REPLAY_TEXT,
  lText, pairText,
} from './labHandoffText';

/**
 * The data side of #/lab-handoff. Every status, verdict, value and refusal is the server's
 * (packages/backend/src/researchRunLab.mjs through api.mjs); this file only turns codes into sentences,
 * validates a form before it is sent and decides what goes into the collapsed technical details. The
 * eligibility rule below mirrors the server's gate so a person sees WHY before asking; the server still
 * decides, and its refusal is shown as it is.
 */

export type ApiFailure = Extract<ApiResult<unknown>, { ok: false }>;
export type Tone = 'good' | 'warn' | 'bad' | 'idle';
export interface Notice { tone: Tone; lines: string[]; technical: string[] }

/* ---------------- eligibility ---------------- */

export type Eligibility = { eligible: true } | { eligible: false; reason: string };

/** Same order and the same reason codes as prepareLabRequest's gate. */
export function labEligibility(x: ResearchRunExperiment): Eligibility {
  if (!x.execution || x.execution.status !== 'EXECUTED' || !x.falsification || !x.evidence || !x.next) return { eligible: false, reason: 'EXPERIMENT_NOT_CLOSED_WITH_REAL_EXECUTION' };
  if (x.falsification.verdict !== 'SUPPORTED_WITHIN_PROTOCOL') return { eligible: false, reason: 'NOT_SUPPORTED_WITHIN_PROTOCOL' };
  if (x.next.replay?.verdict !== 'MATCH') return { eligible: false, reason: 'REPLAY_NOT_MATCHED' };
  if (!x.evidence.evidenceProposalId) return { eligible: false, reason: 'EVIDENCE_PROPOSAL_MISSING' };
  return { eligible: true };
}

export interface ExperimentRow {
  experimentId: string;
  /** The frozen claim, never the engine. */
  claim: string;
  eligible: boolean;
  reason: string | null;
  why: string | null;
  verdictWord: string | null;
  replayWord: string | null;
  evidenceProposed: boolean;
  hasRequest: boolean;
  technical: string[];
}

export function experimentRows(experiments: readonly ResearchRunExperiment[], requests: readonly LabRequest[], locale: Locale): ExperimentRow[] {
  return experiments.map((x) => {
    const e = labEligibility(x);
    const verdict = x.falsification?.verdict ?? null;
    const replay = x.next?.replay?.verdict ?? null;
    return {
      experimentId: x.experimentId,
      claim: x.frozen?.claim ?? x.experimentId,
      eligible: e.eligible,
      reason: e.eligible ? null : e.reason,
      why: e.eligible ? null : (INELIGIBLE_TEXT[e.reason] ? pairText(INELIGIBLE_TEXT[e.reason]!, locale) : e.reason),
      verdictWord: verdict ? (PROTOCOL_VERDICT_TEXT[verdict] ? pairText(PROTOCOL_VERDICT_TEXT[verdict]!, locale) : verdict) : null,
      replayWord: replay ? (REPLAY_TEXT[replay] ? pairText(REPLAY_TEXT[replay]!, locale) : replay) : null,
      evidenceProposed: Boolean(x.evidence?.evidenceProposalId),
      hasRequest: requests.some((r) => r.experimentId === x.experimentId),
      technical: [
        `experimentId: ${x.experimentId}`,
        x.execution ? `engine: ${x.execution.engine.engineId}${x.execution.engine.version ? ` ${x.execution.engine.version}` : ''}` : '',
        x.execution ? `execution: ${x.execution.status} · outputHash ${x.execution.outputHash}` : '',
        verdict ? `falsification: ${verdict}` : '',
        replay ? `replay: ${replay}` : '',
        x.evidence ? `evidence: ${x.evidence.evidenceProposalId} (${x.evidence.status})` : '',
      ].filter(Boolean),
    };
  });
}

/** The numeric values of an executed experiment: the only things a measurement can be compared against. */
export function numericOutputs(x: ResearchRunExperiment | undefined): { key: string; value: number }[] {
  const out = x?.execution?.output ?? {};
  return Object.entries(out)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]))
    .map(([key, value]) => ({ key, value }));
}

/* ---------------- request form ---------------- */

export interface RequestForm {
  endpointId: string;
  assay: string;
  outputKey: string;
  expectedUnit: string;
  toleranceAbsolute: string;
  toleranceRelative: string;
  objective: string;
  labName: string;
  providerType: LabProviderType;
}

export const EMPTY_REQUEST_FORM: RequestForm = {
  endpointId: '', assay: '', outputKey: '', expectedUnit: '', toleranceAbsolute: '', toleranceRelative: '', objective: '', labName: '', providerType: 'OTHER_EXTERNAL',
};

/** '' → null; a non-negative decimal (comma or point) → number; anything else → NaN. */
export function parseNonNegative(raw: string): number | null {
  const t = raw.trim().replace(',', '.');
  if (t === '') return null;
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(t)) return Number.NaN;
  return Number(t);
}

export type RequestDraft =
  | { ok: true; body: { experimentId: string; endpoint: LabEndpointInput; objective?: string; externalProvider?: { providerId: string; providerType: LabProviderType } } }
  | { ok: false; missing: (keyof RequestForm)[] };

export function buildRequestBody(experimentId: string, form: RequestForm): RequestDraft {
  const missing: (keyof RequestForm)[] = [];
  for (const key of ['endpointId', 'assay', 'outputKey', 'expectedUnit'] as const) if (!form[key].trim()) missing.push(key);
  const absolute = parseNonNegative(form.toleranceAbsolute);
  const relative = parseNonNegative(form.toleranceRelative);
  if (Number.isNaN(absolute)) missing.push('toleranceAbsolute');
  if (Number.isNaN(relative)) missing.push('toleranceRelative');
  if (absolute === null && relative === null) missing.push('toleranceAbsolute');
  if (missing.length) return { ok: false, missing: [...new Set(missing)] };
  const tolerance: LabEndpointInput['tolerance'] = {};
  if (absolute !== null) tolerance.absolute = absolute;
  if (relative !== null) tolerance.relative = relative;
  return {
    ok: true,
    body: {
      experimentId,
      endpoint: { endpointId: form.endpointId.trim(), assay: form.assay.trim(), outputKey: form.outputKey, expectedUnit: form.expectedUnit.trim(), tolerance },
      ...(form.objective.trim() ? { objective: form.objective.trim() } : {}),
      ...(form.labName.trim() ? { externalProvider: { providerId: form.labName.trim(), providerType: form.providerType } } : {}),
    },
  };
}

/** A number as a person reads it: binary floating-point noise (0.1201000000000001) dropped, every meaningful digit kept. The exact value stays in the technical details. */
export function formatNumber(value: number): string {
  return Number.isFinite(value) ? String(Number.parseFloat(value.toPrecision(12))) : String(value);
}

/** A tolerance in words, from the request the server froze. */
export function toleranceWords(t: { absolute: number | null; relative: number | null }, unit: string, locale: Locale): string {
  const parts: string[] = [];
  if (t.absolute !== null) parts.push(`± ${formatNumber(t.absolute)} ${unit} (${lText('absolute', locale)})`);
  if (t.relative !== null) parts.push(`± ${formatNumber(t.relative)} (${lText('relative', locale)})`);
  return parts.join(' · ');
}

/* ---------------- package ---------------- */

const safe = (v: string) => v.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);

export function packageFileName(pkg: Pick<LabPackage, 'requestId' | 'packageHash'>): string {
  return `genesis-lab-package-${safe(pkg.requestId)}-${pkg.packageHash.slice(0, 12)}.json`;
}

/** The bytes saved for the laboratory. Pretty-printed: the package hash is canonical, so layout does not matter. */
export function packageJson(pkg: LabPackage): string {
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

export function parsePackageText(text: string): { ok: true; value: unknown } | { ok: false } {
  try { return { ok: true, value: JSON.parse(text) as unknown }; } catch { return { ok: false }; }
}

export function describePackageVerification(v: LabPackageVerification, locale: Locale): Notice {
  const lines = [lText(v.ok ? 'pkgValid' : 'pkgRejected', locale)];
  for (const code of v.failures) lines.push(PACKAGE_FAILURE_TEXT[code] ? pairText(PACKAGE_FAILURE_TEXT[code]!, locale) : code);
  return { tone: v.ok ? 'good' : 'bad', lines: [...new Set(lines)], technical: [`status: ${v.status}`, `signature: ${v.signature}`, ...v.failures.map((f) => `failure: ${f}`)] };
}

/* ---------------- observation form ---------------- */

export interface ObservationForm {
  value: string;
  unit: string;
  observedAt: string;
  methodReference: string;
  labId: string;
  providerType: LabProviderType;
  externalObservationId: string;
  sourceUri: string;
  quality: LabQualityStatus;
  notes: string;
}

export function emptyObservationForm(request: LabRequest | null): ObservationForm {
  return {
    value: '', unit: request?.endpoint.expectedUnit ?? '', observedAt: '', methodReference: '',
    labId: request?.externalProvider?.providerId ?? '', providerType: request?.externalProvider?.providerType ?? 'OTHER_EXTERNAL',
    externalObservationId: '', sourceUri: '', quality: 'QC_UNKNOWN', notes: '',
  };
}

/** A signed decimal (comma or point) → number; anything else → null. */
export function parseMeasuredValue(raw: string): number | null {
  const t = raw.trim().replace(',', '.');
  if (!/^[-+]?(\d+(\.\d+)?|\.\d+)([eE][-+]?\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export type ObservationDraft = { ok: true; observation: LabObservationInput } | { ok: false; missing: (keyof ObservationForm | 'rawFile')[] };

export function buildObservation(request: LabRequest, form: ObservationForm, rawArtifactBase64: string | null): ObservationDraft {
  const missing: (keyof ObservationForm | 'rawFile')[] = [];
  const value = parseMeasuredValue(form.value);
  if (value === null) missing.push('value');
  for (const key of ['unit', 'methodReference', 'labId', 'externalObservationId', 'sourceUri'] as const) if (!form[key].trim()) missing.push(key);
  const when = form.observedAt.trim() ? new Date(form.observedAt) : null;
  if (!when || Number.isNaN(when.getTime())) missing.push('observedAt');
  if (!rawArtifactBase64) missing.push('rawFile');
  if (missing.length) return { ok: false, missing };
  return {
    ok: true,
    observation: {
      endpointId: request.endpoint.endpointId,
      value: value!,
      unit: form.unit.trim(),
      observedAt: when!.toISOString(),
      methodReference: form.methodReference.trim(),
      source: { labId: form.labId.trim(), providerType: form.providerType, externalObservationId: form.externalObservationId.trim(), sourceUri: form.sourceUri.trim() },
      quality: { status: form.quality, ...(form.notes.trim() ? { notes: form.notes.trim() } : {}) },
      rawArtifactBase64: rawArtifactBase64!,
    },
  };
}

/** Base64 of raw bytes, in chunks so a large file does not overflow the call stack. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

export async function readFileBase64(file: Blob): Promise<{ base64: string; size: number }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return { base64: bytesToBase64(bytes), size: bytes.length };
}

/* ---------------- review, comparison, evidence ---------------- */

export interface ObservationStage {
  observation: LabObservation;
  enteredByMe: boolean;
  canReview: boolean;
  canAccept: boolean;
  accepted: boolean;
  comparison: LabComparison | null;
  evidenceProposalId: string | null;
}

export function observationStages(lab: LabLoopState, userId: string | null): ObservationStage[] {
  return lab.observations.map((o) => {
    const enteredByMe = userId !== null && o.ingestedBy === userId;
    const accepted = o.review?.verdict === 'ACCEPTED_AS_OBSERVATION';
    return {
      observation: o,
      enteredByMe,
      canReview: !enteredByMe,
      canAccept: !enteredByMe && o.quality.status !== 'QC_FAILED',
      accepted,
      comparison: [...lab.comparisons].reverse().find((c) => c.observationId === o.observationId) ?? null,
      evidenceProposalId: lab.evidenceLinks.find((l) => l.observationId === o.observationId)?.proposalId ?? null,
    };
  });
}

export interface ComparisonView {
  verdict: string;
  verdictWord: string;
  tone: Tone;
  model: string;
  measured: string;
  unit: string;
  delta: string;
  checks: { kind: string; threshold: string; actual: string; pass: boolean }[];
  technical: string[];
}

export function comparisonView(c: LabComparison, locale: Locale): ComparisonView {
  return {
    verdict: c.verdict,
    verdictWord: COMPARISON_TEXT[c.verdict] ? pairText(COMPARISON_TEXT[c.verdict]!, locale) : c.verdict,
    tone: c.verdict === 'AGREES_WITHIN_TOLERANCE' ? 'good' : 'warn',
    model: formatNumber(c.model.value),
    measured: formatNumber(c.measurement.value),
    unit: c.unit,
    delta: formatNumber(c.delta),
    checks: c.toleranceChecks.map((k) => ({ kind: lText(k.kind === 'absolute' ? 'absolute' : 'relative', locale), threshold: formatNumber(k.threshold), actual: formatNumber(k.actual), pass: k.pass })),
    technical: [`model: ${c.model.value}`, `measurement: ${c.measurement.value}`, `delta: ${c.delta}`, `deltaAbs: ${c.deltaAbs}`,`comparisonId: ${c.comparisonId}`, `outputKey: ${c.outputKey}`, `model.outputHash: ${c.model.outputHash}`, `deltaRel: ${c.deltaRel}`, `clinicalEfficacy: ${c.clinicalEfficacy}`, `boundary: ${c.claimBoundary}`],
  };
}

export function nextActionWords(action: string, locale: Locale): string {
  return NEXT_ACTION_TEXT[action] ? pairText(NEXT_ACTION_TEXT[action]!, locale) : action;
}

/* ---------------- failures ---------------- */

function reasonOf(failure: ApiFailure): string | null {
  const body = failure.responseBody as { reason?: unknown } | undefined;
  return typeof body?.reason === 'string' ? body.reason : null;
}

/** A refused request in plain words; the raw code and the server's own sentence stay in the technical rows. */
export function describeLabFailure(failure: ApiFailure, locale: Locale): Notice {
  const reason = reasonOf(failure);
  let line: string | null = null;
  if (failure.error === 'BLOCKED' && reason && INELIGIBLE_TEXT[reason]) line = pairText(INELIGIBLE_TEXT[reason]!, locale);
  else if (failure.error === 'INVALID_ENDPOINT') {
    const variant = /procedure/i.test(reason ?? '') ? 'INVALID_ENDPOINT_PROCEDURE' : /tolerance/i.test(reason ?? '') ? 'INVALID_ENDPOINT_TOLERANCE' : /numeric/i.test(reason ?? '') ? 'INVALID_ENDPOINT_OUTPUT' : 'INVALID_ENDPOINT';
    line = pairText(REFUSAL_TEXT[variant]!, locale);
  } else if (REFUSAL_TEXT[failure.error]) line = pairText(REFUSAL_TEXT[failure.error]!, locale);
  else if (REFUSAL_TEXT[failure.error.toUpperCase()]) line = pairText(REFUSAL_TEXT[failure.error.toUpperCase()]!, locale);
  if (line === null) {
    const key = failure.status === 0 ? 'errOffline' : failure.status === 401 ? 'errSignedOut' : failure.status === 403 ? 'errForbidden' : failure.status === 404 ? 'errNotFound' : 'errOther';
    line = lText(key, locale);
  }
  return {
    tone: 'bad',
    lines: [line],
    technical: [`${lText('errCode', locale)}: ${failure.status} ${failure.error}`, reason ? `reason: ${reason}` : '', failure.message].filter((x) => x.length > 0),
  };
}
