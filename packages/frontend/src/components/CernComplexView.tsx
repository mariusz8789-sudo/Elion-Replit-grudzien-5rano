import { useEffect, useRef, useState, type SyntheticEvent } from 'react';
import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { SSRPass } from 'three/examples/jsm/postprocessing/SSRPass.js';
import type { BlackHoleAnalysis, CollisionBatchAnalysis, MaterialsAnalysis } from '@genesis/core/mythos/KernelProviderRegistry.js';
import { kernelRegistry } from '@genesis/core/mythos/KernelProviderRegistry.js';
import type { IonSpec, LatticeSite } from '@genesis/core/cern/MaterialsDiscoveryEngine.js';
import { ION_PRESETS } from '../core/scientificWorlds/ionPresets';
import { createEventHorizonMaterial, createEventHorizonQuad } from '../../../ui/src/cern/EventHorizonShader';
import { createTunnelWalkthrough } from '../../../ui/src/cern/TunnelWalkthroughGpu';
import { createLabComplex, type CameraMode, type LabComplexHandle } from '../../../ui/src/cern/LabComplexGpu';
import { createCernPostPipeline, type PostPipelineHandle, type PostQuality } from '../../../ui/src/cern/Cern5dPostProcessing';
import { createColliderLayer, type ColliderLayerHandle } from '../../../ui/src/collider/ColliderGpu';
import { GENESIS_CYBER_KERNEL_ID } from '../core/agent/cyberReasoningKernel';

/**
 * CERN COMPLEX (`#/cern-complex`) — the full-viewport walk-through of the
 * laboratory hub, the armoured observation glass and the LHC-like tunnel.
 * Two engines behind the single kernel do the science: the micro black hole
 * provider (`micro-blackhole-sim`: Schwarzschild radius, Hawking temperature
 * and lifetime, a deterministic Hawking spectrum; the 4D regime needs the
 * Planck energy and is a HYPOTHESIS, the TeV-scale ADD regime is
 * SPECULATIVE and says so) and the materials provider
 * (`crystal-synthesis-sim`: lattice choice, cell constant, density, bulk
 * modulus, conductivity as documented ESTIMATES, not DFT). Every attempt is
 * committed to the kernel's EvidenceLedger by the engine before the HUD
 * shows it.
 *
 * The picture: physically based materials, emissive strips with additive
 * volumetric cones, the event horizon (screen-space lensing, accretion disk,
 * Doppler beaming) rendered to a texture that the refraction glass bends, and
 * the delivered 5D post pipeline (`Cern5dPostProcessing`): SSAO, SSR on the
 * floor and the glass, bloom, volumetric scattering, lens/glass pass, output.
 * When SSR cannot be built (or the frame budget forces a lower quality) a
 * planar reflector under the floor keeps the reflections. Camera modes on
 * keys 1–4: WALK, GLASS, CONSOLE, TUNNEL; Q collides a batch (hologram in the
 * hub), E attempts a horizon in the ADD scenario at 14 TeV, R synthesises a
 * crystal. FPS and the FPV position are measured, nothing else on the HUD is
 * a status. The scene paints; it never decides.
 */

export const MODE_LABEL: Record<CameraMode, string> = { WALK: '1 · WALK — spacer FPV', GLASS: '2 · GLASS — pancerna szyba', CONSOLE: '3 · CONSOLE — sterownia', TUNNEL: '4 · TUNNEL — pierścień LHC' };

export { ION_PRESETS } from '../core/scientificWorlds/ionPresets';

const SEED = 0x4345524e; // 'CERN'

/** Pure boundary to the black hole provider, unit-testable without WebGL. */
export function requestFormation(seed: number, sqrtSGeV: number, addThresholdTeV: number | null): BlackHoleAnalysis | { error: string } {
  const p = kernelRegistry.resolve('micro-blackhole-sim');
  if (!p) return { error: 'BLACKHOLE_PROVIDER_NOT_REGISTERED' };
  const req = addThresholdTeV === null ? { seed, sqrtSGeV } : { seed, sqrtSGeV, addThresholdTeV };
  return p.analyze({ kernelId: GENESIS_CYBER_KERNEL_ID, route: '#/cern-complex', operatorId: 'VIEWER' }, req) as BlackHoleAnalysis;
}

/** Pure boundary to the materials provider. */
export function requestSynthesis(seed: number, ions: readonly IonSpec[]): MaterialsAnalysis | { error: string } {
  const p = kernelRegistry.resolve('crystal-synthesis-sim');
  if (!p) return { error: 'MATERIALS_PROVIDER_NOT_REGISTERED' };
  return p.analyze({ kernelId: GENESIS_CYBER_KERNEL_ID, route: '#/cern-complex', operatorId: 'VIEWER' }, { seed, ions }) as MaterialsAnalysis;
}

