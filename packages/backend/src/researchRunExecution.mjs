/**
 * R1-b — FROM THE PLAN TO ONE EXECUTED, FALSIFIED EXPERIMENT.
 *
 * Takes one experiment the model proposed in R1-a and carries it through the canonical pieces Genesis
 * already has. Nothing here is a second research loop or a second ledger:
 *
 *   PREDICTIONS_FROZEN   the prediction is preregistered in scientific memory (experimentMemory.mjs,
 *                        experiment_records, append-only and hash-chained) BEFORE the engine runs
 *   EXPERIMENT_HANDOFF   the engine runs through its existing adapter; the execution record keeps the
 *                        run id, the prediction fingerprint, engine id and version, input and output
 *                        hashes and the environment
 *   SELF_FALSIFICATION   the result is sealed against the preregistration; the server derives the verdict
 *                        from the frozen criticality (experimentMemory.deriveVerdict)
 *   EVIDENCE_UPDATE      an evidence PROPOSAL in the canonical ledger (knowledgeApi.proposeStructuredEvidence);
 *                        publishing it stays a human decision
 *   (replay)             R1-c: the engine output is also a canonical Scientific Run (science_runs), and the
 *                        existing replay (campaign/verify.mjs) re-runs it once and compares output hashes;
 *                        the verification row is the existing append-only one
 *   NEXT_EXPERIMENT      the next proposal, chosen by a fixed rule from the plan, not by a model; it carries
 *                        the replay verdict, and anything but MATCH stops at HUMAN_REVIEW
 *
 * SUPPORTED_WITHIN_PROTOCOL / FALSIFIED_WITHIN_PROTOCOL / INCONCLUSIVE describe only this frozen hypothesis under this protocol (engine,
 * input, criteria). They are never a statement of scientific truth.
 *
 * An engine that is not available now gives BLOCKED and nothing is written past what already exists:
 * no mock, no substitute result, no silent switch to another engine. Every step is idempotent and each
 * one re-reads the persisted chain, so a restart at any point resumes the same experiment instead of
 * losing or repeating it.
 */
import { verifyDatasetBytes } from './datasets/runDatasets.mjs';
import { canonicalJson, fnv1a, sha256Hex } from './determinism.mjs';
import { buildDecisionTrace } from './decisionTrace.mjs';
import { appendServerResearchStateEvent } from './agentRun.mjs';
import { deriveVerdict, preregisterExperiment, sealExperimentSession } from './experimentMemory.mjs';
import { proposeStructuredEvidence } from './knowledgeApi.mjs';
import { buildProjectBytProjection } from './cognitiveState.mjs';
import { normalizeText } from './knowledgeRecall.mjs';
import { priorFalsifiedClaims } from './knowledgeSynthesis.mjs';
import { getResearchRun, inWriteTransaction, RESEARCH_RUN_CONTRACT_VERSION, researchSteeringOf } from './researchRun.mjs';
import { DEFAULT_RESEARCH_TOOLS, MAX_PREDICTIONS, PREDICTION_OPERATORS } from './researchRunEngines.mjs';
import { getScienceRun, listScienceRunVerifications, saveScienceRun } from './store.mjs';
import { sha256Hex16 } from './provenance.mjs';
import { VERDICT as REPLAY_VERDICT, verifyScienceRun } from './campaign/verify.mjs';

export const EXECUTION_RECORD_VERSION = 'research-run-execution@1';
export const VERDICT_SCOPE = 'Applies only to this frozen hypothesis under this protocol (engine, input, criteria). It is not a statement of scientific truth.';
/** experimentMemory's verdict vocabulary → the words Genesis shows for one protocol. */
export const PROTOCOL_VERDICT = Object.freeze({ SUPPORTED: 'SUPPORTED_WITHIN_PROTOCOL', FALSIFIED: 'FALSIFIED_WITHIN_PROTOCOL', WEAKENED: 'INCONCLUSIVE', UNRESOLVED: 'INCONCLUSIVE' });
const EVIDENCE_CLASSES = new Set(['REAL_ENGINE_OUTPUT', 'MODEL_ESTIMATE', 'REFERENCE_DATA', 'SIMULATED', 'DERIVED']);
/**
 * The ledger requires a confidence. 0.5 is not a belief score: it keeps a computational result at
 * 'candidate' in classifyClaim, never 'verified', whatever the verdict.
 */
const EVIDENCE_CONFIDENCE = 0.5;
/** Replay outcome for an experiment whose engine rejected the input: there is no output to re-run. */
export const REPLAY_NOT_APPLICABLE = 'NOT_APPLICABLE';
/** The canonical Scientific Run id of one experiment's engine output. Deterministic, so a retry never stores it twice. */
export const scienceRunIdOf = (researchRunId, experimentId) => `rr-${sha256Hex(canonicalJson({ researchRunId, experimentId })).slice(0, 32)}`;

