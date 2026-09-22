import type {
  AssetRequirement,
  HistoricalClaim,
  RejectedWorldAuthorProposal,
  ValidatedWorldAuthorProposal,
  WorldAuthorProposal,
  WorldAuthorRequest
} from "./types.js";
import type { CanonicalWorldSpecValidatorPort, ClockPort } from "./ports.js";
import { validateHistoricalClaim as canonicalValidateHistoricalClaim } from "../historicalEpistemic/epistemicTaxonomy.js";

/** FIX (red-team finding): the allowed-label set now comes from the canonical
 * taxonomy module (as a `Set` built from its own type at the value level is not
 * possible in TS, so the literal list is kept here but sourced from the same 4
 * values `epistemicTaxonomy.ts` defines — see MIGRATION_NOTES.md for why a full type
 * reuse can't eliminate this one literal list). EVIDENCE_BACKED/INFERRED field-level
 * rules are delegated to the canonical validator via field mapping, instead of
 * duplicating that logic locally. */
const ALLOWED_HISTORICAL = new Set(["EVIDENCE_BACKED", "INFERRED", "SIMULATED", "CINEMATIC"]);

function validateHistoricalClaims(claims: readonly HistoricalClaim[]): string[] {
  const issues: string[] = [];
  for (const claim of claims) {
    if (!ALLOWED_HISTORICAL.has(claim.label)) {
      issues.push(`Unsupported historical label: ${claim.label}`);
      continue;
    }
    const canonicalIssues = canonicalValidateHistoricalClaim({
      entityId: claim.entityOrFeature,
      label: claim.label,
      sourceRefs: claim.sourceRefs,
      rationale: claim.rationale,
    });
    issues.push(...canonicalIssues.map((i) => `${claim.entityOrFeature}: ${i}`));
  }
  return issues;
}

function validateAssets(assets: readonly AssetRequirement[]): string[] {
  const issues: string[] = [];
  for (const asset of assets) {
    if (!asset.provenanceRequired) issues.push(`Asset ${asset.id} must require provenance.`);
    if (asset.allowedLicenses.length === 0) issues.push(`Asset ${asset.id} has no allowed license policy.`);
    if (asset.query.trim().length < 2) issues.push(`Asset ${asset.id} query is empty.`);
  }
  return issues;
}

export async function validateProposal(
  request: WorldAuthorRequest,
  proposal: WorldAuthorProposal,
  canonical: CanonicalWorldSpecValidatorPort,
  clock: ClockPort
): Promise<ValidatedWorldAuthorProposal | RejectedWorldAuthorProposal> {
  const issues: string[] = [];
  if (proposal.requestId !== request.requestId) issues.push("requestId mismatch.");
  if (proposal.canonicalSpecPatch.worldKind !== request.worldKind) issues.push("worldKind mismatch.");
  if (request.targetRuntime === "THREE" && proposal.warnings.some((x) => x.toLowerCase().includes("requires unreal"))) {
    issues.push("Proposal requires Unreal but current target runtime is THREE.");
  }
  issues.push(...validateHistoricalClaims(proposal.historicalClaims));
  issues.push(...validateAssets(proposal.assets));

  const canonicalResult = await canonical.validateProposal(request, proposal);
  issues.push(...canonicalResult.issues);

  if (issues.length > 0 || !canonicalResult.valid) {
    return {
      proposal,
      validation: {
        valid: false,
        checkedAt: clock.nowIso(),
        issues
      }
    };
  }

  return {
    ...proposal,
    validation: {
      valid: true,
      checkedAt: clock.nowIso(),
      issues: []
    }
  };
}
