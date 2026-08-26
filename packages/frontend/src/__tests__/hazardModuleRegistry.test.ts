/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  HazardModuleCompatibilityError,
  UnknownHazardModuleError,
  assertHazardRunCompatibleWithModule,
  getHazardModule,
  listHazardModules,
  type HazardModuleDescriptor,
} from '../core/hazard/hazardModuleRegistry';
import { EARTHQUAKE_MODEL_VERSION } from '../core/hazard/earthquake/earthquakeModel';
import { EARTHQUAKE_NOT_MODELED, EARTHQUAKE_WORLD_PROJECTION_SCHEMA_VERSION } from '../core/hazard/earthquake/earthquakeWorldProjection';
import { buildHazardEvidencePack } from '../core/hazard/earthquake/earthquakeEvidence';
import { runEarthquakeScenario, type EarthquakeScenarioSpec } from '../core/hazard/earthquake/earthquakeScenario';
import type { HazardDatasetStatus, HazardInput, HazardRun } from '../core/hazard/contracts';

const HERE = dirname(fileURLToPath(import.meta.url));
const HAZARD_DIR = join(HERE, '..', 'core', 'hazard');

const SPEC: EarthquakeScenarioSpec = {
  scenarioLabel: 'SYNTHETIC-EQ-REGISTRY-001',
  magnitude: 6.0,
  depthKm: 10,
  epicenter: { x: 0, y: 0 },
  seed: 1,
};

describe('getHazardModule / listHazardModules', () => {
  it('returns the exact registered earthquake descriptor', () => {
    const descriptor = getHazardModule('earthquake');
    expect(descriptor).toEqual({
      hazardType: 'earthquake',
      moduleVersion: EARTHQUAKE_MODEL_VERSION,
      projectionSchemaVersion: EARTHQUAKE_WORLD_PROJECTION_SCHEMA_VERSION,
      scenarioOnly: true,
      supportedCapabilities: [
        'ground-motion-attenuation-synthetic',
        'site-impact-projection',
        'evidence-pack',
        'replay-match-drift-blocked',
      ],
      notModeled: EARTHQUAKE_NOT_MODELED,
      requiredEvidenceFields: descriptor.requiredEvidenceFields,
    });
  });

  it('declares SCENARIO-only, no calibration claim', () => {
    const descriptor = getHazardModule('earthquake');
    expect(descriptor.scenarioOnly).toBe(true);
    expect(descriptor.notModeled.length).toBeGreaterThan(0);
  });

  it('lists exactly the one registered module', () => {
    const modules = listHazardModules();
    expect(modules).toHaveLength(1);
    expect(modules[0].hazardType).toBe('earthquake');
  });

  it('throws UnknownHazardModuleError for an unregistered hazard type', () => {
    expect(() => getHazardModule('flood')).toThrow(UnknownHazardModuleError);
    expect(() => getHazardModule('nuclear')).toThrow(UnknownHazardModuleError);
  });
});

describe('registry immutability', () => {
  it('the descriptor is frozen — mutation attempts throw', () => {
    const descriptor = getHazardModule('earthquake');
    expect(() => {
      // @ts-expect-error deliberately violating readonly for the immutability proof
      descriptor.moduleVersion = 'tampered';
    }).toThrow(TypeError);
  });

  it('supportedCapabilities and notModeled arrays are frozen', () => {
    const descriptor = getHazardModule('earthquake');
    expect(() => {
      // @ts-expect-error deliberately violating readonly for the immutability proof
      descriptor.supportedCapabilities.push('new-capability');
    }).toThrow(TypeError);
    expect(() => {
      // @ts-expect-error deliberately violating readonly for the immutability proof
      descriptor.notModeled.push('new-not-modeled-item');
    }).toThrow(TypeError);
  });

  it('listHazardModules() does not expose a mutable backing array that affects the registry', () => {
    const first = listHazardModules();
    // Arrays from Object.values() are ordinary (unfrozen) arrays — mutating
    // the RETURNED array must not affect a second call.
    (first as HazardModuleDescriptor[]).push(first[0]);
    const second = listHazardModules();
    expect(second).toHaveLength(1);
  });
});

