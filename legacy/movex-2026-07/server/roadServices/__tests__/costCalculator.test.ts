import { describe, it, expect } from "vitest";
import { calculateCostBreakdown, estimateFuelCostEur, calculateTripCostSummary } from "../costCalculator";

const req = (overrides: Partial<Parameters<typeof calculateCostBreakdown>[0][number]>) => ({
  category: "vignette",
  countryCode: "AT",
  title: "Austria 10-day vignette",
  isMandatory: true,
  estimatedCostEur: "9.90",
  ...overrides,
});

describe("calculateCostBreakdown", () => {
  it("sums mandatory and optional costs separately", () => {
    const breakdown = calculateCostBreakdown([
      req({ isMandatory: true, estimatedCostEur: "10.00" }),
      req({ isMandatory: false, estimatedCostEur: "5.00", category: "parking" }),
    ]);
    expect(breakdown.totalMandatoryEur).toBe(10);
    expect(breakdown.totalOptionalEur).toBe(5);
    expect(breakdown.totalEur).toBe(15);
  });

  it("excludes zero-cost and null-cost requirements from lines", () => {
    const breakdown = calculateCostBreakdown([
      req({ estimatedCostEur: "0" }),
      req({ estimatedCostEur: null as any }),
      req({ estimatedCostEur: "12.50" }),
    ]);
    expect(breakdown.lines).toHaveLength(1);
    expect(breakdown.totalEur).toBe(12.5);
  });

  it("groups totals by category", () => {
    const breakdown = calculateCostBreakdown([
      req({ category: "toll", estimatedCostEur: "20" }),
      req({ category: "toll", estimatedCostEur: "5" }),
      req({ category: "ferry", estimatedCostEur: "50" }),
    ]);
    expect(breakdown.byCategory.toll).toBe(25);
    expect(breakdown.byCategory.ferry).toBe(50);
  });

  it("returns a zeroed breakdown for an empty requirements list", () => {
    const breakdown = calculateCostBreakdown([]);
    expect(breakdown.totalEur).toBe(0);
    expect(breakdown.lines).toHaveLength(0);
  });
});

describe("estimateFuelCostEur", () => {
  it("scales linearly with distance", () => {
    const short = estimateFuelCostEur({ distanceKm: 100, vehicleType: "van", fuelPriceEurPerLiter: 1.6 });
    const long = estimateFuelCostEur({ distanceKm: 200, vehicleType: "van", fuelPriceEurPerLiter: 1.6 });
    expect(long).toBeCloseTo(short * 2, 5);
  });

  it("returns 0 for electric vehicles", () => {
    expect(estimateFuelCostEur({ distanceKm: 500, vehicleType: "electric", fuelPriceEurPerLiter: 1.6 })).toBe(0);
  });

  it("charges heavier trucks more than vans for the same distance", () => {
    const van = estimateFuelCostEur({ distanceKm: 300, vehicleType: "van", fuelPriceEurPerLiter: 1.6 });
    const truck = estimateFuelCostEur({ distanceKm: 300, vehicleType: "truck_40t", fuelPriceEurPerLiter: 1.6 });
    expect(truck).toBeGreaterThan(van);
  });

  it("falls back to van consumption for an unknown vehicle type", () => {
    const van = estimateFuelCostEur({ distanceKm: 300, vehicleType: "van", fuelPriceEurPerLiter: 1.6 });
    const unknown = estimateFuelCostEur({ distanceKm: 300, vehicleType: "hovercraft", fuelPriceEurPerLiter: 1.6 });
    expect(unknown).toBe(van);
  });
});

describe("calculateTripCostSummary", () => {
  it("combines requirement costs and fuel into a grand total", () => {
    const summary = calculateTripCostSummary(
      [req({ estimatedCostEur: "10" })],
      100,
      "van",
      1.6,
    );
    expect(summary.grandTotalEur).toBeCloseTo(summary.breakdown.totalEur + summary.fuelEstimateEur, 5);
  });

  it("produces zero CO2 for an all-electric trip", () => {
    const summary = calculateTripCostSummary([], 500, "electric", 1.6);
    expect(summary.co2EstimateKg).toBe(0);
  });
});
