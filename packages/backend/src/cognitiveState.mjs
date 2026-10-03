/**
 * ENTITY-2 — GENESIS COGNITIVE STATE. A materialized view, not a database.
 *
 * Nothing here is stored. Every call rebuilds the view from the records that already persist, so after
 * a restart Genesis reconstructs exactly what it was working on, and deleting this module would lose
 * no data:
 *
 *   currentGoals / runningExperiments / pendingExperiments → campaigns, jobs, agent runs
 *   activeQuestions / proposedNextActions (research)        → ENTITY-0 research state (agent_run_steps)
 *   activeHypotheses                                         → experiment_records (preregistration + sealed sessions)
 *   knowledgeGaps / contradictions                           → knowledgeRegistry.mjs (persisted, append-only)
 *   proposedClaims (ENTITY-3)                                → knowledgeRegistry.mjs, CLAIM_PROPOSED: external-model proposals, always PROPOSED
 *   awaitingExternalMeasurements                             → campaign_events (lab requests without an observation)
 *   recentEvidenceRefs                                       → experiment_records, science_runs
 *   blockedCapabilities                                      → ENTITY-1 self model
 *
 * Honesty rules of the view:
 *  - What is not known is UNKNOWN, never a default. A hypothesis no sealed session has judged is
 *    UNKNOWN; a source whose chain fails verification is reported as UNKNOWN with the reason, and its
 *    content is not shown as if it were true.
 *  - Every proposed next action is PROPOSED. The view suggests; it never decides or executes.
 */
import { listAgentRuns, readResearchState } from './agentRun.mjs';
import { readKnowledgeRegistry, KNOWLEDGE_REGISTRY_DOMAIN } from './knowledgeRegistry.mjs';
import { verifyExperimentRecordChain } from './store.mjs';
import { LAB_EVENT } from './campaign/labClosedLoop.mjs';
import { buildBytProjection } from './bytProjection.mjs';
import { anchoredResearchState, RESEARCH_RUN_DOMAIN } from './researchRun.mjs';
import { buildVirtualLabDossier, VIRTUAL_EVENT } from './campaign/virtualLabClosedLoop.mjs';

export const COGNITIVE_STATE_SCHEMA_VERSION = 1;
const TERMINAL_CAMPAIGN = new Set(['completed', 'cancelled', 'failed', 'rejected', 'stopped']);
const RECENT_LIMIT = 10;
const P = (s, d) => { try { return JSON.parse(s); } catch { return d; } };

function lastPayload(events, type) {
  for (let i = events.length - 1; i >= 0; i -= 1) if (events[i].type === type) return events[i].payload;
  return null;
}

function researchRuns(db, projectId) {
  return listAgentRuns(db, projectId)
    .filter((run) => run.domain !== KNOWLEDGE_REGISTRY_DOMAIN)
    .map((run) => {
      const { events, chain } = run.domain === RESEARCH_RUN_DOMAIN ? anchoredResearchState(db, run.id) : readResearchState(db, run.id);
      if (!chain.ok) return { run, researchStateEvents: [], integrity: { ok: false, reason: 'STATE_INTEGRITY_FAILURE', brokenAt: chain.brokenAt, detail: chain.reason } };
      return {
        run,
        researchStateEvents: events,
        integrity: { ok: true, head: chain.head, events: events.length },
        problem: lastPayload(events, 'PROBLEM_FORMALIZED'),
        hypotheses: lastPayload(events, 'HYPOTHESES_GENERATED'),
        nextExperiment: lastPayload(events, 'NEXT_EXPERIMENT'),
        terminal: lastPayload(events, 'TERMINAL'),
        evidenceRefs: events.filter((e) => e.type === 'EVIDENCE_UPDATE').flatMap((e) => (Array.isArray(e.payload?.evidenceRefs) ? e.payload.evidenceRefs : [])),
      };
    });
}

