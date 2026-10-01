import { canonicalHash } from './provenance.mjs';

export const COMMERCIAL_DECISION_STATUS = Object.freeze({
  APPROVED: 'APPROVED',
  CONDITIONAL: 'CONDITIONAL',
  BLOCKED: 'BLOCKED',
  UNKNOWN: 'UNKNOWN',
});

export const COMMERCIAL_RELEASE_STATUS = Object.freeze({
  ADMITTED: 'ADMITTED_FOR_DECLARED_USE',
  BLOCKED: 'BLOCKED_BY_COMMERCIAL_POLICY',
});

const SHA256_RE = /^[a-f0-9]{64}$/;
const ALLOWED_STATUSES = new Set(Object.values(COMMERCIAL_DECISION_STATUS));

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function immutableIdentity(item) {
  const identity = item?.identity ?? {};
  return [identity.sha256, identity.version, identity.accession, identity.imageDigest]
    .some((value) => nonEmpty(value));
}

function validateItem(item, declaredUse) {
  const errors = [];
  if (!nonEmpty(item?.itemId)) errors.push('ITEM_ID_REQUIRED');
  if (!nonEmpty(item?.category)) errors.push('CATEGORY_REQUIRED');
  if (!immutableIdentity(item)) errors.push('IMMUTABLE_IDENTITY_REQUIRED');
  if (!ALLOWED_STATUSES.has(item?.status)) errors.push('DECISION_STATUS_INVALID');
  if (!Array.isArray(item?.intendedUses) || !item.intendedUses.includes(declaredUse)) {
    errors.push('DECLARED_USE_NOT_REVIEWED');
  }
  if (!nonEmpty(item?.licenceEvidence?.sourceUrl)) errors.push('LICENCE_SOURCE_REQUIRED');
  if (!SHA256_RE.test(item?.licenceEvidence?.termsSha256 ?? '')) errors.push('LICENCE_TERMS_HASH_REQUIRED');
  if (!nonEmpty(item?.decision?.owner)) errors.push('DECISION_OWNER_REQUIRED');
  if (!nonEmpty(item?.decision?.decidedAt) || Number.isNaN(Date.parse(item.decision.decidedAt))) {
    errors.push('DECISION_DATE_REQUIRED');
  }
  if (!Array.isArray(item?.evidenceRefs) || item.evidenceRefs.length === 0) errors.push('EVIDENCE_REFERENCE_REQUIRED');

  const unresolvedObligations = (item?.obligations ?? [])
    .filter((obligation) => obligation?.resolved !== true)
    .map((obligation) => obligation?.id ?? 'UNNAMED_OBLIGATION');
  if (item?.status === COMMERCIAL_DECISION_STATUS.CONDITIONAL && unresolvedObligations.length > 0) {
    errors.push('CONDITIONS_UNRESOLVED');
  }
  if (item?.status === COMMERCIAL_DECISION_STATUS.UNKNOWN) errors.push('RIGHTS_UNKNOWN');
  if (item?.status === COMMERCIAL_DECISION_STATUS.BLOCKED) errors.push('RIGHTS_BLOCKED');

  return Object.freeze({
    itemId: item?.itemId ?? null,
    status: errors.length === 0 ? 'ADMITTED' : 'BLOCKED',
    decisionStatus: item?.status ?? COMMERCIAL_DECISION_STATUS.UNKNOWN,
    errors: Object.freeze(errors),
    unresolvedObligations: Object.freeze(unresolvedObligations),
  });
}

/**
 * Fail-closed release admission for a concrete customer delivery.
 *
 * This is deliberately separate from scientific Evidence approval: a valid
 * ResearchRun can still be commercially non-deliverable. Human approval is
 * recorded, but can never override missing identity, terms or usage rights.
 */
export function admitCommercialRelease({ releaseId, researchRunId, declaredUse, items } = {}) {
  const manifestErrors = [];
  if (!nonEmpty(releaseId)) manifestErrors.push('RELEASE_ID_REQUIRED');
  if (!nonEmpty(researchRunId)) manifestErrors.push('RESEARCH_RUN_ID_REQUIRED');
  if (!nonEmpty(declaredUse)) manifestErrors.push('DECLARED_USE_REQUIRED');
  if (!Array.isArray(items) || items.length === 0) manifestErrors.push('RELEASE_ITEMS_REQUIRED');

  const seen = new Set();
  const decisions = Array.isArray(items) && nonEmpty(declaredUse)
    ? items.map((item) => {
      const decision = validateItem(item, declaredUse);
      if (seen.has(decision.itemId)) {
        return Object.freeze({ ...decision, status: 'BLOCKED', errors: Object.freeze([...decision.errors, 'DUPLICATE_ITEM_ID']) });
      }
      seen.add(decision.itemId);
      return decision;
    })
    : [];
  const admitted = manifestErrors.length === 0 && decisions.every((decision) => decision.status === 'ADMITTED');
  const normalizedManifest = {
    schemaVersion: 'genesis.commercial-release-admission@1',
    releaseId: releaseId ?? null,
    researchRunId: researchRunId ?? null,
    declaredUse: declaredUse ?? null,
    items: Array.isArray(items) ? items : [],
  };

  return Object.freeze({
    schemaVersion: normalizedManifest.schemaVersion,
    status: admitted ? COMMERCIAL_RELEASE_STATUS.ADMITTED : COMMERCIAL_RELEASE_STATUS.BLOCKED,
    releaseId: normalizedManifest.releaseId,
    researchRunId: normalizedManifest.researchRunId,
    declaredUse: normalizedManifest.declaredUse,
    manifestHash: canonicalHash(normalizedManifest),
    manifestErrors: Object.freeze(manifestErrors),
    decisions: Object.freeze(decisions),
    exportAllowed: admitted,
  });
}

