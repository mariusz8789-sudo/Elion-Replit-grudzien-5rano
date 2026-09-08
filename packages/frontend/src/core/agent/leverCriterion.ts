/**
 * The one shared piece of every lever catalogue's criterion building.
 *
 * It lives in its own module rather than in `worldGoalIntent.ts` — the obvious
 * home, since that is where `WorldLever` is declared — because the dependency
 * only runs one way there. `worldGoalIntent.ts` imports each catalogue as a
 * VALUE to build `WORLD_LEVER_CATALOGS`, while the catalogues import only TYPES
 * back from it, which are erased at runtime. Exporting a function from
 * `worldGoalIntent.ts` and importing it in a catalogue would turn that into a
 * real runtime cycle. This module imports nothing, so it cannot.
 */

/** The relation a criterion needs to express "move this metric in the wanted direction". */
export function relationFor(direction: 'minimize' | 'maximize'): 'less-than' | 'greater-than' {
  return direction === 'minimize' ? 'less-than' : 'greater-than';
}
