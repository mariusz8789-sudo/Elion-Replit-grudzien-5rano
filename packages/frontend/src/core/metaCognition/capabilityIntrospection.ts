/**
 * D-141 CAPABILITY INTROSPECTION.
 *
 * A pure reporting/aggregation utility — never a registry of its own. This module does NOT
 * decide whether a solver or provider is available: the caller already knows that from the
 * canonical `SolverRouter`/`ModelRouter`/backend `capabilities.mjs` it actually holds, and
 * passes the answer in as a `CapabilityDescriptor`. Introspecting "what can I actually do right
 * now" this way can never silently claim a capability those canonical systems don't have —
 * there is no second capability registry to fall out of sync with them.
 */
export const CAPABILITY_INTROSPECTION_VERSION = '1.0.0';

export type CapabilityKind = 'SOLVER' | 'MODEL_PROVIDER' | 'EXTERNAL_ENGINE' | 'ANALYZER';

export interface CapabilityDescriptor {
  readonly id: string;
  readonly kind: CapabilityKind;
  readonly available: boolean;
  /** Required when `available` is false — a short, honest reason (e.g. "no toolchain binary found"), never omitted to silently mean "unknown". */
  readonly reason?: string;
}

export interface CapabilityIntrospectionReport {
  readonly contractVersion: string;
  readonly totalCount: number;
  readonly availableCount: number;
  readonly blockedCount: number;
  readonly blocked: readonly CapabilityDescriptor[];
  readonly available: readonly CapabilityDescriptor[];
}

/** Rejects a descriptor marked unavailable with no reason — an honest BLOCKED must say why. */
function assertHonestDescriptor(descriptor: CapabilityDescriptor): void {
  if (!descriptor.available && !descriptor.reason) {
    throw new Error(`capabilityIntrospection: descriptor "${descriptor.id}" is unavailable but carries no reason — an honest BLOCKED must say why.`);
  }
}

/**
 * Summarizes a caller-supplied snapshot of real capability checks. Deterministic and pure:
 * identical input always produces an identical report, and nothing here is cached or persisted
 * between calls — no hidden capability memory.
 */
export function introspectCapabilities(descriptors: readonly CapabilityDescriptor[]): CapabilityIntrospectionReport {
  descriptors.forEach(assertHonestDescriptor);
  const available = descriptors.filter((d) => d.available);
  const blocked = descriptors.filter((d) => !d.available);
  return {
    contractVersion: CAPABILITY_INTROSPECTION_VERSION,
    totalCount: descriptors.length,
    availableCount: available.length,
    blockedCount: blocked.length,
    blocked,
    available,
  };
}
