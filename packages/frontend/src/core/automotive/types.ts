/**
 * GENESIS AUTOMOTIVE CLAIMS AUDITOR — DOMAIN CONTRACT (VERTICAL SPIKE).
 *
 * This is NOT a production estimating system. It is a vertical proof-of-
 * concept over the existing Genesis Experiment Fabric / Evidence Pack /
 * RO-Crate / replay machinery, answering: how much of a real insurance-
 * damage audit workflow can Genesis already execute once automotive
 * contracts exist?
 *
 * NO EXTERNAL AUTOMOTIVE CAPABILITY EXISTS IN THIS REPOSITORY: no vision
 * model, no VIN provider, no OEM/aftermarket catalog, no pricing feed, no
 * labor-rate source. Every field that would come from one of those is typed
 * so it can honestly be `NOT_AVAILABLE` — never a fabricated placeholder,
 * never a mock presented as a real source.
 */
export const AUTOMOTIVE_CONTRACT_VERSION = '1.0.0';

/**
 * Where a value actually came from. `TEST_FIXTURE` is reserved for values
 * explicitly constructed by a test or demo fixture — it must never be
 * produced by a code path that could run against a real assessment.
 */
export type SourceStatus = 'ACTUAL_SOURCE' | 'USER_SUPPLIED' | 'TEST_FIXTURE' | 'NOT_AVAILABLE';

/** Confidence in a visual or derived conclusion — never a bare boolean. */
export type EvidenceStatus = 'CONFIRMED' | 'POSSIBLE' | 'REQUIRES_INSPECTION' | 'NOT_AVAILABLE';

export type VinLookupStatus = 'VIN_SUPPLIED' | 'VIN_LOOKUP_AVAILABLE' | 'VIN_LOOKUP_NOT_AVAILABLE' | 'CONFIGURATION_NOT_AVAILABLE';

/** A value that carries its own provenance status; `value` is `null` exactly when `status` is `NOT_AVAILABLE`. */
export interface SourcedValue<T> {
  status: SourceStatus;
  value: T | null;
  /** Free-text description of where this came from, when known (e.g. "insurer PDF line 4"). */
  source?: string;
}

export function notAvailable<T>(): SourcedValue<T> {
  return { status: 'NOT_AVAILABLE', value: null };
}

export function sourced<T>(status: Exclude<SourceStatus, 'NOT_AVAILABLE'>, value: T, source?: string): SourcedValue<T> {
  return { status, value, ...(source === undefined ? {} : { source }) };
}

/**
 * A stable reference to a submitted photo. Genesis has no vision pipeline —
 * this type deliberately carries no pixel data and no visual interpretation.
 * It exists only as the adapter boundary a future vision provider would
 * populate `DamageFinding[]` from.
 */
export interface AutomotivePhotoInput {
  photoId: string;
  /** Filename/URL/handle — never raw pixel data. */
  reference: string;
  /** Deterministic identity derived from `reference` + metadata, not file bytes (no bytes are read). */
  fingerprint: string;
  captureMetadata?: { takenAt?: string; deviceHint?: string };
  assessmentId: string;
}

export interface VehicleIdentity {
  vinStatus: VinLookupStatus;
  /** Present only when `vinStatus` is `VIN_SUPPLIED` or better. */
  vin?: string;
  make: SourcedValue<string>;
  model: SourcedValue<string>;
  modelYear: SourcedValue<number>;
}

/** Named equipment/package flags — e.g. `"performance-package"` — never inferred from a photo alone. */
export interface VehicleConfiguration {
  trim: SourcedValue<string>;
  equipment: Readonly<Record<string, SourcedValue<'PRESENT' | 'ABSENT'>>>;
}

export type DamageSeverity = 'MINOR' | 'MODERATE' | 'SEVERE' | 'NOT_AVAILABLE';

/**
 * One visual conclusion about one part. `source` must be `USER_SUPPLIED` or
 * `TEST_FIXTURE` today — there is no real vision provider, so `ACTUAL_SOURCE`
 * must never appear here until one is actually connected.
 */
export interface DamageFinding {
  findingId: string;
  partId: string;
  photoIds: readonly string[];
  status: EvidenceStatus;
  severity: DamageSeverity;
  source: Extract<SourceStatus, 'USER_SUPPLIED' | 'TEST_FIXTURE'>;
  note?: string;
}

export interface VehiclePart {
  partId: string;
  label: string;
  oemNumber: SourcedValue<string>;
  aftermarketNumber: SourcedValue<string>;
  fitmentStatus: EvidenceStatus;
}

export type RepairAction = 'REPAIR' | 'REPLACE' | 'REQUIRES_INSPECTION';

