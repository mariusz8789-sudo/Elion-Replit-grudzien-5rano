import { describe, expect, it } from 'vitest';
import { AgentLabScene3D, type SelectedOrganInfo } from '../core/three/agentLabScene3D';

/**
 * D-134 SMART UI (Human Biology) — `initBiology()` builds the whole scene (glass walls, layered
 * ceiling, both twins, every station) and is exercised only by real browser E2E in this repo
 * (`packages/e2e/src/scientific-worlds.e2e.spec.ts`) — no existing test in this file's own
 * directory ever calls `.init()` on `AgentLabScene3D` (confirmed before writing this file). This
 * pins what CAN be proven without it: the manifest data `SelectedOrganInfo` reads from, and that
 * the new selection API is safe to call before `init()` has ever run — the same "construct, call a
 * setter, read it back" shape `humanTwinAsset.test.ts`'s own D-131 tests already use for this class.
 */
describe('AgentLabScene3D — organ picking data (D-134), before any scene is built', () => {
  it('the manifest already carries real ORGAN nodes with a label, and (for most) a system', () => {
    const scene = new AgentLabScene3D({} as never, [], { minX: -5, maxX: 5, minZ: -5, maxZ: 5 } as never, 'biology');
    const organs = scene.manifest.nodes.filter((n) => n.kind === 'ORGAN');
    expect(organs.length).toBeGreaterThan(0);
    const heart = organs.find((n) => n.id === 'heart');
    expect(heart).toBeTruthy();
    expect(heart!.label.length).toBeGreaterThan(0);
    expect(heart!.epistemic).toBe('MODEL'); // the atlas proxy: never REAL_OBSERVATION
  });

  it('clearOrganSelection() is safe before init() and fires an honest null, never a guessed selection', () => {
    const scene = new AgentLabScene3D({} as never, [], { minX: -5, maxX: 5, minZ: -5, maxZ: 5 } as never, 'biology');
    let calls = 0;
    let last: SelectedOrganInfo | null | undefined = { entityId: 'x', label: 'x', system: null, epistemic: 'MODEL' };
    scene.onOrganSelected = (info) => { calls++; last = info; };
    expect(() => scene.clearOrganSelection()).not.toThrow();
    expect(calls).toBe(1);
    expect(last).toBeNull();
  });

  it('pointer() is a safe no-op for the physics world and before initBiology has run — no raycast, no callback', () => {
    const physics = new AgentLabScene3D({} as never, [], { minX: -5, maxX: 5, minZ: -5, maxZ: 5 } as never, 'physics');
    let hovered = 0;
    physics.onOrganHovered = () => { hovered++; };
    expect(() => physics.pointer(10, 10, 'move')).not.toThrow();
    expect(hovered).toBe(0);
  });

  it('getStats() reports NaN for the organ anchor before any scene/camera exists — never a stale corner', () => {
    const scene = new AgentLabScene3D({ pose: { reach: 0, position: { x: 0, z: 0 }, facing: 0 } } as never, [], { minX: -5, maxX: 5, minZ: -5, maxZ: 5 } as never, 'biology');
    const stats = scene.getStats();
    expect(Number.isNaN(stats.selectedOrganAnchorX)).toBe(true);
    expect(Number.isNaN(stats.selectedOrganAnchorY)).toBe(true);
  });
});
