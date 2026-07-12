import type * as THREE from 'three';
import type { CameraFraming, RealityScene } from './types';
import { CameraFlight, flightBetween, type FlightState } from './cameraSequencer';
import { detectRenderTier, tierDpr } from '../three/quality';
import { TransitController, type TransitContext, type TransitState } from './transit';
import { TransitVisual } from './transitVisual';

/**
 * Silnik persystentnej sceny 3D Reality Navigatora.
 *
 * Kluczowa różnica względem core/three/useThreeLoop.ts (który tworzy NOWY
 * WebGLRenderer/Scene przy KAŻDEJ zmianie Sim3D — celowo, bo 13 laboratoriów
 * ma niezależne, jednorazowe sceny): tu renderer/scene/camera są tworzone
 * DOKŁADNIE RAZ, przy pierwszym mount(), i żyją tak długo jak aplikacja.
 * setScene() wymienia WYŁĄCZNIE zawartość (dispose starej sceny, init nowej)
 * — canvas, kontekst WebGL i stan kamery przetrwają. To jest właśnie
 * "persystentne płótno, które przetrwa przejścia między labami/workspace'ami".
 *
 * Singleton (nie hook) celowo: RealityCanvas.tsx montuje się RAZ w App.tsx,
 * POZA warunkowym drzewem tras (patrz App.tsx), więc jego komponent nigdy
 * nie odmontowuje się przy zmianie trasy — silnik musi przetrwać razem z nim.
 */
class RealityEngineImpl {
  private three: typeof THREE | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private controls: import('three/examples/jsm/controls/OrbitControls.js').OrbitControls | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private raf = 0;
  private lastFrameTime = 0;
  private mountPromise: Promise<void> | null = null;

  private activeScene: RealityScene | null = null;
  private flight: CameraFlight | null = null;
  private flightLabel: string | null = null;

  private transit = new TransitController();
  private transitVisual: TransitVisual | null = null;
  private onTransitComplete: ((ctx: TransitContext) => void) | null = null;

  private listeners = new Set<() => void>();

  get isReady(): boolean {
    return this.renderer !== null;
  }

  /** Aspekt (szerokość/wysokość) aktywnej kamery — sceny używają go do kadrowania szerokich układów na wąskich (portretowych) ekranach. */
  get viewportAspect(): number {
    return this.camera?.aspect ?? 1.6;
  }

  get activeSceneLabel(): string | null {
    return this.activeScene?.label ?? null;
  }

  /**
   * Czy PODANA instancja sceny jest już aktywna — sprawdzenie tożsamości
   * referencji, nie tylko id/label. Komponenty React (np. RealityNavigator)
   * odmontowują się i montują ponownie przy nawigacji, ale scena żyje na
   * poziomie modułu i przetrwa — bez tego sprawdzenia każdy powrót do trasy
   * odtwarzałby scenę od zera (dispose+init+lot startowy), mimo że silnik
   * już ją renderuje z zachowanym stanem.
   */
  isSceneActive(scene: RealityScene): boolean {
    return this.activeScene === scene;
  }

  get flightState(): { active: boolean; label: string | null; progress: number } {
    if (!this.flight) return { active: false, label: null, progress: 1 };
    return { active: !this.flight.isDone, label: this.flightLabel, progress: 0 };
  }

  async mount(canvas: HTMLCanvasElement): Promise<void> {
    if (this.canvas === canvas && this.isReady) return;
    this.canvas = canvas;
    if (!this.mountPromise) this.mountPromise = this.init(canvas);
    await this.mountPromise;
  }

  private async init(canvas: HTMLCanvasElement): Promise<void> {
    const [THREE, { OrbitControls }] = await Promise.all([
      import('three'),
      import('three/examples/jsm/controls/OrbitControls.js'),
    ]);
    this.three = THREE;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setClearColor(0x02030a, 1);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 3000);
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    camera.position.set(4, 3, 6);
    controls.target.set(0, 0, 0);

    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.controls = controls;
    this.transitVisual = new TransitVisual(THREE, scene);
    this.fit();

    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(canvas);

