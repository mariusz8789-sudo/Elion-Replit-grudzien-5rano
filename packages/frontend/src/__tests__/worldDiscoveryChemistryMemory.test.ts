import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE SAME FULL PIPELINE `worldDiscoveryMemory.test.ts` PROVES FOR THE FLOOD
 * CITY, RUN AGAIN AGAINST A COMPLETELY DIFFERENT DOMAIN — chemistry kinetics
 * instead of hydrology — through the exact same generic code
 * (`worldDiscoverySession.ts`, `scienceMemory.ts`, `discoveryLoop.ts`). This
 * is the cross-domain proof the `WorldLeverCatalog.buildWorld` contract was
 * generalised for: nothing in this file is chemistry-specific except the
 * catalogId and the goal text.
 *
 * Same fake-storage idiom as the flood suite, same reason: Science Memory is
 * a browser-storage module and this runs in Node.
 *
 * PROVENANCE. Ported from `claude/chemistry-discovery-verify-i30c1u` (c46de7b9),
 * which targeted a never-merged version of the catalogue. Main's catalogue has
 * different lever ids, values and ordering, so every expectation was re-measured
 * against main. Main's run reaches five experiments rather than three, which is
 * past vitest's 5 s default, hence the explicit per-test timeouts.
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

const CATALOG_ID = 'genesis-chemistry-kinetics';
const GOAL = 'Minimize remaining fraction, at most 6 experiments';
const TIMEOUT = { timeout: 60_000 };

