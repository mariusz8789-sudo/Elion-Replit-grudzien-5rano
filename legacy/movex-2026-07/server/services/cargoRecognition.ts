import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";

export interface CargoRecognitionResult {
  detectedLabel: string;
  category: "furniture" | "appliance" | "box" | "fragile_item" | "other";
  estimatedLengthCm: number;
  estimatedWidthCm: number;
  estimatedHeightCm: number;
  estimatedVolumeM3: number;
  estimatedWeightKg: number;
  fragile: boolean;
  suggestedVehicleType: string;
  confidence: number;
  provider: string;
  raw: unknown;
}

export interface CargoRecognitionProvider {
  isConfigured(): boolean;
  analyzeImage(imageUrl: string): Promise<CargoRecognitionResult>;
}

const CARGO_JSON_SCHEMA = {
  type: "object",
  properties: {
    detected_label: { type: "string", description: "Short name of the primary item, e.g. 'three-seat sofa'" },
    category: { type: "string", enum: ["furniture", "appliance", "box", "fragile_item", "other"] },
    estimated_length_cm: { type: "number" },
    estimated_width_cm: { type: "number" },
    estimated_height_cm: { type: "number" },
    estimated_weight_kg: { type: "number" },
    fragile: { type: "boolean" },
    suggested_vehicle_type: {
      type: "string",
      description: "One of: small_van, medium_van, luton_van, box_truck, flatbed_truck",
    },
    confidence: { type: "number", description: "0 to 1" },
  },
  required: [
    "detected_label",
    "category",
    "estimated_length_cm",
    "estimated_width_cm",
    "estimated_height_cm",
    "estimated_weight_kg",
    "fragile",
    "suggested_vehicle_type",
    "confidence",
  ],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You are a cargo-assessment assistant for a moving and logistics platform. Given a photo of a
single item to be moved, identify the item and estimate its physical dimensions, weight, and whether it is fragile,
then suggest the smallest vehicle type that could transport it. Base estimates on typical real-world sizes for the
item type you recognize. Respond only via the provided JSON schema.`;

class ClaudeCargoRecognitionProvider implements CargoRecognitionProvider {
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

  private buildImageSource(imageUrl: string): { type: "url"; url: string } | { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string } {
    const dataUrlMatch = imageUrl.match(/^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/);
    if (dataUrlMatch) {
      return { type: "base64", media_type: dataUrlMatch[1] as any, data: dataUrlMatch[2] };
    }
    return { type: "url", url: imageUrl };
  }

  async analyzeImage(imageUrl: string): Promise<CargoRecognitionResult> {
    if (!this.isConfigured()) {
      throw new Error("Cargo recognition is not configured: ANTHROPIC_API_KEY is not set");
    }

    const client = this.getClient();
    const model = process.env.CARGO_RECOGNITION_MODEL || "claude-opus-4-8";

    const imageSource = this.buildImageSource(imageUrl);

    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      output_config: {
        format: { type: "json_schema", schema: CARGO_JSON_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: imageSource },
            { type: "text", text: "Identify this item and estimate its shipping specs." },
          ],
        },
      ],
    } as Anthropic.MessageCreateParamsNonStreaming);

    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    if (!textBlock) {
      throw new Error("Cargo recognition returned no text content");
    }

    const parsed = JSON.parse(textBlock.text) as {
      detected_label: string;
      category: CargoRecognitionResult["category"];
      estimated_length_cm: number;
      estimated_width_cm: number;
      estimated_height_cm: number;
      estimated_weight_kg: number;
      fragile: boolean;
      suggested_vehicle_type: string;
      confidence: number;
    };

    const volumeM3 =
      (parsed.estimated_length_cm * parsed.estimated_width_cm * parsed.estimated_height_cm) / 1_000_000;

    return {
      detectedLabel: parsed.detected_label,
      category: parsed.category,
      estimatedLengthCm: parsed.estimated_length_cm,
      estimatedWidthCm: parsed.estimated_width_cm,
      estimatedHeightCm: parsed.estimated_height_cm,
      estimatedVolumeM3: Number(volumeM3.toFixed(3)),
      estimatedWeightKg: parsed.estimated_weight_kg,
      fragile: parsed.fragile,
      suggestedVehicleType: parsed.suggested_vehicle_type,
      confidence: parsed.confidence,
      provider: "claude",
      raw: parsed,
    };
  }
}

const provider = new ClaudeCargoRecognitionProvider();

export function getCargoRecognitionProvider(): CargoRecognitionProvider {
  return provider;
}