    this.lastFrameTime = performance.now();
    this.raf = requestAnimationFrame(this.loop);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.emit();
  }

  /** Ten sam wzorzec co useThreeLoop.ts: pauza rAF w tle oszczędza baterię/CPU zamiast renderować niewidoczną kartę. */
  private onVisibility = (): void => {
    if (document.hidden) {
      cancelAnimationFrame(this.raf);
    } else {
      this.lastFrameTime = performance.now();
      this.raf = requestAnimationFrame(this.loop);
    }
  };

  /** Wywoływane przez RealityCanvas, gdy jego widoczność (display:none ↔ block) się zmienia — canvas przy display:none ma rozmiar 0×0. */
  resize(): void {
    this.fit();
  }

  private fit(): void {
    if (!this.renderer || !this.camera || !this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    this.renderer.setPixelRatio(tierDpr(detectRenderTier()));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private loop = (now: number): void => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.renderer || !this.scene || !this.camera || !this.controls) return;
    const dt = Math.min((now - this.lastFrameTime) / 1000, 0.05);
    this.lastFrameTime = now;

    if (this.flight) {
      const s: FlightState = this.flight.advance(dt);
      this.applyFlightState(s);
      if (s.done) {
        this.flight = null;
        if (!this.transit.isActive) this.controls.enabled = true;
      }
    }

    // Reality Transit: model stanu jest źródłem prawdy (patrz transit.ts).
    // Silnik posuwa go co klatkę i przy 'complete' JEDNORAZOWO oddaje kontekst
    // konsumentowi (RealityNavigator wykonuje wtedy faktyczną zamianę gałęzi).
    if (this.transit.isActive) {
      this.transit.advance(dt);
      const completed = this.transit.consumeCompletion();
      if (completed) {
        this.onTransitComplete?.(completed);
        if (!this.flight) this.controls.enabled = true;
      }
      this.emit();
    }
    // Warstwa wizualna przejścia — czyta stan (transit.ts) i maluje tunel.
    this.transitVisual?.update(this.transit.getState(), dt, this.camera);

    this.activeScene?.update(dt);
    this.activeScene?.syncScene();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  private applyFlightState(s: FlightState): void {
    if (!this.camera || !this.controls) return;
    this.camera.position.set(s.position[0], s.position[1], s.position[2]);
    this.controls.target.set(s.lookAt[0], s.lookAt[1], s.lookAt[2]);
    this.flightLabel = s.label;
  }

  private currentFraming(): CameraFraming {
    const pos = this.camera?.position;
    const target = this.controls?.target;
    return {
      position: pos ? [pos.x, pos.y, pos.z] : [4, 3, 6],
      lookAt: target ? [target.x, target.y, target.z] : [0, 0, 0],
    };
  }

  /** Zmienia aktywną scenę: usuwa obiekty starej (jej WŁASNE, nie renderer/scene), buduje nową, leci kamerą do jej domyślnego kadru. */
  setScene(scene: RealityScene, flightDurationSec = 2.2): void {
    if (!this.three || !this.scene) throw new Error('RealityEngine.setScene() wywołane przed mount()');
    this.activeScene?.dispose();
    this.activeScene = scene;
    scene.init(this.three, this.scene);
    this.flight = flightBetween(this.currentFraming(), scene.getDefaultFraming(), flightDurationSec, undefined, scene.label);
    this.flightLabel = scene.label;
    this.controls!.enabled = false;
    this.emit();
  }

  /** Odtwarza dowolny wcześniej zbudowany, ciągły lot (np. OrbitalRealityScene.buildConsequenceFlight) — blokuje ręczne sterowanie OrbitControls na czas lotu, żeby nie fightować o pozycję kamery klatka po klatce. */
  playFlight(flight: CameraFlight): void {
    if (!this.controls) return;
    this.flight = flight;
    this.controls.enabled = false;
  }

  get isFlying(): boolean {
    return this.flight !== null && !this.flight.isDone;
  }

  /**
   * Rozpoczyna Reality Transit — najpierw STAN (transit.ts), niezależnie od
   * jakiejkolwiek wizualizacji. Blokuje ręczne sterowanie kamerą na czas
   * przejścia. `onTransitComplete` (ustawiony przez konsumenta) odpala się
   * DOKŁADNIE RAZ, gdy przejście dobiegnie fazy 'complete' — to jest moment,
   * w którym RealityNavigator faktycznie przełącza aktywną gałąź.
   */
  beginTransit(context: TransitContext): boolean {
    if (!this.controls) return false;
    const started = this.transit.begin(context);
    if (started) {
      this.controls.enabled = false;
      this.emit();
    }
    return started;
  }

  setOnTransitComplete(fn: ((ctx: TransitContext) => void) | null): void {
    this.onTransitComplete = fn;
  }

  get transitState(): TransitState {
    return this.transit.getState();
  }

  get isTransiting(): boolean {
    return this.transit.isActive;
  }

  getSceneStats(): Record<string, number> {
    return this.activeScene?.getStats?.() ?? {};
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}

export const realityEngine = new RealityEngineImpl();
