import { env } from "../env";
import type { RoadServiceCategory } from "@shared/schema";

// Production-ready HTTP provider abstraction for the seven MoveX Road Services
// categories. Real commercial contracts (ASFINAG, DKV, Telepass, etc.) are
// integrated by pointing the category's *_PROVIDER_API_URL/*_PROVIDER_API_KEY
// env vars at the partner's REST API - no code changes required. Until a
// contract exists for a category, isConfigured() is false and callers fall
// back to the internal partner marketplace catalog (real DB-backed products
// listed by onboarded Road Services partners), never to fabricated data.

export interface ExternalProduct {
  externalId: string;
  category: RoadServiceCategory;
  countryCode?: string;
  name: string;
  description?: string;
  priceEur: number;
  durationDays?: number;
  vehicleTypes?: string[];
}

export interface ExternalPurchaseResult {
  externalReference: string;
  status: "confirmed" | "pending" | "failed";
  raw?: unknown;
}

export interface RoadServiceExternalProvider {
  readonly category: RoadServiceCategory;
  isConfigured(): boolean;
  listProducts(params: { countryCode?: string; vehicleType?: string }): Promise<ExternalProduct[]>;
  purchase(params: { externalProductId: string; vehicleType: string; quantity: number }): Promise<ExternalPurchaseResult>;
}

const CREDENTIAL_KEYS: Record<RoadServiceCategory, { url: keyof typeof env; key: keyof typeof env }> = {
  vignette: { url: "VIGNETTE_PROVIDER_API_URL", key: "VIGNETTE_PROVIDER_API_KEY" },
  toll: { url: "TOLL_PROVIDER_API_URL", key: "TOLL_PROVIDER_API_KEY" },
  ferry: { url: "FERRY_PROVIDER_API_URL", key: "FERRY_PROVIDER_API_KEY" },
  parking: { url: "PARKING_PROVIDER_API_URL", key: "PARKING_PROVIDER_API_KEY" },
  fuel: { url: "FUEL_PROVIDER_API_URL", key: "FUEL_PROVIDER_API_KEY" },
  insurance: { url: "INSURANCE_PROVIDER_API_URL", key: "INSURANCE_PROVIDER_API_KEY" },
  driver_service: { url: "DRIVER_SERVICE_PROVIDER_API_URL", key: "DRIVER_SERVICE_PROVIDER_API_KEY" },
};

function credentialsFor(category: RoadServiceCategory): { baseUrl: string; apiKey: string } {
  const keys = CREDENTIAL_KEYS[category];
  return { baseUrl: String(env[keys.url] ?? ""), apiKey: String(env[keys.key] ?? "") };
}

class HttpRoadServiceProvider implements RoadServiceExternalProvider {
  constructor(readonly category: RoadServiceCategory) {}

  isConfigured(): boolean {
    const { baseUrl, apiKey } = credentialsFor(this.category);
    return Boolean(baseUrl && apiKey);
  }

  async listProducts(params: { countryCode?: string; vehicleType?: string }): Promise<ExternalProduct[]> {
    const { baseUrl, apiKey } = credentialsFor(this.category);
    if (!baseUrl || !apiKey) {
      throw new Error(`Road Services provider for "${this.category}" is not configured`);
    }
    const url = new URL("/v1/products", baseUrl);
    if (params.countryCode) url.searchParams.set("country", params.countryCode);
    if (params.vehicleType) url.searchParams.set("vehicleType", params.vehicleType);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Road Services provider "${this.category}" listProducts failed: HTTP ${response.status}`);
    }
    const data = (await response.json()) as { products?: Array<Record<string, unknown>> };
    return (data.products ?? []).map((p) => ({
      externalId: String(p.id ?? p.externalId ?? ""),
      category: this.category,
      countryCode: typeof p.countryCode === "string" ? p.countryCode : undefined,
      name: String(p.name ?? ""),
      description: typeof p.description === "string" ? p.description : undefined,
      priceEur: Number(p.priceEur ?? p.price ?? 0),
      durationDays: typeof p.durationDays === "number" ? p.durationDays : undefined,
      vehicleTypes: Array.isArray(p.vehicleTypes) ? (p.vehicleTypes as string[]) : undefined,
    }));
  }

  async purchase(params: { externalProductId: string; vehicleType: string; quantity: number }): Promise<ExternalPurchaseResult> {
    const { baseUrl, apiKey } = credentialsFor(this.category);
    if (!baseUrl || !apiKey) {
      throw new Error(`Road Services provider for "${this.category}" is not configured`);
    }
    const url = new URL("/v1/purchases", baseUrl);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        productId: params.externalProductId,
        vehicleType: params.vehicleType,
        quantity: params.quantity,
      }),
    });
    if (!response.ok) {
      return { externalReference: "", status: "failed", raw: await response.text().catch(() => undefined) };
    }
    const data = (await response.json()) as { reference?: string; status?: string };
    return {
      externalReference: data.reference ?? "",
      status: data.status === "confirmed" || data.status === "pending" ? data.status : "confirmed",
      raw: data,
    };
  }
}

const providers = new Map<RoadServiceCategory, RoadServiceExternalProvider>();

export function getRoadServiceProvider(category: RoadServiceCategory): RoadServiceExternalProvider {
  let provider = providers.get(category);
  if (!provider) {
    provider = new HttpRoadServiceProvider(category);
    providers.set(category, provider);
  }
  return provider;
}
