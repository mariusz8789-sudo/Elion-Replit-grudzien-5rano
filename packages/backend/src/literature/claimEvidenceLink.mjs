import { canonicalHash } from '../provenance.mjs';
import { PROVENANCE_CLASS } from '../provenanceClass.mjs';

export const CLAIM_EVIDENCE_RELATIONSHIP = Object.freeze({
  SUPPORTS: 'SUPPORTS',
  CONTRADICTS: 'CONTRADICTS',
  CONTEXT_ONLY: 'CONTEXT_ONLY',
  METHOD_SOURCE: 'METHOD_SOURCE',
  UNKNOWN: 'UNKNOWN',
});

const RELATIONSHIPS = new Set(Object.values(CLAIM_EVIDENCE_RELATIONSHIP));
const STR = (value, max) => typeof value === 'string' && value.trim().length > 0 ? value.trim().slice(0, max) : null;

export function proposeClaimEvidenceLink(input, admittedSourceIds) {
  const claimId = STR(input?.claimId, 300);
  const sourceId = STR(input?.sourceId, 500);
  const relationship = RELATIONSHIPS.has(input?.relationship) ? input.relationship : CLAIM_EVIDENCE_RELATIONSHIP.UNKNOWN;
  if (!claimId || !sourceId || !admittedSourceIds.has(sourceId)) return null;
  const extractedStatement = STR(input?.extractedStatement, 4_000);
  const locationInSource = STR(input?.locationInSource, 1_000);
  const extractionMethod = STR(input?.extractionMethod, 200) ?? 'UNSPECIFIED';
  const confidence = Number(input?.extractionConfidence);
  const extractionConfidence = Number.isFinite(confidence) && confidence >= 0 && confidence <= 1 ? confidence : 0;
  const link = {
    claimId,
    sourceId,
    relationship,
    extractedStatement,
    locationInSource,
    extractionMethod,
    extractionConfidence,
    humanReviewed: false,
    // A relationship someone proposed is a model proposal; one nobody has read yet is unknown.
    provenanceClass: relationship === CLAIM_EVIDENCE_RELATIONSHIP.UNKNOWN ? PROVENANCE_CLASS.UNKNOWN : PROVENANCE_CLASS.MODEL_PROPOSAL,
    status: 'PROPOSED',
    epistemicStatus: 'NOT_EVIDENCE',
  };
  return { ...link, linkId: `claim-source:${canonicalHash(link).slice(0, 24)}` };
}

export function unknownClaimEvidenceLink(claimId, sourceId) {
  return proposeClaimEvidenceLink({
    claimId,
    sourceId,
    relationship: CLAIM_EVIDENCE_RELATIONSHIP.UNKNOWN,
    extractedStatement: null,
    locationInSource: null,
    extractionMethod: 'NONE',
    extractionConfidence: 0,
  }, new Set([sourceId]));
}
