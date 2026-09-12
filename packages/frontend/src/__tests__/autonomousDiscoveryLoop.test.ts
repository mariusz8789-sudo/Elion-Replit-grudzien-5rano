import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  runAutonomousDiscovery,
  toAgentStepInput,
  priorBeliefsFromAgentRunFinal,
  discoveryResultFingerprint,
  DISCOVERY_LOOP_CONTRACT_VERSION,
  type DiscoveryLoopInput,
  type MechanisticHypothesis,
} from '../core/agent/discoveryLoop';
import {
  buildGenesisScientificCity3,
  GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID,
  GENESIS_SCIENTIFIC_CITY_PUMP_PIPE_ID,
} from '../core/worldModel/domains/genesisScientificCity3';

/**
 * THE FIRST AUTONOMOUS DISCOVERY LOOP, ON THE REAL FLOOD CITY.
 *
 * The central claim under test is narrow and checkable: what the loop DOES in
 * round 2 depends on what it OBSERVED in round 1. Every number below comes
 * from the real flood model, and the two worlds differ only in how long the
 * storm is allowed to run — which is exactly the physical difference that
 * makes the outlet hypothesis true in one and false in the other.
 *
 * At 40 ticks the water level (~1.49 m) stays BELOW the outlet sill (~1.54 m),
 * so widening the outlet cannot do anything: the water never reaches it. At 56
 * ticks the level passes the sill and the floodplain really spills, so a wider
 * outlet really does lower the peak. Same hypothesis, opposite verdict, for a
 * mechanistic reason rather than a tuned one.
 */

const DECISION_TICK = 1;
const DT_S = 600;

/** Sets one floodplain scalar, scaled by the strength the loop chose. */
function floodplainLever(key: string, fullValue: number, baseValue: number) {
  return (graph: Parameters<MechanisticHypothesis['apply']>[0], strength: number) => {
    const floodplain = graph.getEntity(GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID)!;
    const value = baseValue + (fullValue - baseValue) * strength;
    graph.updateEntity(floodplain.id, { domainState: { ...floodplain.domainState, [key]: value } });
  };
}

const OUTLET_HYPOTHESIS: MechanisticHypothesis = {
  hypothesisId: 'h:outlet-capacity-limits-depth',
  statement: 'Peak flood depth is limited by outlet capacity, so widening the outlet lowers it.',
  mechanism: 'widening the floodplain outlet',
  entityId: GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID,
  criterion: {
    metric: 'maxDepthM',
    relation: 'less-than',
    rationale: 'If the outlet is what limits discharge, widening it must reduce the peak depth.',
  },
  apply: floodplainLever('outletWidthM', 40, 5),
  rationale: 'Outlet geometry is the drainage path the model actually integrates.',
};

const INFILTRATION_HYPOTHESIS: MechanisticHypothesis = {
  hypothesisId: 'h:infiltration-limits-depth',
  statement: 'Peak flood depth is limited by infiltration, so permeable ground lowers it.',
  mechanism: 'raising floodplain infiltration',
  entityId: GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID,
  criterion: {
    metric: 'maxDepthM',
    relation: 'less-than',
    rationale: 'Water that infiltrates is water that is not standing on the floodplain.',
  },
  apply: floodplainLever('infiltrationRateMPerS', 1.0e-4, 1.39e-6),
  rationale: 'Infiltration is a real loss term in the volume balance.',
};

const PUMP_HYPOTHESIS: MechanisticHypothesis = {
  hypothesisId: 'h:pump-capacity-limits-depth',
  statement: 'Peak flood depth is limited by pump capacity, so a larger pump lowers it.',
  mechanism: 'increasing pump-pipe volumetric flow',
  entityId: GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID,
  criterion: {
    metric: 'maxDepthM',
    relation: 'less-than',
    rationale: 'If the pump is the binding constraint, more capacity must reduce standing water.',
  },
  apply: (graph, strength) => {
    const pump = graph.getEntity(GENESIS_SCIENTIFIC_CITY_PUMP_PIPE_ID)!;
    const base = pump.domainState!.volumetricFlow as number;
    graph.updateEntity(pump.id, { domainState: { ...pump.domainState, volumetricFlow: base * (1 + strength) } });
  },
  rationale: 'The pump is the asset an operator can actually change.',
};

