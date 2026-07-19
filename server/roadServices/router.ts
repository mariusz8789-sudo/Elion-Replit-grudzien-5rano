import { Router, type Request, type Response } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { User } from "@shared/schema";
import { requireAuth, requireAdmin } from "../lib/authMiddleware";
import { getStripe, isStripeConfigured } from "../stripe";
import * as roadStorage from "./storage";
import { analyzeRoute, type RouteWaypoint } from "./routeAnalysis";
import { calculateTripCostSummary, estimateFuelCostEur } from "./costCalculator";
import { recommendAllStrategies, type RouteCandidate } from "./recommendationEngine";
import { calculateOrderPricing } from "./commission";
import { getRoadServicesAgentReply, isRoadServicesAgentConfigured } from "./agent";
import { getRoadServiceProvider } from "./providers";
import { getRevenueSummary } from "./storage";

export const roadServicesRouter = Router();

// AI route analysis and the conversational agent both call the paid Anthropic API;
// keep this independent of and tighter than the general /api limiter, keyed per user.
const roadServicesAiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user as User | undefined)?.id || ipKeyGenerator(req.ip || "unknown"),
  message: { message: "Too many Road Services AI requests. Please try again in a minute." },
});

const DEFAULT_FUEL_PRICE_EUR = 1.65; // EUR/liter diesel, used only when no live fuel price is supplied

