import type * as THREE_NS from 'three';
import type { PostProcessingModules, PostProcessor, Sim3D } from '../three/types';
import type { SimParams } from '../types';
import { WorldFrameRenderer } from '../three/graphics/worldFrameRenderer';
import { InteractionController, applyHighlight, clearHighlight } from '../three/graphics/interaction';
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
import type { RoomType } from '../worldModel/ecs/geometry';
import { sampleCameraPath, type CameraPath } from './cameraPath';
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
  readonly roomType?: RoomType;
  readonly navigationMode?: 'WALK' | 'OBSERVER' | 'CINEMATIC';
  readonly autoPlay?: boolean;
  /** Receives only canonical generated ASSET_SLOT selections from the shared pointer pipeline. */
  readonly onAssetSelection?: (selection: { readonly entityId: string; readonly slotType: string } | null) => void;
}

/**
 * V5.2 -> V6.1 canonical cinematic scene. One WorldGraph, one WorldFrameRenderer, one useThreeLoop.
 * Living-city ambience, generated-room presentation and shot grading remain presentation layers only.
 */
export class TemporalCinematicSim3D implements Sim3D {
  readonly disableOrbitControls: boolean;
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
  private readonly renderedSlotIds = new Set<string>();
  private interaction: InteractionController | null = null;
  private selectedAssetSlotId: string | null = null;
  private selectedAssetObject: THREE_NS.Object3D | null = null;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private continuityEpoch = 0;
  private lastDiscontinuity: { readonly fromSeconds: number; readonly toSeconds: number; readonly reason: 'SEEK' | 'LOOP_WRAP' } | null = null;

  constructor(
    private readonly engine: TemporalEngine,
    private readonly cameraPath: CameraPath,
    presentation?: string | TemporalCinematicPresentationOptions,
  ) {
    this.presentation = typeof presentation === 'string' ? { weather: presentation } : (presentation ?? {});
    this.disableOrbitControls = this.presentation.navigationMode !== 'OBSERVER';
    this.interiorTarget = this.presentation.viewMode === 'interior' ? findScientificInteriorTarget(engine.graph, this.presentation.roomType) : null;
    this.graphicsFrame = normalizeTemporalCinematicFrameHierarchy(toGraphicsWorldFrame(getFrameState(engine)), engine.graph);
  }

  getPresentationSummary() {
    return {
      viewMode: this.presentation.viewMode ?? 'street',
      interiorRoomId: this.interiorTarget?.roomId ?? null,
      interiorRoomType: this.interiorTarget?.roomType ?? null,
      interiorAssetSlots: (this.interiorTarget?.assetSlotIds ?? []).map((id) => {
        const geometry = this.engine.graph.tryGetEntity(id)?.geometry;
        return { id, slotType: geometry?.kind === 'ASSET_SLOT' ? geometry.slotType : null, rendered: this.renderedSlotIds.has(id) };
      }),
      interiorAssetSlotCount: this.interiorTarget?.assetSlotIds.length ?? 0,
      selectedAssetSlotId: this.selectedAssetSlotId,
      selectedAssetSlotType: this.selectedAssetSlotId
        ? (() => { const geometry = this.engine.graph.tryGetEntity(this.selectedAssetSlotId!)?.geometry; return geometry?.kind === 'ASSET_SLOT' ? geometry.slotType : null; })()
        : null,
      interactionCommand: this.selectedAssetSlotId ? { type: 'INSPECT_ENTITY' as const, entityId: this.selectedAssetSlotId } : null,
      continuityEpoch: this.continuityEpoch,
      lastDiscontinuity: this.lastDiscontinuity,
      // This pipeline has no TAA/history accumulation buffer. The guard resets camera-dependent
      // selection and DOF state without claiming a temporal-history reset that cannot exist.
      temporalAccumulation: 'NOT_PRESENT' as const,
      livingWorld: this.presentation.viewMode !== 'interior',
    };
  }

