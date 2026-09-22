import { describe, expect, it } from 'vitest';
import { buildWalkCameraPath, getRoadByIndex, sampleCameraPath } from '../core/temporalCinematic/cameraPath';
import { resolveEraProfile } from '../core/temporalCinematic/historicalEra';
import { buildHistoricalWorldSpecification, historicalWorldId, resolvePlaceGeography } from '../core/temporalCinematic/historicalWorldParameters';
import { parseTemporalCinematicPrompt } from '../core/temporalCinematic/promptParser';
import { applyGeometryRenderReadiness } from '../core/temporalCinematic/renderReadiness';
import { isRenderToVideoReady, TEMPORAL_CINEMATIC_RUNTIME_BLOCKERS } from '../core/temporalCinematic/renderRuntimeStatus';
import { buildHistoricalScene, compareSameStreetAcrossYears, recordTemporalCaptureArtifact } from '../core/temporalCinematic/temporalCinematicEngine';
import { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import { generateSpecifiedWorld } from '../core/worldModel/specification/compiler';
import { TemporalCinematicSim3D } from '../core/temporalCinematic/temporalCinematicSim3D';

describe('Temporal Cinematic Engine — historical parameterization', () => {
  it('resolves a deterministic, year-independent geography profile for the same place', () => {
    const a = resolvePlaceGeography('Warsaw');
    const b = resolvePlaceGeography('Warsaw');
    expect(a).toEqual(b);
    expect(a.citySizeM).toBeGreaterThan(0);
    expect(a.districtCount).toBeGreaterThan(0);
  });

  it('is case/whitespace-insensitive for the same place', () => {
    expect(resolvePlaceGeography('warsaw')).toEqual(resolvePlaceGeography('  Warsaw  '));
  });

  it('resolves different geography profiles for different places (not a fixed constant)', () => {
    const warsaw = resolvePlaceGeography('Warsaw');
    const london = resolvePlaceGeography('London');
    expect(warsaw).not.toEqual(london);
  });

  it('era profile grows monotonically-ish with year (a real, if coarse, historical trend)', () => {
    expect(resolveEraProfile(1800).maxFloors).toBeLessThan(resolveEraProfile(1900).maxFloors);
    expect(resolveEraProfile(1900).maxFloors).toBeLessThan(resolveEraProfile(2024).maxFloors);
  });

  it('produces distinct world ids for the same place in different years', () => {
    expect(historicalWorldId('Warsaw', 1900)).not.toBe(historicalWorldId('Warsaw', 2026));
  });

  it('builds a valid, compilable WorldSpecification for a historical request', () => {
    const spec = buildHistoricalWorldSpecification({ place: 'Warsaw', year: 1920 });
    const specified = generateSpecifiedWorld(spec);
    expect(specified.graph.listEntities().length).toBeGreaterThan(0);
    expect(spec.provenanceNote).toMatch(/NOT a real historical reconstruction/);
  });
});

describe('Temporal Cinematic Engine — render readiness', () => {
  it('gives every geometry entity a real spatial.position and reclassifies default grounding to PROCEDURAL_APPROXIMATION', () => {
    const spec = buildHistoricalWorldSpecification({ place: 'Warsaw', year: 1980 });
    const specified = generateSpecifiedWorld(spec);
    const geometryEntities = specified.graph.listEntities().filter((e) => e.geometry && e.geometry.kind !== 'NAV_EDGE');
    expect(geometryEntities.some((e) => !e.spatial)).toBe(true); // confirms the gap exists before the fix

    const report = applyGeometryRenderReadiness(specified.graph);
    expect(report.spatialAdded.length).toBeGreaterThan(0);
    expect(report.groundingReclassified.length).toBeGreaterThan(0);

    for (const entity of specified.graph.listEntities()) {
      if (entity.geometry && entity.geometry.kind !== 'NAV_EDGE') {
        expect(entity.spatial).toBeDefined();
        expect(entity.grounding).toBe('PROCEDURAL_APPROXIMATION');
      }
    }
  });

  it('is idempotent — a second pass changes nothing further', () => {
    const spec = buildHistoricalWorldSpecification({ place: 'Warsaw', year: 1980 });
    const specified = generateSpecifiedWorld(spec);
    applyGeometryRenderReadiness(specified.graph);
    const second = applyGeometryRenderReadiness(specified.graph);
    expect(second.spatialAdded).toHaveLength(0);
    expect(second.groundingReclassified).toHaveLength(0);
  });

  it('never touches an entity that already has a real domain binding', () => {
    // A CITY template's own structural root entities (city/district containers from templates.ts,
    // not geometry.ts) may carry no geometry at all — applyGeometryRenderReadiness must skip them
    // (guarded by `if (!entity.geometry) continue`), never invent geometry-derived spatial for them.
    const spec = buildHistoricalWorldSpecification({ place: 'Warsaw', year: 1980 });
    const specified = generateSpecifiedWorld(spec);
    const before = specified.graph.listEntities().filter((e) => !e.geometry).map((e) => ({ id: e.id, spatial: e.spatial, grounding: e.grounding }));
    applyGeometryRenderReadiness(specified.graph);
    for (const snapshot of before) {
      const after = specified.graph.getEntity(snapshot.id);
      expect(after.spatial).toEqual(snapshot.spatial);
      expect(after.grounding).toBe(snapshot.grounding);
    }
  });
});

describe('Temporal Cinematic Engine — camera path', () => {
  it('builds a walk path along a real generated road, sampling from start to end', () => {
    const spec = buildHistoricalWorldSpecification({ place: 'Warsaw', year: 2024 });
    const specified = generateSpecifiedWorld(spec);
    const road = getRoadByIndex(specified.graph, 0);
    expect(road).toBeDefined();
    const path = buildWalkCameraPath(road!, { durationSeconds: 10, frameRate: 24 });
    expect(path.keyframes.length).toBe(240);
    expect(path.keyframes[0].position.x).toBeCloseTo(path.startPoint.x);
    expect(path.keyframes[path.keyframes.length - 1].position.x).toBeCloseTo(path.endPoint.x);
    expect(path.totalDistanceM).toBeGreaterThan(0);
  });

  it('throws for a non-ROAD entity', () => {
    const spec = buildHistoricalWorldSpecification({ place: 'Warsaw', year: 2024 });
    const specified = generateSpecifiedWorld(spec);
    const building = specified.graph.listEntities().find((e) => e.geometry?.kind === 'BUILDING')!;
    expect(() => buildWalkCameraPath(building)).toThrow();
  });

  it('interpolates position and look target continuously between canonical keyframes', () => {
    const path = {
      roadEntityId: 'road:test',
      startPoint: { x: 0, z: 0 },
      endPoint: { x: 10, z: 20 },
      totalDistanceM: Math.hypot(10, 20),
      durationSeconds: 10,
      keyframes: [
        { t: 0, position: { x: 0, y: 1.7, z: 0 }, lookAt: { x: 2, y: 1.7, z: 4 } },
        { t: 10, position: { x: 10, y: 2.7, z: 20 }, lookAt: { x: 12, y: 2.7, z: 24 } },
      ],
    } as const;
    expect(sampleCameraPath(path, 2.5)).toEqual({
      t: 2.5,
      position: { x: 2.5, y: 1.95, z: 5 },
      lookAt: { x: 4.5, y: 1.95, z: 9 },
    });
    expect(sampleCameraPath(path, -5).position).toEqual(path.keyframes[0].position);
    expect(sampleCameraPath(path, 50).position).toEqual(path.keyframes[1].position);
  });
});

describe('Temporal Cinematic Engine — prompt parser', () => {
  it('parses the Polish flagship prompt', () => {
    const result = parseTemporalCinematicPrompt('Wygeneruj 20-sekundowy film Warszawy w 1920 roku, kamera idzie ulicą, pada deszcz');
    expect(result.ok).toBe(true);
    expect(result.request?.place).toBe('Warszawy');
    expect(result.request?.year).toBe(1920);
    expect(result.request?.durationSeconds).toBe(20);
    expect(result.request?.cameraMode).toBe('walk');
    expect(result.request?.weather).toBe('rain');
  });

  it('parses an English equivalent', () => {
    const result = parseTemporalCinematicPrompt('Show me Warsaw in 1920, 20 seconds, walking down the street, raining');
    expect(result.ok).toBe(true);
    expect(result.request?.year).toBe(1920);
    expect(result.request?.durationSeconds).toBe(20);
  });

  it('parses a two-year comparison request', () => {
    const result = parseTemporalCinematicPrompt('Pokaż tę samą ulicę Warszawy w 1900 i 2026');
    expect(result.ok).toBe(true);
    expect(result.request?.year).toBe(1900);
    expect(result.request?.compareYear).toBe(2026);
  });

  it('reports issues rather than guessing when no year is present', () => {
    const result = parseTemporalCinematicPrompt('Pokaż mi jakieś miasto');
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.field === 'year')).toBe(true);
  });
});

