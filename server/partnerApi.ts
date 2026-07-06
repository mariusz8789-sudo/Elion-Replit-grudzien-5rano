import { Router, type Request, type Response, type NextFunction } from "express";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import swaggerUi from "swagger-ui-express";
import yaml from "js-yaml";
import fs from "fs";
import path from "path";
import { storage } from "./storage";
import { generateApiKey, hashApiKey } from "./lib/crypto";
import { assertPublicHttpUrl } from "./lib/urlSafety";
import { env } from "./env";

export const partnerApi = Router();

interface PartnerRequest extends Request {
  partnerCompanyId?: string;
  partnerScopes?: string[];
}

// === Rate limiting: per API key, generous but bounded for automated integrations ===
const partnerRateLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.header("x-api-key") || req.ip || "unknown").toString(),
  message: { message: "Rate limit exceeded. Max 120 requests per minute per API key." },
});

// === API key authentication middleware ===
async function requireApiKey(req: PartnerRequest, res: Response, next: NextFunction) {
  const rawKey = req.header("x-api-key");
  if (!rawKey) {
    return res.status(401).json({ message: "Missing x-api-key header" });
  }

  const keyHash = hashApiKey(rawKey);
  const apiKey = await storage.getApiKeyByHash(keyHash);
  if (!apiKey) {
    return res.status(401).json({ message: "Invalid or revoked API key" });
  }

  req.partnerCompanyId = apiKey.companyId;
  req.partnerScopes = apiKey.scopes ?? [];
  storage.touchApiKeyUsage(apiKey.id).catch(() => undefined);
  next();
}

function requireScope(scope: string) {
  return (req: PartnerRequest, res: Response, next: NextFunction) => {
    if (!req.partnerScopes?.includes(scope)) {
      return res.status(403).json({ message: `Missing required scope: ${scope}` });
    }
    next();
  };
}

partnerApi.use(partnerRateLimiter);

// === OAuth2-style client-credentials JWT exchange ===
// Partners exchange their API key for a short-lived JWT, matching standard OAuth2
// client-credentials flow while keeping the long-lived secret (the API key) off the wire
// on every request.
partnerApi.post("/oauth/token", async (req, res) => {
  const rawKey = req.body?.api_key || req.header("x-api-key");
  if (!rawKey) {
    return res.status(400).json({ error: "invalid_request", error_description: "api_key is required" });
  }
  if (!env.PARTNER_JWT_SECRET) {
    return res.status(503).json({ error: "temporarily_unavailable", error_description: "Partner JWT auth is not configured" });
  }

  const apiKey = await storage.getApiKeyByHash(hashApiKey(rawKey));
  if (!apiKey) {
    return res.status(401).json({ error: "invalid_client", error_description: "Invalid or revoked API key" });
  }

  const token = jwt.sign(
    { companyId: apiKey.companyId, scopes: apiKey.scopes, keyId: apiKey.id },
    env.PARTNER_JWT_SECRET,
    { expiresIn: "1h" },
  );

  res.json({ access_token: token, token_type: "Bearer", expires_in: 3600 });
});

// === JWT bearer auth (alternative to x-api-key for the same endpoints) ===
partnerApi.use((req: PartnerRequest, res, next) => {
  const auth = req.header("authorization");
  if (auth?.startsWith("Bearer ") && env.PARTNER_JWT_SECRET) {
    try {
      const payload = jwt.verify(auth.slice(7), env.PARTNER_JWT_SECRET) as any;
      req.partnerCompanyId = payload.companyId;
      req.partnerScopes = payload.scopes ?? [];
      return next();
    } catch {
      return res.status(401).json({ message: "Invalid or expired bearer token" });
    }
  }
  next();
});

// === ERP/CRM integration endpoints ===
partnerApi.get("/bookings", requireApiKey, requireScope("bookings:read"), async (req: PartnerRequest, res) => {
  const companyBookings = await storage.getCompanyBookings(req.partnerCompanyId!);
  res.json({ data: companyBookings });
});

partnerApi.get("/bookings/:id", requireApiKey, requireScope("bookings:read"), async (req: PartnerRequest, res) => {
  const booking = await storage.getBooking(req.params.id);
  if (!booking || booking.companyId !== req.partnerCompanyId) {
    return res.status(404).json({ message: "Booking not found" });
  }
  res.json({ data: booking });
});

partnerApi.patch("/bookings/:id/status", requireApiKey, requireScope("bookings:write"), async (req: PartnerRequest, res) => {
  const booking = await storage.getBooking(req.params.id);
  if (!booking || booking.companyId !== req.partnerCompanyId) {
    return res.status(404).json({ message: "Booking not found" });
  }
  const { status } = req.body;
  if (!status) return res.status(400).json({ message: "status is required" });
  const updated = await storage.updateBookingStatus(req.params.id, status);
  res.json({ data: updated });
});

partnerApi.get("/company", requireApiKey, requireScope("company:read"), async (req: PartnerRequest, res) => {
  const company = await storage.getCompany(req.partnerCompanyId!);
  if (!company) return res.status(404).json({ message: "Company not found" });
  const { ...safeCompany } = company;
  res.json({ data: safeCompany });
});

// === Webhook subscription management ===
partnerApi.post("/webhooks", requireApiKey, requireScope("webhooks:manage"), async (req: PartnerRequest, res) => {
  try {
    const { url, events } = req.body;
    if (!url || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ message: "url and a non-empty events array are required" });
    }
    await assertPublicHttpUrl(url);
    const secret = generateApiKey().rawKey;
    const sub = await storage.createWebhookSubscription(
      { companyId: req.partnerCompanyId!, url, events },
      secret,
    );
    res.status(201).json({ data: { ...sub, secret } });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

partnerApi.get("/webhooks", requireApiKey, requireScope("webhooks:manage"), async (req: PartnerRequest, res) => {
  const subs = await storage.getCompanyWebhookSubscriptions(req.partnerCompanyId!);
  res.json({ data: subs.map(({ secret: _secret, ...rest }) => rest) });
});

partnerApi.delete("/webhooks/:id", requireApiKey, requireScope("webhooks:manage"), async (req: PartnerRequest, res) => {
  const deleted = await storage.deleteWebhookSubscription(req.params.id, req.partnerCompanyId!);
  if (!deleted) return res.status(404).json({ message: "Webhook subscription not found" });
  res.status(204).send();
});

// === OpenAPI documentation ===
const openApiPath = path.resolve(import.meta.dirname, "..", "docs", "partner-api-openapi.yaml");
let openApiSpec: object = {};
try {
  openApiSpec = yaml.load(fs.readFileSync(openApiPath, "utf-8")) as object;
} catch {
  openApiSpec = { openapi: "3.0.3", info: { title: "Point to Point Partner API", version: "1.0.0" }, paths: {} };
}

partnerApi.get("/openapi.json", (_req, res) => res.json(openApiSpec));
partnerApi.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));
