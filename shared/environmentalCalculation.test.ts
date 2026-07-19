import { describe, it, expect } from "vitest";
import {
  calculateEmissionsKg,
  calculateTripEnvironmentalSummary,
  normalizeVehicleType,
  BASELINE_VEHICLE_CLASS,
} from "./environmentalCalculation";

describe("normalizeVehicleType", () => {
  it("maps every known alias to a canonical class", () => {
    expect(normalizeVehicleType("diesel_van")).toBe("van");
    expect(normalizeVehicleType("truck_40t")).toBe("truck_heavy");
    expect(normalizeVehicleType("electric_van")).toBe("electric");
    expect(normalizeVehicleType("lorry")).toBe("truck_medium");
  });

  it("falls back to the baseline class for an unknown or missing type", () => {
    expect(normalizeVehicleType("hovercraft")).toBe(BASELINE_VEHICLE_CLASS);
    expect(normalizeVehicleType(null)).toBe(BASELINE_VEHICLE_CLASS);
    expect(normalizeVehicleType(undefined)).toBe(BASELINE_VEHICLE_CLASS);
  });

  it("is idempotent - normalizing an already-canonical value returns it unchanged", () => {
    // Regression test: calculateEmissionsKg re-normalizes whatever it's given, including
    // values calculateTripEnvironmentalSummary already normalized. Every canonical class
    // must map to itself, or a second normalization pass silently falls back to the
    // baseline (this previously made every non-van vehicle type report van's emissions).
    const canonicalClasses = ["bicycle", "motorcycle", "electric", "hybrid", "car", "van", "truck_light", "truck_medium", "truck_heavy"] as const;
    for (const canonical of canonicalClasses) {
      expect(normalizeVehicleType(canonical)).toBe(canonical);
    }
  });
});

describe("calculateEmissionsKg", () => {
  it("scales linearly with distance", () => {
    const short = calculateEmissionsKg(100, "van");
    const long = calculateEmissionsKg(200, "van");
    expect(long).toBeCloseTo(short * 2, 5);
  });

  it("is zero for electric and bicycle", () => {
    expect(calculateEmissionsKg(500, "electric")).toBe(0);
    expect(calculateEmissionsKg(500, "bicycle")).toBe(0);
  });

  it("charges heavy trucks more than vans over the same distance", () => {
    expect(calculateEmissionsKg(300, "truck_40t")).toBeGreaterThan(calculateEmissionsKg(300, "van"));
  });
});

describe("calculateTripEnvironmentalSummary", () => {
  it("never reports savings for the baseline vehicle itself", () => {
    const summary = calculateTripEnvironmentalSummary(200, BASELINE_VEHICLE_CLASS);
    expect(summary.co2SavedKg).toBe(0);
    expect(summary.estimatedCo2Kg).toBe(summary.baselineCo2Kg);
  });

  it("reports real savings for a cleaner vehicle than the baseline", () => {
    const summary = calculateTripEnvironmentalSummary(200, "electric");
    expect(summary.co2SavedKg).toBeGreaterThan(0);
    expect(summary.co2SavedKg).toBe(summary.baselineCo2Kg - summary.estimatedCo2Kg);
  });

  it("never reports negative savings for a dirtier-than-baseline vehicle", () => {
    const summary = calculateTripEnvironmentalSummary(200, "truck_heavy");
    expect(summary.co2SavedKg).toBe(0);
  });

  it("always includes the methodology and version alongside any figures", () => {
    const summary = calculateTripEnvironmentalSummary(50, "van");
    expect(summary.methodology).toBeTruthy();
    expect(summary.methodologyVersion).toBeGreaterThan(0);
  });
});
