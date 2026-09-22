import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { centralDogmaReport } from '@genesis/core/knowledge/molecularBiology.js';
import type { BiologyArtifact, HyperscopeArtifact } from '../core/scientificWorlds/biologyRunners';
import {
  ANATOMY_ATLAS_VERSION,
  CANONICAL_ANATOMY_LAYER_SHELL,
  createHumanDigitalTwinManifest,
} from '../core/scientificWorlds/humanLab/anatomyAtlas';
import { buildCellModel, createHistologySlide } from '../core/scientificWorlds/humanLab/histology';
import {
  attachAnatomyLayerShellMetadata,
  evaluateAnatomyVisualAsset,
  resolveAnatomyLayerShell,
} from '../core/three/anatomyIntegrationShell';
import { HumanMacroMicroLayer } from '../core/three/humanMacroMicroLayer';

function names(root: THREE.Object3D): string[] {
  const result: string[] = [];
  root.traverse((node) => { if (node.name) result.push(node.name); });
  return result;
}

describe('canonical anatomy integration shell and scientific macro→micro visuals', () => {
  const manifest = createHumanDigitalTwinManifest('HDT-anatomy-shell');

  it('keeps six stable layer nodes with fail-closed asset and scientific provenance metadata', () => {
    expect(CANONICAL_ANATOMY_LAYER_SHELL.map((layer) => layer.id)).toEqual([
      'layer:skin', 'layer:muscles', 'layer:skeleton', 'layer:vessels', 'layer:nerves', 'layer:organs',
    ]);
    for (const definition of CANONICAL_ANATOMY_LAYER_SHELL) {
      const node = manifest.nodes.find((entry) => entry.id === definition.id);
      expect(node).toMatchObject({
        id: definition.id,
        parentId: 'body',
        kind: 'STRUCTURE',
        assetSlot: definition.assetSlot,
        epistemic: 'MODEL',
        representation: { provenance: { source: ANATOMY_ATLAS_VERSION }, confidence: { status: 'UNKNOWN' }, resolution: { status: 'UNSPECIFIED' } },
      });
    }

    const presentation = resolveAnatomyLayerShell(manifest, {
      visibleLayerIds: ['layer:skin', 'layer:vessels'],
      isolatedLayerId: 'layer:vessels',
      selectedLayerId: 'layer:vessels',
      lod: 'MEDIUM',
      crossSection: { enabled: true, axis: 'SAGITTAL', positionNormalized: 2 },
      hyperscopeMagnification: 500,
    });
    const vessels = presentation.find((layer) => layer.id === 'layer:vessels')!;
    const skin = presentation.find((layer) => layer.id === 'layer:skin')!;
    expect(vessels).toMatchObject({ visible: true, selected: true, isolated: true, pickable: true, lod: 'MEDIUM' });
    expect(vessels.assetSlot).toBe('human.layer.vessels.medium.glb');
    expect(vessels.pickId).toBe('anatomy:layer:vessels');
    expect(vessels.crossSection).toEqual({ enabled: true, axis: 'SAGITTAL', positionNormalized: 1 });
    expect(vessels.hyperscope).toMatchObject({ compatible: true, resultClass: 'SUBCELLULAR_MODEL', requestedMagnification: 500 });
    expect(vessels.provenance).toMatchObject({ epistemic: 'MODEL', directObservation: false, assetGovernance: 'REQUIRES_APPROVED_ASSET_OR_PROCEDURAL_FALLBACK' });
    expect(skin).toMatchObject({ visible: false, pickable: false });

    const root = new THREE.Group(); attachAnatomyLayerShellMetadata(root, presentation);
    expect(root.userData.canonicalAnatomyLayerShell).toHaveLength(6);
    expect(evaluateAnatomyVisualAsset('/assets/not-registered/anatomy.glb')).toEqual({ mayLoadVisualAsset: false, status: 'BLOCKED_UNVERIFIED_OR_UNKNOWN', assetId: null, license: null, anatomicalValidity: 'NOT_ESTABLISHED' });
    expect(evaluateAnatomyVisualAsset('/assets/genesis-hf/characters/mpfb-lod0.glb')).toMatchObject({ mayLoadVisualAsset: true, status: 'APPROVED_VISUAL_ASSET', anatomicalValidity: 'NOT_ESTABLISHED' });
  });

  it('makes tissue, cell, organelle and DNA scales structurally distinct while retaining MODEL metadata', () => {
    const slide = createHistologySlide('specimen-layer-shell', 'CARDIAC');
    const cell = buildCellModel(slide, 29);
    const hyperscope = (magnification: 100 | 500): HyperscopeArtifact => ({
      kind: 'hyperscope', cell,
      capture: {
        captureId: `HSC-layer-${magnification}`, specimenId: slide.specimenId,
        request: { specimenId: slide.specimenId, mode: magnification === 500 ? 'SUBCELLULAR_MODEL' : 'CELL_MODEL', magnification, fieldOfViewMicrometers: magnification === 500 ? 20 : 100, resolutionWidthPx: 512, resolutionHeightPx: 512 },
        generatedAtLogicalTime: 1, outputHash: `layer-${magnification}`, epistemic: 'MODEL', visualResolutionMultiplier: 6, sourceNote: 'canonical deterministic test model',
      },
    });
    const layer = new HumanMacroMicroLayer(THREE, manifest);

    layer.setOrgan('heart');
    expect(layer.getState().anatomyLayers).toMatchObject({ visibleLayerIds: ['layer:organs'], selectedLayerId: 'layer:organs', lod: 'LOW' });

    layer.setArtifact({ kind: 'histology', slide, cell });
    expect(names(layer.group)).toEqual(expect.arrayContaining(['tissue:cross-section-surface', 'tissue:capillary-model:0', 'tissue:capillary-model:1']));
    expect(layer.getState().anatomyLayers.crossSection).toBe(true);

    layer.setArtifact(hyperscope(100));
    expect(names(layer.group).filter((name) => name.startsWith('cell:cytoskeleton-filament:'))).toHaveLength(7);
    expect(names(layer.group).filter((name) => name.startsWith('cell:membrane-channel:'))).toHaveLength(12);
    expect(layer.getState().anatomyLayers.hyperscopeMagnification).toBe(100);

    layer.setArtifact(hyperscope(500));
    expect(names(layer.group)).toContain('organelle:matrix-granules');

    const molecule: BiologyArtifact = { kind: 'central-dogma', report: centralDogmaReport('ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG') };
    layer.setArtifact(molecule);
    expect(names(layer.group).filter((name) => name.startsWith('dna:nucleotide:'))).toHaveLength(molecule.report.dna.length);
    const macroRoot = layer.group.children.find((child) => child.name.startsWith('macro-dna:'));
    expect(macroRoot?.userData).toMatchObject({ epistemic: 'MODEL', directObservation: false, visualScaleNotPhysical: true });
    expect(macroRoot?.userData.canonicalAnatomyLayerShell).toHaveLength(6);
    layer.dispose();
  });
});
