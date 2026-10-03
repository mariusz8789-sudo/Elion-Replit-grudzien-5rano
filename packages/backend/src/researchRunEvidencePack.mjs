/* Proprietary / All Rights Reserved - Genesis OS */
/**
 * CANONICAL RESEARCHRUN EVIDENCE PACK (docs/astra/RESEARCHRUN_EVIDENCE_PACK_SPEC.md, schema.json).
 *
 * A read-only projection of records Genesis already keeps. Nothing here is a second ledger, store or
 * hash chain:
 *   identity and lifecycle   agent_runs + the ENTITY-0 research-state chain (agentRun.mjs)
 *   preregistration/seal     experiment_records, hash-chained per protocol (experimentMemory.mjs)
 *   execution                the EXPERIMENT_HANDOFF payload, research-run-execution@1 (researchRunExecution.mjs)
 *   Scientific Run, Replay   science_runs and science_run_verifications (store.mjs, campaign/verify.mjs)
 *   artifact custody         ARTIFACT_PERSISTED + the content-addressed bytes (researchRunArtifacts.mjs)
 *   Evidence                 the canonical knowledge ledger proposal (knowledgeApi.mjs); never assumed published
 *
 * The pack embeds the experiment events' payloads verbatim with their chain locators, so a holder can
 * recompute every hash offline: input/output SHA-256, prediction and preregistration fingerprints,
 * the server verdict from the frozen criteria and the observed output, the artifact bundle digest,
 * each event's payload fingerprint and the research-state chain head. With database access the
 * verifier also anchors the pack to the live records (and to the artifact bytes when storage is
 * given). It never re-executes an engine and never substitutes a result: a run without a real
 * execution gives BLOCKED.
 *
 * Integrity here is VALID_INTEGRITY_ONLY at best. No organizational signature exists, so a party that
 * recomputes every hash offline is only caught by the anchored check (VALID_TRUSTED stays PLANNED).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, fnv1a, sha256Hex } from './determinism.mjs';
import { RESEARCH_STATE_GENESIS_HEAD, researchTransition } from './agentRun.mjs';
import { resolveBuildInfo } from './buildInfo.mjs';
import { deriveVerdict, hypothesisFingerprint, PREREGISTRATION, SESSION } from './experimentMemory.mjs';
import { listProposals } from './knowledgeApi.mjs';
import { canonicalHash } from './provenance.mjs';
import { getResearchRun, RESEARCH_RUN_CONTRACT_VERSION, RESEARCH_RUN_DOMAIN } from './researchRun.mjs';
import { buildExecutionBundle, verifyExperimentArtifact } from './researchRunArtifacts.mjs';
import { EXECUTION_RECORD_VERSION, PROTOCOL_VERDICT, REPLAY_NOT_APPLICABLE } from './researchRunExecution.mjs';
import { getExperimentRecord, getScienceRun, getScienceRunVerification, listScienceRunVerifications, verifyExperimentRecordChain } from './store.mjs';

export const EVIDENCE_PACK_CONTRACT = 'research-run-envelope@1';
export const EVIDENCE_PACK_INTEGRITY_ALGORITHM = 'sha256(canonical-json)';

/** Why a pack is rejected. One mutation usually trips several checks; each one is reported. */
export const PACK_FAILURE = Object.freeze({
  PARAMETER_MUTATED: 'PARAMETER_MUTATED',
  DATA_MUTATED: 'DATA_MUTATED',
  ARTIFACT_MUTATED: 'ARTIFACT_MUTATED',
  ANALYSIS_MUTATED: 'ANALYSIS_MUTATED',
  ENGINE_OR_ENVIRONMENT_MUTATED: 'ENGINE_OR_ENVIRONMENT_MUTATED',
  PROVENANCE_MISSING: 'PROVENANCE_MISSING',
  PROVENANCE_MUTATED: 'PROVENANCE_MUTATED',
  EVENT_FINGERPRINT_MISMATCH: 'EVENT_FINGERPRINT_MISMATCH',
  STATE_CHAIN_MISMATCH: 'STATE_CHAIN_MISMATCH',
  PACK_HASH_MISMATCH: 'PACK_HASH_MISMATCH',
  REFERENCE_UNRESOLVED: 'REFERENCE_UNRESOLVED',
  STATE_ANCHOR_MISMATCH: 'STATE_ANCHOR_MISMATCH',
});

