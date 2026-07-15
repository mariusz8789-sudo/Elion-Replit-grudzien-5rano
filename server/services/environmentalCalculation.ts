// Single, versioned source of truth for CO2 estimation, replacing three previously
// independent and mutually inconsistent emission-factor tables (server/routes.ts's
// /api/calculate-route, client BookingFlow.tsx, server/roadServices/costCalculator.ts -
// each keyed differently and none agreeing with the others). Every "CO2 saved" figure
// this service produces is always paired with the baseline it was compared against - never
// shown standalone.

export const ECO_METHODOLOGY = "movex-eco-v1";
export const ECO_METHODOLOGY_VERSION = 1;

export type CanonicalVehicleClass =
  | "bicycle" | "motorcycle" | "electric" | "hybrid" | "car"
  | "van" | "truck_light" | "truck_medium" | "truck_heavy";

// kg CO2 per km, well-to-wheel estimates for a typical loaded commercial vehicle in each
// class. Deliberately conservative/approximate - this is the single number every caller in
// the app must use, so it can be corrected in one place as better data becomes available.
export const EMISSION_FACTORS_KG_PER_KM: Record<CanonicalVehicleClass, number> = {
  bicycle: 0,
  electric: 0,
  motorcycle: 0.1,
  hybrid: 0.13,
  car: 0.12,
  van: 0.27,
  truck_light: 0.45,
  truck_medium: 0.6,
  truck_heavy: 0.9,
};

// The comparison point for "CO2 saved" claims: what a standard dedicated van delivery
// would have emitted, absent any consolidation/sharing/optimization.
export const BASELINE_VEHICLE_CLASS: CanonicalVehicleClass = "van";

// Maps every vehicle-type string actually used elsewhere in the app (vehicles.type,
// Road Services' truck_7_5t/12t/40t, the old ad-hoc electric_van/diesel_truck names, etc.)
// onto the canonical set above, so there is exactly one factor table in the codebase.
const VEHICLE_TYPE_ALIASES: Record<string, CanonicalVehicleClass> = {
  bicycle: "bicycle",
  motorcycle: "motorcycle",
  electric: "electric",
  electric_van: "electric",
  electric_truck: "electric",
  hybrid: "hybrid",
  hybrid_van: "hybrid",
  car: "car",
  petrol_car: "car",
  van: "van",
  "small-van": "van",
  diesel_van: "van",
  pickup: "van",
  truck: "truck_medium",
  lorry: "truck_medium",
  box_truck: "truck_medium",
  diesel_truck: "truck_medium",
  "large-truck": "truck_heavy",
  truck_7_5t: "truck_light",
  truck_12t: "truck_medium",
  truck_40t: "truck_heavy",
  // Identity entries so an already-canonical value stays unchanged if it's ever
  // re-normalized (e.g. calculateEmissionsKg normalizing a value that
  // calculateTripEnvironmentalSummary already normalized) instead of silently falling
  // back to the baseline class.
  truck_light: "truck_light",
  truck_medium: "truck_medium",
  truck_heavy: "truck_heavy",
};

export function normalizeVehicleType(rawType: string | null | undefined): CanonicalVehicleClass {
  if (!rawType) return BASELINE_VEHICLE_CLASS;
  return VEHICLE_TYPE_ALIASES[rawType.toLowerCase()] ?? BASELINE_VEHICLE_CLASS;
}

export function calculateEmissionsKg(distanceKm: number, vehicleType: string | null | undefined): number {
  const factor = EMISSION_FACTORS_KG_PER_KM[normalizeVehicleType(vehicleType)];
  return round2(distanceKm * factor);
}

export interface TripEnvironmentalSummary {
  distanceKm: number;
  vehicleType: CanonicalVehicleClass;
  estimatedCo2Kg: number;
  baselineVehicleType: CanonicalVehicleClass;
  baselineCo2Kg: number;
  co2SavedKg: number;
  methodology: string;
  methodologyVersion: number;
}

// The one function every caller should use: computes the actual/estimated emissions for
// the trip AND the baseline it's compared against in the same call, so "CO2 saved" can
// never be produced or displayed without its baseline alongside it.
export function calculateTripEnvironmentalSummary(distanceKm: number, vehicleType: string | null | undefined): TripEnvironmentalSummary {
  const normalizedType = normalizeVehicleType(vehicleType);
  const estimatedCo2Kg = calculateEmissionsKg(distanceKm, normalizedType);
  const baselineCo2Kg = calculateEmissionsKg(distanceKm, BASELINE_VEHICLE_CLASS);
  return {
    distanceKm: round2(distanceKm),
    vehicleType: normalizedType,
    estimatedCo2Kg,
    baselineVehicleType: BASELINE_VEHICLE_CLASS,
    baselineCo2Kg,
    co2SavedKg: round2(Math.max(0, baselineCo2Kg - estimatedCo2Kg)),
    methodology: ECO_METHODOLOGY,
    methodologyVersion: ECO_METHODOLOGY_VERSION,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
