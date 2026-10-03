import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import { ComputeColliderEngine } from '@genesis/core/cern/ComputeColliderEngine.js';
import { ResearchStateIntegrityError, ResearchStateLog, type ResearchStateEvent } from '../core/mind/researchState';
import { AgentRunResearchStateStore, ResearchStateAppendOnlyError, type ResearchStateTransport } from '../core/mind/agentRunResearchStateStore';
import { MindKnowledgeIndex } from '../core/mind/knowledgeIndex';
import type { PersistedResearchState } from '../core/backend/client';
import { canonicalJson, fnv1a } from '../core/events/hash';
import { createHypothesis, updateConfidence } from '../core/experimentFabric/beliefRevision';
import type { ModelSpec } from '../core/agent/modelSpace';
import {
  consultFalsifiedModelRegistry,
  FalsifiedModelRegistryIntegrityError,
  listFalsifiedModelRecords,
  recordFalsification,
  resetFalsifiedModelRegistryForTests,
  setFalsifiedModelRegistryPersistenceForTests,
  simulateFalsifiedModelRegistryRestartForTests,
  falsifiedModelRegistryPersistence,
  type FalsifiedModelRegistryPersistencePort,
} from '../core/agent/falsifiedModelRegistry';
import { checkEpistemicConsistency, EpistemicConsistencyError } from '../core/epistemicConsistency';
import { saveExperiment } from '../core/scienceMemory';
import { directGenesisWorld, recordDirectedWorld } from '../core/worldDirector/genesisWorldDirector';

/**
 * ENTITY-0 — Genesis keeps what it knew across a restart, and still knows what is true and what is
 * only a hypothesis. One `it` per property the phase-1 brief lists.
 */

/**
 * Stands in for the backend route, with the backend's own rules: append only at the next seq,
 * identical re-send is a no-op, and the stored events outlive any one `ResearchStateLog` object.
 * The real route and its SQLite restart are proven in backend `researchStatePersistence.test.mjs`.
 */
function fakeServer() {
  const rows: ResearchStateEvent[] = [];
  const serverChainOk = { value: true };
  const transport: ResearchStateTransport = {
    async read(): Promise<PersistedResearchState> {
      return { events: rows.map((row) => JSON.parse(JSON.stringify(row))), chain: { ok: serverChainOk.value, length: rows.length, head: rows.at(-1)?.transitionFingerprint ?? null, brokenAt: serverChainOk.value ? null : 0, reason: serverChainOk.value ? null : 'tampered' } };
    },
    async append(event) {
      if (event.seq < rows.length) {
        if (canonicalJson(rows[event.seq]) !== canonicalJson(event)) throw new Error('step_index_conflict');
        return;
      }
      if (event.seq !== rows.length) throw new Error('step_index_conflict');
      rows.push(JSON.parse(JSON.stringify(event)));
    },
  };
  return { rows, transport, serverChainOk };
}

