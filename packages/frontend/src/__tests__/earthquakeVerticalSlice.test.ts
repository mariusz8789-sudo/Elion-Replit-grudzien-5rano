/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { InMemoryHazardProvenanceStore, type HazardProvenanceStore } from '../core/hazard/hazardProvenanceStore';
import { replayHazardRun } from '../core/hazard/hazardReplay';
import { checkHazardInputAdmission, checkHazardRunAdmission, checkSourceArtifactAdmission } from '../core/hazard/hazardEvidenceGate';
import { earthquakeEvaluator } from '../core/hazard/earthquake/earthquakeEvaluator';
import { buildHazardEvidencePack } from '../core/hazard/earthquake/earthquakeEvidence';
import { computeImpactResults } from '../core/hazard/earthquake/earthquakeImpact';
import { classifySeverity, hypocentralDistanceKm, syntheticPeakGroundAcceleration, syntheticUncertaintyBandPercent } from '../core/hazard/earthquake/earthquakeModel';
import { SYNTHETIC_EXPOSURE_SITES, buildSyntheticExposureSnapshot } from '../core/hazard/earthquake/earthquakeExposure';
import { runEarthquakeScenario, type EarthquakeScenarioSpec } from '../core/hazard/earthquake/earthquakeScenario';
import { EarthquakeScenarioValidationError, validateEarthquakeScenarioSpec } from '../core/hazard/earthquake/earthquakeScenarioValidation';
import { projectEarthquakeWorldState } from '../core/hazard/earthquake/earthquakeWorldProjection';

const HERE = dirname(fileURLToPath(import.meta.url));
const EARTHQUAKE_DIR = join(HERE, '..', 'core', 'hazard', 'earthquake');

const BASE_SPEC: EarthquakeScenarioSpec = {
  scenarioLabel: 'SYNTHETIC-EQ-TEST-001',
  magnitude: 6.2,
  depthKm: 12,
  epicenter: { x: 0, y: 0 },
  seed: 4242,
};

async function persistScenario(store: InMemoryHazardProvenanceStore, spec: EarthquakeScenarioSpec) {
  const result = await runEarthquakeScenario(spec, 'test-commit-hash');
  await store.putArtifact(result.artifact);
  await store.putInput(result.input);
  await store.putRun(result.run);
  return result;
}

