import Anthropic from "@anthropic-ai/sdk";
import { getGeocodingClient, getDirectionsClient, isMapboxConfigured } from "../mapbox";
import { env } from "../env";
import { ROUTE_REQUIREMENT_CATEGORIES, type RouteRequirementCategory } from "@shared/schema";

export interface RouteWaypoint {
  address: string;
  lat: number;
  lng: number;
}

export interface VehicleProfile {
  vehicleType: string; // van, truck_7_5t, truck_12t, truck_40t
  vehicleWeightKg?: number;
  vehicleHeightCm?: number;
  vehicleAxles?: number;
  isAdr?: boolean;
}

export interface DetectedRequirement {
  category: RouteRequirementCategory;
  countryCode: string | null;
  title: string;
  description: string;
  severity: "info" | "warning" | "critical";
  isMandatory: boolean;
  estimatedCostEur: number;
}

export interface RouteAlternative {
  distanceKm: number;
  durationMinutes: number;
  geometry: unknown;
}

export interface RouteAnalysisResult {
  distanceKm: number;
  durationMinutes: number;
  geometry: unknown;
  countryCodes: string[];
  requirements: DetectedRequirement[];
  alternatives: RouteAlternative[];
}

const ROUTE_ANALYSIS_JSON_SCHEMA = {
  type: "object",
  properties: {
    requirements: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: { type: "string", enum: ROUTE_REQUIREMENT_CATEGORIES as unknown as string[] },
          country_code: { type: "string", description: "ISO 3166-1 alpha-2 in uppercase, or empty string if not country-specific" },
          title: { type: "string" },
          description: { type: "string" },
          severity: { type: "string", enum: ["info", "warning", "critical"] },
          is_mandatory: { type: "boolean" },
          estimated_cost_eur: { type: "number", description: "Best-effort estimate in EUR; 0 if there is no direct cost" },
        },
        required: ["category", "country_code", "title", "description", "severity", "is_mandatory", "estimated_cost_eur"],
        additionalProperties: false,
      },
    },
  },
  required: ["requirements"],
  additionalProperties: false,
};

async function fetchRouteGeometry(waypoints: RouteWaypoint[]): Promise<{ distanceKm: number; durationMinutes: number; geometry: unknown; coordinates: [number, number][]; alternatives: RouteAlternative[] }> {
  const response = await getDirectionsClient()
    .getDirections({
      profile: "driving",
      waypoints: waypoints.map((w) => ({ coordinates: [w.lng, w.lat] })),
      geometries: "geojson",
      overview: "full",
      // Only meaningful for 2-waypoint routes - Mapbox ignores it for multi-stop routes.
      alternatives: waypoints.length === 2,
    })
    .send();

  if (!response.body.routes?.length) {
    throw new Error("No route found between the provided waypoints");
  }

  const [primary, ...rest] = response.body.routes;
  return {
    distanceKm: Math.round((primary.distance / 1000) * 10) / 10,
    durationMinutes: Math.round(primary.duration / 60),
    geometry: primary.geometry,
    coordinates: primary.geometry.coordinates as [number, number][],
    alternatives: rest.map((r: { distance: number; duration: number; geometry: unknown }) => ({
      distanceKm: Math.round((r.distance / 1000) * 10) / 10,
      durationMinutes: Math.round(r.duration / 60),
      geometry: r.geometry,
    })),
  };
}

// Samples evenly-spaced points along the route geometry and reverse-geocodes each one
// via Mapbox to build an ordered, deduplicated list of countries the route crosses.
// This stays entirely inside the app's existing Mapbox dependency - no external sites.
async function detectCountrySequence(coordinates: [number, number][]): Promise<string[]> {
  if (coordinates.length === 0) return [];

  const SAMPLE_COUNT = Math.min(15, Math.max(3, Math.ceil(coordinates.length / 200)));
  const step = Math.max(1, Math.floor(coordinates.length / SAMPLE_COUNT));
  const sampleIndexes = new Set<number>([0, coordinates.length - 1]);
  for (let i = 0; i < coordinates.length; i += step) {
    sampleIndexes.add(i);
  }

  const orderedIndexes = Array.from(sampleIndexes).sort((a, b) => a - b);

  const results = await Promise.all(
    orderedIndexes.map(async (idx) => {
      try {
        const [lng, lat] = coordinates[idx];
        const res = await getGeocodingClient()
          .reverseGeocode({ query: [lng, lat], types: ["country"], limit: 1 })
          .send();
        const feature = res.body.features?.[0];
        const code = feature?.properties?.short_code;
        return typeof code === "string" ? code.toUpperCase() : null;
      } catch {
        return null;
      }
    }),
  );

  const sequence: string[] = [];
  for (const code of results) {
    if (code && sequence[sequence.length - 1] !== code) {
      sequence.push(code);
    }
  }
  return sequence;
}

