import { canonicalHash } from '../provenance.mjs';
import {
  DISPATCH_STATE,
  computeInputFingerprint,
  computeOutputFingerprint,
  getCapabilityContract,
  validateCapabilityInput,
} from './scientificCapabilityContract.mjs';

export const ENGINE_EXECUTION_CONTRACT_VERSION = 'engine-execution@1';
export const ENGINE_EXECUTION_ADAPTER_VERSION = 'genesis-dispatch-adapter@1';

export const ENGINE_EXECUTION_STATUS = Object.freeze({
  SUCCESS: 'SUCCESS',
  BLOCKED_BY_RUNTIME: 'BLOCKED_BY_RUNTIME',
  BLOCKED_BY_CONFIGURATION: 'BLOCKED_BY_CONFIGURATION',
  BLOCKED_BY_DATA: 'BLOCKED_BY_DATA',
  BLOCKED_BY_LICENSE: 'BLOCKED_BY_LICENSE',
  TIMEOUT: 'TIMEOUT',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
});

const TERMINAL = new Set(Object.values(ENGINE_EXECUTION_STATUS));
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,299}$/;

export function validateEngineExecutionRequest(request) {
  const errors = [];
  for (const field of ['researchRunId', 'experimentId', 'executionId', 'capabilityId']) {
    if (typeof request?.[field] !== 'string' || !ID.test(request[field])) errors.push(`${field}: invalid`);
  }
  const contract = typeof request?.capabilityId === 'string' ? getCapabilityContract(request.capabilityId) : null;
  if (!contract) errors.push('capabilityId: no canonical capability contract');
  const input = contract ? validateCapabilityInput(request.capabilityId, request.input) : { ok: false, errors: [] };
  if (contract && !input.ok) errors.push(...input.errors.map((error) => `input: ${error}`));
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      contractVersion: ENGINE_EXECUTION_CONTRACT_VERSION,
      researchRunId: request.researchRunId,
      experimentId: request.experimentId,
      executionId: request.executionId,
      capabilityId: request.capabilityId,
      engineId: contract.toolId,
      input: request.input,
      inputHash: computeInputFingerprint(request.capabilityId, request.input),
      replayCapability: typeof request.replayCapability === 'string' ? request.replayCapability : 'NOT_DECLARED',
    },
  };
}

function statusForDispatch(outcome) {
  if (outcome?.ok) return ENGINE_EXECUTION_STATUS.SUCCESS;
  if (outcome?.error === 'REQUEST_ABORTED') return ENGINE_EXECUTION_STATUS.CANCELLED;
  switch (outcome?.state) {
    case DISPATCH_STATE.BLOCKED_WORKER_NOT_CONFIGURED: return ENGINE_EXECUTION_STATUS.BLOCKED_BY_CONFIGURATION;
    case DISPATCH_STATE.BLOCKED_WORKER_UNAVAILABLE:
    case DISPATCH_STATE.BLOCKED_ENGINE_UNAVAILABLE: return ENGINE_EXECUTION_STATUS.BLOCKED_BY_RUNTIME;
    case DISPATCH_STATE.BLOCKED_INVALID_INPUT: return ENGINE_EXECUTION_STATUS.BLOCKED_BY_DATA;
    case DISPATCH_STATE.WORKER_TIMEOUT: return ENGINE_EXECUTION_STATUS.TIMEOUT;
    default: return ENGINE_EXECUTION_STATUS.FAILED;
  }
}

function record(request, outcome, timing, overrides = {}) {
  const status = overrides.status ?? statusForDispatch(outcome);
  const result = outcome?.ok ? outcome.result : null;
  const outputHash = outcome?.ok ? computeOutputFingerprint(result) : null;
  const engine = outcome?.engine ?? null;
  const base = {
    contractVersion: ENGINE_EXECUTION_CONTRACT_VERSION,
    researchRunId: request.researchRunId,
    experimentId: request.experimentId,
    executionId: request.executionId,
    capabilityId: request.capabilityId,
    engineId: engine?.toolId ?? request.engineId,
    engineVersion: engine?.version ?? null,
    adapterVersion: ENGINE_EXECUTION_ADAPTER_VERSION,
    environmentIdentity: outcome?.environmentFingerprint ?? null,
    inputHash: request.inputHash,
    outputHash,
    startedAt: timing.startedAt,
    finishedAt: timing.finishedAt,
    runtimeMs: Math.max(0, timing.finishedMs - timing.startedMs),
    status,
    stdoutRef: null,
    stderrRef: null,
    artifactRefs: [],
    failureCode: status === ENGINE_EXECUTION_STATUS.SUCCESS ? null : overrides.failureCode ?? outcome?.error ?? 'EXECUTION_FAILED',
    replayCapability: request.replayCapability,
  };
  return { ...base, recordHash: canonicalHash(base) };
}

function blockedRecord(request, admission, timing) {
  const status = TERMINAL.has(admission?.status) && admission.status !== ENGINE_EXECUTION_STATUS.SUCCESS
    ? admission.status
    : ENGINE_EXECUTION_STATUS.BLOCKED_BY_CONFIGURATION;
  return record(request, null, timing, { status, failureCode: admission?.failureCode ?? 'ADMISSION_BLOCKED' });
}

export function createEngineExecutionPort({ executor, admit = async () => ({ ok: true }), now = () => new Date() } = {}) {
  if (!executor || typeof executor.execute !== 'function') throw new Error('engine execution port requires an existing canonical executor');
  return Object.freeze({
    contractVersion: ENGINE_EXECUTION_CONTRACT_VERSION,
    async execute(rawRequest, { signal = null } = {}) {
      const validated = validateEngineExecutionRequest(rawRequest);
      if (!validated.ok) return { ok: false, errors: validated.errors, record: null };
      const request = validated.value;
      const started = now();
      const timing = () => {
        const finished = now();
        return { startedAt: started.toISOString(), finishedAt: finished.toISOString(), startedMs: started.getTime(), finishedMs: finished.getTime() };
      };
      if (signal?.aborted) {
        return { ok: false, errors: [], record: record(request, { error: 'REQUEST_ABORTED' }, timing(), { status: ENGINE_EXECUTION_STATUS.CANCELLED, failureCode: 'REQUEST_ABORTED' }) };
      }
      let admission;
      try { admission = await admit(request); } catch {
        admission = { ok: false, status: ENGINE_EXECUTION_STATUS.BLOCKED_BY_CONFIGURATION, failureCode: 'ADMISSION_CHECK_FAILED' };
      }
      if (!admission?.ok) return { ok: false, errors: [], record: blockedRecord(request, admission, timing()) };
      let outcome;
      try {
        outcome = await executor.execute({ capabilityId: request.capabilityId, executionId: request.executionId, input: request.input, signal });
      } catch {
        outcome = { ok: false, state: DISPATCH_STATE.ENGINE_FAILED, error: 'EXECUTOR_THREW' };
      }
      const executionRecord = record(request, outcome, timing());
      return { ok: executionRecord.status === ENGINE_EXECUTION_STATUS.SUCCESS, errors: [], record: executionRecord, ...(outcome?.ok ? { result: outcome.result } : {}) };
    },
  });
}
