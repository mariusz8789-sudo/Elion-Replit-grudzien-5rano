import type { ApiResult, GenesisVerifyReport, ResearchRunExperiment } from '../../core/backend/client';
import type { Locale } from '../../core/i18n';
import type { VerifyTarget } from '../../core/verifyTarget';
import {
  CAPABILITY_TEXT, CHECK_REASONS, CHECK_TITLE, NOT_CHECKED_TEXT, VERDICT_TEXT,
  checkExplain, pairText, statusWord, vText, verdictWord,
} from './verifyText';

/**
 * The data side of #/verify. Every verdict, check, status and reason is the server's
 * (packages/backend/src/genesisVerify.mjs via POST /genesis-verify); this file only turns those codes into
 * plain sentences and decides what goes into the collapsed technical details. The server's own English
 * sentences (which may name engines) are kept, but only there.
 */

export type ApiFailure = Extract<ApiResult<unknown>, { ok: false }>;
export type Tone = 'good' | 'warn' | 'bad' | 'idle';

export interface Notice { tone: Tone; lines: string[]; technical: string[] }

const SHA256 = /^[a-f0-9]{64}$/;

/** The declared hash as the server will compare it (trimmed, lower case), or '' when none was typed. */
export function normaliseSha256(input: string): string {
  return input.trim().toLowerCase();
}

/** null = nothing typed (optional field), true/false = typed and (in)valid. */
export function sha256State(input: string): boolean | null {
  const v = normaliseSha256(input);
  return v === '' ? null : SHA256.test(v);
}

export const VERDICT_TONE: Readonly<Record<string, Tone>> = { MATCH: 'good', DRIFT: 'warn', TAMPERED: 'bad', BLOCKED: 'idle' };
const STATUS_TONE: Readonly<Record<string, Tone>> = { PASS: 'good', FAIL: 'bad', NOT_RUN: 'idle' };

export interface CheckView {
  id: string;
  title: string;
  status: string;
  statusWord: string;
  tone: Tone;
  plain: string;
  /** The server's own sentence for this check; shown only inside technical details. */
  technical: string;
}

export interface ReportView {
  verdict: string;
  verdictWord: string;
  meaning: string;
  tone: Tone;
  unsigned: boolean;
  replayed: string | null;
  checks: CheckView[];
  notChecked: string[];
  technical: string[];
  reportFingerprint: string;
  generatedAt: string;
}

function explainCheck(check: GenesisVerifyReport['checks'][number], reasons: readonly string[], locale: Locale): CheckView {
  const ownReason = (CHECK_REASONS[check.id] ?? []).find((r) => reasons.includes(r));
  // A NOT_RUN replay has its own reason when something blocked it; a PASS never takes a failure reason.
  const key = check.status === 'PASS' ? 'PASS' : ownReason ?? check.status;
  const plain = checkExplain(check.id, key, locale) ?? checkExplain(check.id, check.status, locale) ?? check.detail;
  return {
    id: check.id,
    title: CHECK_TITLE[check.id] ? pairText(CHECK_TITLE[check.id]!, locale) : check.label,
    status: check.status,
    statusWord: statusWord(check.status, locale),
    tone: STATUS_TONE[check.status] ?? 'idle',
    plain,
    technical: check.detail,
  };
}

