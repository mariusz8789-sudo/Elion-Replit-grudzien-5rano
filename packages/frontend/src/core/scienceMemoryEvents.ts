/**
 * SCIENCE MEMORY CHANGE SIGNAL — one notification, no second memory.
 *
 * Science Memory is read with `listExperiments()` at mount time, which was
 * correct while every writer lived on a screen you had to navigate away from
 * to see the result. Chat entry breaks that assumption: on Home the chat IS
 * the workspace, so a loop saved in the conversation and the Next Question
 * card that should notice it are on screen at the same moment. Without a
 * signal the card kept showing "Pamięć Naukowa jest pusta" next to a chat turn
 * that had just reported a successful save — found in a real browser run, not
 * by inspection.
 *
 * This holds no records and no logic: it is the same pub/sub shape
 * `scienceChatBridge.ts` and `core/backend/session.ts` already use, kept in
 * its own module purely so `scienceMemory.ts` can notify without importing a
 * component. `scienceMemory.ts` stays the one store.
 *
 * `notifyScienceMemoryChanged` is called from exactly one place —
 * `scienceMemory.ts`'s own `saveExperiment`/`deleteExperiment`, right after
 * the real mutation lands — never speculatively, and never from a screen or
 * any other module. `scienceMemoryEvents.test.ts` enforces this by scanning
 * the whole source tree for any other caller.
 */

type Listener = () => void;
const listeners = new Set<Listener>();

/** Subscribe to writes. Returns an unsubscribe function, for use in a `useEffect`. */
export function subscribeScienceMemory(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/**
 * Called by `scienceMemory.ts` after a record is written or removed. Never
 * called from anywhere else: a change signal nobody can fire spuriously is
 * what keeps this from becoming a second source of truth about the store.
 */
export function notifyScienceMemoryChanged(): void {
  for (const listener of [...listeners]) listener();
}