function hypothesesFromRecords(db, projectId, campaigns) {
  const out = [];
  for (const campaign of campaigns) {
    const chain = verifyExperimentRecordChain(db, campaign.id);
    if (!chain.ok) {
      out.push({ source: 'EXPERIMENT_RECORDS', campaignId: campaign.id, status: 'UNKNOWN', reason: 'STATE_INTEGRITY_FAILURE' });
      continue;
    }
    const rows = db.prepare('SELECT id, kind, body_json FROM experiment_records WHERE campaign_id = ? AND project_id = ? ORDER BY seq ASC').all(campaign.id, projectId);
    const prereg = rows.find((r) => r.kind === 'PREREGISTRATION');
    if (!prereg) continue;
    const body = P(prereg.body_json, {});
    const sessions = rows.filter((r) => r.kind === 'SESSION').map((r) => ({ id: r.id, ...P(r.body_json, {}) }));
    const latest = sessions.at(-1) ?? null;
    // The server's own derivation is the verdict; a verdict the server could not re-derive is shown
    // as the client's report, labelled so; no session at all is UNKNOWN (never "untested = fine").
    const status = !latest ? 'UNKNOWN' : latest.serverVerdict ?? 'UNKNOWN';
    out.push({
      source: 'EXPERIMENT_RECORDS', campaignId: campaign.id, preregistrationRef: `experiment_record:${prereg.id}`,
      statement: body.statement ?? null, fingerprint: body.fingerprint ?? null,
      status, reportedVerdict: latest?.reportedVerdict ?? null, verdictCheck: latest?.verdictCheck ?? null,
      sessions: sessions.length, latestSessionRef: latest ? `experiment_record:${latest.id}` : null,
    });
  }
  return out;
}

function awaiting(db, projectId) {
  const rows = db.prepare(
    `SELECT e.id, e.campaign_id, e.type, e.payload_json FROM campaign_events e JOIN campaigns c ON c.id = e.campaign_id
     WHERE c.project_id = ? AND e.type IN (?, ?) ORDER BY e.rowid ASC`,
  ).all(projectId, LAB_EVENT.VALIDATION_REQUESTED, LAB_EVENT.OBSERVATION_INGESTED);
  const requests = new Map();
  const observed = new Set();
  for (const row of rows) {
    const p = P(row.payload_json, {});
    const key = `${row.campaign_id}\u0000${p.candidateId}`;
    if (row.type === LAB_EVENT.OBSERVATION_INGESTED) observed.add(key);
    else if (p.status === 'READY_FOR_EXTERNAL_LAB_REVIEW') requests.set(key, { campaignId: row.campaign_id, candidateId: p.candidateId ?? null, requestEventId: row.id, objective: p.objective ?? null });
  }
  return [...requests.entries()].filter(([key]) => !observed.has(key)).map(([, value]) => value);
}

/** Rebuild Flight Control from canonical append-only campaign events; no state is stored here. */
function scienceFlightControlOf(db, projectId) {
  const rows = db.prepare(
    `SELECT e.campaign_id, e.payload_json FROM campaign_events e JOIN campaigns c ON c.id = e.campaign_id
     WHERE c.project_id = ? AND e.type = ? ORDER BY e.rowid ASC`,
  ).all(projectId, VIRTUAL_EVENT.PLANNED);
  const keys = new Map();
  for (const row of rows) {
    const payload = P(row.payload_json, {});
    if (typeof payload.candidateId !== 'string' || !payload.candidateId) continue;
    keys.set(`${row.campaign_id}\u0000${payload.candidateId}`, { campaignId: row.campaign_id, candidateId: payload.candidateId });
  }
  return [...keys.values()].flatMap(({ campaignId, candidateId }) => {
    const dossier = buildVirtualLabDossier(db, campaignId, candidateId);
    if (!dossier.ok) return [];
    return dossier.dossier.flightControl.flights.map((flight) => ({ campaignId, candidateId, ...flight }));
  });
}

/**
 * Rebuilds the cognitive state of one project. `selfModel` is the ENTITY-1 self model (or null when it
 * could not be built, in which case blocked capabilities are UNKNOWN, not "none").
 */
