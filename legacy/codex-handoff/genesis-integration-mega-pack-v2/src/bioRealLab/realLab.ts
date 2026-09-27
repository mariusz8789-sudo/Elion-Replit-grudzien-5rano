/** Kept for backward-compatible API shape. For the canonical, cross-package safety
 * model use `../deviceSafety/deviceSafetyContract.js` and map via
 * `../deviceSafety/legacyAdapters.js::fromRealLabMode` (fix area 2). */
export type RealLabMode = "SYNTHETIC" | "READ_ONLY_TELEMETRY" | "SHADOW";

export interface DeviceCapability {
  id: string;
  label: string;
  direction: "READ";
  units?: string;
}

export interface DeviceManifest {
  adapterId: string;
  hardwareIdentity: string;
  firmwareVersion?: string;
  softwareVersion?: string;
  calibrationRef?: string;
  capabilities: DeviceCapability[];
  emergencyStopPresent: boolean;
  validated: boolean;
}

export interface TelemetrySample {
  capabilityId: string;
  value: number | string | boolean | null;
  unit?: string;
  observedAt: string;
  provenanceRefs: string[];
}

export interface RealLabAdapter {
  readonly mode: RealLabMode;
  manifest(): Promise<DeviceManifest>;
  readTelemetry(): Promise<TelemetrySample[]>;
  close(): Promise<void>;
}

export type RealDeviceCommand = never;

export function actuationUnavailable(): never {
  throw new Error("Generic Genesis Real Lab Bridge V1 intentionally provides no device-actuation API.");
}

export function validateDeviceManifest(manifest: DeviceManifest): string[] {
  const issues: string[] = [];
  if (manifest.capabilities.some((c) => c.direction !== "READ")) issues.push("Only read capabilities are allowed in V1.");
  if (!manifest.hardwareIdentity.trim()) issues.push("hardwareIdentity is required.");
  if (manifest.validated && !manifest.calibrationRef) issues.push("Validated hardware requires calibrationRef.");
  return issues;
}
