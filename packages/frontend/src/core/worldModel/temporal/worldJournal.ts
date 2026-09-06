import type { GenesisEvent } from '../../events/genesisEvent';
import type { Observation } from '../../world/scientificWorldState';

/**
 * WORLD JOURNAL — the append-only evidence/provenance log a branch carries
 * alongside its `WorldGraph`. Real solver executions append `Observation`s
 * (core/world/scientificWorldState.ts) and `GenesisEvent`s
 * (core/events/genesisEvent.ts) here; nothing here computes science, it
 * only records what a solver already produced.
 *
 * A branch never rewrites journal entries — forking takes an honest slice
 * (`cloneUpToTick`), so a forked branch shares its parent's recorded
 * evidence up to the fork point and diverges only by appending its own
 * entries after that.
 */
export class WorldJournal {
  private readonly observations: Observation[] = [];
  private readonly events: GenesisEvent[] = [];

  recordObservation(observation: Observation): void {
    this.observations.push(observation);
  }

  recordEvent(event: GenesisEvent): void {
    this.events.push(event);
  }

  allObservations(): readonly Observation[] {
    return this.observations;
  }

  allEvents(): readonly GenesisEvent[] {
    return this.events;
  }

  /** Everything recorded at or before `tick` — what a branch scrubbed to that tick is honestly allowed to know. */
  upToTick(tick: number): { observations: readonly Observation[]; events: readonly GenesisEvent[] } {
    return {
      observations: this.observations.filter((o) => o.tick <= tick),
      events: this.events.filter((e) => e.timestamp <= tick),
    };
  }

  /** Independent copy containing only entries at or before `tick` — the basis for a forked branch's journal. */
  cloneUpToTick(tick: number): WorldJournal {
    const clone = new WorldJournal();
    for (const observation of this.observations) if (observation.tick <= tick) clone.recordObservation(observation);
    for (const event of this.events) if (event.timestamp <= tick) clone.recordEvent(event);
    return clone;
  }
}
