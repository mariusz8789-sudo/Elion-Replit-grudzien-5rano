import { describe, expect, it } from 'vitest';
import { SessionEventLog, verifySessionChain } from '@genesis/core/flagship/sessionEventLog.js';
import { kernelLedger } from '../core/agent/cyberReasoningKernel';
import { createScientificWorldsCognitiveCore } from '../core/scientificWorlds/cognitiveBridge';
import { logicalClock, runAgenticScience, runFlagshipJourney } from '../core/scientificWorlds/agenticScienceRuntime';
import { LAB_CATALOG, LAB_OBSTACLES, LAB_ROOM, LAB_SPAWN, LAB_STATIONS, LAB_WORLD_ID } from '../core/scientificWorlds/labWorld';
import { parseWorldCommands } from '../core/scientificWorlds/worldCommand';
import { createLabExperimentRunner } from '../core/scientificWorlds/experimentRunners';

const clock = { t: 1_700_000_000_000, now() { return (this.t += 1000); } };
// The spacetime-photon kernel provider is bound once at module load to the global `kernelLedger`
// (the same singleton every other kernel-provider experiment in this repo commits to — see
// scientificWorldsBiology.test.ts). A locally-constructed EvidenceLedger would never receive its
// commits, so every world here shares that one ledger, exactly as the running app does.
function world() {
  const runner = createLabExperimentRunner(LAB_WORLD_ID, kernelLedger);
  const binding = { worldId: LAB_WORLD_ID, catalog: LAB_CATALOG, stations: LAB_STATIONS, parse: (t: string, lt: number) => parseWorldCommands(t, LAB_CATALOG, lt), runner, ledger: kernelLedger, defaultSeed: 7 };
  return { ledger: kernelLedger, runner, binding, bridge: createScientificWorldsCognitiveCore(binding) };
}
const GOAL = 'Investigate whether curved spacetime changes light propagation in the model, then explain the result and its evidence.';

