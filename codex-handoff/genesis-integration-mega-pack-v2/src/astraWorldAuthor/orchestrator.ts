import type {
  AssetCatalogPort,
  CanonicalWorldDirectorPort,
  CanonicalWorldSpecValidatorPort,
  ClockPort,
  EvidencePort,
  WorldAuthorProvider
} from "./ports.js";
import type { WorldAuthorRequest } from "./types.js";
import { validateProposal } from "./validation.js";
import { resolveAssets } from "./assets.js";

export interface WorldAuthorOrchestratorDeps {
  author: WorldAuthorProvider;
  canonicalValidator: CanonicalWorldSpecValidatorPort;
  assetCatalog: AssetCatalogPort;
  worldDirector: CanonicalWorldDirectorPort;
  evidence: EvidencePort;
  clock: ClockPort;
}

/** Unchanged control flow from V1 (audit found no defect here): every stage emits
 * evidence in order, and `worldDirector.execute` is only ever reachable after
 * validation succeeds — the REJECTED branch returns before it. */
export class WorldAuthorOrchestrator {
  constructor(private readonly deps: WorldAuthorOrchestratorDeps) {}

  async run(request: WorldAuthorRequest) {
    await this.deps.evidence.append({
      type: "WORLD_AUTHOR_REQUESTED",
      requestId: request.requestId,
      payload: request
    });

    const proposal = await this.deps.author.author(request);
    await this.deps.evidence.append({
      type: "WORLD_AUTHOR_PROPOSED",
      requestId: request.requestId,
      payload: proposal
    });

    const validated = await validateProposal(request, proposal, this.deps.canonicalValidator, this.deps.clock);
    if ("proposal" in validated) {
      await this.deps.evidence.append({
        type: "WORLD_AUTHOR_REJECTED",
        requestId: request.requestId,
        payload: validated.validation
      });
      return { status: "REJECTED" as const, result: validated };
    }

    await this.deps.evidence.append({
      type: "WORLD_AUTHOR_VALIDATED",
      requestId: request.requestId,
      payload: validated.validation
    });

    const resolvedAssets = await resolveAssets(validated.assets, this.deps.assetCatalog);
    await this.deps.evidence.append({
      type: "WORLD_AUTHOR_ASSETS_RESOLVED",
      requestId: request.requestId,
      payload: resolvedAssets
    });

    const execution = await this.deps.worldDirector.execute({
      request,
      proposal: validated,
      resolvedAssets
    });

    await this.deps.evidence.append({
      type: "WORLD_AUTHOR_EXECUTED",
      requestId: request.requestId,
      payload: execution
    });

    return {
      status: "EXECUTED" as const,
      proposal: validated,
      resolvedAssets,
      execution
    };
  }
}