/** Pure boundary to the collision-batch provider (ComputeColliderEngine behind the kernel). */
export function requestBatch(label: string, n: number, startIndex: number): CollisionBatchAnalysis | { error: string } {
  const p = kernelRegistry.resolve('collision-batch');
  if (!p) return { error: 'COLLISION_BATCH_PROVIDER_NOT_REGISTERED' };
  return p.analyze({ kernelId: GENESIS_CYBER_KERNEL_ID, route: '#/cern-complex', operatorId: 'VIEWER' }, { label, n, startIndex, sqrtS: 13000 }) as CollisionBatchAnalysis;
}

const fmt = (x: number): string => (x === 0 ? '0' : Math.abs(x) >= 1e4 || Math.abs(x) < 1e-3 ? x.toExponential(3) : x.toPrecision(4));

/** The lattice on the bench: one instance per site of the engine's structure, colour per species. Pure, so the mapping is testable. */
export function latticeInstances(sites: readonly LatticeSite[], spacing = 0.16): { readonly positions: readonly [number, number, number][]; readonly colors: readonly string[] } {
  const palette = ['#f8fafc', '#38bdf8', '#ff9a3c', '#a78bfa', '#62f0a3'];
  const species = [...new Set(sites.map((s) => s.species))];
  const positions = sites.map((s) => [(s.x - 1) * spacing, s.z * spacing, (s.y - 1) * spacing] as [number, number, number]);
  const colors = sites.map((s) => palette[species.indexOf(s.species) % palette.length]);
  return { positions, colors };
}

interface Stage { readonly setMode: (m: CameraMode) => void; readonly lock: () => void; readonly setLattice: (sites: readonly LatticeSite[]) => void; readonly setBlackHole: (rs: number, tempK: number) => void; readonly setLens: (rs: number) => void; readonly showEvent: (a: CollisionBatchAnalysis, index?: number) => void; }

type DetailLevel = 'SCHOOL' | 'UNIVERSITY' | 'RESEARCH';

