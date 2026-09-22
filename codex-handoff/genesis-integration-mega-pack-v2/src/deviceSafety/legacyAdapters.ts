import { canonicalDeviceSafety, type CanonicalDeviceSafety } from "./deviceSafetyContract.js";

/**
 * Every mapping function below is HONEST rather than total: a legacy value that could
 * plausibly mean "this actually drives real hardware" is never silently folded into a
 * "safe" canonical bucket. It comes back as UNMAPPABLE_REQUIRES_HUMAN_REVIEW instead,
 * naming exactly which legacy value and system triggered it. Laundering an
 * actuation-capable legacy value into a safe-looking canonical mode would be worse than
 * leaving the four taxonomies unreconciled.
 */
export type MappingOutcome =
  | { readonly kind: "MAPPED"; readonly result: CanonicalDeviceSafety }
  | {
      readonly kind: "UNMAPPABLE_REQUIRES_HUMAN_REVIEW";
      readonly legacySystem: string;
      readonly legacyValue: string;
      readonly reason: string;
    };

function mapped(mode: Parameters<typeof canonicalDeviceSafety>[0], approval: boolean, notes?: readonly string[]): MappingOutcome {
  return { kind: "MAPPED", result: canonicalDeviceSafety(mode, approval, notes) };
}
function unmappable(legacySystem: string, legacyValue: string, reason: string): MappingOutcome {
  return { kind: "UNMAPPABLE_REQUIRES_HUMAN_REVIEW", legacySystem, legacyValue, reason };
}

/** Real repo D-140 `devicePorts.ts::DeviceExecutionMode`. */
export type LegacyDeviceExecutionMode = "SIMULATED" | "REPLAY" | "HARDWARE_IN_LOOP" | "LIVE_READ_ONLY" | "LIVE_CONTROLLED";

export function fromDeviceExecutionMode(value: LegacyDeviceExecutionMode): MappingOutcome {
  switch (value) {
    case "SIMULATED":
      return mapped("SIMULATION", false);
    case "REPLAY":
      return mapped("REHEARSAL", false);
    case "LIVE_READ_ONLY":
      return mapped("READ_ONLY_TELEMETRY", false);
    case "HARDWARE_IN_LOOP":
      return unmappable(
        "D-140 DeviceExecutionMode",
        value,
        "HARDWARE_IN_LOOP may drive real hardware inside a control loop; this canonical contract has no actuating-safe bucket for it. Requires explicit human review of the real D-140 devicePorts.ts call sites before any mapping is accepted."
      );
    case "LIVE_CONTROLLED":
      return unmappable(
        "D-140 DeviceExecutionMode",
        value,
        "LIVE_CONTROLLED implies real device control/actuation and must never be silently mapped into a safe canonical bucket."
      );
  }
}

/** D-142 `domain.ts::BayMode`. */
export type LegacyBayMode = "SIMULATION_ONLY" | "DIGITAL_TWIN_REHEARSAL" | "DEVICE_SHADOW_MODE";

export function fromBayMode(value: LegacyBayMode): MappingOutcome {
  switch (value) {
    case "SIMULATION_ONLY":
      return mapped("SIMULATION", false);
    case "DIGITAL_TWIN_REHEARSAL":
      return mapped("REHEARSAL", false);
    case "DEVICE_SHADOW_MODE":
      return mapped("SHADOW", false, ["Read-only device shadow; see deviceShadow.ts's readOnly:true contract."]);
  }
}

/** bio-real-lab-v1 `realLab.ts::RealLabMode`. */
export type LegacyRealLabMode = "SYNTHETIC" | "READ_ONLY_TELEMETRY" | "SHADOW";

export function fromRealLabMode(value: LegacyRealLabMode): MappingOutcome {
  switch (value) {
    case "SYNTHETIC":
      return mapped("SIMULATION", false);
    case "READ_ONLY_TELEMETRY":
      return mapped("READ_ONLY_TELEMETRY", false);
    case "SHADOW":
      return mapped("SHADOW", false);
  }
}

/**
 * core-hardening `security.ts::RiskClass`. This is a genuinely different axis (command
 * risk, not device execution mode) — only the two clearly non-actuating classes get a
 * best-effort mapping; the rest are UNMAPPABLE by design, not by omission, because they
 * are policy-risk decisions this contract should not paper over.
 */
export type LegacyRiskClass = "READ_ONLY" | "REVERSIBLE" | "MATERIAL_CHANGE" | "DEVICE_ACTUATION" | "FORBIDDEN";

export function fromRiskClass(value: LegacyRiskClass): MappingOutcome {
  switch (value) {
    case "READ_ONLY":
      return mapped("READ_ONLY_TELEMETRY", false);
    case "REVERSIBLE":
      return mapped("REHEARSAL", false, ["RiskClass is a command-risk axis, not a device-execution-mode axis; this is a best-effort mapping, not an identity."]);
    case "MATERIAL_CHANGE":
      return unmappable("core-hardening RiskClass", value, "MATERIAL_CHANGE requires human approval per its own policy and is not itself a safe execution mode; do not fold it into one.");
    case "DEVICE_ACTUATION":
      return unmappable("core-hardening RiskClass", value, "DEVICE_ACTUATION is unconditionally blocked by evaluateCommandPolicy(); it has no canonical-safe-mode equivalent by design.");
    case "FORBIDDEN":
      return unmappable("core-hardening RiskClass", value, "FORBIDDEN commands have no execution-mode equivalent at all.");
  }
}
