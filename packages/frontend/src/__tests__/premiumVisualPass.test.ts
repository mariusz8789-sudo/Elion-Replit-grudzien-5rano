import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createHumanDigitalTwinManifest } from '../core/scientificWorlds/humanLab/anatomyAtlas';
import { buildCellModel, createHistologySlide } from '../core/scientificWorlds/humanLab/histology';
import type { HyperscopeArtifact } from '../core/scientificWorlds/biologyRunners';
import { HumanMacroMicroLayer } from '../core/three/humanMacroMicroLayer';
import { createPremiumLabDetail } from '../core/three/premiumLabDetail';
import { directGenesisPromptWorld } from '../core/worldDirector/genesisWorldDirector';
import { createSpacetimeWorldVisualLayer } from '../core/three/spacetimeWorldVisuals';
import { buildHistoricalWorldSpecification } from '../core/temporalCinematic/historicalWorldParameters';
import { generateSpecifiedWorld } from '../core/worldModel/specification/compiler';
import { findScientificInteriorTarget, createScientificAssetSlotVisual } from '../core/temporalCinematic/scientificInteriorVisuals';
import type { HighFidelityMaterialPalette } from '../core/three/graphics/highFidelityMaterialRegistry';

function testPalette(): HighFidelityMaterialPalette {
  const material = () => new THREE.MeshStandardMaterial();
  return {
    white: material(), dark: material(), stainless: material(), chrome: material(), glass: material(),
    medical: material(), floor: material(), wall: material(), concrete: material(), asphalt: material(),
    wetAsphalt: material(), brick: material(), ground: material(), foliage: material(), skin: material(),
    fabric: material(), blueGlow: material(), redGlow: material(),
  };
}

function names(root: THREE.Object3D): string[] {
  const result: string[] = [];
  root.traverse((object) => { if (object.name) result.push(object.name); });
  return result;
}

