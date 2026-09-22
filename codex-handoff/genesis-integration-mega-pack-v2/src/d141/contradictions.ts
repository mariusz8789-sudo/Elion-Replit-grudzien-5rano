import { fingerprint } from './hash.js';
import type { ContradictionRecord, KnowledgeClaim } from './types.js';
import type { HashPort } from '../hashReplay/hashPort.js';

function comparable(a: KnowledgeClaim, b: KnowledgeClaim): boolean {
  return a.subject === b.subject && a.predicate === b.predicate && a.scope === b.scope;
}

function equalValue(a: KnowledgeClaim['value'], b: KnowledgeClaim['value']): boolean {
  return Object.is(a, b);
}

/** Unchanged from V1 other than accepting an optional HashPort (fix area 4). Detection
 * logic itself was already correct; the V1 bug was entirely in metaEngine.ts's failure
 * to act on this function's output (see metaEngine.ts fix area 3). */
export function detectContradictions(claims: readonly KnowledgeClaim[], hashPort?: HashPort): ContradictionRecord[] {
  const result: ContradictionRecord[] = [];
  for (let i = 0; i < claims.length; i += 1) {
    const a = claims[i];
    if (!a) continue;
    for (let j = i + 1; j < claims.length; j += 1) {
      const b = claims[j];
      if (!b || !comparable(a, b) || equalValue(a.value, b.value)) continue;
      if (a.state === 'UNKNOWN' || b.state === 'UNKNOWN') continue;
      const confidenceFloor = Math.min(a.confidence ?? 0.5, b.confidence ?? 0.5);
      const severity = confidenceFloor >= 0.8 ? 'HIGH' : confidenceFloor >= 0.5 ? 'MEDIUM' : 'LOW';
      const id = fingerprint({ subject: a.subject, predicate: a.predicate, ids: [a.claimId, b.claimId].sort() }, hashPort);
      result.push({
        contradictionId: `contradiction:${id}`,
        subject: a.subject,
        predicate: a.predicate,
        claimIds: [a.claimId, b.claimId],
        values: [a.value, b.value],
        severity,
        resolution: severity === 'HIGH' ? 'NEW_EXPERIMENT_REQUIRED' : 'SOURCE_PRIORITY_REQUIRED',
      });
    }
  }
  return result;
}
