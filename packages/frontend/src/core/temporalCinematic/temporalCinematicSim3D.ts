import type * as THREE_NS from 'three';
import type { PostProcessingModules, PostProcessor, Sim3D } from '../three/types';
import type { SimParams } from '../types';
import { WorldFrameRenderer } from '../three/graphics/worldFrameRenderer';
import { createSceneEnvironment, type SceneEnvironmentHandle } from '../three/graphics/sceneEnvironment';
import { setupGraphicsPipeline, type GraphicsPipeline } from '../three/graphics/postProcessing';
import { createHighFidelityWeatherRig, weatherProfile, type WeatherRig } from '../three/graphics/highFidelityWeather';
import { createLivingWorldDecorator, type LivingWorldDecoratorHandle } from './livingWorldDecorator';
import { findScientificInteriorTarget, type ScientificInteriorTarget } from './scientificInteriorVisuals';
import { applyCinematicDrift, resolveCinematicShot, type CinematicViewMode } from './cinematicShotDirector';
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

export interface TemporalCinematicPresentationOptions {
  readonly weather?: string;
  readonly year?: number;
  readonly viewMode?: CinematicViewMode;
}

/**
 * V5.2 -> V6.1 canonical cinematic scene. One WorldGraph, one WorldFrameRenderer, one useThreeLoop.
 * Living-city ambience, generated-room presentation and shot grading remain presentation layers only.
 */
export class TemporalCinematicSim3D implements Sim3D {
  readonly disableOrbitControls = true;
  readonly preserveDrawingBufferForCapture = true;

  private renderer: WorldFrameRenderer | null = null;
  private visualResolver: TemporalCinematicVisualResolverHandle | null = null;
  private environment: SceneEnvironmentHandle | null = null;
  private weatherRig: WeatherRig | null = null;
  private livingWorld: LivingWorldDecoratorHandle | null = null;
  private pipeline: GraphicsPipeline | null = null;
  private THREE: typeof THREE_NS | null = null;
  private camera: THREE_NS.PerspectiveCamera | null = null;
  private currentTimeSeconds = 0;
  private readonly graphicsFrame: GraphicsWorldFrame;
  private readonly presentation: TemporalCinematicPresentationOptions;
  private readonly interiorTarget: ScientificInteriorTarget | null;

  constructor(
    private readonly engine: TemporalEngine,
    private readonly cameraPath: CameraPath,
    presentation?: string | TemporalCinematicPresentationOptions,
  ) {
    this.presentation = typeof presentation === 'string' ? { weather: presentation } : (presentation ?? {});
    this.interiorTarget = this.presentation.viewMode === 'interior' ? findScientificInteriorTarget(engine.graph) : null;
    this.graphicsFrame = normalizeTemporalCinematicFrameHierarchy(toGraphicsWorldFrame(getFrameState(engine)), engine.graph);
  }

  getPresentationSummary(): { readonly viewMode: CinematicViewMode; readonly interiorRoomId: string | null; readonly interiorAssetSlotCount: number; readonly livingWorld: boolean } {
    return {
      viewMode: this.presentation.viewMode ?? 'street',
      interiorRoomId: this.interiorTarget?.roomId ?? null,
      interiorAssetSlotCount: this.interiorTarget?.assetSlotIds.length ?? 0,
      livingWorld: this.presentation.viewMode !== 'interior',
    };
  }

  init(THREE: typeof THREE_NS, scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera, _w: number, _h: number): void {
    this.THREE = THREE;
    this.camera = camera;
    const weather = this.presentation.weather;
    const profile = weatherProfile(weather);
    const viewMode = this.presentation.viewMode ?? 'street';

    this.environment = createSceneEnvironment(THREE, scene, viewMode === 'interior'
      ? { mode: 'INDOOR', groundSize: 0, tier: 'cinematic', ambientHaze: false, fillIntensity: 0.62, sunIntensity: 1.2 }
      : {
        mode: 'OUTDOOR',
        hourOfDay: /NIGHT/i.test(weather ?? '') ? 21 : 14,
        fogDensity: profile.fogDensity,
        groundSize: estimateTemporalWorldGroundSize(this.engine.graph),
        tier: 'cinematic',
        ambientHaze: true,
      });

    this.weatherRig = viewMode === 'street' ? createHighFidelityWeatherRig(THREE, scene, weather) : null;
    this.visualResolver = createTemporalCinematicVisualResolver(THREE, this.engine.graph, {
      weather,
      detailedHumanCount: 24,
      governedHeroHuman: true,
      interiorTargetRoomId: this.interiorTarget?.roomId ?? null,
    });

    if (viewMode === 'street') {
      this.livingWorld = createLivingWorldDecorator(THREE, scene, this.engine.graph, this.visualResolver.palette, {
        year: this.presentation.year,
      });
    }

    this.renderer = new WorldFrameRenderer(THREE, scene, {
      resolveVisual: this.visualResolver.resolveVisual,
      updateVisual: this.visualResolver.updateVisual,
      sharedMaterials: this.visualResolver.sharedMaterials,
    });
    this.renderer.sync(this.graphicsFrame);
    this.applyCamera(camera);
  }