function loopInput(horizonTick: number, overrides: Partial<DiscoveryLoopInput> = {}): DiscoveryLoopInput {
  return {
    question: 'What limits peak flood depth in this city, and which lever actually moves it?',
    worldId: 'genesis-scientific-city-3',
    domainId: 'flood-hydrology',
    buildWorld: () => buildGenesisScientificCity3({ rainfallAtTick: 2 }),
    hypotheses: [OUTLET_HYPOTHESIS, INFILTRATION_HYPOTHESIS, PUMP_HYPOTHESIS],
    decisionAtTick: DECISION_TICK,
    horizonTick,
    dt: DT_S,
    maxRounds: 4,
    declaredAssumptions: ['Synthetic terrain (PROCEDURAL_APPROXIMATION)', 'One storm, uncalibrated'],
    notModelledFactors: ['Construction cost', 'Time to build', 'Maintenance and clogging'],
    ...overrides,
  };
}

/** Below the outlet sill: the outlet cannot matter. */
const SHORT_HORIZON = 40;
/** Above the sill: the floodplain really spills, so the outlet can matter. */
const SPILLING_HORIZON = 56;

describe('THE CRITICAL TEST: a different observation changes what the loop actually executes', () => {
  const belowSill = runAutonomousDiscovery(loopInput(SHORT_HORIZON));
  const spilling = runAutonomousDiscovery(loopInput(SPILLING_HORIZON));

  it('starts both runs from the same state and tests the same hypothesis first', () => {
    expect(belowSill.rounds[0].hypothesisId).toBe(OUTLET_HYPOTHESIS.hypothesisId);
    expect(spilling.rounds[0].hypothesisId).toBe(OUTLET_HYPOTHESIS.hypothesisId);
    expect(belowSill.rounds[0].strength).toBe(spilling.rounds[0].strength);
  });

  it('observes genuinely different physics in round 1', () => {
    // Below the sill the lever cannot reach the water, so the objective does not move.
    expect(belowSill.rounds[0].effect).toBe(0);
    // Once the floodplain spills, the same lever really lowers the peak.
    expect(spilling.rounds[0].effect!).toBeLessThan(0);
  });

  it('reaches a different HYPOTHESIS STATE from that observation', () => {
    const outletBelow = belowSill.beliefs.find((b) => b.hypothesisId === OUTLET_HYPOTHESIS.hypothesisId)!;
    const outletSpill = spilling.beliefs.find((b) => b.hypothesisId === OUTLET_HYPOTHESIS.hypothesisId)!;
    expect(outletBelow.status).toBe('REFUTED');
    expect(outletSpill.status).toBe('SUPPORTED');
    expect(belowSill.failedHypotheses.map((b) => b.hypothesisId)).toContain(OUTLET_HYPOTHESIS.hypothesisId);
    expect(spilling.failedHypotheses.map((b) => b.hypothesisId)).not.toContain(OUTLET_HYPOTHESIS.hypothesisId);
  });

  it('reaches a different BELIEF/CONFIDENCE state', () => {
    const confidence = (r: typeof belowSill, id: string) => r.beliefs.find((b) => b.hypothesisId === id)!.confidence;
    expect(confidence(belowSill, OUTLET_HYPOTHESIS.hypothesisId)).toBe('REFUTED_BY_NO_EFFECT');
    expect(confidence(spilling, OUTLET_HYPOTHESIS.hypothesisId)).toBe('SUPPORTED_AT_TWO_MAGNITUDES');
  });

  it('selects a different NEXT ACTION, via the dispatcher rather than a bespoke branch', () => {
    const below = belowSill.rounds[0].nextAction;
    const spill = spilling.rounds[0].nextAction;
    // Both came from the shared selector interface...
    expect(below.selectorId).toBe('world-counterfactual');
    expect(spill.selectorId).toBe('world-counterfactual');
    // ...and it returned genuinely different guidance for the two observations.
    expect(below.action).not.toBe(spill.action);
    expect((below.native as { kind: string }).kind).not.toBe((spill.native as { kind: string }).kind);
    // The supported arm is told a single magnitude is not a response — which is
    // exactly the rule the loop then acts on by re-testing at half strength.
    expect((spill.native as { kind: string }).kind).toBe('SINGLE_INTERVENTION_POINT');
  });

  it('EXECUTES a different round 2 — a different mechanism, not merely a different label', () => {
    // This is the assertion that separates an adaptive loop from a for-loop:
    // the two runs ran DIFFERENT INTERVENTIONS in round 2, chosen from what
    // round 1 observed.
    expect(belowSill.rounds[1].hypothesisId).toBe(INFILTRATION_HYPOTHESIS.hypothesisId);
    expect(spilling.rounds[1].hypothesisId).toBe(OUTLET_HYPOTHESIS.hypothesisId);
    expect(belowSill.rounds[1].hypothesisId).not.toBe(spilling.rounds[1].hypothesisId);

    // And the executed worlds really differ: different branches, different states.
    expect(belowSill.rounds[1].branchId).not.toBe(belowSill.rounds[0].branchId);
    expect(spilling.rounds[1].strength).toBe(0.5); // re-tested at half strength, not repeated
    expect(spilling.rounds[1].objectiveObserved).not.toBe(spilling.rounds[0].objectiveObserved);
  });

  it('abandons a refuted mechanism instead of retrying it', () => {
    const outletRounds = belowSill.rounds.filter((r) => r.hypothesisId === OUTLET_HYPOTHESIS.hypothesisId);
    expect(outletRounds).toHaveLength(1);
  });
});