function getClaudeClient(): Anthropic {
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

async function detectRequirements(countryCodes: string[], vehicle: VehicleProfile, distanceKm: number): Promise<DetectedRequirement[]> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("Road Services AI route analysis is not configured: ANTHROPIC_API_KEY is not set");
  }
  if (countryCodes.length === 0) {
    return [];
  }

  const client = getClaudeClient();
  const model = env.ROAD_SERVICES_MODEL || "claude-opus-4-8";

  const vehicleDescription = [
    `type: ${vehicle.vehicleType}`,
    vehicle.vehicleWeightKg ? `weight: ${vehicle.vehicleWeightKg}kg` : null,
    vehicle.vehicleHeightCm ? `height: ${vehicle.vehicleHeightCm}cm` : null,
    vehicle.vehicleAxles ? `axles: ${vehicle.vehicleAxles}` : null,
    vehicle.isAdr ? "carrying ADR-classified dangerous goods" : null,
  ].filter(Boolean).join(", ");

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    system:
      "You are MoveX Road Intelligence, an expert on European road transport regulations: vignettes, " +
      "electronic tolls, ferries, low-emission zones (LEZ), environmental fees, truck driving bans, ADR " +
      "restrictions, height/weight/width limits, seasonal weather closures (e.g. Alpine passes), planned " +
      "road works, strikes and border-crossing delays. Given an ordered list of countries a commercial " +
      "vehicle will cross, and its profile, produce a complete, practical list of requirements the driver " +
      "must plan for before departure, ordered by country sequence. Be specific about which countries " +
      "require paid vignettes/e-tolls for this vehicle class (e.g. Austria, Czechia, Slovakia, Slovenia, " +
      "Hungary, Romania, Bulgaria, Switzerland, Germany's LKW-Maut, France/Italy/Spain/Poland/Croatia " +
      "distance tolls). Only include weather/closure/strike items when genuinely relevant to the route's " +
      "geography (e.g. Alpine or Balkan mountain passes) - do not invent generic warnings. Respond only " +
      "via the provided JSON schema.",
    output_config: {
      format: { type: "json_schema", schema: ROUTE_ANALYSIS_JSON_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content:
          `Route countries in order: ${countryCodes.join(" -> ")}\n` +
          `Total distance: ${distanceKm} km\n` +
          `Vehicle profile: ${vehicleDescription}`,
      },
    ],
  } as Anthropic.MessageCreateParamsNonStreaming);

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!textBlock) {
    throw new Error("Route analysis returned no text content");
  }

  const parsed = JSON.parse(textBlock.text) as {
    requirements: Array<{
      category: string;
      country_code: string;
      title: string;
      description: string;
      severity: "info" | "warning" | "critical";
      is_mandatory: boolean;
      estimated_cost_eur: number;
    }>;
  };

  return parsed.requirements.map((r) => ({
    category: r.category as RouteRequirementCategory,
    countryCode: r.country_code ? r.country_code.toUpperCase() : null,
    title: r.title,
    description: r.description,
    severity: r.severity,
    isMandatory: r.is_mandatory,
    estimatedCostEur: r.estimated_cost_eur,
  }));
}

export async function analyzeRoute(waypoints: RouteWaypoint[], vehicle: VehicleProfile): Promise<RouteAnalysisResult> {
  if (!isMapboxConfigured()) {
    throw new Error("Route analysis is not configured: MAPBOX_TOKEN is not set");
  }
  const { distanceKm, durationMinutes, geometry, coordinates, alternatives } = await fetchRouteGeometry(waypoints);
  const countryCodes = await detectCountrySequence(coordinates);
  const requirements = await detectRequirements(countryCodes, vehicle, distanceKm);

  return { distanceKm, durationMinutes, geometry, countryCodes, requirements, alternatives };
}
