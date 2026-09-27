/**
 * EARTHQUAKE MODULE — seeded unit interval.
 *
 * The module stays isolated from `core/epidemic/` and `core/simulation/` (see the isolation test in
 * earthquakeVerticalSlice.test.ts); the PRNG itself is the ONE mulberry32 in @genesis/core/determinism
 * — the first draw of `mulberry32(seed)`, bit-identical to the former local copy.
 */
import { mulberry32 } from '@genesis/core/determinism.js';

export function seededUnitInterval(seed: number): number {
  return mulberry32(seed)();
}
