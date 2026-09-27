import type {
  AssetRequirement,
  ValidatedWorldAuthorProposal,
  WorldAuthorProposal,
  WorldAuthorRequest
} from "./types.js";

export interface WorldAuthorProvider {
  author(request: WorldAuthorRequest): Promise<WorldAuthorProposal>;
}

export interface AssetCatalogCandidate {
  id: string;
  name: string;
  source: string;
  license: string;
  formats: string[];
  triangleCount?: number;
  textureSize?: number;
  tags: string[];
  sourceUrl?: string;
}

export interface AssetCatalogPort {
  search(requirement: AssetRequirement): Promise<AssetCatalogCandidate[]>;
}

export interface CanonicalWorldSpecValidatorPort {
  validateProposal(
    request: WorldAuthorRequest,
    proposal: WorldAuthorProposal
  ): Promise<{ valid: boolean; issues: string[] }>;
}

/** worldGraphRef/worldFrameRef stay `unknown` deliberately — this package must never
 * know or construct the real WorldGraph's shape; that is 100% the real World
 * Director's job. Confirmed by audit: no WorldGraph/mesh/scene-graph structure is
 * built anywhere else in this package either. */
export interface CanonicalWorldDirectorPort {
  execute(input: {
    request: WorldAuthorRequest;
    proposal: ValidatedWorldAuthorProposal;
    resolvedAssets: Record<string, AssetCatalogCandidate | null>;
  }): Promise<{
    worldId: string;
    worldGraphRef: unknown;
    worldFrameRef?: unknown;
    evidenceRefs: string[];
  }>;
}

export interface EvidencePort {
  append(event: {
    type:
      | "WORLD_AUTHOR_REQUESTED"
      | "WORLD_AUTHOR_PROPOSED"
      | "WORLD_AUTHOR_VALIDATED"
      | "WORLD_AUTHOR_REJECTED"
      | "WORLD_AUTHOR_ASSETS_RESOLVED"
      | "WORLD_AUTHOR_EXECUTED";
    requestId: string;
    payload: unknown;
  }): Promise<void> | void;
}

export interface ClockPort {
  nowIso(): string;
}
