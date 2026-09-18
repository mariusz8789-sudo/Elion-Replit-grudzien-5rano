import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const NODE_COUNT = 12_000;
const DPR_CAP = 1.5;

function seeded(i: number): number {
  let x = (i * 1664525 + 1013904223) >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 2246822519) >>> 0;
  return (x >>> 0) / 4294967296;
}

const vertexShader = `
  uniform float uTime;
  attribute float aSeed;
  attribute float aW;
  attribute float aV;
  varying float vEnergy;
  void main() {
    vec3 p = position;
    float t = uTime * (0.18 + aSeed * 0.08);
    float w = sin(t + p.x * 1.7 + p.z) * 0.22;
    float y = cos(t * 0.83 + p.y * 1.35 + p.x) * 0.18;
    // Deterministic XW/YZ-style projection: two coupled rotations stand in for
    // the hidden dimensions while the ninth coordinate modulates node energy.
    float x4 = p.x * cos(t) - aW * sin(t);
    float z4 = p.z * cos(t * 0.71) - aV * sin(t * 0.71);
    p.x = x4 + w;
    p.z = z4 + y;
    p.y += sin(t * 1.19 + p.x * 2.0) * 0.12;
    vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = (1.35 + aSeed * 2.2) * (90.0 / max(1.0, -mvPosition.z));
    gl_Position = projectionMatrix * mvPosition;
    vEnergy = 0.35 + 0.65 * sin(t + aSeed * 6.28318) * 0.5 + 0.325;
  }
`;

const fragmentShader = `
  varying float vEnergy;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float glow = pow(1.0 - d * 2.0, 2.4);
    vec3 emerald = vec3(0.0, 1.0, 0.255);
    vec3 cyan = vec3(0.0, 0.9, 1.0);
    vec3 color = mix(emerald, cyan, clamp(vEnergy, 0.0, 1.0));
    gl_FragColor = vec4(color, glow * (0.28 + vEnergy * 0.62));
  }
`;

export function HyperStateVisualizer(): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.055);
    const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 100);
    camera.position.z = 8.2;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_CAP));
    renderer.setClearColor(0x000000, 1);
    renderer.domElement.className = 'hyper-state-canvas';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.appendChild(renderer.domElement);

    const positions = new Float32Array(NODE_COUNT * 3);
    const seeds = new Float32Array(NODE_COUNT);
    const hiddenW = new Float32Array(NODE_COUNT);
    const hiddenV = new Float32Array(NODE_COUNT);
    for (let i = 0; i < NODE_COUNT; i += 1) {
      const u = seeded(i * 5 + 1);
      const v = seeded(i * 5 + 2);
      const w = seeded(i * 5 + 3);
      const a = seeded(i * 5 + 4);
      const b = seeded(i * 5 + 5);
      const radius = 1.2 + Math.pow(u, 0.42) * 4.6;
      const theta = v * Math.PI * 2;
      const phi = Math.acos(2 * w - 1);
      const o = i * 3;
      positions[o] = Math.sin(phi) * Math.cos(theta) * radius;
      positions[o + 1] = Math.cos(phi) * radius;
      positions[o + 2] = Math.sin(phi) * Math.sin(theta) * radius;
      hiddenW[i] = a * 2 - 1;
      hiddenV[i] = b * 2 - 1;
      seeds[i] = seeded(i * 13 + 7);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));
    geometry.setAttribute('aW', new THREE.Float32BufferAttribute(hiddenW, 1));
    geometry.setAttribute('aV', new THREE.Float32BufferAttribute(hiddenV, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(geometry, material);
    scene.add(points);
    const clock = new THREE.Clock();
    let raf = 0;
    const resize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
    };
    const frame = () => {
      raf = requestAnimationFrame(frame);
      material.uniforms.uTime.value = clock.getElapsedTime();
      points.rotation.y += 0.0008;
      points.rotation.x = Math.sin(material.uniforms.uTime.value * 0.08) * 0.08;
      renderer.render(scene, camera);
    };
    resize();
    window.addEventListener('resize', resize);
    frame();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return <div ref={hostRef} className="hyper-state-visualizer" />;
}

export default HyperStateVisualizer;
