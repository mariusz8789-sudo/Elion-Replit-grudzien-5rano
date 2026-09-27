import { notAvailable, type SourcedValue, type VehicleConfiguration, type VehicleIdentity } from './types';
import type { DamageFinding } from './types';

/**
 * EXTERNAL DATA BOUNDARIES (§20). No paid or licensed service is connected
 * in this spike. Every adapter below has a clean, typed input/output shape
 * so a real provider can be plugged in later WITHOUT touching any of the
 * calculation/comparison engines — but every one of them returns
 * `NOT_AVAILABLE` today, honestly, not a mock dressed up as a result.
 */
export const AUTOMOTIVE_EXTERNAL_ADAPTERS_VERSION = '1.0.0';

export interface VinProviderResult {
  status: 'NOT_AVAILABLE';
  reason: string;
}

/** No VIN decode service is connected. Always fails closed. */
export function lookupVehicleByVin(_vin: string): VinProviderResult {
  return { status: 'NOT_AVAILABLE', reason: 'No VIN provider is connected in this spike.' };
}

/** No vehicle-configuration/factory-options service is connected. Always fails closed. */
export function lookupVehicleConfiguration(_vin: string): { status: 'NOT_AVAILABLE'; reason: string } {
  return { status: 'NOT_AVAILABLE', reason: 'No vehicle configuration provider is connected in this spike.' };
}

export interface OemCatalogResult {
  status: 'NOT_AVAILABLE';
  reason: string;
}

/** No OEM parts catalog is connected. Never returns an invented part number. */
export function lookupOemPartNumber(_vehicle: VehicleIdentity, _partLabel: string): OemCatalogResult {
  return { status: 'NOT_AVAILABLE', reason: 'No OEM parts catalog is connected in this spike.' };
}

/** No aftermarket parts catalog is connected. Never returns an invented part number. */
export function lookupAftermarketPartNumber(_vehicle: VehicleIdentity, _partLabel: string): OemCatalogResult {
  return { status: 'NOT_AVAILABLE', reason: 'No aftermarket parts catalog is connected in this spike.' };
}

/** No pricing feed is connected. Never returns an invented price. */
export function lookupPartPrice(_partId: string, _currency: string): SourcedValue<number> {
  return notAvailable();
}

/** No labor-time database is connected. Never returns an invented duration. */
export function lookupStandardLaborHours(_operationId: string): SourcedValue<number> {
  return notAvailable();
}

/** No regional labor-rate source is connected. Never returns an invented "market average". */
export function lookupRegionalLaborRate(_region: string): SourcedValue<number> {
  return notAvailable();
}

export interface VisionFinding {
  partId: string;
  status: DamageFinding['status'];
  severity: DamageFinding['severity'];
  confidence: number;
}

/**
 * No vision model is connected. This is the adapter boundary a real
 * provider would populate `VisionFinding[]` from, converted to
 * `DamageFinding[]` by the caller — this spike never fabricates a finding
 * here, and this function must never be called from a path that then
 * labels its (nonexistent) output as `USER_SUPPLIED` or `ACTUAL_SOURCE`.
 */
export function analyzePhotoForDamage(_photoReference: string): { status: 'NOT_AVAILABLE'; reason: string; findings: readonly VisionFinding[] } {
  return { status: 'NOT_AVAILABLE', reason: 'No vision provider is connected in this spike.', findings: [] };
}

/**
 * No PDF/document parser is connected. This is the adapter boundary a real
 * parser would populate an `InsurerEstimate` from — the spike accepts only
 * already-structured `USER_SUPPLIED`/`TEST_FIXTURE` estimates today.
 */
export function parseInsurerEstimateDocument(_documentReference: string): { status: 'NOT_AVAILABLE'; reason: string } {
  return { status: 'NOT_AVAILABLE', reason: 'No PDF/document parser is connected in this spike.' };
}

/** Convenience: a `VehicleConfiguration` with every field explicitly `NOT_AVAILABLE`, for when no provider exists. */
export function unavailableVehicleConfiguration(): VehicleConfiguration {
  return { trim: notAvailable(), equipment: {} };
}
