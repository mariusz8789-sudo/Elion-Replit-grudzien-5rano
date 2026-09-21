import { WorldEntity, WorldRelation } from './types.js';

export class WorldModel {
  private readonly entities = new Map<string, WorldEntity>();
  private readonly relations: WorldRelation[] = [];

  replace(entities: WorldEntity[], relations: WorldRelation[]): void {
    this.entities.clear();
    for (const entity of entities) this.entities.set(entity.id, entity);
    this.relations.splice(0, this.relations.length, ...relations);
  }

  getEntity(id: string): WorldEntity | undefined { return this.entities.get(id); }
  allEntities(): WorldEntity[] { return [...this.entities.values()]; }
  allRelations(): WorldRelation[] { return [...this.relations]; }

  findByTag(tag: string): WorldEntity[] {
    return this.allEntities().filter((entity) => entity.tags.includes(tag));
  }

  summarize(): string {
    const types = new Map<string, number>();
    for (const entity of this.entities.values()) {
      types.set(entity.type, (types.get(entity.type) ?? 0) + 1);
    }
    return [...types.entries()].map(([type, count]) => `${type}:${count}`).join(", ");
  }
}