export interface RepairOperation {
  operationId: string;
  partId: string;
  action: RepairAction;
  laborHours: SourcedValue<number>;
}

export interface LaborEntry {
  operationId: string;
  hourlyRate: SourcedValue<number>;
  currency: string;
  rateSource: SourceStatus;
}

export interface PartPrice {
  partId: string;
  unitPrice: SourcedValue<number>;
  currency: string;
  priceKind: 'OEM' | 'AFTERMARKET';
}

/**
 * One priced line — either an insurer's line or Genesis's own reference
 * line. `total` is always DERIVED by `costCalculator.ts`, never hand-set.
 */
export interface EstimateLineItem {
  lineItemId: string;
  description: string;
  partId?: string;
  quantity: number;
  unitPrice: SourcedValue<number>;
  laborHours: SourcedValue<number>;
  laborRate: SourcedValue<number>;
  paintMaterials: SourcedValue<number>;
  currency: string;
  total: SourcedValue<number>;
  source: SourceStatus;
  /**
   * Declares that this line's part choice assumes a named equipment flag is
   * in a given presence state (e.g. a "performance package" bumper assumes
   * `performance-package: PRESENT`). Optional — most lines carry none.
   */
  equipmentDependency?: { equipmentKey: string; expectedPresence: 'PRESENT' | 'ABSENT' };
}

export interface InsurerEstimate {
  estimateId: string;
  source: SourceStatus;
  suppliedDate?: string;
  currency: string;
  lineItems: readonly EstimateLineItem[];
  total: SourcedValue<number>;
  /** Fingerprint of the supplied document/structured input, for provenance — not a parsed-PDF hash unless one was actually parsed. */
  sourceHash: string;
}

export type GapCategory =
  | 'MISSING_ITEM'
  | 'PRICE_DIFFERENCE'
  | 'QUANTITY_DIFFERENCE'
  | 'LABOR_HOURS_DIFFERENCE'
  | 'LABOR_RATE_DIFFERENCE'
  | 'PAINT_MATERIAL_DIFFERENCE'
  | 'VEHICLE_CONFIGURATION_MISMATCH'
  | 'PART_SOURCE_DIFFERENCE'
  | 'REQUIRES_INSPECTION';

export type GapLabel = 'POTENTIAL_UNDERESTIMATION' | 'POTENTIAL_OMISSION' | 'CONFIGURATION_MISMATCH' | 'REQUIRES_INSPECTION' | 'NOT_COMPARABLE';

export interface GapFinding {
  gapId: string;
  category: GapCategory;
  label: GapLabel;
  detail: string;
  evidenceStatus: EvidenceStatus;
  relatedLineItemId?: string;
  relatedPartId?: string;
}

/**
 * All inputs to one audit. Nothing in this type is computed — every
 * computed value lives on `AutomotiveAuditResult`, derived by pure
 * functions in `costCalculator.ts` / `gapAnalysis.ts` / `auditResult.ts`.
 */
export interface AutomotiveAssessment {
  contractVersion: string;
  assessmentId: string;
  vehicle: VehicleIdentity;
  configuration: VehicleConfiguration;
  photos: readonly AutomotivePhotoInput[];
  findings: readonly DamageFinding[];
  parts: readonly VehiclePart[];
  operations: readonly RepairOperation[];
  labor: readonly LaborEntry[];
  prices: readonly PartPrice[];
  /** Genesis's own reference line items — same shape as an insurer's, built from the same inputs. */
  referenceLineItems: readonly EstimateLineItem[];
  taxRate: SourcedValue<number>;
  insurerEstimate: InsurerEstimate | null;
}

export type OverallAuditStatus =
  | 'POTENTIAL_UNDERESTIMATION'
  | 'NO_MEASURED_GAP'
  | 'NOT_COMPARABLE'
  | 'REQUIRES_INSPECTION'
  | 'NOT_AVAILABLE'
  | 'NOT_ENOUGH_EVIDENCE_TO_DETERMINE';

/** The one thing a UI or a report ever renders. Every section carries its own status, never a global "success". */
export interface AutomotiveAuditResult {
  contractVersion: string;
  assessmentId: string;
  vehicle: VehicleIdentity;
  vehicleStatus: EvidenceStatus;
  findings: readonly DamageFinding[];
  parts: readonly VehiclePart[];
  referenceLineItems: readonly EstimateLineItem[];
  referenceSubtotal: SourcedValue<number>;
  referenceTotal: SourcedValue<number>;
  costStatus: EvidenceStatus;
  laborStatus: EvidenceStatus;
  insurerEstimateStatus: EvidenceStatus;
  insurerTotal: SourcedValue<number>;
  difference: SourcedValue<number>;
  gaps: readonly GapFinding[];
  overall: OverallAuditStatus;
}
