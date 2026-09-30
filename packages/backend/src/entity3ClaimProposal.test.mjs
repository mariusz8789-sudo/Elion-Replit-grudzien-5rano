import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from './store.mjs';
import { handleApi } from './api.mjs';
import { canonicalJson, fnv1a } from './determinism.mjs';
import { RESEARCH_STATE_GENESIS_HEAD } from './agentRun.mjs';
import { createCampaign, getCampaign } from './campaign/persistence.mjs';
import { preregisterExperiment } from './experimentMemory.mjs';
import { buildCognitiveState } from './cognitiveState.mjs';
import { readKnowledgeRegistry, REGISTRY_EVENT_TYPES } from './knowledgeRegistry.mjs';
import { proposeScientificClaim, validateClaimProposal, decideExperimentProposal, parseProposalText } from './claimProposal.mjs';
import { createReasoningProvider, ReasoningProviderError } from './reasoningProvider.mjs';

/**
 * ENTITY-3 — an external model may propose, never know. Its answer is validated, degraded where it
 * claims knowledge, stored as PROPOSED, and nothing it says becomes fact without Evidence.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** A model answer that tries everything it must not: FACT, SUPPORTED, invented citations. */
const OVERCONFIDENT = {
  claim: 'Compound X is a GLP-1R agonist with EC50 = 3 nM.',
  claimType: 'FACT',
  status: 'SUPPORTED',
  hypothesisId: null,
  assumptions: ['cAMP assay is representative'],
  supportingEvidenceRefs: ['experiment_record:does-not-exist', 'https://example.org/paper', 'doi:10.1000/fake'],
  contradictingEvidenceRefs: [],
  missingEvidence: ['A measured cAMP EC50 for compound X'],
  uncertainty: { level: 'LOW', statement: 'Very sure.' },
  falsificationProposal: 'A cAMP assay showing EC50 > 1 µM for compound X.',
  experimentProposal: null,
};

function fakeProvider(text, { providerId = 'ANTHROPIC_CLAUDE', model = 'fake-model' } = {}) {
  let calls = 0;
  return {
    providerId, model, configured: true, reason: null,
    describe: () => ({ providerId, model, configured: true, status: 'CONFIGURED', reason: null }),
    async complete() { calls += 1; if (text instanceof Error) throw text; return { text: typeof text === 'string' ? text : JSON.stringify(text), model }; },
    get calls() { return calls; },
  };
}

function setup(db, email = 'entity3@lab.org', reasoningProvider) {
  const call = (method, pathname, { token, body } = {}) => handleApi(db, { method, pathname, token, body, query: {}, reasoningProvider });
  const owner = call('POST', '/api/auth/register', { body: { email, password: 'password123' } }).body;
  const project = call('POST', '/api/projects', { token: owner.token, body: { name: 'ENTITY-3' } }).body.project;
  return { call, owner, project, base: `/api/projects/${project.id}` };
}

const selfModelWith = (engines) => ({ engines, knownModels: [{ kind: 'PREDICTIVE_MODEL_GATE', target: 'GLP1R', ruleId: 'D-144-GATE', ruleFingerprint: 'd2f77a7e6042f0fc' }], failedGates: [] });
const snapshot = (db, projectId) => ({ registry: readKnowledgeRegistry(db, projectId).events, state: { ...buildCognitiveState(db, projectId, {}), generatedAt: null } });