/** The experiment events a pack embeds, in lifecycle order. ARTIFACT_PERSISTED is absent when custody never ran. */
const EXPERIMENT_EVENT_TYPES = ['PREDICTIONS_FROZEN', 'EXPERIMENT_HANDOFF', 'SELF_FALSIFICATION', 'EVIDENCE_UPDATE', 'NEXT_EXPERIMENT', 'ARTIFACT_PERSISTED'];
const REQUIRED_EXPERIMENT_EVENTS = EXPERIMENT_EVENT_TYPES.slice(0, 5);
const SECTION_FAILURE = Object.freeze({
  parameters: PACK_FAILURE.PARAMETER_MUTATED,
  data: PACK_FAILURE.DATA_MUTATED,
  engine: PACK_FAILURE.ENGINE_OR_ENVIRONMENT_MUTATED,
  environment: PACK_FAILURE.ENGINE_OR_ENVIRONMENT_MUTATED,
  analysis: PACK_FAILURE.ANALYSIS_MUTATED,
  artifact: PACK_FAILURE.ARTIFACT_MUTATED,
  provenance: PACK_FAILURE.PROVENANCE_MUTATED,
});
const MISSING_REPORT = 'No report artifact: Genesis has no report-artifact producer for ResearchRun yet.';
const MISSING_LICENCE = 'No licence-decision artifact: commercial licence decisions are not stored as artifacts yet.';

const REPO_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
let producerCommitCache = null;
const defaultProducerCommit = () => (producerCommitCache ??= resolveBuildInfo({ repoDir: REPO_DIR }).commit);

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = (v) => typeof v === 'string' && v.length > 0;
const sameJson = (a, b) => canonicalJson(a) === canonicalJson(b);
const payloadOf = (experiment, type) => experiment?.events?.[type]?.payload;

/* ---------------- sections: what each mutation class covers ---------------- */

/** Section digests over the embedded payloads. A changed section names the kind of mutation. */
export function experimentSections(experiment) {
  const f = payloadOf(experiment, 'PREDICTIONS_FROZEN') ?? {};
  const e = payloadOf(experiment, 'EXPERIMENT_HANDOFF') ?? {};
  const s = payloadOf(experiment, 'SELF_FALSIFICATION') ?? {};
  const v = payloadOf(experiment, 'EVIDENCE_UPDATE') ?? {};
  const n = payloadOf(experiment, 'NEXT_EXPERIMENT') ?? {};
  const a = payloadOf(experiment, 'ARTIFACT_PERSISTED') ?? null;
  return {
    parameters: canonicalHash({ protocolId: f.protocolId, claim: f.claim, engineId: f.engineId, frozenInput: f.input, frozenInputHash: f.inputHash, criteria: f.criteria, executionInput: e.input, executionInputHash: e.inputHash }),
    data: canonicalHash({ status: e.status, output: e.output, outputHash: e.outputHash, scienceRunId: e.scienceRunId }),
    engine: canonicalHash({ engine: e.engine }),
    environment: canonicalHash({ environment: e.environment }),
    analysis: canonicalHash({ criteria: s.criteria, serverVerdict: s.serverVerdict, serverRule: s.serverRule, verdict: s.verdict, preregCheck: s.preregCheck, verdictCheck: s.verdictCheck, replay: n.replay, proposal: n.proposal, replays: experiment?.replays }),
    artifact: canonicalHash({ artifactRef: a?.artifactRef ?? null }),
    provenance: canonicalHash({
      experimentId: experiment?.experimentId, hypothesisId: f.hypothesisId, preregistrationKey: f.preregistrationKey,
      preregistrationRecordId: f.preregistrationRecordId, preregistrationFingerprint: f.preregistrationFingerprint,
      predictionFingerprint: f.predictionFingerprint, recordVersion: e.recordVersion, startedAt: e.startedAt, finishedAt: e.finishedAt,
      sealRecordId: s.sealRecordId, evidenceProposalId: v.evidenceProposalId, evidenceContentHash: v.evidenceContentHash,
      evidenceStatus: v.status, publication: v.publication,
    }),
  };
}

function summaryOf(experiment) {
  const f = payloadOf(experiment, 'PREDICTIONS_FROZEN');
  const e = payloadOf(experiment, 'EXPERIMENT_HANDOFF');
  const s = payloadOf(experiment, 'SELF_FALSIFICATION');
  const n = payloadOf(experiment, 'NEXT_EXPERIMENT');
  const a = payloadOf(experiment, 'ARTIFACT_PERSISTED');
  return {
    engineId: e.engine?.engineId ?? null,
    engineVersion: e.engine?.version ?? e.engine?.engineLabel ?? null,
    executionStatus: e.status,
    inputHash: e.inputHash,
    outputHash: e.outputHash,
    preregistrationFingerprint: f.preregistrationFingerprint,
    predictionFingerprint: f.predictionFingerprint,
    protocolVerdict: s.verdict,
    replayVerdict: n.replay?.verdict ?? null,
    artifactId: a?.artifactRef?.artifactId ?? null,
  };
}

