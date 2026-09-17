import { preRegister, freeze, type FrozenProtocol } from '../agent/genesisAdjudicationProtocol';
import { fnv1a, canonicalJson } from '../events/hash';
import type { BaselineRecord } from './contracts';

/**
 * D-062 BASELINE FREEZE — the real baseline must be identified and frozen
 * BEFORE any candidate is scored against it (brief §4). Reuses the real
 * `genesisAdjudicationProtocol.ts::preRegister`/`freeze` pre-registration
 * primitive (D-047) rather than inventing a second freeze mechanism.
 */

export function makeBaselineFingerprint(b: Omit<BaselineRecord, 'fingerprint'>): string {
  return fnv1a(canonicalJson(b));
}

export function freezeBaseline(b: BaselineRecord, now: string): FrozenProtocol<{ readonly baselineFingerprint: string }> {
  const pre = preRegister({
    protocolId: 'CHALLENGE-BASELINE',
    subjectId: b.baselineId,
    question: 'baseline identity + known outcome metrics frozen before research',
    rule: { baselineFingerprint: b.fingerprint },
    declaredAt: now,
  });
  return freeze(pre, now);
}

export function verifyBaselineFrozen(b: BaselineRecord, frozen: FrozenProtocol<{ readonly baselineFingerprint: string }>): boolean {
  return frozen.ruleFingerprint === fnv1a(canonicalJson({ baselineFingerprint: b.fingerprint }));
}