describe('ENTITY-3 claim proposals from an external model', () => {
  test('1. a hallucinated FACT is stored only as a PROPOSED HYPOTHESIS; invented citations support nothing', async () => {
    const db = openDatabase();
    const { call, owner, project, base } = setup(db, 'e3-1@lab.org', fakeProvider(OVERCONFIDENT));
    const res = await call('POST', `${base}/claim-proposals`, { token: owner.token, body: { question: 'Is compound X a GLP-1R agonist?' } });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const p = res.body.proposal;
    assert.equal(p.status, 'PROPOSED');
    assert.equal(p.claimType, 'HYPOTHESIS');
    assert.equal(p.epistemicStatus, 'NOT_EVIDENCE');
    assert.deepEqual(p.supportingEvidenceRefs, [], 'no citation that does not resolve in this project survives');
    assert.equal(p.unresolvedEvidenceRefs.length, 3);
    assert.ok(p.degradations.some((d) => d.field === 'claimType' && d.from === 'FACT' && d.reason === 'MODEL_CANNOT_ASSERT_KNOWLEDGE'));
    assert.ok(p.degradations.some((d) => d.field === 'status' && d.from === 'SUPPORTED'));
    assert.equal(p.generatedBy.kind, 'EXTERNAL_REASONING_MODEL');

    for (const t of ['SUPPORTED', 'REAL_MEASUREMENT', 'VALIDATED', 'OBSERVED']) {
      const v = validateClaimProposal({ ...OVERCONFIDENT, claimType: t }, { db, projectId: project.id });
      assert.equal(v.proposal.claimType, 'HYPOTHESIS', `${t} is degraded`);
    }

    const state = buildCognitiveState(db, project.id, {});
    assert.equal(state.proposedClaims.length, 1);
    assert.equal(state.proposedClaims[0].status, 'PROPOSED');
    assert.ok(state.activeHypotheses.every((h) => h.status !== 'SUPPORTED'), 'a proposal never shows up as a supported hypothesis');
    assert.ok(!REGISTRY_EVENT_TYPES.some((t) => /PROMOT|ACCEPT|VERIF|CONFIRM/.test(t)), 'the registry has no event that turns a proposal into fact');
    assert.equal(call('GET', `${base}/claim-proposals`, { token: owner.token }).body.proposals[0].claimType, 'HYPOTHESIS');
  });

  test('   a citation that resolves in this project is kept as support', async () => {
    const db = openDatabase();
    const { owner, project } = setup(db, 'e3-1b@lab.org');
    const campaign = getCampaign(db, createCampaign(db, { projectId: project.id, objective: 'o', domain: 'PHYSICS', createdBy: owner.user.id }).id);
    const prereg = preregisterExperiment(db, { projectId: project.id, campaign, userId: owner.user.id, hypothesis: {
      subject: 'kepler', target: { targetId: 'SOLAR_SYSTEM' }, statement: 'T ~ a^1.5',
      criteria: [{ id: 'exponent', critical: true, threshold: 1.5, evidence: 'REFERENCE_DATA', label: 'exponent' }],
    } });
    const ref = `experiment_record:${prereg.record.id}`;
    const v = validateClaimProposal({ ...OVERCONFIDENT, supportingEvidenceRefs: [ref, 'experiment_record:nope'] }, { db, projectId: project.id });
    assert.deepEqual(v.proposal.supportingEvidenceRefs, [ref]);
    assert.equal(v.proposal.status, 'PROPOSED', 'even real support leaves the claim PROPOSED: evidence decides through its own routes');
  });

  test('2. an experiment on an engine Genesis does not have is blocked by the self model', async () => {
    const db = openDatabase();
    const answer = { ...OVERCONFIDENT, experimentProposal: { engineId: 'alphafold-9000', kind: 'COMPUTATIONAL', description: 'fold it' } };
    const { call, owner, base } = setup(db, 'e3-2@lab.org', fakeProvider(answer));
    const res = await call('POST', `${base}/claim-proposals`, { token: owner.token, body: { question: 'Fold X?' } });
    assert.equal(res.status, 201);
    assert.equal(res.body.proposal.experimentProposal.decision, 'BLOCKED_BY_SELF_MODEL');
    assert.match(res.body.proposal.experimentProposal.reason, /UNKNOWN_ENGINE/);
    assert.equal(res.body.proposal.experimentProposal.executedByModel, false);

    const engines = [
      { toolId: 'openmm', capabilityId: 'md', runtimeAvailableNow: false, blockedBy: 'BLOCKED_BY_RUNTIME', statement: 'Mam adapter OpenMM, ale obecnie runtime jest niedostępny (BLOCKED_BY_RUNTIME).' },
      { toolId: 'rdkit', capabilityId: 'chem', runtimeAvailableNow: true, blockedBy: null },
    ];
    assert.equal(decideExperimentProposal({ engineId: 'openmm', kind: 'COMPUTATIONAL' }, { selfModel: selfModelWith(engines) }).decision, 'BLOCKED_BY_RUNTIME');
    assert.equal(decideExperimentProposal({ engineId: 'rdkit', kind: 'COMPUTATIONAL' }, { selfModel: selfModelWith(engines) }).decision, 'PROPOSED');
    assert.equal(decideExperimentProposal({ engineId: 'rdkit', kind: 'COMPUTATIONAL' }, { selfModel: null }).decision, 'BLOCKED_BY_SELF_MODEL', 'no self model → fail closed');
  });

  test('3. a proposed change to a frozen threshold is rejected', () => {
    const selfModel = selfModelWith([{ toolId: 'rdkit', capabilityId: 'chem', runtimeAvailableNow: true }]);
    for (const target of ['gate.maxMae', 'D-146 acceptance criterion', 'preregistration.split', 'MAX_MAE', 'D-144-GATE']) {
      const d = decideExperimentProposal({ engineId: 'rdkit', kind: 'COMPUTATIONAL', parameterChanges: [{ target, to: 1.2 }] }, { selfModel, frozenTargets: new Set(['D-144-GATE']) });
      assert.equal(d.decision, 'REJECTED_FROZEN_THRESHOLD', target);
    }
    const fine = decideExperimentProposal({ engineId: 'rdkit', kind: 'COMPUTATIONAL', parameterChanges: [{ target: 'conformerCount', to: 50 }] }, { selfModel });
    assert.equal(fine.decision, 'PROPOSED', 'an ordinary parameter of a new run is not frozen');
  });

  test('4. a biological experiment requires human approval', () => {
    const selfModel = selfModelWith([]);
    for (const kind of ['BIOLOGICAL', 'WET_LAB', 'CLINICAL', 'ANIMAL', 'synthesis']) {
      assert.equal(decideExperimentProposal({ kind, description: 'measure cAMP in HEK293' }, { selfModel }).decision, 'HUMAN_APPROVAL_REQUIRED', kind);
    }
  });

  test('5. no key → BLOCKED_BY_PROVIDER_CONFIGURATION, nothing called, nothing written', async () => {
    const provider = createReasoningProvider({});
    assert.equal(provider.configured, false);
    assert.equal(provider.describe().status, 'BLOCKED_BY_PROVIDER_CONFIGURATION');
    assert.equal(createReasoningProvider({ GENESIS_REASONING_PROVIDER: 'anthropic' }).configured, false);
    assert.equal(createReasoningProvider({ GENESIS_REASONING_PROVIDER: 'openai', GENESIS_REASONING_BASE_URL: 'https://x', GENESIS_REASONING_MODEL: 'm' }).configured, false);
    await assert.rejects(provider.complete({ system: 's', prompt: 'p' }), (e) => e instanceof ReasoningProviderError && e.code === 'NOT_CONFIGURED');

    const db = openDatabase();
    const { call, owner, project, base } = setup(db, 'e3-5@lab.org');
    const res = await call('POST', `${base}/claim-proposals`, { token: owner.token, body: { question: 'q' } });
    assert.equal(res.status, 503);
    assert.equal(res.body.error, 'BLOCKED_BY_PROVIDER_CONFIGURATION');
    assert.equal(readKnowledgeRegistry(db, project.id).events.length, 0);
    const described = JSON.stringify(createReasoningProvider({ ANTHROPIC_API_KEY: 'sk-secret-123' }).describe());
    assert.ok(!described.includes('sk-secret-123'), 'the key is never described');
  });

  test('6. a provider timeout leaves the state exactly as it was', async () => {
    const db = openDatabase();
    const { owner, project } = setup(db, 'e3-6@lab.org');
    await proposeScientificClaim(db, project.id, { question: 'first' }, { provider: fakeProvider(OVERCONFIDENT), userId: owner.user.id });
    const before = snapshot(db, project.id);

    const hanging = createReasoningProvider({ GENESIS_REASONING_PROVIDER: 'local', GENESIS_REASONING_BASE_URL: 'http://127.0.0.1:1/v1', GENESIS_REASONING_MODEL: 'm' }, {
      // AbortSignal.timeout does not hold the event loop open; the keep-alive stands in for the server's socket.
      fetchImpl: (_url, { signal }) => new Promise((_, reject) => {
        const keepAlive = setTimeout(() => {}, 10_000);
        signal.addEventListener('abort', () => { clearTimeout(keepAlive); reject(signal.reason); });
      }),
    });
    const res = await proposeScientificClaim(db, project.id, { question: 'second' }, { provider: hanging, timeoutMs: 50, userId: owner.user.id });
    assert.equal(res.ok, false);
    assert.equal(res.status, 'PROVIDER_TIMEOUT');
    const viaError = await proposeScientificClaim(db, project.id, { question: 'third' }, { provider: fakeProvider(new ReasoningProviderError('TIMEOUT', 't')) });
    assert.equal(viaError.status, 'PROVIDER_TIMEOUT');
    assert.deepEqual(snapshot(db, project.id), before);
    assert.equal(readKnowledgeRegistry(db, project.id).chain.ok, true);
  });

  test('7. a malformed response is rejected and nothing is stored', async () => {
    const db = openDatabase();
    const { owner, project } = setup(db, 'e3-7@lab.org');
    for (const text of ['', 'Sure! Compound X works.', '[1,2]', '{"claim": "no falsification"}', JSON.stringify({ falsificationProposal: 'x' }), '```json\n{"claim": \n```']) {
      const res = await proposeScientificClaim(db, project.id, { question: 'q' }, { provider: fakeProvider(text), userId: owner.user.id });
      assert.equal(res.status, 'REJECTED_MALFORMED_RESPONSE', text);
    }
    assert.equal(readKnowledgeRegistry(db, project.id).events.length, 0);
    assert.equal(parseProposalText('```json\n{"claim":"c","falsificationProposal":"f"}\n```').ok, true, 'a fenced JSON object is still one object');
  });

  test('8. a different provider gives the same Scientific Memory semantics', async () => {
    const text = JSON.stringify({ ...OVERCONFIDENT, experimentProposal: { engineId: 'alphafold-9000', kind: 'COMPUTATIONAL' } });
    class FakeAnthropic {
      constructor(opts) { this.opts = opts; this.messages = { create: async () => ({ model: 'claude-x', stop_reason: 'end_turn', content: [{ type: 'text', text }] }) }; }
    }
    const anthropic = createReasoningProvider({ ANTHROPIC_API_KEY: 'k' }, { AnthropicCtor: FakeAnthropic });
    const local = createReasoningProvider({ GENESIS_REASONING_PROVIDER: 'local', GENESIS_REASONING_BASE_URL: 'http://127.0.0.1:9/v1', GENESIS_REASONING_MODEL: 'llama-x' }, {
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ model: 'llama-x', choices: [{ message: { content: text } }] }) }),
    });
    assert.equal(anthropic.providerId, 'ANTHROPIC_CLAUDE');
    assert.equal(local.providerId, 'PRIVATE_LOCAL');

    const results = [];
    for (const provider of [anthropic, local]) {
      const db = openDatabase();
      const { owner, project } = setup(db, `e3-8-${provider.providerId}@lab.org`);
      const res = await proposeScientificClaim(db, project.id, { question: 'Is X an agonist?' }, { provider, selfModel: selfModelWith([]), userId: owner.user.id });
      assert.equal(res.ok, true, JSON.stringify(res));
      results.push(res.proposal);
    }
    const strip = (p) => Object.fromEntries(Object.entries(p).filter(([k]) => !['proposalId', 'generatedBy', 'proposedAt'].includes(k)));
    assert.deepEqual(strip(results[0]), strip(results[1]));
    assert.deepEqual(results.map((r) => r.generatedBy.providerId), ['ANTHROPIC_CLAUDE', 'PRIVATE_LOCAL']);
    assert.deepEqual(results.map((r) => r.generatedBy.model), ['claude-x', 'llama-x']);

    const refusing = createReasoningProvider({ ANTHROPIC_API_KEY: 'k' }, { AnthropicCtor: class { constructor() { this.messages = { create: async () => ({ stop_reason: 'refusal', content: [] }) }; } } });
    const db = openDatabase();
    const { project } = setup(db, 'e3-8r@lab.org');
    assert.equal((await proposeScientificClaim(db, project.id, { question: 'q' }, { provider: refusing })).status, 'PROVIDER_REFUSED');
  });

  test('RBAC: a viewer may read proposals but not ask for one', async () => {
    const db = openDatabase();
    const provider = fakeProvider(OVERCONFIDENT);
    const { call, owner, base, project } = setup(db, 'e3-rbac@lab.org', provider);
    const viewer = call('POST', '/api/auth/register', { body: { email: 'e3-viewer@lab.org', password: 'password123' } }).body;
    call('POST', `/api/projects/${project.id}/members`, { token: owner.token, body: { email: 'e3-viewer@lab.org', role: 'viewer' } });
    assert.equal((await call('POST', `${base}/claim-proposals`, { token: viewer.token, body: { question: 'q' } })).status, 403);
    assert.equal(provider.calls, 0);
    assert.equal(call('GET', `${base}/claim-proposals`, { token: viewer.token }).status, 200);
  });
});

