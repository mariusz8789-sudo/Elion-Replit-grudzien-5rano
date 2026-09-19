import { describe, expect, it } from 'vitest';
import { createScientificWorldsCognitiveCore, createApprovalRegistry, worldEntitiesOf } from '../core/scientificWorlds/cognitiveBridge';
import { BIOLOGY_CATALOG, BIOLOGY_STATIONS, BIOLOGY_WORLD_ID } from '../core/scientificWorlds/biologyLabWorld';
import { parseBiologyWorldCommands } from '../core/scientificWorlds/biologyCommands';
import { createBiologyExperimentRunner } from '../core/scientificWorlds/biologyRunners';
import { createHumanDigitalTwinManifest } from '../core/scientificWorlds/humanLab/anatomyAtlas';
import { replayExperimentSession } from '../core/scientificWorlds/experimentSession';
import { kernelLedger } from '../core/agent/cyberReasoningKernel';
import type { ActionPlan } from '../core/scientificWorlds/actionPlanner';

const manifest = createHumanDigitalTwinManifest('HDT-test');
function bridge(onPlan?: (p: ActionPlan) => void) {
  return createScientificWorldsCognitiveCore({ worldId: BIOLOGY_WORLD_ID, catalog: BIOLOGY_CATALOG, stations: BIOLOGY_STATIONS, parse: parseBiologyWorldCommands, runner: createBiologyExperimentRunner(BIOLOGY_WORLD_ID, kernelLedger), ledger: kernelLedger, manifest, onPlan });
}

