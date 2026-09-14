import type React from 'react';

/**
 * VerdictBanner — the one, real, reusable verdict banner for Genesis screens.
 *
 * No `VerdictBanner`/`ProvenancePanel`/`FingerprintChip` existed anywhere in
 * this repo before this file (verified: `grep -rl` over components/ before
 * writing this returned nothing) — there was nothing to extend. This is the
 * real thing, built once, so the NEXT screen extends it instead of a mockup
 * ever needing to invent one again.
 *
 * Renders EXACTLY the label and reason it is given — it does not know what a
 * "good" or "bad" verdict is, does not pick a default label, and does not
 * fall back to a placeholder when `reason` is empty. A caller passing a
 * fabricated label gets a fabricated banner; this component's only job is
 * honest projection.
 */

export type GenesisVerdictLabel = 'WINNER' | 'NO_WINNER' | 'CONFLICTING_EVIDENCE' | 'INSUFFICIENT_EVIDENCE' | string;

const STATUS_CLASS: Readonly<Record<string, string>> = {
  WINNER: 'gu-verdict-winner',
  NO_WINNER: 'gu-verdict-no-winner',
  CONFLICTING_EVIDENCE: 'gu-verdict-conflicting',
  INSUFFICIENT_EVIDENCE: 'gu-verdict-insufficient',
};

export function VerdictBanner({ label, reason }: { readonly label: GenesisVerdictLabel; readonly reason?: string }): React.ReactElement {
  const statusClass = STATUS_CLASS[label] ?? 'gu-verdict-unknown';
  return (
    <div className={`gu-verdict-banner ${statusClass}`} role="status">
      <span className="gu-verdict-label">{label}</span>
      {reason !== undefined && reason.length > 0 && <p className="gu-verdict-reason">{reason}</p>}
    </div>
  );
}
