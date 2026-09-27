import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { BiologyArtifact, HyperscopeArtifact } from '../core/scientificWorlds/biologyRunners';
import { createHistologySlide, buildCellModel } from '../core/scientificWorlds/humanLab/histology';
import { createHumanDigitalTwinManifest } from '../core/scientificWorlds/humanLab/anatomyAtlas';
import { HumanMacroMicroLayer, macroMicroLevelForArtifact } from '../core/three/humanMacroMicroLayer';

describe('V7 Human macro→micro layer', () => {
  const slide = createHistologySlide('specimen-test', 'CARDIAC');
  const cell = buildCellModel(slide, 7);
  const histology: BiologyArtifact = { kind: 'histology', slide, cell };
  const hyperscope100: HyperscopeArtifact = {
    kind: 'hyperscope',
    cell,
    capture: { captureId: 'HSC-test-100', specimenId: 'specimen-test', request: { specimenId: 'specimen-test', mode: 'CELL_MODEL', magnification: 100, fieldOfViewMicrometers: 100, resolutionWidthPx: 512, resolutionHeightPx: 512 }, generatedAtLogicalTime: 1, outputHash: 'x100', epistemic: 'MODEL', visualResolutionMultiplier: 6, sourceNote: 'cell model' },
  };
  const hyperscope500: HyperscopeArtifact = {
    ...hyperscope100,
    capture: { ...hyperscope100.capture, captureId: 'HSC-test-500', request: { ...hyperscope100.capture.request, magnification: 500 }, outputHash: 'x500' },
  };

  it('maps only sealed artifact kind/magnification to the displayed rung', () => {
    expect(macroMicroLevelForArtifact(null)).toBe('organ');
    expect(macroMicroLevelForArtifact(histology)).toBe('tissue');
    expect(macroMicroLevelForArtifact(hyperscope100)).toBe('cell');
    expect(macroMicroLevelForArtifact(hyperscope500)).toBe('organelle');
    expect(macroMicroLevelForArtifact({ ...hyperscope100, cell: null })).toBe('organ');
  });

  it('builds MODEL visuals from the canonical manifest/artifact without WebGL', () => {
    const layer = new HumanMacroMicroLayer(THREE, createHumanDigitalTwinManifest('HDT-test'));
    expect(layer.getState()).toMatchObject({ level: 'body', selectedNodeId: 'body' });
    layer.setOrgan('system:cardiovascular');
    expect(layer.getState()).toMatchObject({ level: 'organ_system', selectedNodeId: 'system:cardiovascular', selectedOrganId: null });
    expect(layer.group.visible).toBe(false); // The system remains on the canonical body, not a duplicate display body.
    layer.setOrgan('heart');
    expect(layer.group.visible).toBe(true);
    expect(layer.getState()).toMatchObject({ level: 'organ', selectedOrganId: 'heart', evidenceLabel: 'MODEL_NOT_DIRECT_OBSERVATION' });
    layer.setArtifact(histology);
    expect(layer.getState()).toMatchObject({ level: 'tissue', artifactKind: 'histology' });
    expect(layer.group.userData.directObservation).toBe(false);
    layer.dispose();
  });
});