/** Section digests, chain head and the pack hash. Exported for tests that forge a re-sealed pack. */
export function computePackIntegrity(pack) {
  const head = (pack.eventRefs ?? []).at(-1)?.transitionFingerprint ?? RESEARCH_STATE_GENESIS_HEAD;
  const integrity = {
    algorithm: EVIDENCE_PACK_INTEGRITY_ALGORITHM,
    stateChainHead: head,
    stateChainLength: (pack.eventRefs ?? []).length,
    experiments: (pack.experiments ?? []).map((x) => ({ experimentId: x.experimentId, sections: experimentSections(x) })),
  };
  const rest = { ...pack };
  delete rest.integrity;
  return { ...integrity, packHash: canonicalHash({ ...rest, integrity }) };
}

/* ---------------- anchored checks: the pack against the live records ---------------- */

async function anchoredFailures(pack, { db, projectId, artifactStorage }) {
  const failures = [];
  const fail = (code, detail, experimentId = null) => failures.push({ code, experimentId, detail });
  const run = getResearchRun(db, projectId, pack.researchRunId);
  if (!run || pack.projectId !== projectId) {
    fail(PACK_FAILURE.REFERENCE_UNRESOLVED, 'research run not found in this project');
    return failures;
  }
  if (!run.researchState.chain.ok) fail(PACK_FAILURE.STATE_ANCHOR_MISMATCH, `stored research-state chain broken at ${run.researchState.chain.brokenAt}`);
  const stored = run.researchState.events;
  for (const ref of pack.eventRefs ?? []) {
    const event = stored[ref.seq];
    if (!event || event.type !== ref.type || event.payloadFingerprint !== ref.payloadFingerprint || event.transitionFingerprint !== ref.transitionFingerprint || ref.agentRunId !== run.researchRunId) {
      fail(PACK_FAILURE.STATE_ANCHOR_MISMATCH, `event ${ref.seq} (${ref.type}) differs from the stored research state`);
    }
  }
  for (const x of pack.experiments ?? []) {
    for (const type of EXPERIMENT_EVENT_TYPES) {
      const embedded = x.events?.[type];
      if (!embedded) continue;
      const event = stored[embedded.seq];
      if (!event || event.type !== type || !sameJson(event.payload, embedded.payload)) fail(PACK_FAILURE.STATE_ANCHOR_MISMATCH, `${type} payload differs from the stored event ${embedded.seq}`, x.experimentId);
    }
    const f = payloadOf(x, 'PREDICTIONS_FROZEN') ?? {};
    const prereg = isText(f.preregistrationRecordId) ? getExperimentRecord(db, f.preregistrationRecordId) : null;
    if (!prereg || prereg.projectId !== projectId || prereg.kind !== PREREGISTRATION || prereg.contentHash !== f.preregistrationFingerprint) {
      fail(PACK_FAILURE.REFERENCE_UNRESOLVED, 'preregistration record missing or different', x.experimentId);
    } else if (!verifyExperimentRecordChain(db, prereg.campaignId).ok) {
      fail(PACK_FAILURE.STATE_ANCHOR_MISMATCH, 'experiment_records chain of this protocol is broken', x.experimentId);
    }
    const s = payloadOf(x, 'SELF_FALSIFICATION') ?? {};
    const seal = isText(s.sealRecordId) ? getExperimentRecord(db, s.sealRecordId) : null;
    if (!seal || seal.projectId !== projectId || seal.kind !== SESSION || seal.body?.serverVerdict !== s.serverVerdict) {
      fail(PACK_FAILURE.REFERENCE_UNRESOLVED, 'sealed SESSION record missing or different', x.experimentId);
    }
    const e = payloadOf(x, 'EXPERIMENT_HANDOFF') ?? {};
    if (e.scienceRunId) {
      const scienceRun = getScienceRun(db, e.scienceRunId);
      if (!scienceRun || scienceRun.projectId !== projectId || scienceRun.provenance?.researchRunId !== pack.researchRunId) fail(PACK_FAILURE.REFERENCE_UNRESOLVED, `science run ${e.scienceRunId} missing`, x.experimentId);
      else if (scienceRun.engine !== e.engine?.engineLabel) fail(PACK_FAILURE.ENGINE_OR_ENVIRONMENT_MUTATED, 'engine differs from the stored Scientific Run', x.experimentId);
      else if (!sameJson(scienceRun.outputs, e.output)) fail(PACK_FAILURE.DATA_MUTATED, 'output differs from the stored Scientific Run', x.experimentId);
      else if (payloadOf(x, 'NEXT_EXPERIMENT')?.replay?.originalOutputHash && payloadOf(x, 'NEXT_EXPERIMENT').replay.originalOutputHash !== scienceRun.outputHash) fail(PACK_FAILURE.ANALYSIS_MUTATED, 'replay summary not bound to the stored Scientific Run', x.experimentId);
    }
    for (const replay of x.replays ?? []) {
      const row = getScienceRunVerification(db, replay.verificationId);
      if (!row || row.scienceRunId !== e.scienceRunId || row.verdict !== replay.verdict || row.originalOutputHash !== replay.originalOutputHash || row.replayOutputHash !== replay.replayOutputHash) fail(PACK_FAILURE.REFERENCE_UNRESOLVED, `replay ${replay.verificationId} missing or different`, x.experimentId);
    }
    const v = payloadOf(x, 'EVIDENCE_UPDATE') ?? {};
    const proposal = listProposals().proposals.find((p) => p.proposalId === v.evidenceProposalId);
    if (!proposal || (v.evidenceContentHash && proposal.contentHash !== v.evidenceContentHash)) fail(PACK_FAILURE.REFERENCE_UNRESOLVED, `evidence proposal ${v.evidenceProposalId} not in the knowledge ledger`, x.experimentId);
    const a = payloadOf(x, 'ARTIFACT_PERSISTED');
    if (a && artifactStorage) {
      const checked = await verifyExperimentArtifact(db, artifactStorage, projectId, pack.researchRunId, x.experimentId);
      if (!checked.ok) fail(PACK_FAILURE.ARTIFACT_MUTATED, `stored artifact: ${checked.status}`, x.experimentId);
      else if (checked.artifactRef.sha256 !== a.artifactRef?.sha256) fail(PACK_FAILURE.ARTIFACT_MUTATED, 'artifact ref differs from the stored custody record', x.experimentId);
    }
  }
  return failures;
}

