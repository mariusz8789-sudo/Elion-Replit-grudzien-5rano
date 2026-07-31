import type * as THREE from 'three';
import type { SimParams } from '../../core/types';
import type { PostProcessingModules, PostProcessor, Sim3D } from '../../core/three/types';
import { evaluate, parseExpression } from '../../core/mathExpr';
import { detectRenderTier, scaleCount, tierAllowsBloom } from '../../core/three/quality';
import { createFadePass } from '../../core/three/postfx';
import { getSettings } from '../../core/settings';

/**
 * Wykres powierzchni z = f(x,y) jako literalna bryła 3D — ten sam bezpieczny
 * parser (core/mathExpr.ts, zero eval()/Function()) co tryby "Wykres" i
 * "Równania różniczkowe", tylko z DWIEMA zmiennymi związanymi jednocześnie
 * (evaluate(ast, {x, y})) zamiast jednej. Siatka wierzchołków to dosłownie
 * f(x,y) w każdym punkcie — nie ilustracja, policzone wprost.
 *
 * Uczciwość: wysokość jest przeskalowana liniowo do stałego zakresu
 * ekranowego (±1.1 jednostki sceny) wokół z=0 — bo dowolna funkcja
 * użytkownika może mieć wysokość rzędu 10⁻³ albo 10⁶, a kamera musi mieć
 * jeden, stały kadr. Proporcje LOKALNE (kształt powierzchni) są zachowane
 * dokładnie; skala pionowa względem osi x/y NIE jest 1:1 — dokładnie jak
 * mapa topograficzna, gdzie wysokość i odległość pozioma używają różnych
 * jednostek na osi. Kolor koduje tę samą znormalizowaną wysokość.
 */

export interface SurfaceStats {
  zMin: number;
  zMax: number;
  valid: boolean;
}

const GRID_BASE = 72;
const DISPLAY_HALF_HEIGHT = 1.1;
const HALF_EXTENT = 1.6;

class FunctionSurface3DSim implements Sim3D {
  cameraAutoRotateSpeed = 0.14;

  private three!: typeof THREE;
  private disposables: { dispose(): void }[] = [];
  private introElapsed = 0;
  private fadePass?: import('three/examples/jsm/postprocessing/ShaderPass.js').ShaderPass;
  private mesh!: THREE.Mesh;
  private geo!: THREE.BufferGeometry;
  private gridN = GRID_BASE;
  private lastKey = '';
  private lastStats: SurfaceStats = { zMin: 0, zMax: 0, valid: false };