describe('assertHazardRunCompatibleWithModule — capability fence', () => {
  it('passes for a real, freshly-built earthquake run', async () => {
    const result = await runEarthquakeScenario(SPEC, 'test-commit-hash');
    expect(() => assertHazardRunCompatibleWithModule({ hazardType: 'earthquake', run: result.run, input: result.input })).not.toThrow();
  });

  it('throws UnknownHazardModuleError for an unregistered hazardType', async () => {
    const result = await runEarthquakeScenario({ ...SPEC, scenarioLabel: 'SYNTHETIC-EQ-REGISTRY-002' }, 'test-commit-hash');
    expect(() => assertHazardRunCompatibleWithModule({ hazardType: 'flood', run: result.run })).toThrow(UnknownHazardModuleError);
  });

  it('throws HazardModuleCompatibilityError on hazardModuleVersion mismatch', async () => {
    const result = await runEarthquakeScenario({ ...SPEC, scenarioLabel: 'SYNTHETIC-EQ-REGISTRY-003' }, 'test-commit-hash');
    const staleRun: HazardRun = { ...result.run, hazardModuleVersion: 'earthquake-synthetic-attenuation-v0-old' };
    expect(() => assertHazardRunCompatibleWithModule({ hazardType: 'earthquake', run: staleRun })).toThrow(HazardModuleCompatibilityError);
  });

  it('throws HazardModuleCompatibilityError on projectionSchemaVersion mismatch', async () => {
    const result = await runEarthquakeScenario({ ...SPEC, scenarioLabel: 'SYNTHETIC-EQ-REGISTRY-004' }, 'test-commit-hash');
    expect(() => assertHazardRunCompatibleWithModule({
      hazardType: 'earthquake', run: result.run, projectionSchemaVersion: '99.0.0',
    })).toThrow(HazardModuleCompatibilityError);
  });

  it('throws HazardModuleCompatibilityError when the provided HazardInput.hazardType does not match', async () => {
    const result = await runEarthquakeScenario({ ...SPEC, scenarioLabel: 'SYNTHETIC-EQ-REGISTRY-005' }, 'test-commit-hash');
    const mismatchedInput: HazardInput = { ...result.input, hazardType: 'flood' };
    expect(() => assertHazardRunCompatibleWithModule({ hazardType: 'earthquake', run: result.run, input: mismatchedInput })).toThrow(HazardModuleCompatibilityError);
  });

  it('throws HazardModuleCompatibilityError when the run does not reference the provided input', async () => {
    const a = await runEarthquakeScenario({ ...SPEC, scenarioLabel: 'SYNTHETIC-EQ-REGISTRY-006A' }, 'test-commit-hash');
    const b = await runEarthquakeScenario({ ...SPEC, scenarioLabel: 'SYNTHETIC-EQ-REGISTRY-006B', magnitude: 7.0 }, 'test-commit-hash');
    expect(() => assertHazardRunCompatibleWithModule({ hazardType: 'earthquake', run: a.run, input: b.input })).toThrow(HazardModuleCompatibilityError);
  });
});

describe('requiredEvidenceFields matches what the real evidence gate enforces', () => {
  it('every declared required field is actually caught as missing by buildHazardEvidencePack on broken sub-records', async () => {
    const base = await runEarthquakeScenario({ ...SPEC, scenarioLabel: 'SYNTHETIC-EQ-REGISTRY-FIELDS' }, 'test-commit-hash');
    const descriptor = getHazardModule('earthquake');

    const brokenArtifact = {
      ...base,
      artifact: {
        ...base.artifact,
        artifactId: '', contentHash: '', rawContentRef: '',
        provenance: { ...base.artifact.provenance, provider: '', license: '', adapterVersion: '', retrievedAt: Number.NaN },
      },
    };
    const brokenInput = {
      ...base,
      input: { ...base.input, hazardInputId: '', hazardType: '', sourceArtifactId: '', scientificFields: {}, inputFingerprint: '' },
    };
    const brokenRunFields = {
      ...base,
      run: { ...base.run, hazardRunId: '', hazardInputId: '', hazardModuleVersion: '', codeCommitHash: '', resultFingerprint: '', createdAt: Number.NaN },
    };
    const brokenRunStatus = { ...base, run: { ...base.run, status: '' as unknown as HazardRun['status'] } };
    const brokenRunOutput = { ...base, run: { ...base.run, outputFields: {} } };
    const brokenExposure = {
      ...base,
      exposure: { ...base.exposure, exposureSnapshotId: '', mappingMethod: '', sites: [], datasetStatus: '' as unknown as HazardDatasetStatus },
    };
    const brokenImpacts = { ...base, impacts: [] };

    const allMissing = new Set<string>();
    for (const broken of [brokenArtifact, brokenInput, brokenRunFields, brokenRunStatus, brokenRunOutput, brokenExposure, brokenImpacts]) {
      const pack = await buildHazardEvidencePack(broken);
      pack.missingFields.forEach((f) => allMissing.add(f));
    }

    for (const field of descriptor.requiredEvidenceFields) {
      expect(allMissing.has(field)).toBe(true);
    }
  });
});

describe('Hazard Module Registry isolation — no epidemic/routing/City3D/GIS/UI imports', () => {
  const forbiddenModules = [
    'epidemicCity', 'cityAgent', 'roadNetwork', 'worldEngineContract', 'worldEngineInterface',
    'hospitalResource', 'scenarioEngine', 'discoveryCase', 'discoveryEngine', 'discoveryEvidence',
    'discoveryReplay', 'discoveryExecution', 'city3d', 'three/', "from 'three'", 'react', 'gis', 'spatialoverlay',
  ];

  it('hazardModuleRegistry.ts imports only registered hazard modules\' own version constants and contract types', () => {
    const source = readFileSync(join(HAZARD_DIR, 'hazardModuleRegistry.ts'), 'utf8');
    const importLines = source.match(/^import .*$/gm) ?? [];
    expect(importLines.length).toBeGreaterThan(0);
    for (const line of importLines) {
      for (const forbidden of forbiddenModules) {
        expect(line.toLowerCase()).not.toContain(forbidden.toLowerCase());
      }
    }
    const allowedPrefixes = ["'./earthquake/earthquakeModel", "'./earthquake/earthquakeWorldProjection", "'./contracts"];
    for (const line of importLines) {
      const match = line.match(/from '([^']+)'/);
      if (!match) continue;
      const specifier = match[1];
      const allowed = allowedPrefixes.some((prefix) => `'${specifier}`.startsWith(prefix));
      expect(allowed).toBe(true);
    }
  });
});