export const experimentIdOf = (researchRunId, hypothesisId) => `exp-${fnv1a(canonicalJson({ researchRunId, hypothesisId }))}`;
/** Scientific memory is keyed by campaign id; a research-run experiment gets its own key there. */
export const preregistrationKeyOf = (researchRunId, experimentId) => `research-run:${researchRunId}:${experimentId}`;

/* ---------------- what can be executed ---------------- */

export function parsePredictions(raw, executor) {
  const criteria = [];
  const rejected = [];
  for (const [index, p] of (Array.isArray(raw) ? raw : []).entries()) {
    const observable = typeof p?.observable === 'string' ? p.observable.trim() : '';
    const type = executor.observables[observable];
    const reject = (reason) => rejected.push({ index, reason });
    if (!type) { reject(`unknown_observable:${observable || '(none)'}`); continue; }
    if (!PREDICTION_OPERATORS.includes(p.operator)) { reject('operator_invalid'); continue; }
    if (type === 'number' && !(typeof p.value === 'number' && Number.isFinite(p.value))) { reject('value_not_a_number'); continue; }
    if (type === 'boolean' && (typeof p.value !== 'boolean' || !['==', '!='].includes(p.operator))) { reject('boolean_needs_==_or_!='); continue; }
    const hasExpected = p.expectedValue !== undefined;
    const hasTolerance = p.surpriseTolerance !== undefined;
    if (hasExpected !== hasTolerance) { reject('surprise_rule_requires_expected_value_and_tolerance'); continue; }
    if (hasExpected && type !== 'number') { reject('surprise_rule_requires_numeric_observable'); continue; }
    if (hasExpected && !(typeof p.expectedValue === 'number' && Number.isFinite(p.expectedValue))) { reject('surprise_expected_value_invalid'); continue; }
    if (hasTolerance && !(typeof p.surpriseTolerance === 'number' && Number.isFinite(p.surpriseTolerance) && p.surpriseTolerance > 0)) { reject('surprise_tolerance_invalid'); continue; }
    if (criteria.length >= MAX_PREDICTIONS) { reject('over_limit'); continue; }
    criteria.push({
      id: `c${criteria.length}-${observable}`,
      label: `${observable} ${p.operator} ${JSON.stringify(p.value)}`,
      observable,
      operator: p.operator,
      value: p.value,
      critical: p.critical !== false,
      threshold: typeof p.value === 'number' ? p.value : null,
      evidence: 'MODEL_ESTIMATE',
      ...(hasExpected ? {
        surpriseRule: {
          kind: 'ABSOLUTE_ERROR_EXCEEDS',
          expectedValue: p.expectedValue,
          tolerance: p.surpriseTolerance,
        },
      } : {}),
    });
  }
  return { criteria, rejected };
}

/** Can Genesis run this hypothesis's experiment itself? Pure; engine availability is checked separately. */
export function executabilityOf(hypothesis, executors) {
  const exp = hypothesis?.experimentProposal;
  if (!exp) return { executable: false, reason: 'NO_EXPERIMENT_PROPOSED' };
  if (exp.decision !== 'PROPOSED') return { executable: false, reason: `EXPERIMENT_${exp.decision}` };
  const executor = executors[exp.engineId];
  if (!executor) return { executable: false, blocked: true, engineId: exp.engineId, reason: 'NO_RESEARCH_RUN_ADAPTER' };
  const input = executor.parseInput(exp.parameters);
  if (!input.ok) return { executable: false, engineId: exp.engineId, reason: `INPUT_NOT_EXECUTABLE:${input.reason}` };
  const { criteria, rejected } = parsePredictions(exp.parameters?.predictions, executor);
  if (criteria.length === 0) return { executable: false, engineId: exp.engineId, reason: 'NO_MACHINE_CHECKABLE_PREDICTION', rejectedPredictions: rejected };
  return { executable: true, engineId: exp.engineId, executor, input: input.input, criteria, rejectedPredictions: rejected };
}

function compare(observed, operator, value) {
  switch (operator) {
    case '<': return observed < value;
    case '<=': return observed <= value;
    case '>': return observed > value;
    case '>=': return observed >= value;
    case '==': return observed === value;
    case '!=': return observed !== value;
    default: return null;
  }
}

/** Each frozen criterion against the engine output. Anything the output cannot decide is UNRESOLVED. */
export function judgeCriteria(criteria, execution, executor) {
  return criteria.map((c) => {
    const observed = execution.status === 'EXECUTED' ? execution.output?.[c.observable] : undefined;
    const typed = observed !== undefined && typeof observed === executor.observables[c.observable];
    const met = typed ? compare(observed, c.operator, c.value) : null;
    return {
      id: c.id, label: c.label, observable: c.observable, operator: c.operator, value: c.value,
      critical: c.critical, observed: typed ? observed : null,
      status: met === null ? 'UNRESOLVED' : met ? 'MET' : 'NOT_MET',
      ...(c.surpriseRule ? { surpriseRule: c.surpriseRule } : {}),
    };
  });
}