/* ------------------------- DEFINITION OF DONE: the whole path across a killed process ------------------------- */

function chainOf(specs) {
  let head = RESEARCH_STATE_GENESIS_HEAD;
  return specs.map(([type, payload], seq) => {
    const payloadFingerprint = fnv1a(canonicalJson(payload));
    const transitionFingerprint = fnv1a(canonicalJson({ prev: head, type, payloadFingerprint, seq }));
    head = transitionFingerprint;
    return { seq, type, at: `t${seq}`, payload, payloadFingerprint, transitionFingerprint };
  });
}

function boot(dbPath, modelUrl) {
  const proc = spawn(process.execPath, [path.join(HERE, 'server.mjs')], {
    env: {
      ...process.env, PORT: '0', GENESIS_DB_PATH: dbPath, ANTHROPIC_API_KEY: '',
      GENESIS_REASONING_PROVIDER: 'local', GENESIS_REASONING_BASE_URL: modelUrl, GENESIS_REASONING_MODEL: 'fake-local-model',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error('server did not start in time')); }, 60000);
    let buf = '';
    proc.stderr.on('data', () => {});
    proc.stdout.on('data', (chunk) => {
      buf += chunk.toString();
      const started = buf.split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).find((j) => j?.msg === 'started');
      if (!started) return;
      buf = '';
      clearTimeout(timer);
      const url = `http://127.0.0.1:${started.port}`;
      const api = async (method, p, { token, body } = {}) => {
        const res = await fetch(`${url}${p}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
        return { status: res.status, body: await res.json() };
      };
      resolve({ api, kill: () => new Promise((done) => { proc.once('exit', done); proc.kill('SIGKILL'); }) });
    });
  });
}

describe('ENTITY-3 definition of done', () => {
  test('research → hypothesis → kill → restart → it knows its work, engines and gaps → asks a model → PROPOSED only', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genesis-entity3-'));
    const dbPath = path.join(dir, 'genesis.db');
    let modelCalls = 0;
    const model = createServer((req, res) => {
      modelCalls += 1;
      req.resume();
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ model: 'fake-local-model', choices: [{ message: { content: JSON.stringify({
          ...OVERCONFIDENT, experimentProposal: { kind: 'WET_LAB', description: 'Measure cAMP EC50 of compound X in HEK293-GLP1R cells.' },
        }) } }] }));
      });
    });
    await new Promise((r) => model.listen(0, '127.0.0.1', r));
    const modelUrl = `http://127.0.0.1:${model.address().port}/v1`;
    let server = null;
    try {
      // 1–3: start research, create a hypothesis, save state.
      server = await boot(dbPath, modelUrl);
      const owner = (await server.api('POST', '/api/auth/register', { body: { email: 'dod@lab.org', password: 'password123' } })).body;
      const project = (await server.api('POST', '/api/projects', { token: owner.token, body: { name: 'GLP-1R research' } })).body.project;
      const base = `/api/projects/${project.id}`;
      const run = (await server.api('POST', `${base}/agent-runs`, { token: owner.token, body: { goal: 'Is compound X a GLP-1R agonist?', domain: 'mind' } })).body.run;
      for (const event of chainOf([
        ['PROBLEM_FORMALIZED', { problemId: 'glp1r-x', problemFingerprint: 'feedc0de' }],
        ['HYPOTHESES_GENERATED', { hypotheses: ['H1: X is an agonist', 'H0: X is inactive'] }],
        ['NEXT_EXPERIMENT', { round: 0, continue: true, reason: 'no measurement yet' }],
      ])) assert.equal((await server.api('POST', `${base}/agent-runs/${run.id}/research-state`, { token: owner.token, body: { event } })).status, 201);

      // 4–5: kill the process, restart it.
      await server.kill();
      server = await boot(dbPath, modelUrl);

      // 6: it knows what it was working on.
      const state = (await server.api('GET', `${base}/cognitive-state`, { token: owner.token })).body.cognitiveState;
      assert.ok(state.currentGoals.some((g) => g.kind === 'RESEARCH_RUN' && g.goal === 'Is compound X a GLP-1R agonist?'));
      const hyp = state.activeHypotheses.find((h) => h.source === 'RESEARCH_STATE');
      assert.deepEqual(hyp.hypotheses.hypotheses, ['H1: X is an agonist', 'H0: X is inactive']);
      assert.equal(hyp.status, 'UNKNOWN');

      // 7–8: it knows its engines and what is missing.
      const self = (await server.api('GET', '/api/genesis/self')).body;
      assert.ok(self.engines.length > 0);
      assert.ok(self.missingCapabilities.length > 0);
      assert.equal(self.knownModels[0].status, 'CONFIGURED');
      assert.equal(self.knownModels[0].providerId, 'PRIVATE_LOCAL');

      // 9–11: ask an external model, get a suggestion, store it only as PROPOSED.
      const asked = await server.api('POST', `${base}/claim-proposals`, { token: owner.token, body: { question: 'Is compound X a GLP-1R agonist?' } });
      assert.equal(asked.status, 201, JSON.stringify(asked.body));
      assert.equal(modelCalls, 1);
      assert.equal(asked.body.proposal.status, 'PROPOSED');
      assert.equal(asked.body.proposal.claimType, 'HYPOTHESIS');
      assert.equal(asked.body.proposal.experimentProposal.decision, 'HUMAN_APPROVAL_REQUIRED');

      // 12: without Evidence it never becomes fact — not now, not after another restart.
      await server.kill();
      server = await boot(dbPath, modelUrl);
      const after = (await server.api('GET', `${base}/cognitive-state`, { token: owner.token })).body.cognitiveState;
      assert.equal(after.proposedClaims.length, 1);
      assert.equal(after.proposedClaims[0].status, 'PROPOSED');
      assert.equal(after.proposedClaims[0].epistemicStatus, 'NOT_EVIDENCE');
      assert.deepEqual(after.proposedClaims[0].supportingEvidenceRefs, []);
      assert.ok(after.activeHypotheses.every((h) => h.status === 'UNKNOWN'), 'the hypothesis is still unjudged');
      assert.ok(after.proposedNextActions.some((a) => a.kind === 'REVIEW_EXTERNAL_MODEL_EXPERIMENT' && a.decision === 'HUMAN_APPROVAL_REQUIRED' && a.status === 'PROPOSED'));
      assert.equal(after.integrity.knowledgeRegistry.ok, true);
    } finally {
      await server?.kill();
      model.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