describe('Genesis Premium Visual Pass V1', () => {
  it('adds deterministic lab micro-detail without owning a second lab or renderer', () => {
    const handle = createPremiumLabDetail(THREE, {
      world: 'biology',
      room: { minX: -8, maxX: 8, minZ: -10, maxZ: 10 },
      ceilingY: 3.8,
      stations: [
        { kind: 'microscopy', position: { x: -3, z: 2 }, facing: 0 },
        { kind: 'human-study', position: { x: 2, z: 0 }, facing: Math.PI / 2 },
      ],
      tier: 'high',
    });
    const objectNames = names(handle.root);
    expect(handle.root.userData.presentationOnly).toBe(true);
    expect(handle.root.userData.scientificStateMutation).toBe(false);
    expect(objectNames).toContain('premium-lab-overhead-service-rails');
    expect(objectNames).toContain('premium-lab-ceiling-vent-bank');
    expect(objectNames).toContain('premium-lab-station-key-array');
    expect(handle.summary.keyCount).toBeGreaterThan(20);
    expect(handle.root.getObjectByName('premium-lab-station-key-array')?.userData.scientificStateMutation).toBe(false);
    handle.update(2.5);
    handle.dispose();
    expect(handle.root.parent).toBeNull();
  });

  it('does not place floating keyboard detail on non-console stations', () => {
    const handle = createPremiumLabDetail(THREE, {
      world: 'physics',
      room: { minX: -8, maxX: 8, minZ: -10, maxZ: 10 },
      ceilingY: 3.8,
      stations: [
        { kind: 'window', position: { x: -3, z: 2 }, facing: 0 },
        { kind: 'human-study', position: { x: 2, z: 0 }, facing: Math.PI / 2 },
        { kind: 'imaging', position: { x: 0, z: -3 }, facing: Math.PI },
      ],
      tier: 'high',
    });
    expect(handle.summary.keyCount).toBe(0);
    expect(handle.root.getObjectByName('premium-lab-station-key-array')).toBeUndefined();
    handle.dispose();
  });

  it('upgrades organ and cell presentation while preserving MODEL / not-direct-observation semantics', () => {
    const manifest = createHumanDigitalTwinManifest('HDT-premium-test');
    const layer = new HumanMacroMicroLayer(THREE, manifest);
    layer.setOrgan('heart');
    let objectNames = names(layer.group);
    expect(objectNames).toContain('organ:premium-surface-detail');
    expect(objectNames).toContain('organ:premium-surface-contour:0');
    expect(layer.group.userData.epistemic).toBe('MODEL');
    expect(layer.group.userData.directObservation).toBe(false);

    const slide = createHistologySlide('specimen-premium', 'CARDIAC');
    const cell = buildCellModel(slide, 17);
    const artifact: HyperscopeArtifact = {
      kind: 'hyperscope',
      cell,
      capture: {
        captureId: 'HSC-premium-100', specimenId: slide.specimenId,
        request: { specimenId: slide.specimenId, mode: 'CELL_MODEL', magnification: 100, fieldOfViewMicrometers: 100, resolutionWidthPx: 512, resolutionHeightPx: 512 },
        generatedAtLogicalTime: 1, outputHash: 'premium-cell', epistemic: 'MODEL', visualResolutionMultiplier: 6,
        sourceNote: 'premium visual test fixture',
      },
    };
    layer.setArtifact(artifact);
    objectNames = names(layer.group);
    expect(objectNames).toContain('cell:premium-membrane-detail');
    expect(objectNames).toContain('cell:membrane-lipid-head-guides');
    expect(layer.group.getObjectByName('cell:membrane-lipid-head-guides')?.userData.directObservation).toBe(false);
    layer.dispose();
  });

  it.each([
    ['Create a Mars research world.', 'MARS_STATION', 'premium-mars-instanced-regolith-microdetail'],
    ['Create an underwater research city.', 'UNDERWATER_CITY', 'premium-underwater-instanced-seabed-flora'],
    ['Generate an Einstein-Rosen bridge.', 'WORMHOLE_RINGS', 'premium-space-parallax-star-shell'],
    ['Create a cosmology world with gravity wells, dark matter and time dilation.', 'GRAVITY_WELL_GRID', 'premium-space-parallax-star-shell'],
    ['Create a quantum world explaining superposition and tunneling.', 'QUANTUM_BARRIER', 'premium-quantum-incoming-probability-context'],
    ['Create a time dilation laboratory.', 'RELATIVISTIC_CLOCKS', 'premium-relativistic-reference-frame-rings'],
    ['Create 5 alternative timeline worlds.', 'TIMELINE_BRANCHES', 'premium-timeline-counterfactual-depth-field'],
    ['Create a historical Boston battle reconstruction.', 'HISTORICAL_CITY', 'premium-historical-instanced-street-posts'],
    ['Create a desert alien planet with ruins and two suns.', 'ALIEN_DESERT', 'premium-alien-instanced-mineral-spires'],
  ] as const)('mounts one honest premium child on the canonical spacetime layer: %s', (prompt, kind, expectedName) => {
    const directed = directGenesisPromptWorld(prompt);
    const descriptorSnapshot = JSON.stringify(directed.descriptor);
    const graphSnapshot = JSON.stringify(directed.runtime.engine.graph.listEntities());
    const handle = createSpacetimeWorldVisualLayer(THREE, directed.descriptor, directed.runtime.engine.graph);
    const premium = handle.root.getObjectByName(`premium-spacetime-detail:${kind.toLowerCase()}`);
    expect(premium).toBeTruthy();
    expect(premium?.userData.presentationOnly).toBe(true);
    expect(premium?.userData.scientificStateMutation).toBe(false);
    expect(handle.root.getObjectByName(expectedName)?.userData.directObservation).toBe(false);
    if (kind === 'GRAVITY_WELL_GRID') {
      const shell = handle.root.getObjectByName('premium-cosmology-field-context-shell') as THREE.Mesh;
      const material = shell.material as THREE.MeshBasicMaterial;
      expect(material.wireframe).toBe(false);
      expect(material.blending).toBe(THREE.AdditiveBlending);
      expect(shell.userData.visualAnalogy).toBe('FIELD_CONTEXT_GUIDE_NOT_SOLVER_OUTPUT');
    }
    handle.update(4.2);
    expect(JSON.stringify(directed.descriptor)).toBe(descriptorSnapshot);
    expect(JSON.stringify(directed.runtime.engine.graph.listEntities())).toBe(graphSnapshot);
    handle.dispose();
  });

  it('adds premium Materials/Compute geometry while keeping compute and instruments UNBOUND', () => {
    const generated = generateSpecifiedWorld(buildHistoricalWorldSpecification({ place: 'Vienna', year: 2026, generateInteriors: true, generateNavigation: true }));
    const target = findScientificInteriorTarget(generated.graph, 'MATERIALS_LAB');
    expect(target).not.toBeNull();
    const palette = testPalette();
    const slots = target!.assetSlotIds.map((id) => generated.graph.getEntity(id));
    const computeSlot = slots.find((slot) => slot.geometry?.kind === 'ASSET_SLOT' && slot.geometry.slotType === 'COMPUTE_STATION');
    const spectrometerSlot = slots.find((slot) => slot.geometry?.kind === 'ASSET_SLOT' && slot.geometry.slotType === 'SPECTROMETER_STATION');
    expect(computeSlot).toBeTruthy(); expect(spectrometerSlot).toBeTruthy();
    const compute = createScientificAssetSlotVisual(THREE, computeSlot!, palette);
    const spectrometer = createScientificAssetSlotVisual(THREE, spectrometerSlot!, palette);
    expect(compute.userData.computeBinding).toBe('UNBOUND');
    expect(spectrometer.userData.instrumentState).toBe('UNBOUND');
    expect(names(compute)).toContain('premium-compute-rack-fan-bank');
    expect(names(spectrometer)).toContain('premium-spectrometer-vial-rack');
    expect(compute.getObjectByName('premium-compute-rack-fan-bank')?.userData.scientificStateMutation).toBe(false);
  });
});
