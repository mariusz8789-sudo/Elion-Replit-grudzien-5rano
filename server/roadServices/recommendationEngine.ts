// Pure ranking logic over route alternatives, kept separate from costCalculator.ts so
// each stays independently testable. Alternatives share the same detected requirements
// (tolls/vignettes are country-dependent, not geometry-dependent, so this is a fair
// approximation for the handful of alternative roads Mapbox returns within one corridor).

export type RecommendationStrategy = "cheapest" | "fastest" | "greenest" | "best_profit" | "lowest_risk";

export interface RouteCandidate {
  id: string;
  distanceKm: number;
  durationMinutes: number;
  totalCostEur: number; // requirements + fuel
  co2EstimateKg: number;
  criticalRequirementCount: number;
  revenueEur?: number; // optional freight revenue, enables best_profit scoring
}

export interface RankedCandidate extends RouteCandidate {
  score: number;
  profitEur: number | null;
}

export interface RecommendationResult {
  strategy: RecommendationStrategy;
  best: RankedCandidate;
  ranked: RankedCandidate[];
}

function withDerived(candidates: RouteCandidate[]): RankedCandidate[] {
  return candidates.map((c) => ({
    ...c,
    score: 0,
    profitEur: c.revenueEur !== undefined ? round2(c.revenueEur - c.totalCostEur) : null,
  }));
}

export function recommendRoute(candidates: RouteCandidate[], strategy: RecommendationStrategy): RecommendationResult {
  if (candidates.length === 0) {
    throw new Error("recommendRoute requires at least one candidate");
  }

  const scored = withDerived(candidates);

  const comparator: Record<RecommendationStrategy, (a: RankedCandidate, b: RankedCandidate) => number> = {
    cheapest: (a, b) => a.totalCostEur - b.totalCostEur,
    fastest: (a, b) => a.durationMinutes - b.durationMinutes,
    greenest: (a, b) => a.co2EstimateKg - b.co2EstimateKg,
    best_profit: (a, b) => (b.profitEur ?? -b.totalCostEur) - (a.profitEur ?? -a.totalCostEur),
    lowest_risk: (a, b) => riskScore(a) - riskScore(b),
  };

  const ranked = [...scored].sort(comparator[strategy]).map((c, idx) => ({ ...c, score: idx }));

  return { strategy, best: ranked[0], ranked };
}

// Recommends the best strategy for every dimension in one pass, useful for the driver
// summary card ("cheapest route saves EUR X, greenest saves Y kg CO2", etc.)
export function recommendAllStrategies(candidates: RouteCandidate[]): Record<RecommendationStrategy, RankedCandidate> {
  const strategies: RecommendationStrategy[] = ["cheapest", "fastest", "greenest", "best_profit", "lowest_risk"];
  const result = {} as Record<RecommendationStrategy, RankedCandidate>;
  for (const strategy of strategies) {
    result[strategy] = recommendRoute(candidates, strategy).best;
  }
  return result;
}

function riskScore(candidate: RouteCandidate): number {
  const CRITICAL_PENALTY_KM = 250; // each critical requirement is weighted like 250km of extra exposure
  return candidate.distanceKm + candidate.criticalRequirementCount * CRITICAL_PENALTY_KM;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