describe('Temporal Cinematic Engine — the critical acceptance test: same street, two years', () => {
  it('places the SAME road at the SAME location in 1900 and 2026 while the skyline genuinely differs', () => {
    const comparison = compareSameStreetAcrossYears('Warsaw', 1900, 2026);
    expect(comparison.sameStreetLocation).toBe(true);
    expect(comparison.skylineDiffers).toBe(true);
    expect(comparison.sceneA.camera).toHaveProperty('keyframes');
    expect(comparison.sceneB.camera).toHaveProperty('keyframes');
  });

  it('is fully deterministic — the same request twice yields byte-identical camera paths', () => {
    const first = compareSameStreetAcrossYears('Krakow', 1850, 2020);
    const second = compareSameStreetAcrossYears('Krakow', 1850, 2020);
    expect(JSON.stringify(first.sceneA.camera)).toBe(JSON.stringify(second.sceneA.camera));
    expect(JSON.stringify(first.sceneB.camera)).toBe(JSON.stringify(second.sceneB.camera));
  });

  it('reports a blocked (not silently substituted) camera for an unimplemented mode', () => {
    const scene = buildHistoricalScene({ place: 'Warsaw', year: 2000, cameraMode: 'drive' });
    expect(scene.camera).toMatchObject({ ok: false });
  });
});

