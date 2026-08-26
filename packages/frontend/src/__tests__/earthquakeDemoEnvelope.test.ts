/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { InMemoryHazardProvenanceStore, type HazardProvenanceStore } from '../core/hazard/hazardProvenanceStore';
import { buildEarthquakeDemoEnvelope } from '../core/hazard/earthquake/earthquakeDemoEnvelope';
import { runEarthquakeScenario, type EarthquakeScenarioSpec } from '../core/hazard/earthquake/earthquakeScenario';
import type { HazardRun } from '../core/hazard/contracts';

const HERE = dirname(fileURLToPath(import.meta.url));
const EARTHQUAKE_DIR = join(HERE, '..', 'core', 'hazard', 'earthquake');

const BASE_SPEC: EarthquakeScenarioSpec = {
  scenarioLabel: 'SYNTHETIC-EQ-ENVELOPE-001',
  magnitude: 6.3,
  depthKm: 11,
  epicenter: { x: 1, y: -2 },
  seed: 777,
};

describe('Earthquake demo envelope — happy path', () => {
  it('is READY and carries a complete provenance/projection/replay bundle', async () => {
    const envelope = await buildEarthquakeDemoEnvelope(BASE_SPEC, 'test-commit-hash');
    expect(envelope.status).toBe('READY');
    expect(envelope.blockCode).toBeNull();
    expect(envelope.hazardType).toBe('earthquake');
    expect(envelope.datasetStatus).toBe('SCENARIO');
    expect(envelope.moduleDescriptor?.hazardType).toBe('earthquake');
    expect(envelope.run?.status).toBe('COMPLETED');
    expect(envelope.replay?.status).toBe('MATCH');
    expect(envelope.projection?.sites.length).toBeGreaterThan(0);
    expect(envelope.provenance?.hazardRunId).toBe(envelope.run?.hazardRunId);
    expect(envelope.notModeled.length).toBeGreaterThan(0);
  });

  it('is deterministic: two independent runs of the same scenario produce identical provenance ids/fingerprints and identical projection content', async () => {
    // Two SEPARATE stores: SourceArtifact.provenance.retrievedAt and HazardRun.createdAt are
    // real wall-clock provenance fields (frozen at build time, like every other Phase 0 record),
    // so replaying the SAME scenario spec through the SAME store a second time is correctly
    // treated as a genuine re-run — a REGISTRY_INCOMPATIBLE id conflict, not silent overwrite.
    // Determinism is about the SCIENTIFIC content (fingerprints, projection sites/severities),
    // which is what this test actually compares.
    const label = 'SYNTHETIC-EQ-ENVELOPE-DETERMINISM';
    const first = await buildEarthquakeDemoEnvelope({ ...BASE_SPEC, scenarioLabel: label }, 'test-commit-hash', new InMemoryHazardProvenanceStore());
    const second = await buildEarthquakeDemoEnvelope({ ...BASE_SPEC, scenarioLabel: label }, 'test-commit-hash', new InMemoryHazardProvenanceStore());
    expect(first.status).toBe('READY');
    expect(second.status).toBe('READY');
    expect(first.provenance).toEqual(second.provenance);
    expect(first.projection?.sites).toEqual(second.projection?.sites);
    expect(first.projection?.epicenter).toEqual(second.projection?.epicenter);
    expect(first.projection?.magnitude).toBe(second.projection?.magnitude);
    expect(first.projection?.schemaVersion).toBe(second.projection?.schemaVersion);
  });
});

describe('Earthquake demo envelope — INVALID_SCENARIO_SPEC block', () => {
  it('blocks a non-finite magnitude before any record is built', async () => {
    const envelope = await buildEarthquakeDemoEnvelope({ ...BASE_SPEC, scenarioLabel: 'SYNTHETIC-EQ-ENVELOPE-INVALID', magnitude: Number.NaN }, 'test-commit-hash');
    expect(envelope.status).toBe('BLOCKED');
    expect(envelope.blockCode).toBe('INVALID_SCENARIO_SPEC');
    expect(envelope.run).toBeNull();
    expect(envelope.replay).toBeNull();
  });
});

describe('Earthquake demo envelope — REGISTRY_INCOMPATIBLE block (registry/version/schema)', () => {
  it('blocks when the same scenario label is reused with different content, colliding on the deterministic id', async () => {
    const store = new InMemoryHazardProvenanceStore();
    const label = 'SYNTHETIC-EQ-ENVELOPE-REUSED-LABEL';
    const first = await buildEarthquakeDemoEnvelope({ ...BASE_SPEC, scenarioLabel: label, magnitude: 6.0 }, 'test-commit-hash', store);
    expect(first.status).toBe('READY');

    const second = await buildEarthquakeDemoEnvelope({ ...BASE_SPEC, scenarioLabel: label, magnitude: 7.8 }, 'test-commit-hash', store);
    expect(second.status).toBe('BLOCKED');
    expect(second.blockCode).toBe('REGISTRY_INCOMPATIBLE');
  });
});

