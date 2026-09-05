import { describe, expect, it } from 'vitest';
import { seriesSparkline } from '../components/visual-simulation/InvestorDemoScreen';
import { runLabScenario } from '../core/experimentFabric/labSession';

/**
 * GENESIS INVESTOR DEMO — focused tests for the one pure helper this screen
 * adds (`seriesSparkline`) and for its binding to a REAL Scenario Engine
 * run. No scientific logic lives in the component; this only proves the
 * chart never fabricates a line from missing or single-point data, and that
 * a real completed run's own series produces a valid, real-data-derived path.
 */
describe('InvestorDemoScreen — seriesSparkline (real instrument chart data binding)', () => {
  it('1. returns an empty path for no data (chart must render NOT_MODELED, not a fake line)', () => {
    expect(seriesSparkline([])).toBe('');
  });

  it('2. returns an empty path for a single data point (a line needs at least two)', () => {
    expect(seriesSparkline([5])).toBe('');
  });

  it('3. produces a path that starts with an absolute moveto and only lineto afterwards', () => {
    const path = seriesSparkline([1, 4, 2, 8]);
    const commands = path.split(' L ');
    expect(commands[0]!.startsWith('M ')).toBe(true);
    expect(commands.length).toBe(4);
  });

  it('4. scales every point against the real maximum of the series, never an invented ceiling', () => {
    const path = seriesSparkline([0, 10], 100, 32);
    // Max value (10) must map to y=0 (top); zero must map to y=height (bottom).
    expect(path).toBe('M 0.0 32.0 L 100.0 0.0');
  });

  it('5. a flat real series (no variation) never divides by zero and stays on the baseline', () => {
    const path = seriesSparkline([0, 0, 0]);
    expect(path).toBe('M 0.0 32.0 L 50.0 32.0 L 100.0 32.0');
  });

  it('6. binds to the REAL day-by-day series of an actual completed Scenario Engine run', () => {
    const run = runLabScenario(0);
    expect(run.status).toBe('COMPLETED');
    const infectious = run.series.map((s) => s.infectious);
    const path = seriesSparkline(infectious);
    // A 60-day real run always has far more than 2 samples, so the chart must never be empty.
    expect(run.series.length).toBeGreaterThan(2);
    expect(path.length).toBeGreaterThan(0);
    expect(path.startsWith('M ')).toBe(true);
  });
});
