/**
 * SCIENCE CHAT BRIDGE — lets another screen (the Matrix dashboard) open and
 * optionally prime the ONE real `ScienceChat` instance already mounted
 * globally in `App.tsx`, instead of building a second chat surface. Same
 * pub/sub shape `core/backend/session.ts` already uses for cross-component
 * state a hook needs to react to. Holds no chat logic, no messages, no
 * history — `ScienceChat.tsx` owns all of that; this is only the open signal.
 */

export interface OpenScienceChatRequest {
  readonly message?: string;
}

type Listener = (request: OpenScienceChatRequest) => void;
const listeners = new Set<Listener>();

/** Called by ScienceChat.tsx to receive open requests. Returns an unsubscribe function. */
export function subscribeScienceChatOpenRequests(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Called by any screen that wants to surface the real Science Chat, optionally pre-filled with a message to send immediately. */
export function requestOpenScienceChat(message?: string): void {
  for (const listener of listeners) listener({ message });
}
