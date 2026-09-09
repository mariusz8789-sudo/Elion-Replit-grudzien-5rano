/**
 * DATA PROVENANCE — where a NUMBER came from, not how well-established the science behind it is
 * (that second axis is `ConfirmationLevel` in `core/citation.ts`; the two are orthogonal, per
 * `docs/MASTER_PRIORITY_GENESIS.md`'s own framing, and must not be merged into one badge).
 *
 * The `SIMULATED`/`REFERENCE`/`REAL_EXPERIMENTAL` type itself now lives in `core/dataProvenance.ts`
 * (C1's widening of `dataSource.ts`'s old `isSynthetic: boolean`, landed the same sprint this badge
 * was built) and is re-exported here rather than redeclared, so there is exactly one definition —
 * this file only gives the UI layer a badge to render it. No screen may pass `'REAL_EXPERIMENTAL'`
 * until a real measurement genuinely produced the number next to it (see `docs/GENESIS_NORTH_STAR.md`
 * §4 — labelling simulated output as real is the exact failure mode that document exists to prevent).
 * `RealExperimentPipeline.tsx` is the first caller that genuinely earns this badge, once a person has
 * entered a real reading through `createRealExperimentRun`.
 */

import type { DataProvenance } from '../../core/dataProvenance';

export type { DataProvenance };

const PROVENANCE_LABEL: Record<DataProvenance, string> = {
  SIMULATED: 'SIMULATION',
  REFERENCE: 'REFERENCE DATA',
  REAL_EXPERIMENTAL: 'REAL EXPERIMENTAL DATA',
};

/** Reuses the same `.gx-matrix-badge` treatment `GenesisWorldScreen.tsx`'s Matrix panel already gives
 * its own "SIMULATION" label — one badge convention for this fact across the whole app, not a second. */
export function ProvenanceBadge({ provenance, testId }: { provenance: DataProvenance; testId?: string }) {
  return (
    <span className={`gx-matrix-badge gx-provenance-${provenance.toLowerCase()}`} data-testid={testId}>
      {PROVENANCE_LABEL[provenance]}
    </span>
  );
}
