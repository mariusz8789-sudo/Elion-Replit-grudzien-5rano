import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { renderToStaticMarkup } from 'react-dom/server';
import HumanExplorerPanel from '../components/HumanExplorerPanel';
import { createTwinProxy } from '../core/three/biologyLabKit';
import { createCutaway, DEFAULT_CUTAWAY, setSectionShellSides } from '../core/three/humanTwinCutaway';
import { getMaterialRimIntensity } from '../core/three/humanTwinMaterials';
import { createHumanDigitalTwinManifest } from '../core/scientificWorlds/humanLab/anatomyAtlas';
import { createDefaultAnatomyView } from '../core/scientificWorlds/humanLab/anatomyView';
import { buildVisualLayerInstruction } from '../core/scientificWorlds/humanLab/visualModes';

/**
 * Human Explorer visual polish — regression tests for the presentation defects fixed in this pass.
 * Presentation only: none of these touches a session, an evidence record or an anatomy fact.
 */
const manifest = createHumanDigitalTwinManifest('HDT-TEST');
const shellOf = (twin: ReturnType<typeof createTwinProxy>): THREE.MeshPhysicalMaterial => {
  let found: THREE.MeshPhysicalMaterial | null = null;
  twin.body.root.traverse((o) => { const m = o as THREE.Mesh; if (!found && m.isMesh) found = m.material as THREE.MeshPhysicalMaterial; });
  return found!;
};

describe('twin shell never hides the anatomy a mode is meant to show', () => {
  it('BRAIN mode (body slot absent) ghosts the shell instead of leaving it opaque over the brain', () => {
    const twin = createTwinProxy(THREE, manifest, { skinHex: '#d6ae91' });
    twin.setView(buildVisualLayerInstruction(manifest, 'BRAIN'), 'brain');
    const shell = shellOf(twin);
    expect(shell.transparent).toBe(true);
    expect(shell.opacity).toBeLessThan(0.1);
    expect(twin.organs.get('brain')!.visible).toBe(true);
    twin.dispose();
  });

  it('the default body view keeps an opaque shell (the opaque path is unchanged)', () => {
    const twin = createTwinProxy(THREE, manifest, { skinHex: '#d6ae91' });
    twin.setView(buildVisualLayerInstruction(manifest, createDefaultAnatomyView('HDT-TEST').displayMode), null);
    const shell = shellOf(twin);
    expect(shell.transparent).toBe(false);
    expect(shell.opacity).toBe(1);
    twin.dispose();
  });

  it('the hologram proxy keeps its own translucency instead of turning into a solid body', () => {
    const twin = createTwinProxy(THREE, manifest, { skinHex: '#d6ae91', hologram: true });
    twin.setView(buildVisualLayerInstruction(manifest, createDefaultAnatomyView('HDT-TEST').displayMode), null);
    const shell = shellOf(twin);
    expect(shell.transparent).toBe(true);
    expect(shell.opacity).toBeLessThan(0.5);
    twin.dispose();
  });
});

describe('organ transparency sorts correctly and the selection reads as a silhouette', () => {
  it('fully shown organs are opaque and write depth; isolation-context organs are the only transparent ones', () => {
    const twin = createTwinProxy(THREE, manifest, { skinHex: '#d6ae91' });
    twin.setView(buildVisualLayerInstruction(manifest, 'ORGANS'), 'heart');
    const heart = twin.organs.get('heart')!.material as THREE.MeshPhysicalMaterial;
    const liver = twin.organs.get('liver')!.material as THREE.MeshPhysicalMaterial;
    expect([heart.transparent, heart.depthWrite, heart.opacity]).toEqual([false, true, 1]);
    twin.setIsolated(['heart']);
    expect([heart.transparent, heart.opacity]).toEqual([false, 1]);
    expect(twin.organs.get('liver')!.visible).toBe(false);
    twin.setIsolated([]);
    expect(liver.transparent).toBe(false);
    twin.dispose();
  });

  it('the selected organ carries a fresnel rim and the others step back', () => {
    const twin = createTwinProxy(THREE, manifest, { skinHex: '#d6ae91' });
    twin.setView(buildVisualLayerInstruction(manifest, 'ORGANS'), 'heart');
    const heart = twin.organs.get('heart')!.material as THREE.MeshPhysicalMaterial;
    const liver = twin.organs.get('liver')!.material as THREE.MeshPhysicalMaterial;
    expect(getMaterialRimIntensity(heart)).toBeGreaterThan(1);
    expect(getMaterialRimIntensity(liver)).toBe(0);
    expect(liver.emissiveIntensity).toBeLessThan(heart.emissiveIntensity);
    twin.update(1.3);
    expect(getMaterialRimIntensity(heart)).toBeGreaterThan(0.9);
    twin.setView(buildVisualLayerInstruction(manifest, 'ORGANS'), 'liver');
    expect(getMaterialRimIntensity(heart)).toBe(0);
    twin.dispose();
  });
});

