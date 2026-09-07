/**
 * GENESIS WORLD INTERACTION — the camera/time counterpart to `activeSimControls.ts`'s registry.
 * Same shape, same reason: the global Science Chat resolver (`scienceChat/resolveCommand.ts`) is a
 * pure function with no reference to whichever Sim3D screen happens to be mounted, so it cannot
 * itself call into a scene's own `applyObservationTarget`/`step` methods. This is the one-slot
 * bridge a currently-open screen registers into (mirroring `registerActiveSimControls`), so
 * `ScienceChat.tsx` can forward a parsed camera/time sentence to whichever real observation-capable
 * scene is actually on screen — never a second natural-language parser, never a second camera/clock.
 */

export interface ActiveObservationControl {
  /** Applies one sentence via the screen's OWN existing observation vocabulary (a named-target
   * camera focus, or a forward time step) and returns the real outcome — never a guessed one. */
  applyObservation: (sentence: string) => { found: boolean; narration: string };
}

let active: ActiveObservationControl | null = null;

/** Called by a screen when it mounts; returns the function to call on unmount. */
export function registerActiveObservationControl(controls: ActiveObservationControl): () => void {
  active = controls;
  return () => {
    if (active === controls) active = null;
  };
}

export function getActiveObservationControl(): ActiveObservationControl | null {
  return active;
}

export function hasActiveObservationControl(): boolean {
  return active !== null;
}
