import type { WorldAuthorRequest } from "./types.js";

export function buildWorldAuthorInstructions(): string {
  return [
    "You are the WORLD AUTHOR for Genesis.",
    "You do NOT own canonical scientific state.",
    "Return JSON only.",
    "Your job is to propose scene/content generation, not to create a second world engine.",
    "Genesis World Director will validate and persist the result.",
    "Never claim historical or scientific certainty without evidence labels.",
    "Historical/reconstructed features must be labeled EVIDENCE_BACKED, INFERRED, SIMULATED, or CINEMATIC.",
    "Do not invent medical/scientific capabilities.",
    "Prefer reusable modular assets and procedural tasks.",
    "Do not return executable destructive commands.",
    "Target current THREE.js runtime unless request explicitly says UNREAL_FUTURE_POC.",
    "The JSON must match WorldAuthorProposal schemaVersion=1."
  ].join("\n");
}

export function buildWorldAuthorInput(request: WorldAuthorRequest): string {
  return JSON.stringify({
    task: "Create a WorldAuthorProposal for Genesis",
    request,
    outputRequirements: {
      includeCanonicalSpecPatch: true,
      includeLayoutZones: true,
      includeAssetRequirements: true,
      includeProceduralCodeTasks: true,
      includeLightingProfile: true,
      includeSceneVariants: true,
      includeHistoricalClaims: true,
      includeWarnings: true
    }
  });
}
