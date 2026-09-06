import { describe, expect, it } from 'vitest';
import { openLookingGlass } from '../core/lookingGlass/scenarioSession';
import { PUMP_PIPE_DEFAULTS } from '../core/engineeringGraph/pumpPipe';

/**
 * LOOKING GLASS x C3 — SECOND DOMAIN ON THE SAME ENGINE FAMILY.
 *
 * Hydraulics shares nothing physically with chemistry (Darcy-Weisbach
 * steady-state flow vs Arrhenius decay) but runs on the exact same
 * TemporalEngine/SolverRouter/replay-verification machinery
 * (worldModelReplay.ts), proving that machinery is genuinely engine-level,
 * not chemistry-specific code that happened to get reused once.
 *
 * The defining, easy-to-get-wrong fact about this domain: it is
 * STEADY-STATE. A tick with no intervention must produce IDENTICAL state
 * to the tick before it — that is correct physics, not a stalled run.
 */

const HYDRAULICS_SENTENCE = 'Show the hydraulic pump-pipe system over 6 hours from the operator';
const COMPARE_SENTENCE = 'Compare the hydraulic pump-pipe system over 6 hours from the operator';

describe('Looking Glass — hydraulics resolves through the real C3 engine', () => {
  it('parses and resolves to READY with the WORLD_MODEL_HYDRAULICS binding', () => {
    const session = openLookingGlass(HYDRAULICS_SENTENCE);
    expect(session.request.kind).toBe('HYDRAULIC_SYSTEM');
    expect(session.request.family).toBe('INDUSTRIAL_ENVIRONMENTAL');
    expect(session.resolution.status).toBe('READY');
    expect(session.producedBy).toMatch(/worldModel\.TemporalEngine/);
    expect(session.producedBy).toMatch(/hydraulics-pump-pipe/);
  });

  it('is steady-state: every tick is IDENTICAL without an intervention — the honest physics, not a stalled run', () => {
    const session = openLookingGlass(HYDRAULICS_SENTENCE);
    expect(session.states.length).toBe(7); // tick 0 through 6
    // Tick 0 is the entity BEFORE the solver has run once — it carries the
    // declared parameters (volumetricFlow, ...) but not yet the computed
    // outputs (headLoss, ...), so the comparison starts at tick 1, the
    // first tick the solver actually produced a headLoss for.
    const headLosses = session.states.slice(1).map((state) => {
      const entity = state.entities.find((e) => e.ref.kind === 'pump-pipe-system')!;
      return entity.properties.find((p) => p.key === 'domainState.headLoss')!.value as number;
    });
    for (const value of headLosses) expect(value).toBeCloseTo(headLosses[0]!, 10);
  });

  it('the real Darcy-Weisbach/Swamee-Jain outputs are present and physically sane', () => {
    const session = openLookingGlass(HYDRAULICS_SENTENCE);
    const entity = session.states[1]!.entities.find((e) => e.ref.kind === 'pump-pipe-system')!;
    const value = (key: string) => entity.properties.find((p) => p.key === `domainState.${key}`)!.value as number;
    expect(value('flowVelocity')).toBeGreaterThan(0);
    expect(value('reynolds')).toBeGreaterThan(0);
    expect(value('headLoss')).toBeGreaterThan(0);
    expect(value('shaftPower')).toBeGreaterThan(0);
  });

  it('reports a real, verified MATCH replay verdict at every tick, via the SAME shared verification chemistry uses', () => {
    const session = openLookingGlass(HYDRAULICS_SENTENCE);
    for (const state of session.states) {
      expect(state.replay?.status).toBe('MATCH');
      expect(state.replay?.message).toMatch(/Independently rebuilt/);
    }
  });

  it('has no 3D world route yet — same honest gate as chemistry, not a domain-specific one', () => {
    const session = openLookingGlass(HYDRAULICS_SENTENCE);
    expect(session.worldRoute).toBeNull();
    expect(session.enterWorld()).toBe(false);
  });
});

describe('Looking Glass — hydraulics branch comparison: a real intervention, not a relabeled clone', () => {
  it('produces a real, divergent comparison only when comparison was requested', () => {
    const notCompared = openLookingGlass(HYDRAULICS_SENTENCE);
    expect(notCompared.comparison).toBeNull();

    const compared = openLookingGlass(COMPARE_SENTENCE);
    expect(compared.comparison).not.toBeNull();
    expect(compared.comparison!.status).toBe('READY');
    expect(compared.comparison!.producedBy).toMatch(/worldModel\.compareBranches/);
  });

  it('throttling the flow rate genuinely reduces head loss and shaft power — real consequences of a real intervention', () => {
    const compared = openLookingGlass(COMPARE_SENTENCE);
    const headLoss = compared.comparison!.metrics.find((m) => m.key === 'headLoss')!;
    const shaftPower = compared.comparison!.metrics.find((m) => m.key === 'shaftPower')!;
    expect(headLoss).toBeDefined();
    expect(shaftPower).toBeDefined();
    // baseline = full flow, variant = throttled to half: less flow means less loss and less power.
    expect(headLoss.variant).toBeLessThan(headLoss.baseline);
    expect(shaftPower.variant).toBeLessThan(shaftPower.baseline);
  });

  it('carries no fabricated evidence and never commits to Scientific Memory — same honest gap as chemistry', () => {
    const compared = openLookingGlass(COMPARE_SENTENCE);
    expect(compared.comparison!.evidence).toBeNull();
    expect(compared.commitComparisonToMemory()).toBeNull();
  });
});

describe('Looking Glass — describeEntityMoment on hydraulics: before/after/why through the shared C3 bridge', () => {
  it('reports scalarsBefore/scalarsNow as IDENTICAL at a steady tick — an honest "nothing changed", not an error', () => {
    const session = openLookingGlass(HYDRAULICS_SENTENCE);
    const moment = session.describeEntityMoment(3)!;
    expect(moment).not.toBeNull();
    expect(moment.scalarsBefore).not.toBeNull();
    expect(moment.scalarsNow.headLoss).toBeCloseTo(moment.scalarsBefore!.headLoss, 10);
  });

  it('why cites the real recorded cause, never an invented narrative', () => {
    const session = openLookingGlass(HYDRAULICS_SENTENCE);
    const moment = session.describeEntityMoment(2)!;
    expect(moment.why).toBe('steady-state-recompute');
  });

  it('demonstrates the DEFAULT construction parameters are the ones actually driving the real outputs', () => {
    const session = openLookingGlass(HYDRAULICS_SENTENCE);
    const moment = session.describeEntityMoment(1)!;
    expect(moment.scalarsNow.volumetricFlow).toBeCloseTo(PUMP_PIPE_DEFAULTS.volumetricFlow, 10);
  });
});
