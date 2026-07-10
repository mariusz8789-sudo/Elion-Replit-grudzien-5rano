import type * as THREE from 'three';
import type { SimParams } from '../types';

/**
 * Kontrakt symulacji 3D — świadome lustro `core/types.ts::Sim`, NIE osobna
 * architektura. Ten sam cykl życia (init/update/render/getStats/reset/
 * pointer), tylko render() dostaje scenę WebGL zamiast CanvasRenderingContext2D.
 * `useThreeLoop.ts` jest lustrem `useSimLoop.ts` z tego samego powodu:
 * jedna spójna pętla symulacji w całym Genesis OS, dwa cienkie adaptery
 * renderujące (Canvas 2D dla większości laboratoriów, WebGL tam, gdzie
 * głębia 3D realnie pomaga zrozumieć fizykę — patrz ARCHITECTURE.md
 * „Sceny 3D (Three.js)").
 */
export interface Sim3D {
  /** Budowa sceny — wywoływane raz przy montażu (i przy zmianie eksperymentu). */
  init(three: typeof THREE, scene: THREE.Scene, camera: THREE.PerspectiveCamera, w: number, h: number): void;
  /** Krok fizyki/animacji — CZYSTE dane, bez efektów ubocznych na WebGL (testowalne bez GPU). */
  update(dt: number, params: SimParams): void;
  /** Synchronizacja obiektów sceny ze stanem po update() — jedyne miejsce dotykające THREE.Object3D. */
  syncScene(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void;
  /** Reakcja na zmianę rozmiaru viewportu (poza standardowym auto-resize kamery/renderera). */
  onResize?(w: number, h: number): void;
  getStats?(): Record<string, number>;
  reset?(): void;
  pointer?(x: number, y: number, type: 'down' | 'move' | 'up'): void;
  dispose?(): void;
}