/* ---------------- build ---------------- */

function locate(events, type, experimentId) {
  const event = events.filter((e) => e.type === type && e.payload?.experimentId === experimentId).at(-1);
  return event ? { seq: event.seq, payload: event.payload } : null;
}

/**
 * Builds the pack of one ResearchRun from its persisted records. Returns { ok:true, pack } or
 * { ok:false, status: NOT_FOUND | STATE_INTEGRITY_FAILURE | BLOCKED, blockers }.
 * BLOCKED means no experiment was really executed (e.g. its engine was unavailable): no pack is
 * assembled from anything else.
 */
export async function buildResearchRunEvidencePack(db, projectId, runId, { artifactStorage = null, producerCommit = defaultProducerCommit() } = {}) {
  const run = getResearchRun(db, projectId, runId);
  if (!run) return { ok: false, status: 'NOT_FOUND' };
  if (!run.researchState.chain.ok) return { ok: false, status: 'STATE_INTEGRITY_FAILURE', chain: run.researchState.chain };
  const events = run.researchState.events;
  const complete = run.experiments.filter((x) => x.frozen && x.execution && x.falsification && x.evidence && x.next);
  const open = run.experiments.filter((x) => !complete.includes(x));
  if (complete.length === 0) {
    return {
      ok: false,
      status: 'BLOCKED',
      blockers: open.length
        ? open.map((x) => ({ experimentId: x.experimentId, reason: x.execution ? 'EXPERIMENT_NOT_CLOSED' : 'EXPERIMENT_NOT_EXECUTED' }))
        : [{ experimentId: null, reason: 'NO_EXECUTED_EXPERIMENT' }],
    };
  }

  const experiments = complete.map((x) => {
    const embedded = Object.fromEntries(EXPERIMENT_EVENT_TYPES.map((type) => [type, locate(events, type, x.experimentId)]).filter(([, v]) => v));
    const scienceRunId = x.execution.scienceRunId ?? null;
    const replays = scienceRunId ? listScienceRunVerifications(db, scienceRunId).map((v) => ({
      verificationId: v.id, scienceRunId, verdict: v.verdict, originalOutputHash: v.originalOutputHash, replayOutputHash: v.replayOutputHash, replayEngineVersion: v.replayEngineVersion,
    })) : [];
    const experiment = { experimentId: x.experimentId, hypothesisId: x.frozen.hypothesisId, scienceRunId, events: embedded, replays };
    return { ...experiment, summary: summaryOf(experiment) };
  });

  const missing = [];
  if (!/^[a-f0-9]{40}$/.test(String(producerCommit))) missing.push('Producer commit unknown in this runtime.');
  for (const x of open) missing.push(`Experiment ${x.experimentId} is not closed (${x.execution ? 'awaiting evidence/next step' : 'never executed'}); it is not in this pack.`);
  for (const x of experiments) if (!x.events.ARTIFACT_PERSISTED && x.summary.executionStatus === 'EXECUTED') missing.push(`Experiment ${x.experimentId} has no recorded artifact.`);
  if (!artifactStorage) missing.push('Artifact bytes were not re-read: no artifact storage configured.');
  missing.push(MISSING_REPORT, MISSING_LICENCE);

  const pack = {
    contract: EVIDENCE_PACK_CONTRACT,
    researchRunContract: RESEARCH_RUN_CONTRACT_VERSION,
    recordMode: 'RESOLVED_EXPORT',
    domain: RESEARCH_RUN_DOMAIN,
    researchRunId: run.researchRunId,
    projectId,
    producerCommit: /^[a-f0-9]{40}$/.test(String(producerCommit)) ? producerCommit : 'unknown',
    stateChainRef: 'agent_run_steps',
    eventRefs: events.map((e) => ({ agentRunId: run.researchRunId, seq: e.seq, type: e.type, payloadFingerprint: e.payloadFingerprint, transitionFingerprint: e.transitionFingerprint })),
    experimentRecordRefs: experiments.flatMap((x) => [
      { id: payloadOf(x, 'PREDICTIONS_FROZEN').preregistrationRecordId, kind: PREREGISTRATION },
      { id: payloadOf(x, 'SELF_FALSIFICATION').sealRecordId, kind: SESSION },
    ]).filter((ref, i, all) => all.findIndex((r) => r.id === ref.id) === i),
    executionRecordRefs: experiments.map((x) => ({ agentRunId: run.researchRunId, seq: x.events.EXPERIMENT_HANDOFF.seq, type: 'EXPERIMENT_HANDOFF' })),
    scienceRunRefs: experiments.filter((x) => x.scienceRunId).map((x) => ({ id: x.scienceRunId })),
    evidenceRefs: experiments.map((x) => ({ proposalId: payloadOf(x, 'EVIDENCE_UPDATE').evidenceProposalId })),
    replayRefs: experiments.flatMap((x) => x.replays.map((r) => ({ verificationId: r.verificationId, scienceRunId: r.scienceRunId }))),
    sourceArtifactRefs: [],
    reportArtifactRefs: [],
    licenceDecisionArtifactRefs: [],
    experiments,
  };
  const anchored = await anchoredFailures(pack, { db, projectId, artifactStorage });
  const offline = offlineFailures({ ...pack, integrity: computePackIntegrity(pack) }, { skipPackHash: true });
  const unresolved = anchored.filter((f) => f.code === PACK_FAILURE.REFERENCE_UNRESOLVED);
  const broken = [...offline, ...anchored.filter((f) => f.code !== PACK_FAILURE.REFERENCE_UNRESOLVED)];
  for (const f of [...unresolved, ...broken]) missing.push(`${f.code}: ${f.detail}`);
  const referenceResolution = unresolved.length ? 'FAILED' : 'MATCH';
  const integrity = broken.length ? 'INVALID' : artifactStorage ? 'VALID_INTEGRITY_ONLY' : 'UNVERIFIED';
  const completeness = missing.length ? 'INCOMPLETE' : 'COMPLETE';
  pack.verification = {
    referenceResolution,
    integrity,
    completeness,
    delivery: referenceResolution === 'MATCH' && integrity === 'VALID_INTEGRITY_ONLY' && completeness === 'COMPLETE' ? 'ELIGIBLE' : 'BLOCKED',
    missing: [...new Set(missing)],
  };
  pack.integrity = computePackIntegrity(pack);
  return { ok: true, pack };
}

