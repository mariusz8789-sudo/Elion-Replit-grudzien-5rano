import type * as THREE from 'three';
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import type { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import type { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { SimParams } from '../types';

/**
 * Klasy postprocessingu wstrzykiwane przez useThreeLoop.ts (załadowane
 * dynamicznie razem z `three`) — Sim3D dostaje gotowe konstruktory zamiast
 * samo importować, żeby jeden hook zarządzał JEDNYM cyklem ładowania
 * WebGL dla całej platformy.
 */
export interface PostProcessingModules {
  EffectComposer: typeof EffectComposer;
  RenderPass: typeof RenderPass;
  UnrealBloomPass: typeof UnrealBloomPass;
  OutputPass: typeof OutputPass;
}

/** Zwracane przez Sim3D.setupPostProcessing — cienki interfejs nad EffectComposer. */
export interface PostProcessor {
  render(): void;
  setSize(w: number, h: number): void;
  dispose?(): void;
}

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
  /**
   * Opcjonalny postprocessing (np. UnrealBloomPass) — patrz
   * ARCHITECTURE.md „Sceny 3D". Wywoływane raz po init(); jeśli obecne,
   * useThreeLoop.ts renderuje przez zwrócony PostProcessor zamiast
   * gołego renderer.render(scene, camera).
   */
  setupPostProcessing?(
    modules: PostProcessingModules,
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    w: number,
    h: number,
  ): PostProcessor;
}
