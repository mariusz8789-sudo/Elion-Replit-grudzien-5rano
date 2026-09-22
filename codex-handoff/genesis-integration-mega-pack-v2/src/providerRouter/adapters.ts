import type { ModelProvider } from "./ports.js";
import type { ModelResult, ModelTask, ProviderDescriptor } from "./types.js";

export interface OpenAIResponsesClientLike {
  responses: {
    create(input: {
      model: string;
      instructions: string;
      input: string;
      text?: { format?: unknown };
    }): Promise<{ output_text?: string; usage?: { input_tokens?: number; output_tokens?: number } }>;
  };
}

export class OpenAIResponsesProvider implements ModelProvider {
  constructor(
    public readonly descriptor: ProviderDescriptor,
    private readonly client: OpenAIResponsesClientLike
  ) {}

  async run(task: ModelTask): Promise<ModelResult> {
    const response = await this.client.responses.create({
      model: this.descriptor.model,
      instructions: task.instructions,
      input: JSON.stringify(task.input)
    });
    const text = response.output_text ?? "";
    let output: unknown = text;
    if (task.requireStructuredOutput) {
      try { output = JSON.parse(text); } catch { throw new Error("OpenAI provider returned invalid JSON."); }
    }
    return {
      taskId: task.taskId,
      providerId: this.descriptor.id,
      model: this.descriptor.model,
      output,
      resultKind: "REASONING_ONLY",
      ...(response.usage ? {
        usage: {
          ...(response.usage.input_tokens !== undefined ? { inputTokens: response.usage.input_tokens } : {}),
          ...(response.usage.output_tokens !== undefined ? { outputTokens: response.usage.output_tokens } : {})
        }
      } : {}),
      evidenceRefs: []
    };
  }
}

export interface AnthropicMessagesClientLike {
  messages: {
    create(input: {
      model: string;
      max_tokens: number;
      system: string;
      messages: Array<{ role: "user"; content: string }>;
    }): Promise<{ content: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } }>;
  };
}

export class AnthropicMessagesProvider implements ModelProvider {
  constructor(
    public readonly descriptor: ProviderDescriptor,
    private readonly client: AnthropicMessagesClientLike
  ) {}

  async run(task: ModelTask): Promise<ModelResult> {
    const response = await this.client.messages.create({
      model: this.descriptor.model,
      max_tokens: 8192,
      system: task.instructions,
      messages: [{ role: "user", content: JSON.stringify(task.input) }]
    });
    const text = response.content.find((x) => x.type === "text")?.text ?? "";
    let output: unknown = text;
    if (task.requireStructuredOutput) {
      try { output = JSON.parse(text); } catch { throw new Error("Anthropic provider returned invalid JSON."); }
    }
    return {
      taskId: task.taskId,
      providerId: this.descriptor.id,
      model: this.descriptor.model,
      output,
      resultKind: "REASONING_ONLY",
      ...(response.usage ? {
        usage: {
          ...(response.usage.input_tokens !== undefined ? { inputTokens: response.usage.input_tokens } : {}),
          ...(response.usage.output_tokens !== undefined ? { outputTokens: response.usage.output_tokens } : {})
        }
      } : {}),
      evidenceRefs: []
    };
  }
}