/* ---------------- verify ---------------- */

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

function provenanceFailures(pack) {
  const gaps = [];
  for (const key of ['contract', 'researchRunId', 'projectId', 'producerCommit', 'domain', 'stateChainRef']) if (!isText(pack?.[key])) gaps.push(key);
  if (pack?.contract && pack.contract !== EVIDENCE_PACK_CONTRACT) gaps.push('contract');
  if (!Array.isArray(pack?.eventRefs) || pack.eventRefs.length === 0) gaps.push('eventRefs');
  else if (pack.eventRefs.some((r) => !isText(r?.payloadFingerprint) || !isText(r?.transitionFingerprint) || !Number.isInteger(r?.seq))) gaps.push('eventRefs[].fingerprints');
  if (!Array.isArray(pack?.experiments) || pack.experiments.length === 0) gaps.push('experiments');
  if (!isObject(pack?.integrity) || !isText(pack.integrity.packHash)) gaps.push('integrity');
  const failures = gaps.map((field) => ({ code: PACK_FAILURE.PROVENANCE_MISSING, experimentId: null, detail: field }));
  for (const x of Array.isArray(pack?.experiments) ? pack.experiments : []) {
    const need = (ok, field) => { if (!ok) failures.push({ code: PACK_FAILURE.PROVENANCE_MISSING, experimentId: x?.experimentId ?? null, detail: field }); };
    need(isText(x?.experimentId), 'experimentId');
    for (const type of REQUIRED_EXPERIMENT_EVENTS) need(isObject(x?.events?.[type]?.payload) && Number.isInteger(x.events[type].seq), `events.${type}`);
    const f = payloadOf(x, 'PREDICTIONS_FROZEN') ?? {};
    for (const key of ['protocolId', 'preregistrationKey', 'preregistrationRecordId', 'preregistrationFingerprint', 'predictionFingerprint', 'inputHash']) need(isText(f[key]), `PREDICTIONS_FROZEN.${key}`);
    const e = payloadOf(x, 'EXPERIMENT_HANDOFF') ?? {};
    need(e.recordVersion === EXECUTION_RECORD_VERSION, 'EXPERIMENT_HANDOFF.recordVersion');
    need(isText(e.engine?.engineId), 'EXPERIMENT_HANDOFF.engine.engineId');
    need(isObject(e.environment), 'EXPERIMENT_HANDOFF.environment');
    need(isText(e.inputHash) && isText(e.outputHash), 'EXPERIMENT_HANDOFF.hashes');
    need(isText(payloadOf(x, 'SELF_FALSIFICATION')?.sealRecordId), 'SELF_FALSIFICATION.sealRecordId');
    need(isText(payloadOf(x, 'EVIDENCE_UPDATE')?.evidenceProposalId), 'EVIDENCE_UPDATE.evidenceProposalId');
    need(isObject(x?.summary), 'summary');
  }
  return failures;
}