export function buildCognitiveState(db, projectId, { selfModel = null, now = () => new Date() } = {}) {
  const campaigns = db.prepare('SELECT id, objective, domain, status, current_generation FROM campaigns WHERE project_id = ? ORDER BY created_at ASC').all(projectId);
  const jobs = db.prepare("SELECT id, type, status, progress FROM jobs WHERE project_id = ? AND status IN ('queued', 'running') ORDER BY created_at ASC").all(projectId);
  // ResearchRun experiments live in the lease queue (uppercase states, no project_id on the row): join via the run.
  const researchJobs = db.prepare(`SELECT j.id, j.research_run_id, j.status, j.params_json, j.worker_id, j.lease_expires_at, j.attempts
    FROM jobs j JOIN agent_runs r ON r.id = j.research_run_id
    WHERE r.project_id = ? AND j.idempotency_key IS NOT NULL AND j.status IN ('QUEUED', 'CLAIMED') ORDER BY j.created_at ASC, j.rowid ASC`).all(projectId)
    .map((j) => ({ ...j, hypothesisId: P(j.params_json, {})?.hypothesisId ?? null }));
  const runs = researchRuns(db, projectId);
  const registry = readKnowledgeRegistry(db, projectId);
  const openRuns = runs.filter((r) => r.integrity.ok && !r.terminal && r.run.status === 'RUNNING');

  const knowledgeGaps = registry.chain.ok
    ? registry.gaps.filter((g) => g.status === 'OPEN')
    : { status: 'UNKNOWN', reason: 'STATE_INTEGRITY_FAILURE', brokenAt: registry.chain.brokenAt };
  const contradictions = registry.chain.ok
    ? registry.contradictions
    : { status: 'UNKNOWN', reason: 'STATE_INTEGRITY_FAILURE', brokenAt: registry.chain.brokenAt };

  const proposedClaims = registry.chain.ok
    ? registry.claims
    : { status: 'UNKNOWN', reason: 'STATE_INTEGRITY_FAILURE', brokenAt: registry.chain.brokenAt };

  const engineByCapability = new Map((selfModel?.engines ?? []).map((e) => [e.capabilityId, e]));
  const awaitingList = awaiting(db, projectId);
  const flightControl = scienceFlightControlOf(db, projectId);
  const proposedNextActions = [
    ...openRuns.filter((r) => r.nextExperiment?.continue === true).map((r) => ({
      status: 'PROPOSED', kind: 'CONTINUE_RESEARCH', runId: r.run.id, reason: r.nextExperiment.reason ?? null, from: 'research-state',
    })),
    ...(Array.isArray(knowledgeGaps) ? knowledgeGaps : []).map((g) => {
      const engine = g.requiredCapability ? engineByCapability.get(g.requiredCapability) ?? null : null;
      return {
        status: 'PROPOSED', kind: 'OBTAIN_MISSING_EVIDENCE', gapId: g.gapId, missingEvidence: g.missingEvidence, from: 'knowledge-registry',
        requiredCapability: g.requiredCapability,
        capabilityRuntimeAvailableNow: g.requiredCapability ? (selfModel ? engine?.runtimeAvailableNow ?? false : 'UNKNOWN') : null,
      };
    }),
    ...(Array.isArray(contradictions) ? contradictions : []).filter((c) => c.status === 'UNRESOLVED').map((c) => ({
      status: 'PROPOSED', kind: 'SEEK_EVIDENCE_FOR_CONTRADICTION', contradictionId: c.contradictionId, from: 'knowledge-registry',
    })),
    ...(Array.isArray(proposedClaims) ? proposedClaims : []).filter((c) => c.experimentProposal).map((c) => ({
      status: 'PROPOSED', kind: 'REVIEW_EXTERNAL_MODEL_EXPERIMENT', proposalId: c.proposalId, decision: c.experimentProposal.decision, from: 'external-model',
    })),
    ...awaitingList.map((a) => ({ status: 'PROPOSED', kind: 'AWAIT_EXTERNAL_OBSERVATION', campaignId: a.campaignId, candidateId: a.candidateId, from: 'lab-closed-loop' })),
  ];

  const recentEvidenceRefs = [
    ...db.prepare('SELECT id, created_at FROM experiment_records WHERE project_id = ? ORDER BY created_at DESC LIMIT ?').all(projectId, RECENT_LIMIT).map((r) => ({ ref: `experiment_record:${r.id}`, at: r.created_at })),
    ...db.prepare("SELECT id, created_at FROM science_runs WHERE project_id = ? AND status = 'ok' ORDER BY created_at DESC LIMIT ?").all(projectId, RECENT_LIMIT).map((r) => ({ ref: `science_run:${r.id}`, at: r.created_at })),
  ].sort((a, b) => b.at - a.at).slice(0, RECENT_LIMIT).map((r) => r.ref);

  const byt = buildBytProjection({ runs, registry, selfModel, flightControl });

  return {
    schemaVersion: COGNITIVE_STATE_SCHEMA_VERSION,
    projectId,
    generatedAt: now().toISOString(),
    view: 'MATERIALIZED_VIEW',
    byt,
    currentGoals: [
      ...campaigns.filter((c) => !TERMINAL_CAMPAIGN.has(c.status)).map((c) => ({ kind: 'CAMPAIGN', id: c.id, goal: c.objective, domain: c.domain, status: c.status })),
      ...openRuns.map((r) => ({ kind: 'RESEARCH_RUN', id: r.run.id, goal: r.run.goal, domain: r.run.domain, status: r.run.status })),
    ],
    activeQuestions: [
      ...openRuns.filter((r) => r.problem !== null).map((r) => ({ kind: 'RESEARCH_PROBLEM', runId: r.run.id, problem: r.problem })),
      ...(Array.isArray(knowledgeGaps) ? knowledgeGaps.filter((g) => g.source.kind === 'OPEN_QUESTION').map((g) => ({ kind: 'OPEN_QUESTION', gapId: g.gapId, question: g.question })) : []),
    ],
    activeHypotheses: [
      ...hypothesesFromRecords(db, projectId, campaigns).filter((h) => h.status !== 'FALSIFIED'),
      ...openRuns.filter((r) => r.hypotheses !== null).map((r) => ({ source: 'RESEARCH_STATE', runId: r.run.id, hypotheses: r.hypotheses, status: 'UNKNOWN' })),
    ],
    knowledgeGaps,
    contradictions,
    proposedClaims,
    blockedCapabilities: selfModel
      ? [
        ...selfModel.blockedEngines.map((e) => ({ kind: 'ENGINE_RUNTIME', id: e.toolId, blockedBy: e.blockedBy })),
        ...selfModel.missingCapabilities.map((c) => ({ kind: 'NO_ADAPTER', id: c.id, blockedBy: c.status })),
      ]
      : { status: 'UNKNOWN', reason: 'SELF_MODEL_UNAVAILABLE' },
    pendingExperiments: [
      ...campaigns.filter((c) => c.status === 'created').map((c) => ({ kind: 'CAMPAIGN', id: c.id })),
      ...jobs.filter((j) => j.status === 'queued').map((j) => ({ kind: 'JOB', id: j.id, type: j.type })),
      ...researchJobs.filter((j) => j.status === 'QUEUED').map((j) => ({ kind: 'RESEARCH_RUN_JOB', id: j.id, researchRunId: j.research_run_id, hypothesisId: j.hypothesisId })),
    ],
    runningExperiments: [
      ...campaigns.filter((c) => c.status === 'running').map((c) => ({ kind: 'CAMPAIGN', id: c.id, generation: c.current_generation })),
      ...jobs.filter((j) => j.status === 'running').map((j) => ({ kind: 'JOB', id: j.id, type: j.type, progress: j.progress })),
      ...researchJobs.filter((j) => j.status === 'CLAIMED').map((j) => ({
        kind: 'RESEARCH_RUN_JOB', id: j.id, researchRunId: j.research_run_id, hypothesisId: j.hypothesisId,
        workerId: j.worker_id, leaseExpiresAt: j.lease_expires_at, attempts: j.attempts,
      })),
    ],
    awaitingExternalMeasurements: awaitingList,
    recentEvidenceRefs,
    proposedNextActions,
    integrity: {
      researchRuns: runs.map((r) => ({ runId: r.run.id, ...r.integrity })),
      knowledgeRegistry: registry.chain,
    },
  };
}

/** BYT projection only (no campaigns, jobs or flight control): enough for cross-run memory such as the Necropolis. */
export function buildProjectBytProjection(db, projectId) {
  return buildBytProjection({ runs: researchRuns(db, projectId), registry: readKnowledgeRegistry(db, projectId), selfModel: null, flightControl: null });
}