describe('Chemistry discovery: the full memory/snapshot/replay pipeline, cross-domain', () => {
  beforeEach(() => { vi.resetModules(); vi.stubGlobal('window', { localStorage: makeFakeStorage() }); });
  afterEach(() => vi.unstubAllGlobals());

  it('runs a real chemistry search and remembers it in Science Memory', TIMEOUT, async () => {
    const { runWorldDiscoveryAndRemember } = await import('../core/agent/worldDiscoverySession');
    const { getExperiment, listExperiments } = await import('../core/scienceMemory');

    const state = runWorldDiscoveryAndRemember(GOAL, CATALOG_ID);
    expect(state.kind).toBe('COMPLETE');
    if (state.kind !== 'COMPLETE') throw new Error('expected COMPLETE');

    // Exactly one world-discovery record for the loop itself. Main's catalogue supports TWO
    // mechanisms (temperature and catalyst), so the generic pipeline also saves a
    // mechanism-composition record for their joint hypothesis — a second record that the
    // single-mechanism branch catalogue never produced. Assert the discovery record count
    // separately from the total so the composition record is visible rather than absorbed.
    expect(listExperiments().filter((e) => e.worldDiscovery)).toHaveLength(1);
    expect(listExperiments()).toHaveLength(2);

    // A real search really ran: a real refutation and two real, independently supported mechanisms.
    expect(state.result.failedHypotheses.map((b) => b.hypothesisId)).toEqual(['h:substance-mass']);
    expect(state.result.bestSupported.map((b) => b.hypothesisId)).toEqual(['h:temperature', 'h:catalyst']);

    const stored = getExperiment(state.savedExperimentId)!;
    expect(stored).toBeDefined();
    const record = stored.worldDiscovery!;
    expect(record.resultKind).toBe('HYPOTHESIS_LOOP');
    expect(record.catalogId).toBe(CATALOG_ID);
    expect(stored.params.catalogId).toBe(CATALOG_ID);

    const analysis = Object.fromEntries(stored.analysis!.map((block) => [block.kind, block.body]));
    expect(analysis['world-discovery-question']).toBe(GOAL);
    // main's catalogue declares worldId `genesis-chemistry-lab` under catalogId
    // `genesis-chemistry-kinetics`; assert on both rather than on one fused string.
    expect(analysis['world-discovery-model']).toMatch(/worldId=genesis-chemistry-lab/);
    expect(analysis['world-discovery-model']).toMatch(/catalogId=genesis-chemistry-kinetics/);
    expect(analysis['world-discovery-hypotheses']).toMatch(/h:substance-mass/);

    // A real Evidence Bundle was built for THIS domain and its own replay matches.
    expect(state.evidence.bundleId).toMatch(/^world-discovery:genesis-chemistry-kinetics:/);
    expect(state.evidence.replayVerdict).toBe('MATCH');
    expect(state.replay.status).toBe('MATCH');
  });

  it('replay RE-EXECUTES the real Arrhenius solver rather than reading stored numbers back, and catches real drift', TIMEOUT, async () => {
    const { runWorldDiscoveryAndRemember } = await import('../core/agent/worldDiscoverySession');
    const { getExperiment, replaySavedWorldDiscoveryRun } = await import('../core/scienceMemory');

    const state = runWorldDiscoveryAndRemember(GOAL, CATALOG_ID);
    if (state.kind !== 'COMPLETE') throw new Error('expected COMPLETE');
    const stored = getExperiment(state.savedExperimentId)!;

    expect(replaySavedWorldDiscoveryRun(stored).status).toBe('MATCH');

    // Tamper with a stored finding after the fact.
    const tampered = {
      ...stored,
      worldDiscovery: {
        ...stored.worldDiscovery!,
        loopResult: {
          ...stored.worldDiscovery!.loopResult!,
          beliefs: stored.worldDiscovery!.loopResult!.beliefs.map((b) =>
            b.hypothesisId === 'h:substance-mass' ? { ...b, status: 'SUPPORTED' as const } : b,
          ),
        },
      },
    };
    expect(replaySavedWorldDiscoveryRun(tampered).status).toBe('DRIFT');
  });

  it('the SECOND run, in a fresh process, skips the refuted hypothesis a real prior run already ruled out', TIMEOUT, async () => {
    const first = await import('../core/agent/worldDiscoverySession');
    const firstRun = first.runWorldDiscoveryAndRemember(GOAL, CATALOG_ID);
    if (firstRun.kind !== 'COMPLETE') throw new Error('expected COMPLETE');
    expect(firstRun.memory).toBeNull(); // nothing to resume from on the very first run
    expect(firstRun.result.failedHypotheses.map((b) => b.hypothesisId)).toEqual(['h:substance-mass']);

    // Simulate an actual process restart: fresh module graph, same underlying storage.
    vi.resetModules();
    const second = await import('../core/agent/worldDiscoverySession');
    const secondRun = second.runWorldDiscoveryAndRemember(GOAL, CATALOG_ID);
    if (secondRun.kind !== 'COMPLETE') throw new Error('expected COMPLETE');

    expect(secondRun.memory).not.toBeNull();
    expect(secondRun.memory!.skippedHypothesisIds).toEqual(['h:substance-mass']);
    expect(secondRun.result.rounds.every((r) => r.hypothesisId !== 'h:substance-mass')).toBe(true);
    // The first thing it tries this time is what remained open, not what was already ruled out.
    expect(secondRun.result.rounds[0].hypothesisId).toBe('h:temperature');

    const { listExperiments } = await import('../core/scienceMemory');
    expect(listExperiments().filter((e) => e.worldDiscovery)).toHaveLength(2);
  });

  it('memory is scoped to the objective: a DIFFERENT direction does not inherit the refutation', TIMEOUT, async () => {
    const first = await import('../core/agent/worldDiscoverySession');
    first.runWorldDiscoveryAndRemember(GOAL, CATALOG_ID); // minimise -> refutes h:substance-mass

    vi.resetModules();
    const second = await import('../core/agent/worldDiscoverySession');
    const reversed = second.runWorldDiscoveryAndRemember(
      'Maximize remaining fraction using mass, at most 1 experiment.',
      CATALOG_ID,
    );
    if (reversed.kind !== 'COMPLETE') throw new Error('expected COMPLETE');

    // A refutation under "minimise" must not silently exclude the hypothesis under "maximise" —
    // it was never tested against this objective.
    expect(reversed.memory).toBeNull();
    expect(reversed.result.rounds[0].hypothesisId).toBe('h:substance-mass');
  });

  it('refuses a goal naming an unmodelled objective, exactly as the pipeline without memory does', TIMEOUT, async () => {
    const { runWorldDiscoveryAndRemember } = await import('../core/agent/worldDiscoverySession');
    const { listExperiments } = await import('../core/scienceMemory');
    const state = runWorldDiscoveryAndRemember('Minimize the boiling point.', CATALOG_ID);
    expect(state.kind).toBe('REFUSED');
    if (state.kind !== 'REFUSED') return;
    expect(state.error).toMatch(/concentrationFraction/);
    expect(listExperiments()).toHaveLength(0); // a refusal saves nothing — there is no experiment to remember
  });

  it('replay reports NOT_REPRODUCIBLE for a catalog Genesis no longer declares', TIMEOUT, async () => {
    const { runWorldDiscoveryAndRemember } = await import('../core/agent/worldDiscoverySession');
    const { getExperiment, replaySavedWorldDiscoveryRun } = await import('../core/scienceMemory');
    const state = runWorldDiscoveryAndRemember(GOAL, CATALOG_ID);
    if (state.kind !== 'COMPLETE') throw new Error('expected COMPLETE');
    const stored = getExperiment(state.savedExperimentId)!;
    const withUnknownCatalog = { ...stored, worldDiscovery: { ...stored.worldDiscovery!, catalogId: 'no-such-catalog' } };
    const replay = replaySavedWorldDiscoveryRun(withUnknownCatalog);
    expect(replay.status).toBe('NOT_REPRODUCIBLE');
  });

  it('does not read any hidden/undeclared parameter: two independent runs of the same goal produce identical results', TIMEOUT, async () => {
    const first = await import('../core/agent/worldDiscoverySession');
    const firstRun = first.runWorldDiscoveryAndRemember(GOAL, CATALOG_ID);
    if (firstRun.kind !== 'COMPLETE') throw new Error('expected COMPLETE');

    // A genuinely independent process: fresh module graph AND fresh storage, so there is
    // nothing this second run could read that the first run did not also declare.
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    const second = await import('../core/agent/worldDiscoverySession');
    const secondRun = second.runWorldDiscoveryAndRemember(GOAL, CATALOG_ID);
    if (secondRun.kind !== 'COMPLETE') throw new Error('expected COMPLETE');

    expect(secondRun.result.rounds.map((r) => ({ id: r.hypothesisId, effect: r.effect }))).toEqual(
      firstRun.result.rounds.map((r) => ({ id: r.hypothesisId, effect: r.effect })),
    );
    expect(secondRun.result.stopReason).toBe(firstRun.result.stopReason);
  });
});
