import { describe, expect, it } from 'vitest';
import { detectBackends } from '../core/physicsWorld/backends';
import { FailClosedError } from '../core/physicsWorld/contracts';
import {
  DESCRIPTORS,
  detectWithVersion,
  evaluateAvailability,
  requireBackendVersion,
  type BackendDescriptor,
  type ExecPort,
} from '../core/physicsWorld/backendRegistry';

/**
 * PHYSICS BACKEND VERSION REGISTRY — negative-first, real async
 * (docs/DECISIONS.md D-057). No PYTHIA/Geant4 adapter is installed in this
 * pass, so every integration-level assertion here proves ZERO toy fallback
 * and NOT_INSTALLED as the honest, expected state — never a fabricated OK.
 */

const PYTHIA_DESCRIPTOR: BackendDescriptor = DESCRIPTORS.find((d) => d.kind === 'PYTHIA_ADAPTER')!;

describe('detectWithVersion — wired to the real detectBackends(), zero toy fallback', () => {
  it('NOT_INSTALLED for every external backend when no execPort is given', async () => {
    const reports = await detectWithVersion(null);
    expect(reports.PYTHIA_ADAPTER.reason).toBe('NOT_INSTALLED');
    expect(reports.GEANT4_ADAPTER.reason).toBe('NOT_INSTALLED');
    expect(reports.EXTERNAL_MATTER.reason).toBe('NOT_INSTALLED');
  });

  it('NOT_INSTALLED even when an execPort IS supplied — detectBackends() always reports these unavailable today, so the port is never consulted', async () => {
    let called = false;
    const execPort: ExecPort = { async getVersion() { called = true; return '99.0.0'; } };
    const reports = await detectWithVersion(execPort);
    expect(reports.PYTHIA_ADAPTER.reason).toBe('NOT_INSTALLED');
    expect(called).toBe(false); // the coarse "unavailable" answer short-circuits before ever calling the port
  });

  it('agrees with the coarse detectBackends() answer — no second, disagreeing detection authority', async () => {
    const coarse = detectBackends();
    const reports = await detectWithVersion(null);
    for (const kind of ['PYTHIA_ADAPTER', 'GEANT4_ADAPTER', 'EXTERNAL_MATTER'] as const) {
      expect(coarse[kind].available).toBe(false);
      expect(reports[kind].reason).toBe('NOT_INSTALLED');
    }
  });
});

describe('evaluateAvailability — pure version-comparison policy, unit-tested with injected values', () => {
  it('backend missing (coarse unavailable) ⇒ NOT_INSTALLED regardless of any version outcome', () => {
    const report = evaluateAvailability(PYTHIA_DESCRIPTOR, { kind: 'PYTHIA_ADAPTER', available: false, reason: 'not present' }, { version: '9.0.0', reason: 'OK' });
    expect(report.reason).toBe('NOT_INSTALLED');
  });

  it('backend version too low ⇒ VERSION_LOW, with both the detected and required version reported', () => {
    const report = evaluateAvailability(PYTHIA_DESCRIPTOR, { kind: 'PYTHIA_ADAPTER', available: true, reason: 'present' }, { version: '7.9.9', reason: 'OK' });
    expect(report.reason).toBe('VERSION_LOW');
    expect(report.detectedVersion).toBe('7.9.9');
    expect(report.minVersion).toBe(PYTHIA_DESCRIPTOR.minVersion);
  });

  it('version at or above the minimum ⇒ OK', () => {
    const atMin = evaluateAvailability(PYTHIA_DESCRIPTOR, { kind: 'PYTHIA_ADAPTER', available: true, reason: 'present' }, { version: PYTHIA_DESCRIPTOR.minVersion, reason: 'OK' });
    expect(atMin.reason).toBe('OK');
    const above = evaluateAvailability(PYTHIA_DESCRIPTOR, { kind: 'PYTHIA_ADAPTER', available: true, reason: 'present' }, { version: '99.0.0', reason: 'OK' });
    expect(above.reason).toBe('OK');
  });

  it('a version-check timeout is reported as TIMEOUT, not silently treated as available', () => {
    const report = evaluateAvailability(PYTHIA_DESCRIPTOR, { kind: 'PYTHIA_ADAPTER', available: true, reason: 'present' }, { version: null, reason: 'TIMEOUT' });
    expect(report.reason).toBe('TIMEOUT');
  });

  it('an exec error is reported as EXEC_ERROR', () => {
    const report = evaluateAvailability(PYTHIA_DESCRIPTOR, { kind: 'PYTHIA_ADAPTER', available: true, reason: 'present' }, { version: null, reason: 'EXEC_ERROR' });
    expect(report.reason).toBe('EXEC_ERROR');
  });
});

describe('requireBackendVersion — fail-closed, no toy fallback', () => {
  it('throws FailClosedError(ADAPTER_UNAVAILABLE) for PYTHIA today, with no execPort', async () => {
    await expect(requireBackendVersion('PYTHIA_ADAPTER', null)).rejects.toBeInstanceOf(FailClosedError);
  });

  it('throws even with an execPort that would report a high version — the coarse gate still wins', async () => {
    const execPort: ExecPort = { async getVersion() { return '999.0.0'; } };
    await expect(requireBackendVersion('GEANT4_ADAPTER', execPort)).rejects.toThrow(/ADAPTER_UNAVAILABLE/);
  });

  it('never resolves to a toy substitute on failure — it throws, it does not return a NATIVE_TOY result', async () => {
    await expect(requireBackendVersion('EXTERNAL_MATTER', null)).rejects.toThrow(/NO fallback to toy/);
  });
});
