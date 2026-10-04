import type { ApiResult, CustomerDeliveryResult, LabLoopState, ResearchRunView } from '../../core/backend/client';
import type { Locale } from '../../core/i18n';
import { verifyHref } from '../../core/verifyTarget';
import { DELIVERY_BLOCKER_TEXT, DELIVERY_STATUS_TEXT, pairText, rText, type ReportsTextKey } from './reportsText';

/**
 * The data side of #/reports. A deliverable is listed only when a server route issues it for this run
 * (api.mjs: evidence-pack, experiments/:id/record, genesis-verify, lab/requests/:id/package,
 * customer-delivery). Nothing is listed from a guess, and no report type exists here that the backend
 * does not build.
 */

export type ApiFailure = Extract<ApiResult<unknown>, { ok: false }>;
export type Tone = 'good' | 'warn' | 'bad' | 'idle';
export interface Notice { tone: Tone; lines: string[]; technical: string[] }

export type DeliverableKind = 'evidence-pack' | 'record' | 'verify-report' | 'lab-package' | 'customer-delivery';

export interface Deliverable {
  /** Unique per project: the screen keys its download state by it. */
  key: string;
  kind: DeliverableKind;
  researchRunId: string;
  experimentId?: string;
  requestId?: string;
  /** What it is about, in the customer's words: the frozen claim or the measured quantity. */
  subject: string | null;
  /** A screen that already works with this deliverable. */
  href?: string;
  technical: string[];
}

const TITLE: Record<DeliverableKind, ReportsTextKey> = {
  'evidence-pack': 'packTitle', record: 'recordTitle', 'verify-report': 'verifyTitle', 'lab-package': 'labTitle', 'customer-delivery': 'customerTitle',
};
const LINE: Record<DeliverableKind, ReportsTextKey> = {
  'evidence-pack': 'packLine', record: 'recordLine', 'verify-report': 'verifyLine', 'lab-package': 'labLine', 'customer-delivery': 'customerLine',
};

export const deliverableTitle = (kind: DeliverableKind, locale: Locale): string => rText(TITLE[kind], locale);
export const deliverableLine = (kind: DeliverableKind, locale: Locale): string => rText(LINE[kind], locale);

/** Everything this run can hand over today. A run without an executed experiment has nothing. */
export function deliverablesOf(projectId: string, run: ResearchRunView, lab: LabLoopState | null): Deliverable[] {
  const runId = run.researchRunId;
  const executed = run.experiments.filter((x) => x.execution !== null);
  if (executed.length === 0) return [];
  const list: Deliverable[] = [
    { key: `${runId}:pack`, kind: 'evidence-pack', researchRunId: runId, subject: null, technical: [`GET research-runs/${runId}/evidence-pack`] },
  ];
  for (const x of executed) {
    const claim = x.frozen?.claim ?? x.experimentId;
    const tech = [`experimentId: ${x.experimentId}`, `engine: ${x.execution!.engine.engineId}${x.execution!.engine.version ? ` ${x.execution!.engine.version}` : ''}`, `outputHash: ${x.execution!.outputHash}`];
    list.push({ key: `${runId}:record:${x.experimentId}`, kind: 'record', researchRunId: runId, experimentId: x.experimentId, subject: claim, technical: tech });
    list.push({
      key: `${runId}:verify:${x.experimentId}`, kind: 'verify-report', researchRunId: runId, experimentId: x.experimentId, subject: claim,
      href: verifyHref({ projectId, researchRunId: runId, experimentId: x.experimentId }), technical: tech,
    });
  }
  for (const r of lab?.requests ?? []) {
    list.push({
      key: `${runId}:lab:${r.requestId}`, kind: 'lab-package', researchRunId: runId, requestId: r.requestId, subject: `${r.endpoint.endpointId} · ${r.endpoint.expectedUnit}`,
      href: '#/lab-handoff', technical: [`requestId: ${r.requestId}`, `experimentId: ${r.experimentId}`],
    });
  }
  list.push({ key: `${runId}:customer`, kind: 'customer-delivery', researchRunId: runId, subject: null, technical: [`POST research-runs/${runId}/customer-delivery`] });
  return list;
}

const safe = (v: string) => v.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);

export function evidencePackFileName(researchRunId: string): string {
  return `genesis-evidence-pack-${safe(researchRunId)}.json`;
}

export function verifyReportFileName(verdict: string, reportFingerprint: string): string {
  return `genesis-verify-${verdict.toLowerCase()}-${reportFingerprint.slice(0, 12)}.html`;
}

export interface DeliveryView {
  status: string;
  statusWord: string;
  tone: Tone;
  exportAllowed: boolean;
  blockers: string[];
  artifact: { fileName: string; mediaType: string; content: string; sha256: string; byteLength: number } | null;
  technical: string[];
}

export function deliveryView(result: CustomerDeliveryResult, locale: Locale): DeliveryView {
  const d = result.delivery;
  const artifact = result.exportArtifact?.ok && result.exportArtifact.artifact ? result.exportArtifact.artifact : null;
  const blockers = (d.scientificBlockers ?? []).map((b) => (typeof b === 'string' && DELIVERY_BLOCKER_TEXT[b] ? pairText(DELIVERY_BLOCKER_TEXT[b]!, locale) : String(b)));
  return {
    status: d.status,
    statusWord: DELIVERY_STATUS_TEXT[d.status] ? pairText(DELIVERY_STATUS_TEXT[d.status]!, locale) : d.status,
    tone: d.exportAllowed ? 'good' : 'warn',
    exportAllowed: d.exportAllowed && artifact !== null,
    blockers,
    artifact,
    technical: [
      `status: ${d.status}`,
      `deliveryFingerprint: ${d.deliveryFingerprint}`,
      `delivered: ${String(d.delivered)}`,
      ...(d.scientificBlockers ?? []).map((b) => `scientificBlocker: ${String(b)}`),
      result.exportArtifact ? `export: ${result.exportArtifact.status}` : '',
      `boundary: ${d.approvalBoundary}`,
    ].filter(Boolean),
  };
}

/** A refused request in plain words; the code and the server's message stay in the technical rows. */
export function describeReportsFailure(failure: ApiFailure, locale: Locale): Notice {
  const key: ReportsTextKey = failure.error === 'compute_busy' ? 'errBusy'
    : failure.status === 0 ? 'errOffline' : failure.status === 401 ? 'errSignedOut' : failure.status === 403 ? 'errForbidden'
      : failure.status === 404 ? 'errNotFound' : failure.status === 409 ? 'errBlocked' : 'errOther';
  const body = failure.responseBody as { blockers?: unknown } | undefined;
  const blockers = Array.isArray(body?.blockers) ? body!.blockers.map((b) => `blocker: ${typeof b === 'string' ? b : JSON.stringify(b)}`) : [];
  return { tone: 'bad', lines: [rText(key, locale)], technical: [`${rText('errCode', locale)}: ${failure.status} ${failure.error}`, failure.message, ...blockers].filter((x) => x.length > 0) };
}
