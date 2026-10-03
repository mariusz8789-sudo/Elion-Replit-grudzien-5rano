/**
 * Science Flight Control / Experiment Firewall.
 *
 * This is a read-only projection over the canonical Virtual Lab campaign
 * events. It owns no lifecycle, persistence, Evidence, Replay or BYT state.
 * Every decision points back to the append-only event that proves it.
 */
import { sha256Hex16 as sha16 } from '../provenance.mjs';

export const SCIENCE_FLIGHT_CONTROL_CONTRACT_VERSION = '1.0.0';

export const FLIGHT_STATUS = Object.freeze({
  READY_TO_EXECUTE: 'READY_TO_EXECUTE',
  AWAITING_EVIDENCE: 'AWAITING_EVIDENCE',
  AWAITING_REPLAY: 'AWAITING_REPLAY',
  VERIFIED: 'VERIFIED',
  BLOCKED: 'BLOCKED',
  BLOCKED_RETRYABLE: 'BLOCKED_RETRYABLE',
  FAILED: 'FAILED',
});

export const FAILURE_LAYER = Object.freeze({
  PREFLIGHT: 'PREFLIGHT',
  RESEARCH_GATE: 'RESEARCH_GATE',
  CAPABILITY_BINDING: 'CAPABILITY_BINDING',
  RUNTIME: 'RUNTIME',
  WORKER_TRANSPORT: 'WORKER_TRANSPORT',
  ENGINE: 'ENGINE',
  REPLAY: 'REPLAY',
});

const EXECUTED = 'EXECUTED_COMPUTATIONAL_EXPERIMENT';
const FAILED_ENGINE = 'FAILED_ENGINE';
const BLOCKED_INVALID_INPUT = 'BLOCKED_INVALID_INPUT';
const BLOCKED_UNBOUND_ENGINE = 'BLOCKED_UNBOUND_ENGINE';
const BLOCKED_RUNTIME_UNAVAILABLE = 'BLOCKED_RUNTIME_UNAVAILABLE';
const REPLAY_MATCH = 'REPLAY_MATCH';

function latestFor(events, executionId) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index]?.payload?.executionId === executionId) return events[index];
  }
  return null;
}

function sourceRef(event) {
  return event ? { eventId: event.id, eventType: event.type, occurredAt: event.createdAt } : null;
}

function preflightOf(planEvent) {
  const plan = planEvent.payload ?? {};
  const checks = [
    {
      check: 'INPUT_FROZEN',
      status: typeof plan.inputFingerprint === 'string' && plan.inputFingerprint.length > 0 ? 'PASS' : 'FAIL',
      detail: plan.inputFingerprint ?? 'input_fingerprint_missing',
    },
    {
      check: 'CAPABILITY_ADMITTED',
      status: typeof plan.requestedCapability === 'string' && plan.requestedCapability.length > 0 ? 'PASS' : 'FAIL',
      detail: plan.requestedCapability ?? 'requested_capability_missing',
    },
    {
      check: 'RESEARCH_GATE',
      status: plan.researchGate?.reason === 'SAFETY_VETO' ? 'FAIL' : 'PASS',
      detail: plan.researchGate ?? { verdict: 'UNKNOWN', reason: 'NOT_RECORDED' },
    },
    {
      check: 'CLAIM_BOUNDARY',
      status: plan.clinicalEfficacy === 'UNKNOWN' && typeof plan.claimBoundary === 'string' ? 'PASS' : 'FAIL',
      detail: plan.claimBoundary ?? 'claim_boundary_missing',
    },
  ];
  const failed = checks.find((check) => check.status === 'FAIL') ?? null;
  return {
    decision: failed ? 'BLOCKED' : 'CLEARED',
    inputFingerprint: plan.inputFingerprint ?? null,
    requestedCapability: plan.requestedCapability ?? null,
    budget: plan.budget ?? null,
    expectation: plan.expectation ?? null,
    checks,
    source: sourceRef(planEvent),
  };
}

