import type { RouteRequirement } from "@shared/schema";
import { calculateEmissionsKg } from "../services/environmentalCalculation";

// Pure, deterministic cost aggregation over the requirements an AI Route Analysis
// (or a partner catalog match) attached to a route. Kept side-effect free so it can
// be unit tested without any DB/network dependency.

export interface CostBreakdownLine {
  category: string;
  countryCode: string | null;
  title: string;
  isMandatory: boolean;
  estimatedCostEur: number;
}

export interface CostBreakdown {
  lines: CostBreakdownLine[];
  totalMandatoryEur: number;
  totalOptionalEur: number;
  totalEur: number;
  byCategory: Record<string, number>;
}

export function calculateCostBreakdown(requirements: Pick<RouteRequirement, "category" | "countryCode" | "title" | "isMandatory" | "estimatedCostEur">[]): CostBreakdown {
  const lines: CostBreakdownLine[] = requirements
    .filter((r) => r.estimatedCostEur !== null && Number(r.estimatedCostEur) > 0)
    .map((r) => ({
      category: r.category,
      countryCode: r.countryCode,
      title: r.title,
      isMandatory: r.isMandatory,
      estimatedCostEur: Number(r.estimatedCostEur),
    }));

  const totalMandatoryEur = round2(lines.filter((l) => l.isMandatory).reduce((sum, l) => sum + l.estimatedCostEur, 0));
  const totalOptionalEur = round2(lines.filter((l) => !l.isMandatory).reduce((sum, l) => sum + l.estimatedCostEur, 0));

  const byCategory: Record<string, number> = {};
  for (const line of lines) {
    byCategory[line.category] = round2((byCategory[line.category] ?? 0) + line.estimatedCostEur);
  }

  return {
    lines,
    totalMandatoryEur,
    totalOptionalEur,
    totalEur: round2(totalMandatoryEur + totalOptionalEur),
    byCategory,
  };
}

export interface FuelEstimateInput {
  distanceKm: number;
  vehicleType: string;
  fuelPriceEurPerLiter: number;
}

// Liters per 100km by vehicle class - conservative fleet averages, used only when no
// telematics-derived consumption figure is available for the vehicle.
const CONSUMPTION_L_PER_100KM: Record<string, number> = {
  van: 9,
  truck_7_5t: 14,
  truck_12t: 18,
  truck_40t: 28,
  electric: 0,
};

export function estimateFuelCostEur({ distanceKm, vehicleType, fuelPriceEurPerLiter }: FuelEstimateInput): number {
  const consumption = CONSUMPTION_L_PER_100KM[vehicleType] ?? CONSUMPTION_L_PER_100KM.van;
  const liters = (distanceKm / 100) * consumption;
  return round2(liters * fuelPriceEurPerLiter);
}

export interface TripCostSummary {
  breakdown: CostBreakdown;
  fuelEstimateEur: number;
  grandTotalEur: number;
  co2EstimateKg: number;
}

export function calculateTripCostSummary(
  requirements: Pick<RouteRequirement, "category" | "countryCode" | "title" | "isMandatory" | "estimatedCostEur">[],
  distanceKm: number,
  vehicleType: string,
  fuelPriceEurPerLiter: number,
): TripCostSummary {
  const breakdown = calculateCostBreakdown(requirements);
  const fuelEstimateEur = estimateFuelCostEur({ distanceKm, vehicleType, fuelPriceEurPerLiter });
  const co2EstimateKg = calculateEmissionsKg(distanceKm, vehicleType);

  return {
    breakdown,
    fuelEstimateEur,
    grandTotalEur: round2(breakdown.totalEur + fuelEstimateEur),
    co2EstimateKg,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
