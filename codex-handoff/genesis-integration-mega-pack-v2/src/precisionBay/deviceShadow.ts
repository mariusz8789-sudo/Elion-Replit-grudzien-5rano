import type { Observation, ProvenanceRef } from "./domain.js";

export interface DeviceShadowCapability {
  id: string;
  label: string;
  readOnly: true;
}

export interface DeviceShadowSnapshot {
  adapterId: string;
  connected: boolean;
  capabilities: DeviceShadowCapability[];
  telemetry: Observation[];
  provenance: ProvenanceRef[];
}

export interface ReadOnlyDeviceShadowAdapter {
  connect(sessionId: string): Promise<DeviceShadowSnapshot>;
  read(sessionId: string): Promise<DeviceShadowSnapshot>;
  disconnect(sessionId: string): Promise<void>;
}

export type RealDeviceCommand = never;

export function realDeviceActuationUnavailable(): never {
  throw new Error("Real-device actuation is not implemented in this package.");
}

/** Fix area 2: DEVICE_SHADOW_MODE (this file's whole reason to exist) maps to the
 * canonical SHADOW mode 1:1 via `../deviceSafety/legacyAdapters.js::fromBayMode`. Kept
 * here as a thin documented pointer rather than re-exported, so this module stays
 * import-order-independent from `../deviceSafety/`. */
export const CANONICAL_SAFETY_MAPPING_NOTE =
  "DEVICE_SHADOW_MODE -> ../deviceSafety/legacyAdapters.js::fromBayMode('DEVICE_SHADOW_MODE') -> SHADOW (read-only, humanApprovalRequired:false, deviceActuationBlocked:true).";
