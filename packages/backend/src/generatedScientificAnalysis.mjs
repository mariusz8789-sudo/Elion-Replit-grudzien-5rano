/**
 * Generated scientific analysis is a thin ResearchRun adapter, not another agent lifecycle.
 * The reasoning provider may only propose Python source. The existing ScientificSandboxPort is the
 * sole executor, and all proposal/execution/replay records are appended to the canonical
 * ResearchRun hash chain. A generated program and its output are always NOT_EVIDENCE.
 */
import { createHash } from 'node:crypto';
import { appendServerResearchStateEvent } from './agentRun.mjs';
import { parseProposalText } from './claimProposal.mjs';
import { buildSandboxExecutionPlan } from './compute/scientificSandboxContract.mjs';
import { canonicalHash } from './provenance.mjs';
import { getResearchRun, inWriteTransaction, RESEARCH_RUN_CONTRACT_VERSION } from './researchRun.mjs';
import { REASONING_ADAPTER_VERSION, ReasoningProviderError } from './reasoningProvider.mjs';

export const GENERATED_SCIENTIFIC_ANALYSIS_VERSION = 'generated-scientific-analysis@1';
export const GENERATED_ANALYSIS_EVENT_TYPES = Object.freeze([
  'GENERATED_ANALYSIS_PROPOSED',
  'GENERATED_ANALYSIS_EXECUTED',
  'GENERATED_ANALYSIS_REPLAYED',
]);

export const GENERATED_ANALYSIS_SYSTEM_PROMPT = `You propose one short Python analysis for Genesis. You cannot execute code and you cannot report a scientific result.

Return exactly one JSON object and nothing else:
{
  "source": "Python source code",
  "methodSummary": "A short description of the calculation, not hidden reasoning",
  "expectedOutputKeys": ["machine_readable_key"]
}

Rules:
1. The program must print exactly one JSON object to stdout and no other text.
2. Use only packages already pinned in the immutable sandbox image. Never install packages.
3. Do not use network, subprocesses, shell commands, environment variables, secrets or host files.
4. Do not claim that a computed value is a measurement or Evidence.
5. expectedOutputKeys must list every top-level key in the printed JSON object.`;

const STR = (value, max) => typeof value === 'string' && value.trim().length > 0 ? value.trim().slice(0, max) : null;
const KEY = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const PROVIDER_FAILURE = Object.freeze({
  NOT_CONFIGURED: 'BLOCKED_BY_PROVIDER_CONFIGURATION',
  TIMEOUT: 'PROVIDER_TIMEOUT',
  REFUSED: 'PROVIDER_REFUSED',
  UPSTREAM: 'PROVIDER_ERROR',
});

function proposalFromText(text) {
  const parsed = parseProposalText(text);
  if (!parsed.ok) return { ok: false, status: 'REJECTED_MALFORMED_RESPONSE', reason: parsed.reason };
  const keys = Object.keys(parsed.value).sort();
  if (keys.join(',') !== 'expectedOutputKeys,methodSummary,source') {
    return { ok: false, status: 'REJECTED_MALFORMED_RESPONSE', reason: 'unexpected_fields' };
  }
  const source = STR(parsed.value.source, 50_000);
  const methodSummary = STR(parsed.value.methodSummary, 1_000);
  const expectedOutputKeys = Array.isArray(parsed.value.expectedOutputKeys)
    ? [...new Set(parsed.value.expectedOutputKeys.map((value) => STR(value, 64)).filter(Boolean))]
    : [];
  if (!source || !methodSummary || expectedOutputKeys.length === 0 || expectedOutputKeys.length > 32 || expectedOutputKeys.some((key) => !KEY.test(key))) {
    return { ok: false, status: 'REJECTED_MALFORMED_RESPONSE', reason: 'invalid_generated_analysis' };
  }
  return { ok: true, proposal: { source, methodSummary, expectedOutputKeys: expectedOutputKeys.sort() } };
}

