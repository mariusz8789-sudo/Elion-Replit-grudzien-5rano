import type * as THREE from 'three';
import type { SimParams } from '../types';
import type { Sim3D } from './types';
import { createStarfield, type Starfield } from './starfield';
import { detectRenderTier, tierDpr } from './quality';

/**
 * GENESIS PULSE — żywe, ambientowe tło Command Center (główny Dashboard).
 *
 * To NIE drugi silnik graficzny: budowana WYŁĄCZNIE na wspólnym Sim3D +
 * useThreeLoop.ts + createStarfield (te same prymitywy co Einstein/Universe
 * Lab i epidemicCity3D). Jedyna nowa rzecz to UKŁAD tej konkretnej sceny:
 * centralny „rdzeń" Genesis otoczony węzłami = REALNA liczba laboratoriów
 * (core/registry.ts::getLabs().length), nie wymyślona ozdoba. Gdy najedzie
 * kolejny prawdziwy Sim3D (np. żywa symulacja aktywnego projektu), Dashboard
 * może go osadzić przez ten sam useThreeLoop — ta scena jest wyłącznie
 * domyślnym, „nic jeszcze nie jest otwarte" stanem.
 */

/** Fibonacci-sphere: równomierny, deterministyczny rozkład N punktów na sferze o promieniu r. Czyste — testowalne bez WebGL. */
export function sphericalNodeLayout(count: number, radius: number): Array<{ x: number; y: number; z: number }> {
  if (count <= 0) return [];
  const points: Array<{ x: number; y: number; z: number }> = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / Math.max(1, count - 1)) * 2; // 1 -> -1
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    points.push({ x: Math.cos(theta) * r * radius, y: y * radius, z: Math.sin(theta) * r * radius });
  }
  return points;
}

/** Paleta Genesis (te same heksy co CSS custom properties --cyan/--violet/--gold/--green w styles.css). */
const PALETTE = [0x5cd6e8, 0xa78bfa, 0xf0b35c, 0x6ee7a0];
export function nodeColor(index: number): number {
  return PALETTE[index % PALETTE.length];
}

const MAX_NODES = 18;
const CORE_RADIUS = 0.62;
const ORBIT_RADIUS = 2.4;

export interface GenesisPulseOptions {
  /** Liczba laboratoriów/modułów — steruje liczbą węzłów wokół rdzenia (realne dane, nie ozdoba). */
  nodeCount: number;
}

export class GenesisPulseSim implements Sim3D {
  readonly cameraAutoRotateSpeed = 2.4;
  private nodeCount: number;
  private t = 0;
  private core: THREE.Mesh | undefined;
  private coreGlow: THREE.Mesh | undefined;
  private nodes: THREE.Mesh[] = [];
  private links: THREE.LineSegments | undefined;
  private starfield: Starfield | undefined;
  private group: THREE.Group | undefined;

  constructor(options: GenesisPulseOptions) {
    this.nodeCount = Math.max(1, Math.min(MAX_NODES, Math.round(options.nodeCount)));
  }

  init(three: typeof THREE, scene: THREE.Scene, camera: THREE.PerspectiveCamera, _w: number, _h: number): void {
    scene.fog = new three.FogExp2(0x02030a, 0.045);
    camera.position.set(3.6, 2.1, 4.4);

    const tier = detectRenderTier();
    this.starfield = createStarfield(three, tier, 900, [8, 22]);
    scene.add(this.starfield.points);

    this.group = new three.Group();
    scene.add(this.group);

    const coreGeo = new three.IcosahedronGeometry(CORE_RADIUS, 1);
    const coreMat = new three.MeshBasicMaterial({ color: 0xeef1fa, wireframe: true, transparent: true, opacity: 0.55 });
    this.core = new three.Mesh(coreGeo, coreMat);
    this.group.add(this.core);

    const glowGeo = new three.IcosahedronGeometry(CORE_RADIUS * 0.72, 2);
    const glowMat = new three.MeshBasicMaterial({ color: 0x5cd6e8, transparent: true, opacity: 0.28 });
    this.coreGlow = new three.Mesh(glowGeo, glowMat);
    this.group.add(this.coreGlow);

    const positions = sphericalNodeLayout(this.nodeCount, ORBIT_RADIUS);
    const linkPositions = new Float32Array(this.nodeCount * 6);
    positions.forEach((p, i) => {
      const geo = new three.SphereGeometry(0.075, 14, 14);
      const mat = new three.MeshBasicMaterial({ color: nodeColor(i) });
      const mesh = new three.Mesh(geo, mat);
      mesh.position.set(p.x, p.y, p.z);
      this.group!.add(mesh);
      this.nodes.push(mesh);
      linkPositions[i * 6] = 0; linkPositions[i * 6 + 1] = 0; linkPositions[i * 6 + 2] = 0;
      linkPositions[i * 6 + 3] = p.x; linkPositions[i * 6 + 4] = p.y; linkPositions[i * 6 + 5] = p.z;
    });
    const linkGeo = new three.BufferGeometry();
    linkGeo.setAttribute('position', new three.BufferAttribute(linkPositions, 3));
    const linkMat = new three.LineBasicMaterial({ color: 0x5cd6e8, transparent: true, opacity: 0.16 });
    this.links = new three.LineSegments(linkGeo, linkMat);
    this.group.add(this.links);
  }

  update(dt: number, _params: SimParams): void {
    this.t += dt;
  }

  syncScene(_scene: THREE.Scene, _camera: THREE.PerspectiveCamera): void {
    if (!this.group || !this.core || !this.coreGlow) return;
    this.group.rotation.y = this.t * 0.09;
    this.core.rotation.x = this.t * 0.05;
    this.core.rotation.y = this.t * 0.08;
    const pulse = 1 + Math.sin(this.t * 1.4) * 0.06;
    this.coreGlow.scale.setScalar(pulse);
    this.nodes.forEach((node, i) => {
      const s = 1 + Math.sin(this.t * 1.6 + i) * 0.12;
      node.scale.setScalar(s);
    });
  }

  onResize(_w: number, _h: number): void {
    // Sfera węzłów jest już wyskalowana do sceny; useThreeLoop zarządza kamerą/DPR.
  }

  dispose(): void {
    this.starfield?.geometry.dispose();
    this.starfield?.material.dispose();
    this.starfield?.texture.dispose();
    this.core?.geometry.dispose();
    (this.core?.material as THREE.Material | undefined)?.dispose();
    this.coreGlow?.geometry.dispose();
    (this.coreGlow?.material as THREE.Material | undefined)?.dispose();
    this.links?.geometry.dispose();
    (this.links?.material as THREE.Material | undefined)?.dispose();
    for (const n of this.nodes) {
      n.geometry.dispose();
      (n.material as THREE.Material).dispose();
    }
  }
}

/** Jeden wspólny DPR helper (reużywany, gdyby Dashboard chciał sam ograniczyć jakość na słabszych urządzeniach). */
export function ambientDpr(): number {
  return tierDpr(detectRenderTier());
}
