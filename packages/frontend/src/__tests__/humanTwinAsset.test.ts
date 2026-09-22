import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { HUMAN_TWIN_RUNTIME_PATH, evaluateHumanTwinAsset, humanTwinProvenanceLabel, type LoadedHumanTwinBody } from '../core/three/humanTwinAsset';
import { createTwinProxy } from '../core/three/biologyLabKit';
import { createHumanDigitalTwinManifest } from '../core/scientificWorlds/humanLab/anatomyAtlas';
import { DEFAULT_CUTAWAY, measureCutawayBounds, planeFromState, SECTION_AXIS_LABEL_PL, type CutawayBounds } from '../core/three/humanTwinCutaway';
import { easeInOutCubic, selectionPulse } from '../core/three/humanTwinMaterials';
import { getWorldAssetRecord } from '../core/three/assetGovernance';

const BOUNDS: CutawayBounds = { minX: -0.4, maxX: 0.4, minY: 0, maxY: 1.75, minZ: -0.2, maxZ: 0.2 };

describe('human twin asset gate (D-131) — a licensed body, never a medical claim', () => {
  it('approves the verified CC0 asset and reports the licensed tier', () => {
    const gate = evaluateHumanTwinAsset();
    expect(gate.enabled).toBe(true);
    expect(gate.reason).toBe('OK');
    expect(gate.tier).toBe('LICENSED_CC0_ASSET');
    expect(gate.record?.license).toBe('CC0-1.0');
    expect(gate.runtimePath).toBe(HUMAN_TWIN_RUNTIME_PATH);
  });

  it('refuses anything without a manifest record, and never invents a tier for it', () => {
    const gate = evaluateHumanTwinAsset('/assets/nie-ma-takiego/model.glb');
    expect(gate.enabled).toBe(false);
    expect(gate.reason).toBe('NO_MANIFEST_RECORD');
    expect(gate.tier).toBe('PROXY');
    expect(gate.record).toBeNull();
  });

  it('refuses an asset whose record exists but is not approved', () => {
    const gate = evaluateHumanTwinAsset('/assets/genesis-hf/pbr/');
    expect(gate.enabled).toBe(false);
    expect(gate.reason).toBe('NOT_APPROVED');
    expect(gate.tier).toBe('PROXY');
  });

  it('the approved record carries the checksum of the very file that will be fetched', () => {
    const record = getWorldAssetRecord(HUMAN_TWIN_RUNTIME_PATH);
    const fileName = HUMAN_TWIN_RUNTIME_PATH.slice(HUMAN_TWIN_RUNTIME_PATH.lastIndexOf('/') + 1);
    expect(record?.sha256[fileName]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('the HUD label keeps the two facts apart: what the body is, and what the anatomy is worth', () => {
    expect(humanTwinProvenanceLabel('LICENSED_CC0_ASSET')).toBe('CC0 · ANATOMIA: MODEL');
    expect(humanTwinProvenanceLabel('PROXY')).toBe('PROXY · ANATOMIA: MODEL');
    // A better-looking body never upgrades the anatomy: both labels still say MODEL.
    for (const tier of ['LICENSED_CC0_ASSET', 'PROXY'] as const) {
      expect(humanTwinProvenanceLabel(tier)).toContain('MODEL');
      expect(humanTwinProvenanceLabel(tier)).not.toMatch(/REAL_OBSERVATION|MEDYCZN|pacjent/i);
    }
  });
});

describe('cutaway geometry (D-131) — a schematic section, computed, not guessed', () => {
  it('each anatomical axis produces its own plane normal', () => {
    expect(planeFromState({ ...DEFAULT_CUTAWAY, axis: 'SAGITTAL' }, BOUNDS).normal).toEqual([1, 0, 0]);
    expect(planeFromState({ ...DEFAULT_CUTAWAY, axis: 'CORONAL' }, BOUNDS).normal).toEqual([0, 0, 1]);
    expect(planeFromState({ ...DEFAULT_CUTAWAY, axis: 'AXIAL' }, BOUNDS).normal).toEqual([0, 1, 0]);
  });

  it('the plane travels inside the body bounds, so a cut always meets the twin', () => {
    const lo = planeFromState({ ...DEFAULT_CUTAWAY, axis: 'AXIAL', position: 0 }, BOUNDS);
    const mid = planeFromState({ ...DEFAULT_CUTAWAY, axis: 'AXIAL', position: 0.5 }, BOUNDS);
    const hi = planeFromState({ ...DEFAULT_CUTAWAY, axis: 'AXIAL', position: 1 }, BOUNDS);
    // constant = -at, so it decreases as the plane rises through the body.
    expect(-lo.constant).toBeCloseTo(BOUNDS.minY, 6);
    expect(-mid.constant).toBeCloseTo((BOUNDS.minY + BOUNDS.maxY) / 2, 6);
    expect(-hi.constant).toBeCloseTo(BOUNDS.maxY, 6);
  });

  it('flipping mirrors the normal and the constant, so the other half is removed', () => {
    const a = planeFromState({ ...DEFAULT_CUTAWAY, position: 0.3 }, BOUNDS);
    const b = planeFromState({ ...DEFAULT_CUTAWAY, position: 0.3, flipped: true }, BOUNDS);
    expect(b.normal).toEqual([-a.normal[0], -a.normal[1], -a.normal[2]]);
    expect(b.constant).toBeCloseTo(-a.constant, 9);
  });

  it('positions outside 0..1 are clamped rather than extrapolated off the body', () => {
    expect(planeFromState({ ...DEFAULT_CUTAWAY, axis: 'AXIAL', position: -5 }, BOUNDS).constant)
      .toBeCloseTo(planeFromState({ ...DEFAULT_CUTAWAY, axis: 'AXIAL', position: 0 }, BOUNDS).constant, 9);
    expect(planeFromState({ ...DEFAULT_CUTAWAY, axis: 'AXIAL', position: 9 }, BOUNDS).constant)
      .toBeCloseTo(planeFromState({ ...DEFAULT_CUTAWAY, axis: 'AXIAL', position: 1 }, BOUNDS).constant, 9);
  });

  it('the default state is off, and every axis has a human-readable Polish label', () => {
    expect(DEFAULT_CUTAWAY.enabled).toBe(false);
    expect(SECTION_AXIS_LABEL_PL.SAGITTAL).toMatch(/strzałkowy/);
    expect(SECTION_AXIS_LABEL_PL.CORONAL).toMatch(/czołowy/);
    expect(SECTION_AXIS_LABEL_PL.AXIAL).toMatch(/poprzeczny/);
  });

  it('bounds come from the object itself (measured through the injected three)', () => {
    const fakeBox = {
      min: { x: -1, y: 0, z: -2 }, max: { x: 1, y: 2, z: 2 },
      setFromObject() { return this; },
    };
    const THREE = { Box3: function Box3(this: unknown) { return fakeBox; } } as unknown as Parameters<typeof measureCutawayBounds>[0];
    const bounds = measureCutawayBounds(THREE, {} as never);
    expect(bounds).toEqual({ minX: -1, maxX: 1, minY: 0, maxY: 2, minZ: -2, maxZ: 2 });
  });
});

describe('twin camera (D-131) — a third camera that frames the body, and changes nothing else', () => {
  it('is a real mode of the existing camera union, distinct from the two agent cameras', async () => {
    const mod = await import('../core/three/agentLabScene3D');
    const scene = new mod.AgentLabScene3D(
      { } as never,
      [],
      { minX: -5, maxX: 5, minZ: -5, maxZ: 5 } as never,
      'biology',
    );
    expect(scene.getCameraMode()).toBe('VISOR');
    scene.setCameraMode('TWIN');
    expect(scene.getCameraMode()).toBe('TWIN');
    scene.setCameraMode('SPECTATOR');
    expect(scene.getCameraMode()).toBe('SPECTATOR');
  });

  it('carries the four body-shell presentations, defaulting to plain skin', async () => {
    const mod = await import('../core/three/agentLabScene3D');
    const scene = new mod.AgentLabScene3D({ } as never, [], { minX: -5, maxX: 5, minZ: -5, maxZ: 5 } as never, 'biology');
    expect(scene.getTwinSurface()).toBe('NORMAL');
    for (const mode of ['TRANSLUCENT', 'XRAY', 'GHOST', 'NORMAL'] as const) {
      scene.setTwinSurface(mode);
      expect(scene.getTwinSurface()).toBe(mode);
    }
    // The surface is presentation: it can never change what the anatomy label says.
    scene.setTwinSurface('XRAY');
    expect(humanTwinProvenanceLabel(scene.getTwinTier())).toContain('ANATOMIA: MODEL');
  });
});

describe('human twin runtime LOD — one twin, two body representations', () => {
  it('switches the licensed GLB and existing proxy without replacing organ interaction meshes', () => {
    const assetRoot = new THREE.Group(); assetRoot.name = 'licensed-body';
    const assetMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.7, 0.25), new THREE.MeshStandardMaterial());
    assetRoot.add(assetMesh);
    const asset = {
      root: assetRoot, meshes: [assetMesh], morphs: new Map(), heightMeters: 1.75,
      tier: 'LICENSED_CC0_ASSET', record: {} as LoadedHumanTwinBody['record'],
    } satisfies LoadedHumanTwinBody;
    const twin = createTwinProxy(THREE, createHumanDigitalTwinManifest('HDT-lod-test'), { skinHex: '#d9a58d', bodyAsset: asset });
    const organs = twin.organs;

    expect(twin.getLodState().level).toBe('FULL_ASSET');
    expect(twin.getLodState().available).toEqual(['FULL_ASSET', 'PROXY_LOW']);
    expect(assetRoot.visible).toBe(true);
    expect(twin.body.root.visible).toBe(false);

    twin.setLod('PROXY_LOW');
    expect(twin.getLodState().level).toBe('PROXY_LOW');
    expect(twin.getLodState().metrics.triangleCount).toBeGreaterThan(0);
    expect(assetRoot.visible).toBe(false);
    expect(twin.body.root.visible).toBe(true);
    expect(twin.organs).toBe(organs);

    twin.setLod('FULL_ASSET');
    expect(assetRoot.visible).toBe(true);
    expect(twin.body.root.visible).toBe(false);
    expect(twin.organs).toBe(organs);
    twin.dispose();
  });
});

describe('twin effect helpers (D-131) — deterministic presentation, never session data', () => {
  it('the easing is clamped, monotone and symmetric at the ends', () => {
    expect(easeInOutCubic(-3)).toBe(0);
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    expect(easeInOutCubic(5)).toBe(1);
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 6);
    expect(easeInOutCubic(0.25)).toBeLessThan(easeInOutCubic(0.75));
  });

  it('the selection pulse stays inside 0..1 and repeats deterministically', () => {
    for (const t of [0, 0.3, 1.1, 7.7, 120]) {
      const v = selectionPulse(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    expect(selectionPulse(2)).toBeCloseTo(selectionPulse(2), 12);
  });
});

describe('anatomy interaction → section and isolation (D-131) — through the existing V3 reducers', () => {
  it('SET_CUTAWAY and ISOLATE_NODE drive the state the renderer reads; unknown nodes are refused', async () => {
    const { applyAnatomyInteraction } = await import('../components/ScientificWorldsScreen');
    const { createDefaultAnatomyView } = await import('../core/scientificWorlds/humanLab/anatomyView');
    const { createHumanDigitalTwinManifest } = await import('../core/scientificWorlds/humanLab/anatomyAtlas');
    const manifest = createHumanDigitalTwinManifest('HDT-test');
    const base = createDefaultAnatomyView('HDT-test');

    const cut = applyAnatomyInteraction(base, { action: 'SET_CUTAWAY' }, manifest);
    expect(cut.error).toBeNull();
    expect(cut.state.cutawayEnabled).toBe(true);
    expect(applyAnatomyInteraction(cut.state, { action: 'SET_CUTAWAY', enabled: false }, manifest).state.cutawayEnabled).toBe(false);

    const iso = applyAnatomyInteraction(base, { action: 'ISOLATE_NODE', focus: 'heart' }, manifest);
    expect(iso.error).toBeNull();
    expect(iso.state.isolatedNodeIds).toEqual(['heart']);
    expect(applyAnatomyInteraction(iso.state, { action: 'CLEAR_ISOLATION' }, manifest).state.isolatedNodeIds).toEqual([]);

    // A node that is not in the atlas is refused with a reason — never invented.
    const bad = applyAnatomyInteraction(base, { action: 'ISOLATE_NODE', focus: 'nie-ma-takiego-narzadu' }, manifest);
    expect(bad.error).toBeTruthy();
    expect(bad.state).toBe(base);

    // The existing actions keep working exactly as before.
    expect(applyAnatomyInteraction(base, { action: 'FOCUS_ANATOMY', focus: 'brain', mode: 'BRAIN' }, manifest).state.displayMode).toBe('BRAIN');
  });
});
