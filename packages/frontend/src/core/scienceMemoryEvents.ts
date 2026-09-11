/**
 * SCIENCE MEMORY EVENTS — lets any screen react live when Science Memory
 * changes (a save or delete from ANY source: this screen, Science Chat, a
 * background investigation), instead of only ever reading `listExperiments()`
 * once on mount. Same pub/sub shape `scienceChatBridge.ts` already uses for
 * cross-component signalling. Holds no data of its own and is never a cache:
 * every subscriber re-reads the real store (`listExperiments()`) itself in
 * response — this is only the "something changed, go re-read" signal.
 *
 * `notifyScienceMemoryChanged` is called from exactly one place —
 * `scienceMemory.ts`'s own `saveExperiment`/`deleteExperiment`, right after
 * the real mutation lands — never speculatively, and never from a screen or
 * any other module. `scienceMemoryEvents.test.ts` enforces this by
 * scanning the whole source tree for any other caller.
 */

export type ScienceMemoryChangeReason = 'SAVED' | 'DELETED';

export interface ScienceMemoryChangeEvent {
  /** Which kind of real mutation just landed. */
  readonly reason: ScienceMemoryChangeReason;
  /** The `SavedExperiment.id` that was saved or deleted. */
  readonly experimentId: string;
}

type Listener = (event: ScienceMemoryChangeEvent) => void;
const listeners = new Set<Listener>();

/** Called by any screen that wants to react when Science Memory changes. Returns an unsubscribe function. */
export function subscribeScienceMemoryChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Called ONLY by `scienceMemory.ts`, right after `saveExperiment`/
 * `deleteExperiment` really writes — see this module's own doc and
 * `scienceMemoryEvents.test.ts`.
 */
export function notifyScienceMemoryChanged(event: ScienceMemoryChangeEvent): void {
  // Snapshot before iterating: a listener that unsubscribes itself (or another
  // listener) while handling this event must never cause the live `Set` to
  // skip whoever comes after it mid-iteration.
  for (const listener of [...listeners]) listener(event);
}
