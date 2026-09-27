import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";

export interface TranslationResult {
  translatedText: string;
  detectedSourceLanguage: string;
  provider: string;
}

export interface TranslationProvider {
  isConfigured(): boolean;
  translate(text: string, targetLanguage: string, sourceLanguage?: string): Promise<TranslationResult>;
}

const TRANSLATION_JSON_SCHEMA = {
  type: "object",
  properties: {
    detected_source_language: { type: "string", description: "ISO 639-1 code of the original text's language" },
    translated_text: { type: "string" },
  },
  required: ["detected_source_language", "translated_text"],
  additionalProperties: false,
};

class ClaudeTranslationProvider implements TranslationProvider {
  private client: Anthropic | null = null;

  private getClient(): Anthropic {
    if (!this.client) {
      this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    }
    return this.client;
  }

  isConfigured(): boolean {
    return Boolean(env.ANTHROPIC_API_KEY);
  }

  async translate(text: string, targetLanguage: string, sourceLanguage?: string): Promise<TranslationResult> {
    if (!this.isConfigured()) {
      throw new Error("Translation is not configured: ANTHROPIC_API_KEY is not set");
    }
    if (!text.trim()) {
      return { translatedText: text, detectedSourceLanguage: sourceLanguage || "en", provider: "claude" };
    }

    const client = this.getClient();
    const model = process.env.TRANSLATION_MODEL || "claude-opus-4-8";

    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system:
        "You are a translation engine embedded in a logistics marketplace chat. Detect the source language and " +
        `translate the user's message into the language with ISO 639-1 code "${targetLanguage}". Preserve tone, ` +
        "meaning, names, and numbers exactly. Do not add commentary. Respond only via the provided JSON schema.",
      output_config: {
        format: { type: "json_schema", schema: TRANSLATION_JSON_SCHEMA },
      },
      messages: [{ role: "user", content: text }],
    } as Anthropic.MessageCreateParamsNonStreaming);

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    if (!textBlock) {
      throw new Error("Translation returned no text content");
    }

    const parsed = JSON.parse(textBlock.text) as {
      detected_source_language: string;
      translated_text: string;
    };

    return {
      translatedText: parsed.translated_text,
      detectedSourceLanguage: parsed.detected_source_language,
      provider: "claude",
    };
  }
}

const provider = new ClaudeTranslationProvider();

export function getTranslationProvider(): TranslationProvider {
  return provider;
}
