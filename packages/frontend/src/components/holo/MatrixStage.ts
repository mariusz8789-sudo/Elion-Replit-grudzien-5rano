import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';

/**
 * MATRIX STAGE — the cinematic world behind `#/matrix`.
 *
 * What the owner's reference shows, built with real WebGL rather than an image:
 *   - a volumetric rain of glyphs (thousands of GPU points sampling a generated
 *     glyph atlas; column heads burn brighter so bloom lifts them);
 *   - a black mirror floor (planar Reflector) with a hairline grid;
 *   - five luminous platforms with emissive rings;
 *   - five chrome figures (articulated mannequins, metallic PBR lit by a green
 *     environment probe) in distinct poses, the central one reaching up;
 *   - vertical word columns — GENESIS · EVIDENCE · TRUTH · ABSENCE · A BETTER
 *     TOMORROW — floating behind the figures;
 *   - the frame is bloomed by the backdrop's composer.
 *
 * Deterministic (seeded PRNG passed in), disposable, and built only inside a
 * live WebGL context — never at import time, so tests without a DOM stay safe.
 */

export const MATRIX_WORDS = ['GENESIS', 'EVIDENCE', 'TRUTH', 'ABSENCE', 'A BETTER TOMORROW'] as const;

export function isMatrixRoute(hash: string): boolean {
  return /^#\/matrix(?:\?|$)/.test(hash || '#/');
}

export interface MatrixStage {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  update(t: number, dt: number, parallaxX: number, parallaxY: number): void;
  layout(width: number, height: number): void;
  dispose(): void;
}

const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789Z:・"=*+-<>¦|çﾘｸ';
const ATLAS_COLS = 16;

