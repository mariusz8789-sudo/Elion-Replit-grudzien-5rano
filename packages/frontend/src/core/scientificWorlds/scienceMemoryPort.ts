import { isSavedCuriosityCycle, listCuriosityCycles, saveCuriosityCycleToMemory, type SavedCuriosityCycle } from '../scienceMemory';

/**
 * SCIENCE MEMORY ↔ COGNITIVE CORE (D-130). The delivered cognitive core's
 * `ScienceMemoryAdapter` is `{ write(record: unknown); read(topic, limit) }`.
 * D-127 left it unbound because Science Memory's savers are typed per
 * artefact and a generic write had no honest target. The curiosity cycle
 * now IS a typed artefact (`SavedCuriosityCycle`), so the port binds to
 * that saver and refuses anything else — a memory that only stores what it
 * can replay. Reads return the stored cycles (inputs, ids, hashes), never
 * results as facts.
 */
export interface ScienceMemoryPort { write(record: unknown): Promise<void>; read(topic: string, limit: number): Promise<unknown[]>; }

export function scienceMemoryPort(): ScienceMemoryPort {
  return {
    async write(record) {
      if (!isSavedCuriosityCycle(record)) throw new Error('SCIENCE_MEMORY_REJECTS_UNTYPED_RECORD: only SavedCuriosityCycle records are accepted through this port');
      saveCuriosityCycleToMemory(record);
    },
    async read(topic, limit) { return [...listCuriosityCycles(topic, limit)]; },
  };
}

/** A memory port over an in-process array (tests, headless runs without localStorage); same contract, same guard. */
export function inMemoryScienceMemoryPort(): ScienceMemoryPort & { readonly records: readonly SavedCuriosityCycle[] } {
  const records: SavedCuriosityCycle[] = [];
  return {
    records,
    async write(record) { if (!isSavedCuriosityCycle(record)) throw new Error('SCIENCE_MEMORY_REJECTS_UNTYPED_RECORD'); records.unshift(record); },
    async read(topic, limit) { const t = topic.trim().toLowerCase(); return records.filter((c) => !t || c.questionText.toLowerCase().includes(t) || c.subjectKeys.some((k) => k.toLowerCase().includes(t)) || c.questionId === topic || c.worldId.toLowerCase().includes(t)).slice(0, limit); },
  };
}
