import type { EntityRef, GenesisEvent } from '../events/genesisEvent';
import type { Observation, ScientificProperty, WorldEntity, WorldState } from './scientificWorldState';

/** Experience-side contract version. This layer presents science; it does not compute it. */
export const WORLD_EXPERIENCE_VERSION = '0.1.0';

export type WorldRuntimePhase = 'CREATED' | 'LOADING' | 'READY' | 'RUNNING' | 'PAUSED' | 'RESET' | 'REPLAYING' | 'DISPOSED';

export interface WorldPosition {
  x: number;
  y: number;
  z: number;
}

export interface WorldTransform {
  /** Null means the ScientificWorldState has no spatial position for this entity. */
  position: WorldPosition | null;
  rotation: WorldPosition;
  scale: WorldPosition;
}

export interface WorldInteractionState {
  selectable: boolean;
  inspectable: boolean;
  interactable: boolean;
}

/** A renderable presentation object. It has no scientific authority. */
export interface WorldEntityView {
  viewId: string;
  scientificRef: EntityRef;
  label: string;
  transform: WorldTransform;
  visible: boolean;
  visualState: Readonly<Record<string, number | string | boolean>>;
  interaction: WorldInteractionState;
  syncRevision: number;
}

export interface WorldEntityAdapter {
  canAdapt(entity: WorldEntity): boolean;
  createView(entity: WorldEntity): WorldEntityView;
  syncView(view: WorldEntityView, entity: WorldEntity, state: WorldState): WorldEntityView;
  disposeView(view: WorldEntityView): void;
}

export interface WorldSceneSyncResult {
  stateFingerprint: string;
  revision: number;
  syncedEntityIds: readonly string[];
  unsupportedEntityIds: readonly string[];
}

export interface WorldScene {
  readonly worldId: string | null;
  readonly revision: number;
  load(worldId: string): void;
  sync(state: WorldState): WorldSceneSyncResult;
  getEntityView(ref: EntityRef): WorldEntityView | null;
  getEntityViews(): readonly WorldEntityView[];
  reset(): void;
  dispose(): void;
}

export interface WorldSnapshot {
  worldId: string;
  domainId: string;
  tick: number;
  stateFingerprint: string;
  phase: WorldRuntimePhase;
  revision: number;
  state: WorldState;
}

export interface WorldEventBridge {
  publish(event: GenesisEvent): void;
  subscribe(listener: (event: GenesisEvent) => void): () => void;
  clear(): void;
}

export interface PresentedObservation {
  observation: Observation;
  entityRef: EntityRef | null;
  worldPosition: WorldPosition | null;
  eventId: string | null;
  cameraContext: string | null;
  importance: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  presentation: Readonly<Record<string, string | number | boolean>>;
}

/** Public name used by the experience boundary; the data remains the existing scientific Observation. */
export type WorldObservation = PresentedObservation;

export type WorldInteractionKind = 'LOOK_AT' | 'INSPECT' | 'SELECT' | 'APPROACH' | 'OPEN' | 'CLOSE' | 'ACTIVATE' | 'MEASURE' | 'OBSERVE';

export interface WorldInteractionRequest {
  requestId: string;
  kind: WorldInteractionKind;
  target: EntityRef;
  tick: number;
  source: 'USER' | 'CAMERA' | 'SYSTEM';
  payload?: Readonly<Record<string, string | number | boolean>>;
}

export interface WorldInteractionResult {
  requestId: string;
  status: 'ACCEPTED' | 'REJECTED' | 'NOT_AVAILABLE';
  reason: string;
  scientificStateChanged: false;
}

/** Scientific code may later validate these intents. Renderer never mutates WorldState directly. */
export interface WorldInteractionHandler {
  handle(request: WorldInteractionRequest): WorldInteractionResult;
}

/** Safe default until Claude's scientific layer validates a requested operation. */
export class ReadOnlyWorldInteractionHandler implements WorldInteractionHandler {
  handle(request: WorldInteractionRequest): WorldInteractionResult {
    return {
      requestId: request.requestId,
      status: 'NOT_AVAILABLE',
      reason: `No scientific capability is registered for ${request.kind} on ${entityKey(request.target)}.`,
      scientificStateChanged: false,
    };
  }
}

export interface ScienceDirectorRequest {
  event: GenesisEvent;
  observations: readonly PresentedObservation[];
  currentCameraId: string;
}

export interface ScienceDirectorDecision {
  cameraId: string;
  target: EntityRef | null;
  shotDurationTicks: number | null;
  reason: string;
}

