import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { mulberry32, hyperNode, rotate4D, project5D, type Vec4 } from '../engine/HyperMath';
import { particleVertexShader, particleFragmentShader } from '../engine/GenesisShaders';

const COUNT = 12000;
const emerald = 0x00ff41;

export function GenesisCanvas({ paused = false }: { paused?: boolean }): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 100);
    camera.position.set(0, 0.4, 8);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 1);
    renderer.domElement.className = 'genesis-canvas';
    host.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 4; controls.maxDistance = 14;

    const rng = mulberry32(0x9d5e2026);
    const positions = new Float32Array(COUNT * 3);
    const energies = new Float32Array(COUNT);
    const hidden = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i += 1) {
      const node = hyperNode(i, rng);
      const p = project5D(node, 0);
      positions[i * 3] = p[0]; positions[i * 3 + 1] = p[1]; positions[i * 3 + 2] = p[2];
      energies[i] = rng(); hidden[i] = node[3];
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aEnergy', new THREE.Float32BufferAttribute(energies, 1));
    geometry.setAttribute('aW', new THREE.Float32BufferAttribute(hidden, 1));
    const material = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: particleVertexShader, fragmentShader: particleFragmentShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    const lineMaterial = new THREE.LineBasicMaterial({ color: emerald, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending });
    const vertices: THREE.Vector3[] = [];
    const corners: Vec4[] = [];
    for (let mask = 0; mask < 16; mask += 1) corners.push([mask & 1 ? 1.5 : -1.5, mask & 2 ? 1.5 : -1.5, mask & 4 ? 1.5 : -1.5, mask & 8 ? 1.5 : -1.5]);
    for (let i = 0; i < corners.length; i += 1) for (let bit = 0; bit < 4; bit += 1) {
      const j = i ^ (1 << bit); if (i < j) { const a = rotate4D(corners[i], 'xw', 0.2); const b = rotate4D(corners[j], 'xw', 0.2); vertices.push(new THREE.Vector3(a[0], a[1], a[2]), new THREE.Vector3(b[0], b[1], b[2])); }
    }
    const lineGeo = new THREE.BufferGeometry().setFromPoints(vertices);
    const tesseract = new THREE.LineSegments(lineGeo, lineMaterial); scene.add(tesseract);

    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.55, 0.12));
    const clock = new THREE.Clock(); let raf = 0;
    const resize = () => { const w = window.innerWidth; const h = window.innerHeight; camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); renderer.setSize(w, h, false); composer.setSize(w, h); };
    const frame = () => { raf = requestAnimationFrame(frame); if (!pausedRef.current) { const t = clock.getElapsedTime(); material.uniforms.uTime.value = t; particles.rotation.y += 0.0007; tesseract.rotation.y = t * 0.08; tesseract.rotation.x = t * 0.05; controls.update(); composer.render(); } };
    resize(); window.addEventListener('resize', resize); frame();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); controls.dispose(); composer.dispose(); geometry.dispose(); lineGeo.dispose(); material.dispose(); lineMaterial.dispose(); renderer.dispose(); renderer.domElement.remove(); };
  }, []);
  return <div ref={hostRef} className="genesis-canvas-host" aria-label="Genesis 9D visualizer" />;
}
