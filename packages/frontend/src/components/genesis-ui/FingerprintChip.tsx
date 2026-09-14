import type React from 'react';

/**
 * FingerprintChip — a small, monospace chip for one labelled fingerprint
 * value. Reused wherever a screen needs to show a computed hash next to a
 * short label (ruleFingerprint, runFingerprint, sha256, decisionRuleFingerprint).
 */

export function FingerprintChip({ label, value }: { readonly label: string; readonly value: string }): React.ReactElement {
  return (
    <span className="gu-fingerprint-chip" title={`${label}: ${value}`}>
      <span className="gu-fingerprint-chip-label">{label}</span>
      <code className="gu-fingerprint-chip-value">{value}</code>
    </span>
  );
}
