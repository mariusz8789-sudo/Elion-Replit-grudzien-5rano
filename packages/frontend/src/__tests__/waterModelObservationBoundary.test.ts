import { describe, expect, it } from 'vitest';
import { buildPumpPipeModel, PUMP_PIPE_DEFAULTS, PUMP_PIPE_COMPONENTS } from '../core/engineeringGraph/pumpPipe';

/**
 * Boundary guard for the proposed USGS streamflow observation bridge.
 *
 * USGS parameter code 00060 is discharge/streamflow: an open-channel river observation with a
 * free surface, a variable wetted cross-section and a stage-discharge rating. The Genesis
 * water model is a closed pump-pipe system in which Q is a design input, not a prediction.
 *
 * A numeric ft^3/s -> m^3/s conversion is therefore not sufficient to make the two comparable.
 * These tests pin the two facts that make an automatic bridge dishonest, so that any future
 * adapter has to confront them rather than silently convert units.
 */

/** Exact definition: 1 ft = 0.3048 m, so 1 ft^3/s = 0.3048^3 m^3/s. */
const FT3_S_TO_M3_S = 0.3048 ** 3;

describe('Genesis water model versus a river discharge observation', () => {
  it('treats volumetric flow as a design input in m^3/s and predicts no discharge at all', () => {
    const model = buildPumpPipeModel();
    const parameters = model.parameterIds();

    expect(parameters).toContain('volumetricFlow');
    expect(model.graph.getNode('volumetricFlow')?.unit).toBe('m³/s');

    // Every derived quantity the model does produce. None of them is a discharge,
    // so an observed discharge cannot falsify this model's output.
    const derived = ['flowVelocity', 'reynolds', 'frictionFactor', 'headLoss', 'totalHead', 'hydraulicPower', 'shaftPower'];
    for (const id of derived) {
      expect(model.graph.getNode(id), `${id} must exist`).toBeDefined();
      expect(parameters, `${id} must be derived, not an input`).not.toContain(id);
    }
    expect(derived).not.toContain('volumetricFlow');
  });

  it('describes a closed pump-pipe system, not an open channel', () => {
    const model = buildPumpPipeModel();
    // v = Q / (pi D^2 / 4) assumes a completely full circular conduit; a river has a free
    // surface and a stage-dependent wetted area, so this geometry does not describe it.
    expect(model.graph.getNode('flowVelocity')?.formula).toBe('v = Q / (πD²/4)');
    expect(model.graph.getNode('headLoss')?.formula).toBe('h_f = f·(L/D)·v²/(2g)');
    expect(PUMP_PIPE_COMPONENTS).toEqual(['reservoir', 'pump', 'pipe', 'outlet']);
    for (const id of ['volumetricFlow', 'flowVelocity', 'headLoss', 'shaftPower']) {
      expect(model.graph.getNode(id)?.domain).toBe('układ pompa–rurociąg');
    }
  });

  it('produces physically meaningless values when a river-scale discharge is converted and injected', () => {
    const model = buildPumpPipeModel();
    // A mid-range discharge for a large gauged river, correctly converted.
    const observedFt3PerSecond = 4000;
    const converted = observedFt3PerSecond * FT3_S_TO_M3_S;
    expect(converted).toBeCloseTo(113.267386368, 9);

    model.setParameter('volumetricFlow', converted);

    // The conversion is arithmetically correct and the model still computes, but against the
    // default 0.1 m pipe the results leave every physical regime the model is valid in.
    expect(model.getValue('pipeDiameter')).toBe(PUMP_PIPE_DEFAULTS.pipeDiameter);
    expect(model.getValue('flowVelocity')).toBeGreaterThan(1_000); // m/s — far past any pipe flow
    expect(model.getValue('headLoss')).toBeGreaterThan(1_000_000); // m — thousands of kilometres
    expect(model.getValue('shaftPower')).toBeGreaterThan(1e12); // W — terawatts

    // The model reports no error for this, which is exactly why the bridge must stay explicit:
    // a silent unit conversion would yield confident, meaningless numbers.
    expect(Number.isFinite(model.getValue('shaftPower'))).toBe(true);
  });
});