/** A deterministic anomaly derived only from a frozen numeric expectation and a real observation. */
export function deriveSurpriseItems(criteria) {
  return criteria.flatMap((criterion) => {
    const rule = criterion.surpriseRule;
    if (rule?.kind !== 'ABSOLUTE_ERROR_EXCEEDS' || typeof criterion.observed !== 'number') return [];
    const absoluteError = Math.abs(criterion.observed - rule.expectedValue);
    if (!(absoluteError > rule.tolerance)) return [];
    return [{
      criterionId: criterion.id,
      observable: criterion.observable,
      rule,
      observedValue: criterion.observed,
      absoluteError,
    }];
  });
}

/* ---------------- the next experiment (a fixed rule, no model) ---------------- */

export function nextExperimentProposal(plan, doneHypothesisIds, lastVerdict, executors, replayVerdict = null, steering = {}, lastHypothesisId = null) {
  if (replayVerdict && replayVerdict !== REPLAY_VERDICT.MATCH && replayVerdict !== REPLAY_NOT_APPLICABLE) {
    return { action: 'HUMAN_REVIEW', reason: `REPLAY_${replayVerdict}`, planNextActions: (plan?.nextActions ?? []).map((a) => a.action) };
  }
  const abandoned = new Set(steering.abandonedHypothesisIds ?? []);
  const priorFalsified = steering.priorFalsifiedClaims instanceof Map ? steering.priorFalsifiedClaims : new Map();
  const skippedByMemory = [];
  const challengeIsAdmissible = lastVerdict === PROTOCOL_VERDICT.SUPPORTED && replayVerdict === REPLAY_VERDICT.MATCH;
  const priority = (hypothesis) => {
    if (hypothesis.hypothesisId === steering.focusedHypothesisId) return 0;
    if (challengeIsAdmissible && hypothesis.challengesHypothesisId === lastHypothesisId) return 1;
    return 2;
  };
  const hypotheses = [...(plan?.hypotheses ?? [])].sort((a, b) => priority(a) - priority(b));
  for (const h of hypotheses) {
    if (doneHypothesisIds.has(h.hypothesisId)) continue;
    if (abandoned.has(h.hypothesisId)) continue;
    const priorRefutation = priorFalsified.get(normalizeText(h.claim));
    if (priorRefutation && h.hypothesisId !== steering.focusedHypothesisId) {
      skippedByMemory.push({ hypothesisId: h.hypothesisId, reason: 'FALSIFIED_IN_PRIOR_RUN', necropolisId: priorRefutation });
      continue;
    }
    const x = executabilityOf(h, executors);
    if (x.executable) {
      const isFocused = h.hypothesisId === steering.focusedHypothesisId;
      const isChallenge = challengeIsAdmissible && h.challengesHypothesisId === lastHypothesisId;
      return {
        action: 'EXECUTE_NEXT_HYPOTHESIS',
        hypothesisId: h.hypothesisId,
        engineId: x.engineId,
        reason: isFocused ? 'USER_FOCUSED_HYPOTHESIS' : isChallenge ? 'SELF_FALSIFICATION_CHALLENGE_IN_PLAN' : 'NEXT_EXECUTABLE_HYPOTHESIS_IN_PLAN',
        ...(isChallenge ? { challengesHypothesisId: lastHypothesisId } : {}),
        ...(skippedByMemory.length ? { skippedByMemory } : {}),
      };
    }
  }
  return {
    action: 'HUMAN_REVIEW',
    reason: skippedByMemory.length ? 'REMAINING_HYPOTHESES_FALSIFIED_IN_PRIOR_RUNS'
      : lastVerdict === PROTOCOL_VERDICT.UNRESOLVED ? 'INCONCLUSIVE_UNDER_PROTOCOL_AND_NO_FURTHER_EXECUTABLE_EXPERIMENT' : 'NO_FURTHER_EXECUTABLE_EXPERIMENT_IN_PLAN',
    planNextActions: (plan?.nextActions ?? []).map((a) => a.action),
    ...(skippedByMemory.length ? { skippedByMemory } : {}),
  };
}

/* ---------------- steps ---------------- */

