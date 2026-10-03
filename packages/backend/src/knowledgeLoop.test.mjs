import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { handleApi } from './api.mjs';
import { buildBytProjection } from './bytProjection.mjs';
import { buildCognitiveState } from './cognitiveState.mjs';
import { openGap, recordContradiction } from './knowledgeRegistry.mjs';
import { nextExperimentProposal } from './researchRunExecution.mjs';
import { loadKnowledgeSources } from './knowledgeSources.mjs';
import { priorFalsifiedClaims, synthesizeKnowledge } from './knowledgeSynthesis.mjs';
import { openDatabase } from './store.mjs';
import { detect as rdkitDetect } from './compute/rdkitAdapter.mjs';

const chain = { ok: true, head: 'h', length: 1 };
const runOf = (id, claim, verdict, extra = {}) => ({
  run: { id, domain: 'genesis.research-run' },
  integrity: { ok: true, head: `head-${id}`, events: 4 },
  researchStateEvents: [
    { seq: 1, type: 'PREDICTIONS_FROZEN', payload: { researchRunId: id, experimentId: `${id}-e`, hypothesisId: `${id}-h`, claim, engineId: 'rdkit', criteria: [{ id: 'c0', observable: 'molWt', operator: '<', value: 200, critical: true }] } },
    { seq: 2, type: 'EXPERIMENT_HANDOFF', payload: { experimentId: `${id}-e`, status: 'EXECUTED', outputHash: `out-${id}`, engine: { engineId: 'rdkit' } } },
    ...(verdict ? [{ seq: 3, type: 'SELF_FALSIFICATION', payload: { experimentId: `${id}-e`, verdict, scope: 'this protocol only', criteria: [{ id: 'c0', observable: 'molWt', operator: '<', value: 200, observed: 180, critical: true, status: verdict === 'FALSIFIED_WITHIN_PROTOCOL' ? 'NOT_MET' : 'MET' }] } }] : []),
    ...(verdict ? [{ seq: 4, type: 'NEXT_EXPERIMENT', payload: { experimentId: `${id}-e`, replay: { verdict: 'MATCH' }, proposal: { action: 'HUMAN_REVIEW' }, decisionTrace: { traceFingerprint: `trace-${id}`, selectedCapability: 'HUMAN_REVIEW', rejectedAlternatives: ['dock the same ligand again'] } } }] : []),
  ],
  ...extra,
});
const stateOf = (runs, extra = {}) => ({
  byt: buildBytProjection({ runs, registry: { chain, gaps: [], contradictions: [], claims: [] }, selfModel: null }),
  knowledgeGaps: [], contradictions: [], proposedClaims: [], blockedCapabilities: [], ...extra,
});
const refsOf = (synthesis) => Object.values(synthesis.sections).flat().map((entry) => entry.ref);