describe('ENTITY-0 · 1–2 research state survives a restart and its chain is re-verified', () => {
  it('a reopened log recovers problem, hypotheses, frozen predictions, evidence refs, next experiment, terminal and head', async () => {
    const server = fakeServer();
    const before = await ResearchStateLog.open(new AgentRunResearchStateStore(server.transport));
    await before.append('PROBLEM_FORMALIZED', 't0', { problemId: 'kepler', problemFingerprint: 'abc' });
    await before.append('HYPOTHESES_GENERATED', 't1', { hypotheses: ['H1:a^1.5', 'H2:a^2'] });
    await before.append('PREDICTIONS_FROZEN', 't2', { H1: 1.5, H2: 2 });
    await before.append('EVIDENCE_UPDATE', 't3', { evidenceRefs: ['EV-nasa-fact-sheet'] });
    await before.append('NEXT_EXPERIMENT', 't4', { round: 0, continue: true, reason: 'pair not separated' });
    const headBefore = before.headFingerprint();

    // "Process killed": the object is gone; only what the server stored remains.
    const after = await ResearchStateLog.open(new AgentRunResearchStateStore(server.transport));
    expect(after.headFingerprint()).toBe(headBefore);
    expect(await after.verifyChain()).toBe(true);
    const snapshot = await after.snapshot();
    expect(snapshot).toMatchObject({
      eventCount: 5,
      head: headBefore,
      problem: { problemId: 'kepler', problemFingerprint: 'abc' },
      hypotheses: { hypotheses: ['H1:a^1.5', 'H2:a^2'] },
      frozenPredictions: { H1: 1.5, H2: 2 },
      evidenceUpdates: [{ evidenceRefs: ['EV-nasa-fact-sheet'] }],
      nextExperiment: { round: 0, continue: true, reason: 'pair not separated' },
      terminal: null,
    });

    // Work continues on the recovered head, not from zero.
    await after.append('TERMINAL', 't5', { terminal: 'NO_WINNER', stopReason: 'budget' });
    expect((await after.snapshot()).terminal).toEqual({ terminal: 'NO_WINNER', stopReason: 'budget' });
    expect(server.rows.map((row) => row.seq)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('research state can never be deleted through the durable store', async () => {
    const server = fakeServer();
    const log = await ResearchStateLog.open(new AgentRunResearchStateStore(server.transport));
    await log.append('PROBLEM_FORMALIZED', 't0', { problemId: 'p' });
    await expect(new AgentRunResearchStateStore(server.transport).delete('ev-000000')).rejects.toBeInstanceOf(ResearchStateAppendOnlyError);
  });
});

describe('ENTITY-0 · 7 corrupted persisted state fails closed', () => {
  it('an edited payload on disk → STATE_INTEGRITY_FAILURE on reopen, nothing repaired', async () => {
    const server = fakeServer();
    const log = await ResearchStateLog.open(new AgentRunResearchStateStore(server.transport));
    await log.append('PROBLEM_FORMALIZED', 't0', { problemId: 'p' });
    await log.append('HYPOTHESES_GENERATED', 't1', { hypotheses: ['H1'] });
    server.rows[1] = { ...server.rows[1]!, payload: { hypotheses: ['H1', 'H-injected'] } };

    const reopened = ResearchStateLog.open(new AgentRunResearchStateStore(server.transport));
    await expect(reopened).rejects.toBeInstanceOf(ResearchStateIntegrityError);
    await expect(reopened).rejects.toMatchObject({ code: 'STATE_INTEGRITY_FAILURE', brokenAt: 1, reason: 'payload_fingerprint_mismatch' });
    expect(server.rows[1]!.payload).toEqual({ hypotheses: ['H1', 'H-injected'] });
  });

  it('a dropped middle event → STATE_INTEGRITY_FAILURE', async () => {
    const server = fakeServer();
    const log = await ResearchStateLog.open(new AgentRunResearchStateStore(server.transport));
    for (const [i, type] of (['PROBLEM_FORMALIZED', 'HYPOTHESES_GENERATED', 'TERMINAL'] as const).entries()) await log.append(type, `t${i}`, { i });
    server.rows.splice(1, 1);
    await expect(ResearchStateLog.open(new AgentRunResearchStateStore(server.transport))).rejects.toMatchObject({ code: 'STATE_INTEGRITY_FAILURE' });
  });

  it('a server that reports its own chain broken is believed, even if the events look fine', async () => {
    const server = fakeServer();
    const log = await ResearchStateLog.open(new AgentRunResearchStateStore(server.transport));
    await log.append('PROBLEM_FORMALIZED', 't0', { problemId: 'p' });
    server.serverChainOk.value = false;
    await expect(ResearchStateLog.open(new AgentRunResearchStateStore(server.transport))).rejects.toMatchObject({ code: 'STATE_INTEGRITY_FAILURE' });
  });
});

function falsified(id: string) {
  return updateConfidence(createHypothesis(id, { metric: id, relation: 'less-than', rationale: 'fixture' }, 0.5), 'FALSIFIED_WITHIN_PROTOCOL', 0.9, 'beaten', 1);
}
const LOG_MODEL: ModelSpec = { id: 'm', terms: [{ basis: 'LOG', variable: 'x' }], lineage: null };
const SCOPE = { domain: 'kepler-lab', assumptions: ['iid noise'], boundary: 'a in [0.4, 30] AU' };

describe('ENTITY-0 · 3 a falsified model survives a restart', () => {
  let stored: unknown = null;
  const port: FalsifiedModelRegistryPersistencePort = {
    load: () => (stored === null ? null : JSON.parse(JSON.stringify(stored))),
    save: (snapshot) => { stored = JSON.parse(JSON.stringify(snapshot)); return true; },
    clear: () => { stored = null; },
  };
  beforeEach(() => { stored = null; setFalsifiedModelRegistryPersistenceForTests(port); });
  afterEach(() => { resetFalsifiedModelRegistryForTests(); setFalsifiedModelRegistryPersistenceForTests(null); });

  it('after a restart the same path is still refused, not rediscovered', () => {
    recordFalsification({ spec: LOG_MODEL, scope: SCOPE, reusableAs: 'NEVER', evidence: falsified('h-log'), campaignId: 'c1', round: 2, observationIds: ['obs-7'] });
    expect(falsifiedModelRegistryPersistence().lastSavePersisted).toBe(true);

    simulateFalsifiedModelRegistryRestartForTests();
    expect(listFalsifiedModelRecords()).toHaveLength(1);
    expect(consultFalsifiedModelRegistry({ spec: LOG_MODEL, scope: SCOPE }).verdict).toBe('BLOCK');
  });

  it('a stored record edited outside the app → STATE_INTEGRITY_FAILURE on every call; never repaired, never overwritten', () => {
    recordFalsification({ spec: LOG_MODEL, scope: SCOPE, reusableAs: 'NEVER', evidence: falsified('h-log'), campaignId: 'c1', round: 2, observationIds: ['obs-7'] });
    const tampered = JSON.parse(JSON.stringify(stored)) as { entries: { record: { reusableAs: string } }[]; digest: string };
    tampered.entries[0]!.record.reusableAs = 'VARIANT_ONLY';
    tampered.digest = fnv1a(canonicalJson(tampered.entries)); // even a consistent digest cannot hide an edited record
    stored = tampered;

    simulateFalsifiedModelRegistryRestartForTests();
    expect(() => consultFalsifiedModelRegistry({ spec: LOG_MODEL, scope: SCOPE })).toThrow(FalsifiedModelRegistryIntegrityError);
    expect(() => recordFalsification({ spec: LOG_MODEL, scope: SCOPE, reusableAs: 'NEVER', evidence: falsified('h2'), campaignId: 'c2', round: 1, observationIds: ['o'] })).toThrow(/STATE_INTEGRITY_FAILURE/);
    expect(stored).toEqual(tampered);
  });
});

describe('ENTITY-0 · 4 a language model cannot state a FACT', () => {
  it('llmAssisted FACT is stored as HYPOTHESIS (existing D-060 rule, re-asserted)', async () => {
    const item = await new MindKnowledgeIndex().add({ itemId: 'k1', status: 'FACT', claim: 'GLP-1R agonism reduces appetite', provenanceRefs: [], provenanceRanks: [1], llmAssisted: true });
    expect(item.status).toBe('HYPOTHESIS');
  });

  it('the central check rejects an LLM claim marked as fact without an evidence path', () => {
    expect(checkEpistemicConsistency({ epistemicStatus: 'FACT', llmAssisted: true }).violations).toContain('LLM_OUTPUT_AS_FACT');
    expect(checkEpistemicConsistency({ epistemicStatus: 'FACT', llmAssisted: true, evidenceRefs: ['EV-1'] }).ok).toBe(true);
  });
});

describe('ENTITY-0 · 5 a model can never become a real measurement', () => {
  it('names each forbidden combination and passes honest ones', () => {
    expect(checkEpistemicConsistency({ epistemicStatus: 'REAL_EXPERIMENTAL', dataProvenance: 'SIMULATED' }).violations).toContain('SIMULATION_AS_MEASUREMENT');
    expect(checkEpistemicConsistency({ epistemicStatus: 'OBSERVED', evidenceClass: 'SIMULATED' }).violations).toContain('SIMULATION_AS_MEASUREMENT');
    expect(checkEpistemicConsistency({ dataProvenance: 'REAL_EXPERIMENTAL', evidenceClass: 'MODEL_ESTIMATE' }).violations).toContain('MODEL_AS_REAL_EXPERIMENTAL');
    expect(checkEpistemicConsistency({ epistemicStatus: 'REAL_EXPERIMENTAL', dataProvenance: 'REFERENCE' }).violations).toContain('REFERENCE_AS_OWN_MEASUREMENT');
    expect(checkEpistemicConsistency({ epistemicStatus: 'SIMULATION', dataProvenance: 'SIMULATED' }).ok).toBe(true);
    expect(checkEpistemicConsistency({ epistemicStatus: 'OBSERVED', dataProvenance: 'REFERENCE' }).ok).toBe(true);
    expect(checkEpistemicConsistency({ epistemicStatus: 'REAL_EXPERIMENTAL', dataProvenance: 'REAL_EXPERIMENTAL', evidenceClass: 'REAL_ENGINE_OUTPUT' }).ok).toBe(true);
  });

  it('Science Memory refuses to store a simulated run labelled as a real experiment', () => {
    expect(() => saveExperiment({
      labId: 'universe', experimentId: 'sim', experimentName: 'Simulated run', params: {}, stats: {},
      honesty: 'simplified', honestyNote: 'solver output', epistemicStatus: 'REAL_EXPERIMENTAL',
      execution: { status: 'completed', runId: 'r1', runFingerprint: 'f1', resultOrigin: 'real-engine', dataProvenance: 'SIMULATED', summary: 's' },
    })).toThrow(EpistemicConsistencyError);
  });
});

describe('ENTITY-0 · 6 visualisations propose, they do not publish', () => {
  it('World Director records a pending proposal, not active evidence; identical worlds do not stack proposals', () => {
    const ledger = new EvidenceLedger({ now: () => 42 });
    const directed = directGenesisWorld({ preset: 'MODERN_CITY', populationEnabled: false, light: 'DAY', weather: 'CLEAR', navigation: 'WALK' });
    const a = recordDirectedWorld(ledger, directed);
    const b = recordDirectedWorld(ledger, directed);
    expect(a).toBe(b);
    expect(ledger.getActive()).toHaveLength(0);
    expect(ledger.getProposals()).toHaveLength(1);
    expect(ledger.getProposals()[0]!.status).toBe('pending');
    expect(ledger.getProposals()[0]!.record.contentHash).toBe(a);
  });

  it('the CERN collider batch is a pending MODEL proposal; only a human publish makes it active', () => {
    const ledger = new EvidenceLedger({ now: () => 7 });
    const engine = new ComputeColliderEngine(ledger, 'entity0', 13600);
    const hash = engine.commitBatch(engine.generateBatch(3));
    expect(ledger.getActive()).toHaveLength(0);
    const proposal = ledger.getProposals().find((p) => p.record.contentHash === hash)!;
    expect(proposal.record.claimType).toBe('model');
    ledger.publish(proposal.proposalId, 'reviewer-1');
    expect(ledger.getActive().map((r) => r.contentHash)).toContain(hash);
    expect(ledger.verifyLedger().ok).toBe(true);
  });
});
