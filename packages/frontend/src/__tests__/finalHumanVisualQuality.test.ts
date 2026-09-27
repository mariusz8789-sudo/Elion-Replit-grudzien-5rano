import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { centralDogmaReport } from '@genesis/core/knowledge/molecularBiology.js';
import type { BiologyArtifact, HyperscopeArtifact } from '../core/scientificWorlds/biologyRunners';
import { createHistologySlide, buildCellModel } from '../core/scientificWorlds/humanLab/histology';
import { createHumanDigitalTwinManifest } from '../core/scientificWorlds/humanLab/anatomyAtlas';
import { createEpoxyFloor, createTwinProxy } from '../core/three/biologyLabKit';
import { HUMAN_VISUAL_QUALITY_PROFILE, HumanMacroMicroLayer } from '../core/three/humanMacroMicroLayer';

function objectNames(root: THREE.Object3D): string[] {
  const names: string[] = [];
  root.traverse((object) => { if (object.name) names.push(object.name); });
  return names;
}

describe('final Human Explorer visual-quality pass', () => {
  const manifest = createHumanDigitalTwinManifest('HDT-final-visual-test');
  const slide = createHistologySlide('specimen-visual-test', 'CARDIAC');
  const cell = buildCellModel(slide, 17);
  const hyperscope = (magnification: 100 | 500): HyperscopeArtifact => ({
    kind: 'hyperscope',
    cell,
    capture: {
      captureId: `HSC-visual-${magnification}`,
      specimenId: slide.specimenId,
      request: { specimenId: slide.specimenId, mode: 'CELL_MODEL', magnification, fieldOfViewMicrometers: 100, resolutionWidthPx: 512, resolutionHeightPx: 512 },
      generatedAtLogicalTime: 1,
      outputHash: `visual-${magnification}`,
      epistemic: 'MODEL',
      visualResolutionMultiplier: 6,
      sourceNote: 'deterministic visual-quality fixture',
    },
  });

  it('keeps the cinematic presentation explicitly illustrative and evidence-bound', () => {
    expect(HUMAN_VISUAL_QUALITY_PROFILE).toEqual({
      tier: 'PROCEDURAL_CINEMATIC_MODEL',
      source: 'CANONICAL_MANIFEST_OR_SEALED_ARTIFACT',
      anatomicalPrecision: 'ILLUSTRATIVE_GEOMETRY',
      palette: 'BIOMEDICAL_PBR',
      motion: 'DETERMINISTIC_SCENE_TIME',
    });
    const layer = new HumanMacroMicroLayer(THREE, manifest);
    layer.setArtifact({ kind: 'histology', slide, cell });
    const names = objectNames(layer.group);
    expect(names).toContain('macro-stage:plinth');
    expect(names).toContain('macro-rotor');
    expect(names.filter((name) => name.startsWith('tissue:matrix-fiber:'))).toHaveLength(6);
    const root = layer.group.children.find((object) => object.name.startsWith('macro-tissue:'));
    expect(root?.userData).toMatchObject({ epistemic: 'MODEL', directObservation: false, visualScaleNotPhysical: true, visualQuality: 'PROCEDURAL_CINEMATIC_MODEL', anatomicalPrecision: 'ILLUSTRATIVE_GEOMETRY' });
    layer.dispose();
  });

  it('renders a layered cell and detailed organelle from the canonical seeded CellModel', () => {
    const layer = new HumanMacroMicroLayer(THREE, manifest);
    layer.setArtifact(hyperscope(100));
    const cellNames = objectNames(layer.group);
    expect(cellNames).toContain('cell:membrane');
    expect(cellNames).toContain('cell:cytoplasm');
    expect(cellNames.some((name) => name.startsWith('cell:organelle:nucleus:'))).toBe(true);
    expect(cellNames).toContain('cell:nucleolus:illustrative');

    layer.setArtifact(hyperscope(500));
    const organelleNames = objectNames(layer.group);
    expect(organelleNames).toContain('organelle:mitochondrion-outer-membrane');
    expect(organelleNames).toContain('organelle:mitochondrion-inner-volume');
    expect(organelleNames.filter((name) => name.startsWith('organelle:crista:'))).toHaveLength(7);
    layer.dispose();
  });

  it('uses the actual central-dogma sequence for a dense double helix and translation product', () => {
    const report = centralDogmaReport('ATGGCCTTAGTGAAGCACGGTACCTTCGAATGGTGA');
    const artifact: BiologyArtifact = { kind: 'central-dogma', report };
    const layer = new HumanMacroMicroLayer(THREE, manifest);
    layer.setArtifact(artifact);
    const names = objectNames(layer.group);
    expect(names).toContain('dna:backbone:a');
    expect(names).toContain('dna:backbone:b');
    expect(names).toContain('dna:translation-product');
    expect(names.filter((name) => name.startsWith('dna:base-pair:'))).toHaveLength(report.dna.length);
    expect(layer.getState()).toMatchObject({ level: 'molecule', evidenceLabel: 'MODEL_NOT_DIRECT_OBSERVATION' });
    layer.dispose();
  });

  it('reduces floor glare and keeps the body proxy explicitly presentation-only', () => {
    const context = {
      createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
      putImageData: () => undefined,
    };
    const canvas = { width: 0, height: 0, getContext: () => context };
    vi.stubGlobal('document', { createElement: () => canvas });
    try {
      const floor = createEpoxyFloor(THREE);
      expect(floor.name).toBe('biology-epoxy-cinematic');
      expect(floor.userData.finish).toBe('MATTE_EPOXY_LOW_GLARE');
      expect(floor.roughness).toBeGreaterThanOrEqual(0.45);
      expect(floor.color.getHex()).toBe(0x14232c);

      const twin = createTwinProxy(THREE, manifest, { skinHex: '#d6ae91', hologram: true });
      const points = twin.group.getObjectByName('twin:points') as THREE.Points;
      expect((points.material as THREE.PointsMaterial).opacity).toBeLessThanOrEqual(0.68);
      expect(twin.tier).toBe('PROXY');
      twin.dispose(); floor.dispose();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
