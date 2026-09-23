import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CameraRig, resolveCameraFraming } from '../core/three/graphics/cameraRig';
import { FocusPuller } from '../core/three/graphics/cinematicCamera';
import { applyRimLight, setSurfaceMode } from '../core/three/humanTwinMaterials';

describe('visual camera continuity', () => {
  it('settles a shot and its focus equally at 15, 30, 60 and 144 Hz', () => {
    const results = [15, 30, 60, 144].map(fps => {
      const rig = new CameraRig(THREE, { intent: 'WIDE', target: [0, 0, 0] });
      rig.frame({ intent: 'SCIENTIFIC', target: [5, 2, 8] });
      const focus = new FocusPuller(1);
      focus.pullTo(8);
      for (let i = 0; i < fps; i++) { rig.update(1 / fps); focus.update(1 / fps); }
      return { ...rig.update(0), focus: focus.value };
    });
    for (const result of results.slice(1)) {
      result.position.forEach((value, index) => expect(value).toBeCloseTo(results[0].position[index], 10));
      result.lookAt.forEach((value, index) => expect(value).toBeCloseTo(results[0].lookAt[index], 10));
      expect(result.focus).toBeCloseTo(results[0].focus, 10);
    }
  });

  it('keeps the requested orbit azimuth after frame and cut, including zero-time updates', () => {
    const request = { intent: 'ORBITAL' as const, target: [2, 1, -3] as [number, number, number], azimuthDeg: 37 };
    const expected = resolveCameraFraming(request);
    const rig = new CameraRig(THREE, request);
    for (const enter of [() => {}, () => rig.frame(request), () => rig.cut(request)]) {
      enter();
      expect(rig.update(0)).toEqual(expected);
      const moved = rig.update(0.5);
      const destination = resolveCameraFraming({ ...request, azimuthDeg: 41 });
      moved.position.forEach((value, index) => expect(value).toBeCloseTo(destination.position[index], 10));
    }
  });

  it('ignores invalid or backward frame deltas without poisoning the camera or focus', () => {
    const rig = new CameraRig(THREE, { intent: 'ORBITAL', target: [0, 0, 0] });
    const initial = rig.update(0);
    const focus = new FocusPuller(2);
    focus.pullTo(10);
    for (const dt of [-1, NaN, Infinity]) {
      expect(rig.update(dt)).toEqual(initial);
      expect(focus.update(dt)).toBe(2);
    }
  });
});

describe('human shell render integration', () => {
  it('adds the rim in linear emissive space before lighting, tone mapping, fog and alpha premultiplication', () => {
    const material = new THREE.MeshStandardMaterial();
    applyRimLight(THREE, material, { color: new THREE.Color(0x88ddff), power: 3, intensity: 0.2 });
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    material.onBeforeCompile(shader as never, {} as never);
    const source = shader.fragmentShader;
    expect(source.match(/#include <emissivemap_fragment>/g)).toHaveLength(1);
    expect(source.match(/#include <dithering_fragment>/g)).toHaveLength(1);
    const rim = source.indexOf('totalEmissiveRadiance +=');
    expect(rim).toBeGreaterThan(source.indexOf('#include <emissivemap_fragment>'));
    for (const chunk of ['lights_physical_fragment', 'tonemapping_fragment', 'fog_fragment', 'premultiplied_alpha_fragment']) {
      expect(rim).toBeLessThan(source.indexOf('#include <' + chunk + '>'));
    }
    expect(source).not.toContain('gl_FragColor.rgb +=');
    material.dispose();
  });

  it('keeps the ghost opacity budget through the Fresnel shell instead of making its edges opaque', () => {
    const material = new THREE.MeshStandardMaterial();
    applyRimLight(THREE, material, { color: new THREE.Color('cyan'), power: 3, intensity: 0.2 });
    const shader = { uniforms: {} as Record<string, { value: unknown }>, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    material.onBeforeCompile(shader as never, {} as never);
    setSurfaceMode(material, 'GHOST');
    expect(material.opacity).toBe(0.06);
    expect(material.depthWrite).toBe(false);
    expect(shader.uniforms.uXray.value).toBe(0.4);
    expect(shader.fragmentShader).toContain('diffuseColor.a *= mix( 1.0,');
    setSurfaceMode(material, 'NORMAL');
    expect(material.opacity).toBe(1);
    expect(material.transparent).toBe(false);
    expect(material.depthWrite).toBe(true);
    expect(shader.uniforms.uXray.value).toBe(0);
    material.dispose();
  });
});


describe('Human Explorer reduced-motion presentation', () => {
  it('holds the body camera still while scene time advances and keeps a selected framing usable', async () => {
    const { AgentLabScene3D } = await import('../core/three/agentLabScene3D');
    const { BIOLOGY_ROOM } = await import('../core/scientificWorlds/biologyLabWorld');
    const humanLoader = await import('../core/three/humanTwinAsset');
    const context = new Proxy<Record<string, unknown>>({
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
      measureText: () => ({ width: 40 }),
      getImageData: (_x: number, _y: number, width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
      createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }),
    }, { get: (target, key) => key in target ? target[String(key)] : () => {} });
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => context }) });
    vi.stubGlobal('navigator', { hardwareConcurrency: 8 });
    vi.stubGlobal('window', { innerWidth: 1440, matchMedia: (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)' }) });
    vi.spyOn(humanLoader, 'loadHumanTwinBodyResult').mockReturnValue(new Promise(() => {}));
    const controller = { pose: { position: { x: 0, z: 0 }, facing: 0, gait: 0, speed: 0, reach: 0, headPitch: 0 }, update: vi.fn(() => ({ state: 'IDLE' })) };
    const sim = new AgentLabScene3D(controller as never, [], BIOLOGY_ROOM, 'biology');
    try {
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
      sim.init(THREE, scene, camera);
      sim.setCameraMode('TWIN');
      sim.update(0.05, {});
      sim.syncScene(scene, camera);
      const position = camera.position.clone();
      const orientation = camera.quaternion.clone();
      for (let i = 0; i < 20; i++) { sim.update(0.05, {}); sim.syncScene(scene, camera); }
      expect(camera.position.equals(position)).toBe(true);
      expect(camera.quaternion.equals(orientation)).toBe(true);
      sim.setTwinIsolated(['heart']);
      sim.syncScene(scene, camera);
      expect(camera.position.distanceTo(position)).toBeGreaterThan(0.1);
      expect(controller.update).toHaveBeenCalledTimes(21);
    } finally { sim.dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals(); }
  });
});