describe('The loop conducts a real multi-round search', () => {
  const result = runAutonomousDiscovery(loopInput(SHORT_HORIZON));

  it('runs several rounds and stops on a declared criterion', () => {
    expect(result.contractVersion).toBe(DISCOVERY_LOOP_CONTRACT_VERSION);
    expect(result.rounds.length).toBeGreaterThan(1);
    expect(['ALL_HYPOTHESES_RESOLVED', 'ROUND_BUDGET_EXHAUSTED', 'LEADER_CONFIRMED_AT_TWO_MAGNITUDES'])
      .toContain(result.stopReason);
  });

  it('keeps negative evidence as a result rather than discarding it', () => {
    expect(result.failedHypotheses.length).toBeGreaterThan(0);
    for (const failed of result.failedHypotheses) {
      expect(failed.refutedInRounds.length).toBeGreaterThan(0);
      expect(failed.reason).toBeTruthy();
    }
  });

  it('finds the mechanism that really works in this world', () => {
    const infiltration = result.beliefs.find((b) => b.hypothesisId === INFILTRATION_HYPOTHESIS.hypothesisId)!;
    expect(infiltration.status).toBe('SUPPORTED');
    expect(infiltration.observedEffects[0]).toBeLessThan(0);
  });

  it('names what it never settled instead of implying completeness', () => {
    expect(Array.isArray(result.unresolvedQuestions)).toBe(true);
    expect(result.notModelledFactors.join(' ')).toMatch(/cost/i);
  });

  it('never reports a numeric probability for a hypothesis', () => {
    // The codebase refuses credences it has no methodology for; the loop must not
    // smuggle one in through the belief state.
    for (const belief of result.beliefs) {
      expect(typeof belief.confidence).toBe('string');
      expect(belief).not.toHaveProperty('probability');
      expect(belief).not.toHaveProperty('posterior');
    }
  });
});

