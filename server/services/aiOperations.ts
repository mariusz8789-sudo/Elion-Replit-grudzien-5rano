import Anthropic from "@anthropic-ai/sdk";
import { env } from "../env";
import { storage } from "../storage";
import { AI_ACTIONS } from "./aiActions";

// MoveX AI Operations: one generalized, role-parameterized assistant endpoint rather than eight
// separate agent implementations. Each role gets its own system prompt grounded in this
// company's real data (pulled from the existing storage layer, never fabricated), and all roles
// share the same Anthropic call pattern already established by the Road Services agent and the
// translation/cargo-recognition services. The Road Services Assistant itself is NOT duplicated
// here - it stays in server/roadServices/agent.ts and is linked from the roles catalog instead.

export type AiOperationsRole =
  | "dispatcher"
  | "fleet_manager"
  | "warehouse_manager"
  | "hr_manager"
  | "customer_support"
  | "route_optimization"
  | "crew_planning"
  | "sustainability_advisor";

export interface AiOperationsRoleInfo {
  id: AiOperationsRole | "road_services";
  label: string;
  description: string;
  external?: boolean; // true = handled by an existing, separate endpoint (not this one)
}

export const AI_OPERATIONS_ROLES: AiOperationsRoleInfo[] = [
  { id: "dispatcher", label: "Dispatcher", description: "Assigns drivers/vehicles to open bookings and flags unassigned jobs" },
  { id: "fleet_manager", label: "Fleet Manager", description: "Advises on vehicle availability and utilization" },
  { id: "warehouse_manager", label: "Warehouse Manager", description: "Advises on shared warehouse/storage resource listings" },
  { id: "hr_manager", label: "HR Manager", description: "Advises on crew availability, ratings and staffing gaps" },
  { id: "customer_support", label: "Customer Support", description: "Drafts responses to customers using real booking/customer history" },
  { id: "route_optimization", label: "Route Optimization", description: "Advises on spare-capacity postings and route efficiency" },
  { id: "crew_planning", label: "Crew Planning", description: "Advises on crew composition for upcoming jobs" },
  { id: "sustainability_advisor", label: "Sustainability Advisor", description: "Advises on CO2 savings and Green MoveX opportunities" },
  { id: "road_services", label: "Road Services Assistant", description: "Trip requirements & purchases for a specific route", external: true },
];

export interface AiOperationsTurn { role: "user" | "assistant"; content: string }

export interface AiProposedAction {
  actionType: string;
  params: Record<string, unknown>;
  description: string;
}

export interface AiOperationsReply {
  reply: string;
  proposedAction?: AiProposedAction;
}

// Only these roles get real, bounded write-actions (assign_driver, set_vehicle_availability) -
// every other role stays advisory. The model is only ever offered the action types listed here,
// and execution (see aiActions.ts) independently re-verifies ownership - the role gate here is
// a prompt-shaping convenience, not the security boundary.
const ROLE_ACTIONS: Partial<Record<AiOperationsRole, string[]>> = {
  dispatcher: ["assign_driver"],
  fleet_manager: ["set_vehicle_availability"],
};

const REPLY_JSON_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string", description: "Concise, practical reply for the company operator" },
    proposed_action: {
      type: ["object", "null"],
      description: "Set only when a concrete, user-confirmable action is warranted using real IDs from the data provided - otherwise null",
      properties: {
        action_type: { type: "string" },
        params: { type: "object" },
        description: { type: "string", description: "Plain-language summary of what this action will do, shown to the user before they confirm" },
      },
      required: ["action_type", "params", "description"],
      additionalProperties: false,
    },
  },
  required: ["reply", "proposed_action"],
  additionalProperties: false,
};

function isValidRole(role: string): role is AiOperationsRole {
  return AI_OPERATIONS_ROLES.some((r) => r.id === role && !r.external);
}

export function isAiOperationsConfigured(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}