function freeze(db, projectId, runId, hypothesis, x, userId) {
  const experimentId = experimentIdOf(runId, hypothesis.hypothesisId);
  const preregistrationKey = preregistrationKeyOf(runId, experimentId);
  const inputHash = sha256Hex(canonicalJson(x.input));
  return inWriteTransaction(db, () => {
    const current = getResearchRun(db, projectId, runId);
    if (!current || !current.researchState.chain.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE' };
    if (current.experiments.some((e) => e.experimentId === experimentId)) return { ok: true, deduped: true, experimentId };
    const open = current.experiments.find((e) => !e.next);
    if (open) return { ok: false, status: 'EXPERIMENT_IN_PROGRESS', reason: open.experimentId };
    const prereg = preregisterExperiment(db, {
      projectId,
      campaign: { id: preregistrationKey, status: 'created' },
      hypothesis: {
        subject: `research-run:${runId}`,
        statement: hypothesis.claim,
        target: { targetId: `${x.engineId}:${inputHash}`, engineId: x.engineId, input: x.input },
        criteria: x.criteria,
        plan: [{ step: 'EXECUTE_ENGINE', engineId: x.engineId, inputHash }],
      },
      userId,
    });
    if (!prereg.ok) return { ok: false, status: 'PREREGISTRATION_REFUSED', reason: prereg.error };
    const appended = appendServerResearchStateEvent(db, runId, 'PREDICTIONS_FROZEN', {
      contractVersion: RESEARCH_RUN_CONTRACT_VERSION,
      researchRunId: runId,
      experimentId,
      hypothesisId: hypothesis.hypothesisId,
      proposalId: hypothesis.proposalId ?? null,
      claim: hypothesis.claim,
      engineId: x.engineId,
      input: x.input,
      inputHash,
      criteria: x.criteria,
      rejectedPredictions: x.rejectedPredictions,
      preregistrationKey,
      protocolId: preregistrationKey,
      preregistrationRecordId: prereg.record.id,
      preregistrationFingerprint: prereg.record.contentHash,
      predictionFingerprint: prereg.record.fingerprint,
      frozenBefore: 'ENGINE_EXECUTION',
      scope: VERDICT_SCOPE,
      // The registered dataset cell this input came from (null when the model gave the value itself).
      datasetBinding: hypothesis.experimentProposal?.datasetBinding ?? null,
    });
    if (!appended.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE', reason: appended.error };
    return { ok: true, deduped: false, experimentId };
  });
}

function executeAndFalsify(db, projectId, runId, frozen, tools, now) {
  const executor = tools.executors[frozen.engineId];
  if (!executor) return { ok: false, status: 'BLOCKED', engineId: frozen.engineId, reason: 'NO_RESEARCH_RUN_ADAPTER' };
  if (frozen.datasetBinding) {
    // The dataset bytes are re-read and re-hashed before the engine runs; altered or missing data blocks it.
    const custody = verifyDatasetBytes(db, frozen.datasetBinding);
    if (!custody.ok) return { ok: false, status: 'BLOCKED', engineId: frozen.engineId, reason: `DATASET_${custody.status}` };
  }
  const engine = tools.engineStatus(frozen.engineId);
  if (!engine.available) return { ok: false, status: 'BLOCKED', engineId: frozen.engineId, reason: engine.reason };

  const startedAt = now();
  const t0 = Date.now();
  const res = executor.run(frozen.input);
  if (!res.ok && res.status === 'BLOCKED') return { ok: false, status: 'BLOCKED', engineId: frozen.engineId, reason: res.reason };
  const output = res.ok ? res.output : { error: res.error ?? null, reason: res.reason ?? null };
  // Only a real engine output becomes a Scientific Run; an input the engine rejected has nothing to replay.
  const scienceRunId = res.ok && executor.scienceCapability ? scienceRunIdOf(runId, frozen.experimentId) : null;
  const execution = {
    recordVersion: EXECUTION_RECORD_VERSION,
    researchRunId: runId,
    experimentId: frozen.experimentId,
    hypothesisId: frozen.hypothesisId,
    protocolId: frozen.protocolId,
    preregistrationRecordId: frozen.preregistrationRecordId,
    preregistrationFingerprint: frozen.preregistrationFingerprint,
    predictionFingerprint: frozen.predictionFingerprint,
    engine: {
      engineId: frozen.engineId, engineName: engine.engineName ?? null, version: engine.version ?? null,
      engineLabel: res.engineLabel ?? engine.engine ?? null, toolchainFingerprint: engine.toolchainFingerprint ?? null,
      evidenceClass: engine.evidenceClass ?? null, validationCaseIds: engine.validationCaseIds ?? [],
    },
    input: frozen.input,
    inputHash: sha256Hex(canonicalJson(frozen.input)),
    status: res.ok ? 'EXECUTED' : res.status,
    output,
    outputHash: sha256Hex(canonicalJson(output)),
    environment: { node: process.versions.node, platform: process.platform, arch: process.arch, toolchain: engine.environment ?? null },
    startedAt,
    finishedAt: now(),
    durationMs: Date.now() - t0,
    scienceRunId,
  };
  if (execution.inputHash !== frozen.inputHash) return { ok: false, status: 'STATE_INTEGRITY_FAILURE', reason: 'input_hash_drift' };

  const results = judgeCriteria(frozen.criteria, execution, executor);
  const derived = deriveVerdict(results, frozen.criteria.filter((c) => c.critical).map((c) => c.id));
  const evidenceClass = EVIDENCE_CLASSES.has(engine.evidenceClass) ? engine.evidenceClass : 'MODEL_ESTIMATE';

  return inWriteTransaction(db, () => {
    const current = getResearchRun(db, projectId, runId);
    if (!current || !current.researchState.chain.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE' };
    // A run cancelled while its engine was running must not turn into a result afterwards.
    if (current.run.status !== 'RUNNING') return { ok: false, status: 'RUN_NOT_EXECUTABLE', reason: current.run.status };
    if (current.experiments.find((e) => e.experimentId === frozen.experimentId)?.execution) return { ok: true, deduped: true };
    const sealed = sealExperimentSession(db, {
      projectId,
      campaign: { id: frozen.preregistrationKey },
      session: {
        subject: `research-run:${runId}`,
        hypothesisFingerprint: frozen.predictionFingerprint,
        verdict: derived.verdict,
        rule: derived.rule,
        criteria: results,
        stateHash: execution.outputHash,
        target: { engineId: frozen.engineId, inputHash: execution.inputHash },
        engines: [{ ...execution.engine, evidenceClass }],
        evidence: [],
        blocked: [],
      },
    });
    if (!sealed.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE', reason: sealed.error };
    const body = sealed.record.body;
    if (body.preregCheck !== 'MATCH' || body.verdictCheck !== 'MATCH') return { ok: false, status: 'STATE_INTEGRITY_FAILURE', reason: `seal_${body.preregCheck}_${body.verdictCheck}` };
    if (scienceRunId) {
      // Same shape as orchestrator.mjs persistDescriptorScienceRun, so the existing replayer applies unchanged.
      saveScienceRun(db, {
        id: scienceRunId, projectId, campaignId: null, candidateId: null,
        engine: execution.engine.engineLabel, engineVersion: execution.engine.engineLabel,
        capability: executor.scienceCapability, method: execution.engine.engineName ?? frozen.engineId,
        status: 'ok', evidenceClass: 'COMPUTATIONAL',
        inputs: frozen.input, outputs: res.output,
        provenance: { researchRunId: runId, experimentId: frozen.experimentId, executionRecordVersion: EXECUTION_RECORD_VERSION },
        inputHash: sha256Hex16(frozen.input), outputHash: sha256Hex16(res.output),
        durationMs: execution.durationMs,
      });
    }
    const handoff = appendServerResearchStateEvent(db, runId, 'EXPERIMENT_HANDOFF', execution);
    if (!handoff.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE', reason: handoff.error };
    const falsified = appendServerResearchStateEvent(db, runId, 'SELF_FALSIFICATION', {
      contractVersion: RESEARCH_RUN_CONTRACT_VERSION,
      researchRunId: runId,
      experimentId: frozen.experimentId,
      hypothesisId: frozen.hypothesisId,
      protocolId: frozen.protocolId,
      predictionFingerprint: frozen.predictionFingerprint,
      preregistrationFingerprint: frozen.preregistrationFingerprint,
      sealRecordId: sealed.record.id,
      preregCheck: body.preregCheck,
      verdictCheck: body.verdictCheck,
      serverVerdict: body.serverVerdict,
      serverRule: body.serverRule,
      verdict: PROTOCOL_VERDICT[body.serverVerdict],
      criteria: results,
      outputHash: execution.outputHash,
      scope: VERDICT_SCOPE,
    });
    if (!falsified.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE', reason: falsified.error };
    const surpriseItems = execution.status === 'EXECUTED' ? deriveSurpriseItems(results) : [];
    if (surpriseItems.length) {
      const surprised = appendServerResearchStateEvent(db, runId, 'SURPRISE_DETECTED', {
        contractVersion: RESEARCH_RUN_CONTRACT_VERSION,
        researchRunId: runId,
        experimentId: frozen.experimentId,
        hypothesisId: frozen.hypothesisId,
        protocolId: frozen.protocolId,
        predictionFingerprint: frozen.predictionFingerprint,
        preregistrationFingerprint: frozen.preregistrationFingerprint,
        sealRecordId: sealed.record.id,
        scienceRunId,
        outputHash: execution.outputHash,
        status: 'DETECTED',
        epistemicStatus: 'NOT_EVIDENCE',
        items: surpriseItems,
        scope: 'Deterministic computational anomaly under the frozen expectation and tolerance. It is not scientific evidence or a statement of truth.',
      });
      if (!surprised.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE', reason: surprised.error };
    }
    return { ok: true, deduped: false };
  });
}

function evidenceInputOf(runId, x) {
  const { frozen, execution, falsification } = x;
  return {
    sourceUrl: `genesis://research-run/${runId}/experiment/${x.experimentId}`,
    sourceTimestamp: execution.finishedAt,
    claim: [
      `Computational experiment in research run ${runId}: hypothesis "${frozen.claim}".`,
      `Engine ${execution.engine.engineLabel ?? execution.engine.engineId} (${execution.status}) on input sha256 ${execution.inputHash.slice(0, 16)}, output sha256 ${execution.outputHash.slice(0, 16)}.`,
      `Frozen prediction ${frozen.predictionFingerprint}: ${falsification.verdict} (${falsification.serverRule}).`,
      VERDICT_SCOPE,
    ].join(' '),
    claimType: 'model',
    confidence: EVIDENCE_CONFIDENCE,
    provenance: {
      sourceKind: 'dataset',
      retrievedBy: `genesis-research-run/${EXECUTION_RECORD_VERSION}`,
      independentSourceIds: [`experiment_record:${falsification.sealRecordId}`],
    },
  };
}

function replaySummary(v) {
  return { verificationId: v.id, verdict: v.verdict, originalOutputHash: v.originalOutputHash, replayOutputHash: v.replayOutputHash, replayEngineVersion: v.replayEngineVersion, verifiedAt: v.createdAt };
}

function firstReplayOf(db, x) {
  const scienceRunId = x.execution.scienceRunId ?? null;
  if (!scienceRunId || !getScienceRun(db, scienceRunId)) return { verdict: REPLAY_NOT_APPLICABLE, reason: `engine status ${x.execution.status}: no engine output to replay` };
  const existing = listScienceRunVerifications(db, scienceRunId);
  if (existing.length) return replaySummary(existing[0]);
  const v = verifyScienceRun(db, scienceRunId);
  return v.ok ? replaySummary(v.verification) : { verdict: REPLAY_VERDICT.REPLAY_UNSUPPORTED, reason: v.error };
}

function reasonCode(value) {
  return String(value ?? 'NOT_SELECTED').toUpperCase().replace(/[^A-Z0-9_:-]/g, '_').slice(0, 160);
}

function decisionEvidenceRefs(experiment, evidence, replay) {
  const candidates = [
    { id: `preregistration:${experiment.frozen.preregistrationRecordId}`, contentHash: experiment.frozen.preregistrationFingerprint },
    { id: `execution:${experiment.execution.scienceRunId ?? experiment.experimentId}`, contentHash: experiment.execution.outputHash },
    { id: `falsification:${experiment.falsification.sealRecordId}`, contentHash: experiment.falsification.outputHash },
    { id: `evidence:${evidence.evidenceProposalId}`, contentHash: evidence.evidenceContentHash },
    { id: `replay:${replay?.verificationId ?? experiment.experimentId}`, contentHash: replay?.replayOutputHash },
  ];
  return candidates.filter((reference, index, all) => (
    typeof reference.id === 'string'
    && typeof reference.contentHash === 'string'
    && reference.contentHash.length > 0
    && all.findIndex((candidate) => candidate.id === reference.id) === index
  ));
}

export function nextExperimentDecisionTrace({
  researchRunId, experiment, plan, completedHypothesisIds, proposal, executors, replay, evidence, steering = {},
}) {
  const abandoned = new Set(steering.abandonedHypothesisIds ?? []);
  const alternatives = (plan?.hypotheses ?? []).map((hypothesis) => {
    if (proposal.action === 'EXECUTE_NEXT_HYPOTHESIS' && proposal.hypothesisId === hypothesis.hypothesisId) {
      return { id: hypothesis.hypothesisId, status: 'SELECTED' };
    }
    if (completedHypothesisIds.has(hypothesis.hypothesisId)) {
      return { id: hypothesis.hypothesisId, status: 'REJECTED', rejectedReasonCode: 'ALREADY_EXECUTED' };
    }
    if (abandoned.has(hypothesis.hypothesisId)) {
      return { id: hypothesis.hypothesisId, status: 'REJECTED', rejectedReasonCode: 'HYPOTHESIS_ABANDONED' };
    }
    const executable = executabilityOf(hypothesis, executors);
    return executable.executable
      ? { id: hypothesis.hypothesisId, status: 'NOT_EVALUATED' }
      : { id: hypothesis.hypothesisId, status: 'REJECTED', rejectedReasonCode: reasonCode(executable.reason) };
  });
  if (proposal.action === 'HUMAN_REVIEW') alternatives.push({ id: 'HUMAN_REVIEW', status: 'SELECTED' });
  const replayVerdict = replay?.verdict ?? 'UNAVAILABLE';
  return buildDecisionTrace({
    decisionId: `decision:${researchRunId}:${experiment.experimentId}:next`,
    summary: `NEXT_EXPERIMENT ${proposal.action}; protocol verdict ${experiment.falsification.verdict}; replay ${replayVerdict}; selection ${proposal.reason}.`,
    evidenceRefs: decisionEvidenceRefs(experiment, evidence, replay),
    alternatives,
    selectedCapability: proposal.engineId ?? proposal.action,
    inputClassification: 'COMPUTATIONAL_RESULT',
    outputClassification: proposal.action === 'EXECUTE_NEXT_HYPOTHESIS' ? 'PROPOSED' : 'REQUIRES_HUMAN_APPROVAL',
    solverId: 'GENESIS_FIXED_RULE',
    solverVersion: 'research-run-next-experiment@1',
    ...(proposal.action === 'HUMAN_REVIEW' ? { blockedReason: proposal.reason } : {}),
    suggestedNextExperiment: proposal.hypothesisId ?? proposal.action,
  });
}

function proposeEvidenceAndNext(db, projectId, runId, experimentId, tools, proposeEvidence) {
  const before = getResearchRun(db, projectId, runId);
  const x = before.experiments.find((e) => e.experimentId === experimentId);
  // An execution without its falsification cannot be produced by a crash (both are one transaction): refuse it.
  if (!x?.execution || !x.falsification) return { ok: false, status: 'STATE_INTEGRITY_FAILURE', reason: 'falsification_missing' };
  if (x.evidence && x.next) return { ok: true, deduped: true };
  // Outside the SQL transaction: the ledger is its own store, and proposing the same content again
  // returns the same proposal, so a crash between here and the append below cannot duplicate it.
  const proposed = x.evidence ? { ok: true, proposalId: x.evidence.evidenceProposalId, record: { contentHash: x.evidence.evidenceContentHash } } : proposeEvidence(evidenceInputOf(runId, x));
  if (!proposed.ok) return { ok: false, status: 'EVIDENCE_PROPOSAL_FAILED', reason: proposed.error };
  // Replay once, through the existing verifier. A crash after it leaves the row behind and the first
  // row is reused, so the engine is not replayed again on resume.
  const replay = x.next ? null : firstReplayOf(db, x);

  return inWriteTransaction(db, () => {
    const current = getResearchRun(db, projectId, runId);
    if (!current || !current.researchState.chain.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE' };
    const now = current.experiments.find((e) => e.experimentId === experimentId);
    if (!now.evidence) {
      const ev = appendServerResearchStateEvent(db, runId, 'EVIDENCE_UPDATE', {
        contractVersion: RESEARCH_RUN_CONTRACT_VERSION,
        researchRunId: runId,
        experimentId,
        hypothesisId: now.frozen.hypothesisId,
        sealRecordId: now.falsification.sealRecordId,
        evidenceProposalId: proposed.proposalId,
        evidenceContentHash: proposed.record?.contentHash ?? null,
        status: 'PROPOSED',
        publication: 'REQUIRES_HUMAN_APPROVAL',
      });
      if (!ev.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE', reason: ev.error };
    }
    if (!now.next) {
      const done = new Set(current.experiments.map((e) => e.frozen.hypothesisId));
      const steering = { ...researchSteeringOf(current.researchState), priorFalsifiedClaims: priorFalsifiedClaims(buildProjectBytProjection(db, projectId), { excludeRunId: runId }) };
      const proposal = nextExperimentProposal(current.plan, done, now.falsification.verdict, tools.executors, replay?.verdict, steering, now.frozen.hypothesisId);
      const evidence = now.evidence ?? {
        evidenceProposalId: proposed.proposalId,
        evidenceContentHash: proposed.record?.contentHash ?? null,
        status: 'PROPOSED',
        publication: 'REQUIRES_HUMAN_APPROVAL',
      };
      const decisionTrace = nextExperimentDecisionTrace({
        researchRunId: runId,
        experiment: { ...now, evidence },
        plan: current.plan,
        completedHypothesisIds: done,
        proposal,
        executors: tools.executors,
        replay,
        evidence,
        steering,
      });
      const next = appendServerResearchStateEvent(db, runId, 'NEXT_EXPERIMENT', {
        contractVersion: RESEARCH_RUN_CONTRACT_VERSION,
        researchRunId: runId,
        experimentId,
        replay,
        proposal,
        decisionTrace,
        decidedBy: 'GENESIS_FIXED_RULE',
        status: 'PROPOSED',
      });
      if (!next.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE', reason: next.error };
    }
    return { ok: true, deduped: false };
  });
}

/**
 * Executes one experiment of the run: the one already in progress, the named hypothesis, or the first
 * executable hypothesis of the plan. Returns { ok, status, deduped, experimentId, researchRun } or
 * { ok:false, status, reason }.
 */
export function executeResearchExperiment(db, projectId, runId, {
  hypothesisId = null, userId = null, tools = DEFAULT_RESEARCH_TOOLS, proposeEvidence = proposeStructuredEvidence,
  now = () => new Date().toISOString(),
} = {}) {
  const view = getResearchRun(db, projectId, runId);
  if (!view) return { ok: false, status: 'NOT_FOUND' };
  if (!view.researchState.chain.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE', chain: view.researchState.chain };
  if (view.experiments.some((x) => x.conflicts?.length)) return { ok: false, status: 'STATE_INTEGRITY_FAILURE', reason: 'STEP_RECORDED_TWICE' };
  if (!view.plan || view.run.status !== 'RUNNING') return { ok: false, status: 'RUN_NOT_EXECUTABLE', reason: view.nextStep };

  let experimentId;
  const open = view.experiments.find((e) => !e.next);
  if (open) {
    if (hypothesisId && open.frozen.hypothesisId !== hypothesisId) return { ok: false, status: 'EXPERIMENT_IN_PROGRESS', reason: open.experimentId };
    experimentId = open.experimentId;
  } else {
    const done = new Set(view.experiments.map((e) => e.frozen.hypothesisId));
    const steering = researchSteeringOf(view.researchState);
    const abandoned = new Set(steering.abandonedHypothesisIds);
    let chosen = null;
    const skipped = [];
    if (hypothesisId) {
      const h = view.plan.hypotheses.find((x) => x.hypothesisId === hypothesisId);
      if (!h) return { ok: false, status: 'HYPOTHESIS_NOT_FOUND' };
      if (abandoned.has(hypothesisId)) return { ok: false, status: 'EXPERIMENT_NOT_EXECUTABLE', reason: 'HYPOTHESIS_ABANDONED' };
      if (done.has(hypothesisId)) {
        return { ok: true, status: 'ALREADY_EXECUTED', deduped: true, experimentId: experimentIdOf(runId, hypothesisId), researchRun: view };
      }
      const x = executabilityOf(h, tools.executors);
      if (!x.executable) return { ok: false, status: x.blocked ? 'BLOCKED' : 'EXPERIMENT_NOT_EXECUTABLE', engineId: x.engineId ?? null, reason: x.reason };
      chosen = { h, x };
    } else {
      const ordered = [...view.plan.hypotheses].sort((a, b) => (a.hypothesisId === steering.focusedHypothesisId ? -1 : b.hypothesisId === steering.focusedHypothesisId ? 1 : 0));
      for (const h of ordered) {
        if (done.has(h.hypothesisId)) continue;
        if (abandoned.has(h.hypothesisId)) { skipped.push({ hypothesisId: h.hypothesisId, reason: 'HYPOTHESIS_ABANDONED' }); continue; }
        const x = executabilityOf(h, tools.executors);
        if (x.executable) { chosen = { h, x }; break; }
        skipped.push({ hypothesisId: h.hypothesisId, reason: x.reason });
      }
      if (!chosen) return { ok: false, status: 'NO_EXECUTABLE_EXPERIMENT', skipped };
    }
    const engine = tools.engineStatus(chosen.x.engineId);
    if (!engine.available) return { ok: false, status: 'BLOCKED', engineId: chosen.x.engineId, reason: engine.reason };
    const frozen = freeze(db, projectId, runId, chosen.h, chosen.x, userId);
    if (!frozen.ok) return frozen;
    experimentId = frozen.experimentId;
  }

  const current = getResearchRun(db, projectId, runId).experiments.find((e) => e.experimentId === experimentId);
  let executedNow = false;
  if (!current.execution) {
    const r = executeAndFalsify(db, projectId, runId, current.frozen, tools, now);
    if (!r.ok) return { ...r, experimentId };
    executedNow = !r.deduped;
  }
  const r = proposeEvidenceAndNext(db, projectId, runId, experimentId, tools, proposeEvidence);
  if (!r.ok) return { ...r, experimentId };
  const researchRun = getResearchRun(db, projectId, runId);
  return {
    ok: true,
    status: 'EXECUTED',
    deduped: !executedNow,
    experimentId,
    experiment: researchRun.experiments.find((e) => e.experimentId === experimentId),
    researchRun,
  };
}

/**
 * Replays one executed experiment again on request (R1-c) through the existing verifier. Every attempt
 * is a new append-only verification row; the chain keeps the first one in NEXT_EXPERIMENT.
 * Returns { ok, verification, replays } or { ok:false, status }.
 */
export function replayResearchExperiment(db, projectId, runId, experimentId) {
  const view = getResearchRun(db, projectId, runId);
  if (!view) return { ok: false, status: 'NOT_FOUND' };
  if (!view.researchState.chain.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE' };
  const x = view.experiments.find((e) => e.experimentId === experimentId);
  if (!x) return { ok: false, status: 'EXPERIMENT_NOT_FOUND' };
  if (!x.execution) return { ok: false, status: 'NOT_EXECUTED' };
  const scienceRunId = x.execution.scienceRunId ?? null;
  if (!scienceRunId || !getScienceRun(db, scienceRunId)) return { ok: false, status: 'NOTHING_TO_REPLAY', reason: `engine status ${x.execution.status}` };
  const v = verifyScienceRun(db, scienceRunId);
  if (!v.ok) return { ok: false, status: 'REPLAY_FAILED', reason: v.error };
  return { ok: true, experimentId, verification: replaySummary(v.verification), replays: listResearchExperimentReplays(db, scienceRunId) };
}

/** Every replay of one experiment, oldest first. */
export function listResearchExperimentReplays(db, scienceRunId) {
  return listScienceRunVerifications(db, scienceRunId).map(replaySummary);
}