export function CernComplexView(): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<Stage | null>(null);
  const [mode, setMode] = useState<CameraMode>('WALK');
  const [glError, setGlError] = useState<string | null>(null);
  const [sqrtS, setSqrtS] = useState<number>(13000);
  const [addTeV, setAddTeV] = useState<string>('');
  const [bh, setBh] = useState<BlackHoleAnalysis | null>(null);
  const [preset, setPreset] = useState<string>('NaCl');
  const [mat, setMat] = useState<MaterialsAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frames, setFrames] = useState(0);
  const [fps, setFps] = useState(0);
  const [fpv, setFpv] = useState('0.0, 1.6, 4.0');
  const [quality, setQuality] = useState<PostQuality>('cinematic');
  const [batch, setBatch] = useState<CollisionBatchAnalysis | null>(null);
  const [batchStart, setBatchStart] = useState(0);
  const [selectedEventIndex, setSelectedEventIndex] = useState(0);
  const [replayStatus, setReplayStatus] = useState<'NOT_RUN' | 'MATCH' | 'DRIFT'>('NOT_RUN');
  const [detailLevel, setDetailLevel] = useState<DetailLevel>('SCHOOL');
  const [hashes, setHashes] = useState<string[]>([]);
  const batchIndexRef = useRef(0);

  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' }); } catch (e) { setGlError(e instanceof Error ? e.message : String(e)); return; }
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setPixelRatio(dpr);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.82;
    renderer.shadowMap.enabled = false;
    host.appendChild(renderer.domElement);
    const canvas = renderer.domElement;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x02040a);
    scene.fog = new THREE.FogExp2(0x05080f, 0.026);
    const camera = new THREE.PerspectiveCamera(68, 1, 0.05, 220);
    camera.position.set(0, 1.6, 4); camera.lookAt(0, 1.5, -6);

    // --- event horizon → texture: the band of the lensing shader with the glass's 3:1 aspect (round shadow, wide disk) ---
    const BH_W = 1536, BH_H = 512;
    const bhTarget = new THREE.WebGLRenderTarget(BH_W, BH_H, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    bhTarget.texture.colorSpace = THREE.NoColorSpace;
    const bhMat = createEventHorizonMaterial(0.09, 5500, 7);
    const bhQuad = createEventHorizonQuad(bhMat, 2);
    const bhUv = bhQuad.geometry.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < bhUv.count; i++) bhUv.setY(i, 1 / 3 + bhUv.getY(i) / 3);
    bhUv.needsUpdate = true;
    const bhScene = new THREE.Scene(); bhScene.add(bhQuad);
    const bhCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // --- the complex and the tunnel (delivered GPU modules) ---
    const tunnel = createTunnelWalkthrough(scene, camera, canvas, 11);
    tunnel.setEnabled(false);
    const lab: LabComplexHandle = createLabComplex(scene, camera, canvas, tunnel, 21);
    lab.setBackdrop(bhTarget.texture);
    lab.openDoor(1, true); lab.openDoor(3, true);

    // --- scene dressing: what makes the hub read as a lit room, not a wire box ---
    const dressing = new THREE.Group(); scene.add(dressing);
    const disposables: { dispose(): void }[] = [bhTarget, bhMat, bhQuad.geometry];
    const add = <T extends THREE.Object3D>(o: T): T => { dressing.add(o); return o; };
    const track = (m: THREE.Mesh): THREE.Mesh => { disposables.push(m.geometry, m.material as THREE.Material); return m; };

    // Detector hall beyond the glass: the horizon texture itself, between the glass (z=-6.6) and the wall (z=-7).
    const hallMat = new THREE.MeshBasicMaterial({ map: bhTarget.texture, toneMapped: false });
    const hall = add(track(new THREE.Mesh(new THREE.PlaneGeometry(12, 4), hallMat)));
    hall.position.set(0, 2.2, -6.92);

    // Ceiling light strips (emissive, instanced) with additive volumetric cones under each.
    const stripGeo = new THREE.BoxGeometry(0.16, 0.04, 3.2);
    const stripMat = new THREE.MeshStandardMaterial({ color: 0x0b1118, emissive: 0xbfe9ff, emissiveIntensity: 1.2, roughness: 0.4, metalness: 0.1 });
    const strips = new THREE.InstancedMesh(stripGeo, stripMat, 8);
    disposables.push(stripGeo, stripMat);
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1);
    const stripPos: [number, number][] = [[-4, -3.5], [0, -3.5], [4, -3.5], [-4, 0.5], [0, 0.5], [4, 0.5], [-4, 4.5], [4, 4.5]];
    stripPos.forEach(([x, z], i) => { M.compose(P.set(x, 4.93, z), Q, S); strips.setMatrixAt(i, M); });
    strips.instanceMatrix.needsUpdate = true; add(strips);
    const coneGeo = new THREE.ConeGeometry(1.9, 4.6, 24, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({ color: 0x56b8ff, transparent: true, opacity: 0.018, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    disposables.push(coneGeo, coneMat);
    stripPos.forEach(([x, z]) => { if (x === 0) return; const c = add(new THREE.Mesh(coneGeo, coneMat)); c.position.set(x, 2.6, z); c.rotation.x = Math.PI; });
    const ceilingLights: THREE.PointLight[] = [];
    stripPos.forEach(([x, z], i) => { if (i % 2 === 1 && i !== 7) return; const l = new THREE.PointLight(0xcfe9ff, 8, 11, 1.8); l.position.set(x, 4.4, z); add(l); ceilingLights.push(l); });
    add(new THREE.HemisphereLight(0x8fc8ff, 0x0a0d14, 0.3));
    // Warm accretion glow spilling through the glass; cool spill from the console screens; amber over the bench.
    const glassGlow = add(new THREE.PointLight(0xffa04a, 7, 10, 1.8)); glassGlow.position.set(0, 2.2, -5.9);
    const consoleGlow = add(new THREE.PointLight(0x2af0a0, 3.5, 6, 2)); consoleGlow.position.set(0, 1.4, -4.9);
    const benchGlow = add(new THREE.PointLight(0xffc27a, 4.5, 6, 2)); benchGlow.position.set(4.5, 2.6, 3);
    // Wall washes so the hub's walls and pillars read as surfaces, not as void; a headlamp that follows the camera inside the ring.
    const washes: THREE.PointLight[] = [];
    ([[-6.2, 2.4, -3.5, 0x9fd0ff], [6.2, 2.4, 3.5, 0xffc9a0], [-6.2, 2.4, 3.5, 0xffc9a0], [6.2, 2.4, -3.5, 0x9fd0ff]] as const).forEach(([x, y, z, c]) => { const l = new THREE.PointLight(c, 5, 9, 1.9); l.position.set(x, y, z); add(l); washes.push(l); });
    const headlamp = add(new THREE.PointLight(0xe8f4ff, 0, 14, 1.6));
    const keyLight = add(new THREE.SpotLight(0xdff4ff, 12, 16, 0.55, 0.6, 1.6)); keyLight.position.set(0, 4.8, 2); keyLight.target.position.set(0, 0, -2); add(keyLight.target);

    // Structural pillars and pipe runs (PBR metal, instanced) along the walls.
    const pillarGeo = new THREE.BoxGeometry(0.42, 5, 0.42);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x3a4250, metalness: 0.85, roughness: 0.35 });
    const pillars = new THREE.InstancedMesh(pillarGeo, pillarMat, 8); disposables.push(pillarGeo, pillarMat);
    [[-6.7, -6.7], [6.7, -6.7], [-6.7, 6.7], [6.7, 6.7], [-6.7, -2.3], [-6.7, 2.3], [6.7, 2.3], [-2.3, 6.7]].forEach(([x, z], i) => { M.compose(P.set(x, 2.5, z), Q, S); pillars.setMatrixAt(i, M); });
    pillars.instanceMatrix.needsUpdate = true; add(pillars);
    const pipeGeo = new THREE.CylinderGeometry(0.11, 0.11, 13.6, 14);
    const pipeMat = new THREE.MeshStandardMaterial({ color: 0xc9d6df, metalness: 0.95, roughness: 0.18 });
    const pipes = new THREE.InstancedMesh(pipeGeo, pipeMat, 6); disposables.push(pipeGeo, pipeMat);
    const rotZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    const rotX = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    [[0, 4.55, -6.75, rotZ], [0, 4.25, -6.75, rotZ], [0, 4.55, 6.75, rotZ], [-6.75, 4.55, 0, rotX], [-6.75, 4.25, 0, rotX], [6.75, 4.4, 0, rotX]].forEach(([x, y, z, q], i) => { M.compose(P.set(x as number, y as number, z as number), q as THREE.Quaternion, S); pipes.setMatrixAt(i, M); });
    pipes.instanceMatrix.needsUpdate = true; add(pipes);
    // Equipment racks with LED rows on the +x wall (instanced devices, PBR + emissive).
    const rackGeo = new THREE.BoxGeometry(0.8, 2.2, 0.7);
    const rackMat = new THREE.MeshStandardMaterial({ color: 0x151b25, metalness: 0.7, roughness: 0.45 });
    const racks = new THREE.InstancedMesh(rackGeo, rackMat, 5); disposables.push(rackGeo, rackMat);
    for (let i = 0; i < 5; i++) { M.compose(P.set(6.55, 1.1, -5.2 + i * 1.0), Q, S); racks.setMatrixAt(i, M); }
    racks.instanceMatrix.needsUpdate = true; add(racks);
    const ledGeo = new THREE.BoxGeometry(0.04, 0.05, 0.05);
    const ledMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x62f0a3, emissiveIntensity: 2.2 });
    const leds = new THREE.InstancedMesh(ledGeo, ledMat, 5 * 14); disposables.push(ledGeo, ledMat);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 14; j++) { M.compose(P.set(6.13, 0.25 + j * 0.13, -5.2 + i * 1.0 + ((j % 3) - 1) * 0.18), Q, S); leds.setMatrixAt(i * 14 + j, M); }
    leds.instanceMatrix.needsUpdate = true; add(leds);
    // Lattice on the bench: filled from the materials engine's sites when a synthesis runs (empty until then).
    const siteGeo = new THREE.SphereGeometry(0.045, 12, 10);
    const siteMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.1, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08, emissive: 0x1b3a52, emissiveIntensity: 0.6 });
    const latticeMesh = new THREE.InstancedMesh(siteGeo, siteMat, 64); disposables.push(siteGeo, siteMat);
    latticeMesh.count = 0; latticeMesh.position.set(4.5, 0.98, 3); add(latticeMesh);
    // Collision hologram in the middle of the hub: the batch's first event, tracks bent in 3.8 T, scaled to the room.
    const holo = new THREE.Group(); holo.position.set(0, 3.1, -4.3); holo.scale.setScalar(0.16); add(holo);
    let colliderLayer: ColliderLayerHandle | null = null;
    // The delivered 5D pipeline. SSR selects = the complex's floor and glass (found in the scene: the modules expose no mesh handles).
    const selects: THREE.Mesh[] = [];
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const g = m.geometry as THREE.PlaneGeometry;
      if (g.type === 'PlaneGeometry' && g.parameters.width === 14 && g.parameters.height === 14) selects.push(m);
      if (g.type === 'PlaneGeometry' && g.parameters.width === 12 && g.parameters.height === 4 && (m.material as THREE.ShaderMaterial).isShaderMaterial) selects.push(m);
    });
    const w0 = host.clientWidth || window.innerWidth; const h0 = Math.max(1, host.clientHeight || window.innerHeight);
    const pipeline: PostPipelineHandle = createCernPostPipeline(renderer, scene, camera, { width: Math.round(w0 * dpr), height: Math.round(h0 * dpr), selects });
    pipeline.setLightScreen([0.5, 0.42]);
    pipeline.setLens({ rs: 0, glass: 0.6 });
    const hasSsr = pipeline.composer.passes.some((p) => p instanceof SSRPass);
    // Planar floor reflection as the fallback when SSR is unavailable or switched off by the frame budget.
    const reflector = new Reflector(new THREE.PlaneGeometry(13.9, 13.9), { clipBias: 0.003, textureWidth: Math.round(1024 * dpr), textureHeight: Math.round(1024 * dpr), color: 0x5a6a74 });
    const reflMat = reflector.material as THREE.ShaderMaterial;
    reflMat.fragmentShader = reflMat.fragmentShader.replace('color ), 1.0 );', 'color ), 0.42 );');
    reflMat.transparent = true; reflMat.depthWrite = false;
    reflector.rotation.x = -Math.PI / 2; reflector.position.y = 0.025; reflector.visible = !hasSsr; add(reflector);
    disposables.push(reflector.geometry, reflMat, { dispose: () => reflector.getRenderTarget().dispose() });
    const applyQuality = (q: PostQuality): void => { pipeline.setQuality(q); reflector.visible = !(hasSsr && q === 'cinematic'); setQuality(q); };

    const resize = (): void => {
      const w = host.clientWidth || window.innerWidth; const h = Math.max(1, host.clientHeight || window.innerHeight);
      renderer.setSize(w, h, false); pipeline.resize(Math.round(w * dpr), Math.round(h * dpr));
      camera.aspect = w / h; camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener('resize', resize); window.addEventListener('orientationchange', resize);

    // Camera poses the delivered modules leave to the host: WALK faces the glass, TUNNEL starts inside the ring.
    const TUNNEL_R = 60;
    const poseFor = (m: CameraMode): void => {
      if (m === 'WALK') { camera.position.set(0, 1.6, 4); camera.lookAt(0, 1.5, -6); }
      // Observation window: far enough back that the armoured frame and the hall beyond both read.
      if (m === 'GLASS') { camera.position.set(0, 2.0, -2.4); camera.lookAt(0, 2.2, -6.6); }
      // Control room: the three consoles under the glass, not one screen in the face.
      if (m === 'CONSOLE') { camera.position.set(0, 1.75, -3.0); camera.lookAt(0, 1.0, -5.6); }
      // Inside the ring on the walkway side of the magnet string, looking down the arc.
      if (m === 'TUNNEL') { const a = -0.02; camera.position.set(Math.cos(a) * TUNNEL_R - 1.5, 1.5, Math.sin(a) * TUNNEL_R); camera.lookAt(Math.cos(a + 0.07) * TUNNEL_R - 1.0, 1.3, Math.sin(a + 0.07) * TUNNEL_R); }
    };
    const applyMode = (m: CameraMode): void => { lab.setCameraMode(m); poseFor(m); setMode(m); };
    let lastMode: CameraMode = lab.getCameraMode();
    stageRef.current = {
      setMode: applyMode,
      lock: () => { lab.lock(); tunnel.lock(); },
      setLattice: (sites) => {
        const { positions, colors } = latticeInstances(sites);
        const n = Math.min(64, positions.length); latticeMesh.count = n;
        const col = new THREE.Color();
        for (let i = 0; i < n; i++) { M.compose(P.set(positions[i][0], positions[i][1], positions[i][2]), Q, S); latticeMesh.setMatrixAt(i, M); latticeMesh.setColorAt(i, col.set(colors[i])); }
        latticeMesh.instanceMatrix.needsUpdate = true; if (latticeMesh.instanceColor) latticeMesh.instanceColor.needsUpdate = true;
      },
      setBlackHole: (rs, tempK) => { bhMat.uniforms.uRs.value = rs; bhMat.uniforms.uDiskIn.value = rs * 3; bhMat.uniforms.uDiskOut.value = rs * 12; bhMat.uniforms.uTempK.value = tempK; },
      setLens: (rs) => { pipeline.setLens({ rs, glass: 0.6, center: [0.5, 0.5] }); },
      showEvent: (a, index = 0) => { if (colliderLayer) colliderLayer.dispose(); colliderLayer = createColliderLayer(holo as unknown as THREE.Scene, a.events[index] ?? a.events[0], { pixelRatio: dpr, scale: 0.0042 }); },
    };

    let raf = 0; let last = performance.now(); const t0 = last; let frameCount = 0; let fpsN = 0; let fpsAcc = 0; let budgetN = 0; let budgetAcc = 0; let lastFramesPush = 0;
    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000); const realDt = (now - last) / 1000; last = now; const t = (now - t0) * 0.001;
      const m = lab.getCameraMode();
      if (m !== lastMode) { lastMode = m; poseFor(m); setMode(m); }
      lab.update(dt, t);
      bhMat.uniforms.uTime.value = t;
      stripMat.emissiveIntensity = 1.15 + 0.12 * Math.sin(t * 1.7);
      renderer.toneMappingExposure = m === 'TUNNEL' ? 0.72 : 0.82;
      headlamp.intensity = m === 'TUNNEL' ? 7 : 0;
      if (m === 'TUNNEL') headlamp.position.set(camera.position.x, camera.position.y + 0.5, camera.position.z);
      glassGlow.intensity = 6.5 + 1.5 * Math.sin(t * 2.3);
      renderer.setRenderTarget(bhTarget); renderer.render(bhScene, bhCam); renderer.setRenderTarget(null);
      colliderLayer?.update(t);
      const start = performance.now();
      pipeline.update(dt);
      const cost = (performance.now() - start) / 1000;
      frameCount++;
      // Frame budget: measured cost of the composer over the first frames decides the quality tier (never a guess about the GPU).
      if (frameCount > 2 && frameCount <= 12) { budgetN++; budgetAcc += cost; if (budgetN === 10) { const avg = budgetAcc / budgetN; if (avg > 0.9) applyQuality('performance'); else if (avg > 0.25) applyQuality('balanced'); } }
      fpsN++; fpsAcc += realDt;
      if (fpsAcc >= 0.5) { setFps(Math.round(fpsN / fpsAcc)); fpsN = 0; fpsAcc = 0; setFpv(`${camera.position.x.toFixed(1)}, ${camera.position.y.toFixed(1)}, ${camera.position.z.toFixed(1)}`); }
      if (now - lastFramesPush > 250) { lastFramesPush = now; setFrames(frameCount); }
    };
    raf = requestAnimationFrame(loop);
    const onKey = (e: KeyboardEvent): void => { if (e.code === 'KeyQ') actionsRef.current?.collide(); if (e.code === 'KeyE') actionsRef.current?.formHorizon(); if (e.code === 'KeyR') actionsRef.current?.synthesize(); };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf); window.removeEventListener('resize', resize); window.removeEventListener('orientationchange', resize); document.removeEventListener('keydown', onKey);
      stageRef.current = null;
      colliderLayer?.dispose();
      lab.dispose(); tunnel.dispose();
      disposables.forEach((d) => d.dispose());
      ceilingLights.forEach((l) => l.dispose()); washes.forEach((l) => l.dispose()); headlamp.dispose(); glassGlow.dispose(); consoleGlow.dispose(); benchGlow.dispose(); keyLight.dispose();
      scene.remove(dressing);
      pipeline.dispose();
      if (canvas.parentElement === host) host.removeChild(canvas);
      renderer.dispose();
    };
  }, []);

  const pushHash = (h: string): void => setHashes((prev) => [h, ...prev].slice(0, 6));
  const attempt = (s: number, add: number | null): void => {
    const a = requestFormation(SEED, s, add);
    if ('error' in a) { setError(a.error); return; }
    setError(null); setBh(a); pushHash(a.ledgerContentHash);
    if (a.result.bh) { stageRef.current?.setBlackHole(0.09 + Math.min(0.05, Math.log10(1 + a.result.bh.massGeV) * 0.004), Math.min(9000, 4000 + Math.log10(a.result.bh.temperatureK) * 120)); stageRef.current?.setLens(0.06); }
    else stageRef.current?.setLens(0);
  };
  const simulate = (): void => {
    const add = addTeV.trim() === '' ? null : Number(addTeV);
    attempt(sqrtS, add !== null && Number.isFinite(add) && add > 0 ? add : null);
  };
  /** [E]: the delivered scenario — 14 TeV in the ADD (extra-dimension) picture with a 5 TeV threshold; SPECULATIVE by the engine's own label. */
  const formHorizon = (): void => { setSqrtS(14000); setAddTeV('5'); attempt(14000, 5); };
  const synthesize = (): void => {
    const a = requestSynthesis(SEED, ION_PRESETS[preset] ?? ION_PRESETS.NaCl);
    if ('error' in a) { setError(a.error); return; }
    setError(null); setMat(a); pushHash(a.ledgerContentHash);
    stageRef.current?.setLattice(a.crystal.sites);
  };
  /** [Q]: four events of the seeded run, anchored as one batch; the first one is shown as the hologram. */
  const collide = (): void => {
    const startIndex = batchIndexRef.current;
    const a = requestBatch('cern-complex-v2', 4, startIndex);
    if ('error' in a) { setError(a.error); return; }
    batchIndexRef.current += 4;
    setError(null); setBatch(a); setBatchStart(startIndex); setSelectedEventIndex(0); setReplayStatus('NOT_RUN'); pushHash(a.ledgerContentHash);
    stageRef.current?.showEvent(a, 0);
  };
  const selectEvent = (index: number): void => {
    if (!batch?.events[index]) return;
    setSelectedEventIndex(index);
    stageRef.current?.showEvent(batch, index);
  };
  const verifyReplay = (): void => {
    if (!batch) return;
    const replay = requestBatch('cern-complex-v2', batch.events.length, batchStart);
    if ('error' in replay) { setError(replay.error); return; }
    const originalHashes = batch.events.map((event) => event.eventHash);
    const replayHashes = replay.events.map((event) => event.eventHash);
    setReplayStatus(originalHashes.length === replayHashes.length && originalHashes.every((hash, index) => hash === replayHashes[index]) ? 'MATCH' : 'DRIFT');
  };
  const actionsRef = useRef({ collide, formHorizon, synthesize });
  actionsRef.current = { collide, formHorizon, synthesize };
  const stop = (e: SyntheticEvent): void => { e.stopPropagation(); };
  const r = bh?.result ?? null;
  const c = mat?.crystal ?? null;
  const selectedEvent = batch?.events[selectedEventIndex] ?? null;

  return (
    <main id="main-content" className="cern" aria-label="Kompleks CERN" data-testid="cern-complex" data-mode={mode} data-frames={frames}>
      <div ref={hostRef} className="cern-stage" data-testid="cern-stage" onClick={() => stageRef.current?.lock()} />
      {glError && <p className="cw-error cern-glerror" role="alert">WebGL niedostępny: {glError}</p>}
      <div className="cern-hud cern-hud-left" aria-live="polite">
        <div className="cern-badges">
          <span className="cern-badge">SCIENTIFIC OS</span>
          <span className="cern-badge" data-testid="cern-badge-mode">MODE: {mode}</span>
          <span className="cern-badge">√s: 13 TeV · batch: {batch ? batch.events.length : 0}</span>
          <span className={`cern-badge${r?.formed ? ' is-hot' : ''}`} data-testid="cern-badge-horizon">HORIZON: {r?.formed ? `FORMED (${bh?.label.toUpperCase()})` : 'NONE'} · r_s: {r?.bh ? `${r.bh.rsM.toExponential(3)} m` : '—'}</span>
          <span className="cern-badge">RENDER: {quality.toUpperCase()}</span>
        </div>
        <div className="gx-eyebrow">GENESIS · KOMPLEKS CERN · 5D</div>
        <h1>Laboratorium, szyba, tunel</h1>
        <div className="cern-modes" role="group" aria-label="Tryby kamery">
          {(Object.keys(MODE_LABEL) as CameraMode[]).map((m) => (
            <button key={m} type="button" className={`cern-mode${m === mode ? ' is-active' : ''}`} data-testid={`cern-mode-${m}`} aria-pressed={m === mode} onClick={() => stageRef.current?.setMode(m)}>{MODE_LABEL[m]}</button>
          ))}
        </div>
        <div className="cern-modes" role="group" aria-label="Akcje">
          <button type="button" className="cern-mode" onClick={collide} data-testid="cern-collide">COLLIDE [Q]</button>
          <button type="button" className="cern-mode" onClick={formHorizon} data-testid="cern-horizon">HORIZON [E]</button>
          <button type="button" className="cern-mode" onClick={synthesize} data-testid="cern-crystal">CRYSTAL [R]</button>
          <button type="button" className="cern-mode" onClick={() => { window.location.hash = '#/physics/cms-z'; }} data-testid="cern-cms-open-data">REAL CMS DATA</button>
        </div>
        <div className="cern-modes" role="group" aria-label="Poziom wyjaśnienia">
          {(['SCHOOL', 'UNIVERSITY', 'RESEARCH'] as const).map((level) => (
            <button key={level} type="button" className={`cern-mode${detailLevel === level ? ' is-active' : ''}`} aria-pressed={detailLevel === level} data-testid={`cern-detail-${level}`} onClick={() => setDetailLevel(level)}>{level}</button>
          ))}
        </div>
        <p className="cern-hint">Klawisze 1–4 przełączają tryb; Q zderza paczkę 4 zdarzeń, E próbuje horyzontu (ADD, 14 TeV), R syntetyzuje kryształ. W trybie WALK i TUNNEL klik w scenę blokuje kursor, WASD porusza.</p>
        {hashes.length > 0 && (
          <div className="cern-hashes" data-testid="cern-hashes">
            {hashes.map((h, i) => <span key={`${h}-${i}`} className="cw-mono">contentHash: {h.slice(0, 24)}…</span>)}
          </div>
        )}
        <p className="cern-faint cw-mono">FPV: {fpv} · {fps} FPS · KERNEL: /cyber (single)</p>
        <p className="cern-faint">Etykiety: COLLIDE — TOY_MC_MODEL (nie PYTHIA/Geant4); mikro czarna dziura — HYPOTHESIS (4D, wymaga energii Plancka) lub SPECULATIVE (scenariusz ADD, brak dowodów); kryształy — EMPIRICAL_ESTIMATE_MODEL (oszacowania, nie DFT). REAL CMS DATA otwiera osobną analizę opublikowanych danych CMS 2011. Obraz 3D jest wizualizacją, nie pomiarem.</p>
      </div>
      <aside className="cern-hud cern-hud-right" aria-label="Sterownia" onKeyDown={stop} onKeyUp={stop}>
        {batch && selectedEvent && (
          <section className="cern-panel cern-event-panel" data-testid="cern-event-panel" data-origin={batch.label}>
            <h2>Zdarzenia zderzenia · collision-batch</h2>
            <p className="cern-origin" data-testid="cern-event-origin">ŹRÓDŁO: {batch.label} · MODEL EDUKACYJNY, NIE DANE DETEKTORA</p>
            <div className="cern-event-tabs" role="group" aria-label="Zdarzenia w paczce">
              {batch.events.map((event, index) => (
                <button key={event.eventHash} type="button" className={`cern-mode${selectedEventIndex === index ? ' is-active' : ''}`} aria-pressed={selectedEventIndex === index} data-testid={`cern-event-${index}`} onClick={() => selectEvent(index)}>EVT {index + 1}</button>
              ))}
            </div>
            <dl className="cw-readout" data-testid="cern-event-readout">
              <dt>Proces</dt><dd className="cw-mono">pp → {selectedEvent.process} · {selectedEvent.finals.length} cząstek końcowych</dd>
              {detailLevel !== 'SCHOOL' && <><dt>Parametry modelu</dt><dd className="cw-mono">pT {selectedEvent.hardPT} GeV · y {selectedEvent.y} · φ {selectedEvent.phi}</dd><dt>Przekrój modelowy</dt><dd className="cw-mono">{selectedEvent.crossSectionPb} pb</dd></>}
              {detailLevel === 'RESEARCH' && <><dt>Id / seed</dt><dd className="cw-mono">{selectedEvent.eventId} · {selectedEvent.seed}</dd><dt>Hash zdarzenia</dt><dd className="cw-mono cw-wrap">{selectedEvent.eventHash}</dd><dt>Ledger paczki</dt><dd className="cw-mono cw-wrap">{batch.ledgerContentHash}</dd></>}
            </dl>
            <div className="cern-replay-row"><button type="button" className="cw-btn" onClick={verifyReplay} data-testid="cern-replay">Zweryfikuj replay</button><strong data-testid="cern-replay-status">REPLAY: {replayStatus}</strong></div>
          </section>
        )}
        <section className="cern-panel" data-testid="cern-bh-panel">
          <h2>Horyzont zdarzeń · micro-blackhole-sim</h2>
          <div className="cern-controls">
            <label>√s [GeV]<input type="number" min={1} step={100} value={sqrtS} onChange={(e) => setSqrtS(Math.max(1, Number(e.target.value) || 1))} data-testid="cern-sqrts" /></label>
            <label>próg ADD [TeV] (opcjonalnie)<input type="number" min={0} step={0.5} value={addTeV} placeholder="—" onChange={(e) => setAddTeV(e.target.value)} data-testid="cern-add" /></label>
            <button type="button" className="cw-btn" onClick={simulate} data-testid="cern-simulate">Próba formacji</button>
          </div>
          {r && bh && (
            <dl className="cw-readout" data-testid="cern-bh-readout" data-formed={r.formed ? '1' : '0'}>
              <dt>Wynik</dt><dd className="cw-mono">{r.formed ? 'UFORMOWANA' : 'BRAK FORMACJI'} · {r.reason}</dd>
              <dt>Reżim / etykieta</dt><dd className="cw-mono" data-testid="cern-bh-label">{r.regime ?? '—'} · {bh.label}</dd>
              {r.bh && <><dt>Masa</dt><dd className="cw-mono">{fmt(r.bh.massGeV)} GeV · {fmt(r.bh.massKg)} kg</dd>
                <dt>r_s · T_H · τ</dt><dd className="cw-mono">{fmt(r.bh.rsM)} m · {fmt(r.bh.temperatureK)} K · {fmt(r.bh.lifetimeS)} s</dd>
                <dt>Kwanty Hawkinga</dt><dd className="cw-mono">{r.bh.quanta.length} · {[...new Set(r.bh.quanta.map((q) => q.name))].join(' ')}</dd></>}
              <dt>Hash zdarzenia</dt><dd className="cw-mono cw-wrap">{r.eventHash}</dd>
              <dt>Ledger</dt><dd className="cw-mono cw-wrap" data-testid="cern-bh-ledger-hash">contentHash {bh.ledgerContentHash}</dd>
            </dl>
          )}
        </section>
        <section className="cern-panel" data-testid="cern-mat-panel">
          <h2>Synteza kryształu · crystal-synthesis-sim</h2>
          <div className="cern-controls">
            <label>skład<select value={preset} onChange={(e) => setPreset(e.target.value)} data-testid="cern-preset">{Object.keys(ION_PRESETS).map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
            <button type="button" className="cw-btn" onClick={synthesize} data-testid="cern-synthesize">Syntetyzuj</button>
          </div>
          {c && mat && (
            <dl className="cw-readout" data-testid="cern-mat-readout">
              <dt>Struktura</dt><dd className="cw-mono">{c.name} · {c.lattice} · {c.sites.length} węzłów · {c.stable ? 'stabilna' : 'niestabilna'}</dd>
              <dt>a · ρ · K</dt><dd className="cw-mono">{c.aPm} pm · {fmt(c.densityKgM3)} kg/m³ · {c.bulkModulusGPa} GPa</dd>
              <dt>σ · DOS(E_F) · E_f</dt><dd className="cw-mono">{fmt(c.conductivitySM)} S/m · {c.dosAtFermiPerEvAtom} /eV/atom · {c.formationEnergyEv} eV</dd>
              <dt>Etykieta</dt><dd className="cw-mono">{mat.label}</dd>
              <dt>Hash struktury</dt><dd className="cw-mono cw-wrap">{c.structureHash}</dd>
              <dt>Ledger</dt><dd className="cw-mono cw-wrap" data-testid="cern-mat-ledger-hash">contentHash {mat.ledgerContentHash}</dd>
            </dl>
          )}
        </section>
        {error && <p className="cw-error" role="alert">{error}</p>}
      </aside>
    </main>
  );
}

export default CernComplexView;
