import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";
import type { RouteRequirement } from "@shared/schema";
import { calculateCostBreakdown } from "./costCalculator";

export interface AgentConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface AgentReply {
  reply: string;
  items: Array<{ title: string; category: string; priceEur: number }>;
  totalEur: number;
  offerPurchase: boolean;
}

const AGENT_JSON_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string", description: "Conversational reply to show the driver" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          category: { type: "string" },
          price_eur: { type: "number" },
        },
        required: ["title", "category", "price_eur"],
        additionalProperties: false,
      },
    },
    total_eur: { type: "number" },
    offer_purchase: { type: "boolean", description: "True when the reply should end with a one-click purchase offer" },
  },
  required: ["reply", "items", "total_eur", "offer_purchase"],
  additionalProperties: false,
};

function getClaudeClient(): Anthropic {
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

export function isRoadServicesAgentConfigured(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}

export async function getRoadServicesAgentReply(params: {
  requirements: Pick<RouteRequirement, "category" | "countryCode" | "title" | "description" | "isMandatory" | "estimatedCostEur">[];
  originAddress: string;
  destinationAddress: string;
  userMessage?: string;
  history?: AgentConversationTurn[];
}): Promise<AgentReply> {
  if (!isRoadServicesAgentConfigured()) {
    throw new Error("Road Services AI agent is not configured: ANTHROPIC_API_KEY is not set");
  }

  const breakdown = calculateCostBreakdown(params.requirements);
  const client = getClaudeClient();
  const model = env.ROAD_SERVICES_MODEL || "claude-opus-4-8";

  const requirementsSummary = breakdown.lines
    .map((l) => `- [${l.isMandatory ? "MANDATORY" : "optional"}] ${l.title} (${l.category}${l.countryCode ? `, ${l.countryCode}` : ""}): ~EUR ${l.estimatedCostEur.toFixed(2)}`)
    .join("\n") || "- No purchasable requirements detected for this route.";

  const history: Anthropic.MessageParam[] = (params.history ?? []).map((turn) => ({
    role: turn.role,
    content: turn.content,
  }));

  const userTurn = params.userMessage
    ?? "Summarize what I need for this trip and ask if I want to purchase everything now.";

  const response = await client.messages.create({
    model,
    max_tokens: 1536,
    system:
      "You are the MoveX Road Services Assistant, embedded in a logistics app for professional drivers. " +
      `The driver's route is from "${params.originAddress}" to "${params.destinationAddress}". ` +
      "Requirements already detected by MoveX AI Route Analysis for this trip:\n" +
      requirementsSummary +
      `\nEstimated total cost so far: EUR ${breakdown.totalEur.toFixed(2)} ` +
      `(mandatory: EUR ${breakdown.totalMandatoryEur.toFixed(2)}, optional: EUR ${breakdown.totalOptionalEur.toFixed(2)}).\n` +
      "Be concise and practical. When summarizing requirements, end with a clear total and an offer to " +
      "purchase everything in one click, e.g. \"Estimated total EUR 148. Would you like me to purchase everything?\" " +
      "Set offer_purchase to true whenever your reply ends with that kind of offer. The `items` array in your " +
      "structured response must always reflect the specific purchasable items you are currently discussing, " +
      "with prices matching the figures above. Respond only via the provided JSON schema.",
    output_config: {
      format: { type: "json_schema", schema: AGENT_JSON_SCHEMA },
    },
    messages: [...history, { role: "user", content: userTurn }],
  } as Anthropic.MessageCreateParamsNonStreaming);

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!textBlock) {
    throw new Error("Road Services agent returned no text content");
  }

  const parsed = JSON.parse(textBlock.text) as {
    reply: string;
    items: Array<{ title: string; category: string; price_eur: number }>;
    total_eur: number;
    offer_purchase: boolean;
  };

  return {
    reply: parsed.reply,
    items: parsed.items.map((i) => ({ title: i.title, category: i.category, priceEur: i.price_eur })),
    totalEur: parsed.total_eur,
    offerPurchase: parsed.offer_purchase,
  };
}