/** Recomputes every hash the pack carries. No database, no engine. */
function offlineFailures(pack, { skipPackHash = false } = {}) {
  const failures = [];
  const fail = (code, detail, experimentId = null) => failures.push({ code, experimentId, detail });
  const runId = pack.researchRunId;

  // The research-state chain, from the genesis head through every event locator.
  let head = RESEARCH_STATE_GENESIS_HEAD;
  for (const [index, ref] of pack.eventRefs.entries()) {
    if (ref.seq !== index || ref.agentRunId !== runId) { fail(PACK_FAILURE.STATE_CHAIN_MISMATCH, `event locator ${index} out of sequence`); break; }
    const next = researchTransition(head, ref.type, ref.payloadFingerprint, ref.seq);
    if (next !== ref.transitionFingerprint) { fail(PACK_FAILURE.STATE_CHAIN_MISMATCH, `transition fingerprint at seq ${ref.seq}`); break; }
    head = next;
  }
  if (pack.integrity?.stateChainHead !== head || pack.integrity?.stateChainLength !== pack.eventRefs.length) fail(PACK_FAILURE.STATE_CHAIN_MISMATCH, 'chain head differs from the recomputed head');

  const declared = new Map((pack.integrity?.experiments ?? []).map((x) => [x.experimentId, x.sections]));
  for (const x of pack.experiments) {
    const id = x.experimentId;
    // Every embedded payload must be the exact payload the chain fingerprinted at that position.
    for (const type of EXPERIMENT_EVENT_TYPES) {
      const embedded = x.events[type];
      if (!embedded) continue;
      const ref = pack.eventRefs[embedded.seq];
      if (!ref || ref.type !== type || fnv1a(canonicalJson(embedded.payload)) !== ref.payloadFingerprint || embedded.payload?.experimentId !== id) {
        fail(PACK_FAILURE.EVENT_FINGERPRINT_MISMATCH, `${type} payload does not match the chain at seq ${embedded.seq}`, id);
      }
    }
    // Lifecycle order in the chain: freeze → execution → falsification → evidence → next step.
    const seqs = REQUIRED_EXPERIMENT_EVENTS.map((type) => x.events[type].seq);
    if (seqs.some((seq, i) => i > 0 && seq <= seqs[i - 1])) fail(PACK_FAILURE.STATE_CHAIN_MISMATCH, 'lifecycle order freeze → execution → falsification → evidence → next is violated', id);
    // Section digests name what changed.
    const sections = experimentSections(x);
    const expected = declared.get(id);
    if (!expected) fail(PACK_FAILURE.PROVENANCE_MISSING, 'integrity section digests', id);
    else for (const [name, digest] of Object.entries(sections)) if (expected[name] !== digest) fail(SECTION_FAILURE[name], `${name} section digest`, id);

    const f = payloadOf(x, 'PREDICTIONS_FROZEN');
    const e = payloadOf(x, 'EXPERIMENT_HANDOFF');
    const s = payloadOf(x, 'SELF_FALSIFICATION');
    const n = payloadOf(x, 'NEXT_EXPERIMENT');
    const a = payloadOf(x, 'ARTIFACT_PERSISTED');

    // Parameters: input hashes, then both fingerprints recomputed from the frozen content.
    if (sha256Hex(canonicalJson(f.input)) !== f.inputHash) fail(PACK_FAILURE.PARAMETER_MUTATED, 'frozen input does not hash to its inputHash', id);
    if (sha256Hex(canonicalJson(e.input)) !== e.inputHash || e.inputHash !== f.inputHash) fail(PACK_FAILURE.PARAMETER_MUTATED, 'executed input differs from the frozen input', id);
    const hypothesis = { subject: `research-run:${runId}`, statement: f.claim, target: { targetId: `${f.engineId}:${f.inputHash}`, engineId: f.engineId, input: f.input }, criteria: f.criteria };
    const fingerprint = hypothesisFingerprint(hypothesis);
    if (fingerprint !== f.predictionFingerprint || e.predictionFingerprint !== f.predictionFingerprint || s.predictionFingerprint !== f.predictionFingerprint) fail(PACK_FAILURE.PARAMETER_MUTATED, 'prediction fingerprint does not recompute', id);
    const preregBody = { kind: PREREGISTRATION, campaignId: f.preregistrationKey, ...hypothesis, plan: [{ step: 'EXECUTE_ENGINE', engineId: f.engineId, inputHash: f.inputHash }], fingerprint };
    if (sha256Hex(canonicalJson(preregBody)) !== f.preregistrationFingerprint || e.preregistrationFingerprint !== f.preregistrationFingerprint) fail(PACK_FAILURE.PARAMETER_MUTATED, 'preregistration fingerprint does not recompute', id);

    // Data: the observed output.
    if (sha256Hex(canonicalJson(e.output)) !== e.outputHash) fail(PACK_FAILURE.DATA_MUTATED, 'output does not hash to its outputHash', id);
    if (s.outputHash !== e.outputHash || (a && a.outputHash !== e.outputHash)) fail(PACK_FAILURE.DATA_MUTATED, 'falsification/artifact bound to a different output', id);
    // Replay hashes live in the Scientific Run namespace (sha256Hex16 over the stored outputs). They are
    // compared with each other here and with the stored Scientific Run in the anchored check, never with
    // the execution SHA-256 (docs/astra spec: hashes stay in their own namespace).
    const replay = n.replay ?? {};

    // Engine and environment: one identity across the frozen protocol and the execution.
    if (e.engine?.engineId !== f.engineId) fail(PACK_FAILURE.ENGINE_OR_ENVIRONMENT_MUTATED, 'executed engine differs from the frozen engine', id);

    // Analysis: re-judge the frozen criteria against the observed output and re-derive the verdict.
    const results = (f.criteria ?? []).map((c) => {
      const observed = e.status === 'EXECUTED' ? e.output?.[c.observable] : undefined;
      const typed = observed !== undefined && typeof observed === typeof c.value;
      const met = typed ? compare(observed, c.operator, c.value) : null;
      return { id: c.id, observed: typed ? observed : null, status: met === null ? 'UNRESOLVED' : met ? 'MET' : 'NOT_MET' };
    });
    const judged = (s.criteria ?? []).map((c) => ({ id: c.id, observed: c.observed, status: c.status }));
    const derived = deriveVerdict(results, (f.criteria ?? []).filter((c) => c.critical).map((c) => c.id));
    if (!sameJson(results, judged) || derived.verdict !== s.serverVerdict || derived.rule !== s.serverRule || PROTOCOL_VERDICT[derived.verdict] !== s.verdict) {
      fail(PACK_FAILURE.ANALYSIS_MUTATED, `verdict recomputes to ${PROTOCOL_VERDICT[derived.verdict]}, pack says ${s.verdict}`, id);
    }
    if (replay.verdict === 'MATCH' && replay.originalOutputHash !== replay.replayOutputHash) fail(PACK_FAILURE.ANALYSIS_MUTATED, 'replay MATCH with different output hashes', id);
    if (!e.scienceRunId && replay.verdict && replay.verdict !== REPLAY_NOT_APPLICABLE) fail(PACK_FAILURE.ANALYSIS_MUTATED, 'replay verdict without a Scientific Run', id);
    for (const r of x.replays ?? []) if (r.verdict === 'MATCH' && r.originalOutputHash !== r.replayOutputHash) fail(PACK_FAILURE.ANALYSIS_MUTATED, `replay ${r.verificationId} MATCH with different hashes`, id);

    // Artifact: the bundle is a deterministic function of the execution record.
    if (a) {
      const bytes = buildExecutionBundle(runId, { experimentId: id, execution: e });
      const ref = a.artifactRef ?? {};
      if (sha256Hex(bytes) !== ref.sha256 || bytes.byteLength !== ref.size || ref.artifactId !== `artifact:${ref.sha256}`) fail(PACK_FAILURE.ARTIFACT_MUTATED, 'artifact ref does not match the execution bundle', id);
    }

    // The readable summary must agree with the records it summarises.
    const summary = summaryOf(x);
    const SUMMARY_FAILURE = { engineId: SECTION_FAILURE.engine, engineVersion: SECTION_FAILURE.engine, executionStatus: SECTION_FAILURE.data, inputHash: SECTION_FAILURE.parameters, outputHash: SECTION_FAILURE.data, preregistrationFingerprint: SECTION_FAILURE.parameters, predictionFingerprint: SECTION_FAILURE.parameters, protocolVerdict: SECTION_FAILURE.analysis, replayVerdict: SECTION_FAILURE.analysis, artifactId: SECTION_FAILURE.artifact };
    for (const [key, value] of Object.entries(summary)) if (!sameJson(x.summary?.[key] ?? null, value ?? null)) fail(SUMMARY_FAILURE[key], `summary.${key} differs from the records`, id);
  }

  if (!skipPackHash && computePackIntegrity(pack).packHash !== pack.integrity?.packHash) fail(PACK_FAILURE.PACK_HASH_MISMATCH, 'pack hash does not recompute');
  return failures;
}