describe('Every step is traceable and the run is replayable', () => {
  const result = runAutonomousDiscovery(loopInput(SHORT_HORIZON));

  it('records WHY / WHAT / TOOL / INPUT / OUTPUT / NEXT ACTION for every step', () => {
    expect(result.trace.length).toBe(result.rounds.length);
    result.trace.forEach((step, index) => {
      expect(step.stepIndex).toBe(index);
      expect(step.why).toBeTruthy();
      expect(step.what).toBeTruthy();
      expect(step.tool).toBeTruthy();
      expect(Object.keys(step.input).length).toBeGreaterThan(0);
      expect(Object.keys(step.output).length).toBeGreaterThan(0);
      expect(step.nextAction).toBeTruthy();
      // The capability of the tool that produced the step travels with it.
      expect(['MODELLED', 'PARTIALLY_MODELLED', 'NOT_MODELLED']).toContain(step.capability);
      // And so does the in-model disclaimer on the verdict.
      expect(String(step.falsificationVerdict!.disclaimer)).toMatch(/not evidence of a causal relationship/);
    });
  });

  it('shows the belief actually changing across a step', () => {
    const changed = result.trace.find((s) => s.output.statusBefore !== s.output.statusAfter);
    expect(changed).toBeDefined();
    expect(changed!.output.statusBefore).toBe('UNTESTED');
  });

  it('links each step to the real events its branch produced', () => {
    for (const step of result.trace) {
      expect(step.branchId).toBeTruthy();
      expect(step.provenanceEventIds.length).toBeGreaterThan(0);
    }
  });

  it('replays identically: same world and hypotheses give the same rounds and beliefs', () => {
    const again = runAutonomousDiscovery(loopInput(SHORT_HORIZON));
    expect(again.rounds.map((r) => [r.round, r.hypothesisId, r.strength, r.effect]))
      .toEqual(result.rounds.map((r) => [r.round, r.hypothesisId, r.strength, r.effect]));
    expect(again.beliefs.map((b) => [b.hypothesisId, b.status, b.confidence]))
      .toEqual(result.beliefs.map((b) => [b.hypothesisId, b.status, b.confidence]));
    expect(again.stopReason).toBe(result.stopReason);
  });
});

