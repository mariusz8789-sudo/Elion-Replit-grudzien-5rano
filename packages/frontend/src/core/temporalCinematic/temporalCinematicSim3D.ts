import type * as THREE_NS from 'three';
import type { PostProcessingModules, PostProcessor, Sim3D } from '../three/types';
import type { SimParams } from '../types';
import { WorldFrameRenderer } from '../three/graphics/worldFrameRenderer';
import { createSceneEnvironment, type SceneEnvironmentHandle } from '../three/graphics/sceneEnvironment';
import { setupGraphicsPipeline } from '../three/graphics/postProcessing';
import { createHighFidelityWeatherRig, weatherProfile, type WeatherRig } from '../three/graphics/highFidelityWeather';
import { getFrameState } from '../worldModel/bridge/worldFrameState';
import { toGraphicsWorldFrame } from '../worldModel/bridge/graphicsWorldFrameAdapter';
import type { WorldFrame as GraphicsWorldFrame } from '../three/graphics/worldFrame';
import type { TemporalEngine } from '../worldModel/temporal/temporalEngine';
import type { CameraKeyframe, CameraPath } from './cameraPath';
import {
  createTemporalCinematicVisualResolver,
  estimateTemporalWorldGroundSize,
  normalizeTemporalCinematicFrameHierarchy,
  type TemporalCinematicVisualResolverHandle,
} from './temporalCinematicVisualResolver';

/**
 * TEMPORAL CINEMATIC ENGINE — CANONICAL HIGH-FIDELITY Sim3D (V5.1).
 *
 * Still the SAME canonical path:
 * WorldSpecification -> createScientificWorld -> WorldGraph -> TemporalEngine
 * -> WorldFrame -> WorldFrameRenderer.
 *
 * V5.1 only supplies the caller-owned visual resolver/environment/post-processing seams the generic
 * renderer was explicitly designed to receive. It does NOT add a second renderer, scene mount,
 * historical world-state model or temporal engine.
 */
export class TemporalCinematicSim3D implements Sim3D {
  readonly disableOrbitControls = true;
  readonly preserveDrawingBufferForCapture = true;

  private renderer: WorldFrameRenderer | null = null;
  private visualResolver: TemporalCinematicVisualResolverHandle | null = null;
  private environment: SceneEnvironmentHandle | null = null;
  private weatherRig: WeatherRig | null = null;
  private THREE: typeof THREE_NS | null = null;
  private camera: THREE_NS.PerspectiveCamera | null = null;
  private currentTimeSeconds = 0;
  private readonly graphicsFrame: GraphicsWorldFrame;

  constructor(
    private readonly engine: TemporalEngine,
    private readonly cameraPath: CameraPath,
    private readonly weather?: string,
  ) {
    this.graphicsFrame = normalizeTemporalCinematicFrameHierarchy(
      toGraphicsWorldFrame(getFrameState(engine)),
      engine.graph,
    );
  }

  init(THREE: typeof THREE_NS, scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera, _w: number, _h: number): void {
    this.THREE = THREE;
    this.camera = camera;
    const profile = weatherProfile(this.weather);
    const groundSize = estimateTemporalWorldGroundSize(this.engine.graph);

    // One shared environment baseline: canonical lighting, shadows, fog, real ground and tier-aware
    // atmosphere. No hand-rolled second lighting system.
    this.environment = createSceneEnvironment(THREE, scene, {
      mode: 'OUTDOOR',
      hourOfDay: /NIGHT/i.test(this.weather ?? '') ? 21 : 14,
      fogDensity: profile.fogDensity,
      groundSize,
      tier: 'cinematic',
      ambientHaze: true,
    });

    this.weatherRig = createHighFidelityWeatherRig(THREE, scene, this.weather);
    this.visualResolver = createTemporalCinematicVisualResolver(THREE, this.engine.graph, {
      weather: this.weather,
      detailedHumanCount: 24,
      governedHeroHuman: true,
    });

    this.renderer = new WorldFrameRenderer(THREE, scene, {
      resolveVisual: this.visualResolver.resolveVisual,
      updateVisual: this.visualResolver.updateVisual,
      sharedMaterials: this.visualResolver.sharedMaterials,
    });
    this.renderer.sync(this.graphicsFrame);

    const first = this.cameraPath.keyframes[0];
    if (first) this.applyKeyframe(camera, first);
  }

  setupPostProcessing(
    modules: PostProcessingModules,
    renderer: THREE_NS.WebGLRenderer,
    scene: THREE_NS.Scene,
    camera: THREE_NS.PerspectiveCamera,
    w: number,
    h: number,
  ): PostProcessor {
    // `setupGraphicsPipeline` is the canonical shared pipeline: ACES, IBL/HDRI upgrade, GTAO,
    // bloom and SMAA. `cinematic` is deliberate for this route/capture pathway.
    if (!this.THREE) throw new Error('TemporalCinematicSim3D.setupPostProcessing called before init');
    return setupGraphicsPipeline(
      this.THREE,
      modules,
      renderer,
      {
        scene,
        camera,
        width: w,
        height: h,
        qualityTier: 'cinematic',
        toneMappingExposure: 1.08,
        bloom: { strength: 0.26, radius: 0.5, threshold: 0.91 },
        ambientOcclusion: { enabled: true, minTier: 'high', radius: 0.5, blendIntensity: 0.86 },
        reflections: /RAIN|STORM/i.test(this.weather ?? '')
          ? { enabled: true, minTier: 'cinematic', strength: 0.42, maxDistance: 10 }
          : { enabled: false },
        antiAliasing: { enabled: true, minTier: 'medium' },
      },
    );
  }

  seekTo(seconds: number): void {
    this.currentTimeSeconds = Math.max(0, Math.min(this.cameraPath.durationSeconds, seconds));
  }

  getCurrentTimeSeconds(): number {
    return this.currentTimeSeconds;
  }

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

  update(dt: number, _params: SimParams): void {
    this.environment?.update(dt);
    this.weatherRig?.update(dt, this.camera ?? undefined);
  }

  syncScene(_scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera): void {
    this.renderer?.sync(this.graphicsFrame);
    this.applyKeyframe(camera, this.nearestKeyframe());
  }

  dispose(): void {
    // Renderer first: it tears down entity-owned materials/geometries while explicitly excluding
    // the resolver's shared palette. Resolver disposes that palette exactly once afterward.
    this.renderer?.dispose();
    this.renderer = null;
    this.weatherRig?.dispose();
    this.weatherRig = null;
    this.environment?.dispose();
    this.environment = null;
    this.visualResolver?.dispose();
    this.visualResolver = null;
    this.camera = null;
    this.THREE = null;
  }
}