  getInteractionTargets(): readonly { readonly id: string; readonly x: number; readonly y: number; readonly slotType: string }[] {
    if (!this.THREE || !this.camera || !this.renderer || !this.interiorTarget) return [];
    const point = new this.THREE.Vector3();
    return this.interiorTarget.assetSlotIds.flatMap((id) => {
      const object = this.renderer!.getObjectForEntity(id);
      const geometry = this.engine.graph.tryGetEntity(id)?.geometry;
      if (!object || geometry?.kind !== 'ASSET_SLOT') return [];
      object.getWorldPosition(point);
      point.project(this.camera!);
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || point.z < -1 || point.z > 1) return [];
      return [{
        id,
        x: (point.x + 1) * 0.5 * this.viewportWidth,
        y: (1 - point.y) * 0.5 * this.viewportHeight,
        slotType: geometry.slotType,
      }];
    });
  }

  init(THREE: typeof THREE_NS, scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera, _w: number, _h: number): void {
    this.THREE = THREE;
    this.camera = camera;
    this.viewportWidth = Math.max(1, _w);
    this.viewportHeight = Math.max(1, _h);
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
      resolveVisual: (entity) => {
        const visual = this.visualResolver!.resolveVisual(entity);
        if (visual.kind === 'object' && this.interiorTarget?.assetSlotIds.includes(entity.id)) {
          visual.object.traverse((object) => {
            const mesh = object as THREE_NS.Mesh;
            if (!mesh.isMesh) return;
            const previous = mesh.onAfterRender;
            mesh.onAfterRender = (...args) => { previous.apply(mesh, args); this.renderedSlotIds.add(entity.id); };
          });
        }
        return visual;
      },
      updateVisual: this.visualResolver.updateVisual,
      sharedMaterials: this.visualResolver.sharedMaterials,
    });
    this.renderer.sync(this.graphicsFrame);
    if (this.interiorTarget) {
      this.interaction = new InteractionController(THREE, {
        camera,
        resolver: this.renderer,
        getTargets: () => this.interiorTarget!.assetSlotIds.flatMap((id) => {
          const object = this.renderer?.getObjectForEntity(id);
          return object ? [object] : [];
        }),
        onSelect: (id) => {
          const geometry = id ? this.engine.graph.tryGetEntity(id)?.geometry : undefined;
          const acceptedId = geometry?.kind === 'ASSET_SLOT' && this.interiorTarget?.assetSlotIds.includes(id!) ? id : null;
          if (this.selectedAssetObject) clearHighlight(this.selectedAssetObject);
          this.selectedAssetSlotId = acceptedId;
          this.selectedAssetObject = acceptedId ? this.renderer?.getObjectForEntity(acceptedId) ?? null : null;
          if (this.selectedAssetObject) applyHighlight(THREE, this.selectedAssetObject, 'select');
          this.presentation.onAssetSelection?.(acceptedId && geometry?.kind === 'ASSET_SLOT'
            ? { entityId: acceptedId, slotType: geometry.slotType }
            : null);
        },
      });
    }
    if (this.presentation.navigationMode === 'OBSERVER') {
      const frame = this.cameraPath.keyframes[Math.floor(this.cameraPath.keyframes.length / 2)] ?? this.cameraPath.keyframes[0];
      if (frame) {
        camera.position.set(frame.position.x + 16, frame.position.y + 12, frame.position.z + 16);
        camera.lookAt(frame.lookAt.x, frame.lookAt.y, frame.lookAt.z);
      }
    } else this.applyCamera(camera);
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
      toneMappingExposure: this.presentation.viewMode === 'interior' ? 0.82 : 1.08,
      bloom: { strength: this.presentation.viewMode === 'interior' ? 0.32 : 0.26, radius: 0.5, threshold: 0.9 },
      ambientOcclusion: { enabled: true, minTier: 'high', radius: 0.5, blendIntensity: 0.86 },
      reflections: wet ? { enabled: true, minTier: 'cinematic', strength: 0.42, maxDistance: 10 } : { enabled: false },
      antiAliasing: { enabled: true, minTier: 'medium' },
      depthOfField: { enabled: true, minTier: 'high', focusDistance: 7.5, aperture: 0.00016, maxBlur: 0.004 },
    });
    return this.pipeline;
  }

  seekTo(seconds: number): void {
    const next = Math.max(0, Math.min(this.cameraPath.durationSeconds, seconds));
    const threshold = Math.max(0.25, this.cameraPath.durationSeconds / 120);
    if (Math.abs(next - this.currentTimeSeconds) > threshold) this.guardDiscontinuity(this.currentTimeSeconds, next, 'SEEK');
    this.currentTimeSeconds = next;
  }
  getCurrentTimeSeconds(): number { return this.currentTimeSeconds; }
  debugEntitySummary(): readonly { id: string; position: readonly [number, number, number]; scale: number }[] {
    return this.graphicsFrame.entities.map((e) => ({ id: e.id, position: e.position, scale: e.scale ?? 1 }));
  }

  private applyCamera(camera: THREE_NS.PerspectiveCamera): void {
    const viewMode = this.presentation.viewMode ?? 'street';
    const shot = resolveCinematicShot(this.currentTimeSeconds, this.cameraPath.durationSeconds, viewMode);
    if (viewMode === 'interior' && this.interiorTarget) {
      const target = this.interiorTarget;
      const u = this.cameraPath.durationSeconds > 0 ? this.currentTimeSeconds / this.cameraPath.durationSeconds : 0;
      const angle = 0.45 + u * 0.35;
      const radius = Math.min(4.6, Math.min(target.widthM, target.depthM) * 0.42);
      const slots = target.assetSlotIds.flatMap((id) => {
        const g = this.engine.graph.tryGetEntity(id)?.geometry;
        return g?.kind === 'ASSET_SLOT' ? [g.position] : [];
      });
      const focusX = slots.length ? slots.reduce((sum, p) => sum + p.x, 0) / slots.length : target.center[0];
      const focusZ = slots.length ? slots.reduce((sum, p) => sum + p.z, 0) / slots.length : target.center[2];
      camera.position.set(
        Math.min(target.center[0] + target.widthM / 2 - 0.4, Math.max(target.center[0] - target.widthM / 2 + 0.4, focusX + Math.sin(angle) * radius)),
        target.center[1] + 0.35 + Math.sin(this.currentTimeSeconds * 0.4) * 0.03,
        Math.min(target.center[2] + target.depthM / 2 - 0.4, Math.max(target.center[2] - target.depthM / 2 + 0.4, focusZ + Math.cos(angle) * radius)),
      );
      camera.lookAt(focusX, target.center[1] - 0.15, focusZ);
    } else {
      const navigationMode = this.presentation.navigationMode ?? 'CINEMATIC';
      const base = sampleCameraPath(this.cameraPath, this.currentTimeSeconds);
      const frame = navigationMode === 'WALK' ? base : applyCinematicDrift(base, this.currentTimeSeconds, shot);
      camera.position.set(frame.position.x, frame.position.y, frame.position.z);
      camera.lookAt(frame.lookAt.x, frame.lookAt.y, frame.lookAt.z);
    }
    const fov = this.presentation.navigationMode === 'WALK' ? 64 : shot.fov;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    this.pipeline?.setDepthOfFieldEnabled(this.presentation.navigationMode === 'WALK' ? false : shot.dofEnabled);
    this.pipeline?.setFocusDistance(shot.focusDistance);
  }

  private guardDiscontinuity(fromSeconds: number, toSeconds: number, reason: 'SEEK' | 'LOOP_WRAP'): void {
    this.continuityEpoch += 1;
    this.lastDiscontinuity = { fromSeconds, toSeconds, reason };
    if (this.selectedAssetObject) clearHighlight(this.selectedAssetObject);
    this.selectedAssetObject = null;
    this.selectedAssetSlotId = null;
    this.presentation.onAssetSelection?.(null);
  }

  update(dt: number, _params: SimParams): void {
    if (this.presentation.autoPlay && this.presentation.navigationMode !== 'OBSERVER' && this.cameraPath.durationSeconds > 0) {
      const next = this.currentTimeSeconds + dt;
      if (next >= this.cameraPath.durationSeconds) this.guardDiscontinuity(this.currentTimeSeconds, next % this.cameraPath.durationSeconds, 'LOOP_WRAP');
      this.currentTimeSeconds = next % this.cameraPath.durationSeconds;
    }
    this.environment?.update(dt);
    this.weatherRig?.update(dt, this.camera ?? undefined);
    this.livingWorld?.update(dt);
  }

  onResize(w: number, h: number): void {
    this.viewportWidth = Math.max(1, w);
    this.viewportHeight = Math.max(1, h);
  }

  pointer(x: number, y: number, type: 'down' | 'move' | 'up'): void {
    if (!this.interaction) return;
    if (type === 'down') this.interaction.pointerDown(x, y);
    else if (type === 'move') this.interaction.pointerMove(x, y, this.viewportWidth, this.viewportHeight);
    else this.interaction.pointerUp(x, y, this.viewportWidth, this.viewportHeight);
  }

  syncScene(_scene: THREE_NS.Scene, camera: THREE_NS.PerspectiveCamera): void {
    this.renderer?.sync(this.graphicsFrame);
    if (this.presentation.navigationMode !== 'OBSERVER') this.applyCamera(camera);
  }

  dispose(): void {
    if (this.selectedAssetObject) clearHighlight(this.selectedAssetObject);
    this.selectedAssetObject = null;
    this.selectedAssetSlotId = null;
    this.interaction = null;
    this.renderedSlotIds.clear();
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
