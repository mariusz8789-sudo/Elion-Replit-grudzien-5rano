import { redact } from '../redact.mjs';
import { canonicalHash } from '../provenance.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,299}$/;
const STATUS = new Set(['QUEUED', 'RUNNING', 'SUCCESS', 'FAILED', 'TIMEOUT', 'CANCELLED', 'BLOCKED']);
const FORBIDDEN_KEYS = /^(secret|secrets|token|authorization|apiKey|password|privateDataset|rawDataset|inputBytes|outputBytes|stdout|stderr)$/i;

function containsForbiddenKey(value) {
  if (!value || typeof value !== 'object') return false;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.test(key) || containsForbiddenKey(nested)) return true;
  }
  return false;
}

function nonNegative(value) {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

export function createScientificExecutionEvent(input) {
  const errors = [];
  for (const field of ['requestId', 'researchRunId', 'experimentId', 'engineId']) if (!ID.test(input?.[field] ?? '')) errors.push(field);
  if (!STATUS.has(input?.status)) errors.push('status');
  if (!nonNegative(input?.timing?.runtimeMs ?? null)) errors.push('timing.runtimeMs');
  if (!nonNegative(input?.resources?.cpuMs ?? null)) errors.push('resources.cpuMs');
  if (!nonNegative(input?.resources?.maxMemoryMb ?? null)) errors.push('resources.maxMemoryMb');
  if (containsForbiddenKey(input)) errors.push('forbiddenSensitiveField');
  if (errors.length) return { ok: false, errors };
  const body = {
    observabilityVersion: 'scientific-execution-event@1',
    requestId: input.requestId,
    researchRunId: input.researchRunId,
    experimentId: input.experimentId,
    engineId: input.engineId,
    status: input.status,
    timing: Object.freeze({ startedAt: input.timing?.startedAt ?? null, finishedAt: input.timing?.finishedAt ?? null, runtimeMs: input.timing?.runtimeMs ?? null }),
    resources: Object.freeze({ cpuMs: input.resources?.cpuMs ?? null, maxMemoryMb: input.resources?.maxMemoryMb ?? null, computeClass: input.resources?.computeClass ?? 'UNKNOWN' }),
    errorCode: input.errorCode ?? null,
    errorDetail: input.errorDetail == null ? null : redact(String(input.errorDetail)).replace(/[\r\n\t]+/g, ' ').slice(0, 300),
    artifactRefs: Object.freeze([...(input.artifactRefs ?? [])]),
  };
  return { ok: true, event: Object.freeze({ ...body, fingerprint: canonicalHash(body) }) };
}
