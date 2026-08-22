import { describe, expect, it } from 'vitest';
import {
  evaluateHospitalState,
  unmetCareMortalityFactor,
  hospitalStatusFor,
  peakHospitalPressure,
  DEFAULT_HOSPITAL_CAPACITY,
  HOSPITAL_NOT_MODELED,
  type HospitalCapacityParams,
} from '../core/simulation/hospitalResource';

const caps = (over: Partial<HospitalCapacityParams> = {}): HospitalCapacityParams => ({
  ...DEFAULT_HOSPITAL_CAPACITY,
  ...over,
});

describe('Hospital & Resource model — capacity accounting over the real epidemic model', () => {
  it('never invents patients: required care equals what the model reported', () => {
    const s = evaluateHospitalState({ day: 3, hospitalizedNow: 7 }, caps());
    expect(s.requiredCare).toBe(7);
    expect(s.occupiedBeds + s.occupiedIcu + s.unmetCare).toBe(7);
  });

  it('is deterministic — same input yields an identical state', () => {
    const a = evaluateHospitalState({ day: 5, hospitalizedNow: 19 }, caps());
    const b = evaluateHospitalState({ day: 5, hospitalizedNow: 19 }, caps());
    expect(a).toEqual(b);
  });

  it('an empty system is NORMAL with zero occupancy', () => {
    const s = evaluateHospitalState({ day: 0, hospitalizedNow: 0 }, caps());
    expect(s.status).toBe('NORMAL');
    expect(s.bedOccupancy).toBe(0);
    expect(s.icuOccupancy).toBe(0);
    expect(s.unmetCare).toBe(0);
  });

  it('routes an ICU-share of admissions to ICU beds', () => {
    // 20 pacjentów, udział ICU 0.25 => 5 do ICU, 15 na łóżka ogólne.
    const s = evaluateHospitalState({ day: 2, hospitalizedNow: 20 }, caps({ totalBeds: 40, icuBeds: 10, icuShareOfAdmissions: 0.25 }));
    expect(s.occupiedIcu).toBe(5);
    expect(s.occupiedBeds).toBe(15);
    expect(s.unmetCare).toBe(0);
  });

  it('ICU overflow falls back to a general bed before counting as unmet care', () => {
    // 20 pacjentów, 50% ICU => 10 potrzebuje ICU, ale są tylko 2 łóżka ICU.
    // 8 nadmiarowych schodzi na łóżka ogólne (10 wolnych) => nikt bez opieki.
    const s = evaluateHospitalState({ day: 4, hospitalizedNow: 20 }, caps({ totalBeds: 20, icuBeds: 2, icuShareOfAdmissions: 0.5 }));
    expect(s.occupiedIcu).toBe(2);
    expect(s.occupiedBeds).toBe(18);
    expect(s.unmetCare).toBe(0);
  });

  it('reports unmet care only when BOTH ICU and general beds are exhausted', () => {
    const s = evaluateHospitalState({ day: 9, hospitalizedNow: 30 }, caps({ totalBeds: 10, icuBeds: 4, icuShareOfAdmissions: 0.2 }));
    // 6 do ICU -> 4 przyjęte, 2 nadmiar; ogólne: 24 + 2 = 26 wobec 10 łóżek.
    expect(s.occupiedIcu).toBe(4);
    expect(s.occupiedBeds).toBe(10);
    expect(s.unmetCare).toBe(16);
    expect(s.status).toBe('CRITICAL');
  });

  it('occupancy never exceeds 1 — overflow becomes unmet care, not >100% beds', () => {
    const s = evaluateHospitalState({ day: 6, hospitalizedNow: 500 }, caps({ totalBeds: 10, icuBeds: 2 }));
    expect(s.bedOccupancy).toBeLessThanOrEqual(1);
    expect(s.icuOccupancy).toBeLessThanOrEqual(1);
    expect(s.unmetCare).toBeGreaterThan(0);
  });

  it('escalates status with occupancy and goes CRITICAL on any unmet care', () => {
    expect(hospitalStatusFor(0.3, 0.2, 0)).toBe('NORMAL');
    expect(hospitalStatusFor(0.65, 0.2, 0)).toBe('WARNING');
    expect(hospitalStatusFor(0.85, 0.2, 0)).toBe('HIGH');
    expect(hospitalStatusFor(0.97, 0.2, 0)).toBe('CRITICAL');
    // Brak miejsca przebija każde obłożenie.
    expect(hospitalStatusFor(0.1, 0.1, 3)).toBe('CRITICAL');
  });

  it('handles zero-capacity facilities without dividing by zero', () => {
    const s = evaluateHospitalState({ day: 1, hospitalizedNow: 5 }, caps({ totalBeds: 0, icuBeds: 0 }));
    expect(Number.isFinite(s.bedOccupancy)).toBe(true);
    expect(Number.isFinite(s.icuOccupancy)).toBe(true);
    expect(s.unmetCare).toBe(5);
  });

  it('mortality feedback is OFF by default — adding this layer cannot silently change epidemic results', () => {
    const overloaded = evaluateHospitalState({ day: 8, hospitalizedNow: 200 }, caps({ totalBeds: 5, icuBeds: 1 }));
    expect(overloaded.unmetCare).toBeGreaterThan(0);
    expect(unmetCareMortalityFactor(overloaded, caps())).toBe(1);
  });

  it('with feedback enabled the factor scales with the share left without care', () => {
    const params = caps({ totalBeds: 5, icuBeds: 0, icuShareOfAdmissions: 0, mortalityFeedback: true, unmetCareMortalityMultiplier: 3 });
    const s = evaluateHospitalState({ day: 8, hospitalizedNow: 10 }, params);
    expect(s.unmetCare).toBe(5); // połowa kohorty bez opieki
    // 1 + (3-1) * 0.5 = 2
    expect(unmetCareMortalityFactor(s, params)).toBeCloseTo(2, 10);
  });

  it('feedback stays neutral when capacity is sufficient, even if enabled', () => {
    const params = caps({ totalBeds: 100, icuBeds: 50, mortalityFeedback: true });
    const s = evaluateHospitalState({ day: 8, hospitalizedNow: 10 }, params);
    expect(s.unmetCare).toBe(0);
    expect(unmetCareMortalityFactor(s, params)).toBe(1);
  });

  it('summarises peak pressure across a day series', () => {
    const params = caps({ totalBeds: 10, icuBeds: 2, icuShareOfAdmissions: 0.2 });
    const series = [2, 6, 14, 30, 4].map((n, i) => evaluateHospitalState({ day: i, hospitalizedNow: n }, params));
    const peak = peakHospitalPressure(series);
    expect(peak.peakBedOccupancy).toBeCloseTo(1, 10);
    expect(peak.totalUnmetCareDays).toBeGreaterThan(0);
    expect(peak.firstCriticalDay).not.toBeNull();
    // Pierwszy krytyczny dzień musi być realnym dniem z serii.
    expect(series.some((s) => s.day === peak.firstCriticalDay)).toBe(true);
  });

  it('declares what it does NOT model instead of silently faking it', () => {
    expect(HOSPITAL_NOT_MODELED).toContain('staff-availability');
    expect(HOSPITAL_NOT_MODELED).toContain('consumables');
    expect(HOSPITAL_NOT_MODELED.length).toBeGreaterThan(0);
  });
});