describe('Temporal Cinematic Engine — honest runtime status', () => {
  it('never claims render-to-video is ready while real blockers are recorded', () => {
    expect(TEMPORAL_CINEMATIC_RUNTIME_BLOCKERS.length).toBeGreaterThan(0);
    expect(isRenderToVideoReady()).toBe(false);
    for (const blocker of TEMPORAL_CINEMATIC_RUNTIME_BLOCKERS) {
      expect(blocker.code).toBe('BLOCKED_BY_RUNTIME');
    }
  });
});

describe('Temporal Cinematic Engine — canonical capture evidence', () => {
  it('links a real artifact hash and semantic fingerprint through the canonical ledger', () => {
    const ledger = new EvidenceLedger({ now: () => 123 });
    const contentHash = recordTemporalCaptureArtifact(ledger, {
      worldId: 'historical:warsaw:2026',
      place: 'Warsaw',
      year: 2026,
      seconds: 1.5,
      artifactFile: 'street-1.5.png',
      artifactSha256: 'a'.repeat(64),
      semanticFingerprint: 'deadbeef',
      viewMode: 'street',
    });
    expect(contentHash).toHaveLength(64);
    expect(ledger.getActive()[0]?.claim).toContain('sha256=' + 'a'.repeat(64));
    expect(ledger.verifyLedger()).toEqual({ ok: true, errors: [] });
    expect(() => recordTemporalCaptureArtifact(ledger, {
      worldId: 'x', place: 'x', year: 2026, seconds: 0, artifactFile: 'x.png', artifactSha256: 'bad', semanticFingerprint: 'deadbeef', viewMode: 'street',
    })).toThrow(/INVALID_SHA256/);
  });
});

describe('Temporal Cinematic Engine — real camera discontinuity guard', () => {
  it('advances a continuity epoch on a seek and reports that no TAA history exists to reset', () => {
    const scene = buildHistoricalScene({ place: 'Warsaw', year: 2026, durationSeconds: 12 });
    if (!('keyframes' in scene.camera)) throw new Error('expected canonical walk camera');
    const sim = new TemporalCinematicSim3D(scene.world.engine, scene.camera, { navigationMode: 'CINEMATIC' });
    expect(sim.getPresentationSummary().continuityEpoch).toBe(0);
    sim.seekTo(8);
    const summary = sim.getPresentationSummary();
    expect(summary.continuityEpoch).toBe(1);
    expect(summary.lastDiscontinuity).toEqual({ fromSeconds: 0, toSeconds: 8, reason: 'SEEK' });
    expect(summary.temporalAccumulation).toBe('NOT_PRESENT');
  });
});
