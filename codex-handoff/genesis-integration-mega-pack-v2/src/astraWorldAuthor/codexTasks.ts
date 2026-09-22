import type { WorldAuthorProposal } from "./types.js";

export interface CodexTaskBundle {
  title: string;
  tasks: {
    id: string;
    title: string;
    subsystem: string;
    objective: string;
    constraints: string[];
    acceptance: string[];
  }[];
  assetWork: {
    id: string;
    semanticRole: string;
    query: string;
    licensePolicy: string[];
  }[];
}

export function toCodexTaskBundle(proposal: WorldAuthorProposal): CodexTaskBundle {
  return {
    title: `Implement world proposal: ${proposal.title}`,
    tasks: proposal.proceduralTasks.map((x) => ({
      id: x.id,
      title: x.title,
      subsystem: x.targetSubsystem,
      objective: x.objective,
      constraints: [...x.constraints],
      acceptance: [...x.acceptance]
    })),
    assetWork: proposal.assets.map((x) => ({
      id: x.id,
      semanticRole: x.semanticRole,
      query: x.query,
      licensePolicy: [...x.allowedLicenses]
    }))
  };
}
