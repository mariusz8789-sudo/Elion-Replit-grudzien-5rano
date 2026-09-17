import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { mulberry32, hyperNode, project5D } from '../engine/HyperMath';
import { matrixRainVertexShader, matrixRainFragmentShader, particleVertexShader, particleFragmentShader } from '../engine/GenesisShaders';

const COUNT = 24000;

export function GenesisCanvas({ promptSeed = 0 }: { promptSeed?: number }): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.FogExp2(0x000000, 0.045);
    const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 100);
    camera.position.set(0, 0.4, 8);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setClearColor(0x000000, 1);
    renderer.domElement.className = 'genesis-canvas';
    host.appendChild(renderer.domElement);
    const rainScene = new THREE.Scene();
    const rainCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const rainMaterial = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uPrompt: { value: 0 } }, vertexShader: matrixRainVertexShader, fragmentShader: matrixRainFragmentShader, transparent: true, depthWrite: false });
    const rain = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), rainMaterial);
    rainScene.add(rain);
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
    const material = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 }, uPrompt: { value: 0 } }, vertexShader: particleVertexShader, fragmentShader: particleFragmentShader, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.NormalBlending });
    const particles = new THREE.Points(geometry, material);
    scene.add(particles);


    const composer = new EffectComposer(renderer);
    renderer.autoClear = false;
    const renderPass = new RenderPass(scene, camera);
    renderPass.clear = false;
    composer.addPass(renderPass);
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.4, 0.85));
    const clock = new THREE.Clock(); let raf = 0;
    const resize = () => { const w = window.innerWidth; const h = window.innerHeight; camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); renderer.setSize(w, h, false); composer.setSize(w, h); };
    const frame = () => { raf = requestAnimationFrame(frame); const t = clock.getElapsedTime(); rainMaterial.uniforms.uTime.value = t; rainMaterial.uniforms.uPrompt.value = promptSeed / 4294967296; renderer.render(rainScene, rainCamera); material.uniforms.uTime.value = t; material.uniforms.uPrompt.value = promptSeed / 4294967296; particles.rotation.y += 0.0007; particles.rotation.x = Math.sin(t * 0.08) * 0.08; controls.update(); composer.render(); };
    resize(); window.addEventListener('resize', resize); frame();
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); controls.dispose(); composer.dispose(); geometry.dispose(); material.dispose(); rainMaterial.dispose(); rain.geometry.dispose(); renderer.dispose(); renderer.domElement.remove(); };
  }, [promptSeed]);
  return <div ref={hostRef} className="genesis-canvas-host" aria-label="Genesis 9D visualizer" />;
}
