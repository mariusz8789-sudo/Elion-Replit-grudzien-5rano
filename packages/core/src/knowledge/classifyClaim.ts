/* Proprietary / All Rights Reserved - Genesis OS */
import type { ClaimStatus, ClaimType, SourceKind } from './evidenceTypes.js';
export interface ClassifyInput { readonly claimType: ClaimType; readonly sourceKind: SourceKind; readonly independentSourceIds: readonly string[]; readonly confidence: number; }
/** Video material can NEVER reach 'verified' without independent corroboration. */
export const canReachVerified = (sourceKind: SourceKind): boolean => sourceKind !== 'video';
export function classifyClaim(i: ClassifyInput): ClaimStatus {
  const conf = Math.min(1, Math.max(0, i.confidence));
  if (conf < 0.15) return 'rejected';
  const hasIndependent = i.independentSourceIds.length >= 1;
  if (canReachVerified(i.sourceKind) && hasIndependent && conf >= 0.8 && i.claimType !== 'hypothesis') return 'verified';
  if (conf >= 0.5) return 'candidate';
  return 'unverified';
}
export const statusLabelPl = (s: ClaimStatus): string => s === 'verified' ? 'potwierdzone przez niezależne źródła' : s === 'candidate' ? 'wstępny kandydat — wymaga weryfikacji' : s === 'unverified' ? 'niezweryfikowane' : 'odrzucone';