describe('the section is legible', () => {
  it('the indicator sits on the cut in the twin group space, sized to the body, with an outline', () => {
    const chamber = new THREE.Group(); chamber.position.set(4, 0, -2);
    const cut = createCutaway(THREE);
    chamber.add(cut.indicator);
    const bounds = { minX: 3.8, maxX: 4.2, minY: 0.2, maxY: 1.98, minZ: -2.15, maxZ: -1.85 };
    cut.apply({ ...DEFAULT_CUTAWAY, enabled: true, axis: 'CORONAL' }, bounds);
    // World centre (4, 1.09, -2) projected on the coronal plane is local (0, 1.09, 0): not the world coordinates.
    expect(cut.indicator.position.x).toBeCloseTo(0, 5);
    expect(cut.indicator.position.z).toBeCloseTo(0, 5);
    expect(cut.indicator.position.y).toBeCloseTo(1.09, 5);
    expect(cut.indicator.scale.x).toBeCloseTo(0.4 * 1.08, 5);
    expect(cut.indicator.scale.y).toBeCloseTo(1.78 * 1.04, 5);
    expect(cut.indicator.children.some((c) => c.name === 'twin:section-outline')).toBe(true);
    cut.dispose();
  });

  it('an open cut renders the shell wall double-sided and restores the original side when closed', () => {
    const front = new THREE.MeshStandardMaterial({ side: THREE.FrontSide });
    setSectionShellSides(THREE, [front], true);
    expect(front.side).toBe(THREE.DoubleSide);
    setSectionShellSides(THREE, [front], false);
    expect(front.side).toBe(THREE.FrontSide);
    const twin = createTwinProxy(THREE, manifest, { skinHex: '#d6ae91' });
    twin.setCutaway({ ...DEFAULT_CUTAWAY, enabled: true });
    expect(shellOf(twin).side).toBe(THREE.DoubleSide);
    twin.setCutaway(DEFAULT_CUTAWAY);
    expect(shellOf(twin).side).toBe(THREE.FrontSide);
    twin.dispose();
  });
});

describe('Human Explorer panel hierarchy', () => {
  const html = renderToStaticMarkup(
    <HumanExplorerPanel
      manifest={manifest} anatomy={{ ...createDefaultAnatomyView('HDT-TEST'), selectedNodeId: 'heart' }}
      artifact={null} session={null} sessions={[]} busy={false} onCommands={() => {}} nextLogicalTime={() => 1}
      cutaway={DEFAULT_CUTAWAY} onCutaway={() => {}} isolated={[]} onIsolate={() => {}} twinTier="PROXY"
      twinCamera={false} onTwinCamera={() => {}} surface="NORMAL" onSurface={() => {}}
    />,
  );
  const at = (testId: string) => html.indexOf(`data-testid="${testId}"`);

  it('reads selection → macro-to-micro path → status → controls, and the path covers BODY … CELL', () => {
    expect(at('sw-explorer-selection')).toBeGreaterThan(-1);
    expect(html).toContain('>Heart<');
    expect(at('sw-explorer-selection')).toBeLessThan(at('sw-explorer-rung-body'));
    for (const rung of ['body', 'organ_system', 'organ', 'tissue', 'cell']) expect(at(`sw-explorer-rung-${rung}`)).toBeGreaterThan(-1);
    expect(at('sw-explorer-rung-cell')).toBeLessThan(at('sw-explorer-evidence'));
    expect(at('sw-explorer-evidence')).toBeLessThan(at('sw-explorer-organ'));
    expect(at('sw-explorer-organ')).toBeLessThan(at('sw-explorer-section'));
    expect(at('sw-explorer-section')).toBeLessThan(at('sw-explorer-scope'));
  });

  it('keeps the observation boundary visible and moves provenance into a secondary disclosure', () => {
    const boundary = at('sw-explorer-observation-status');
    const details = html.indexOf('<details');
    expect(boundary).toBeGreaterThan(-1);
    expect(details).toBeGreaterThan(boundary);
    expect(html).toContain('No validated subject observation attached');
    expect(at('sw-explorer-provenance')).toBeGreaterThan(details);
    expect(at('sw-explorer-source-metadata')).toBeGreaterThan(details);
    expect(html).not.toMatch(/<details[^>]*open/);
  });

  it('exposes a drawer toggle (closed by default) for the mobile compact rail', () => {
    expect(html).toContain('data-drawer="closed"');
    expect(html).toMatch(/data-testid="sw-explorer-drawer-toggle"[^>]*|aria-expanded="false"/);
    expect(html).toContain('aria-controls="sw-ex-drawer"');
  });
});
