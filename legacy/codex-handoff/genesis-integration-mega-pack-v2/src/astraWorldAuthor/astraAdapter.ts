import type { WorldAuthorProvider } from "./ports.js";
import type { WorldAuthorProposal, WorldAuthorRequest } from "./types.js";
import { buildWorldAuthorInput, buildWorldAuthorInstructions } from "./prompt.js";
import { parseWorldAuthorProposal } from "./schema.js";

export interface ResponsesClientLike {
  responses: {
    create(input: {
      model: string;
      instructions: string;
      input: string;
      reasoning?: { effort: "low" | "medium" | "high" };
    }): Promise<{ output_text?: string }>;
  };
}

export interface AstraWorldAuthorOptions {
  model?: string;
  reasoningEffort?: "low" | "medium" | "high";
}

export class AstraResponsesWorldAuthorProvider implements WorldAuthorProvider {
  private readonly model: string;
  private readonly reasoningEffort: "low" | "medium" | "high";

  constructor(
    private readonly client: ResponsesClientLike,
    options: AstraWorldAuthorOptions = {}
  ) {
    this.model = options.model ?? "gpt-6-astra";
    this.reasoningEffort = options.reasoningEffort ?? "medium";
  }

  async author(request: WorldAuthorRequest): Promise<WorldAuthorProposal> {
    const response = await this.client.responses.create({
      model: this.model,
      instructions: buildWorldAuthorInstructions(),
      input: buildWorldAuthorInput(request),
      reasoning: { effort: this.reasoningEffort }
    });

    const text = response.output_text?.trim();
    if (!text) throw new Error("Astra returned no output_text.");

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("Astra response was not valid JSON.");
    }
    const proposal = parseWorldAuthorProposal(parsed);
    return { ...proposal, authorModel: this.model };
  }
}