/**
 * Verifies a pack. Offline it recomputes every hash; with { db, projectId } it also anchors the pack
 * to the stored records, and with artifactStorage to the artifact bytes. Returns
 * { ok, status: VALID_INTEGRITY_ONLY | REJECTED, anchored, failures, codes }.
 */
export async function verifyResearchRunEvidencePack(pack, { db = null, projectId = null, artifactStorage = null } = {}) {
  let failures = provenanceFailures(pack);
  if (failures.length === 0) {
    try {
      failures = offlineFailures(pack);
    } catch (error) {
      failures = [{ code: PACK_FAILURE.PROVENANCE_MISSING, experimentId: null, detail: `malformed pack: ${error?.message ?? error}` }];
    }
    if (db) failures.push(...await anchoredFailures(pack, { db, projectId: projectId ?? pack.projectId, artifactStorage }));
  }
  const codes = [...new Set(failures.map((f) => f.code))];
  return { ok: failures.length === 0, status: failures.length === 0 ? 'VALID_INTEGRITY_ONLY' : 'REJECTED', anchored: Boolean(db), failures, codes };
}

/* ---------------- shape: the subset of JSON Schema 2020-12 that docs/astra/schema.json uses ---------------- */

const SUPPORTED_KEYWORDS = new Set(['$schema', '$id', 'title', 'description', '$defs', '$ref', 'type', 'const', 'enum', 'properties', 'required', 'additionalProperties', 'items', 'minLength', 'maxLength', 'pattern', 'minimum', 'uniqueItems', 'minItems', 'maxItems', 'allOf', 'anyOf', 'if', 'then']);
const typeOk = (type, v) => (Array.isArray(type) ? type : [type]).some((t) => (
  t === 'object' ? isObject(v) : t === 'array' ? Array.isArray(v) : t === 'integer' ? Number.isInteger(v) : t === 'null' ? v === null : typeof v === t
));