function parseSandboxOutput(stdout, expectedOutputKeys) {
  let output;
  try { output = JSON.parse(stdout); } catch { return { ok: false, failureCode: 'SANDBOX_OUTPUT_NOT_JSON' }; }
  if (!output || typeof output !== 'object' || Array.isArray(output)) return { ok: false, failureCode: 'SANDBOX_OUTPUT_NOT_OBJECT' };
  const actual = Object.keys(output).sort();
  if (actual.join(',') !== [...expectedOutputKeys].sort().join(',')) {
    return { ok: false, failureCode: 'SANDBOX_OUTPUT_SCHEMA_MISMATCH', actualKeys: actual };
  }
  return { ok: true, output: JSON.parse(JSON.stringify(output)) };
}

export function generatedAnalysesOf(researchState) {
  const byId = new Map();
  for (const event of researchState?.events ?? []) {
    if (!GENERATED_ANALYSIS_EVENT_TYPES.includes(event.type)) continue;
    const analysisId = event.payload?.analysisId;
    if (!analysisId) continue;
    if (!byId.has(analysisId)) byId.set(analysisId, { analysisId, proposal: null, execution: null, replays: [] });
    const entry = byId.get(analysisId);
    if (event.type === 'GENERATED_ANALYSIS_PROPOSED') entry.proposal = event.payload;
    if (event.type === 'GENERATED_ANALYSIS_EXECUTED') entry.execution = event.payload;
    if (event.type === 'GENERATED_ANALYSIS_REPLAYED') entry.replays.push(event.payload);
  }
  return [...byId.values()];
}

