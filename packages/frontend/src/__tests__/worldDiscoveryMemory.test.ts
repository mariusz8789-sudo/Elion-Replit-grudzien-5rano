import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE FULL PIPELINE: hypothesis -> experiment -> result -> decision ->
 * Science Memory -> Evidence Bundle -> Replay -> next experiment, and a
 * SECOND run that uses that memory instead of starting from zero.
 *
 * Everything here runs the REAL flood city through the REAL discovery loop
 * and REAL cross-action comparison — no mocks of the scientific machinery.
 * The only fake is `window.localStorage` (a plain in-memory Map, exactly the
 * existing `scienceMemory.test.ts`/`scienceMemoryDiscoveryLoop.test.ts`
 * idiom), because Science Memory is a browser-storage module and this suite
 * runs in Node. `vi.resetModules()` between calls simulates an actual
 * process restart — the second run reads memory written by a process that
 * (as far as its own module state is concerned) no longer exists, so this is
 * genuinely "read persisted memory", not "continue holding a reference".
 */

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

const GOAL = 'Minimise peak flood depth, at most 4 experiments.';
const COMPARISON_GOAL = 'Reduce peak flood depth using the available interventions.';

describe('The full pipeline: hypothesis -> experiment -> memory -> evidence -> replay -> next experiment', () => {
  beforeEach(() => { vi.resetModules(); vi.stubGlobal('window', { localStorage: makeFakeStorage() }); });
  afterEach(() => vi.unstubAllGlobals());

  it('runs a real search and remembers everything the brief asked for, in one Science Memory record', async () => {
    const { runWorldDiscoveryAndRemember } = await import('../core/agent/worldDiscoverySession');
    const { listExperiments, getExperiment } = await import('../core/scienceMemory');

    const state = runWorldDiscoveryAndRemember(GOAL);
    expect(state.kind).toBe('COMPLETE');
    if (state.kind !== 'COMPLETE') throw new Error('expected COMPLETE');

    // A real search really ran: multiple real forked experiments, a real refutation and support.
    expect(state.result.rounds.length).toBeGreaterThan(1);
    expect(state.result.failedHypotheses.map((b) => b.hypothesisId)).toContain('h:outlet-capacity');
    expect(state.result.bestSupported.map((b) => b.hypothesisId)).toContain('h:infiltration');

    // It was actually persisted — one record, not a side effect nobody can find again.
    expect(listExperiments()).toHaveLength(1);
    const stored = getExperiment(state.savedExperimentId)!;
    expect(stored).toBeDefined();
    const record = stored.worldDiscovery!;
    expect(record.resultKind).toBe('HYPOTHESIS_LOOP');
    expect(record.loopResult).toEqual(state.result);

    // The eight things the brief asked Genesis to remember, each traceable to a real field:
    const analysis = Object.fromEntries(stored.analysis!.map((block) => [block.kind, block.body]));
    expect(analysis['world-discovery-question']).toBe(GOAL); // what was the question
    expect(analysis['world-discovery-hypotheses']).toMatch(/h:outlet-capacity/); // which hypotheses were tested
    expect(analysis['world-discovery-model']).toMatch(/genesis-scientific-city-3/); // which model/solver ran
    expect(stored.params.catalogId).toBe('genesis-flood-city'); // parameters applied
    expect(stored.stats.rounds).toBe(state.result.rounds.length); // what the result was
    expect(analysis['world-discovery-reasons']).toMatch(/h:infiltration:/); // why supported/refuted
    expect(analysis['world-discovery-unresolved']).toBeTruthy(); // what we still don't know
    expect(analysis['world-discovery-next']).toMatch(/world-counterfactual:/); // the next proposed experiment, from the real dispatcher

    // A real Evidence Bundle was built and its OWN replay (independent rebuild) is a real verdict.
    expect(state.evidence.bundleId).toMatch(/^world-discovery:genesis-flood-city:/);
    expect(state.evidence.replayVerdict).toBe('MATCH');

    // And the saved record itself was immediately re-executed and verified — real Replay, not a read-back.
    expect(state.replay.status).toBe('MATCH');
  });

  it('replay RE-EXECUTES rather than reading stored numbers back, and catches real drift', async () => {
    const { runWorldDiscoveryAndRemember } = await import('../core/agent/worldDiscoverySession');
    const { getExperiment, replaySavedWorldDiscoveryRun } = await import('../core/scienceMemory');

    const state = runWorldDiscoveryAndRemember(GOAL);
    if (state.kind !== 'COMPLETE') throw new Error('expected COMPLETE');
    const stored = getExperiment(state.savedExperimentId)!;

    // Untampered: replaying the same record again gives MATCH.
    expect(replaySavedWorldDiscoveryRun(stored).status).toBe('MATCH');

    // Tamper with a stored finding after the fact — a real drift, not a hypothetical one.
    const tampered = {
      ...stored,
      worldDiscovery: {
        ...stored.worldDiscovery!,
        loopResult: {
          ...stored.worldDiscovery!.loopResult!,
          beliefs: stored.worldDiscovery!.loopResult!.beliefs.map((b) =>
            b.hypothesisId === 'h:outlet-capacity' ? { ...b, status: 'SUPPORTED' as const } : b,
          ),
        },
      },
    };
    expect(replaySavedWorldDiscoveryRun(tampered).status).toBe('DRIFT');
  });

  it('the SECOND run, in a fresh process, skips what the FIRST run already refuted', async () => {
    const first = await import('../core/agent/worldDiscoverySession');
    const firstRun = first.runWorldDiscoveryAndRemember(GOAL);
    if (firstRun.kind !== 'COMPLETE') throw new Error('expected COMPLETE');
    expect(firstRun.memory).toBeNull(); // nothing to resume from on the very first run
    // TWO refutations, not one. The loop no longer quits the moment a leader
    // consolidates, so `h:pump-capacity` — which this run used to leave in
    // `unresolvedQuestions` as "never tested" — is now actually tested and
    // actually refuted. A real negative finding Genesis previously never
    // reached, and more for memory to carry into the next run.
    expect([...firstRun.result.failedHypotheses.map((b) => b.hypothesisId)].sort()).toEqual([
      'h:outlet-capacity',
      'h:pump-capacity',
    ]);

    // Simulate an actual process restart: fresh module graph, same underlying storage.
    vi.resetModules();
    const second = await import('../core/agent/worldDiscoverySession');
    const secondRun = second.runWorldDiscoveryAndRemember(GOAL);
    if (secondRun.kind !== 'COMPLETE') throw new Error('expected COMPLETE');

    // Observable, executable proof — not a label: memory changed what actually ran.
    expect(secondRun.memory).not.toBeNull();
    expect([...secondRun.memory!.skippedHypothesisIds].sort()).toEqual(['h:outlet-capacity', 'h:pump-capacity']);
    expect(secondRun.result.rounds.every((r) => r.hypothesisId !== 'h:outlet-capacity')).toBe(true);
    expect(secondRun.result.rounds.every((r) => r.hypothesisId !== 'h:pump-capacity')).toBe(true);
    // The first thing it tries this time is what remained open, not what was already ruled out.
    expect(secondRun.result.rounds[0].hypothesisId).toBe('h:infiltration');

    const { listExperiments } = await import('../core/scienceMemory');
    expect(listExperiments()).toHaveLength(2);
  });

  it('never blocks execution: if everything was already refuted, it runs the full set again rather than nothing', async () => {
    // A goal whose only lever is the one the flagship run refutes.
    const NARROW_GOAL = 'Reduce peak flood depth by outlet, at most 1 experiment.';
    const first = await import('../core/agent/worldDiscoverySession');
    const firstRun = first.runWorldDiscoveryAndRemember(NARROW_GOAL);
    if (firstRun.kind !== 'COMPLETE') throw new Error('expected COMPLETE');
    expect(firstRun.result.failedHypotheses.map((b) => b.hypothesisId)).toEqual(['h:outlet-capacity']);

    vi.resetModules();
    const second = await import('../core/agent/worldDiscoverySession');
    const secondRun = second.runWorldDiscoveryAndRemember(NARROW_GOAL);
    if (secondRun.kind !== 'COMPLETE') throw new Error('expected COMPLETE');

    // Memory noticed the conflict and said so, but still ran something rather than refusing.
    expect(secondRun.memory).not.toBeNull();
    expect(secondRun.memory!.skippedHypothesisIds).toEqual([]);
    expect(secondRun.memory!.reason).toMatch(/running the full declared set again/);
    expect(secondRun.result.rounds.length).toBeGreaterThan(0);
    expect(secondRun.result.rounds[0].hypothesisId).toBe('h:outlet-capacity');
  });

  it('memory is scoped to the objective: a DIFFERENT direction does not inherit a refutation', async () => {
    const first = await import('../core/agent/worldDiscoverySession');
    first.runWorldDiscoveryAndRemember(GOAL); // minimise -> refutes h:outlet-capacity

    vi.resetModules();
    const second = await import('../core/agent/worldDiscoverySession');
    const reversed = second.runWorldDiscoveryAndRemember('Increase peak flood depth, at most 1 experiment.');
    if (reversed.kind !== 'COMPLETE') throw new Error('expected COMPLETE');

    // A refutation under "minimise" must not silently exclude the hypothesis under "maximise" —
    // they are different objectives, and the hypothesis was never tested against this one.
    expect(reversed.memory).toBeNull();
    expect(reversed.result.rounds[0].hypothesisId).toBe('h:outlet-capacity');
  });

  it('a cross-action comparison is persisted and replayed through the same pipeline', async () => {
    const { runWorldDiscoveryAndRemember } = await import('../core/agent/worldDiscoverySession');
    const { getExperiment, listExperiments } = await import('../core/scienceMemory');

    const state = runWorldDiscoveryAndRemember(COMPARISON_GOAL);
    expect(state.kind).toBe('COMPARISON');
    if (state.kind !== 'COMPARISON') throw new Error('expected COMPARISON');

    expect(state.comparison.status).toBe('RANKED');
    expect(state.comparison.bestActionIds).toEqual(['lever:infiltration']);
    expect(state.memory).toBeNull(); // comparisons always test every declared action
    expect(state.evidence.replayVerdict).toBe('MATCH');
    expect(state.replay.status).toBe('MATCH');

    expect(listExperiments()).toHaveLength(1);
    const stored = getExperiment(state.savedExperimentId)!;
    const analysis = Object.fromEntries(stored.analysis!.map((block) => [block.kind, block.body]));
    expect(analysis['world-discovery-question']).toBe(COMPARISON_GOAL);
    expect(analysis['world-discovery-hypotheses']).toMatch(/lever:infiltration\[AVAILABLE\]/);
    expect(analysis['world-discovery-reasons']).toMatch(/lever:infiltration:/);
    // The comparison's own honest statement: it does not itself propose a next experiment.
    expect(analysis['world-discovery-next']).toMatch(/nie proponuje własnego następnego eksperymentu/);
  });

  it('refuses a goal an unmodelled objective, exactly as the pipeline without memory does', async () => {
    const { runWorldDiscoveryAndRemember } = await import('../core/agent/worldDiscoverySession');
    const { listExperiments } = await import('../core/scienceMemory');
    const state = runWorldDiscoveryAndRemember('Minimise the number of insurance claims.');
    expect(state.kind).toBe('REFUSED');
    if (state.kind !== 'REFUSED') return;
    expect(state.error).toMatch(/maxDepthM/);
    // A refusal saves nothing — there is no experiment to remember.
    expect(listExperiments()).toHaveLength(0);
  });

  it('replay reports NOT_REPRODUCIBLE for a catalog Genesis no longer declares', async () => {
    const { runWorldDiscoveryAndRemember } = await import('../core/agent/worldDiscoverySession');
    const { getExperiment, replaySavedWorldDiscoveryRun } = await import('../core/scienceMemory');
    const state = runWorldDiscoveryAndRemember(GOAL);
    if (state.kind !== 'COMPLETE') throw new Error('expected COMPLETE');
    const stored = getExperiment(state.savedExperimentId)!;
    const withUnknownCatalog = { ...stored, worldDiscovery: { ...stored.worldDiscovery!, catalogId: 'no-such-catalog' } };
    const replay = replaySavedWorldDiscoveryRun(withUnknownCatalog);
    expect(replay.status).toBe('NOT_REPRODUCIBLE');
  });
});

