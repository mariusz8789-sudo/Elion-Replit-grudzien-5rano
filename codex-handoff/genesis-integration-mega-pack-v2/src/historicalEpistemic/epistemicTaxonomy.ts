/**
 * Fix area 5 (historical epistemic taxonomy). world-visual-v1's `historical.ts` declared
 * its own `HistoricalEpistemicLabel = 'EVIDENCE_BACKED'|'INFERRED'|'SIMULATED'|'CINEMATIC'`.
 * The real World Director V1 package independently declares its own, nominally distinct
 * `EvidenceStatus` type with the exact same four string values (`types.ts`), and its
 * `policy.ts::epistemicForMode()` only ever *produces* three of them (SIMULATED, INFERRED,
 * CINEMATIC — never EVIDENCE_BACKED, since no WorldMode maps to it). D-141's own
 * `worldDirectorAdapter.ts::WorldDirectorMetaInput.epistemicLabel` independently declares
 * a THIRD nominally-distinct union with the same four values.
 *
 * So the value sets already agreed by coincidence, but there were three separately
 * declared TypeScript types for one concept, plus one producer (World Director's policy)
 * that silently never emits one of its own type's four members. V2 rule: ONE exported
 * type + ONE validator here; World Director's `policy.ts` and D-141's
 * `worldDirectorAdapter.ts` should both import `EpistemicLabel` from this module instead
 * of re-declaring it, and world-visual-v2 does not carry its own `historical.ts` at all
 * (re-exports this module instead — see `worldVisual/index.ts`).
 */
export type EpistemicLabel = "EVIDENCE_BACKED" | "INFERRED" | "SIMULATED" | "CINEMATIC";

export interface HistoricalEntityClaim {
  entityId: string;
  label: EpistemicLabel;
  sourceRefs: string[];
  rationale?: string;
}

export function validateHistoricalClaim(claim: HistoricalEntityClaim): string[] {
  const issues: string[] = [];
  if (claim.label === "EVIDENCE_BACKED" && claim.sourceRefs.length === 0) {
    issues.push("EVIDENCE_BACKED requires at least one source reference.");
  }
  if (claim.label === "INFERRED" && (!claim.rationale || claim.rationale.trim().length < 3)) {
    issues.push("INFERRED requires a rationale.");
  }
  return issues;
}

/**
 * Mirrors World Director V1 `policy.ts::epistemicForMode()` exactly, so a real-repo
 * integration can replace that function's body with a call to this one without changing
 * its observed behavior. `WorldMode` values are duplicated here as string literals
 * (not imported) to keep this module dependency-free for standalone testing; Codex
 * should bind against the real `WorldMode` type when wiring World Director itself.
 */
export function fromWorldDirectorMode(mode: "SCIENTIFIC" | "HISTORICAL_RECONSTRUCTION" | "CINEMATIC"): EpistemicLabel {
  switch (mode) {
    case "SCIENTIFIC":
      return "SIMULATED";
    case "HISTORICAL_RECONSTRUCTION":
      return "INFERRED";
    case "CINEMATIC":
      return "CINEMATIC";
  }
}

/** D-141's mapping from an EpistemicLabel to its own KnowledgeClaim EpistemicState, kept
 * identical to `worldDirectorAdapter.ts::assessWorldDirectorRun`'s inline logic. */
export function toD141ClaimState(label: EpistemicLabel): "SUPPORTED" | "INFERRED" | "SIMULATED" | "UNVERIFIED" {
  if (label === "EVIDENCE_BACKED") return "SUPPORTED";
  if (label === "INFERRED") return "INFERRED";
  if (label === "SIMULATED") return "SIMULATED";
  return "UNVERIFIED";
}
