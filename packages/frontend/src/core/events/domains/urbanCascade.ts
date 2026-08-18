/**
 * DOMENA (PRZYGOTOWANIE): URBAN CASCADE — WYŁĄCZNIE TYPY I KONTRAKTY.
 *
 * Kaskada infrastruktury: POWER → WATER → HOSPITAL → TRANSPORT → POPULATION.
 * Tu definiujemy tylko NEUTRALNE typy zdarzeń i kształt ich `parameters`, aby
 * przyszłe reguły mogły je wystawiać spójnie. NIE MA tu modeli fizycznych,
 * solverów ani „fake simulation" — dopiero gdy powstanie realny model, domena
 * dostanie regułę/adapter. Do tego czasu to jest gotowy kontrakt.
 */

export const EVENT_POWER_FAILURE = 'power.failure';
export const EVENT_WATER_PUMP_FAILURE = 'water.pumpfailure';
export const EVENT_WATER_SHORTAGE = 'water.shortage';
export const EVENT_HOSPITAL_CAPACITY_REDUCTION = 'hospital.capacityreduction';
export const EVENT_EMERGENCY_RESPONSE = 'emergency.response';

export interface PowerFailureParams extends Record<string, unknown> {
  gridNodeId: string | number;
  affectedLoadFraction?: number; // 0..1 opcjonalnie
}
export interface WaterPumpFailureParams extends Record<string, unknown> {
  pumpId: string | number;
  dependsOnPowerNode?: string | number;
}
export interface WaterShortageParams extends Record<string, unknown> {
  regionId: string | number;
  deficitFraction?: number; // 0..1
}
export interface HospitalCapacityReductionParams extends Record<string, unknown> {
  hospitalId: string | number;
  capacityBefore?: number;
  capacityAfter?: number;
}
export interface EmergencyResponseParams extends Record<string, unknown> {
  responderId: string | number;
  targetEventId?: string;
}

/** Deklaracje typów (bez modeli) — do rejestracji w EventTypeRegistry (Etap 7). */
export const URBAN_CASCADE_TYPE_DECLS = [
  { type: EVENT_POWER_FAILURE, domain: 'urban-cascade', requiredParams: ['gridNodeId'], description: 'A power grid node fails.' },
  { type: EVENT_WATER_PUMP_FAILURE, domain: 'urban-cascade', requiredParams: ['pumpId'], description: 'A water pump fails (often downstream of power).' },
  { type: EVENT_WATER_SHORTAGE, domain: 'urban-cascade', requiredParams: ['regionId'], description: 'A region experiences a water deficit.' },
  { type: EVENT_HOSPITAL_CAPACITY_REDUCTION, domain: 'urban-cascade', requiredParams: ['hospitalId'], description: 'Hospital capacity drops (e.g. power/water dependency).' },
  { type: EVENT_EMERGENCY_RESPONSE, domain: 'urban-cascade', requiredParams: ['responderId'], description: 'An emergency response is dispatched.' },
] as const;
