import { describe, expect, it } from 'vitest';
import { EpidemicCity3DSim } from '../core/three/epidemicCity3D';
import { DEFAULT_HOSPITAL_CAPACITY, evaluateHospitalState } from '../core/simulation/hospitalResource';

/**
 * Dowód, że pole hospitalne w getStats() nie jest wystawą — jest tą samą
 * funkcją, którą pokrywają testy Scientific Core, uruchomioną na REALNEJ
 * liczbie hospitalizowanych z tego samego kroku silnika.
 */
describe('EpidemicCity3DSim — hospital state is real, not decorative', () => {
  it('matches evaluateHospitalState() called independently on the same day', () => {
    const sim = new EpidemicCity3DSim({ nAgents: 260, initialInfected: 5, seed: 4242, severeRate: 0.3 });
    for (let i = 0; i < 60; i++) sim.step();
    const stats = sim.getStats();
    const independent = evaluateHospitalState(
      { day: stats.dzien, hospitalizedNow: stats.hospitalizowani },
      DEFAULT_HOSPITAL_CAPACITY,
    );
    expect(stats.hosp_occupied_beds).toBe(independent.occupiedBeds);
    expect(stats.hosp_occupied_icu).toBe(independent.occupiedIcu);
    expect(stats.hosp_unmet_care).toBe(independent.unmetCare);
    expect(stats.hosp_total_beds).toBe(DEFAULT_HOSPITAL_CAPACITY.totalBeds);
    expect(stats.hosp_icu_beds).toBe(DEFAULT_HOSPITAL_CAPACITY.icuBeds);
  });

  it('never invents patients: occupied + unmet always equals the real hospitalised count', () => {
    const sim = new EpidemicCity3DSim({ nAgents: 260, initialInfected: 8, seed: 777, severeRate: 0.4 });
    for (let i = 0; i < 90; i++) {
      sim.step();
      const stats = sim.getStats();
      const total = stats.hosp_occupied_beds + stats.hosp_occupied_icu + stats.hosp_unmet_care;
      expect(total).toBe(stats.hospitalizowani);
    }
  });

  it('reaches CRITICAL under real overload, and CRITICAL always means occupancy >= 0.95 or unmet care', () => {
    // Populacja duża, capacity domyślna mała -> realne przeciążenie.
    const sim = new EpidemicCity3DSim({ nAgents: 900, initialInfected: 40, seed: 4242, severeRate: 0.6 });
    let sawCritical = false;
    let sawUnmetCare = false;
    for (let i = 0; i < 200; i++) {
      sim.step();
      const stats = sim.getStats();
      if (stats.hosp_status_code === 3) {
        sawCritical = true;
        const worst = Math.max(stats.hosp_bed_occupancy_pct, stats.hosp_icu_occupancy_pct) / 100;
        expect(stats.hosp_unmet_care > 0 || worst >= 0.95).toBe(true);
      }
      if (stats.hosp_unmet_care > 0) sawUnmetCare = true;
    }
    expect(sawCritical).toBe(true);
    expect(sawUnmetCare).toBe(true);
  });

  it('is deterministic: same seed, same hospital trajectory', () => {
    const run = () => {
      const sim = new EpidemicCity3DSim({ nAgents: 260, initialInfected: 5, seed: 999, severeRate: 0.3 });
      const series: number[] = [];
      for (let i = 0; i < 40; i++) { sim.step(); series.push(sim.getStats().hosp_occupied_beds); }
      return series;
    };
    expect(run()).toEqual(run());
  });
});