/** Everything the result panel shows, from the report alone. */
export function explainReport(report: GenesisVerifyReport, locale: Locale): ReportView {
  const anchor = report.checks.find((c) => c.id === 'ledger-anchor');
  const provenance = report.checks.find((c) => c.id === 'provenance');
  const notChecked = NOT_CHECKED_TEXT.always.map((p) => pairText(p, locale));
  if (!anchor || anchor.status === 'NOT_RUN') notChecked.push(pairText(NOT_CHECKED_TEXT.noAnchor, locale));
  if (provenance?.status === 'PASS' && anchor?.status !== 'PASS') notChecked.push(pairText(NOT_CHECKED_TEXT.prediction, locale));
  const capability = report.replay?.capability ?? null;
  const engine = report.input.engine;
  const technical = [
    `verdict: ${report.verdict}`,
    report.reasons.length ? `reasons: ${report.reasons.join(', ')}` : '',
    report.input.shape ? `shape: ${report.input.shape}` : '',
    report.input.researchRunId ? `researchRunId: ${report.input.researchRunId}` : '',
    report.input.experimentId ? `experimentId: ${report.input.experimentId}` : '',
    engine?.engineId ? `engine: ${engine.engineId}${engine.engineLabel ? ` ${engine.engineLabel}` : ''}` : '',
    report.input.engineStatus ? `engineStatus: ${report.input.engineStatus}` : '',
    capability ? `replay.capability: ${capability}` : '',
    report.replay?.replayEngineVersion ? `replay.engineVersion: ${report.replay.replayEngineVersion}` : '',
    report.replay ? `replay.hashMatch: ${String(report.replay.hashMatch)} · tolerance ${report.replay.tolerance}${report.replay.maxRelativeDiff != null ? ` · maxRelativeDiff ${report.replay.maxRelativeDiff}` : ''}` : '',
    ...Object.entries(report.hashes).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`),
    `meaning: ${report.meaning}`,
    `boundary: ${report.boundary}`,
    ...report.notChecked.map((n) => `notChecked: ${n}`),
    `${report.kind} ${report.version}`,
  ].filter((r) => r.length > 0);
  return {
    verdict: report.verdict,
    verdictWord: verdictWord(report.verdict, locale),
    meaning: VERDICT_TEXT[report.verdict] ? pairText(VERDICT_TEXT[report.verdict]!.meaning, locale) : report.meaning,
    tone: VERDICT_TONE[report.verdict] ?? 'idle',
    unsigned: report.signature === 'UNSIGNED',
    replayed: capability ? (CAPABILITY_TEXT[capability] ? pairText(CAPABILITY_TEXT[capability]!, locale) : capability) : null,
    checks: report.checks.map((c) => explainCheck(c, report.reasons, locale)),
    notChecked,
    technical,
    reportFingerprint: report.reportFingerprint,
    generatedAt: report.generatedAt,
  };
}

/** A failed request in plain words; the raw code stays in the technical rows. */
export function describeVerifyFailure(failure: ApiFailure, locale: Locale): Notice {
  const byCode: Record<string, Parameters<typeof vText>[0]> = {
    compute_busy: 'errBusy', compute_rate_limited: 'errRateLimited', payload_too_large: 'errTooLarge',
    NOT_EXECUTED: 'exportNotExecuted', ARTIFACT_INTEGRITY_MISMATCH: 'exportIntegrity', ARTIFACT_CHAIN_MISMATCH: 'exportIntegrity',
    ARTIFACT_MISSING: 'exportIntegrity', STATE_INTEGRITY_FAILURE: 'exportIntegrity',
  };
  const key = byCode[failure.error]
    ?? (failure.status === 0 ? 'errOffline' : failure.status === 401 ? 'errSignedOut' : failure.status === 403 ? 'errForbidden'
      : failure.status === 404 ? 'errNotFound' : failure.status === 413 ? 'errTooLarge' : 'errOther');
  return {
    tone: 'bad',
    lines: [vText(key, locale)],
    technical: [`${vText('errCode', locale)}: ${failure.status} ${failure.error}`, failure.message].filter((x) => x.length > 0),
  };
}

/** Executed experiments of one run, labelled by their frozen claim (never by engine). */
export function exportableExperiments(experiments: readonly ResearchRunExperiment[]): { experimentId: string; label: string; status: string }[] {
  return experiments
    .filter((x) => x.execution !== null)
    .map((x) => ({ experimentId: x.experimentId, label: x.frozen?.claim ?? x.experimentId, status: x.execution!.status }));
}

/** File name for the downloaded report, from the report's own fingerprint. */
export function reportFileName(report: Pick<GenesisVerifyReport, 'verdict' | 'reportFingerprint'>): string {
  return `genesis-verify-${report.verdict.toLowerCase()}-${report.reportFingerprint.slice(0, 12)}.html`;
}

/** Reads an uploaded file as text: FileReader in the browser, Blob.text() where FileReader does not exist. */
export function readRecordFile(file: Blob): Promise<string> {
  if (typeof FileReader === 'undefined') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsText(file);
  });
}

/** A Blob for a download link; the caller owns the object URL made from it. */
export function downloadBlob(text: string, mimeType: string): Blob {
  return new Blob([text], { type: `${mimeType};charset=utf-8` });
}

/*
 * "Verify this result" preselection. A result screen hands over ids; Verify picks each one only when
 * the server lists it for this account, never by guessing. The functions are pure so a test can check
 * them without a browser.
 */

/** The project to open: the asked one if listed, else the active knowledge project, else the first. */
export function preselectProject(projectIds: readonly string[], target: VerifyTarget | null, preferredId: string | null | undefined): string | null {
  if (target?.projectId && projectIds.includes(target.projectId)) return target.projectId;
  if (preferredId && projectIds.includes(preferredId)) return preferredId;
  return projectIds[0] ?? null;
}

/** The asked research run, when the project's list holds it. */
export function preselectRun(target: VerifyTarget | null, runs: readonly { researchRunId: string }[]): string | null {
  return target && runs.some((r) => r.researchRunId === target.researchRunId) ? target.researchRunId : null;
}

/** The asked experiment, when it is one of the run's executed (exportable) experiments. */
export function preselectExperiment(target: VerifyTarget | null, experiments: readonly { experimentId: string }[]): string | null {
  return target?.experimentId && experiments.some((x) => x.experimentId === target.experimentId) ? target.experimentId : null;
}