/** Extension point only; an autonomous director is deliberately not implemented here. */
export interface ScienceDirector {
  decide(request: ScienceDirectorRequest): ScienceDirectorDecision | null;
}

function entityKey(ref: EntityRef): string {
  return `${ref.kind}:${ref.id}`;
}

function numberProperty(properties: readonly ScientificProperty[], key: string): number | null {
  const value = properties.find((property) => property.key === key)?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function visualProperties(properties: readonly ScientificProperty[]): Readonly<Record<string, number | string | boolean>> {
  return Object.fromEntries(properties.map((property) => [property.key, property.value]));
}

/**
 * Honest default adapter: it mirrors properties already present in WorldState.
 * It does not place an entity, invent geometry, or create a scientific value.
 */
export class PropertyWorldEntityAdapter implements WorldEntityAdapter {
  canAdapt(_entity: WorldEntity): boolean {
    return true;
  }

  createView(entity: WorldEntity): WorldEntityView {
    return {
      viewId: entityKey(entity.ref),
      scientificRef: entity.ref,
      label: entity.label,
      transform: {
        position: this.positionFor(entity),
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
      },
      visible: true,
      visualState: visualProperties(entity.properties),
      interaction: { selectable: true, inspectable: true, interactable: false },
      syncRevision: 0,
    };
  }

  syncView(view: WorldEntityView, entity: WorldEntity, _state: WorldState): WorldEntityView {
    return {
      ...view,
      label: entity.label,
      transform: { ...view.transform, position: this.positionFor(entity) },
      visualState: visualProperties(entity.properties),
      syncRevision: view.syncRevision + 1,
    };
  }

  disposeView(_view: WorldEntityView): void {
    // Renderer-owned resources are disposed by the concrete renderer adapter.
  }

  private positionFor(entity: WorldEntity): WorldPosition | null {
    const x = numberProperty(entity.properties, 'x');
    const y = numberProperty(entity.properties, 'y');
    const z = numberProperty(entity.properties, 'z');
    return x === null || y === null || z === null ? null : { x, y, z };
  }
}

/** Renderer-independent scene lifecycle and deterministic entity identity mapping. */
export class GenericWorldScene implements WorldScene {
  readonly adapters: readonly WorldEntityAdapter[];
  private currentWorldId: string | null = null;
  private currentRevision = 0;
  private views = new Map<string, WorldEntityView>();
  private lastState: WorldState | null = null;
  private disposed = false;

  constructor(adapters: readonly WorldEntityAdapter[] = [new PropertyWorldEntityAdapter()]) {
    this.adapters = adapters;
  }

  get worldId(): string | null {
    return this.currentWorldId;
  }

  get revision(): number {
    return this.currentRevision;
  }

  load(worldId: string): void {
    if (this.disposed) throw new Error('WorldScene is disposed');
    if (!worldId.trim()) throw new Error('WorldScene requires a non-empty worldId');
    this.currentWorldId = worldId;
    this.currentRevision = 0;
    this.views.clear();
    this.lastState = null;
  }

  sync(state: WorldState): WorldSceneSyncResult {
    if (this.disposed) throw new Error('WorldScene is disposed');
    if (this.currentWorldId === null) this.load(state.worldId);
    if (this.currentWorldId !== state.worldId) throw new Error(`WorldScene cannot sync ${state.worldId} into ${this.currentWorldId}`);

    const nextKeys = new Set<string>();
    const syncedEntityIds: string[] = [];
    const unsupportedEntityIds: string[] = [];
    const nextViews = new Map<string, WorldEntityView>();

    for (const entity of state.entities) {
      const key = entityKey(entity.ref);
      nextKeys.add(key);
      const adapter = this.adapters.find((candidate) => candidate.canAdapt(entity));
      if (!adapter) {
        unsupportedEntityIds.push(key);
        continue;
      }
      const previous = this.views.get(key);
      const view = previous === undefined ? adapter.createView(entity) : adapter.syncView(previous, entity, state);
      nextViews.set(key, view);
      syncedEntityIds.push(key);
    }

    for (const [key, view] of this.views) {
      if (!nextKeys.has(key)) {
        const adapter = this.adapters.find((candidate) => candidate.canAdapt({ ref: view.scientificRef, label: view.label, properties: [] }));
        adapter?.disposeView(view);
      }
    }

    this.views = nextViews;
    this.lastState = state;
    this.currentRevision += 1;
    return { stateFingerprint: state.fingerprint, revision: this.currentRevision, syncedEntityIds, unsupportedEntityIds };
  }

  getEntityView(ref: EntityRef): WorldEntityView | null {
    return this.views.get(entityKey(ref)) ?? null;
  }

  getEntityViews(): readonly WorldEntityView[] {
    return [...this.views.values()];
  }

  reset(): void {
    if (this.disposed) throw new Error('WorldScene is disposed');
    for (const view of this.views.values()) {
      const adapter = this.adapters.find((candidate) => candidate.canAdapt({ ref: view.scientificRef, label: view.label, properties: [] }));
      adapter?.disposeView(view);
    }
    this.views.clear();
    this.lastState = null;
    this.currentRevision = 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.reset();
    this.currentWorldId = null;
    this.disposed = true;
  }

  get state(): WorldState | null {
    return this.lastState;
  }
}

export class InMemoryWorldEventBridge implements WorldEventBridge {
  private listeners = new Set<(event: GenesisEvent) => void>();

  publish(event: GenesisEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  subscribe(listener: (event: GenesisEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  clear(): void {
    this.listeners.clear();
  }
}

export interface WorldRuntime {
  readonly phase: WorldRuntimePhase;
  readonly scene: WorldScene;
  load(worldId: string): void;
  sync(state: WorldState): WorldSceneSyncResult;
  run(): void;
  pause(): void;
  resume(): void;
  reset(): void;
  replay(states: readonly WorldState[]): readonly WorldSceneSyncResult[];
  snapshot(): WorldSnapshot | null;
  dispose(): void;
}

/**
 * Reusable runtime lifecycle. It consumes WorldState snapshots and forwards
 * existing scientific events; it never advances a scientific clock or creates
 * an observation/event/result of its own.
 */
export class GenericWorldRuntime implements WorldRuntime {
  private currentPhase: WorldRuntimePhase = 'CREATED';
  private lastState: WorldState | null = null;
  private seenEventIds = new Set<string>();

  constructor(
    readonly scene: WorldScene = new GenericWorldScene(),
    readonly events: WorldEventBridge = new InMemoryWorldEventBridge(),
  ) {}

  get phase(): WorldRuntimePhase {
    return this.currentPhase;
  }

  load(worldId: string): void {
    this.assertUsable();
    this.currentPhase = 'LOADING';
    this.scene.load(worldId);
    this.currentPhase = 'READY';
  }

  sync(state: WorldState): WorldSceneSyncResult {
    this.assertUsable();
    if (this.scene.worldId === null) this.load(state.worldId);
    const result = this.scene.sync(state);
    this.lastState = state;
    for (const event of state.events) {
      if (!this.seenEventIds.has(event.id)) {
        this.events.publish(event);
        this.seenEventIds.add(event.id);
      }
    }
    if (this.currentPhase === 'CREATED' || this.currentPhase === 'READY' || this.currentPhase === 'RESET') this.currentPhase = 'PAUSED';
    return result;
  }

  run(): void {
    this.assertUsable();
    if (this.lastState === null) throw new Error('WorldRuntime cannot run before the first WorldState sync');
    this.currentPhase = 'RUNNING';
  }

  pause(): void {
    this.assertUsable();
    this.currentPhase = 'PAUSED';
  }

  resume(): void {
    this.assertUsable();
    if (this.lastState === null) throw new Error('WorldRuntime cannot resume before the first WorldState sync');
    this.currentPhase = 'RUNNING';
  }

  reset(): void {
    this.assertUsable();
    this.scene.reset();
    this.lastState = null;
    this.seenEventIds.clear();
    this.currentPhase = 'RESET';
  }

  replay(states: readonly WorldState[]): readonly WorldSceneSyncResult[] {
    this.assertUsable();
    this.reset();
    this.currentPhase = 'REPLAYING';
    const results = states.map((state) => this.sync(state));
    this.currentPhase = 'PAUSED';
    return results;
  }

  snapshot(): WorldSnapshot | null {
    if (this.lastState === null) return null;
    return {
      worldId: this.lastState.worldId,
      domainId: this.lastState.domainId,
      tick: this.lastState.tick,
      stateFingerprint: this.lastState.fingerprint,
      phase: this.currentPhase,
      revision: this.scene.revision,
      state: this.lastState,
    };
  }

  dispose(): void {
    if (this.currentPhase === 'DISPOSED') return;
    this.scene.dispose();
    this.events.clear();
    this.lastState = null;
    this.currentPhase = 'DISPOSED';
  }

  private assertUsable(): void {
    if (this.currentPhase === 'DISPOSED') throw new Error('WorldRuntime is disposed');
  }
}