function getClaudeClient(): Anthropic {
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

const ROLE_PERSONAS: Record<AiOperationsRole, string> = {
  dispatcher: "You are the MoveX Dispatcher Assistant. Help the operator decide which unassigned bookings need a driver/vehicle next, prioritizing by pickup date.",
  fleet_manager: "You are the MoveX Fleet Manager Assistant. Help the operator understand vehicle availability and utilization, and suggest when to add or free up capacity.",
  warehouse_manager: "You are the MoveX Warehouse Manager Assistant. Help the operator manage their shared warehouse/storage listings on WorkShare.",
  hr_manager: "You are the MoveX HR Manager Assistant. Help the operator understand crew availability, ratings, and where staffing may be thin.",
  customer_support: "You are the MoveX Customer Support Assistant. Help the operator draft a helpful, accurate reply grounded only in the real customer data provided - never invent order details.",
  route_optimization: "You are the MoveX Route Optimization Assistant. Help the operator use spare-capacity postings and fleet data to reduce empty kilometres.",
  crew_planning: "You are the MoveX Crew Planning Assistant. Help the operator think through crew composition for upcoming jobs using real worker availability.",
  sustainability_advisor: "You are the MoveX Sustainability Advisor. Help the operator understand their CO2 footprint and savings, and suggest realistic Green MoveX actions.",
};

async function buildContext(role: AiOperationsRole, companyId: string): Promise<string> {
  const dashboard = await storage.getCompanyEnterpriseDashboard(companyId);
  const lines: string[] = [
    `Crew: ${dashboard.crew.totalWorkers} total, ${dashboard.crew.availableWorkers} available (${dashboard.crew.utilizationRate}% utilization), avg rating ${dashboard.crew.avgRating}.`,
    `Fleet: ${dashboard.fleet.totalVehicles} vehicles, ${dashboard.fleet.availableVehicles} available, ${dashboard.fleet.vehiclesInActiveUse} in active use (${dashboard.fleet.utilizationRate}% utilization).`,
  ];

  switch (role) {
    case "dispatcher": {
      const unassigned = await storage.getCompanyUnassignedBookings(companyId);
      lines.push(`Unassigned accepted bookings needing a driver: ${unassigned.length}.`);
      unassigned.slice(0, 10).forEach((b) => {
        lines.push(`- Booking ${b.id.slice(0, 8)}: ${b.pickupAddress} -> ${b.deliveryAddress}, pickup ${new Date(b.pickupDate).toISOString().slice(0, 10)}`);
      });
      break;
    }
    case "fleet_manager": {
      // Base crew/fleet lines above already cover this role's core context.
      break;
    }
    case "warehouse_manager": {
      const resources = await storage.getCompanyResourceSharing(companyId);
      const warehouses = resources.filter((r) => r.resourceType === "warehouse");
      lines.push(`Warehouse/storage listings: ${warehouses.length} total, ${warehouses.filter((w) => w.status === "available").length} currently available.`);
      warehouses.slice(0, 10).forEach((w) => {
        lines.push(`- "${w.title}" (${w.location ?? "no location"}, ${w.capacity ?? "capacity unspecified"}) - status: ${w.status}`);
      });
      break;
    }
    case "hr_manager": {
      const crew = await storage.getCompanyWorkerProfiles(companyId);
      lines.push(`Crew profiles: ${crew.length}.`);
      crew.slice(0, 10).forEach((w) => {
        lines.push(`- Worker ${w.id.slice(0, 8)}: ${w.available ? "available" : "unavailable"}, ${w.completedJobs ?? 0} completed jobs, rating ${w.rating}`);
      });
      break;
    }
    case "customer_support": {
      lines.push(`Top customers by lifetime spend: ${dashboard.customerLifetimeValue.topCustomers.map((c) => `${c.name} (EUR ${c.totalSpentEur}, ${c.bookingsCount} bookings)`).join("; ") || "none yet"}.`);
      break;
    }
    case "route_optimization": {
      const postings = await storage.getCompanyCapacityPostings(companyId);
      const open = postings.filter((p) => p.status === "open" || p.status === undefined);
      lines.push(`Spare-capacity postings: ${postings.length} total, ${open.length} currently open.`);
      open.slice(0, 10).forEach((p) => {
        lines.push(`- ${p.fromAddress} -> ${p.toAddress}, free ${p.freeVolumeM3 ?? "?"}m3 / ${p.freePalletSpaces ?? "?"} pallets`);
      });
      break;
    }
    case "crew_planning": {
      const crew = await storage.getCompanyWorkerProfiles(companyId);
      lines.push(`Crew: ${crew.length} profiles, ${crew.filter((w) => w.available).length} available for new assignments.`);
      break;
    }
    case "sustainability_advisor": {
      lines.push(`CO2: ${dashboard.environmental.totalTrips} trips, ${dashboard.environmental.totalCo2Kg.toFixed(1)}kg emitted, ${dashboard.environmental.totalCo2SavedKg.toFixed(1)}kg saved vs. baseline.`);
      break;
    }
  }

  return lines.join("\n");
}

export async function getAiOperationsReply(params: {
  role: string;
  companyId: string;
  userMessage: string;
  history?: AiOperationsTurn[];
}): Promise<AiOperationsReply> {
  if (!isAiOperationsConfigured()) {
    throw new Error("MoveX AI Operations is not configured: ANTHROPIC_API_KEY is not set");
  }
  if (!isValidRole(params.role)) {
    throw new Error(`Unknown AI Operations role: ${params.role}`);
  }

  const context = await buildContext(params.role, params.companyId);
  const client = getClaudeClient();
  const model = env.AI_OPERATIONS_MODEL || "claude-opus-4-8";

  const history: Anthropic.MessageParam[] = (params.history ?? []).map((turn) => ({ role: turn.role, content: turn.content }));

  const availableActionTypes = ROLE_ACTIONS[params.role] ?? [];
  const actionsBlock = availableActionTypes.length > 0
    ? "\n\nYou may propose ONE of these actions when it directly helps, using only real IDs from the data above " +
      "(never invent an ID) - leave proposed_action null otherwise:\n" +
      availableActionTypes.map((type) => `- ${type}: ${AI_ACTIONS[type].description} (params: ${JSON.stringify(Object.keys((AI_ACTIONS[type].paramsSchema as any).shape ?? {}))})`).join("\n") +
      "\nA proposed action is only ever shown to the operator for them to confirm - it is never executed automatically."
    : "\n\nThis role has no available actions - always leave proposed_action null.";

  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system:
      `${ROLE_PERSONAS[params.role]}\n\nReal, current data for this company:\n${context}${actionsBlock}\n\n` +
      "Only use the data above - never invent bookings, workers, vehicles or figures. Be concise and practical. Respond only via the provided JSON schema.",
    output_config: {
      format: { type: "json_schema", schema: REPLY_JSON_SCHEMA },
    },
    messages: [...history, { role: "user", content: params.userMessage }],
  } as Anthropic.MessageCreateParamsNonStreaming);

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!textBlock) {
    throw new Error("AI Operations assistant returned no text content");
  }

  const parsed = JSON.parse(textBlock.text) as {
    reply: string;
    proposed_action: { action_type: string; params: Record<string, unknown>; description: string } | null;
  };

  return {
    reply: parsed.reply,
    proposedAction: parsed.proposed_action && availableActionTypes.includes(parsed.proposed_action.action_type)
      ? { actionType: parsed.proposed_action.action_type, params: parsed.proposed_action.params, description: parsed.proposed_action.description }
      : undefined,
  };
}