describe('Scientific Knowledge Loop', () => {
  test('1. recall across multiple ResearchRuns finds each run by its own claim', () => {
    const state = stateOf([
      runOf('run-a', 'GLP-1R agonist potency exceeds 7 pEC50', 'SUPPORTED_WITHIN_PROTOCOL'),
      runOf('run-b', 'Aspirin molecular weight is below 200 Da', 'SUPPORTED_WITHIN_PROTOCOL'),
      runOf('run-c', 'Imatinib docks into ABL1 below -10 kcal/mol', 'FALSIFIED_WITHIN_PROTOCOL'),
    ]);
    const glp = synthesizeKnowledge({ question: 'What do we know about GLP-1R agonist potency?', cognitiveState: state });
    assert.equal(glp.hits[0].ref, 'research_run:run-a#run-a-e');
    const abl = synthesizeKnowledge({ question: 'imatinib ABL1 docking', cognitiveState: state });
    assert.ok(abl.hits.some((h) => h.ref === 'research_run:run-c#run-c-e'));
    assert.equal(glp.corpus.researchRuns, 3);
  });

  test('5. a morphological variant of the question still reaches the old run (not exact keyword search)', () => {
    const state = stateOf([runOf('run-k', 'The kandydat shows agonism at GLP-1R', 'SUPPORTED_WITHIN_PROTOCOL')]);
    const synthesis = synthesizeKnowledge({ question: 'Dlaczego nie mamy kandydata na agonistę?', cognitiveState: state });
    assert.equal(synthesis.recallMode, 'LEXICAL_HASHED_VECTOR_NO_LEARNED_EMBEDDINGS');
    assert.ok(synthesis.hits.some((h) => h.ref === 'research_run:run-k#run-k-e'), JSON.stringify(synthesis.hits));
  });

  test('3. a registry contradiction is retrieved with both sides and never promoted to evidence', () => {
    const contradiction = {
      contradictionId: 'ctr-1', type: 'NUMERIC_DISAGREEMENT', status: 'UNRESOLVED',
      claimA: { recordId: 'experiment_record:r1', statement: 'GLP-1R model MAE is 1.17' },
      claimB: { recordId: 'experiment_record:r2', statement: 'GLP-1R model MAE is 1.01' },
      evidenceRefs: [], reason: 'two sealed runs disagree on the gate metric',
    };
    const synthesis = synthesizeKnowledge({ question: 'Co przeczy wynikowi GLP-1R MAE?', cognitiveState: stateOf([], { contradictions: [contradiction] }) });
    const found = synthesis.sections.contradicted.find((entry) => entry.ref === 'knowledge_registry:contradiction:ctr-1');
    assert.ok(found, JSON.stringify(synthesis.sections));
    assert.equal(found.epistemicStatus, 'CONTRADICTED');
    assert.equal(synthesis.nextExperiment.action, 'SEEK_EVIDENCE_FOR_CONTRADICTION');
    assert.ok(synthesis.relations.every((r) => r.promotedToEvidence === false));
    assert.equal(synthesis.epistemicStatus, 'PROPOSED_NOT_EVIDENCE');
  });

  test('4. every synthesised item names a ref; sources keep the SHA-256 of the bytes read', () => {
    const sources = loadKnowledgeSources();
    assert.ok(sources.length > 0);
    assert.ok(sources.every((doc) => doc.ref && /^[a-f0-9]{64}$/.test(doc.sourceSha256)));
    const synthesis = synthesizeKnowledge({ question: 'GLP-1R QSAR gate MAE blocked', cognitiveState: stateOf([]), sources });
    const items = Object.values(synthesis.sections).flat();
    assert.ok(items.length > 0);
    assert.ok(items.every((entry) => typeof entry.ref === 'string' && entry.ref.length > 0));
    assert.ok(items.filter((entry) => entry.kind === 'SEALED_ARTIFACT').every((entry) => /^[a-f0-9]{64}$/.test(entry.sourceSha256)));
    const sealed = readFileSync(new URL('./campaign/glp1r-d144-expanded.sealed.json', import.meta.url));
    assert.ok(sources.some((doc) => doc.docId === 'sealed:glp1r-d144-expanded.sealed.json' && doc.sourceSha256.length === 64 && sealed.length > 0));
  });

  test('6. NEXT_EXPERIMENT skips a hypothesis a previous run already falsified and says so', () => {
    const state = stateOf([runOf('run-old', 'Aspirin Crippen logP is above 3', 'FALSIFIED_WITHIN_PROTOCOL')]);
    const prior = priorFalsifiedClaims(state.byt, { excludeRunId: 'run-new' });
    assert.equal(prior.size, 1);
    const plan = { hypotheses: [
      { hypothesisId: 'h-repeat', claim: 'Aspirin Crippen logP is above 3.' },
      { hypothesisId: 'h-fresh', claim: 'Aspirin molecular weight is below 200 Da.' },
    ] };
    const executors = { rdkit: { observables: { crippenLogP: 'number', molWt: 'number' } } };
    const withMemory = nextExperimentProposal(plan, new Set(), null, executors, null, { priorFalsifiedClaims: prior }, null);
    const withoutMemory = nextExperimentProposal(plan, new Set(), null, executors, null, {}, null);
    if (withoutMemory.action === 'EXECUTE_NEXT_HYPOTHESIS') {
      assert.equal(withoutMemory.hypothesisId, 'h-repeat');
      assert.equal(withMemory.hypothesisId, 'h-fresh');
      assert.deepEqual(withMemory.skippedByMemory.map((s) => s.hypothesisId), ['h-repeat']);
    } else {
      assert.equal(withMemory.action, withoutMemory.action);
    }
    const onlyRepeat = nextExperimentProposal({ hypotheses: [plan.hypotheses[0]] }, new Set(), null, executors, null, { priorFalsifiedClaims: prior }, null);
    assert.equal(onlyRepeat.action, 'HUMAN_REVIEW');
    assert.notEqual(onlyRepeat.reason, 'NO_FURTHER_EXECUTABLE_EXPERIMENT_IN_PLAN');
  });

  test('6b. the memory rule proposes a surviving hypothesis, excludes the refuted one, and executes nothing', () => {
    const state = stateOf([
      runOf('run-dead', 'Aspirin Crippen logP is above 3', 'FALSIFIED_WITHIN_PROTOCOL'),
      runOf('run-open', 'Aspirin Crippen logP is above 3 under a revised protocol', null),
    ]);
    const synthesis = synthesizeKnowledge({ question: 'Which aspirin hypotheses remain and what next?', cognitiveState: state });
    assert.ok(synthesis.sections.refuted.length >= 1);
    assert.equal(synthesis.nextExperiment.action, 'EXECUTE_NEXT_HYPOTHESIS');
    assert.equal(synthesis.nextExperiment.executes, false);
    assert.equal(synthesis.nextExperiment.status, 'PROPOSED');
    assert.ok(synthesis.nextExperiment.excludedAsRefuted.some((ref) => ref.startsWith('necropolis:run-dead')));
    assert.ok(synthesis.nextExperiment.derivedFrom.length > 0);
  });

  test('DUPLICATE and SUPPORTS relations are derived, not invented', () => {
    const a = runOf('run-1', 'GLP-1R agonist potency exceeds 7 pEC50', 'SUPPORTED_WITHIN_PROTOCOL');
    const b = runOf('run-2', 'GLP-1R agonist potency exceeds 7 pEC50', 'SUPPORTED_WITHIN_PROTOCOL');
    const synthesis = synthesizeKnowledge({ question: 'GLP-1R agonist potency', cognitiveState: stateOf([a, b]) });
    assert.ok(synthesis.relations.some((r) => ['DUPLICATE', 'SUPPORTS'].includes(r.relation)));
    assert.ok(synthesis.relations.every((r) => ['DUPLICATE', 'SUPPORTS', 'CONTRADICTS', 'CONTEXT'].includes(r.relation) && r.basis));
  });

  test('8. broken provenance fails closed: the run is excluded, reported, and the next step is human review', () => {
    const broken = runOf('run-bad', 'GLP-1R agonist potency exceeds 7 pEC50', 'SUPPORTED_WITHIN_PROTOCOL', { integrity: { ok: false, reason: 'STATE_INTEGRITY_FAILURE', brokenAt: 1 } });
    const synthesis = synthesizeKnowledge({ question: 'GLP-1R agonist potency', cognitiveState: stateOf([broken, runOf('run-ok', 'GLP-1R agonist potency exceeds 7 pEC50', 'SUPPORTED_WITHIN_PROTOCOL')]) });
    assert.equal(synthesis.status, 'PARTIAL_PROVENANCE_FAILURE');
    assert.deepEqual(synthesis.integrityFailures.map((f) => f.ref), ['research_run:run-bad']);
    assert.ok(!refsOf(synthesis).some((ref) => ref.includes('run-bad')));
    assert.equal(synthesis.nextExperiment.action, 'HUMAN_REVIEW');
    assert.equal(synthesis.nextExperiment.reason, 'PROVENANCE_FAILURE_IN_MEMORY');
    const registryBroken = synthesizeKnowledge({ question: 'anything', cognitiveState: { byt: { ...stateOf([]).byt, integrity: { researchRuns: [], knowledgeRegistry: { ok: false, reason: 'digest_mismatch' } } }, knowledgeGaps: [], contradictions: [], proposedClaims: [], blockedCapabilities: [] } });
    assert.equal(registryBroken.integrityFailures[0].source, 'KNOWLEDGE_REGISTRY');
  });

  test('8b. a source without a ref or hash is rejected, never indexed', () => {
    const synthesis = synthesizeKnowledge({
      question: 'orphan fact',
      cognitiveState: stateOf([]),
      sources: [{ docId: 'orphan', kind: 'DECISION_LOG_ENTRY', text: 'orphan fact without provenance', epistemicStatus: 'UNVERIFIED' }],
    });
    assert.equal(synthesis.rejectedUntraceable.length, 1);
    assert.equal(synthesis.hits.length, 0);
    assert.equal(synthesis.status, 'NO_RELEVANT_MEMORY');
  });

  test('7. the loop adds no second store: its modules never create tables, write files or touch localStorage', () => {
    for (const name of ['knowledgeRecall.mjs', 'knowledgeSources.mjs', 'knowledgeSynthesis.mjs']) {
      const source = readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
      assert.doesNotMatch(source, /CREATE TABLE|INSERT INTO|UPDATE \w+ SET|writeFile|appendFile|localStorage|indexedDB|openDatabase/i, name);
    }
  });

  test('2. restart persistence: registry gaps and contradictions survive a real database reopen and synthesise identically', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'genesis-knowledge-loop-'));
    const dbPath = path.join(dir, 'genesis.db');
    let db = openDatabase(dbPath);
    try {
      const call = (method, pathname, { token, body } = {}) => handleApi(db, { method, pathname, token, body, query: {} });
      const owner = call('POST', '/api/auth/register', { body: { email: 'knowledge-loop@genesis.test', password: 'password123' } }).body;
      const project = call('POST', '/api/projects', { token: owner.token, body: { name: 'Knowledge loop restart' } }).body.project;
      assert.equal(openGap(db, project.id, { question: 'Is there functional GLP-1R data for the candidate?', source: { kind: 'OPEN_QUESTION', ref: 'test' }, missingEvidence: ['cAMP assay'] }).ok, true);
      assert.equal(recordContradiction(db, project.id, {
        type: 'NUMERIC_DISAGREEMENT',
        claimA: { recordId: 'experiment_record:a', statement: 'GLP-1R MAE 1.17' },
        claimB: { recordId: 'experiment_record:b', statement: 'GLP-1R MAE 1.01' },
        reason: 'gate metric disagrees',
      }).ok, true);
      const ask = () => synthesizeKnowledge({ question: 'GLP-1R functional data and MAE contradiction', cognitiveState: buildCognitiveState(db, project.id, { now: () => new Date(0) }) });
      const before = ask();
      assert.ok(before.sections.unknown.some((e) => e.kind === 'KNOWLEDGE_GAP'));
      assert.ok(before.sections.contradicted.some((e) => e.kind === 'CONTRADICTION'));
      db.close();
      db = openDatabase(dbPath);
      const after = ask();
      assert.deepEqual(after.sections, before.sections);
      assert.equal(after.fingerprint, before.fingerprint);
    } finally {
      db.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('the GLP-1R question is answered from recorded sealed artifacts and decisions, not model memory', () => {
    const synthesis = synthesizeKnowledge({
      question: 'Co już wiemy o GLP-1R i dlaczego nie mamy jeszcze kandydata?',
      cognitiveState: stateOf([]),
      sources: loadKnowledgeSources(),
      limit: 15,
    });
    const refs = new Set(refsOf(synthesis));
    assert.ok([...refs].some((ref) => ref.endsWith('#D-144')) && [...refs].some((ref) => ref.endsWith('#D-143')), [...refs].join(','));
    assert.ok(synthesis.sections.blockers.length > 0);
    assert.equal(synthesis.nextExperiment.action, 'RESOLVE_BLOCKER');
    assert.equal(synthesis.corpus.researchRuns, 0);
    assert.equal(synthesis.epistemicStatus, 'PROPOSED_NOT_EVIDENCE');
  });
});