// === Route analysis ===
roadServicesRouter.post("/routes", requireAuth, roadServicesAiLimiter, async (req: Request, res: Response) => {
  try {
    const user = req.user as User;
    const { originAddress, destinationAddress, waypoints, vehicleType, vehicleWeightKg, vehicleHeightCm, vehicleAxles, isAdr, bookingId, fuelPriceEurPerLiter } = req.body as {
      originAddress: string;
      destinationAddress: string;
      waypoints: RouteWaypoint[];
      vehicleType?: string;
      vehicleWeightKg?: number;
      vehicleHeightCm?: number;
      vehicleAxles?: number;
      isAdr?: boolean;
      bookingId?: string;
      fuelPriceEurPerLiter?: number;
    };

    if (!originAddress || !destinationAddress || !Array.isArray(waypoints) || waypoints.length < 2) {
      return res.status(400).json({ message: "originAddress, destinationAddress and at least 2 waypoints are required" });
    }

    const route = await roadStorage.createRoute({
      userId: user.id,
      bookingId: bookingId ?? null,
      originAddress,
      destinationAddress,
      waypoints,
      vehicleType: vehicleType || "van",
      vehicleWeightKg: vehicleWeightKg ?? null,
      vehicleHeightCm: vehicleHeightCm ?? null,
      vehicleAxles: vehicleAxles ?? null,
      isAdr: Boolean(isAdr),
    });

    try {
      const analysis = await analyzeRoute(waypoints, {
        vehicleType: vehicleType || "van",
        vehicleWeightKg,
        vehicleHeightCm,
        vehicleAxles,
        isAdr,
      });

      await roadStorage.saveRouteAnalysis(route.id, {
        distanceKm: analysis.distanceKm,
        durationMinutes: analysis.durationMinutes,
        countryCodes: analysis.countryCodes,
        routeGeometry: analysis.geometry,
        status: "completed",
      });
      const requirements = await roadStorage.saveRequirements(route.id, analysis.requirements);

      const fuelPrice = fuelPriceEurPerLiter || DEFAULT_FUEL_PRICE_EUR;
      const costSummary = calculateTripCostSummary(requirements, analysis.distanceKm, vehicleType || "van", fuelPrice);

      const candidates: RouteCandidate[] = [
        {
          id: "primary",
          distanceKm: analysis.distanceKm,
          durationMinutes: analysis.durationMinutes,
          totalCostEur: costSummary.grandTotalEur,
          co2EstimateKg: costSummary.co2EstimateKg,
          criticalRequirementCount: requirements.filter((r) => r.severity === "critical").length,
        },
        ...analysis.alternatives.map((alt, idx) => {
          const altFuel = estimateFuelCostEur({ distanceKm: alt.distanceKm, vehicleType: vehicleType || "van", fuelPriceEurPerLiter: fuelPrice });
          return {
            id: `alternative-${idx + 1}`,
            distanceKm: alt.distanceKm,
            durationMinutes: alt.durationMinutes,
            totalCostEur: Math.round((costSummary.breakdown.totalEur + altFuel) * 100) / 100,
            co2EstimateKg: Math.round(alt.distanceKm * (costSummary.co2EstimateKg / analysis.distanceKm || 0) * 100) / 100,
            criticalRequirementCount: requirements.filter((r) => r.severity === "critical").length,
          };
        }),
      ];

      const recommendations = recommendAllStrategies(candidates);

      res.status(201).json({
        route: { ...route, distanceKm: String(analysis.distanceKm), durationMinutes: analysis.durationMinutes, countryCodes: analysis.countryCodes, analysisStatus: "completed" },
        requirements,
        costSummary,
        recommendations,
      });
    } catch (analysisError: any) {
      await roadStorage.saveRouteAnalysis(route.id, {
        distanceKm: 0,
        durationMinutes: 0,
        countryCodes: [],
        routeGeometry: null,
        status: "failed",
      });
      res.status(502).json({ message: "Route analysis failed: " + analysisError.message, routeId: route.id });
    }
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

roadServicesRouter.get("/routes", requireAuth, async (req: Request, res: Response) => {
  const user = req.user as User;
  const routes = await roadStorage.getUserRoutes(user.id);
  res.json({ data: routes });
});

roadServicesRouter.get("/routes/:id", requireAuth, async (req: Request, res: Response) => {
  const user = req.user as User;
  const route = await roadStorage.getRoute(req.params.id);
  if (!route || (route.userId !== user.id && user.role !== "admin")) {
    return res.status(404).json({ message: "Route not found" });
  }
  const requirements = await roadStorage.getRequirementsForRoute(route.id);
  const fuelPrice = DEFAULT_FUEL_PRICE_EUR;
  const costSummary = calculateTripCostSummary(requirements, Number(route.distanceKm ?? 0), route.vehicleType, fuelPrice);
  res.json({ data: { route, requirements, costSummary } });
});

// === AI conversational agent ===
roadServicesRouter.post("/routes/:id/agent", requireAuth, roadServicesAiLimiter, async (req: Request, res: Response) => {
  try {
    const user = req.user as User;
    const route = await roadStorage.getRoute(req.params.id);
    if (!route || (route.userId !== user.id && user.role !== "admin")) {
      return res.status(404).json({ message: "Route not found" });
    }
    if (!isRoadServicesAgentConfigured()) {
      return res.status(503).json({ message: "Road Services AI agent is not configured" });
    }

    const requirements = await roadStorage.getRequirementsForRoute(route.id);
    const { message, history } = req.body as { message?: string; history?: { role: "user" | "assistant"; content: string }[] };

    const reply = await getRoadServicesAgentReply({
      requirements,
      originAddress: route.originAddress,
      destinationAddress: route.destinationAddress,
      userMessage: message,
      history,
    });

    res.json({ data: reply });
  } catch (error: any) {
    res.status(500).json({ message: "Road Services agent failed: " + error.message });
  }
});

// === Marketplace browsing ===
roadServicesRouter.get("/products", async (req: Request, res: Response) => {
  const { category, countryCode } = req.query as { category?: string; countryCode?: string };
  if (!category) {
    return res.status(400).json({ message: "category is required" });
  }
  const products = await roadStorage.findMatchingProducts(category as any, countryCode || null, 25);
  res.json({ data: products });
});

roadServicesRouter.post("/products/:id/click", async (req: Request, res: Response) => {
  const product = await roadStorage.getProduct(req.params.id);
  if (!product) return res.status(404).json({ message: "Product not found" });
  const user = req.user as User | undefined;
  await roadStorage.recordAffiliateClick({ userId: user?.id ?? null, productId: product.id, partnerId: product.partnerId, routeId: (req.body?.routeId as string) ?? null });
  res.status(204).send();
});

// === Orders / purchases ===
roadServicesRouter.post("/orders", requireAuth, async (req: Request, res: Response) => {
  try {
    if (!isStripeConfigured()) {
      return res.status(503).json({ message: "Payments are not configured" });
    }
    const user = req.user as User;
    const { productId, routeId, quantity } = req.body as { productId: string; routeId?: string; quantity?: number };

    const product = await roadStorage.getProduct(productId);
    if (!product || !product.active) {
      return res.status(404).json({ message: "Product not found or inactive" });
    }
    const partner = await roadStorage.getPartnerProfile(product.partnerId);
    if (!partner || partner.status !== "active") {
      return res.status(409).json({ message: "This product's partner is not currently active" });
    }

    const qty = Math.max(1, Number(quantity) || 1);
    const pricing = calculateOrderPricing(Number(product.priceEur), qty, partner);

    const order = await roadStorage.createOrder({
      userId: user.id,
      routeId: routeId ?? null,
      productId: product.id,
      partnerId: partner.id,
      quantity: qty,
      unitPriceEur: pricing.unitPriceEur,
      totalPriceEur: pricing.totalPriceEur,
      commissionEur: pricing.commissionEur,
    });

    const paymentIntent = await getStripe().paymentIntents.create({
      amount: Math.round(pricing.totalPriceEur * 100),
      currency: "eur",
      automatic_payment_methods: { enabled: true },
      metadata: { roadServiceOrderId: order.id },
    });

    res.status(201).json({
      data: { order, clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id },
    });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

roadServicesRouter.get("/orders", requireAuth, async (req: Request, res: Response) => {
  const user = req.user as User;
  const orders = await roadStorage.getUserOrders(user.id);
  res.json({ data: orders });
});

// === Partner self-service dashboard (session-authenticated company users) ===
roadServicesRouter.post("/partners/apply", requireAuth, async (req: Request, res: Response) => {
  try {
    const user = req.user as User;
    if (!user.companyId) {
      return res.status(400).json({ message: "A company account is required to become a Road Services partner" });
    }
    const existing = await roadStorage.getPartnerProfileByCompanyId(user.companyId);
    if (existing) {
      return res.status(409).json({ message: "This company already has a Road Services partner profile" });
    }
    const { categories, countryCodes, commissionType, commissionValue } = req.body;
    const profile = await roadStorage.createPartnerProfile({
      companyId: user.companyId,
      categories,
      countryCodes,
      commissionType: commissionType || "percent",
      commissionValue: String(commissionValue ?? 10),
      payoutDetails: null,
    });
    res.status(201).json({ data: profile });
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

roadServicesRouter.get("/partners/me", requireAuth, async (req: Request, res: Response) => {
  const user = req.user as User;
  if (!user.companyId) return res.status(404).json({ message: "No partner profile" });
  const profile = await roadStorage.getPartnerProfileByCompanyId(user.companyId);
  if (!profile) return res.status(404).json({ message: "No partner profile" });
  res.json({ data: profile });
});

async function requirePartnerProfile(req: Request, res: Response): Promise<import("@shared/schema").RoadServicePartnerProfile | undefined> {
  const user = req.user as User;
  if (!user.companyId) {
    res.status(400).json({ message: "A company account is required" });
    return undefined;
  }
  const profile = await roadStorage.getPartnerProfileByCompanyId(user.companyId);
  if (!profile) {
    res.status(404).json({ message: "No Road Services partner profile for this company" });
    return undefined;
  }
  return profile;
}

roadServicesRouter.post("/partners/me/products", requireAuth, async (req: Request, res: Response) => {
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

roadServicesRouter.get("/partners/me/products", requireAuth, async (req: Request, res: Response) => {
  const profile = await requirePartnerProfile(req, res);
  if (!profile) return;
  const products = await roadStorage.listPartnerProducts(profile.id);
  res.json({ data: products });
});

roadServicesRouter.patch("/partners/me/products/:id", requireAuth, async (req: Request, res: Response) => {
  const profile = await requirePartnerProfile(req, res);
  if (!profile) return;
  const updated = await roadStorage.updateProduct(req.params.id, profile.id, req.body);
  if (!updated) return res.status(404).json({ message: "Product not found" });
  res.json({ data: updated });
});

roadServicesRouter.get("/partners/me/orders", requireAuth, async (req: Request, res: Response) => {
  const profile = await requirePartnerProfile(req, res);
  if (!profile) return;
  const orders = await roadStorage.getPartnerOrders(profile.id);
  res.json({ data: orders });
});

// Used by the company Enterprise Dashboard's "Road Services revenue" panel - reuses the same
// getRevenueSummary() aggregate the admin dashboard already calls, filtered to this partner.
roadServicesRouter.get("/partners/me/revenue", requireAuth, async (req: Request, res: Response) => {
  const profile = await requirePartnerProfile(req, res);
  if (!profile) return;
  const summary = await getRevenueSummary();
  const mine = summary.byPartner.find((p) => p.partnerId === profile.id) ?? { partnerId: profile.id, revenueEur: 0, commissionEur: 0, orders: 0 };
  res.json({ data: { revenueEur: mine.revenueEur, commissionEur: mine.commissionEur, netEur: mine.revenueEur - mine.commissionEur, orders: mine.orders } });
});

// === Admin dashboard ===
roadServicesRouter.get("/admin/revenue", requireAdmin, async (_req: Request, res: Response) => {
  const summary = await getRevenueSummary();
  res.json({ data: summary });
});

roadServicesRouter.get("/admin/partners", requireAdmin, async (req: Request, res: Response) => {
  const { status } = req.query as { status?: string };
  const partners = await roadStorage.listPartnerProfiles(status);
  res.json({ data: partners });
});

roadServicesRouter.patch("/admin/partners/:id/status", requireAdmin, async (req: Request, res: Response) => {
  const { status } = req.body as { status: "pending" | "active" | "suspended" };
  if (!["pending", "active", "suspended"].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }
  const updated = await roadStorage.updatePartnerProfileStatus(req.params.id, status);
  if (!updated) return res.status(404).json({ message: "Partner profile not found" });
  res.json({ data: updated });
});

// Exposed so server/routes.ts can wire the Stripe webhook -> order confirmation without
// duplicating the webhook signature-verification logic that already lives there.
export async function handleRoadServiceOrderPayment(orderId: string, externalPaymentReference: string, succeeded: boolean): Promise<void> {
  if (!succeeded) {
    await roadStorage.failOrder(orderId);
    return;
  }

  const confirmed = await roadStorage.confirmOrder(orderId, externalPaymentReference);
  if (!confirmed) return;

  const product = await roadStorage.getProduct(confirmed.productId);
  if (!product) return;
  const category = product.category as Parameters<typeof getRoadServiceProvider>[0];
  const provider = getRoadServiceProvider(category);
  if (provider.isConfigured()) {
    try {
      const result = await provider.purchase({
        externalProductId: product.id,
        vehicleType: "van",
        quantity: confirmed.quantity,
      });
      if (result.status === "confirmed" && result.externalReference) {
        await roadStorage.confirmOrder(confirmed.id, result.externalReference);
      }
    } catch {
      // Provider purchase failure doesn't roll back the confirmed marketplace order -
      // the partner fulfills it directly; ops is notified via the admin orders dashboard.
    }
  }

  await roadStorage.markClicksConverted(product.id, confirmed.userId);
}
