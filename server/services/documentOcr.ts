import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";

// Document OCR for the Universal Document & License Center - reuses the exact vision-call
// pattern already established by cargoRecognition.ts (same SDK, same JSON-schema-constrained
// output, same graceful "not configured" behavior) rather than a new provider abstraction.
// This only *extracts* fields for a human reviewer to confirm - it never auto-approves a
// document, matching the existing manual review workflow in reviewVerificationDocument().

export interface DocumentOcrResult {
  docNumber: string | null;
  issueDate: string | null; // ISO date string, or null if not detected
  expiryDate: string | null;
  country: string | null; // ISO 3166-1 alpha-2 if determinable
  authority: string | null;
  holderName: string | null;
  confidence: number;
  provider: string;
  raw: unknown;
}

const DOCUMENT_OCR_JSON_SCHEMA = {
  type: "object",
  properties: {
    doc_number: { type: ["string", "null"] },
    issue_date: { type: ["string", "null"], description: "ISO 8601 date (YYYY-MM-DD), or null if not visible" },
    expiry_date: { type: ["string", "null"], description: "ISO 8601 date (YYYY-MM-DD), or null if not visible" },
    country: { type: ["string", "null"], description: "ISO 3166-1 alpha-2 country code, or null if not determinable" },
    authority: { type: ["string", "null"], description: "Issuing authority/agency name printed on the document" },
    holder_name: { type: ["string", "null"] },
    confidence: { type: "number", description: "0 to 1" },
  },
  required: ["doc_number", "issue_date", "expiry_date", "country", "authority", "holder_name", "confidence"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You are a document-verification OCR assistant for a logistics compliance platform. Given a photo or
scan of an official document (license, certificate, ID, permit), extract only what is clearly visible: document
number, issue date, expiry date, issuing country, issuing authority, and the holder's name. Never guess or invent a
value - use null for anything not clearly legible. Respond only via the provided JSON schema.`;

function isConfigured(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}

function buildImageSource(imageUrl: string): { type: "url"; url: string } | { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string } {
  const dataUrlMatch = imageUrl.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/);
  if (dataUrlMatch) {
    return { type: "base64", media_type: dataUrlMatch[1] as any, data: dataUrlMatch[2] };
  }
  return { type: "url", url: imageUrl };
}

export function isDocumentOcrConfigured(): boolean {
  return isConfigured();
}

export async function extractDocumentFields(imageUrl: string): Promise<DocumentOcrResult> {
  if (!isConfigured()) {
    throw new Error("Document OCR is not configured: ANTHROPIC_API_KEY is not set");
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const model = env.AI_OPERATIONS_MODEL || "claude-opus-4-8";
  const imageSource = buildImageSource(imageUrl);

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    output_config: {
      format: { type: "json_schema", schema: DOCUMENT_OCR_JSON_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: imageSource },
          { type: "text", text: "Extract the document fields." },
        ],
      },
    ],
  } as Anthropic.MessageCreateParamsNonStreaming);

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!textBlock) {
    throw new Error("Document OCR returned no text content");
  }

  const parsed = JSON.parse(textBlock.text) as {
    doc_number: string | null;
    issue_date: string | null;
    expiry_date: string | null;
    country: string | null;
    authority: string | null;
    holder_name: string | null;
    confidence: number;
  };

  return {
    docNumber: parsed.doc_number,
    issueDate: parsed.issue_date,
    expiryDate: parsed.expiry_date,
    country: parsed.country,
    authority: parsed.authority,
    holderName: parsed.holder_name,
    confidence: parsed.confidence,
    provider: "claude",
    raw: parsed,
  };
}