const RDKIT = rdkitDetect();
test('real ResearchRuns: the synthesis endpoint recalls both runs and the Necropolis after a restart', { skip: RDKIT.available ? false : `RDKit runtime unavailable: ${RDKIT.reason}` }, async () => {
  const ASPIRIN = 'CC(=O)Oc1ccccc1C(=O)O';
  const planFor = (claim, prediction) => ({
    subProblems: [{ question: claim, whyItMatters: 'Knowledge loop proof.' }],
    hypotheses: [{
      claim, claimType: 'PREDICTION', assumptions: [], supportingEvidenceRefs: [], contradictingEvidenceRefs: [], missingEvidence: [],
      uncertainty: { level: 'UNKNOWN', statement: 'No probability calibration is claimed.' },
      falsificationProposal: `The frozen ${prediction.observable} criterion is not met.`,
      experimentProposal: { kind: 'COMPUTATIONAL', engineId: 'rdkit', description: 'Real RDKit descriptor execution.', parameters: { smiles: ASPIRIN, predictions: [prediction] }, parameterChanges: [] },
    }],
    nextActions: ['Human review'],
  });
  const dir = mkdtempSync(path.join(tmpdir(), 'genesis-knowledge-real-'));
  const dbPath = path.join(dir, 'genesis.db');
  let db = openDatabase(dbPath);
  let currentPlan = null;
  const provider = () => ({
    providerId: 'PRIVATE_LOCAL', model: 'fixture', configured: true, reason: null,
    describe: () => ({ providerId: 'PRIVATE_LOCAL', model: 'fixture', configured: true, status: 'CONFIGURED', reason: null }),
    async complete() { return { text: JSON.stringify(currentPlan), model: 'fixture' }; },
  });
  const call = (method, pathname, { token, body, query = {} } = {}) => handleApi(db, { method, pathname, token, body, query, reasoningProvider: provider() });
  try {
    const owner = call('POST', '/api/auth/register', { body: { email: 'knowledge-real@genesis.test', password: 'password123' } }).body;
    const project = call('POST', '/api/projects', { token: owner.token, body: { name: 'Knowledge loop real runs' } }).body.project;
    const base = `/api/projects/${project.id}`;
    for (const [claim, prediction, question] of [
      ['Aspirin molecular weight is below 200 Da.', { observable: 'molWt', operator: '<', value: 200, critical: true }, 'Aspirin molecular weight?'],
      ['Aspirin Crippen logP is above 3.', { observable: 'crippenLogP', operator: '>', value: 3, critical: true }, 'Aspirin Crippen logP?'],
    ]) {
      currentPlan = planFor(claim, prediction);
      const started = await call('POST', `${base}/research-runs`, { token: owner.token, body: { question } });
      const runId = started.body.researchRun.researchRunId;
      await call('POST', `${base}/research-runs/${runId}/proposals`, { token: owner.token });
      assert.equal((await call('POST', `${base}/research-runs/${runId}/experiments`, { token: owner.token })).status, 201);
    }
    const ask = async () => (await call('GET', `${base}/knowledge/synthesis`, { token: owner.token, query: { q: 'What do we know about aspirin logP and what was refuted?' } })).body.synthesis;
    const before = await ask();
    assert.equal(before.corpus.researchRuns, 2);
    assert.ok(before.sections.refuted.length >= 1);
    assert.ok(before.hits.some((h) => h.kind === 'PREDICTION_LEDGER'));
    db.close();
    db = openDatabase(dbPath);
    const after = await ask();
    assert.deepEqual(after.sections, before.sections);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