  setupPostProcessing(
    modules: PostProcessingModules,
    renderer: THREE_NS.WebGLRenderer,
    scene: THREE_NS.Scene,
    camera: THREE_NS.PerspectiveCamera,
    w: number,
    h: number,
  ): PostProcessor {
    if (!this.THREE) throw new Error('TemporalCinematicSim3D.setupPostProcessing called before init');
    const wet = /RAIN|STORM/i.test(this.presentation.weather ?? '');
    this.pipeline = setupGraphicsPipeline(this.THREE, modules, renderer, {
      scene,
      camera,
      width: w,
      height: h,
      qualityTier: 'cinematic',
      toneMappingExposure: this.presentation.viewMode === 'interior' ? 1.0 : 1.08,
      bloom: { strength: this.presentation.viewMode === 'interior' ? 0.32 : 0.26, radius: 0.5, threshold: 0.9 },
      ambientOcclusion: { enabled: true, minTier: 'high', radius: 0.5, blendIntensity: 0.86 },
      reflections: wet ? { enabled: true, minTier: 'cinematic', strength: 0.42, maxDistance: 10 } : { enabled: false },
      antiAliasing: { enabled: true, minTier: 'medium' },
      depthOfField: { enabled: true, minTier: 'high', focusDistance: 7.5, aperture: 0.00016, maxBlur: 0.004 },
    });
    return this.pipeline;
  }

  seekTo(seconds: number): void {
    this.currentTimeSeconds = Math.max(0, Math.min(this.cameraPath.durationSeconds, seconds));
  }
  getCurrentTimeSeconds(): number { return this.currentTimeSeconds; }
  debugEntitySummary(): readonly { id: string; position: readonly [number, number, number]; scale: number }[] {
    return this.graphicsFrame.entities.map((e) => ({ id: e.id, position: e.position, scale: e.scale ?? 1 }));
  }

  private nearestKeyframe(): CameraKeyframe {
    const frames = this.cameraPath.keyframes;
    let best = frames[0]!;
    let bestDelta = Infinity;
    for (const frame of frames) {
      const delta = Math.abs(frame.t - this.currentTimeSeconds);
      if (delta < bestDelta) { bestDelta = delta; best = frame; }
    }
    return best;
  }

  private applyCamera(camera: THREE_NS.PerspectiveCamera): void {
    const viewMode = this.presentation.viewMode ?? 'street';
    const shot = resolveCinematicShot(this.currentTimeSeconds, this.cameraPath.durationSeconds, viewMode);
    if (viewMode === 'interior' && this.interiorTarget) {
      const target = this.interiorTarget;
      const u = this.cameraPath.durationSeconds > 0 ? this.currentTimeSeconds / this.cameraPath.durationSeconds : 0;
      const angle = -0.55 + u * 1.1;
      const radius = Math.max(2.1, Math.min(4.6, Math.max(target.widthM, target.depthM) * 0.42));
      camera.position.set(
        target.center[0] + Math.sin(angle) * radius,
        target.center[1] + 0.35 + Math.sin(this.currentTimeSeconds * 0.4) * 0.03,
        target.center[2] + Math.cos(angle) * radius,
      );
      camera.lookAt(target.center[0], target.center[1] - 0.15, target.center[2]);
    } else {
      const frame = applyCinematicDrift(this.nearestKeyframe(), this.currentTimeSeconds, shot);
      camera.position.set(frame.position.x, frame.position.y, frame.position.z);
      camera.lookAt(frame.lookAt.x, frame.lookAt.y, frame.lookAt.z);
    }
    if (Math.abs(camera.fov - shot.fov) > 0.01) { camera.fov = shot.fov; camera.updateProjectionMatrix(); }
    this.pipeline?.setDepthOfFieldEnabled(shot.dofEnabled);
    this.pipeline?.setFocusDistance(shot.focusDistance);
  }

  update(dt: number, _params: SimParams): void {
    this.environment?.update(dt);
    this.weatherRig?.update(dt, this.camera ?? undefined);
    this.livingWorld?.update(dt);
  }

  syncScene(_scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera): void {
    this.renderer?.sync(this.graphicsFrame);
    this.applyCamera(camera);
  }

  dispose(): void {
    this.renderer?.dispose(); this.renderer = null;
    this.livingWorld?.dispose(); this.livingWorld = null;
    this.weatherRig?.dispose(); this.weatherRig = null;
    this.environment?.dispose(); this.environment = null;
    this.visualResolver?.dispose(); this.visualResolver = null;
    this.pipeline = null;
    this.camera = null;
    this.THREE = null;
  }
}
