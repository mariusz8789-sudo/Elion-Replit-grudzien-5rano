/**
 * GENESIS EXTREME-EVENT ENGINE — Cascade Candidate registration.
 *
 * This is deliberately the ENTIRE Cascade footprint for now: a way to record
 * that a cross-domain dependency has been HYPOTHESIZED, never that it has
 * been computed, confirmed, or is safe to treat as a fact. There is no
 * traversal, no propagation, no automatic triggering between hazard
 * domains, and no code path anywhere in this file that can produce a
 * validation status other than `'NOT_MODELED'` or `'BLOCKED'` — see
 * `CascadeValidationStatus` in contracts.ts. A full Cascade Engine
 * (`CascadeEdge` / `MultiHazardWorldState`) remains a separate, later,
 * separately-reviewed decision, exactly as
 * docs/MULTI_HAZARD_ARCHITECTURE_AUDIT.md already deferred it.
 *
 * Worked example, taken directly from this module's own design brief:
 *   EARTHQUAKE -> possible road closure -> possible hospital-access change
 *   -> requires an infrastructure/routing model Genesis does not have
 *   -> BLOCKED.
 */
import type { CascadeCandidate, CascadeEvidenceRequirement, CascadeValidationStatus } from './contracts';

function cascadeCandidateId(sourceHazardRunId: string, potentialEffect: string, candidateDependency: string): string {
  const slug = (value: string): string => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `cascade_${sourceHazardRunId}_${slug(potentialEffect)}_${slug(candidateDependency)}`;
}

/**
 * Registers one cascade hypothesis. Pure and deterministic: identical
 * arguments always produce an identical (deep-equal) record.
 *
 * `validationStatus` is derived, never accepted as an argument, so a caller
 * cannot mark a candidate anything other than honestly unmodeled/blocked:
 *   - `evidenceRequired` empty -> `'NOT_MODELED'` (no one has even named
 *     what evidence this hypothesis would need yet).
 *   - `evidenceRequired` non-empty -> `'BLOCKED'` (the gap is named, but no
 *     reviewed model exists in Genesis to close it).
 */
export function registerCascadeCandidate(params: {
  readonly sourceHazardRunId: string;
  readonly sourceHazardType: string;
  readonly potentialEffect: string;
  readonly candidateDependency: string;
  readonly evidenceRequired: readonly CascadeEvidenceRequirement[];
}): CascadeCandidate {
  const { sourceHazardRunId, sourceHazardType, potentialEffect, candidateDependency, evidenceRequired } = params;

  const validationStatus: CascadeValidationStatus = evidenceRequired.length === 0 ? 'NOT_MODELED' : 'BLOCKED';
  const validationReason = validationStatus === 'NOT_MODELED'
    ? 'No evidence requirement has been named for this hypothesis yet — it is an unexamined idea, not a candidate under review.'
    : `Requires ${evidenceRequired.length} model/data input(s) Genesis does not currently have: ${evidenceRequired.map((r) => r.requirement).join(', ')}.`;

  return Object.freeze({
    cascadeCandidateId: cascadeCandidateId(sourceHazardRunId, potentialEffect, candidateDependency),
    sourceHazardRunId,
    sourceHazardType,
    potentialEffect,
    candidateDependency,
    evidenceRequired: Object.freeze([...evidenceRequired]),
    validationStatus,
    validationReason,
  });
}