function executionDeltaOf(planEvent, resultEvent) {
  const plan = planEvent.payload ?? {};
  const result = resultEvent?.payload ?? null;
  if (!result) {
    return {
      observed: false,
      inputIntegrity: 'NOT_OBSERVED',
      plannedCapability: plan.requestedCapability ?? null,
      selectedEngine: null,
      computeBudgetSeconds: plan.budget?.maxComputeSeconds ?? null,
      actualDurationMs: null,
      budgetVerdict: 'NOT_OBSERVED',
      plannedExpectation: plan.expectation ?? null,
      observedClassification: null,
    };
  }
  const inputMatches = result.executionId === plan.executionId
    && result.candidateId === plan.candidateId
    && result.requestedCapability === plan.requestedCapability;
  const maxSeconds = plan.budget?.maxComputeSeconds;
  const durationMs = typeof result.durationMs === 'number' ? result.durationMs : null;
  const budgetVerdict = typeof maxSeconds !== 'number'
    ? 'NOT_DECLARED'
    : durationMs === null
      ? 'NOT_OBSERVED'
      : durationMs <= maxSeconds * 1000 ? 'WITHIN_BUDGET' : 'EXCEEDED';
  return {
    observed: true,
    inputIntegrity: inputMatches ? 'MATCH' : 'DRIFT',
    plannedCapability: plan.requestedCapability ?? null,
    selectedEngine: result.selectedEngine ?? null,
    scienceRunId: result.scienceRunId ?? null,
    outputFingerprint: result.outputFingerprint ?? null,
    computeBudgetSeconds: maxSeconds ?? null,
    actualDurationMs: durationMs,
    budgetVerdict,
    plannedExpectation: plan.expectation ?? null,
    observedClassification: result.epistemicClassification ?? null,
    source: sourceRef(resultEvent),
  };
}

function failureOf({ preflight, resultEvent, dispatchFailureEvent, replayEvent }) {
  if (preflight.decision !== 'CLEARED') {
    const gateFailed = preflight.checks.some((check) => check.check === 'RESEARCH_GATE' && check.status === 'FAIL');
    return {
      layer: gateFailed ? FAILURE_LAYER.RESEARCH_GATE : FAILURE_LAYER.PREFLIGHT,
      code: gateFailed ? 'SAFETY_VETO' : 'PREFLIGHT_REFUSED',
      retryable: false,
      source: preflight.source,
    };
  }
  const result = resultEvent?.payload ?? null;
  if (!result && dispatchFailureEvent) {
    return {
      layer: FAILURE_LAYER.WORKER_TRANSPORT,
      code: dispatchFailureEvent.payload?.dispatch?.state ?? 'REMOTE_DISPATCH_FAILED',
      reason: dispatchFailureEvent.payload?.reason ?? null,
      retryable: true,
      source: sourceRef(dispatchFailureEvent),
    };
  }
  if (result?.status === BLOCKED_UNBOUND_ENGINE) {
    return { layer: FAILURE_LAYER.CAPABILITY_BINDING, code: result.status, reason: result.reason ?? null, retryable: false, source: sourceRef(resultEvent) };
  }
  if (result?.status === BLOCKED_RUNTIME_UNAVAILABLE) {
    return { layer: FAILURE_LAYER.RUNTIME, code: result.dispatch?.state ?? result.status, reason: result.reason ?? null, retryable: false, source: sourceRef(resultEvent) };
  }
  if (result?.status === BLOCKED_INVALID_INPUT) {
    const safetyVeto = String(result.reason ?? '').includes('SAFETY_VETO');
    return { layer: safetyVeto ? FAILURE_LAYER.RESEARCH_GATE : FAILURE_LAYER.PREFLIGHT, code: safetyVeto ? 'SAFETY_VETO' : result.status, reason: result.reason ?? null, retryable: false, source: sourceRef(resultEvent) };
  }
  if (result?.status === FAILED_ENGINE) {
    return { layer: FAILURE_LAYER.ENGINE, code: result.dispatch?.state ?? result.status, reason: result.reason ?? null, retryable: false, source: sourceRef(resultEvent) };
  }
  const replay = replayEvent?.payload ?? null;
  if (replay && replay.replayStatus !== REPLAY_MATCH) {
    return { layer: FAILURE_LAYER.REPLAY, code: replay.replayStatus, reason: replay.detail ?? null, retryable: replay.replayStatus === 'REPLAY_BLOCKED_BY_RUNTIME', source: sourceRef(replayEvent) };
  }
  return null;
}

function statusOf({ preflight, resultEvent, evidenceEvent, replayEvent, dispatchFailureEvent, failure }) {
  if (preflight.decision !== 'CLEARED') return FLIGHT_STATUS.BLOCKED;
  if (!resultEvent) return dispatchFailureEvent ? FLIGHT_STATUS.BLOCKED_RETRYABLE : FLIGHT_STATUS.READY_TO_EXECUTE;
  if (resultEvent.payload?.status === FAILED_ENGINE) return FLIGHT_STATUS.FAILED;
  if (resultEvent.payload?.status !== EXECUTED) return FLIGHT_STATUS.BLOCKED;
  if (!evidenceEvent) return FLIGHT_STATUS.AWAITING_EVIDENCE;
  if (!replayEvent) return FLIGHT_STATUS.AWAITING_REPLAY;
  if (failure) return FLIGHT_STATUS.BLOCKED;
  return FLIGHT_STATUS.VERIFIED;
}

