import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createHumanDigitalTwinManifest } from '../core/scientificWorlds/humanLab/anatomyAtlas';
import { buildCellModel, createHistologySlide } from '../core/scientificWorlds/humanLab/histology';
import { EXPLORER_ORGANS } from '../core/scientificWorlds/humanExplorer';
import { HumanMacroMicroLayer } from '../core/three/humanMacroMicroLayer';
import { tissueName } from '../core/three/explorerText';
import { setLocale } from '../core/i18n';
import { microCaption } from '../components/AnatomySelectionHUD';

function names(root: THREE.Object3D): string[] {
  const out: string[] = [];
  root.traverse((n) => { if (n.name) out.push(n.name); });
  return out;
}

describe('pancreas has its own tissue, not a generic sample', () => {
  it('the explorer maps the pancreas to PANCREAS and no longer flags it as a generic sample', () => {
    const pancreas = EXPLORER_ORGANS.find((o) => o.organId === 'pancreas')!;
    expect(pancreas.tissue).toBe('PANCREAS');
    expect(pancreas.genericSample).toBeUndefined();
    setLocale('pl');
    expect(tissueName('PANCREAS')).toContain('wysepka Langerhansa');
  });

  it('the tissue tile shows acini, ducts and an islet with intermixed beta, alpha and delta cells, tagged as a model', () => {
    const slide = createHistologySlide('SPEC-PANCREAS', 'PANCREAS');
    const cell = buildCellModel(slide, 11);
    const layer = new HumanMacroMicroLayer(THREE, createHumanDigitalTwinManifest());
    layer.setArtifact({ kind: 'histology', slide, cell });
    const all = names(layer.group);
    expect(all).toContain('macro-tissue:PANCREAS');
    expect(all).toContain('pancreas:islet-of-langerhans');
    expect(all.filter((n) => /^pancreas:acinus:\d+$/.test(n))).toHaveLength(8);
    expect(all.filter((n) => n.startsWith('pancreas:intercalated-duct:'))).toHaveLength(8);
    const beta = all.filter((n) => n.startsWith('pancreas:islet:beta-cell:')).length;
    const alpha = all.filter((n) => n.startsWith('pancreas:islet:alpha-cell:')).length;
    const delta = all.filter((n) => n.startsWith('pancreas:islet:delta-cell:')).length;
    expect(beta).toBeGreaterThan(alpha);
    expect(alpha).toBeGreaterThan(delta);
    expect(delta).toBeGreaterThan(0);
    const root = layer.group.getObjectByName('macro-tissue:PANCREAS')!;
    expect(root.userData).toMatchObject({ epistemic: 'MODEL', directObservation: false, isletCellShares: 'TEXTBOOK_LAYOUT_NOT_MEASURED' });
    // The generic tile is not used for the pancreas.
    expect(all).not.toContain('tissue:cross-section-surface');
  });

  it('the caption calls the tile a textbook schematic, never a scan', () => {
    setLocale('pl');
    const slide = createHistologySlide('SPEC-PANCREAS', 'PANCREAS');
    const title = microCaption({ kind: 'histology', slide, cell: buildCellModel(slide, 11) })?.title ?? '';
    expect(title).toContain('schemat podręcznikowy, nie skan tkanki');
    expect(title).not.toContain('próbka ogólna');
  });

  it('the layout is deterministic for the same cell', () => {
    const slide = createHistologySlide('SPEC-PANCREAS', 'PANCREAS');
    const a = new HumanMacroMicroLayer(THREE, createHumanDigitalTwinManifest());
    const b = new HumanMacroMicroLayer(THREE, createHumanDigitalTwinManifest());
    a.setArtifact({ kind: 'histology', slide, cell: buildCellModel(slide, 11) });
    b.setArtifact({ kind: 'histology', slide, cell: buildCellModel(slide, 11) });
    expect(names(a.group)).toEqual(names(b.group));
  });
});
