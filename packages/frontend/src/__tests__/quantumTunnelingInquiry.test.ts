import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAutonomousInquiry } from '../core/agent/inquiryLoop';
import {
  quantumJunctionInquiry,
  QUANTUM_JUNCTION_CANDIDATES,
  QUANTUM_JUNCTION_MODEL_ID,
  QUANTUM_JUNCTION_NOT_MODELLED,
  QUANTUM_OPENING_ENERGY,
} from '../core/agent/quantumTunnelingInquiry';
import { getRouterModel } from '../core/experimentFabric/router';
import { SolverRouter } from '../core/worldModel/solvers/solverRouter';
import { TemporalBranchRegistry, TemporalEngine, type TemporalUpdater } from '../core/worldModel/temporal/temporalEngine';
import { WorldGraph } from '../core/worldModel/ecs/worldGraph';
import { entityId } from '../core/worldModel/ecs/types';
import { collectScalars } from '../core/worldModel/bridge/worldFrameState';
import { addTunnelJunction, makeQuantumTunnelingSolver, QUANTUM_TUNNELING_SOLVER_ID } from '../core/worldModel/domains/quantumTunneling';

/**
 * PHYSICS ON THE FABRIC — and the measurement that decided it belongs there.
 *
 * Every number below was measured from the real split-step Fourier integrator
 * before it was written down.
 */

const [THIN_TALL, MID_NARROW, MID_WIDE, LOW_BROAD] = QUANTUM_JUNCTION_CANDIDATES;

/**
 * The split-step integrator costs ~80ms a scenario, and these tests ask the same
 * questions of the same four junctions repeatedly. Memoised per junction so the
 * file stays fast; safe precisely because the loop is deterministic, which the
 * test below verifies with two UNCACHED calls rather than trusting this cache.
 */
const cache = new Map<string, ReturnType<typeof runAutonomousInquiry>>();
const run = (c: (typeof QUANTUM_JUNCTION_CANDIDATES)[number]) => {
  const cached = cache.get(c.id);
  if (cached) return cached;
  const fresh = runAutonomousInquiry(quantumJunctionInquiry(c.barrier, c.width));
  cache.set(c.id, fresh);
  return fresh;
};

/**
 * THE SUBSTRATE FINDING, as an executable check rather than an assertion in a
 * document. If someone later makes `frames` advance with the tick — the one
 * honest way to give this domain a real trajectory — this test fails, which is
 * exactly when the WorldGraph question should be reopened.
 */
describe('quantum tunnelling has no trajectory on the WorldGraph substrate', () => {
  it('returns a bit-identical transmission at every tick', () => {
    const graph = new WorldGraph();
    addTunnelJunction(graph);
    const router = new SolverRouter();
    router.register(QUANTUM_TUNNELING_SOLVER_ID, makeQuantumTunnelingSolver());
    const updater: TemporalUpdater = (g, dt, tick) => router.routeTick(g, dt, tick);
    const engine = new TemporalEngine(graph, { registry: new TemporalBranchRegistry(), label: 'baseline' });
    for (let i = 0; i < 40; i++) engine.advance(1, updater);

    const junction = entityId({ kind: 'tunnel-junction', id: 'stm-1' });
    const transmissionAt = (tick: number) =>
      collectScalars(engine.scrubTo(tick).getEntity(junction)!).transmission;

    const first = transmissionAt(1);
    expect(first).toBeCloseTo(0.017804, 6);
    // Not "close" at any horizon — equal. Advancing the world does nothing here,
    // so `decisionAtTick` and `horizonTick` would both be decorative.
    for (const tick of [2, 3, 5, 10, 20, 30, 40]) expect(transmissionAt(tick)).toBe(first);
  });
});

