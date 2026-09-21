/* Proprietary / All Rights Reserved - Genesis OS */
import { describe, expect, it } from 'vitest';
import { GenesisCognitiveCore, type Goal, type Observation, type ExperimentFabricAdapter, type CommandEnvelope } from './index.js';
import { stableHash } from './hash.js';

/**
 * The delivered self-check (tests/cognitiveCore.test.ts), ported to vitest as written, plus the
 * properties the handoff makes non-negotiable: model output is untrusted, high-impact commands
 * are blocked without approval, hashes are stable over nested content.
 */

const experimentFabric: ExperimentFabricAdapter = { async proposeExperiment() { return { accepted: true, sessionId: 'session-test' }; } };
const goal: Goal = { id: 'goal-1', description: 'Study a controlled observation on the human digital twin.', priority: 'HIGH', targetEntityIds: ['human-twin'], preconditions: [], successCriteria: ['traceable evidence'], createdAt: 1 };
const observation: Observation = { id: 'obs-1', timestamp: 1, subject: 'human-twin', predicate: 'heart_rate', value: 70, unit: 'bpm', source: 'INSTRUMENT', epistemicStatus: 'REAL_OBSERVATION', evidenceRefs: ['ev-1'] };

function makeCore(): GenesisCognitiveCore {
  const core = new GenesisCognitiveCore({ commandBus: { async dispatch(command) { return { accepted: true, result: { commandId: command.id } }; } }, experimentFabric });
  core.world.replace([{ id: 'human-twin', type: 'HUMAN_DIGITAL_TWIN', label: 'Human Digital Twin', properties: {}, tags: ['human', 'research'] }], []);
  return core;
}

describe('GenesisCognitiveCore — delivered self-check', () => {
  it('COGNITIVE_CORE_SELF_CHECK: selects a plan for a goal whose target exists, accepts a read-only command, blocks a biological one without approval', async () => {
    const core = makeCore();
    core.addGoal(goal);
    await core.ingestObservation(observation);
    const decision = await core.cycle(2);
    expect(decision.outcome).toBe('SELECTED');
    const ok = await core.executeCommand({ id: '', type: 'INSPECT_TARGET', payload: { targetEntityId: 'human-twin' }, issuedBy: 'COGNITIVE_CORE', requiresApproval: false, safetyClass: 'READ_ONLY' });
    expect(ok.accepted).toBe(true);
    const blocked = await core.executeCommand({ id: 'high-impact', type: 'RUN_BIOLOGICAL_PROTOCOL', payload: { protocol: 'example' }, issuedBy: 'COGNITIVE_CORE', requiresApproval: false, safetyClass: 'BIOLOGICAL' });
    expect(blocked.accepted).toBe(false);
    expect(blocked.reason).toContain('human approval');
  });
  it('a goal whose target is not in the world model is BLOCKED, and no goal at all is DEFERRED', async () => {
    const core = makeCore();
    expect((await core.cycle(1)).outcome).toBe('DEFERRED');
    core.addGoal({ ...goal, id: 'goal-2', targetEntityIds: ['ghost'] });
    const d = await core.cycle(2);
    expect(d.outcome).toBe('BLOCKED');
    expect(d.constraints).toContain('TARGET_NOT_IN_WORLD_MODEL');
  });
  it('the null language model proposes nothing, so no hypothesis enters the state without a proposer; a proposal without a statement is refused by the gate', async () => {
    const core = makeCore();
    core.addGoal(goal);
    await core.cycle(3);
    expect(core.memory.activeHypotheses()).toEqual([]);
    expect(core.proposalGate.hypothesis({ kind: 'HYPOTHESIS', payload: { nope: 1 }, source: 'MODEL', epistemicStatus: 'HYPOTHESIS' })).toBeNull();
    expect(core.proposalGate.hypothesis({ kind: 'HYPOTHESIS', payload: { statement: 'x', priorConfidence: 7 }, source: 'MODEL', epistemicStatus: 'HYPOTHESIS' })?.priorConfidence).toBe(1);
    expect((await core.proposeExperimentForLatestHypothesis()).accepted).toBe(false);
  });
  it('a hypothesis from a rule-based engine is assessed against linked evidence and can be falsified only by repeated linked observations', async () => {
    const core = makeCore();
    await core.ingestObservation(observation);
    const [h] = core.hypotheses.propose(core.memory.recentObservations(), 'twin study', 5);
    core.memory.addHypothesis(h);
    const weak = core.assessHypothesis(h.id, [{ id: 'ev-1', sourceType: 'LEDGER', epistemicStatus: 'MODEL', strength: 0.3 }]);
    expect(weak.relation).toBe('INCONCLUSIVE');
    expect(weak.falsification.falsified).toBe(false);
    const strong = core.assessHypothesis(h.id, [{ id: 'ev-1', sourceType: 'LEDGER', epistemicStatus: 'MODEL', strength: 0.9 }]);
    expect(strong.relation).toBe('SUPPORTS');
    expect(strong.rationale).toContain('hypothesis-level');
    const proposal = core.experimentPlanner.proposeFor(h);
    expect(proposal.requiresHumanApproval).toBe(true);
    expect((await core.proposeExperimentForLatestHypothesis()).sessionId).toBe('session-test');
  });
});

describe('stableHash — corrected canonical hashing', () => {
  it('sees nested keys and array contents (the delivered replacer dropped them)', () => {
    expect(stableHash({ a: 1, steps: [{ actionType: 'X' }] })).not.toBe(stableHash({ a: 1, steps: [{ actionType: 'Y' }] }));
    expect(stableHash({ facts: ['a'] })).not.toBe(stableHash({ facts: [] }));
    expect(stableHash({ b: 2, a: 1 })).toBe(stableHash({ a: 1, b: 2 }));
    expect(stableHash({ x: 1 })).toMatch(/^[0-9a-f]{8}$/);
  });
  it('a command without an id gets a content-derived id, so the same command dispatched twice has the same id', async () => {
    const seen: string[] = [];
    const core = new GenesisCognitiveCore({ commandBus: { async dispatch(c: CommandEnvelope) { seen.push(c.id); return { accepted: true }; } }, experimentFabric });
    const cmd: CommandEnvelope = { id: '', type: 'INSPECT_TARGET', payload: { targetEntityId: 'human-twin' }, issuedBy: 'COGNITIVE_CORE', requiresApproval: false, safetyClass: 'READ_ONLY' };
    await core.executeCommand(cmd); await core.executeCommand(cmd);
    expect(seen[0]).toMatch(/^cmd-[0-9a-f]{8}$/); expect(seen[0]).toBe(seen[1]);
  });
});
