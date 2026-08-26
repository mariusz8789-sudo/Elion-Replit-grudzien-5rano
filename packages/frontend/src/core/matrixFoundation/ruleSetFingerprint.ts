/**
 * MATRIX FOUNDATION — RULE-SET FINGERPRINT.
 *
 * `core/events/consequence.ts`'s `GenesisRule` is plain code — a `trigger`/
 * `when`/`emit` object with a function value has no stable identity to
 * persist or replay against. This gives a DECLARED, hashable identity to a
 * named set of rules (id + version per rule) so a future run record can pin
 * "which rules were active" the same way `HazardRun.hazardModuleVersion`
 * pins a scientific module's version — without requiring rules themselves
 * to become data, and without any change to `consequence.ts`.
 *
 * This module does not import, run, or interpret any `GenesisRule`. It
 * only fingerprints a caller-supplied manifest of rule ids/versions.
 */
import { canonicalJson } from '../events/hash';
import { sha256Hex } from '../discovery/evidenceCrypto';

export interface RuleDescriptor {
  readonly ruleId: string;
  readonly version: string;
}

export interface RuleSetDescriptor {
  readonly ruleSetId: string;
  readonly rules: readonly RuleDescriptor[];
}

/** Order-independent: the same rules declared in a different order fingerprint identically. */
export async function computeRuleSetFingerprint(ruleSet: RuleSetDescriptor): Promise<string> {
  const sortedRules = [...ruleSet.rules].sort((a, b) => a.ruleId.localeCompare(b.ruleId));
  return sha256Hex(canonicalJson({ ruleSetId: ruleSet.ruleSetId, rules: sortedRules }));
}
