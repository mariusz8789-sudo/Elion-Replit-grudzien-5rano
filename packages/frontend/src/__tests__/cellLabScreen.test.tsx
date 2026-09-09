import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CellCultureLabSim,
  CellLabScreen,
  deriveArmStats,
  TREATMENTS,
  type TreatmentId,
} from '../components/visual-simulation/CellLabScreen';
import { CELL_CYCLE_DEFAULTS, CULTURE_STATE_CODE } from '../core/worldModel/domains/cellCycle';

/**
 * VIRTUAL CELL LAB — Control vs Treatment (P0, GENESIS C2 next-sprint directive).
 *
 * These exercise the REAL solver path (`rk4CellCycleStep`, via `CellCultureLabSim`), not a mock:
 * a bug here would mean the on-screen numbers stopped being a real reading of the model.
 */

function runFor(sim: CellCultureLabSim, treatment: TreatmentId, dose: number, hours: number) {
  sim.init(800, 600);
  let stats = sim.getStats();
  let guard = 0;
  while ((stats.hoursElapsed ?? 0) < hours && guard < 5000) {
    sim.update(0.05, { treatment, dose });
    stats = sim.getStats();
    guard++;
  }
  return stats;
}

describe('CellCultureLabSim — real G1/S/G2M solver, not decoration', () => {
  it('exposes exactly the four real levers the Discovery Loop catalogue already declares', () => {
    expect(Object.keys(TREATMENTS).sort()).toEqual(
      ['cytotoxic', 'mitogen', 's-phase-inhibitor', 'vessel-capacity'].sort(),
    );
  });

  it('dose 0 leaves the treatment arm identical to control — no substance applied', () => {
    const sim = new CellCultureLabSim();
    const stats = runFor(sim, 'mitogen', 0, 48);
    expect(stats.treatmentTotal).toBeCloseTo(stats.controlTotal, 6);
  });

  it('mitogen at full dose (shorter G1) grows the treatment arm faster than control', () => {
    const sim = new CellCultureLabSim();
    const stats = runFor(sim, 'mitogen', 1, 96);
    expect(stats.treatmentTotal).toBeGreaterThan(stats.controlTotal);
  });

  it('s-phase inhibitor at full dose (longer S) grows the treatment arm slower than control', () => {
    const sim = new CellCultureLabSim();
    const stats = runFor(sim, 's-phase-inhibitor', 1, 96);
    expect(stats.treatmentTotal).toBeLessThan(stats.controlTotal);
  });

  it('cytotoxic agent at full dose reduces growth and accumulates real, non-zero deaths', () => {
    const sim = new CellCultureLabSim();
    const stats = runFor(sim, 'cytotoxic', 1, 96);
    expect(stats.treatmentTotal).toBeLessThan(stats.controlTotal);
    expect(stats.treatmentDeaths).toBeGreaterThan(0);
    expect(stats.controlDeaths).toBe(0); // control's death rate is the model's own zero default
  });

  it('a larger vessel raises the treatment arm above control once contact inhibition would otherwise bind', () => {
    const sim = new CellCultureLabSim();
    const stats = runFor(sim, 'vessel-capacity', 1, 200);
    expect(stats.treatmentTotal).toBeGreaterThan(stats.controlTotal);
  });

  it('switching treatment mid-run relaunches both cultures from t=0, never mixing two histories', () => {
    const sim = new CellCultureLabSim();
    runFor(sim, 'mitogen', 1, 48);
    sim.update(0.05, { treatment: 'cytotoxic', dose: 1 });
    expect(sim.getStats().hoursElapsed).toBeLessThan(1);
  });

  it('never advances the simulated clock past the declared 240h horizon', () => {
    const sim = new CellCultureLabSim();
    runFor(sim, 'mitogen', 1, 240);
    for (let i = 0; i < 50; i++) sim.update(0.05, { treatment: 'mitogen', dose: 1 });
    expect(sim.getStats().hoursElapsed).toBeLessThanOrEqual(240);
  });

  it('reset() restarts the current treatment/dose from t=0', () => {
    const sim = new CellCultureLabSim();
    runFor(sim, 'mitogen', 1, 48);
    sim.reset?.();
    expect(sim.getStats().hoursElapsed).toBe(0);
  });
});

describe('deriveArmStats — pure derived-stat formulas', () => {
  it('phase fractions sum to 1 and occupancy/stateLabel reflect the real thresholds', () => {
    const arm = {
      phases: { g1: 495_000, s: 400_000, g2m: 100_000 },
      params: { ...CELL_CYCLE_DEFAULTS, carryingCapacityCells: 1_000_000 },
      history: [],
      hoursElapsed: 100,
      netGrowthPerHour: 5,
      cumulativeDeaths: 0,
    };
    const stats = deriveArmStats(arm);
    expect(stats.g1Fraction + stats.sFraction + stats.g2mFraction).toBeCloseTo(1, 9);
    expect(stats.occupancyFraction).toBeCloseTo(0.995, 3);
    expect(stats.stateCode).toBe(CULTURE_STATE_CODE.ARRESTED);
  });
});

describe('CellLabScreen — markup contract (SIMULATION badge, readout, honesty)', () => {
  it('always shows the SIMULATION provenance badge and MODEL_ESTIMATE grounding', () => {
    const markup = renderToStaticMarkup(<CellLabScreen />);
    expect(markup).toContain('data-testid="cell-lab-provenance-badge"');
    expect(markup).toContain('SIMULATION');
    expect(markup).toContain('MODEL_ESTIMATE');
  });

  it('renders a Control vs Treatment readout with both arms present', () => {
    const markup = renderToStaticMarkup(<CellLabScreen />);
    expect(markup).toContain('data-testid="cell-lab-control"');
    expect(markup).toContain('data-testid="cell-lab-treatment-arm"');
    expect(markup).toContain('CONTROL');
    expect(markup).toContain('TREATMENT');
  });

  it('discloses the real model simplification (dose applied at t=0) rather than hiding it', () => {
    const markup = renderToStaticMarkup(<CellLabScreen />);
    expect(markup).toContain('data-testid="cell-lab-honesty"');
    expect(markup).toContain('representative textbook values');
    expect(markup).toContain('12h');
  });

  it('embeds the real Discovery Loop panel pre-selected onto this domain (P1)', () => {
    const markup = renderToStaticMarkup(<CellLabScreen />);
    expect(markup).toContain('wd-panel');
  });
});
