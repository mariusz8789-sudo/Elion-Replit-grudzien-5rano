import type * as THREE from 'three';

/**
 * Reality Navigator — kontrakt sceny w PERSYSTENTNYM silniku 3D.
 *
 * Świadome lustro core/three/types.ts::Sim3D, ale z jedną kluczową różnicą:
 * Sim3D zakłada, że init() dostaje ŚWIEŻĄ scenę/renderer (useThreeLoop.ts
 * tworzy je od zera przy każdej zmianie Sim3D — patrz ARCHITECTURE.md).
 * RealityScene odwrotnie: renderer/scene/camera są WSPÓLNE i długowieczne
 * (RealityEngine.ts), więc init() dodaje obiekty do ISTNIEJĄCEJ sceny, a
 * dispose() musi usunąć WYŁĄCZNIE własne obiekty (inne sceny mogą być
 * właśnie w trakcie przejścia kamery i nadal potrzebować swoich węzłów).
 *
 * To NIE zastępuje Sim3D — 13 zweryfikowanych laboratoriów zostaje
 * dokładnie tak, jak są, każde ze swoim własnym useThreeLoop/canvasem.
 * RealityScene to nowa, osobna warstwa dla Reality Navigatora, która może
 * REUŻYWAĆ fizyki tych laboratoriów (core/physics.ts, core/modelGraph)
 * bez reużywania ich maszynerii renderującej.
 */
export interface CameraFraming {
  position: [number, number, number];
  lookAt: [number, number, number];
}

export interface RealityScene {
  id: string;
  label: string;
  /** Buduje obiekty tej sceny w WSPÓLNEJ scenie silnika — wywoływane raz przy aktywacji. */
  init(three: typeof THREE, scene: THREE.Scene): void;
  /** Czysta aktualizacja stanu (bez dotykania THREE.Object3D) — testowalna bez WebGL. */
  update(dt: number): void;
  /** Synchronizacja obiektów sceny ze stanem po update() — jedyne miejsce dotykające THREE.Object3D. */
  syncScene(): void;
  /** by RealityEngine mógł ustawić kamerę przy aktywacji sceny (sequencer leci do tego kadru). */
  getDefaultFraming(): CameraFraming;
  /** Sprzątanie WYŁĄCZNIE własnych obiektów tej sceny. */
  dispose(): void;
  getStats?(): Record<string, number>;
}
