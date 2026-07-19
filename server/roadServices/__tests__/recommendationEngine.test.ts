import { describe, it, expect } from "vitest";
import { recommendRoute, recommendAllStrategies, type RouteCandidate } from "../recommendationEngine";

const candidates: RouteCandidate[] = [
  { id: "a", distanceKm: 500, durationMinutes: 300, totalCostEur: 100, co2EstimateKg: 120, criticalRequirementCount: 0 },
  { id: "b", distanceKm: 450, durationMinutes: 340, totalCostEur: 80, co2EstimateKg: 110, criticalRequirementCount: 0 },
  { id: "c", distanceKm: 600, durationMinutes: 280, totalCostEur: 140, co2EstimateKg: 150, criticalRequirementCount: 1 },
];

describe("recommendRoute", () => {
  it("throws on an empty candidate list", () => {
    expect(() => recommendRoute([], "cheapest")).toThrow();
  });

  it("picks the lowest totalCostEur for cheapest", () => {
    expect(recommendRoute(candidates, "cheapest").best.id).toBe("b");
  });

  it("picks the lowest durationMinutes for fastest", () => {
    expect(recommendRoute(candidates, "fastest").best.id).toBe("c");
  });

  it("picks the lowest co2EstimateKg for greenest", () => {
    expect(recommendRoute(candidates, "greenest").best.id).toBe("b");
  });

  it("picks the highest profit when revenue is supplied", () => {
    const withRevenue: RouteCandidate[] = [
      { ...candidates[0], revenueEur: 150 }, // profit 50
      { ...candidates[1], revenueEur: 150 }, // profit 70
      { ...candidates[2], revenueEur: 150 }, // profit 10
    ];
    const result = recommendRoute(withRevenue, "best_profit");
    expect(result.best.id).toBe("b");
    expect(result.best.profitEur).toBe(70);
  });

  it("penalizes critical requirements when ranking lowest_risk", () => {
    const result = recommendRoute(candidates, "lowest_risk");
    // candidate c has an extra critical requirement, so it should rank behind a and b
    // despite having a shorter or comparable distance
    expect(result.ranked[result.ranked.length - 1].id).toBe("c");
  });

  it("returns all candidates ranked, best first", () => {
    const result = recommendRoute(candidates, "cheapest");
    expect(result.ranked).toHaveLength(3);
    expect(result.ranked[0].totalCostEur).toBeLessThanOrEqual(result.ranked[1].totalCostEur);
    expect(result.ranked[1].totalCostEur).toBeLessThanOrEqual(result.ranked[2].totalCostEur);
  });
});

describe("recommendAllStrategies", () => {
  it("returns a best candidate for every strategy", () => {
    const result = recommendAllStrategies(candidates);
    expect(Object.keys(result).sort()).toEqual(["best_profit", "cheapest", "fastest", "greenest", "lowest_risk"].sort());
    for (const strategy of Object.keys(result)) {
      expect(result[strategy as keyof typeof result].id).toBeDefined();
    }
  });
});
