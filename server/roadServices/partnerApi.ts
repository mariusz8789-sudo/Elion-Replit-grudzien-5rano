import { Router, type Request, type Response, type NextFunction } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import * as yaml from "js-yaml";
import fs from "fs";
import path from "path";
import { storage } from "../storage";
import { hashApiKey } from "../lib/crypto";
import * as roadStorage from "./storage";

// Public Road Services Partner API - reuses the existing companies/apiKeys/webhookSubscriptions
// infrastructure from server/partnerApi.ts (via storage.getApiKeyByHash / storage.touchApiKeyUsage)
// rather than duplicating API-key auth. A Road Services partner authenticates exactly like a
// core Partner API integrator; scopes gate which endpoints their key can call.
export const roadServicesPartnerApi = Router();

interface RoadServicePartnerRequest extends Request {
  partnerCompanyId?: string;
  partnerScopes?: string[];
}

const roadServicesPartnerRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.header("x-api-key")?.toString() || ipKeyGenerator(req.ip || "unknown"),
  message: { message: "Rate limit exceeded. Max 120 requests per minute per API key." },
});

async function requireApiKey(req: RoadServicePartnerRequest, res: Response, next: NextFunction) {
  const rawKey = req.header("x-api-key");
  if (!rawKey) {
    return res.status(401).json({ message: "Missing x-api-key header" });
  }
  const apiKey = await storage.getApiKeyByHash(hashApiKey(rawKey));
  if (!apiKey) {
    return res.status(401).json({ message: "Invalid or revoked API key" });
  }
  req.partnerCompanyId = apiKey.companyId;
  req.partnerScopes = apiKey.scopes ?? [];
  storage.touchApiKeyUsage(apiKey.id).catch(() => undefined);
  next();
}

function requireScope(scope: string) {
  return (req: RoadServicePartnerRequest, res: Response, next: NextFunction) => {
    if (!req.partnerScopes?.includes(scope)) {
      return res.status(403).json({ message: `Missing required scope: ${scope}` });
    }
    next();
  };
}

async function requirePartnerProfile(req: RoadServicePartnerRequest, res: Response): Promise<import("@shared/schema").RoadServicePartnerProfile | undefined> {
  const profile = await roadStorage.getPartnerProfileByCompanyId(req.partnerCompanyId!);
  if (!profile) {
    res.status(404).json({ message: "No Road Services partner profile for this company" });
    return undefined;
  }
  return profile;
}

roadServicesPartnerApi.use(roadServicesPartnerRateLimiter);

roadServicesPartnerApi.get("/products", requireApiKey, requireScope("road-services:products:read"), async (req: RoadServicePartnerRequest, res: Response) => {
  const profile = await requirePartnerProfile(req, res);
  if (!profile) return;
  const products = await roadStorage.listPartnerProducts(profile.id);
  res.json({ data: products });
});

roadServicesPartnerApi.post("/products", requireApiKey, requireScope("road-services:products:write"), async (req: RoadServicePartnerRequest, res: Response) => {
  const profile = await requirePartnerProfile(req, res);
  if (!profile) return;
  if (profile.status !== "active") {
    return res.status(403).json({ message: "Partner profile is not yet active" });
  }
  try {
    const { category, countryCode, name, description, vehicleTypes, priceEur, durationDays } = req.body;
    const product = await roadStorage.createProduct({
      partnerId: profile.id,
      category,
      countryCode: countryCode ?? null,
      name,
      description: description ?? null,
      vehicleTypes: vehicleTypes ?? [],
      priceEur: String(priceEur),
      durationDays: durationDays ?? null,
      active: true,
      metadata: null,
    });
    res.status(201).json({ data: product });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

roadServicesPartnerApi.patch("/products/:id", requireApiKey, requireScope("road-services:products:write"), async (req: RoadServicePartnerRequest, res: Response) => {
  const profile = await requirePartnerProfile(req, res);
  if (!profile) return;
  const updated = await roadStorage.updateProduct(req.params.id, profile.id, req.body);
  if (!updated) return res.status(404).json({ message: "Product not found" });
  res.json({ data: updated });
});

roadServicesPartnerApi.get("/orders", requireApiKey, requireScope("road-services:orders:read"), async (req: RoadServicePartnerRequest, res: Response) => {
  const profile = await requirePartnerProfile(req, res);
  if (!profile) return;
  const orders = await roadStorage.getPartnerOrders(profile.id);
  res.json({ data: orders });
});

roadServicesPartnerApi.get("/profile", requireApiKey, requireScope("road-services:profile:read"), async (req: RoadServicePartnerRequest, res: Response) => {
  const profile = await requirePartnerProfile(req, res);
  if (!profile) return;
  res.json({ data: profile });
});

// === OpenAPI documentation ===
const openApiPath = path.resolve(import.meta.dirname, "..", "..", "docs", "road-services-partner-api-openapi.yaml");
let openApiSpec: object = {};
try {
  openApiSpec = yaml.load(fs.readFileSync(openApiPath, "utf-8")) as object;
} catch {
  openApiSpec = { openapi: "3.0.3", info: { title: "MoveX Road Services Partner API", version: "1.0.0" }, paths: {} };
}

roadServicesPartnerApi.get("/openapi.json", (_req, res) => res.json(openApiSpec));
roadServicesPartnerApi.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));
