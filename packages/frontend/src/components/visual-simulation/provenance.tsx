/**
 * DATA PROVENANCE — where a NUMBER came from, not how well-established the science behind it is
 * (that second axis is `ConfirmationLevel` in `core/citation.ts`; the two are orthogonal, per
 * `docs/MASTER_PRIORITY_GENESIS.md`'s own framing, and must not be merged into one badge).
 *
 * `core/dataSource.ts` today only has `isSynthetic: boolean`, which cannot tell a Genesis solver's
 * own output apart from external reference/literature data — both are `isSynthetic: false` or
 * `true` under one flag. `MASTER_PRIORITY_GENESIS.md` names the target three-way model this type
 * mirrors exactly (`SIMULATED` / `REFERENCE` / `REAL_EXPERIMENTAL`); this file does NOT widen
 * `dataSource.ts` itself — that is C1/C3's own change, tracked there — it only gives the UI layer a
 * badge ready to render whichever of the three a future real field actually reports. Every caller in
 * this codebase today passes `'SIMULATED'` because that is the only true value that exists yet: no
 * screen may pass `'REAL_EXPERIMENTAL'` until a real measurement genuinely produced the number next
 * to it (see `docs/GENESIS_NORTH_STAR.md` §4 — labelling simulated output as real is the exact
 * failure mode that document exists to prevent).
 */

export type DataProvenance = 'SIMULATED' | 'REFERENCE' | 'REAL_EXPERIMENTAL';

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
