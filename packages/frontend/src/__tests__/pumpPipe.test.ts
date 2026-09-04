import { describe, expect, it } from 'vitest';
import { buildPumpPipeModel, frictionFactor, PUMP_PIPE_DEFAULTS } from '../core/engineeringGraph/pumpPipe';

describe('frictionFactor (Swamee-Jain / laminar)', () => {
  it('uses 64/Re in the laminar regime (Re<2300)', () => {
    expect(frictionFactor(1000, 0.001)).toBeCloseTo(64 / 1000, 9);
  });

  it('turbulent factor is in the physically expected 0.01–0.05 band for commercial steel', () => {
    const f = frictionFactor(634000, 0.00045);
    expect(f).toBeGreaterThan(0.01);
    expect(f).toBeLessThan(0.05);
  });
});

describe('buildPumpPipeModel — textbook baseline (water through 0.1 m steel pipe)', () => {
  it('computes a hand-verified chain: v≈6.37, Re≈634k, h_f≈35.6 m, shaftPower≈32 kW', () => {
    const m = buildPumpPipeModel();
    expect(m.getValue('flowVelocity')).toBeCloseTo(6.366, 2);
    expect(m.getValue('reynolds')).toBeGreaterThan(600000);
    expect(m.getValue('reynolds')).toBeLessThan(660000);
    expect(m.getValue('headLoss')).toBeCloseTo(35.6, 0);
    expect(m.getValue('totalHead')).toBeCloseTo(45.6, 0);
    expect(m.getValue('shaftPower') / 1000).toBeCloseTo(31.9, 0);
  });

  it('friction factor is labeled empirical-model, downstream head loss inherits that ceiling', () => {
    const m = buildPumpPipeModel();
    expect(m.modelProvenance('frictionFactor')).toBe('empirical-model');
    // headLoss model is 'calculated', but it depends on frictionFactor (empirical-model) -> effective empirical-model
    expect(m.effectiveProvenance('headLoss').provenance).toBe('empirical-model');
  });

  it('shaft power provenance is capped at engineering-estimate because efficiency is an estimate', () => {
    const m = buildPumpPipeModel();
    // shaftPower depends on pumpEfficiency (engineering-estimate) -> cannot exceed it
    expect(m.effectiveProvenance('shaftPower').provenance).toBe('engineering-estimate');
  });

  it('DIAMETER dominates head-loss sensitivity with the ~D^-5 signature', () => {
    const m = buildPumpPipeModel();
    const ranking = m.sensitivityRanking('headLoss');
    expect(ranking[0].parameterId).toBe('pipeDiameter');
    // elasticity of head loss wrt diameter is close to -5 (h_f ~ Q^2/D^5)
    const dEntry = ranking.find((r) => r.parameterId === 'pipeDiameter')!;
    expect(dEntry.elasticity).toBeLessThan(-4);
    expect(dEntry.elasticity).toBeGreaterThan(-6);
  });

  it('recommends measuring efficiency for shaft power: weak provenance AND high influence', () => {
    const m = buildPumpPipeModel();
    // Pump efficiency is an engineering-estimate and shaft power is exactly inverse in it
    // (elasticity = -1), so it clears both gates -> measurement recommendation.
    const recs = m.measurementRecommendations('shaftPower');
    const ids = recs.map((r) => r.parameterId);
    expect(ids).toContain('pumpEfficiency');
    // Diameter dominates shaft power even more strongly, but it is user-provided
    // (a design choice, not an unknown) -> NOT a measurement recommendation.
    expect(ids).not.toContain('pipeDiameter');
  });

  it('does NOT over-recommend: at baseline, roughness does not dominate head loss', () => {
    const m = buildPumpPipeModel();
    // Roughness genuinely has |elasticity|~0.18 on head loss (< 0.25 threshold) and is a
    // manufacturer value for new steel -> the tool must NOT manufacture a warning for it.
    const recs = m.measurementRecommendations('headLoss');
    expect(recs.map((r) => r.parameterId)).not.toContain('pipeRoughness');
  });

  it('reducing diameter dramatically increases required shaft power (design-error surfacing)', () => {
    const m = buildPumpPipeModel();
    const base = m.getValue('shaftPower');
    m.setParameter('pipeDiameter', PUMP_PIPE_DEFAULTS.pipeDiameter * 0.8);
    expect(m.getValue('shaftPower')).toBeGreaterThan(base * 1.5); // strongly nonlinear penalty
  });

  it('exposes eight parameters as graph roots', () => {
    const m = buildPumpPipeModel();
    expect(m.parameterIds()).toHaveLength(8);
  });
});