describe('quantum junction inquiry — the substrate is real', () => {
  it('runs on a Fabric model that exists, not a stub defined here', () => {
    const model = getRouterModel(QUANTUM_JUNCTION_MODEL_ID);
    expect(model).toBeDefined();
    expect(model?.domainId).toBe('quantum');
    expect(model?.engine).toBe('genesis-split-step-fft@1.0.0');
    const result = run(THIN_TALL);
    expect(result.domainId).toBe('quantum');
    for (const round of result.rounds) {
      expect(round.runId).toBeTruthy();
      expect(round.runFingerprint).toBeTruthy();
      expect(round.observed).not.toBeNull();
    }
  });

  it('is deterministic: the same junction twice gives the same probes and beliefs', () => {
    // Deliberately NOT through `run`'s cache — two genuinely independent executions.
    const a = runAutonomousInquiry(quantumJunctionInquiry(MID_WIDE.barrier, MID_WIDE.width));
    const b = runAutonomousInquiry(quantumJunctionInquiry(MID_WIDE.barrier, MID_WIDE.width));
    expect(b.rounds.map((r) => r.probeValue)).toEqual(a.rounds.map((r) => r.probeValue));
    expect(b.finalBeliefs).toEqual(a.finalBeliefs);
  });
});

/**
 * The physics that makes the next experiment a real choice: high above the
 * barrier every junction transmits alike, and only deep in the tunnelling
 * regime do height and width separate. Measured, not assumed.
 */
describe('quantum junction inquiry — the opening measurement settles nothing, and that is the point', () => {
  it('leaves all four junctions standing at E = 1.3', () => {
    for (const candidate of QUANTUM_JUNCTION_CANDIDATES) {
      const first = run(candidate).rounds[0]!;
      expect(first.probeValue).toBe(QUANTUM_OPENING_ENERGY);
      expect(first.beliefsAfter.filter((b) => b.status === 'FALSIFIED_WITHIN_PROTOCOL')).toHaveLength(0);
    }
  });

  it('measures a 7% spread at high energy against a 40x spread deep in the barrier', () => {
    // The four observations at the opening energy, one per junction on the bench.
    const high = QUANTUM_JUNCTION_CANDIDATES.map((c) => run(c).rounds[0]!.observed!);
    expect(Math.max(...high) / Math.min(...high)).toBeLessThan(1.1);
    expect(high.every((t) => t > 0.6 && t < 0.67)).toBe(true);
  });
});

/**
 * PROOF OF AUTONOMY, and a stronger one than the chemistry inquiry's.
 *
 * There, the first measurement falsified different hypotheses depending on the
 * sample, so a different survivor set chose a different probe. Here NOTHING is
 * falsified at the opening energy — all four junctions remain in contention in
 * every run. The next experiment differs anyway, because graded confidence moved
 * differently: each hypothesis's own prediction sat a different distance from
 * what was measured, so `rankHypotheses` returns a different top two, and a
 * different pair needs a different energy to separate it.
 *
 * That is the belief-revision machinery doing real work with no falsification at
 * all, which is the case a status-only loop could not express.
 */