describe('The trace persists through the real AgentRun tables', () => {
  it('stores and reads back every step, unchanged', async () => {
    const storeUrl = pathToFileURL(path.resolve(process.cwd(), '../backend/src/store.mjs')).href;
    const agentRunUrl = pathToFileURL(path.resolve(process.cwd(), '../backend/src/agentRun.mjs')).href;
    const authUrl = pathToFileURL(path.resolve(process.cwd(), '../backend/src/auth.mjs')).href;
    const store = (await import(/* @vite-ignore */ storeUrl)) as Record<string, (...args: never[]) => never>;
    const agentRun = (await import(/* @vite-ignore */ agentRunUrl)) as Record<string, (...args: never[]) => never>;
    const auth = (await import(/* @vite-ignore */ authUrl)) as Record<string, (...args: never[]) => never>;

    const db = (store.openDatabase as unknown as () => unknown)();
    const user = (store.createUser as unknown as (d: unknown, u: unknown) => { id: string })(db, {
      email: 'loop@lab.org', displayName: 'L', passwordHash: (auth.hashPassword as unknown as (p: string) => string)('password123'),
    });
    const project = (store.createProject as unknown as (d: unknown, p: unknown) => { id: string })(db, { name: 'Loop', ownerId: user.id });

    const result = runAutonomousDiscovery(loopInput(SHORT_HORIZON));
    const run = (agentRun.createAgentRun as unknown as (d: unknown, r: unknown) => { id: string })(db, {
      projectId: project.id, goal: result.question, domain: result.domainId,
      budget: { maxRounds: 4 }, createdBy: user.id,
    });
    for (const step of result.trace) {
      (agentRun.addAgentStep as unknown as (d: unknown, s: unknown) => string)(db, toAgentStepInput(step, run.id));
    }

    const stored = (agentRun.listAgentSteps as unknown as (d: unknown, id: string) => readonly {
      stepIndex: number; capability: string; branchId: string | null;
      hypothesis: { hypothesisId: string }; observation: { effect: number | null };
      falsificationVerdict: { assessment: string }; provenanceEventIds: readonly string[];
    }[])(db, run.id);

    expect(stored).toHaveLength(result.trace.length);
    stored.forEach((row, index) => {
      const step = result.trace[index];
      expect(row.stepIndex).toBe(step.stepIndex);
      expect(row.hypothesis.hypothesisId).toBe(step.hypothesis.hypothesisId);
      expect(row.branchId).toBe(step.branchId);
      expect(row.capability).toBe(step.capability);
      expect(row.observation.effect).toBe(step.observation!.effect);
      expect(row.falsificationVerdict.assessment).toBe(step.falsificationVerdict!.assessment);
      expect(row.provenanceEventIds).toEqual(step.provenanceEventIds);
    });
  });

  /**
   * P0.2 HARDENING — everything below shares one loader for the three
   * backend modules the tests reach across the frontend/backend boundary
   * with, and always opens a REAL, FILE-BACKED database (never `:memory:`)
   * so "close the handle, reopen a fresh one" is an actual process-restart
   * simulation, the same discipline `agentRun.test.mjs`'s own
   * "AgentRun persistence survives a real process restart" suite already
   * uses at the storage layer. `:memory:` would make every "restart" test
   * below vacuously pass (there is nothing to lose), which is exactly the
   * false confidence a real DB file rules out.
   */
  async function loadAgentRunModules() {
    const storeUrl = pathToFileURL(path.resolve(process.cwd(), '../backend/src/store.mjs')).href;
    const agentRunUrl = pathToFileURL(path.resolve(process.cwd(), '../backend/src/agentRun.mjs')).href;
    const authUrl = pathToFileURL(path.resolve(process.cwd(), '../backend/src/auth.mjs')).href;
    return {
      store: (await import(/* @vite-ignore */ storeUrl)) as Record<string, (...args: never[]) => never>,
      agentRun: (await import(/* @vite-ignore */ agentRunUrl)) as Record<string, (...args: never[]) => never>,
      auth: (await import(/* @vite-ignore */ authUrl)) as Record<string, (...args: never[]) => never>,
    };
  }

  function withTempDbFile<T>(fn: (dbPath: string) => T): T {
    const dir = mkdtempSync(path.join(tmpdir(), 'genesis-p02-hardening-'));
    try {
      return fn(path.join(dir, 'genesis.db'));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  /**
   * P0.2 BELIEF PERSISTENCE — the actual gap this closes, proven end to end
   * through the REAL `agent_runs`/`agent_run_steps` tables on a REAL file, not
   * a mock and not `:memory:`.
   *
   * Two SEPARATE agent runs (`run1`, `run2`) model two separate cycles of the
   * SAME investigation. `run1` executes cold (no `priorBeliefs`) and reaches
   * real verdicts on the real flood city. Its final belief state is persisted
   * to `run1.final_json` via `updateAgentRunStatus` — the same column
   * `agentRun.mjs` already exposed for exactly this and that nothing wrote to
   * before this change. The database handle is then CLOSED — a real process
   * ending — and `run2` rehydrates `run1`'s posterior through a BRAND NEW
   * handle opened on the same file, exactly as a restarted process would.
   *
   * The assertion that matters: `run2` does NOT repeat `run1`'s work. Every
   * hypothesis `run1` already decided is honored as already-decided, so
   * `run2`'s `selectNext` finds nothing left to test and stops on its very
   * first round — the observable, falsifiable difference between "cycle 2
   * inherits cycle 1's posterior" (this) and "cycle 2 starts blind" (the
   * pre-fix behavior, still exercised by every OTHER test in this file that
   * never passes `priorBeliefs`).
   */
  it('P0.2: belief persists across a REAL PROCESS RESTART — close the DB, reopen a fresh handle, cycle 2 inherits cycle 1s verdicts and re-tests nothing', async () => {
    const { store, agentRun, auth } = await loadAgentRunModules();

    await withTempDbFile(async (dbPath) => {
      const db: unknown = (store.openDatabase as unknown as (p: string) => unknown)(dbPath);
      const user = (store.createUser as unknown as (d: unknown, u: unknown) => { id: string })(db, {
        email: 'p02@lab.org', displayName: 'P02', passwordHash: (auth.hashPassword as unknown as (p: string) => string)('password123'),
      });
      const project = (store.createProject as unknown as (d: unknown, p: unknown) => { id: string })(db, { name: 'P0.2', ownerId: user.id });

      // --- Cycle 1: cold start, no priorBeliefs — real rounds run, real verdicts reached. ---
      const cycle1 = runAutonomousDiscovery(loopInput(SHORT_HORIZON));
      expect(cycle1.rounds.length).toBeGreaterThan(0);
      expect(cycle1.beliefs.find((b) => b.hypothesisId === OUTLET_HYPOTHESIS.hypothesisId)!.status).toBe('REFUTED');
      expect(cycle1.beliefs.find((b) => b.hypothesisId === INFILTRATION_HYPOTHESIS.hypothesisId)!.status).toBe('SUPPORTED');

      const run1 = (agentRun.createAgentRun as unknown as (d: unknown, r: unknown) => { id: string })(db, {
        projectId: project.id, goal: cycle1.question, domain: cycle1.domainId, budget: { maxRounds: 4 }, createdBy: user.id,
      });
      for (const step of cycle1.trace) {
        (agentRun.addAgentStep as unknown as (d: unknown, s: unknown) => string)(db, toAgentStepInput(step, run1.id));
      }
      // The one call this whole feature was missing a caller for: bank the
      // cycle's real posterior where a later cycle can find it.
      (agentRun.updateAgentRunStatus as unknown as (d: unknown, id: string, status: string, final: unknown) => void)(
        db, run1.id, 'RESOLVED', { beliefs: cycle1.beliefs, stopReason: cycle1.stopReason },
      );

      // --- SIMULATED RESTART: close this handle; nothing below reuses it. ---
      (db as { close: () => void }).close();

      // --- Rehydrate through a BRAND NEW handle on the same file. ---
      const restarted = (store.openDatabase as unknown as (p: string) => unknown)(dbPath);
      const storedRun1 = (agentRun.getAgentRun as unknown as (d: unknown, id: string) => { final: unknown })(restarted, run1.id);
      const rehydratedPriorBeliefs = priorBeliefsFromAgentRunFinal(storedRun1.final);
      expect(rehydratedPriorBeliefs).toHaveLength(cycle1.beliefs.length);

      // --- Cycle 2: SAME declared hypotheses, SAME world, seeded from run1's persisted posterior. ---
      const cycle2 = runAutonomousDiscovery(loopInput(SHORT_HORIZON, { priorBeliefs: rehydratedPriorBeliefs }));

      // The core claim: nothing is re-tested. Every hypothesis run1 already
      // decided is honored, so selectNext finds nothing left and stops cold —
      // never re-running the round-1 OUTLET test cycle1 itself needed.
      expect(cycle2.rounds).toHaveLength(0);
      expect(cycle2.trace).toHaveLength(0);
      expect(cycle2.stopReason).toBe('NO_TESTABLE_HYPOTHESIS');
      // The posterior for every DECLARED hypothesis survived the round trip
      // unchanged — a resume, not a reset relabelled as one. (A real, honest
      // limitation, not asserted away here: cycle1 also derived a fourth,
      // UNTESTED hypothesis mid-run via deriveAlternativeCriteria — see its
      // "~RELATION_FLIP" id below, and `DiscoveryLoopInput.priorBeliefs`'s own
      // doc for why this is a deliberate scope boundary, not an oversight.)
      const declaredIds = new Set([OUTLET_HYPOTHESIS, INFILTRATION_HYPOTHESIS, PUMP_HYPOTHESIS].map((h) => h.hypothesisId));
      expect(cycle2.beliefs).toEqual(cycle1.beliefs.filter((b) => declaredIds.has(b.hypothesisId)));
      expect(cycle1.beliefs.length).toBe(cycle2.beliefs.length + 1); // the one derived hypothesis, honestly not carried forward
      expect(cycle1.beliefs.some((b) => b.hypothesisId.includes('~RELATION_FLIP'))).toBe(true);

      // A second, SEPARATE agent_runs row records cycle 2 — two real cycles of
      // one investigation, not one run silently mutated in place.
      const run2 = (agentRun.createAgentRun as unknown as (d: unknown, r: unknown) => { id: string })(restarted, {
        projectId: project.id, goal: cycle2.question, domain: cycle2.domainId, budget: { maxRounds: 4 }, createdBy: user.id,
      });
      expect(run2.id).not.toBe(run1.id);
      (agentRun.updateAgentRunStatus as unknown as (d: unknown, id: string, status: string, final: unknown) => void)(
        restarted, run2.id, 'RESOLVED', { beliefs: cycle2.beliefs, stopReason: cycle2.stopReason },
      );

      // --- SECOND restart: read run2 back through a THIRD, independent handle. ---
      (restarted as { close: () => void }).close();
      const thirdHandle = (store.openDatabase as unknown as (p: string) => unknown)(dbPath);
      const storedRun2 = (agentRun.getAgentRun as unknown as (d: unknown, id: string) => { final: { stopReason: string } })(thirdHandle, run2.id);
      expect(storedRun2.final.stopReason).toBe('NO_TESTABLE_HYPOTHESIS');
      (thirdHandle as { close: () => void }).close();
    });
  });

  it('P0.2 DETERMINISM: a WARM cycle (seeded with rehydrated priorBeliefs) replays identically, not just a cold one', async () => {
    const { store, agentRun, auth } = await loadAgentRunModules();

    withTempDbFile((dbPath) => {
      const db = (store.openDatabase as unknown as (p: string) => unknown)(dbPath);
      const user = (store.createUser as unknown as (d: unknown, u: unknown) => { id: string })(db, {
        email: 'p02-determinism@lab.org', displayName: 'P02D', passwordHash: (auth.hashPassword as unknown as (p: string) => string)('password123'),
      });
      const project = (store.createProject as unknown as (d: unknown, p: unknown) => { id: string })(db, { name: 'P0.2 determinism', ownerId: user.id });

      const cycle1 = runAutonomousDiscovery(loopInput(SHORT_HORIZON));
      const run1 = (agentRun.createAgentRun as unknown as (d: unknown, r: unknown) => { id: string })(db, {
        projectId: project.id, goal: cycle1.question, domain: cycle1.domainId, budget: { maxRounds: 4 }, createdBy: user.id,
      });
      (agentRun.updateAgentRunStatus as unknown as (d: unknown, id: string, status: string, final: unknown) => void)(
        db, run1.id, 'RESOLVED', { beliefs: cycle1.beliefs, stopReason: cycle1.stopReason },
      );
      const stored = (agentRun.getAgentRun as unknown as (d: unknown, id: string) => { final: unknown })(db, run1.id);
      const priorBeliefs = priorBeliefsFromAgentRunFinal(stored.final);

      // The SAME warm input, run twice — not "does a cold run replay" (already
      // covered above) but specifically "does seeding from a rehydrated prior
      // still produce a stable, non-flaky result".
      const warmA = runAutonomousDiscovery(loopInput(SHORT_HORIZON, { priorBeliefs }));
      const warmB = runAutonomousDiscovery(loopInput(SHORT_HORIZON, { priorBeliefs }));
      // Fingerprint rather than raw `.rounds`: see the SILENT-LOSS GUARD test
      // below for why raw branch ids are never a safe cross-call comparison.
      expect(discoveryResultFingerprint(warmA)).toBe(discoveryResultFingerprint(warmB));
      expect(warmA.beliefs).toEqual(warmB.beliefs);
      expect(warmA.stopReason).toBe(warmB.stopReason);
    });
  });

  it('P0.2 SILENT-LOSS GUARD: a run that never resolved (crashed mid-loop, no final_json) rehydrates as a COLD start, never a crash or a fabricated belief', async () => {
    const { store, agentRun, auth } = await loadAgentRunModules();

    withTempDbFile((dbPath) => {
      const db = (store.openDatabase as unknown as (p: string) => unknown)(dbPath);
      const user = (store.createUser as unknown as (d: unknown, u: unknown) => { id: string })(db, {
        email: 'p02-crash@lab.org', displayName: 'P02C', passwordHash: (auth.hashPassword as unknown as (p: string) => string)('password123'),
      });
      const project = (store.createProject as unknown as (d: unknown, p: unknown) => { id: string })(db, { name: 'P0.2 crash', ownerId: user.id });

      // A run that STARTED (steps were persisted, proving agent_run_steps is
      // not silently empty) but never reached a final state — the real shape
      // of "the process crashed mid-loop before updateAgentRunStatus ran".
      const crashedCycle = runAutonomousDiscovery(loopInput(SHORT_HORIZON));
      const crashedRun = (agentRun.createAgentRun as unknown as (d: unknown, r: unknown) => { id: string })(db, {
        projectId: project.id, goal: crashedCycle.question, domain: crashedCycle.domainId, budget: { maxRounds: 4 }, createdBy: user.id,
      });
      for (const step of crashedCycle.trace) {
        (agentRun.addAgentStep as unknown as (d: unknown, s: unknown) => string)(db, toAgentStepInput(step, crashedRun.id));
      }
      // Deliberately NOT calling updateAgentRunStatus — this run stays RUNNING forever, final_json stays NULL.

      const stored = (agentRun.getAgentRun as unknown as (d: unknown, id: string) => { status: string; final: unknown })(db, crashedRun.id);
      expect(stored.status).toBe('RUNNING');
      expect(stored.final).toBeNull();

      // The hardened contract: no throw, no fabricated empty array that a
      // caller could misread as "everything already decided" — exactly the
      // same `undefined` an omitted `priorBeliefs` field has.
      const rehydrated = priorBeliefsFromAgentRunFinal(stored.final);
      expect(rehydrated).toBeUndefined();

      // And feeding that into a fresh cycle behaves EXACTLY like a genuinely
      // cold run — the crash left no trace that could bias the next attempt.
      // Compared via discoveryResultFingerprint, not the raw `.rounds`/`.trace`
      // objects: `TemporalEngine` names branches from a process-global counter
      // (see that function's own doc), so three real runs already executed
      // earlier in THIS test/process legitimately shift every branch id here —
      // a difference the fingerprint deliberately excludes because it is not
      // a difference in what the loop actually found.
      const coldRerun = runAutonomousDiscovery(loopInput(SHORT_HORIZON, { priorBeliefs: rehydrated }));
      const trulyColdRun = runAutonomousDiscovery(loopInput(SHORT_HORIZON));
      expect(discoveryResultFingerprint(coldRerun)).toBe(discoveryResultFingerprint(trulyColdRun));
      expect(coldRerun.beliefs).toEqual(trulyColdRun.beliefs);
    });
  });

  it('P0.2 SILENT-LOSS GUARD: a malformed entry in final.beliefs is dropped, never silently trusted as a real belief', () => {
    // No database needed for this one — priorBeliefsFromAgentRunFinal takes
    // exactly what getAgentRun(...).final would deserialize to, and this
    // proves its own validation without depending on how it got there
    // (a hand-edited row, a future schema change, anything that produces
    // JSON not shaped like a real HypothesisBelief).
    const wellFormed = runAutonomousDiscovery(loopInput(SHORT_HORIZON)).beliefs[0]!;
    const garbage = { hypothesisId: 'h:not-a-real-belief', status: 'MADE_UP_STATUS' };

    const filtered = priorBeliefsFromAgentRunFinal({ beliefs: [wellFormed, garbage] });
    expect(filtered).toEqual([wellFormed]);

    // And a final.beliefs that is not even an array is refused outright, not coerced.
    expect(priorBeliefsFromAgentRunFinal({ beliefs: 'not-an-array' })).toBeUndefined();
    expect(priorBeliefsFromAgentRunFinal({ beliefs: [garbage] })).toBeUndefined();
    expect(priorBeliefsFromAgentRunFinal(undefined)).toBeUndefined();
    expect(priorBeliefsFromAgentRunFinal(null)).toBeUndefined();
  });
});
