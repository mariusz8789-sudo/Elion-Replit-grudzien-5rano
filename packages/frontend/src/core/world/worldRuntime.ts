import type { WorldEntity, WorldState } from './scientificWorldState';

export type WorldRuntimeStatus = 'CREATED' | 'READY' | 'RUNNING' | 'PAUSED' | 'DISPOSED';

export interface WorldSnapshot {
  readonly worldId: string;
  readonly domainId: string;
  readonly tick: number;
  readonly fingerprint: string;
  readonly entities: readonly WorldEntity[];
  readonly observations: WorldState['observations'];
  readonly events: WorldState['events'];
  readonly experiment: WorldState['experiment'];
  readonly replay: WorldState['replay'];
}

export interface WorldEntityView {
  readonly id: string;
  readonly entity: WorldEntity;
}

export interface WorldScene {
  createEntity(entity: WorldEntity): void;
  updateEntity(entity: WorldEntity): void;
  removeEntity(entityId: string): void;
  reset(): void;
  dispose(): void;
}

export interface WorldRuntimeListener { (snapshot: WorldSnapshot): void; }

function entityId(entity: WorldEntity): string { return `${entity.ref.kind}:${entity.ref.id}`; }

function snapshotOf(state: WorldState): WorldSnapshot {
  return {
    worldId: state.worldId,
    domainId: state.domainId,
    tick: state.tick,
    fingerprint: state.fingerprint,
    entities: state.entities,
    observations: state.observations,
    events: state.events,
    experiment: state.experiment,
    replay: state.replay,
  };
}

/** Presentation boundary: it never computes or mutates scientific truth. */
export class ScientificWorldRuntime {
  private status: WorldRuntimeStatus = 'CREATED';
  private current: WorldSnapshot | null = null;
  private readonly entities = new Map<string, WorldEntity>();
  private listener: WorldRuntimeListener | null = null;

  constructor(private readonly scene: WorldScene) {}
  get lifecycle(): WorldRuntimeStatus { return this.status; }
  get snapshot(): WorldSnapshot | null { return this.current; }
  onSnapshot(listener: WorldRuntimeListener | null): void { this.listener = listener; }

  load(state: WorldState): WorldSnapshot {
    this.assertUsable();
    this.scene.reset();
    this.entities.clear();
    const snapshot = snapshotOf(state);
    for (const entity of snapshot.entities) {
      const id = entityId(entity);
      this.entities.set(id, entity);
      this.scene.createEntity(entity);
    }
    this.current = snapshot;
    this.status = 'READY';
    this.listener?.(snapshot);
    return snapshot;
  }

  sync(state: WorldState): WorldSnapshot {
    this.assertUsable();
    const next = snapshotOf(state);
    const nextIds = new Set(next.entities.map(entityId));
    for (const id of this.entities.keys()) {
      if (!nextIds.has(id)) {
        this.scene.removeEntity(id);
        this.entities.delete(id);
      }
    }
    for (const entity of next.entities) {
      const id = entityId(entity);
      const previous = this.entities.get(id);
      if (!previous) this.scene.createEntity(entity);
      else if (previous !== entity || this.current?.fingerprint !== next.fingerprint) this.scene.updateEntity(entity);
      this.entities.set(id, entity);
    }
    this.current = next;
    this.listener?.(next);
    return next;
  }

  start(): void { this.assertUsable(); this.status = 'RUNNING'; }
  pause(): void { this.assertUsable(); if (this.status === 'RUNNING') this.status = 'PAUSED'; }
  resume(): void { this.assertUsable(); if (this.status === 'PAUSED') this.status = 'RUNNING'; }

  reset(): void {
    this.assertUsable();
    this.scene.reset();
    this.entities.clear();
    this.current = null;
    this.status = 'CREATED';
  }

  replay(states: readonly WorldState[]): readonly WorldSnapshot[] {
    this.assertUsable();
    return states.map((state, index) => index === 0 ? this.load(state) : this.sync(state));
  }

  dispose(): void {
    if (this.status === 'DISPOSED') return;
    this.scene.dispose();
    this.entities.clear();
    this.current = null;
    this.listener = null;
    this.status = 'DISPOSED';
  }

  entitiesView(): readonly WorldEntityView[] {
    return [...this.entities.entries()].map(([id, entity]) => ({ id, entity }));
  }

  private assertUsable(): void {
    if (this.status === 'DISPOSED') throw new Error('WorldRuntime is disposed');
  }
}

export function worldEntityId(entity: WorldEntity): string { return entityId(entity); }
export { snapshotOf as createWorldSnapshot };