function ensureRunnable(current) {
  if (!current) return { ok: false, status: 'NOT_FOUND' };
  if (!current.researchState.chain.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE' };
  if (current.run.status !== 'RUNNING') return { ok: false, status: 'RUN_NOT_EXECUTABLE', reason: current.run.status };
  return { ok: true };
}

function executionPayload({ runId, analysisId, proposal, expectedPlan, sandboxResult }) {
  if (!sandboxResult?.ok) {
    return {
      contractVersion: RESEARCH_RUN_CONTRACT_VERSION,
      analysisVersion: GENERATED_SCIENTIFIC_ANALYSIS_VERSION,
      researchRunId: runId,
      analysisId,
      status: sandboxResult?.status ?? 'FAILED',
      failureCode: sandboxResult?.failureCode ?? 'SANDBOX_EXECUTION_FAILED',
      sourceHash: proposal.sourceHash,
      environmentFingerprint: expectedPlan.environmentFingerprint,
      epistemicStatus: 'NOT_EVIDENCE',
    };
  }
  const stdout = typeof sandboxResult.stdout === 'string' ? sandboxResult.stdout : '';
  const stderr = typeof sandboxResult.stderr === 'string' ? sandboxResult.stderr : '';
  const stdoutHash = sha256(stdout);
  const stderrHash = sha256(stderr);
  if (sandboxResult.sourceHash !== expectedPlan.sourceHash
    || sandboxResult.environmentFingerprint !== expectedPlan.environmentFingerprint
    || sandboxResult.stdoutHash !== stdoutHash
    || sandboxResult.stderrHash !== stderrHash) {
    return {
      contractVersion: RESEARCH_RUN_CONTRACT_VERSION,
      analysisVersion: GENERATED_SCIENTIFIC_ANALYSIS_VERSION,
      researchRunId: runId,
      analysisId,
      status: 'FAILED',
      failureCode: 'SANDBOX_PROVENANCE_MISMATCH',
      sourceHash: proposal.sourceHash,
      environmentFingerprint: expectedPlan.environmentFingerprint,
      epistemicStatus: 'NOT_EVIDENCE',
    };
  }
  const parsed = parseSandboxOutput(stdout, proposal.expectedOutputKeys);
  if (!parsed.ok) {
    return {
      contractVersion: RESEARCH_RUN_CONTRACT_VERSION,
      analysisVersion: GENERATED_SCIENTIFIC_ANALYSIS_VERSION,
      researchRunId: runId,
      analysisId,
      status: 'FAILED',
      failureCode: parsed.failureCode,
      actualKeys: parsed.actualKeys ?? null,
      sourceHash: proposal.sourceHash,
      environmentFingerprint: expectedPlan.environmentFingerprint,
      stdoutHash,
      stderrHash,
      epistemicStatus: 'NOT_EVIDENCE',
    };
  }
  const outputHash = canonicalHash(parsed.output);
  const payload = {
    contractVersion: RESEARCH_RUN_CONTRACT_VERSION,
    analysisVersion: GENERATED_SCIENTIFIC_ANALYSIS_VERSION,
    researchRunId: runId,
    analysisId,
    status: 'SUCCESS',
    output: parsed.output,
    outputHash,
    sourceHash: proposal.sourceHash,
    environmentFingerprint: expectedPlan.environmentFingerprint,
    stdoutHash,
    stderrHash,
    epistemicStatus: 'NOT_EVIDENCE',
    evidenceEligibility: 'REQUIRES_SEPARATE_REVIEW',
  };
  return { ...payload, executionFingerprint: canonicalHash(payload) };
}

function appendExecution(db, projectId, runId, payload, at) {
  const stored = inWriteTransaction(db, () => {
    const current = getResearchRun(db, projectId, runId);
    const runnable = ensureRunnable(current);
    if (!runnable.ok) return runnable;
    const analyses = generatedAnalysesOf(current.researchState);
    const existing = analyses.find((entry) => entry.analysisId === payload.analysisId)?.execution;
    if (existing) return { ok: true, deduped: true, execution: existing, researchRun: current };
    const appended = appendServerResearchStateEvent(db, runId, 'GENERATED_ANALYSIS_EXECUTED', payload, at);
    if (!appended.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE', reason: appended.error };
    const researchRun = getResearchRun(db, projectId, runId);
    return {
      ok: true,
      deduped: false,
      execution: generatedAnalysesOf(researchRun.researchState).find((entry) => entry.analysisId === payload.analysisId).execution,
      researchRun,
    };
  });
  if (!stored.ok) return stored;
  return {
    ...stored,
    ok: stored.execution.status === 'SUCCESS',
    status: stored.execution.status,
    failureCode: stored.execution.failureCode ?? null,
  };
}

export async function generateAndExecuteScientificAnalysis(db, projectId, runId, input = {}, dependencies = {}) {
  const before = getResearchRun(db, projectId, runId);
  const runnable = ensureRunnable(before);
  if (!runnable.ok) return runnable;
  if (!dependencies.sandboxPort || typeof dependencies.sandboxPort.execute !== 'function') {
    return { ok: false, status: 'BLOCKED_BY_CONFIGURATION', failureCode: 'CONTAINER_SANDBOX_BACKEND_NOT_CONFIGURED' };
  }
  const objective = STR(input.objective, 4_000) ?? before.question;
  if (!objective) return { ok: false, status: 'INVALID_REQUEST', reason: 'objective' };
  const requestFingerprint = canonicalHash({ researchRunId: runId, objective });
  const sameRequest = generatedAnalysesOf(before.researchState).filter((entry) => (entry.proposal?.requestFingerprint ?? null) === requestFingerprint);
  const failedAttempts = sameRequest.filter((entry) => entry.execution && entry.execution.status !== 'SUCCESS').length;
  const hasSuccess = sameRequest.some((entry) => entry.execution?.status === 'SUCCESS');
  // A failed attempt stays in the append-only chain; an explicit retry is a new attempt with its own analysisId.
  const attempt = input.retry === true && failedAttempts > 0 && !hasSuccess && sameRequest.every((entry) => entry.execution) ? failedAttempts : Math.max(0, sameRequest.length - 1);
  const analysisId = attempt === 0
    ? `analysis-${requestFingerprint.slice(0, 24)}`
    : `analysis-${canonicalHash({ requestFingerprint, attempt }).slice(0, 24)}`;
  let analysis = generatedAnalysesOf(before.researchState).find((entry) => entry.analysisId === analysisId);
  if (analysis?.execution) {
    return {
      ok: analysis.execution.status === 'SUCCESS',
      status: analysis.execution.status,
      failureCode: analysis.execution.failureCode ?? null,
      deduped: true,
      analysis,
      researchRun: before,
    };
  }

  if (!analysis?.proposal) {
    const provider = dependencies.provider;
    if (!provider?.configured) return { ok: false, status: 'BLOCKED_BY_PROVIDER_CONFIGURATION', reason: provider?.reason ?? 'NO_PROVIDER' };
    const prompt = `ResearchRun question:\n${before.question}\n\nAnalysis objective:\n${objective}\n\nReturn only the required JSON proposal.`;
    let completion;
    try {
      completion = await provider.complete({ system: GENERATED_ANALYSIS_SYSTEM_PROMPT, prompt, ...(dependencies.timeoutMs ? { timeoutMs: dependencies.timeoutMs } : {}) });
    } catch (error) {
      const status = error instanceof ReasoningProviderError ? PROVIDER_FAILURE[error.code] : 'PROVIDER_ERROR';
      return { ok: false, status: status ?? 'PROVIDER_ERROR' };
    }
    const parsed = proposalFromText(completion?.text);
    if (!parsed.ok) return parsed;
    const expectedPlan = buildSandboxExecutionPlan({
      sandboxRunId: analysisId,
      researchRunId: runId,
      experimentId: analysisId,
      language: 'python',
      source: parsed.proposal.source,
      datasetRefs: [],
    }, { image: dependencies.image });
    if (!expectedPlan.ok) return { ok: false, status: 'BLOCKED_BY_CONFIGURATION', failureCode: 'SANDBOX_PLAN_INVALID', errors: expectedPlan.errors };
    const payload = {
      contractVersion: RESEARCH_RUN_CONTRACT_VERSION,
      analysisVersion: GENERATED_SCIENTIFIC_ANALYSIS_VERSION,
      researchRunId: runId,
      analysisId,
      objective,
      requestFingerprint,
      source: parsed.proposal.source,
      sourceHash: expectedPlan.plan.sourceHash,
      methodSummary: parsed.proposal.methodSummary,
      expectedOutputKeys: parsed.proposal.expectedOutputKeys,
      environmentFingerprint: expectedPlan.plan.environmentFingerprint,
      generatedBy: {
        kind: 'EXTERNAL_REASONING_MODEL',
        providerId: provider.providerId,
        model: completion.model ?? provider.model,
        version: REASONING_ADAPTER_VERSION,
        promptFingerprint: canonicalHash({ system: GENERATED_ANALYSIS_SYSTEM_PROMPT, prompt }),
        responseFingerprint: canonicalHash({ text: completion.text }),
      },
      status: 'PROPOSED',
      epistemicStatus: 'NOT_EVIDENCE',
      executedByModel: false,
      requestedBy: dependencies.userId ?? null,
    };
    const appendedProposal = inWriteTransaction(db, () => {
      const current = getResearchRun(db, projectId, runId);
      const stillRunnable = ensureRunnable(current);
      if (!stillRunnable.ok) return stillRunnable;
      const duplicate = generatedAnalysesOf(current.researchState).find((entry) => entry.analysisId === analysisId)?.proposal;
      if (duplicate) return { ok: true, deduped: true, proposal: duplicate };
      const appended = appendServerResearchStateEvent(db, runId, 'GENERATED_ANALYSIS_PROPOSED', payload, dependencies.at);
      return appended.ok ? { ok: true, deduped: false, proposal: payload } : { ok: false, status: 'STATE_INTEGRITY_FAILURE', reason: appended.error };
    });
    if (!appendedProposal.ok) return appendedProposal;
    analysis = { analysisId, proposal: appendedProposal.proposal, execution: null, replays: [] };
  }

  const proposal = analysis.proposal;
  const expectedPlan = buildSandboxExecutionPlan({
    sandboxRunId: analysisId,
    researchRunId: runId,
    experimentId: analysisId,
    language: 'python',
    source: proposal.source,
    datasetRefs: [],
  }, { image: dependencies.image });
  if (!expectedPlan.ok || expectedPlan.plan.sourceHash !== proposal.sourceHash || expectedPlan.plan.environmentFingerprint !== proposal.environmentFingerprint) {
    return { ok: false, status: 'STATE_INTEGRITY_FAILURE', reason: 'frozen_sandbox_plan_drift' };
  }
  const sandboxResult = await dependencies.sandboxPort.execute({
    sandboxRunId: analysisId,
    researchRunId: runId,
    experimentId: analysisId,
    language: 'python',
    source: proposal.source,
    datasetRefs: [],
  }, { image: dependencies.image });
  const payload = executionPayload({ runId, analysisId, proposal, expectedPlan: expectedPlan.plan, sandboxResult });
  return appendExecution(db, projectId, runId, payload, dependencies.at);
}

export async function replayGeneratedScientificAnalysis(db, projectId, runId, analysisId, dependencies = {}) {
  const before = getResearchRun(db, projectId, runId);
  const runnable = ensureRunnable(before);
  if (!runnable.ok) return runnable;
  if (!dependencies.sandboxPort || typeof dependencies.sandboxPort.execute !== 'function') {
    return { ok: false, status: 'BLOCKED_BY_CONFIGURATION', failureCode: 'CONTAINER_SANDBOX_BACKEND_NOT_CONFIGURED' };
  }
  const analysis = generatedAnalysesOf(before.researchState).find((entry) => entry.analysisId === analysisId);
  if (!analysis?.proposal) return { ok: false, status: 'ANALYSIS_NOT_FOUND' };
  if (analysis.execution?.status !== 'SUCCESS') return { ok: false, status: 'ANALYSIS_NOT_REPLAYABLE' };
  const request = {
    sandboxRunId: analysisId,
    researchRunId: runId,
    experimentId: analysisId,
    language: 'python',
    source: analysis.proposal.source,
    datasetRefs: [],
  };
  const expectedPlan = buildSandboxExecutionPlan(request, { image: dependencies.image });
  if (!expectedPlan.ok || expectedPlan.plan.sourceHash !== analysis.proposal.sourceHash
    || expectedPlan.plan.environmentFingerprint !== analysis.proposal.environmentFingerprint) {
    return { ok: false, status: 'STATE_INTEGRITY_FAILURE', reason: 'frozen_sandbox_plan_drift' };
  }
  const sandboxResult = await dependencies.sandboxPort.execute(request, { image: dependencies.image });
  const replayExecution = executionPayload({ runId, analysisId, proposal: analysis.proposal, expectedPlan: expectedPlan.plan, sandboxResult });
  const matches = replayExecution.status === 'SUCCESS'
    && replayExecution.sourceHash === analysis.execution.sourceHash
    && replayExecution.environmentFingerprint === analysis.execution.environmentFingerprint
    && replayExecution.outputHash === analysis.execution.outputHash
    && replayExecution.stdoutHash === analysis.execution.stdoutHash
    && replayExecution.stderrHash === analysis.execution.stderrHash;
  const payload = {
    contractVersion: RESEARCH_RUN_CONTRACT_VERSION,
    analysisVersion: GENERATED_SCIENTIFIC_ANALYSIS_VERSION,
    researchRunId: runId,
    analysisId,
    replayIndex: analysis.replays.length,
    verdict: matches ? 'MATCH' : 'DRIFT',
    originalExecutionFingerprint: analysis.execution.executionFingerprint,
    replayExecutionFingerprint: replayExecution.executionFingerprint ?? canonicalHash(replayExecution),
    sourceHash: replayExecution.sourceHash,
    environmentFingerprint: replayExecution.environmentFingerprint,
    outputHash: replayExecution.outputHash ?? null,
    stdoutHash: replayExecution.stdoutHash ?? null,
    stderrHash: replayExecution.stderrHash ?? null,
    failureCode: replayExecution.failureCode ?? null,
    epistemicStatus: 'NOT_EVIDENCE',
  };
  return inWriteTransaction(db, () => {
    const current = getResearchRun(db, projectId, runId);
    const stillRunnable = ensureRunnable(current);
    if (!stillRunnable.ok) return stillRunnable;
    const appended = appendServerResearchStateEvent(db, runId, 'GENERATED_ANALYSIS_REPLAYED', payload, dependencies.at);
    if (!appended.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE', reason: appended.error };
    return { ok: true, status: 'REPLAYED', verdict: payload.verdict, replay: payload, researchRun: getResearchRun(db, projectId, runId) };
  });
}