  init(three: typeof THREE, scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.three = three;
    this.introElapsed = getSettings().reducedMotion ? 1 : 0;
    scene.background = new three.Color(0x02030a);
    scene.add(new three.AmbientLight(0x445066, 1.2));
    const light = new three.DirectionalLight(0xffffff, 1.1);
    light.position.set(3, 5, 3);
    scene.add(light);

    this.gridN = scaleCount(GRID_BASE, detectRenderTier());
    this.geo = new three.PlaneGeometry(HALF_EXTENT * 2, HALF_EXTENT * 2, this.gridN - 1, this.gridN - 1);
    this.geo.rotateX(-Math.PI / 2);
    const colors = new Float32Array(this.geo.attributes.position.count * 3);
    this.geo.setAttribute('color', new three.BufferAttribute(colors, 3));
    const mat = new three.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.05, side: three.DoubleSide });
    this.mesh = new three.Mesh(this.geo, mat);
    scene.add(this.mesh);
    this.disposables.push(this.geo, mat);

    // Osie odniesienia — bez nich trudno ocenić, gdzie jest z=0.
    const axisMat = new three.LineBasicMaterial({ color: 0x8d97b4, transparent: true, opacity: 0.4 });
    const axisGeo = new three.BufferGeometry().setFromPoints([
      new three.Vector3(-HALF_EXTENT * 1.1, 0, 0), new three.Vector3(HALF_EXTENT * 1.1, 0, 0),
      new three.Vector3(0, 0, -HALF_EXTENT * 1.1), new three.Vector3(0, 0, HALF_EXTENT * 1.1),
    ]);
    const axisLines = new three.LineSegments(axisGeo, axisMat);
    scene.add(axisLines);
    this.disposables.push(axisGeo, axisMat);

    camera.position.set(HALF_EXTENT * 2.0, HALF_EXTENT * 1.7, HALF_EXTENT * 2.3);
    camera.lookAt(0, 0, 0);
  }

  update(dt: number, p: SimParams) {
    if (!getSettings().reducedMotion) this.introElapsed = Math.min(1, this.introElapsed + dt);
    const key = `${p.expr}|${p.xMin}|${p.xMax}|${p.yMin}|${p.yMax}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      this.rebuild(p);
    }
  }

  private rebuild(p: SimParams) {
    const xMin = Number(p.xMin);
    const xMax = Number(p.xMax);
    const yMin = Number(p.yMin);
    const yMax = Number(p.yMax);
    let ast;
    try {
      ast = parseExpression(String(p.expr));
    } catch {
      this.lastStats = { ...this.lastStats, valid: false };
      return;
    }
    const posAttr = this.geo.attributes.position as THREE.BufferAttribute;
    const colAttr = this.geo.attributes.color as THREE.BufferAttribute;
    const raw = new Float64Array(posAttr.count);
    let zMin = Infinity;
    let zMax = -Infinity;
    let anyFinite = false;
    for (let i = 0; i < posAttr.count; i++) {
      const localX = posAttr.getX(i);
      const localZ = posAttr.getZ(i);
      const x = xMin + ((localX / (HALF_EXTENT * 2)) + 0.5) * (xMax - xMin);
      const y = yMin + ((localZ / (HALF_EXTENT * 2)) + 0.5) * (yMax - yMin);
      let z: number;
      try { z = evaluate(ast, { x, y }); } catch { z = NaN; }
      raw[i] = z;
      if (Number.isFinite(z)) {
        anyFinite = true;
        if (z < zMin) zMin = z;
        if (z > zMax) zMax = z;
      }
    }
    if (!anyFinite) {
      this.lastStats = { zMin: 0, zMax: 0, valid: false };
      return;
    }
    const scale = DISPLAY_HALF_HEIGHT / Math.max(1e-9, Math.max(Math.abs(zMin), Math.abs(zMax)));
    for (let i = 0; i < posAttr.count; i++) {
      const z = raw[i];
      const h = Number.isFinite(z) ? z * scale : 0;
      posAttr.setY(i, h);
      const t = Math.max(0, Math.min(1, (h + DISPLAY_HALF_HEIGHT) / (2 * DISPLAY_HALF_HEIGHT)));
      colAttr.setXYZ(i, 0.16 + t * 0.2, 0.32 + t * 0.55, 0.42 + t * 0.5);
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.lastStats = { zMin, zMax, valid: true };
  }

  syncScene() {
    if (this.fadePass) {
      const t = this.introElapsed;
      this.fadePass.uniforms.uFade.value = t * t * (3 - 2 * t);
    }
  }

  setupPostProcessing(
    modules: PostProcessingModules,
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    w: number,
    h: number,
  ): PostProcessor {
    const three = this.three;
    const { EffectComposer, RenderPass, UnrealBloomPass, ShaderPass, OutputPass } = modules;
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    if (tierAllowsBloom(detectRenderTier())) {
      composer.addPass(new UnrealBloomPass(new three.Vector2(w, h), 0.3, 0.55, 0.8));
    }
    this.fadePass = createFadePass(ShaderPass, getSettings().reducedMotion ? 1 : 0);
    composer.addPass(this.fadePass);
    composer.addPass(new OutputPass());
    return {
      render: () => composer.render(),
      setSize: (nw, nh) => composer.setSize(nw, nh),
      dispose: () => {
        this.fadePass?.material.dispose();
        composer.dispose();
      },
    };
  }

  getStats() {
    return {
      zMin: Number.isFinite(this.lastStats.zMin) ? this.lastStats.zMin : 0,
      zMax: Number.isFinite(this.lastStats.zMax) ? this.lastStats.zMax : 0,
      valid: this.lastStats.valid ? 1 : 0,
    };
  }

  dispose() {
    for (const d of this.disposables) d.dispose();
  }
}

export { FunctionSurface3DSim };
