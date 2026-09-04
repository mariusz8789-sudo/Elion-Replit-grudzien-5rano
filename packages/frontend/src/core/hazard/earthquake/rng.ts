/**
 * EARTHQUAKE MODULE — isolated seeded PRNG (mulberry32).
 *
 * Genesis's epidemic core already has a seeded PRNG (`core/epidemic/agents.ts`'s
 * `makeRng`), but this module deliberately does not import it: importing
 * anything from `core/epidemic/` or `core/simulation/` would blur the
 * isolation boundary this vertical slice is required to prove (see the
 * isolation test in earthquakeVerticalSlice.test.ts). This is a completely
 * independent, single-purpose implementation.
 */
export function seededUnitInterval(seed: number): number {
  let a = (seed >>> 0) + 0x6d2b79f5;
  a = a >>> 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
