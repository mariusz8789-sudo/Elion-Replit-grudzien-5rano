import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { appendServerResearchStateEvent, createAgentRun } from './agentRun.mjs';
import { createUser, createProject, openDatabase } from './store.mjs';
import { hashPassword } from './auth.mjs';
import { nextExperimentProposal } from './researchRunExecution.mjs';
import { RESEARCH_RUN_DOMAIN, researchSteeringOf, steerResearchRun } from './researchRun.mjs';

function fixture() {
  const db = openDatabase();
  const user = createUser(db, { email: 'steering@lab.org', displayName: 'Steering', passwordHash: hashPassword('password123') });
  const project = createProject(db, { name: 'Steering', ownerId: user.id });
  const run = createAgentRun(db, { projectId: project.id, goal: 'Compare hypotheses', domain: RESEARCH_RUN_DOMAIN, createdBy: user.id });
  appendServerResearchStateEvent(db, run.id, 'PROBLEM_FORMALIZED', { question: 'Compare hypotheses' });
  appendServerResearchStateEvent(db, run.id, 'HYPOTHESES_GENERATED', {
    hypotheses: [
      { hypothesisId: 'hyp-a', experimentProposal: { decision: 'PROPOSED', engineId: 'rdkit', parameters: { predictions: [{ observable: 'score', operator: '>', value: 0 }] } } },
      { hypothesisId: 'hyp-b', experimentProposal: { decision: 'PROPOSED', engineId: 'rdkit', parameters: { predictions: [{ observable: 'score', operator: '>', value: 0 }] } } },
    ], nextActions: [],
  });
  return { db, user, project, run };
}

describe('ResearchRun mid-run steering', () => {
  test('focus, abandon, restore and context remain append-only in the canonical chain', () => {
    const { db, user, project, run } = fixture();
    assert.equal(steerResearchRun(db, project.id, run.id, { action: 'FOCUS_HYPOTHESIS', hypothesisId: 'hyp-b' }, { userId: user.id }).ok, true);
    assert.equal(steerResearchRun(db, project.id, run.id, { action: 'ADD_CONTEXT', text: 'Compare with the new cohort.' }, { userId: user.id }).ok, true);
    let result = steerResearchRun(db, project.id, run.id, { action: 'ABANDON_HYPOTHESIS', hypothesisId: 'hyp-a' }, { userId: user.id });
    assert.deepEqual(result.steering.abandonedHypothesisIds, ['hyp-a']);
    result = steerResearchRun(db, project.id, run.id, { action: 'RESTORE_HYPOTHESIS', hypothesisId: 'hyp-a' }, { userId: user.id });
    assert.deepEqual(result.steering.abandonedHypothesisIds, []);
    assert.equal(result.steering.focusedHypothesisId, 'hyp-b');
    assert.equal(result.steering.context[0].text, 'Compare with the new cohort.');
    assert.equal(result.researchRun.researchState.chain.ok, true);
    assert.equal(result.researchRun.researchState.events.filter((event) => event.type === 'RESEARCH_STEERING').length, 4);
  });

  test('the next-experiment rule honors focus and abandoned branches', () => {
    const plan = { hypotheses: [
      { hypothesisId: 'hyp-a', experimentProposal: { decision: 'PROPOSED', engineId: 'rdkit', parameters: { predictions: [{ observable: 'score', operator: '>', value: 0 }] } } },
      { hypothesisId: 'hyp-b', experimentProposal: { decision: 'PROPOSED', engineId: 'rdkit', parameters: { predictions: [{ observable: 'score', operator: '>', value: 0 }] } } },
    ], nextActions: [] };
    const executors = { rdkit: { observables: { score: 'number' }, parseInput: () => ({ ok: true, input: {} }) } };
    const focused = nextExperimentProposal(plan, new Set(), null, executors, null, { focusedHypothesisId: 'hyp-b', abandonedHypothesisIds: [] });
    assert.equal(focused.hypothesisId, 'hyp-b');
    const abandoned = nextExperimentProposal(plan, new Set(), null, executors, null, { focusedHypothesisId: 'hyp-b', abandonedHypothesisIds: ['hyp-b'] });
    assert.equal(abandoned.hypothesisId, 'hyp-a');
  });

  test('a challenge requires Replay MATCH, while explicit user focus remains first', () => {
    const hypothesis = (hypothesisId, extra = {}) => ({
      hypothesisId,
      ...extra,
      experimentProposal: { decision: 'PROPOSED', engineId: 'rdkit', parameters: { predictions: [{ observable: 'score', operator: '>', value: 0 }] } },
    });
    const plan = { hypotheses: [
      hypothesis('hyp-normal'),
      hypothesis('hyp-challenge', { challengesHypothesisId: 'hyp-done' }),
      hypothesis('hyp-focused'),
    ], nextActions: [] };
    const executors = { rdkit: { observables: { score: 'number' }, parseInput: () => ({ ok: true, input: {} }) } };
    const args = [plan, new Set(['hyp-done']), 'SUPPORTED_WITHIN_PROTOCOL', executors];

    const matched = nextExperimentProposal(...args, 'MATCH', {}, 'hyp-done');
    assert.deepEqual([matched.hypothesisId, matched.reason], ['hyp-challenge', 'SELF_FALSIFICATION_CHALLENGE_IN_PLAN']);
    assert.equal(nextExperimentProposal(...args, null, {}, 'hyp-done').hypothesisId, 'hyp-normal');
    assert.equal(nextExperimentProposal(...args, 'NOT_APPLICABLE', {}, 'hyp-done').hypothesisId, 'hyp-normal');
    assert.equal(nextExperimentProposal(...args, 'DRIFT', {}, 'hyp-done').action, 'HUMAN_REVIEW');

    const focused = nextExperimentProposal(...args, 'MATCH', { focusedHypothesisId: 'hyp-focused' }, 'hyp-done');
    assert.deepEqual([focused.hypothesisId, focused.reason], ['hyp-focused', 'USER_FOCUSED_HYPOTHESIS']);
  });

  test('invalid or unknown steering fails closed without appending', () => {
    const { db, user, project, run } = fixture();
    assert.equal(steerResearchRun(db, project.id, run.id, { action: 'FOCUS_HYPOTHESIS', hypothesisId: 'missing' }, { userId: user.id }).status, 'HYPOTHESIS_NOT_FOUND');
    const state = researchSteeringOf({ events: [] });
    assert.deepEqual(state.abandonedHypothesisIds, []);
  });
});
