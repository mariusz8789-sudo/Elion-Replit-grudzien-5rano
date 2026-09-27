import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AgentLabScene3D } from '../core/three/agentLabScene3D';
import { buildCharacter } from '../core/three/characterRig';
import { createDustMotes } from '../core/three/graphics/atmosphere';

/**
 * Visual regression (real browser): the very first frame after switching to the TWIN camera showed
 * a huge, pale, blown-out surface instead of the Human Twin — reproduced even at a fully settled
 * state, minutes later, which ruled out every camera-timing/asset-loading hypothesis (camera
 * position/matrix/FOV/near were all verified correct via a real-browser raycast probe). An initial
 * fix hid the ambient dust-mote cloud in TWIN mode (a real, independently worthwhile improvement —
 * dust has no place in a focused inspection shot — pinned by the first test below) but did NOT
 * resolve the defect: a second, more targeted raycast (small grid of rays around screen centre,
 * filtered to genuinely render-visible hits by walking each hit's own ancestor `.visible` chain)
 * found two unnamed meshes 2–10 cm from the camera in EVERY direction sampled, colored exactly the
 * suited AGENT character's own suit-fabric/boot hex values (`0xe9edf2`/`0x1a1f26`, `buildCharacter`'s
 * defaults for `ch`). TWIN is the one camera mode fixed at a static world point near the twin
 * chamber — unlike VISOR/SPECTATOR, which both track the moving agent — and the agent (a completely
 * different entity from the Human Twin on display) is very often standing right there too, since the
 * chamber is a central hub most commands navigate through: the camera was rendering from literally
 * INSIDE the agent's own body mesh. The second test below pins the real fix: the agent's whole body
 * (`ch.root`) is hidden only in TWIN mode, exactly like VISOR already hides the agent's own
 * helmet/face for the same "don't let your own character occlude the shot" reason — visible again
 * the instant a moving-agent camera mode is selected, with no multi-frame lag either direction.
 */
function makeMinimalScene(): AgentLabScene3D {
  const scene = new AgentLabScene3D(
    { pose: { reach: 0, position: { x: 0, z: 0 }, facing: 0, speed: 0, headPitch: 0, gait: 0 } } as never,
    [],
    { minX: -5, maxX: 5, minZ: -5, maxZ: 5 } as never,
    'biology',
  );
  const s = scene as unknown as {
    THREE: typeof THREE; character: ReturnType<typeof buildCharacter>; scratchA: THREE.Vector3; scratchB: THREE.Vector3;
    spectatorPos: THREE.Vector3; spectatorLook: THREE.Vector3; twinCamPos: THREE.Vector3; twinCamLook: THREE.Vector3;
    dust: ReturnType<typeof createDustMotes>; room: { minX: number; maxX: number; minZ: number; maxZ: number };
    ceilingY: number;
  };
  s.THREE = THREE;
  s.character = buildCharacter(THREE, { height: 1.78 });
  s.scratchA = new THREE.Vector3(); s.scratchB = new THREE.Vector3();
  s.spectatorPos = new THREE.Vector3(0, 2.2, 8); s.spectatorLook = new THREE.Vector3(0, 1.4, 0);
  s.twinCamPos = new THREE.Vector3(0, 1.0, 3.3); s.twinCamLook = new THREE.Vector3(0, 0.38, 0);
  s.dust = createDustMotes(THREE, { count: 20, bounds: [4, 1.6, 4], center: [0, 1.7, 0], color: 0xffffff, size: 0.012, opacity: 0.35, seed: 1 });
  s.room = { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
  s.ceilingY = 3;
  return scene;
}

describe('AgentLabScene3D — TWIN camera no longer renders from inside the agent (visual regression fix)', () => {
  it('hides ambient dust only in TWIN camera mode', () => {
    const scene = makeMinimalScene();
    const dust = (scene as unknown as { dust: ReturnType<typeof createDustMotes> }).dust;
    const camera = new THREE.PerspectiveCamera();
    const fakeScene = new THREE.Scene();

    scene.setCameraMode('VISOR');
    scene.syncScene(fakeScene, camera);
    expect(dust.points.visible, 'VISOR').toBe(true);

    scene.setCameraMode('SPECTATOR');
    scene.syncScene(fakeScene, camera);
    expect(dust.points.visible, 'SPECTATOR').toBe(true);

    scene.setCameraMode('TWIN');
    scene.syncScene(fakeScene, camera);
    expect(dust.points.visible, 'TWIN').toBe(false);

    scene.setCameraMode('SPECTATOR');
    scene.syncScene(fakeScene, camera);
    expect(dust.points.visible, 'SPECTATOR again').toBe(true);
  });

  it('hides the whole agent body only in TWIN camera mode — the actual root cause fix', () => {
    const scene = makeMinimalScene();
    const character = (scene as unknown as { character: ReturnType<typeof buildCharacter> }).character;
    const camera = new THREE.PerspectiveCamera();
    const fakeScene = new THREE.Scene();

    scene.setCameraMode('VISOR');
    scene.syncScene(fakeScene, camera);
    expect(character.root.visible, 'VISOR').toBe(true);

    scene.setCameraMode('SPECTATOR');
    scene.syncScene(fakeScene, camera);
    expect(character.root.visible, 'SPECTATOR').toBe(true);

    scene.setCameraMode('TWIN');
    scene.syncScene(fakeScene, camera);
    expect(character.root.visible, 'TWIN — the fix').toBe(false);

    // Back to a moving-agent camera: the agent is visible again on the very next frame, whatever the
    // agent's own world position happens to be (this is precisely what makes the earlier "the agent
    // just happens not to be near the chamber this time" luck irrelevant going forward).
    scene.setCameraMode('VISOR');
    scene.syncScene(fakeScene, camera);
    expect(character.root.visible, 'VISOR again').toBe(true);
  });

  it('is a no-op (never throws) when the scene has no dust handle yet', () => {
    const scene = makeMinimalScene();
    (scene as unknown as { dust: unknown }).dust = null;
    const camera = new THREE.PerspectiveCamera();
    const fakeScene = new THREE.Scene();
    scene.setCameraMode('TWIN');
    expect(() => scene.syncScene(fakeScene, camera)).not.toThrow();
  });
});