function bytUpdateOf({ status, resultEvent, evidenceEvent, replayEvent, failure }) {
  const result = resultEvent?.payload ?? null;
  const classification = result?.epistemicClassification ?? null;
  const epistemicState = !result || result.status !== EXECUTED
    ? 'UNKNOWN'
    : classification === 'IN_SILICO_CONFLICT' ? 'CONTRADICTED' : 'SIMULATED';
  return {
    mode: 'DERIVED_READ_MODEL_ONLY',
    persistence: 'NONE',
    status: status === FLIGHT_STATUS.VERIFIED ? 'ELIGIBLE_FOR_SELF_MODEL_PROJECTION' : 'INCOMPLETE',
    epistemicState,
    classification,
    scienceRunRef: result?.scienceRunId ? `science_run:${result.scienceRunId}` : null,
    evidenceRef: evidenceEvent?.payload?.proposalId ? `evidence_proposal:${evidenceEvent.payload.proposalId}` : null,
    replayRef: replayEvent?.payload?.verificationId ? `verification:${replayEvent.payload.verificationId}` : null,
    failureLayer: failure?.layer ?? null,
    limitation: 'This is an in-silico operational observation projected from canonical records; it is not a physical or clinical measurement.',
  };
}

/**
 * Projects one control record per frozen Virtual Lab plan. The function is
 * deterministic and never mutates or appends to its sources.
 */
export function projectScienceFlightControl({ plans = [], results = [], replays = [], evidenceLinks = [], dispatchFailures = [] } = {}) {
  const flights = plans.map((planEvent) => {
    const executionId = planEvent.payload?.executionId ?? null;
    const resultEvent = latestFor(results, executionId);
    const replayEvent = latestFor(replays, executionId);
    const evidenceEvent = latestFor(evidenceLinks, executionId);
    const dispatchFailureEvent = latestFor(dispatchFailures, executionId);
    const preflight = preflightOf(planEvent);
    const executionDelta = executionDeltaOf(planEvent, resultEvent);
    const failureAttribution = failureOf({ preflight, resultEvent, dispatchFailureEvent, replayEvent });
    const status = statusOf({ preflight, resultEvent, evidenceEvent, replayEvent, dispatchFailureEvent, failure: failureAttribution });
    const evidenceUpdate = evidenceEvent ? {
      status: 'PROPOSED_REQUIRES_HUMAN_APPROVAL',
      proposalId: evidenceEvent.payload?.proposalId ?? null,
      source: sourceRef(evidenceEvent),
    } : { status: resultEvent?.payload?.status === EXECUTED ? 'MISSING' : 'NOT_ELIGIBLE', proposalId: null, source: null };
    const replay = replayEvent ? {
      status: replayEvent.payload?.replayStatus ?? 'UNKNOWN',
      verificationId: replayEvent.payload?.verificationId ?? null,
      source: sourceRef(replayEvent),
    } : { status: 'NOT_YET_REPLAYED', verificationId: null, source: null };
    const base = {
      contractVersion: SCIENCE_FLIGHT_CONTROL_CONTRACT_VERSION,
      executionId,
      status,
      preflight,
      executionDelta,
      failureAttribution,
      evidenceUpdate,
      replay,
    };
    return {
      ...base,
      bytUpdate: bytUpdateOf({ status, resultEvent, evidenceEvent, replayEvent, failure: failureAttribution }),
      flightFingerprint: sha16(base),
    };
  });
  const summary = {
    total: flights.length,
    ready: flights.filter((flight) => flight.status === FLIGHT_STATUS.READY_TO_EXECUTE).length,
    verified: flights.filter((flight) => flight.status === FLIGHT_STATUS.VERIFIED).length,
    blocked: flights.filter((flight) => [FLIGHT_STATUS.BLOCKED, FLIGHT_STATUS.BLOCKED_RETRYABLE].includes(flight.status)).length,
    failed: flights.filter((flight) => flight.status === FLIGHT_STATUS.FAILED).length,
  };
  return {
    contractVersion: SCIENCE_FLIGHT_CONTROL_CONTRACT_VERSION,
    mode: 'READ_ONLY_PROJECTION_OF_CANONICAL_EVENTS',
    summary,
    flights,
    controlFingerprint: sha16({ v: SCIENCE_FLIGHT_CONTROL_CONTRACT_VERSION, flights: flights.map((flight) => flight.flightFingerprint) }),
  };
}