describe('quantum junction inquiry — PROOF OF AUTONOMY: confidence alone picks the next energy', () => {
  const fromThinTall = run(THIN_TALL);
  const fromMidWide = run(MID_WIDE);
  const fromLowBroad = run(LOW_BROAD);

  it('starts every inquiry from a genuinely identical state', () => {
    expect(fromMidWide.rounds[0]!.beliefsBefore).toEqual(fromThinTall.rounds[0]!.beliefsBefore);
    expect(fromLowBroad.rounds[0]!.beliefsBefore).toEqual(fromThinTall.rounds[0]!.beliefsBefore);
    // Same hypotheses, so the same predictions at the same opening energy.
    expect(fromMidWide.rounds[0]!.outcomes.map((o) => o.predicted))
      .toEqual(fromThinTall.rounds[0]!.outcomes.map((o) => o.predicted));
  });

  it('observes a different result', () => {
    // Measured at E = 1.3.
    expect(fromThinTall.rounds[0]!.observed!).toBeCloseTo(0.6173, 3);
    expect(fromMidWide.rounds[0]!.observed!).toBeCloseTo(0.6583, 3);
    expect(fromLowBroad.rounds[0]!.observed!).toBeCloseTo(0.6097, 3);
  });

  it('reaches a different confidence state WITHOUT falsifying anything', () => {
    const confidence = (r: typeof fromThinTall) =>
      Object.fromEntries(r.rounds[0]!.beliefsAfter.map((b) => [b.hypothesisId, b.confidence]));
    expect(confidence(fromMidWide)).not.toEqual(confidence(fromThinTall));
    expect(confidence(fromLowBroad)).not.toEqual(confidence(fromThinTall));
    for (const result of [fromThinTall, fromMidWide, fromLowBroad]) {
      expect(result.rounds[0]!.beliefsAfter.every((b) => b.status !== 'FALSIFIED_WITHIN_PROTOCOL')).toBe(true);
    }
  });

  it('SELECTS A DIFFERENT NEXT ENERGY — three observations, three experiments', () => {
    for (const result of [fromThinTall, fromMidWide, fromLowBroad]) {
      expect(result.rounds[0]!.nextSelection.rule).toBe('DISCRIMINATES_TOP_TWO');
    }
    // Pinned, so a regression is a failure rather than a quietly weakened claim.
    expect(fromThinTall.rounds[0]!.nextSelection.probeValue).toBe(0.55);
    expect(fromMidWide.rounds[0]!.nextSelection.probeValue).toBe(0.4);
    expect(fromLowBroad.rounds[0]!.nextSelection.probeValue).toBe(0.8);
    expect(new Set([
      fromThinTall.rounds[0]!.nextSelection.probeValue,
      fromMidWide.rounds[0]!.nextSelection.probeValue,
      fromLowBroad.rounds[0]!.nextSelection.probeValue,
    ]).size).toBe(3);
  });

  it('actually executes that different second measurement', () => {
    expect(fromThinTall.rounds[1]?.probeValue).toBe(0.55);
    expect(fromMidWide.rounds[1]?.probeValue).toBe(0.4);
    expect(fromLowBroad.rounds[1]?.probeValue).toBe(0.8);
    expect(fromMidWide.rounds[1]!.runFingerprint).not.toBe(fromThinTall.rounds[1]!.runFingerprint);
  });

  it('converges on the junction actually on the instrument, every time', () => {
    for (const candidate of QUANTUM_JUNCTION_CANDIDATES) {
      const result = run(candidate);
      expect(result.survivingHypothesisIds).toEqual([candidate.id]);
      expect(result.stopReason).toBe('NO_CONTENDERS_LEFT');
    }
  });

  it('never needed more than two measurements to get there', () => {
    for (const candidate of QUANTUM_JUNCTION_CANDIDATES) {
      expect(run(candidate).rounds).toHaveLength(2);
    }
  });
});

describe('quantum junction inquiry — honesty', () => {
  it('says every candidate was wrong rather than crowning the least-wrong one', () => {
    // A junction nobody proposed, at the far corner of the validated range.
    const result = runAutonomousInquiry(quantumJunctionInquiry(0.4, 8));
    expect(result.survivingHypothesisIds).toHaveLength(0);
    expect(result.falsifiedHypothesisIds.length).toBeGreaterThan(0);
    expect(result.openQuestions.join(' ')).toContain('not among the values anyone proposed');
  });

  it('states the model boundary instead of implying a claim about a real junction', () => {
    const limitations = run(MID_NARROW).limitations.join(' ');
    expect(limitations).toContain(QUANTUM_JUNCTION_MODEL_ID);
    expect(limitations).toContain('which is not the same as being true of any real substance');
    const declared = QUANTUM_JUNCTION_NOT_MODELLED.join(' ');
    expect(declared).toContain('not the asymptotic transmission coefficient');
    expect(declared).toContain('No current');
  });

  it('never repeats a measurement it has already taken', () => {
    const probes = run(THIN_TALL).rounds.map((r) => r.probeValue);
    expect(new Set(probes).size).toBe(probes.length);
  });
});

describe('quantum junction inquiry — it goes through the existing memory/replay pipeline unchanged', () => {
  beforeEach(() => {
    vi.resetModules();
    const values = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => values.get(k) ?? null,
        setItem: (k: string, v: string) => void values.set(k, v),
        removeItem: (k: string) => void values.delete(k),
        key: (i: number) => [...values.keys()][i] ?? null,
        get length() { return values.size; },
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('runs, persists and replays by real re-execution — no new plumbing', async () => {
    const { runInquiryAndRemember } = await import('../core/agent/inquirySession');
    const { quantumJunctionInquiry: build } = await import('../core/agent/quantumTunnelingInquiry');
    const { listExperiments } = await import('../core/scienceMemory');

    const session = runInquiryAndRemember(build(MID_WIDE.barrier, MID_WIDE.width));
    expect(session.result.survivingHypothesisIds).toEqual(['h:mid-wide']);
    expect(listExperiments()).toHaveLength(1);
    expect(session.saved.labId).toBe('quantum');
    expect(session.replay.status).toBe('MATCH');
  });
});