describe('agentic science runtime (D-130) — the full loop on the real services, headless', () => {
  it('perceive → world model → reason → plan → act → experiment → falsify → evidence → memory → answer → replay, on the physics lab', async () => {
    const w = world(); const log = new SessionEventLog(logicalClock());
    const trace = await runAgenticScience({ sessionId: 'agentic-001', binding: w.binding, bridge: w.bridge, room: LAB_ROOM, obstacles: LAB_OBSTACLES, spawn: LAB_SPAWN, userGoal: GOAL, mode: 'SCIENTIFIC', approvedBy: 'dr-owner', log });
    expect(trace.perception.kind).toBe('SCENE_GRAPH'); expect(trace.perception.epistemicStatus).toBe('MODEL');
    expect(trace.perception.entities.map((e) => e.id)).toContain('st-window');
    expect(trace.reasoning.epistemicStatus).toBe('HYPOTHESIS'); expect(trace.reasoning.hypotheses.length).toBe(2);
    expect(trace.plan.steps).toContain('EXECUTE');
    expect(trace.actionsExecuted).toEqual(expect.arrayContaining(['NAVIGATE', 'EXECUTE', 'REPORT']));
    expect(trace.session.experimentId).toBe('spacetime-photon'); expect(trace.session.epistemicStatus).toBe('MODEL');
    expect(trace.session.outputs.speedOfLightMps).toBe(299792458);
    expect(trace.falsification.status).toBe('SURVIVED');
    const curved = trace.falsification.revised.find((h) => h.id.endsWith('H-curved'))!; const flat = trace.falsification.revised.find((h) => h.id.endsWith('H-flat'))!;
    expect(curved.confidence).toBeGreaterThan(0.5); expect(flat.confidence).toBeLessThan(0.5);
    expect(trace.evidenceIds.length).toBe(1); expect(w.ledger.getActive().some((r) => r.id === trace.evidenceIds[0])).toBe(true);
    expect(w.bridge.core.memory.recentObservations().some((o) => o.subject === 'shapiroDelayS')).toBe(true);
    expect(['UNVERIFIED', 'CANDIDATE', 'VERIFIED_SOURCE', 'INSUFFICIENT_EVIDENCE']).toContain(trace.answer.status);
    expect(trace.finalAnswer.status).toBe('MODEL'); expect(trace.finalAnswer.text).toMatch(/nie pomiaru świata/);
    expect(trace.replayKey).toMatch(/^[0-9a-f]{64}$/);
    const events = log.read('agentic-001');
    expect(events.map((e) => e.type)).toEqual(['PERCEPTION_OBSERVED', 'WORLD_MODEL_UPDATED', 'REASONING_COMPLETED', 'PLAN_CREATED', 'EXPERIMENT_EXECUTED', 'ACTION_EXECUTED', 'FALSIFICATION_COMPLETED', 'EVIDENCE_APPENDED', 'TRUTH_ANSWERED', 'AGENTIC_TRACE_COMMITTED']);
    expect(verifySessionChain(events).ok).toBe(true);
  });
  it('refuses to act without a human approver; a fictional world caps the answer at FICTIONAL', async () => {
    const w = world(); const log = new SessionEventLog(logicalClock());
    await expect(runAgenticScience({ sessionId: 'agentic-002', binding: w.binding, bridge: w.bridge, room: LAB_ROOM, obstacles: LAB_OBSTACLES, spawn: LAB_SPAWN, userGoal: GOAL, mode: 'SCIENTIFIC', approvedBy: null, log })).rejects.toThrow(/ACTION_REQUIRES_HUMAN_REVIEW/);
    expect(log.read('agentic-002').map((e) => e.type)).toEqual(['PERCEPTION_OBSERVED', 'WORLD_MODEL_UPDATED', 'REASONING_COMPLETED', 'PLAN_CREATED']);
    const f = world();
    const t = await runAgenticScience({ sessionId: 'agentic-003', binding: f.binding, bridge: f.bridge, room: LAB_ROOM, obstacles: LAB_OBSTACLES, spawn: LAB_SPAWN, userGoal: GOAL, mode: 'FICTIONAL', approvedBy: 'dr-owner', log: new SessionEventLog(clock) });
    expect(t.finalAnswer.status).toBe('FICTIONAL'); expect(t.session.epistemicStatus).toBe('MODEL'); // the session keeps its own label; only the world's answer is capped
  });
  it('flagship journey: mirror divergence, gate traversal, scientific time machine, cosmos version, the loop, capture with badge, replay equality and session MATCH', async () => {
    const w = world();
    const r = await runFlagshipJourney({ sessionId: 'flagship-001', binding: w.binding, bridge: w.bridge, room: LAB_ROOM, obstacles: LAB_OBSTACLES, spawn: LAB_SPAWN, userGoal: GOAL, mode: 'SCIENTIFIC', approvedBy: 'dr-owner', cosmos: { sourceId: 'test-fixture-catalog', sourceUri: 'genesis://test/fixture', datasetVersion: 'fixture-1', observedAt: null, contentHash: 'fixture', summary: 'TEST FIXTURE — not an astronomical dataset', objectIds: ['obj-1'], licenceNote: 'test fixture', retrievedBy: 'test' } });
    expect(r.mirror.state).toBe('DIVERGENCE_MODE'); expect(r.mirror.identityScope).toBe('VISUAL_SESSION_PROXY'); expect(r.mirror.divergenceAction).toMatch(/Twin walks/);
    expect(r.portal.phase).toBe('CLOSE'); expect(r.portal.traversed).toBe(true); expect(r.portal.destinationStatus).toBe('MODEL');
    expect(r.timeMachine.epistemicStatus).toBe('MODEL'); expect(r.timeMachine.computation?.regime).toBe('WEAK_FIELD');
    expect(r.cosmos?.supersedes).toBeNull(); expect(r.cosmos?.visualUpdateAllowed).toBe(true);
    expect(r.capture.aspect).toBe('9:16'); expect(r.capture.badge.status).toBe('MODEL'); expect(r.capture.captions.length).toBe(3);
    expect(r.events.length).toBeGreaterThanOrEqual(16);
    expect(r.state.route.slice(0, 6)).toEqual(['SESSION_STARTED', 'WORLD_CREATED', 'MIRROR_STATE', 'PORTAL_STATE', 'TIME_MACHINE_CONFIGURED', 'COSMOS_UPDATED']);
    expect(r.replayMatches).toBe(true); expect(r.sessionReplay).toBe('MATCH');
    expect(r.state.captureIds).toEqual([r.capture.captureId]); expect(r.state.evidenceIds).toEqual(r.trace.evidenceIds);
    // determinism: a second journey with fresh services yields the same session content hash and replay key
    const w2 = world();
    const r2 = await runFlagshipJourney({ sessionId: 'flagship-001', binding: w2.binding, bridge: w2.bridge, room: LAB_ROOM, obstacles: LAB_OBSTACLES, spawn: LAB_SPAWN, userGoal: GOAL, mode: 'SCIENTIFIC', approvedBy: 'dr-owner' });
    expect(r2.trace.session.contentHash).toBe(r.trace.session.contentHash); expect(r2.trace.replayKey).toBe(r.trace.replayKey);
  });
});