/**
 * Validates `value` against `schema`, supporting exactly the keywords the Evidence Pack schema uses.
 * An unsupported keyword throws instead of passing silently. Returns a list of error strings.
 */
export function validateAgainstSchema(schema, value, root = schema, at = '$') {
  if (schema === true) return [];
  const errors = [];
  for (const key of Object.keys(schema)) if (!SUPPORTED_KEYWORDS.has(key)) throw new Error(`unsupported JSON Schema keyword: ${key}`);
  if (schema.$ref) {
    const target = schema.$ref.replace(/^#\//, '').split('/').reduce((node, part) => node?.[part], root);
    if (!target) throw new Error(`unresolvable $ref ${schema.$ref}`);
    errors.push(...validateAgainstSchema(target, value, root, at));
  }
  if (schema.type && !typeOk(schema.type, value)) return [...errors, `${at}: expected ${schema.type}`];
  if ('const' in schema && !sameJson(schema.const, value)) errors.push(`${at}: expected const ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.some((option) => sameJson(option, value))) errors.push(`${at}: not in enum`);
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${at}: shorter than ${schema.minLength}`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${at}: longer than ${schema.maxLength}`);
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) errors.push(`${at}: does not match ${schema.pattern}`);
  }
  if (typeof value === 'number' && schema.minimum !== undefined && value < schema.minimum) errors.push(`${at}: below ${schema.minimum}`);
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${at}: fewer than ${schema.minItems} items`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${at}: more than ${schema.maxItems} items`);
    if (schema.uniqueItems && new Set(value.map((item) => canonicalJson(item))).size !== value.length) errors.push(`${at}: duplicate items`);
    if (schema.items) value.forEach((item, i) => errors.push(...validateAgainstSchema(schema.items, item, root, `${at}[${i}]`)));
  }
  if (isObject(value)) {
    for (const key of schema.required ?? []) if (!(key in value)) errors.push(`${at}: missing ${key}`);
    for (const [key, item] of Object.entries(value)) {
      if (schema.properties?.[key]) errors.push(...validateAgainstSchema(schema.properties[key], item, root, `${at}.${key}`));
      else if (schema.additionalProperties === false) errors.push(`${at}: unexpected property ${key}`);
      else if (isObject(schema.additionalProperties)) errors.push(...validateAgainstSchema(schema.additionalProperties, item, root, `${at}.${key}`));
    }
  }
  for (const sub of schema.allOf ?? []) errors.push(...validateAgainstSchema(sub, value, root, at));
  if (schema.anyOf && !schema.anyOf.some((sub) => validateAgainstSchema(sub, value, root, at).length === 0)) errors.push(`${at}: matches no anyOf branch`);
  if (schema.if && validateAgainstSchema(schema.if, value, root, at).length === 0 && schema.then) errors.push(...validateAgainstSchema(schema.then, value, root, at));
  return errors;
}