describe('Earthquake vertical slice — end-to-end pipeline', () => {
  it('produces a complete SourceArtifact → HazardInput → HazardRun → Exposure → Impact chain', async () => {
    const result = await runEarthquakeScenario(BASE_SPEC, 'test-commit-hash');

    expect(result.artifact.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.input.sourceArtifactId).toBe(result.artifact.artifactId);
    expect(result.input.inputFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(result.run.hazardInputId).toBe(result.input.hazardInputId);
    expect(result.run.resultFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(result.run.status).toBe('COMPLETED');
    expect(result.exposure.sites.length).toBe(SYNTHETIC_EXPOSURE_SITES.length);
    expect(result.impacts.length).toBe(SYNTHETIC_EXPOSURE_SITES.length);

    // Every impact traces back to this exact run and exposure snapshot.
    for (const impact of result.impacts) {
      expect(impact.hazardRunId).toBe(result.run.hazardRunId);
      expect(impact.exposureSnapshotId).toBe(result.exposure.exposureSnapshotId);
      expect(impact.datasetStatus).toBe('SCENARIO');
    }
  });

  it('is admissible under Phase 0\'s own evidence completeness gate — no new admission concept invented', async () => {
    const result = await runEarthquakeScenario(BASE_SPEC, 'test-commit-hash');
    expect(checkSourceArtifactAdmission(result.artifact)).toEqual({ admitted: true, missingFields: [] });
    expect(checkHazardInputAdmission(result.input)).toEqual({ admitted: true, missingFields: [] });
    expect(checkHazardRunAdmission(result.run)).toEqual({ admitted: true, missingFields: [] });
  });

  it('near-field sites experience higher severity than far-field sites for the same event', async () => {
    const result = await runEarthquakeScenario(BASE_SPEC, 'test-commit-hash');
    const bySite = new Map(result.impacts.map((i) => [i.siteId, i] as const));
    const nearField = bySite.get('site-alpha')!;
    const farField = bySite.get('site-echo')!;
    expect(nearField.severityValue).toBeGreaterThan(farField.severityValue);
  });
});

describe('Earthquake scenario validation (independent-audit remediation)', () => {
  it('accepts the base spec', () => {
    expect(validateEarthquakeScenarioSpec(BASE_SPEC)).toEqual({ valid: true, errors: [] });
  });

  it.each([
    ['NaN magnitude', { magnitude: Number.NaN }, 'magnitude must be a finite number'],
    ['Infinity magnitude', { magnitude: Number.POSITIVE_INFINITY }, 'magnitude must be a finite number'],
    ['NaN depthKm', { depthKm: Number.NaN }, 'depthKm must be a finite number >= 0'],
    ['negative depthKm', { depthKm: -5 }, 'depthKm must be a finite number >= 0'],
    ['Infinity depthKm', { depthKm: Number.POSITIVE_INFINITY }, 'depthKm must be a finite number >= 0'],
    ['NaN epicenter.x', { epicenter: { x: Number.NaN, y: 0 } }, 'epicenter.x and epicenter.y must be finite numbers'],
    ['Infinity epicenter.y', { epicenter: { x: 0, y: Number.POSITIVE_INFINITY } }, 'epicenter.x and epicenter.y must be finite numbers'],
    ['NaN seed', { seed: Number.NaN }, 'seed must be a finite number'],
    ['Infinity seed', { seed: Number.POSITIVE_INFINITY }, 'seed must be a finite number'],
    ['empty scenarioLabel', { scenarioLabel: '' }, 'scenarioLabel must be a non-empty string'],
  ] as const)('rejects %s', (_label, override, expectedError) => {
    const result = validateEarthquakeScenarioSpec({ ...BASE_SPEC, ...override });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(expectedError);
  });

  it('admits depthKm = 0 (a valid, finite, non-negative depth)', () => {
    expect(validateEarthquakeScenarioSpec({ ...BASE_SPEC, depthKm: 0 }).valid).toBe(true);
  });

  it('runEarthquakeScenario throws EarthquakeScenarioValidationError for an invalid spec, before any record is built', async () => {
    const invalid = { ...BASE_SPEC, scenarioLabel: 'SYNTHETIC-EQ-TEST-INVALID', magnitude: Number.NaN };
    await expect(runEarthquakeScenario(invalid, 'test-commit-hash')).rejects.toThrow(EarthquakeScenarioValidationError);
  });

  it('runEarthquakeScenario rejects a negative depth before building any record', async () => {
    const invalid = { ...BASE_SPEC, scenarioLabel: 'SYNTHETIC-EQ-TEST-NEGATIVE-DEPTH', depthKm: -10 };
    await expect(runEarthquakeScenario(invalid, 'test-commit-hash')).rejects.toThrow(EarthquakeScenarioValidationError);
  });
});

describe('Earthquake vertical slice — determinism and drift', () => {
  it('the same scenario spec run twice produces identical fingerprints and impact values (deterministic, no wall-clock/network dependence)', async () => {
    const a = await runEarthquakeScenario(BASE_SPEC, 'test-commit-hash');
    const b = await runEarthquakeScenario(BASE_SPEC, 'test-commit-hash');
    expect(a.input.inputFingerprint).toBe(b.input.inputFingerprint);
    expect(a.run.resultFingerprint).toBe(b.run.resultFingerprint);
    expect(a.impacts.map((i) => i.severityValue)).toEqual(b.impacts.map((i) => i.severityValue));
  });

  it('changing magnitude changes the input fingerprint, the result fingerprint, and the impact severities', async () => {
    const stronger: EarthquakeScenarioSpec = { ...BASE_SPEC, scenarioLabel: 'SYNTHETIC-EQ-TEST-002', magnitude: 7.5 };
    const a = await runEarthquakeScenario(BASE_SPEC, 'test-commit-hash');
    const b = await runEarthquakeScenario(stronger, 'test-commit-hash');
    expect(a.input.inputFingerprint).not.toBe(b.input.inputFingerprint);
    expect(a.run.resultFingerprint).not.toBe(b.run.resultFingerprint);
    expect(b.impacts[0].severityValue).toBeGreaterThan(a.impacts[0].severityValue);
  });

  it('the seed deterministically controls the uncertainty band, independent of magnitude', () => {
    const a = syntheticUncertaintyBandPercent(4242);
    const b = syntheticUncertaintyBandPercent(4242);
    const c = syntheticUncertaintyBandPercent(1);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('Earthquake vertical slice — Replay MATCH / DRIFT / BLOCKED / NOT_REPRODUCIBLE (through the enforced capability fence)', () => {
  it('MATCH: replaying an unmodified, fully persisted run against the same evaluator', async () => {
    const store = new InMemoryHazardProvenanceStore();
    const result = await persistScenario(store, BASE_SPEC);

    const replay = await replayHazardRun({ store, hazardRunId: result.run.hazardRunId, evaluator: earthquakeEvaluator, hazardType: 'earthquake' });
    expect(replay.status).toBe('MATCH');
    expect(replay.replayResultFingerprint).toBe(result.run.resultFingerprint);
  });

  it('DRIFT: a stored run whose recorded fingerprint no longer matches what the evaluator recomputes', async () => {
    const store = new InMemoryHazardProvenanceStore();
    const result = await runEarthquakeScenario({ ...BASE_SPEC, scenarioLabel: 'SYNTHETIC-EQ-TEST-DRIFT' }, 'test-commit-hash');
    await store.putArtifact(result.artifact);
    await store.putInput(result.input);
    // Persist a tampered run directly (never the true one) — same technique Phase 0's own replay tests use to simulate a corrupted/altered record.
    await store.putRun({ ...result.run, resultFingerprint: 'deliberately-wrong-fingerprint' });

    const replay = await replayHazardRun({ store, hazardRunId: result.run.hazardRunId, evaluator: earthquakeEvaluator, hazardType: 'earthquake' });
    expect(replay.status).toBe('DRIFT');
  });

  it('BLOCKED: the frozen SourceArtifact is unavailable at replay time', async () => {
    const store = new InMemoryHazardProvenanceStore();
    const result = await runEarthquakeScenario({ ...BASE_SPEC, scenarioLabel: 'SYNTHETIC-EQ-TEST-BLOCKED' }, 'test-commit-hash');
    await store.putInput(result.input);
    await store.putRun(result.run);
    // Artifact intentionally never persisted — replay must never re-fetch it.

    const replay = await replayHazardRun({ store, hazardRunId: result.run.hazardRunId, evaluator: earthquakeEvaluator, hazardType: 'earthquake' });
    expect(replay.status).toBe('BLOCKED');
  });

  it('NOT_REPRODUCIBLE: the run id itself was never saved', async () => {
    const store = new InMemoryHazardProvenanceStore();
    const replay = await replayHazardRun({ store, hazardRunId: 'never-saved-earthquake-run', evaluator: earthquakeEvaluator, hazardType: 'earthquake' });
    expect(replay.status).toBe('NOT_REPRODUCIBLE');
  });
});

describe('Earthquake vertical slice — capability fence actually enforced by replayHazardRun (final readiness gate)', () => {
  it('a correct, registered Earthquake run replays normally (fence passes, MATCH follows)', async () => {
    const store = new InMemoryHazardProvenanceStore();
    const result = await persistScenario(store, { ...BASE_SPEC, scenarioLabel: 'SYNTHETIC-EQ-FENCE-OK' });
    const replay = await replayHazardRun({ store, hazardRunId: result.run.hazardRunId, evaluator: earthquakeEvaluator, hazardType: 'earthquake' });
    expect(replay.status).toBe('MATCH');
  });

  it('BLOCKED: an unregistered hazardType is rejected before the artifact/fingerprint checks even run', async () => {
    const store = new InMemoryHazardProvenanceStore();
    const result = await persistScenario(store, { ...BASE_SPEC, scenarioLabel: 'SYNTHETIC-EQ-FENCE-BAD-TYPE' });
    const replay = await replayHazardRun({ store, hazardRunId: result.run.hazardRunId, evaluator: earthquakeEvaluator, hazardType: 'flood' });
    expect(replay.status).toBe('BLOCKED');
    expect(replay.differences.join(' ')).toMatch(/capability fence/);
  });

  it('BLOCKED: a HazardRun.hazardModuleVersion mismatching the registered module version is rejected', async () => {
    const store = new InMemoryHazardProvenanceStore();
    const result = await runEarthquakeScenario({ ...BASE_SPEC, scenarioLabel: 'SYNTHETIC-EQ-FENCE-BAD-VERSION' }, 'test-commit-hash');
    await store.putArtifact(result.artifact);
    await store.putInput(result.input);
    // A stale/foreign module version, persisted directly (never the true one — the store's immutability would otherwise reject a second write).
    await store.putRun({ ...result.run, hazardModuleVersion: 'earthquake-synthetic-attenuation-v0-old' });

    const replay = await replayHazardRun({ store, hazardRunId: result.run.hazardRunId, evaluator: earthquakeEvaluator, hazardType: 'earthquake' });
    expect(replay.status).toBe('BLOCKED');
  });

  it('BLOCKED: a projectionSchemaVersion mismatching the registered value is rejected', async () => {
    const store = new InMemoryHazardProvenanceStore();
    const result = await persistScenario(store, { ...BASE_SPEC, scenarioLabel: 'SYNTHETIC-EQ-FENCE-BAD-SCHEMA' });
    const replay = await replayHazardRun({
      store, hazardRunId: result.run.hazardRunId, evaluator: earthquakeEvaluator,
      hazardType: 'earthquake', projectionSchemaVersion: '99.0.0',
    });
    expect(replay.status).toBe('BLOCKED');
  });

  it('BLOCKED: an inconsistent HazardInput <-> HazardRun pair (input.hazardInputId does not match run.hazardInputId) is rejected', async () => {
    const a = await runEarthquakeScenario({ ...BASE_SPEC, scenarioLabel: 'SYNTHETIC-EQ-FENCE-INCONSISTENT-A' }, 'test-commit-hash');
    const b = await runEarthquakeScenario({ ...BASE_SPEC, scenarioLabel: 'SYNTHETIC-EQ-FENCE-INCONSISTENT-B', magnitude: 7.2 }, 'test-commit-hash');
    // A store whose getInput() returns a DIFFERENT scenario's input than the one the run actually references — simulates a corrupted/misrouted backend, not a real store bug (the real InMemory/LocalHazardProvenanceStore cannot produce this).
    const inconsistentStore: HazardProvenanceStore = {
      putArtifact: async () => {}, getArtifact: async () => a.artifact, listArtifacts: async () => [a.artifact.artifactId],
      putInput: async () => {}, getInput: async () => b.input, listInputs: async () => [b.input.hazardInputId],
      putRun: async () => {}, getRun: async () => a.run, listRuns: async () => [a.run.hazardRunId],
    };

    const replay = await replayHazardRun({ store: inconsistentStore, hazardRunId: a.run.hazardRunId, evaluator: earthquakeEvaluator, hazardType: 'earthquake' });
    expect(replay.status).toBe('BLOCKED');
  });

  it('omitting hazardType skips the fence — the domain-neutral mechanism is unaffected', async () => {
    const store = new InMemoryHazardProvenanceStore();
    const result = await persistScenario(store, { ...BASE_SPEC, scenarioLabel: 'SYNTHETIC-EQ-FENCE-OMITTED' });
    const replay = await replayHazardRun({ store, hazardRunId: result.run.hazardRunId, evaluator: earthquakeEvaluator });
    expect(replay.status).toBe('MATCH');
  });

  it('supplying projectionSchemaVersion without hazardType is a COMPILE-TIME error, not a silently-ignored option', async () => {
    const store = new InMemoryHazardProvenanceStore();
    const result = await persistScenario(store, { ...BASE_SPEC, scenarioLabel: 'SYNTHETIC-EQ-FENCE-SCHEMA-WITHOUT-TYPE' });
    // @ts-expect-error projectionSchemaVersion requires hazardType — see ReplayHazardRunOptions in hazardReplay.ts.
    const replay = await replayHazardRun({ store, hazardRunId: result.run.hazardRunId, evaluator: earthquakeEvaluator, projectionSchemaVersion: '1.0.0' });
    // Runtime behavior when forced past the type system (e.g. from untyped JS): silently ignored, same as omitting it entirely — never a crash.
    expect(replay.status).toBe('MATCH');
  });
});

describe('Earthquake vertical slice — Evidence Pack', () => {
  it('a complete scenario produces an evidence pack with no missing fields and a real SHA-256 digest', async () => {
    const result = await runEarthquakeScenario(BASE_SPEC, 'test-commit-hash');
    const pack = await buildHazardEvidencePack(result);
    expect(pack.missingFields).toEqual([]);
    expect(pack.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(pack.hazardType).toBe('earthquake');
  });

  it('flags a missing exposure snapshot as an incomplete pack rather than silently admitting it', async () => {
    const result = await runEarthquakeScenario({ ...BASE_SPEC, scenarioLabel: 'SYNTHETIC-EQ-TEST-BROKEN-EXPOSURE' }, 'test-commit-hash');
    const broken = { ...result, exposure: { ...result.exposure, sites: [] } };
    const pack = await buildHazardEvidencePack(broken);
    expect(pack.missingFields).toContain('exposure.sites');
  });

  it('hashing the same fixed result twice yields the same SHA-256 (generatedAt is metadata, not hashed content)', async () => {
    const result = await runEarthquakeScenario({ ...BASE_SPEC, scenarioLabel: 'SYNTHETIC-EQ-TEST-HASH-IDEMPOTENT' }, 'test-commit-hash');
    const packA = await buildHazardEvidencePack(result);
    const packB = await buildHazardEvidencePack(result);
    expect(packA.sha256).toBe(packB.sha256);
    expect(Number.isFinite(packA.generatedAt)).toBe(true);
  });
});

describe('Earthquake vertical slice — read-only Digital Twin projection contract', () => {
  it('projects a pure, versioned, read-only view without mutating its input', async () => {
    const result = await runEarthquakeScenario(BASE_SPEC, 'test-commit-hash');
    const frozenInput = JSON.parse(JSON.stringify(result));
    const view = projectEarthquakeWorldState(result);

    expect(view.schemaVersion).toBe('1.0.0');
    expect(view.hazardRunId).toBe(result.run.hazardRunId);
    expect(view.sites.length).toBe(result.impacts.length);
    expect(view.notModeled.length).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(result))).toEqual(frozenInput);
  });

  it('every site in the view carries an explicit datasetStatus — never silently OBSERVED', async () => {
    const result = await runEarthquakeScenario(BASE_SPEC, 'test-commit-hash');
    const view = projectEarthquakeWorldState(result);
    for (const site of view.sites) {
      expect(site.datasetStatus).toBe('SCENARIO');
    }
  });
});

describe('Earthquake model — pure physics helper functions', () => {
  it('hypocentral distance at the epicenter equals depth', () => {
    expect(hypocentralDistanceKm({ x: 5, y: 5 }, 10, { x: 5, y: 5 })).toBe(10);
  });

  it('peak ground acceleration decreases monotonically with distance', () => {
    const near = syntheticPeakGroundAcceleration(6.5, 5);
    const far = syntheticPeakGroundAcceleration(6.5, 50);
    expect(near).toBeGreaterThan(far);
  });

  it('peak ground acceleration increases monotonically with magnitude', () => {
    const weak = syntheticPeakGroundAcceleration(4.5, 20);
    const strong = syntheticPeakGroundAcceleration(7.5, 20);
    expect(strong).toBeGreaterThan(weak);
  });

  it('severity classification is ordered and covers the full range', () => {
    expect(classifySeverity(0.001)).toBe('NONE');
    expect(classifySeverity(0.05)).toBe('MINOR');
    expect(classifySeverity(0.2)).toBe('MODERATE');
    expect(classifySeverity(0.5)).toBe('SEVERE');
  });
});

describe('Earthquake exposure — synthetic fixture, not epidemic CityWorld', () => {
  it('exposure snapshot is explicitly labeled SCENARIO and has a fixed, non-empty site list', () => {
    const snapshot = buildSyntheticExposureSnapshot('exposure-test-1');
    expect(snapshot.datasetStatus).toBe('SCENARIO');
    expect(snapshot.sites.length).toBeGreaterThan(0);
  });

  it('impact computation is a pure function of a run and an exposure snapshot — same inputs, same outputs', async () => {
    const result = await runEarthquakeScenario(BASE_SPEC, 'test-commit-hash');
    const a = computeImpactResults(result.run, result.exposure);
    const b = computeImpactResults(result.run, result.exposure);
    expect(a).toEqual(b);
  });

  it('SYNTHETIC_EXPOSURE_SITES and the snapshots built from it are genuinely frozen — not just TypeScript-readonly — so one scenario cannot corrupt every other scenario\'s data', () => {
    const snapshot = buildSyntheticExposureSnapshot('exposure-test-frozen');
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.sites)).toBe(true);
    expect(Object.isFrozen(snapshot.sites[0])).toBe(true);
    expect(() => {
      // @ts-expect-error deliberately violating readonly to prove the shared fixture array is truly immutable
      snapshot.sites[0].vulnerabilityClass = 'LOW';
    }).toThrow(TypeError);

    // The bug this guards against: every ExposureSnapshot shares SYNTHETIC_EXPOSURE_SITES by
    // reference, so an unfrozen mutation on ONE snapshot would have corrupted every other
    // scenario's exposure data, past and future, for the lifetime of the process.
    const otherSnapshot = buildSyntheticExposureSnapshot('exposure-test-unaffected');
    expect(otherSnapshot.sites[0].vulnerabilityClass).toBe('HIGH');
  });

  it('computeImpactResults returns a frozen array of frozen ImpactResult objects', async () => {
    const result = await runEarthquakeScenario({ ...BASE_SPEC, scenarioLabel: 'SYNTHETIC-EQ-TEST-FROZEN-IMPACTS' }, 'test-commit-hash');
    expect(Object.isFrozen(result.impacts)).toBe(true);
    expect(Object.isFrozen(result.impacts[0])).toBe(true);
    expect(Object.isFrozen(result.impacts[0].uncertainty)).toBe(true);
  });
});

describe('Earthquake module isolation — Scientific Core and WorldEngineContract untouched', () => {
  const forbiddenModules = [
    'epidemicCity',
    'cityAgent',
    'roadNetwork',
    'worldEngineContract',
    'worldEngineInterface',
    'hospitalResource',
    'scenarioEngine',
    'discoveryCase',
    'discoveryEngine',
    'discoveryEvidence',
    'discoveryReplay',
    'discoveryExecution',
    'city3d',
    'threejs',
    'three/',
    "from 'three'",
  ];

  it('no file under core/hazard/earthquake imports Scientific Core, WorldEngineContract, or any rendering library', () => {
    const files = readdirSync(EARTHQUAKE_DIR).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = readFileSync(join(EARTHQUAKE_DIR, file), 'utf8');
      const importLines = source.match(/^import .*$/gm) ?? [];
      for (const line of importLines) {
        for (const forbidden of forbiddenModules) {
          expect(line.toLowerCase()).not.toContain(forbidden.toLowerCase());
        }
      }
    }
  });

  it('the earthquake module only reaches outside itself into Phase 0 hazard primitives and shared hashing utilities', () => {
    const files = readdirSync(EARTHQUAKE_DIR).filter((f) => f.endsWith('.ts'));
    const allowedExternalPrefixes = [
      "'../contracts", "'../fingerprint", "'../hazardEvidenceGate", "'../hazardReplay",
      "'../hazardModuleRegistry", "'../hazardProvenanceStore",
      "'../../events/hash", "'../../discovery/evidenceCrypto",
    ];
    for (const file of files) {
      const source = readFileSync(join(EARTHQUAKE_DIR, file), 'utf8');
      const importLines = source.match(/^import .*from '([^']+)'/gm) ?? [];
      for (const line of importLines) {
        const match = line.match(/from '([^']+)'/);
        if (!match) continue;
        const specifier = match[1];
        if (specifier.startsWith('.') && !specifier.startsWith('./')) {
          // Any import that escapes the earthquake directory (starts with ../) must be one of the named, reviewed Phase 0/shared primitives.
          const allowed = allowedExternalPrefixes.some((prefix) => `'${specifier}`.startsWith(prefix));
          expect(allowed).toBe(true);
        }
      }
    }
  });
});
