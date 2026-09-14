import { detectBackends } from './backends';
import { FailClosedError, type BackendAvailability, type BackendKind } from './contracts';

/**
 * PHYSICS BACKEND VERSION REGISTRY — extends `backends.ts`, does not
 * replace it (docs/DECISIONS.md D-057, "DOBUDOWANIE RESZTY MASZYNY" pass,
 * item C).
 *
 * `backends.ts::detectBackends()` stays the SINGLE source of truth for the
 * coarse question "is this backend available at all" — it always reports
 * `PYTHIA_ADAPTER`/`GEANT4_ADAPTER`/`EXTERNAL_MATTER` unavailable, because
 * no adapter for any of them exists in this repo (mandate: "Do NOT install
 * PYTHIA/Geant4 in this pass"). This file adds a version floor ON TOP of
 * that answer — it reuses `BackendKind` and `FailClosedError` unchanged
 * rather than inventing a second backend vocabulary or a second
 * availability authority.
 *
 * ZERO TOY FALLBACK, provably: `detectWithVersion` only calls an injected
 * `ExecPort` when `detectBackends()` already reports the backend available.
 * Since that is never true for the three external kinds today, every call
 * to `detectWithVersion`/`requireBackendVersion` for them returns/throws
 * `NOT_INSTALLED`/`ADAPTER_UNAVAILABLE` regardless of what `execPort` is
 * passed — there is no code path where supplying a port makes an
 * unimplemented adapter report itself installed.
 */

export type VersionCheckReason = 'OK' | 'NOT_INSTALLED' | 'VERSION_LOW' | 'TIMEOUT' | 'EXEC_ERROR';

export type ExternalBackendKind = Exclude<BackendKind, 'NATIVE_TOY'>;

export interface BackendDescriptor {
  readonly kind: ExternalBackendKind;
  readonly minVersion: string;
  readonly execCommand: string;
}

/** The 3 external backend kinds this repo's contracts already name — no 4th kind added. */
export const DESCRIPTORS: readonly BackendDescriptor[] = [
  { kind: 'PYTHIA_ADAPTER', minVersion: '8.3.0', execCommand: 'pythia8-config --version' },
  { kind: 'GEANT4_ADAPTER', minVersion: '11.0.0', execCommand: 'geant4-config --version' },
  { kind: 'EXTERNAL_MATTER', minVersion: '1.0.0', execCommand: 'external-matter-engine --version' },
];

export interface AvailabilityReport {
  readonly kind: ExternalBackendKind;
  readonly reason: VersionCheckReason;
  readonly detectedVersion: string | null;
  readonly minVersion: string;
}

/** A real version-check execution port. No implementation ships in this pass — see the module header. */
export interface ExecPort {
  getVersion(descriptor: BackendDescriptor): Promise<string | null>;
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

interface VersionOutcome {
  readonly version: string | null;
  readonly reason: 'OK' | 'TIMEOUT' | 'EXEC_ERROR';
}

/**
 * PURE evaluation, no I/O — given a coarse `BackendAvailability` (as
 * `detectBackends()` returns) and an already-obtained version-check
 * outcome, decides the final report. Kept separate from `detectWithVersion`
 * so the version-comparison policy (VERSION_LOW vs OK) is directly
 * unit-testable with injected values, without depending on
 * `detectBackends()` ever reporting an external backend available.
 */
export function evaluateAvailability(descriptor: BackendDescriptor, coarse: BackendAvailability, versionOutcome: VersionOutcome): AvailabilityReport {
  if (!coarse.available) {
    return { kind: descriptor.kind, reason: 'NOT_INSTALLED', detectedVersion: null, minVersion: descriptor.minVersion };
  }
  if (versionOutcome.reason !== 'OK' || versionOutcome.version === null) {
    return { kind: descriptor.kind, reason: versionOutcome.reason === 'OK' ? 'NOT_INSTALLED' : versionOutcome.reason, detectedVersion: null, minVersion: descriptor.minVersion };
  }
  const reason: VersionCheckReason = compareVersions(versionOutcome.version, descriptor.minVersion) >= 0 ? 'OK' : 'VERSION_LOW';
  return { kind: descriptor.kind, reason, detectedVersion: versionOutcome.version, minVersion: descriptor.minVersion };
}

const DEFAULT_TIMEOUT_MS = 5000;

async function runVersionCheck(descriptor: BackendDescriptor, execPort: ExecPort, timeoutMs: number): Promise<VersionOutcome> {
  try {
    const version = await Promise.race<string | null>([
      execPort.getVersion(descriptor),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), timeoutMs)),
    ]);
    return { version, reason: 'OK' };
  } catch (err) {
    return { version: null, reason: err instanceof Error && err.message === 'TIMEOUT' ? 'TIMEOUT' : 'EXEC_ERROR' };
  }
}

export async function detectWithVersion(execPort: ExecPort | null, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Readonly<Record<ExternalBackendKind, AvailabilityReport>>> {
  const coarse = detectBackends();
  const reports: Record<string, AvailabilityReport> = {};
  for (const descriptor of DESCRIPTORS) {
    const c = coarse[descriptor.kind];
    if (!c.available || execPort === null) {
      reports[descriptor.kind] = { kind: descriptor.kind, reason: 'NOT_INSTALLED', detectedVersion: null, minVersion: descriptor.minVersion };
      continue;
    }
    const outcome = await runVersionCheck(descriptor, execPort, timeoutMs);
    reports[descriptor.kind] = evaluateAvailability(descriptor, c, outcome);
  }
  return reports as Readonly<Record<ExternalBackendKind, AvailabilityReport>>;
}

/**
 * Fail-closed, ZERO toy fallback: throws unless the named external backend
 * is genuinely `OK` at or above its minimum version. Never substitutes
 * `NATIVE_TOY` — that refusal already lives in `backends.ts::requireBackend`;
 * this adds the version floor on top of it, reusing the same
 * `FailClosedError` class (code `ADAPTER_UNAVAILABLE`) rather than a second
 * error hierarchy.
 */
export async function requireBackendVersion(kind: ExternalBackendKind, execPort: ExecPort | null, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<void> {
  const reports = await detectWithVersion(execPort, timeoutMs);
  const report = reports[kind];
  if (report.reason !== 'OK') {
    const detail = report.detectedVersion !== null ? ` (detected ${report.detectedVersion}, need >= ${report.minVersion})` : '';
    throw new FailClosedError(`backend '${kind}' failed version check: ${report.reason}${detail} — NO fallback to toy`, 'ADAPTER_UNAVAILABLE');
  }
}
