import { useEffect, useRef, useState } from 'react';
import type React from 'react';

/**
 * ENGINE CORE HOLO — the holographic "Genesis engine core" that sits beside the
 * Start headline. Purely decorative (aria-hidden): a glowing core sphere with an
 * additive halo, three tilted orbit rings carrying small nodes in the brand
 * colours (cyan / violet / green, see GenesisMark in AppShell), a sparse
 * particle shell, slow rotation and a subtle mouse parallax.
 *
 * Engineering contract:
 *  - three.js is imported DYNAMICALLY, so the Start route pays nothing for it
 *    until the component mounts (same chunk the 3D labs already share).
 *  - dpr is capped at 1.5; the loop pauses while `document.hidden`; under
 *    `prefers-reduced-motion` exactly one static frame is rendered.
 *  - Everything (geometries, materials, textures, renderer) is disposed on
 *    unmount; every browser API is guarded so the module is jsdom/SSR safe and
 *    renders NOTHING when WebGL is unavailable (no fake fallback pretending
 *    to be the engine).
 */

type ThreeModule = typeof import('three');

interface HoloHandle {
  readonly dispose: () => void;
}

const MAX_DPR = 1.5;

function haloTexture(three: ThreeModule, inner: string, outer: string): import('three').Texture | null {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, outer);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new three.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/** Deterministic pseudo-random in [0, 1) — the particle shell must not flicker between mounts. */
function hash01(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function buildScene(three: ThreeModule, canvas: HTMLCanvasElement, host: HTMLElement): HoloHandle {
  const renderer = new three.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1, MAX_DPR));

  const scene = new three.Scene();
  const camera = new three.PerspectiveCamera(38, 1, 0.1, 50);
  camera.position.set(0, 0.6, 9.2);
  camera.lookAt(0, 0, 0);

  const root = new three.Group();
  scene.add(root);

  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(d: T): T => { disposables.push(d); return d; };

  // ---- core sphere: fresnel shader, white heart -> cyan rim, additive ----
  const coreGeo = track(new three.SphereGeometry(1, 56, 56));
  const coreMat = track(new three.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: three.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uInner: { value: new three.Color('#eefaff') },
      uRim: { value: new three.Color('#5cd6e8') },
      uViolet: { value: new three.Color('#a78bfa') },
    },
    vertexShader: `
      varying vec3 vNormal; varying vec3 vView; varying vec3 vPos;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        vPos = position;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uInner; uniform vec3 uRim; uniform vec3 uViolet;
      varying vec3 vNormal; varying vec3 vView; varying vec3 vPos;
      void main() {
        float f = 1.0 - max(dot(vNormal, vView), 0.0);
        float rim = pow(f, 2.2);
        float bands = 0.5 + 0.5 * sin(vPos.y * 9.0 + uTime * 1.4);
        vec3 col = mix(uInner, uRim, smoothstep(0.0, 0.85, f));
        col = mix(col, uViolet, rim * 0.55 * bands);
        float alpha = 0.22 + rim * 0.95;
        gl_FragColor = vec4(col * (0.75 + rim * 1.2), alpha);
      }`,
  }));
  const core = new three.Mesh(coreGeo, coreMat);
  root.add(core);

  // inner bright heart
  const heartGeo = track(new three.SphereGeometry(0.42, 32, 32));
  const heartMat = track(new three.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, blending: three.AdditiveBlending, depthWrite: false }));
  root.add(new three.Mesh(heartGeo, heartMat));

  // ---- halo sprite ----
  const haloTex = haloTexture(three, 'rgba(238,250,255,0.95)', 'rgba(92,214,232,0.45)');
  if (haloTex) {
    track(haloTex);
    const haloMat = track(new three.SpriteMaterial({ map: haloTex, transparent: true, blending: three.AdditiveBlending, depthWrite: false, opacity: 0.85 }));
    const halo = new three.Sprite(haloMat);
    halo.scale.set(4.6, 4.6, 1);
    root.add(halo);
    const haloMat2 = track(new three.SpriteMaterial({ map: haloTex, transparent: true, blending: three.AdditiveBlending, depthWrite: false, opacity: 0.35, color: '#a78bfa' }));
    const halo2 = new three.Sprite(haloMat2);
    halo2.scale.set(8.5, 8.5, 1);
    root.add(halo2);
  }

  // ---- orbit rings with travelling nodes ----
  const RINGS = [
    { r: 1.95, color: '#5cd6e8', tilt: [1.05, 0.15, 0.3], nodes: 3, speed: 0.55 },
    { r: 2.55, color: '#a78bfa', tilt: [0.55, 0.9, -0.5], nodes: 2, speed: -0.38 },
    { r: 3.15, color: '#39d97a', tilt: [1.4, -0.4, 0.9], nodes: 2, speed: 0.27 },
  ] as const;
  const ringGroups: Array<{ group: import('three').Group; nodes: import('three').Mesh[]; speed: number; r: number }> = [];
  const nodeGeo = track(new three.SphereGeometry(0.075, 16, 16));
  for (const spec of RINGS) {
    const group = new three.Group();
    group.rotation.set(spec.tilt[0], spec.tilt[1], spec.tilt[2]);
    const torusGeo = track(new three.TorusGeometry(spec.r, 0.011, 8, 160));
    const torusMat = track(new three.MeshBasicMaterial({ color: spec.color, transparent: true, opacity: 0.75, blending: three.AdditiveBlending, depthWrite: false }));
    group.add(new three.Mesh(torusGeo, torusMat));
    // faint wide band behind the wire for a holographic thickness
    const bandGeo = track(new three.TorusGeometry(spec.r, 0.05, 8, 160));
    const bandMat = track(new three.MeshBasicMaterial({ color: spec.color, transparent: true, opacity: 0.12, blending: three.AdditiveBlending, depthWrite: false }));
    group.add(new three.Mesh(bandGeo, bandMat));
    const nodeMat = track(new three.MeshBasicMaterial({ color: spec.color }));
    const glowMat = haloTex ? track(new three.SpriteMaterial({ map: haloTex, color: spec.color, transparent: true, blending: three.AdditiveBlending, depthWrite: false, opacity: 0.8 })) : null;
    const nodes: import('three').Mesh[] = [];
    for (let i = 0; i < spec.nodes; i++) {
      const node = new three.Mesh(nodeGeo, nodeMat);
      if (glowMat) { const s = new three.Sprite(glowMat); s.scale.set(0.5, 0.5, 1); node.add(s); }
      group.add(node);
      nodes.push(node);
    }
    root.add(group);
    ringGroups.push({ group, nodes, speed: spec.speed, r: spec.r });
  }

  // ---- particle shell ----
  const COUNT = 360;
  const positions = new Float32Array(COUNT * 3);
  const colors = new Float32Array(COUNT * 3);
  const palette = [new three.Color('#5cd6e8'), new three.Color('#a78bfa'), new three.Color('#39d97a'), new three.Color('#eef2fb')];
  for (let i = 0; i < COUNT; i++) {
    const u = hash01(i, 1) * 2 - 1;
    const phi = hash01(i, 2) * Math.PI * 2;
    const rad = 2.2 + hash01(i, 3) * 2.6;
    const s = Math.sqrt(1 - u * u);
    positions[i * 3] = rad * s * Math.cos(phi);
    positions[i * 3 + 1] = rad * u * 0.85;
    positions[i * 3 + 2] = rad * s * Math.sin(phi);
    const c = palette[Math.floor(hash01(i, 4) * palette.length)]!;
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  const pGeo = track(new three.BufferGeometry());
  pGeo.setAttribute('position', new three.BufferAttribute(positions, 3));
  pGeo.setAttribute('color', new three.BufferAttribute(colors, 3));
  const pMat = track(new three.PointsMaterial({ size: 0.045, vertexColors: true, transparent: true, opacity: 0.85, blending: three.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
  const particles = new three.Points(pGeo, pMat);
  root.add(particles);

  // ---- sizing ----
  const resize = (): void => {
    const w = Math.max(1, host.clientWidth);
    const h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => { resize(); if (!running) renderFrame(lastT); });
    ro.observe(host);
  }

  // ---- interaction + loop ----
  const reduced = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let targetX = 0, targetY = 0, curX = 0, curY = 0;
  const onPointer = (e: PointerEvent): void => {
    if (typeof window === 'undefined') return;
    targetX = (e.clientX / window.innerWidth - 0.5) * 2;
    targetY = (e.clientY / window.innerHeight - 0.5) * 2;
  };
  if (!reduced && typeof window !== 'undefined') window.addEventListener('pointermove', onPointer, { passive: true });

  let raf = 0;
  let running = false;
  let lastT = 0;
  const start = typeof performance !== 'undefined' ? performance.now() : 0;

  const renderFrame = (now: number): void => {
    const t = (now - start) / 1000;
    lastT = now;
    curX += (targetX - curX) * 0.04;
    curY += (targetY - curY) * 0.04;
    root.rotation.y = t * 0.12 + curX * 0.35;
    root.rotation.x = Math.sin(t * 0.21) * 0.08 + curY * 0.22;
    core.rotation.y = -t * 0.3;
    coreMat.uniforms.uTime!.value = t;
    const pulse = 1 + Math.sin(t * 1.7) * 0.035;
    core.scale.setScalar(pulse);
    for (const rg of ringGroups) {
      rg.group.rotation.z += rg.speed * 0.0025;
      rg.nodes.forEach((n, i) => {
        const a = t * rg.speed * 0.9 + (i / rg.nodes.length) * Math.PI * 2;
        n.position.set(Math.cos(a) * rg.r, Math.sin(a) * rg.r, 0);
      });
    }
    particles.rotation.y = -t * 0.05;
    renderer.render(scene, camera);
  };

  const loop = (now: number): void => {
    if (!running) return;
    renderFrame(now);
    raf = requestAnimationFrame(loop);
  };
  const play = (): void => {
    if (running || reduced) return;
    running = true;
    raf = requestAnimationFrame(loop);
  };
  const pause = (): void => {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  };
  const onVisibility = (): void => { if (typeof document !== 'undefined' && document.hidden) pause(); else play(); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility);

  renderFrame(start);
  if (!reduced && !(typeof document !== 'undefined' && document.hidden)) play();

  return {
    dispose: () => {
      pause();
      ro?.disconnect();
      if (typeof window !== 'undefined') window.removeEventListener('pointermove', onPointer);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility);
      for (const d of disposables) { try { d.dispose(); } catch { /* already gone */ } }
      try { renderer.dispose(); } catch { /* context already lost */ }
    },
  };
}

/** True only where a WebGL context can plausibly be created (never in jsdom). */
export function canUseWebGL(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

export function EngineCoreHolo({ className = '' }: { readonly className?: string }): React.ReactElement | null {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    if (!canUseWebGL()) { setFailed(true); return; }
    let handle: HoloHandle | null = null;
    let cancelled = false;
    import('three')
      .then((three) => {
        if (cancelled) return;
        try {
          handle = buildScene(three, canvas, host);
          host.dataset['holoReady'] = '1';
        } catch {
          setFailed(true);
        }
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => {
      cancelled = true;
      handle?.dispose();
      handle = null;
    };
  }, []);

  if (failed) return null;
  return (
    <div ref={hostRef} className={`engine-core-holo ${className}`.trim()} aria-hidden="true" data-testid="engine-core-holo">
      <canvas ref={canvasRef} className="engine-core-holo-canvas" />
    </div>
  );
}

export default EngineCoreHolo;
