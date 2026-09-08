import { describe, expect, it } from 'vitest';
import { admitParameterInquiry, admitWorldQuestion } from '../core/agent/discoveryAdmission';
import { CAPABILITY_CODE, SOLVER_CAPABILITY_BY_SCENARIO_KIND } from '../core/worldModel/capability/solverCapability';
import { listRouterModels } from '../core/experimentFabric/router';

/**
 * ADMISSION — "can Genesis answer this at all", before anything is searched.
 *
 * The behaviour that matters is the refusal: a question Genesis has no solver
 * for must come back as a NAMED GAP, not as a search over whatever levers
 * happen to exist. Neither investigation loop checked this before this module.
 */
describe('discovery admission', () => {
  it('admits a flood question as APPROXIMATION and carries the registry caveat verbatim', () => {
    const admission = admitWorldQuestion('What happens to peak flood depth in this city after heavy rainfall?');
    expect(admission.status).toBe('APPROXIMATION');
    // FLOOD is PARTIALLY_MODELLED, so the caveat must travel — that is the
    // honesty the registry exists to carry.
    expect(admission.caveat).toBe(SOLVER_CAPABILITY_BY_SCENARIO_KIND.FLOOD.caveat);
    expect(admission.caveat).toBeTruthy();
    expect(admission.missing).toHaveLength(0);
  });

  it('REFUSES a question whose hazard Genesis has no model for, and names what is missing', () => {
    const admission = admitWorldQuestion('How far inland would the tsunami wave reach on this coast?');
    expect(admission.status).toBe('NOT_MODELLED');
    // The refusal is only useful if it says what would be needed.
    expect(admission.missing.length).toBeGreaterThan(0);
    expect(admission.missing).toEqual([...(SOLVER_CAPABILITY_BY_SCENARIO_KIND.TSUNAMI.missing ?? [])]);
  });

  it('refuses an unclassifiable question rather than guessing a scenario kind', () => {
    const admission = admitWorldQuestion('Please make it nicer.');
    expect(admission.status).toBe('NOT_MODELLED');
    expect(admission.missing.length).toBeGreaterThan(0);
  });

  it('never returns NOT_MODELLED or BLOCKED without naming what is missing', () => {
    // The property that makes a refusal actionable, held across every scenario
    // kind the registry declares rather than on a hand-picked example.
    for (const kind of Object.keys(SOLVER_CAPABILITY_BY_SCENARIO_KIND)) {
      const entry = SOLVER_CAPABILITY_BY_SCENARIO_KIND[kind as keyof typeof SOLVER_CAPABILITY_BY_SCENARIO_KIND];
      if (entry.capability !== CAPABILITY_CODE.NOT_MODELLED) continue;
      expect(entry.missing?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it('BLOCKS an inquiry naming a model the router does not carry — distinct from "no model exists"', () => {
    const admission = admitParameterInquiry('no-such-model-anywhere');
    expect(admission.status).toBe('BLOCKED');
    expect(admission.missing).toHaveLength(1);
    // BLOCKED and NOT_MODELLED must stay distinct: one is a runtime gap, the
    // other a science gap, and they call for different fixes.
    expect(admission.status).not.toBe('NOT_MODELLED');
  });

  it('admits a real registered router model as REAL and carries its own stated bounds', () => {
    // Taken from the router's own registry rather than written from memory, so
    // this test cannot pass against a model id that no longer exists.
    const real = listRouterModels()[0]!;
    const admission = admitParameterInquiry(real.id);
    expect(admission.status).toBe('REAL');
    expect(admission.missing).toHaveLength(0);
    expect(admission.caveat).toBe(real.rationale);
  });

  it('admits every model the router actually carries — no id in the registry is refused', () => {
    for (const model of listRouterModels()) {
      expect(admitParameterInquiry(model.id).status).toBe('REAL');
    }
  });
});