function glyphAtlas(doc: Document): THREE.CanvasTexture | null {
  const canvas = doc.createElement('canvas');
  const size = 1024;
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  const cell = size / ATLAS_COLS;
  ctx.font = `bold ${Math.floor(cell * 0.78)}px "Noto Sans JP", "Yu Gothic", "MS Gothic", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < ATLAS_COLS * ATLAS_COLS; i++) {
    const ch = GLYPHS[i % GLYPHS.length];
    const cx = (i % ATLAS_COLS) * cell + cell / 2;
    const cy = Math.floor(i / ATLAS_COLS) * cell + cell / 2;
    ctx.fillStyle = '#b7ffd0';
    ctx.fillText(ch, cx, cy);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

function wordTexture(doc: Document, word: string): THREE.CanvasTexture | null {
  const canvas = doc.createElement('canvas');
  const letters = word.split('');
  const cell = 96;
  canvas.width = cell; canvas.height = cell * letters.length;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `700 ${Math.floor(cell * 0.62)}px "DejaVu Sans Mono", "Fira Code", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  letters.forEach((ch, i) => {
    ctx.shadowColor = '#4dff9b';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#d8ffe8';
    ctx.fillText(ch, cell / 2, i * cell + cell / 2);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const RAIN_VERTEX = /* glsl */ `
attribute float aGlyph;
attribute float aBright;
attribute float aSize;
varying float vGlyph;
varying float vBright;
void main() {
  vGlyph = aGlyph;
  vBright = aBright;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (300.0 / -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;
const RAIN_FRAGMENT = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uCols;
varying float vGlyph;
varying float vBright;
void main() {
  float col = mod(vGlyph, uCols);
  float row = floor(vGlyph / uCols);
  vec2 uv = (vec2(col, row) + gl_PointCoord) / uCols;
  uv.y = 1.0 - uv.y;
  vec4 tex = texture2D(uAtlas, uv);
  float a = tex.g;
  if (a < 0.08) discard;
  vec3 color = mix(vec3(0.05, 0.55, 0.22), vec3(0.75, 1.0, 0.85), clamp(vBright - 0.5, 0.0, 1.0));
  gl_FragColor = vec4(color * vBright, a);
}
`;

function mannequin(material: THREE.Material, pose: 'reach' | 'wave' | 'stand' | 'hands' | 'open', track: <T extends { dispose(): void }>(d: T) => T): THREE.Group {
  const g = new THREE.Group();
  const torso = new THREE.Mesh(track(new THREE.CapsuleGeometry(0.34, 0.86, 6, 16)), material);
  torso.position.y = 1.32;
  const head = new THREE.Mesh(track(new THREE.SphereGeometry(0.22, 24, 16)), material);
  head.position.y = 2.05;
  const limb = (len: number, r: number): THREE.Mesh => new THREE.Mesh(track(new THREE.CapsuleGeometry(r, len, 4, 12)), material);
  const legL = limb(0.86, 0.12); legL.position.set(-0.17, 0.5, 0);
  const legR = limb(0.86, 0.12); legR.position.set(0.17, 0.5, 0);
  const armL = new THREE.Group(); const armR = new THREE.Group();
  const upperL = limb(0.72, 0.1); upperL.position.y = -0.4; armL.add(upperL);
  const upperR = limb(0.72, 0.1); upperR.position.y = -0.4; armR.add(upperR);
  armL.position.set(-0.46, 1.72, 0); armR.position.set(0.46, 1.72, 0);
  switch (pose) {
    case 'reach': armR.rotation.z = Math.PI * 0.92; armR.rotation.x = -0.15; armL.rotation.z = 0.35; break;
    case 'wave': armL.rotation.z = -Math.PI * 0.55; armL.rotation.x = 0.4; armR.rotation.z = 0.2; break;
    case 'hands': armL.rotation.z = -0.9; armL.rotation.x = 1.1; armR.rotation.z = 0.9; armR.rotation.x = 1.1; break;
    case 'open': armL.rotation.z = -0.75; armR.rotation.z = 0.75; break;
    default: armL.rotation.z = -0.18; armR.rotation.z = 0.18;
  }
  g.add(torso, head, legL, legR, armL, armR);
  return g;
}

export function buildMatrixStage(
  renderer: THREE.WebGLRenderer,
  doc: Document,
  random: () => number,
  lowPower: boolean,
): MatrixStage {
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(d: T): T => { disposables.push(d); return d; };
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000704);
  scene.fog = new THREE.FogExp2(0x000905, lowPower ? 0.06 : 0.042);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  camera.position.set(3.2, 2.7, 13.5);

  // Green environment probe so the chrome has something to reflect.
  const probeScene = new THREE.Scene();
  probeScene.background = new THREE.Color(0x0e4d2a);
  probeScene.add(new THREE.HemisphereLight(0x2dff7f, 0x001a0c, 3.5));
  const probeMesh = new THREE.Mesh(track(new THREE.SphereGeometry(6, 16, 8)), track(new THREE.MeshBasicMaterial({ color: 0x0a3a1c, side: THREE.BackSide })));
  probeScene.add(probeMesh);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = track(pmrem.fromScene(probeScene, 0, 0.1, 100));
  pmrem.dispose();
  scene.environment = env.texture;

  // Lights.
  scene.add(new THREE.HemisphereLight(0x39d97a, 0x000000, 0.55));
  const key = new THREE.DirectionalLight(0x9dffc4, 3.0);
  key.position.set(2, 9, 8);
  scene.add(key);
  const fill = new THREE.PointLight(0x7dffb0, 7, 34, 1.4);
  fill.position.set(0, 4.5, 8.5);
  scene.add(fill);

  // Mirror floor + hairline grid.
  const floorGeo = track(new THREE.PlaneGeometry(80, 80));
  const mirror = new Reflector(floorGeo, { clipBias: 0.003, textureWidth: lowPower ? 256 : 768, textureHeight: lowPower ? 256 : 768, color: 0x0b1f13 });
  mirror.rotation.x = -Math.PI / 2;
  scene.add(mirror);
  track({ dispose: () => mirror.dispose() });
  const grid = new THREE.GridHelper(80, 80, 0x1f8a4c, 0x0d3d22);
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = 0.35;
  grid.position.y = 0.01;
  track(grid.geometry); track(grid.material as THREE.Material);
  scene.add(grid);

  // Platforms, rings, figures.
  const chrome = track(new THREE.MeshStandardMaterial({ color: 0xd6f5e4, metalness: 0.95, roughness: 0.2, envMapIntensity: 2.2, emissive: 0x123d26, emissiveIntensity: 0.35 }));
  const platMat = track(new THREE.MeshStandardMaterial({ color: 0x08150d, metalness: 0.8, roughness: 0.3 }));
  const ringMat = track(new THREE.MeshStandardMaterial({ color: 0x39d97a, emissive: 0x39d97a, emissiveIntensity: 3.2, roughness: 0.4 }));
  const rings: THREE.Mesh[] = [];
  const xs = [-7.2, -3.6, 0, 3.6, 7.2];
  const poses: Array<'reach' | 'wave' | 'stand' | 'hands' | 'open'> = ['stand', 'wave', 'reach', 'hands', 'open'];
  xs.forEach((x, i) => {
    const big = i === 2;
    const r = big ? 2.0 : 1.55;
    const platform = new THREE.Mesh(track(new THREE.CylinderGeometry(r, r * 1.04, 0.22, 48)), platMat);
    platform.position.set(x, 0.11, big ? 1.2 : 0);
    const ring = new THREE.Mesh(track(new THREE.TorusGeometry(r, 0.05, 10, 96)), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 0.23, big ? 1.2 : 0);
    const glow = new THREE.PointLight(0x39d97a, big ? 6 : 3.5, 9, 1.8);
    glow.position.set(x, 0.6, big ? 1.2 : 0);
    const figure = mannequin(chrome, poses[i], track);
    figure.position.set(x, 0.22, big ? 1.2 : 0);
    figure.scale.setScalar(big ? 1.08 : 0.96);
    figure.rotation.y = (random() - 0.5) * 0.5;
    scene.add(platform, ring, glow, figure);
    rings.push(ring);
  });

  // Word columns.
  const wordMeshes: THREE.Mesh[] = [];
  MATRIX_WORDS.forEach((w, i) => {
    const tex = wordTexture(doc, w);
    if (!tex) return;
    track(tex);
    const h = 0.7 * w.length;
    const mesh = new THREE.Mesh(track(new THREE.PlaneGeometry(0.7, h)), track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: 0x8dffbd })));
    mesh.position.set(xs[i] + (i === 2 ? 0 : (random() - 0.5) * 1.2), 4.2 + h / 2 + (random() - 0.5), -6.5 - random() * 2);
    scene.add(mesh);
    wordMeshes.push(mesh);
  });

  // Glyph rain.
  const atlas = glyphAtlas(doc);
  const count = lowPower ? 2600 : 7000;
  const positions = new Float32Array(count * 3);
  const glyph = new Float32Array(count);
  const bright = new Float32Array(count);
  const size = new Float32Array(count);
  const speed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (random() - 0.5) * 70;
    positions[i * 3 + 1] = random() * 30;
    positions[i * 3 + 2] = -34 + random() * 44;
    glyph[i] = Math.floor(random() * ATLAS_COLS * ATLAS_COLS);
    const head = random() < 0.09;
    bright[i] = head ? 1.9 + random() * 0.6 : 0.35 + random() * 0.55;
    size[i] = 0.55 + random() * 0.5;
    speed[i] = 2.2 + random() * 4.5;
  }
  const rainGeo = track(new THREE.BufferGeometry());
  rainGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  rainGeo.setAttribute('aGlyph', new THREE.BufferAttribute(glyph, 1));
  rainGeo.setAttribute('aBright', new THREE.BufferAttribute(bright, 1));
  rainGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const rainMat = track(new THREE.ShaderMaterial({
    vertexShader: RAIN_VERTEX, fragmentShader: RAIN_FRAGMENT,
    uniforms: { uAtlas: { value: atlas }, uCols: { value: ATLAS_COLS } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }));
  if (atlas) track(atlas);
  const rain = new THREE.Points(rainGeo, rainMat);
  rain.visible = atlas !== null;
  scene.add(rain);
  const posAttr = rainGeo.getAttribute('position') as THREE.BufferAttribute;
  const glyphAttr = rainGeo.getAttribute('aGlyph') as THREE.BufferAttribute;
  let glyphTick = 0;

  return {
    scene,
    camera,
    layout(width, height) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    update(t, dt, parallaxX, parallaxY) {
      const arr = posAttr.array as Float32Array;
      for (let i = 0; i < count; i++) {
        let y = arr[i * 3 + 1] - speed[i] * dt;
        if (y < -0.5) y += 30.5;
        arr[i * 3 + 1] = y;
      }
      posAttr.needsUpdate = true;
      // Flicker a slice of glyphs each frame (deterministic walk through the buffer).
      glyphTick = (glyphTick + 97) % count;
      const g = glyphAttr.array as Float32Array;
      for (let k = 0; k < 40; k++) {
        const idx = (glyphTick + k * 131) % count;
        g[idx] = (g[idx] + 37) % (ATLAS_COLS * ATLAS_COLS);
      }
      glyphAttr.needsUpdate = true;
      rings.forEach((ring, i) => { (ring.material as THREE.MeshStandardMaterial).emissiveIntensity = 2.6 + Math.sin(t * 1.6 + i) * 0.7; });
      wordMeshes.forEach((m, i) => { m.position.y += Math.sin(t * 0.6 + i * 1.3) * 0.0012; });
      camera.position.x = 3.2 + Math.sin(t * 0.07) * 1.2 + parallaxX * 0.8;
      camera.position.y = 2.7 + parallaxY * 0.4;
      camera.lookAt(-1.6, 2.4, 0);
    },
    dispose() {
      for (const d of disposables) d.dispose();
      scene.clear();
    },
  };
}
