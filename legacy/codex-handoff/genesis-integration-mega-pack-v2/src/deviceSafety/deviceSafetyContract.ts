/**
 * Fix area 2 (device-mode taxonomy unification). Before V2 there were four independent
 * device-safety taxonomies in play, each invented by a different package:
 *   - real repo D-140: DeviceExecutionMode = 'SIMULATED'|'REPLAY'|'HARDWARE_IN_LOOP'|'LIVE_READ_ONLY'|'LIVE_CONTROLLED'
 *   - D-142:            BayMode            = 'SIMULATION_ONLY'|'DIGITAL_TWIN_REHEARSAL'|'DEVICE_SHADOW_MODE'
 *   - bio-real-lab-v1:  RealLabMode        = 'SYNTHETIC'|'READ_ONLY_TELEMETRY'|'SHADOW'
 *   - core-hardening:   RiskClass          = 'READ_ONLY'|'REVERSIBLE'|'MATERIAL_CHANGE'|'DEVICE_ACTUATION'|'FORBIDDEN'
 * All four were individually safe (none has a reachable real-actuation code path), but
 * none was a canonical source of truth for the others, so integrating more than one
 * risked silent semantic drift.
 *
 * This module is the ONE canonical device-safety model for this package. It preserves
 * every concept the fix request named:
 *   SIMULATION, REHEARSAL, READ_ONLY_TELEMETRY, SHADOW, HUMAN_APPROVAL_REQUIRED,
 *   DEVICE_ACTUATION_BLOCKED
 * `DeviceSafetyMode` covers the four *execution* modes; `HUMAN_APPROVAL_REQUIRED` and
 * `DEVICE_ACTUATION_BLOCKED` are per-state flags on `CanonicalDeviceSafety`, not modes,
 * because they answer different questions (what kind of run is this vs. what governs it).
 *
 * `deviceActuationBlocked` is a literal `true` type, not `boolean` — structurally, no
 * value of this contract can ever represent an unblocked state. There is no fifth,
 * actuating mode. Real device actuation stays out of this package entirely.
 */
export type DeviceSafetyMode = "SIMULATION" | "REHEARSAL" | "READ_ONLY_TELEMETRY" | "SHADOW";

export interface CanonicalDeviceSafety {
  readonly mode: DeviceSafetyMode;
  readonly humanApprovalRequired: boolean;
  readonly deviceActuationBlocked: true;
  readonly notes?: readonly string[];
}

export function canonicalDeviceSafety(
  mode: DeviceSafetyMode,
  humanApprovalRequired: boolean,
  notes?: readonly string[]
): CanonicalDeviceSafety {
  return { mode, humanApprovalRequired, deviceActuationBlocked: true, ...(notes ? { notes } : {}) };
}
