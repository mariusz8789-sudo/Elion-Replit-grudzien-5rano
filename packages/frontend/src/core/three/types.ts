import type * as THREE from 'three';
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import type { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import type { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import type { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { SimParams } from '../types';

/**
 * Klasy postprocessingu wstrzykiwane przez useThreeLoop.ts (załadowane
 * dynamicznie razem z `three`) — Sim3D dostaje gotowe konstruktory zamiast
 * samo importować, żeby jeden hook zarządzał JEDNYM cyklem ładowania
 * WebGL dla całej platformy. ShaderPass to ogólny, mały wrapper na
 * własny fragment shader (fullscreen quad) — reużywalny przez każdą
 * przyszłą scenę 3D potrzebującą customowego efektu post-processingu,
 * nie tylko soczewkowanie grawitacyjne Einstein Lab.
 */
export interface PostProcessingModules {
  EffectComposer: typeof EffectComposer;
  RenderPass: typeof RenderPass;
  ShaderPass: typeof ShaderPass;
  UnrealBloomPass: typeof UnrealBloomPass;
  OutputPass: typeof OutputPass;
}

/** Zwracane przez Sim3D.setupPostProcessing — cienki interfejs nad EffectComposer. */
export interface PostProcessor {
  render(): void;
  setSize(w: number, h: number): void;
  dispose?(): void;
}

/** Neutralna telemetria renderera — bez zależności od konkretnego scenariusza świata. */
export interface ThreeRenderMetrics {
  fps: number;
  frameMs: number;
  renderMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
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
  /**
   * Kinowa prędkość auto-obrotu kamery wokół celu (stopnie/s), aktywna
   * dopóki użytkownik nie zacznie przeciągać — patrz useThreeLoop.ts.
   * Po puszczeniu wraca po ~2,5 s bezczynności. Reużywalna cecha kamery,
   * nie efekt specyficzny dla jednej sceny.
   */
  cameraAutoRotateSpeed?: number;
  /**
   * Punkt, wokół którego OrbitControls ma aktualnie orbitować — wywoływane
   * co klatkę PRZED controls.update(); zwrócenie `null` zostawia bieżący
   * cel OrbitControls bez zmian (domyślne zachowanie większości scen: stały
   * cel w (0,0,0)). Pozwala Sim3D przenieść "pivot" kamery na ruchomy obiekt
   * (np. przelot kamery do wybranej planety w Universe Lab) bez własnej,
   * równoległej implementacji sterowania kamerą — patrz useThreeLoop.ts.
   */
  getOrbitTarget?(): THREE.Vector3 | null;
  /** Opcjonalny dystans kamery podczas focusu na ruchomy obiekt. */
  getOrbitFocusDistance?(): number | null;
  /** Opcjonalny kierunek obserwacji dla presetów tej samej kamery OrbitControls. */
  getOrbitCameraDirection?(): THREE.Vector3 | null;
  /** Budowa sceny — wywoływane raz przy montażu (i przy zmianie eksperymentu). */
  init(three: typeof THREE, scene: THREE.Scene, camera: THREE.PerspectiveCamera, w: number, h: number): void;
  /** Krok fizyki/animacji — CZYSTE dane, bez efektów ubocznych na WebGL (testowalne bez GPU). */
  update(dt: number, params: SimParams): void;
  /** Synchronizacja obiektów sceny ze stanem po update() — jedyne miejsce dotykające THREE.Object3D. */
  syncScene(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void;
  /** Reakcja na zmianę rozmiaru viewportu (poza standardowym auto-resize kamery/renderera). */
  onResize?(w: number, h: number): void;
  getStats?(): Record<string, number>;
  /** Render loop przekazuje metryki GPU/WebGL bez mieszania ich ze stanem naukowym. */
  onRenderMetrics?(metrics: ThreeRenderMetrics): void;
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
