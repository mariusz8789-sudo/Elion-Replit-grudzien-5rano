import type * as THREE_NS from 'three';
import type { Sim3D } from '../three/types';
import type { SimParams } from '../types';
import { WorldFrameRenderer } from '../three/graphics/worldFrameRenderer';
import { getFrameState } from '../worldModel/bridge/worldFrameState';
import { toGraphicsWorldFrame } from '../worldModel/bridge/graphicsWorldFrameAdapter';
import type { WorldFrame as GraphicsWorldFrame } from '../three/graphics/worldFrame';
import type { TemporalEngine } from '../worldModel/temporal/temporalEngine';
import type { CameraKeyframe, CameraPath } from './cameraPath';

/**
 * TEMPORAL CINEMATIC ENGINE — REAL BROWSER Sim3D.
 *
 * Reuses the SAME canonical rendering stack every other 3D lab already uses
 * (`useThreeLoop.ts`'s `Sim3D` contract, `WorldFrameRenderer`,
 * `getFrameState`/`toGraphicsWorldFrame`) — no second renderer, no second
 * WebGL harness. This is the smallest real Sim3D that can play a
 * `HistoricalScene`'s `CameraPath` on a real canvas: it owns the camera
 * fully (`disableOrbitControls: true`, exactly the mechanism labScene3D.ts's
 * first-person/cinematic modes already use) and syncs one static
 * `WorldFrame` (this world does not tick — it is a structural snapshot, see
 * `temporalCinematicEngine.ts`) through the unmodified `WorldFrameRenderer`.
 *
 * DETERMINISTIC SEEK: `seekTo(seconds)` is the one method the browser
 * capture hook (`TemporalCinematicScreen.tsx`'s
 * `window.__GENESIS_TEMPORAL_CAPTURE__`) calls between frames — it moves the
 * camera to an exact point on the path and nothing else, so a Playwright
 * script can capture a bit-for-bit reproducible sequence of frames rather
 * than sampling a live, wall-clock-driven animation.
 */
export class TemporalCinematicSim3D implements Sim3D {
  readonly disableOrbitControls = true;
  /** See `Sim3D`'s own doc — required for `TemporalCinematicScreen.tsx`'s capture hook to read real pixels via `canvas.toDataURL()` from a Playwright script, outside this render loop. */
  readonly preserveDrawingBufferForCapture = true;

  private renderer: WorldFrameRenderer | null = null;
  private currentTimeSeconds = 0;
  private readonly graphicsFrame: GraphicsWorldFrame;

  constructor(
    engine: TemporalEngine,
    private readonly cameraPath: CameraPath,
  ) {
    // The historical world is a generated snapshot, never ticked by this scene (no solver advances
    // it) -- computed once, reused for every sync(), exactly like a single-frame WorldFrame would
    // be for any other static structural view.
    this.graphicsFrame = toGraphicsWorldFrame(getFrameState(engine));
  }

  init(THREE: typeof THREE_NS, scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera, _w: number, _h: number): void {
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const sun = new THREE.DirectionalLight(0xfff2e0, 1.1);
    sun.position.set(80, 140, 60);
    scene.add(sun);
    scene.fog = new THREE.Fog(0x0c1018, 60, 900);

    this.renderer = new WorldFrameRenderer(THREE, scene);
    this.renderer.sync(this.graphicsFrame);

    const first = this.cameraPath.keyframes[0];
    if (first) this.applyKeyframe(camera, first);
  }

  /** Moves the owned camera to `seconds` along `cameraPath` — nearest-keyframe lookup (this path is
   * sampled at a fixed frame rate already; interpolation is not needed for a proof-correct capture). */
  seekTo(seconds: number): void {
    this.currentTimeSeconds = Math.max(0, Math.min(this.cameraPath.durationSeconds, seconds));
  }

  getCurrentTimeSeconds(): number {
    return this.currentTimeSeconds;
  }

  /** Diagnostic snapshot of the exact graphics-frame data this scene is rendering — surfaced via the browser capture hook so a Playwright script can confirm what the renderer actually received, not just what the Node-side generator produced. */
  debugEntitySummary(): readonly { id: string; position: readonly [number, number, number]; scale: number }[] {
    return this.graphicsFrame.entities.map((e) => ({ id: e.id, position: e.position, scale: e.scale ?? 1 }));
  }

  private applyKeyframe(camera: THREE_NS.PerspectiveCamera, keyframe: CameraKeyframe): void {
    camera.position.set(keyframe.position.x, keyframe.position.y, keyframe.position.z);
    camera.lookAt(keyframe.lookAt.x, keyframe.lookAt.y, keyframe.lookAt.z);
  }

  private nearestKeyframe(): CameraKeyframe {
    const frames = this.cameraPath.keyframes;
    let best = frames[0]!;
    let bestDelta = Infinity;
    for (const frame of frames) {
      const delta = Math.abs(frame.t - this.currentTimeSeconds);
      if (delta < bestDelta) {
        bestDelta = delta;
        best = frame;
      }
    }
    return best;
  }

  update(_dt: number, _params: SimParams): void {
    // Camera state is driven entirely by `seekTo` (either the capture hook, for a deterministic
    // proof, or a live playback driver) -- no autonomous per-frame advance here.
  }

  syncScene(_scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera): void {
    this.renderer?.sync(this.graphicsFrame);
    this.applyKeyframe(camera, this.nearestKeyframe());
  }

  dispose(): void {
    this.renderer?.dispose();
    this.renderer = null;
  }
}