describe('cognitive core on the canonical systems — the handoff acceptance loop', () => {
  it('attaches the real world (stations + anatomy) and selects a plan for a goal on the twin', async () => {
    const b = bridge();
    await b.attach();
    const ents = b.core.world.allEntities();
    expect(ents.some((e) => e.id === 'station:orpheus' && e.type === 'STATION')).toBe(true);
    expect(ents.some((e) => e.id === 'brain' && e.type === 'ANATOMY_ORGAN')).toBe(true);
    expect(b.core.world.allRelations()).toContainEqual({ subjectId: 'brain', relation: 'PART_OF', objectId: 'head' });
    b.core.addGoal({ id: 'g1', description: 'Inspect the twin brain', priority: 'HIGH', targetEntityIds: ['brain'], preconditions: [], successCriteria: [], createdAt: 1 });
    await b.core.ingestObservation({ id: 'o1', timestamp: 1, subject: 'brain', predicate: 'region_count', value: 11, source: 'WORLD', epistemicStatus: 'MODEL', evidenceRefs: [] });
    const d = await b.core.cycle(2);
    expect(d.outcome).toBe('SELECTED');
    expect(d.constraints).toContain('MODEL_OUTPUT_IS_NOT_FACT');
  });
  it('a WORLD_COMMAND is parsed by the same parser as the chat bar and handed to the host as a plan; unknown types are refused', async () => {
    const plans: ActionPlan[] = [];
    const b = bridge((p) => plans.push(p));
    const ok = await b.core.executeCommand({ id: '', type: 'WORLD_COMMAND', payload: { text: 'Idź do konsoli neuro i uruchom symulację sygnałów nerwowych.' }, issuedBy: 'COGNITIVE_CORE', requiresApproval: false, safetyClass: 'REVERSIBLE' });
    expect(ok.accepted).toBe(true);
    expect((ok.result as { steps: string[] }).steps).toEqual(['NAVIGATE', 'ALIGN', 'REACH', 'INTERACT', 'EXECUTE', 'OBSERVE', 'REPORT']);
    expect(plans.length).toBe(1);
    const nope = await b.core.executeCommand({ id: 'x', type: 'DELETE_EVERYTHING', payload: {}, issuedBy: 'COGNITIVE_CORE', requiresApproval: false, safetyClass: 'READ_ONLY' });
    expect(nope.accepted).toBe(false); expect(nope.reason).toContain('UNKNOWN_COMMAND_TYPE');
    const empty = await b.core.executeCommand({ id: 'e', type: 'WORLD_COMMAND', payload: { text: 'bla' }, issuedBy: 'COGNITIVE_CORE', requiresApproval: false, safetyClass: 'READ_ONLY' });
    expect(empty.accepted).toBe(false);
  });
  it('a BIOLOGICAL command that merely declares requiresApproval is still refused until a human grants a token for its id', async () => {
    const b = bridge();
    const cmd = { id: 'bio-1', type: 'WORLD_COMMAND', payload: { text: 'zbadaj próbkę przez Orpheus' }, issuedBy: 'COGNITIVE_CORE', requiresApproval: true, safetyClass: 'BIOLOGICAL' } as const;
    const refused = await b.core.executeCommand(cmd);
    expect(refused.accepted).toBe(false); expect(refused.reason).toBe('HUMAN_APPROVAL_REQUIRED:bio-1');
    expect(() => b.approvals.grant('bio-1', '  ')).toThrow('APPROVAL_REQUIRES_A_HUMAN_NAME');
    const token = b.approvals.grant('bio-1', 'operator');
    expect(token.tokenId).toMatch(/^apr-[0-9a-f]{8}$/);
    expect((await b.core.executeCommand(cmd)).accepted).toBe(true);
    b.approvals.revoke('bio-1');
    expect((await b.core.executeCommand(cmd)).accepted).toBe(false);
  });
  it('an experiment proposal runs through the canonical fabric only with approval and only at a station that runs an experiment; the session replays MATCH', async () => {
    const b = bridge();
    await b.core.ingestObservation({ id: 'o1', timestamp: 1, subject: 'station:orpheus', predicate: 'signal_index', value: 0.4, source: 'INSTRUMENT', epistemicStatus: 'SIMULATION', evidenceRefs: ['ev-x'] });
    const [h] = b.core.hypotheses.propose(b.core.memory.recentObservations(), 'specimen analysis', 3);
    b.core.memory.addHypothesis(h);
    const first = await b.core.proposeExperimentForLatestHypothesis();
    expect(first.accepted).toBe(false); expect(first.reason).toMatch(/^HUMAN_APPROVAL_REQUIRED:exp-/);
    const proposal = b.core.experimentPlanner.proposeFor(h);
    b.approvals.grant(proposal.id, 'reviewer');
    const second = await b.core.proposeExperimentForLatestHypothesis();
    expect(second.accepted).toBe(true); expect(second.sessionId).toMatch(/^ses-/);
    expect(b.sessions[0].experimentId).toBe('orpheus-scan');
    expect(replayExperimentSession(b.sessions[0], createBiologyExperimentRunner(BIOLOGY_WORLD_ID, kernelLedger)).status).toBe('MATCH');
    // A station without an experiment (the evidence wall) cannot be "experimented on".
    const evidenceProposal = { ...proposal, id: 'exp-wall', intervention: { variable: 'station:evidence', mode: 'CONTROLLED_CHANGE' } };
    b.approvals.grant('exp-wall', 'reviewer');
    expect((await (b.core as unknown as { deps: { experimentFabric: { proposeExperiment(p: unknown): Promise<{ accepted: boolean; reason?: string }> } } }).deps.experimentFabric.proposeExperiment(evidenceProposal)).reason).toBe('PROPOSAL_NAMES_NO_STATION_WITH_AN_EXPERIMENT');
  });
  it('the core may write hypotheses and model notes to the kernel ledger, never observations or verified sources', async () => {
    const b = bridge();
    const evidence = (b as unknown as { evidence: { append(e: { id: string; kind: string; epistemicStatus: 'HYPOTHESIS' | 'REAL_OBSERVATION' | 'MODEL'; data: unknown }): Promise<{ id: string; hash?: string }> } }).evidence;
    const h = await evidence.append({ id: 'h1', kind: 'hypothesis', epistemicStatus: 'HYPOTHESIS', data: { statement: 'x' } });
    expect(h.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(kernelLedger.getActive().find((r) => r.contentHash === h.hash)?.claimType).toBe('hypothesis');
    await expect(evidence.append({ id: 'o1', kind: 'observation', epistemicStatus: 'REAL_OBSERVATION', data: {} })).rejects.toThrow('COGNITIVE_CORE_CANNOT_ASSERT_REAL_OBSERVATION');
  });
  it('world entities are derived, not invented: every station id and anatomy node id appears exactly once', () => {
    const { entities } = worldEntitiesOf({ worldId: 'w', stations: BIOLOGY_STATIONS, manifest });
    const ids = entities.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(1 + BIOLOGY_STATIONS.length + manifest.nodes.length);
    const reg = createApprovalRegistry();
    reg.grant('a', 'x'); expect(reg.list().length).toBe(1); expect(reg.has('b')).toBe(false);
  });
});