describe('Earthquake demo envelope — EVIDENCE_INCOMPLETE block', () => {
  it('blocks when codeCommitHash is empty (a real, publicly-reachable missing-provenance case)', async () => {
    const envelope = await buildEarthquakeDemoEnvelope({ ...BASE_SPEC, scenarioLabel: 'SYNTHETIC-EQ-ENVELOPE-NO-COMMIT' }, '');
    expect(envelope.status).toBe('BLOCKED');
    expect(envelope.blockCode).toBe('EVIDENCE_INCOMPLETE');
    expect(envelope.blockReason).toContain('codeCommitHash');
  });
});

describe('Earthquake demo envelope — REPLAY_NOT_MATCH (DRIFT) block', () => {
  it('blocks when the store returns a tampered run on read, causing a genuine replay DRIFT', async () => {
    const spec: EarthquakeScenarioSpec = { ...BASE_SPEC, scenarioLabel: 'SYNTHETIC-EQ-ENVELOPE-DRIFT' };
    // Computed independently outside the envelope purely to know the exact ids/content the
    // envelope's own internal (deterministic) recomputation will produce.
    const trueResult = await runEarthquakeScenario(spec, 'test-commit-hash');

    // A store that accepts writes normally but returns a TAMPERED run on read — simulating a
    // non-conforming backend, not a real bug in InMemoryHazardProvenanceStore (which cannot do this).
    const tamperedReadStore: HazardProvenanceStore = {
      putArtifact: async () => {}, getArtifact: async () => trueResult.artifact, listArtifacts: async () => [trueResult.artifact.artifactId],
      putInput: async () => {}, getInput: async () => trueResult.input, listInputs: async () => [trueResult.input.hazardInputId],
      putRun: async () => {}, getRun: async () => ({ ...trueResult.run, resultFingerprint: 'deliberately-wrong-fingerprint' }) as HazardRun,
      listRuns: async () => [trueResult.run.hazardRunId],
    };

    const envelope = await buildEarthquakeDemoEnvelope(spec, 'test-commit-hash', tamperedReadStore);
    expect(envelope.status).toBe('BLOCKED');
    expect(envelope.blockCode).toBe('REPLAY_NOT_MATCH');
    expect(envelope.replay?.status).toBe('DRIFT');
    expect(envelope.projection).toBeNull();
  });
});

describe('Earthquake demo envelope isolation — no renderer, UI, CityWorld, routing, or epidemic imports', () => {
  const forbiddenModules = [
    'epidemiccity', 'cityagent', 'roadnetwork', 'worldenginecontract', 'worldengineinterface',
    'hospitalresource', 'scenarioengine', 'discoverycase', 'discoveryengine', 'discoveryevidence',
    'discoveryreplay', 'discoveryexecution', 'city3d', 'simulationrenderer', "from 'react'", "from 'three'",
    'spatialoverlay', 'osmimport', 'geojson',
  ];

  it('no file under core/hazard/earthquake imports a renderer, UI framework, or Scientific Core module', () => {
    const files = readdirSync(EARTHQUAKE_DIR).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(join(EARTHQUAKE_DIR, file), 'utf8');
      const importLines = source.match(/^import .*$/gm) ?? [];
      for (const line of importLines) {
        for (const forbidden of forbiddenModules) {
          expect(line.toLowerCase()).not.toContain(forbidden);
        }
      }
    }
  });

  it('earthquakeDemoEnvelope.ts only reaches outside the earthquake directory into named, reviewed hazard-domain primitives', () => {
    const source = readFileSync(join(EARTHQUAKE_DIR, 'earthquakeDemoEnvelope.ts'), 'utf8');
    const importLines = source.match(/^import .*from '([^']+)'/gm) ?? [];
    const allowedExternalPrefixes = ["'../hazardModuleRegistry", "'../hazardReplay", "'../hazardProvenanceStore", "'../contracts"];
    for (const line of importLines) {
      const match = line.match(/from '([^']+)'/);
      if (!match) continue;
      const specifier = match[1];
      if (specifier.startsWith('..')) {
        const allowed = allowedExternalPrefixes.some((prefix) => `'${specifier}`.startsWith(prefix));
        expect(allowed).toBe(true);
      }
    }
  });
});
