import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runScientificDiscoveryLoop, type ScientificDiscoveryLoopResult } from '../core/experimentFabric/scientificDiscoveryLoop';

/**
 * SCIENTIFIC DISCOVERY LOOP -> SCIENTIFIC MEMORY (consolidation Phase 3).
 *
 * Proves the smallest addition to the EXISTING `scienceMemory.ts` persists
 * a full ScientificDiscoveryLoopResult (question, hypotheses via the
 * existing `hypothesisLoop`, evidence chain, next experiment, replay
 * fingerprint) without a second memory system: `saveExperiment`,
 * `buildSavedHypothesisLoop` and `replaySavedHypothesisLoopAsync` are all
 * reused unchanged; only the discovery-loop-specific evidence/next-
 * experiment layer is new.
 */
const QUESTION_ID = 'problem:intervention-timing';

function makeFakeStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

function runLoop(problemId = QUESTION_ID): ScientificDiscoveryLoopResult {
  return runScientificDiscoveryLoop(problemId);
}

describe('Scientific Discovery Loop -> Scientific Memory', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('1. persists the discovery question, hypothesis loop and discovery layer as one record', async () => {
    const { saveScientificDiscoveryLoopToMemory, listExperiments } = await import('../core/scienceMemory');
    const result = runLoop();
    const saved = saveScientificDiscoveryLoopToMemory(result);
    const loaded = listExperiments().find((entry) => entry.id === saved.id)!;
    expect(loaded.hypothesisLoop).toBeDefined();
    expect(loaded.discoveryLoop).toBeDefined();
    expect(loaded.discoveryLoop!.problemId).toBe(QUESTION_ID);
    expect(loaded.discoveryLoop!.statement).toBe(result.problem.statement);
  });

  it('2. discoveryLoop.hypothesisLoopFingerprint ties it to the saved hypothesisLoop.loopFingerprint', async () => {
    const { saveScientificDiscoveryLoopToMemory } = await import('../core/scienceMemory');
    const saved = saveScientificDiscoveryLoopToMemory(runLoop());
    expect(saved.discoveryLoop!.hypothesisLoopFingerprint).toBe(saved.hypothesisLoop!.loopFingerprint);
  });

  it('3. evidence chain entries carry a real resultFingerprint/day for every executed hypothesis', async () => {
    const { saveScientificDiscoveryLoopToMemory } = await import('../core/scienceMemory');
    const saved = saveScientificDiscoveryLoopToMemory(runLoop());
    const executed = saved.discoveryLoop!.evidenceChain.filter((link) => link.evidenceChainId !== null);
    expect(executed.length).toBeGreaterThan(0);
    for (const link of executed) {
      expect(link.findingsCount).toBeGreaterThan(0);
      expect(link.representativeFinding).not.toBeNull();
      expect(link.representativeFinding!.resultFingerprint.length).toBeGreaterThan(0);
      expect(Number.isFinite(link.representativeFinding!.day)).toBe(true);
    }
  });

  it('4. next experiment is persisted as a real, non-fabricated decision', async () => {
    const { saveScientificDiscoveryLoopToMemory } = await import('../core/scienceMemory');
    const result = runLoop();
    const saved = saveScientificDiscoveryLoopToMemory(result);
    expect(saved.discoveryLoop!.nextExperiment.status).toBe(result.nextExperiment.status);
    expect(saved.discoveryLoop!.nextExperiment.why).toBe(result.nextExperiment.why);
  });

  it('5. replaying a genuine save re-executes the loop and MATCHes', async () => {
    const { saveScientificDiscoveryLoopToMemory, replaySavedScientificDiscoveryLoop } = await import('../core/scienceMemory');
    const saved = saveScientificDiscoveryLoopToMemory(runLoop());
    const replay = await replaySavedScientificDiscoveryLoop(saved);
    expect(replay.status).toBe('MATCH');
  });

  it('6. tampering with the saved next-experiment status after save is caught as DRIFT on replay', async () => {
    const { saveScientificDiscoveryLoopToMemory, replaySavedScientificDiscoveryLoop } = await import('../core/scienceMemory');
    const saved = saveScientificDiscoveryLoopToMemory(runLoop());
    const tampered = { ...saved, discoveryLoop: { ...saved.discoveryLoop!, nextExperiment: { ...saved.discoveryLoop!.nextExperiment, status: 'RESOLVED' as const } } };
    const replay = await replaySavedScientificDiscoveryLoop(tampered);
    expect(replay.status).toBe('DRIFT');
  });

  it('7. saveExperiment fails closed when discoveryLoop points at a different hypothesisLoop fingerprint', async () => {
    const { saveScientificDiscoveryLoopToMemory, saveExperiment } = await import('../core/scienceMemory');
    const first = saveScientificDiscoveryLoopToMemory(runLoop());
    const second = saveScientificDiscoveryLoopToMemory(runLoop('problem:lowest-modeled-deaths'));
    expect(() => saveExperiment({
      labId: first.labId, experimentId: 'mismatched', experimentName: 'mismatched',
      params: {}, honesty: 'simplified', honestyNote: 'test',
      hypothesisLoop: first.hypothesisLoop, discoveryLoop: second.discoveryLoop,
    })).toThrow(/loopFingerprint/);
  });

  it('8. saveExperiment fails closed when discoveryLoop is present without hypothesisLoop', async () => {
    const { saveScientificDiscoveryLoopToMemory, saveExperiment } = await import('../core/scienceMemory');
    const saved = saveScientificDiscoveryLoopToMemory(runLoop());
    expect(() => saveExperiment({
      labId: saved.labId, experimentId: 'no-loop', experimentName: 'no-loop',
      params: {}, honesty: 'simplified', honestyNote: 'test',
      discoveryLoop: saved.discoveryLoop,
    })).toThrow(/loopFingerprint/);
  });

  it('9. isSavedScientificDiscoveryLoop rejects a corrupted record instead of trusting it', async () => {
    const { isSavedScientificDiscoveryLoop } = await import('../core/scienceMemory');
    expect(isSavedScientificDiscoveryLoop(null)).toBe(false);
    expect(isSavedScientificDiscoveryLoop({})).toBe(false);
    expect(isSavedScientificDiscoveryLoop({ contractVersion: '1.0.0', problemId: 'x', hypothesisLoopFingerprint: 'a', discoveryLoopFingerprint: 'b', evidenceChain: 'not-an-array', nextExperiment: { status: 'READY_TO_RUN' } })).toBe(false);
  });

  it('10. determinism: saving the same real question twice produces identical discoveryLoopFingerprint', async () => {
    const { saveScientificDiscoveryLoopToMemory } = await import('../core/scienceMemory');
    const a = saveScientificDiscoveryLoopToMemory(runLoop());
    const b = saveScientificDiscoveryLoopToMemory(runLoop());
    expect(a.discoveryLoop!.discoveryLoopFingerprint).toBe(b.discoveryLoop!.discoveryLoopFingerprint);
  });
});
