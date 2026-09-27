import { db } from "../db";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import {
  roadServicePartnerProfiles, roadServiceProducts, roadRoutes, routeRequirements,
  roadServiceOrders, roadServiceAffiliateClicks,
  type RoadServicePartnerProfile, type InsertRoadServicePartnerProfile,
  type RoadServiceProduct, type InsertRoadServiceProduct,
  type RoadRoute, type InsertRoadRoute,
  type RouteRequirement,
  type RoadServiceOrder,
  type RoadServiceCategory,
  ROAD_SERVICE_CATEGORIES,
} from "@shared/schema";
import type { DetectedRequirement } from "./routeAnalysis";

// A dedicated data-access module for MoveX Road Services, deliberately kept separate
// from the core server/storage.ts IStorage implementation so this domain can be
// extracted into its own service/database with minimal blast radius later.

// === Partner profiles ===
export async function createPartnerProfile(profile: InsertRoadServicePartnerProfile): Promise<RoadServicePartnerProfile> {
  const result = await db.insert(roadServicePartnerProfiles).values(profile).returning();
  return result[0];
}

export async function getPartnerProfile(id: string): Promise<RoadServicePartnerProfile | undefined> {
  const result = await db.select().from(roadServicePartnerProfiles).where(eq(roadServicePartnerProfiles.id, id));
  return result[0];
}

export async function getPartnerProfileByCompanyId(companyId: string): Promise<RoadServicePartnerProfile | undefined> {
  const result = await db.select().from(roadServicePartnerProfiles).where(eq(roadServicePartnerProfiles.companyId, companyId));
  return result[0];
}

export async function listPartnerProfiles(status?: string): Promise<RoadServicePartnerProfile[]> {
  const query = db.select().from(roadServicePartnerProfiles);
  if (status) {
    return await query.where(eq(roadServicePartnerProfiles.status, status)).orderBy(desc(roadServicePartnerProfiles.createdAt));
  }
  return await query.orderBy(desc(roadServicePartnerProfiles.createdAt));
}

export async function updatePartnerProfileStatus(id: string, status: "pending" | "active" | "suspended"): Promise<RoadServicePartnerProfile | undefined> {
  const result = await db.update(roadServicePartnerProfiles)
    .set({ status, updatedAt: new Date() })
    .where(eq(roadServicePartnerProfiles.id, id))
    .returning();
  return result[0];
}

// === Products ===
export async function createProduct(product: InsertRoadServiceProduct): Promise<RoadServiceProduct> {
  const result = await db.insert(roadServiceProducts).values(product).returning();
  return result[0];
}

export async function updateProduct(id: string, partnerId: string, patch: Partial<InsertRoadServiceProduct>): Promise<RoadServiceProduct | undefined> {
  const result = await db.update(roadServiceProducts)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(roadServiceProducts.id, id), eq(roadServiceProducts.partnerId, partnerId)))
    .returning();
  return result[0];
}

export async function listPartnerProducts(partnerId: string): Promise<RoadServiceProduct[]> {
  return await db.select().from(roadServiceProducts).where(eq(roadServiceProducts.partnerId, partnerId)).orderBy(desc(roadServiceProducts.createdAt));
}

export async function findMatchingProducts(category: RoadServiceCategory, countryCode: string | null, limit = 5): Promise<RoadServiceProduct[]> {
  const conditions = [eq(roadServiceProducts.category, category), eq(roadServiceProducts.active, true)];
  if (countryCode) {
    conditions.push(eq(roadServiceProducts.countryCode, countryCode));
  }
  return await db.select().from(roadServiceProducts)
    .where(and(...conditions))
    .orderBy(roadServiceProducts.priceEur)
    .limit(limit);
}

export async function getProduct(id: string): Promise<RoadServiceProduct | undefined> {
  const result = await db.select().from(roadServiceProducts).where(eq(roadServiceProducts.id, id));
  return result[0];
}

// === Routes & requirements ===
export async function createRoute(route: InsertRoadRoute & { userId: string }): Promise<RoadRoute> {
  const result = await db.insert(roadRoutes).values(route).returning();
  return result[0];
}

export async function getRoute(id: string): Promise<RoadRoute | undefined> {
  const result = await db.select().from(roadRoutes).where(eq(roadRoutes.id, id));
  return result[0];
}

export async function getUserRoutes(userId: string, limit = 50): Promise<RoadRoute[]> {
  return await db.select().from(roadRoutes).where(eq(roadRoutes.userId, userId)).orderBy(desc(roadRoutes.createdAt)).limit(limit);
}

export async function saveRouteAnalysis(
  routeId: string,
  data: { distanceKm: number; durationMinutes: number; countryCodes: string[]; routeGeometry: unknown; status: "completed" | "failed" },
): Promise<RoadRoute | undefined> {
  const result = await db.update(roadRoutes)
    .set({
      distanceKm: String(data.distanceKm),
      durationMinutes: data.durationMinutes,
      countryCodes: data.countryCodes,
      routeGeometry: data.routeGeometry,
      analysisStatus: data.status,
      analyzedAt: new Date(),
    })
    .where(eq(roadRoutes.id, routeId))
    .returning();
  return result[0];
}

export async function saveRequirements(routeId: string, requirements: DetectedRequirement[]): Promise<RouteRequirement[]> {
  if (requirements.length === 0) return [];

  const withProducts = await Promise.all(requirements.map(async (r) => {
    const isSellableCategory = (ROAD_SERVICE_CATEGORIES as readonly string[]).includes(r.category);
    const matches = isSellableCategory
      ? await findMatchingProducts(r.category as RoadServiceCategory, r.countryCode, 1)
      : [];
    const match = matches[0];
    return {
      routeId,
      category: r.category,
      countryCode: r.countryCode,
      title: r.title,
      description: r.description,
      severity: r.severity,
      isMandatory: r.isMandatory,
      estimatedCostEur: match ? match.priceEur : String(r.estimatedCostEur),
      recommendedProductId: match?.id ?? null,
    };
  }));

  return await db.insert(routeRequirements).values(withProducts).returning();
}

export async function getRequirementsForRoute(routeId: string): Promise<RouteRequirement[]> {
  return await db.select().from(routeRequirements).where(eq(routeRequirements.routeId, routeId));
}

// === Orders ===
export async function createOrder(order: {
  userId: string;
  routeId?: string | null;
  productId: string;
  partnerId: string;
  quantity: number;
  unitPriceEur: number;
  totalPriceEur: number;
  commissionEur: number;
}): Promise<RoadServiceOrder> {
  const result = await db.insert(roadServiceOrders).values({
    ...order,
    unitPriceEur: String(order.unitPriceEur),
    totalPriceEur: String(order.totalPriceEur),
    commissionEur: String(order.commissionEur),
  }).returning();
  return result[0];
}

export async function confirmOrder(id: string, externalReference: string | null): Promise<RoadServiceOrder | undefined> {
  const result = await db.update(roadServiceOrders)
    .set({ status: "confirmed", externalReference: externalReference ?? undefined })
    .where(eq(roadServiceOrders.id, id))
    .returning();
  return result[0];
}

export async function failOrder(id: string): Promise<RoadServiceOrder | undefined> {
  const result = await db.update(roadServiceOrders).set({ status: "failed" }).where(eq(roadServiceOrders.id, id)).returning();
  return result[0];
}

export async function getUserOrders(userId: string): Promise<RoadServiceOrder[]> {
  return await db.select().from(roadServiceOrders).where(eq(roadServiceOrders.userId, userId)).orderBy(desc(roadServiceOrders.purchasedAt));
}

export async function getPartnerOrders(partnerId: string): Promise<RoadServiceOrder[]> {
  return await db.select().from(roadServiceOrders).where(eq(roadServiceOrders.partnerId, partnerId)).orderBy(desc(roadServiceOrders.purchasedAt));
}

export async function getOrdersByRoute(routeId: string): Promise<RoadServiceOrder[]> {
  return await db.select().from(roadServiceOrders).where(eq(roadServiceOrders.routeId, routeId));
}

// === Affiliate clicks ===
export async function recordAffiliateClick(data: { userId?: string | null; productId: string; partnerId: string; routeId?: string | null }): Promise<void> {
  await db.insert(roadServiceAffiliateClicks).values(data);
}

export async function markClicksConverted(productId: string, userId: string): Promise<void> {
  await db.update(roadServiceAffiliateClicks)
    .set({ converted: true })
    .where(and(eq(roadServiceAffiliateClicks.productId, productId), eq(roadServiceAffiliateClicks.userId, userId)));
}

// === Revenue engine aggregation (admin dashboard) ===
export interface RevenueSummary {
  totalRevenueEur: number;
  totalCommissionEur: number;
  totalOrders: number;
  byCategory: Array<{ category: string; revenueEur: number; commissionEur: number; orders: number }>;
  byCountry: Array<{ countryCode: string | null; revenueEur: number; orders: number }>;
  byPartner: Array<{ partnerId: string; revenueEur: number; commissionEur: number; orders: number }>;
}

export async function getRevenueSummary(): Promise<RevenueSummary> {
  const totals = await db.execute(sql`
    SELECT
      COALESCE(SUM(total_price_eur), 0)::float AS revenue,
      COALESCE(SUM(commission_eur), 0)::float AS commission,
      COUNT(*)::int AS orders
    FROM road_service_orders WHERE status = 'confirmed'
  `);

  const byCategory = await db.execute(sql`
    SELECT p.category AS category,
      COALESCE(SUM(o.total_price_eur), 0)::float AS revenue,
      COALESCE(SUM(o.commission_eur), 0)::float AS commission,
      COUNT(*)::int AS orders
    FROM road_service_orders o
    JOIN road_service_products p ON p.id = o.product_id
    WHERE o.status = 'confirmed'
    GROUP BY p.category
  `);

  const byCountry = await db.execute(sql`
    SELECT p.country_code AS country_code,
      COALESCE(SUM(o.total_price_eur), 0)::float AS revenue,
      COUNT(*)::int AS orders
    FROM road_service_orders o
    JOIN road_service_products p ON p.id = o.product_id
    WHERE o.status = 'confirmed'
    GROUP BY p.country_code
  `);

  const byPartner = await db.execute(sql`
    SELECT partner_id,
      COALESCE(SUM(total_price_eur), 0)::float AS revenue,
      COALESCE(SUM(commission_eur), 0)::float AS commission,
      COUNT(*)::int AS orders
    FROM road_service_orders
    WHERE status = 'confirmed'
    GROUP BY partner_id
  `);

  const totalsRow = totals.rows[0] as any;

  return {
    totalRevenueEur: Number(totalsRow?.revenue ?? 0),
    totalCommissionEur: Number(totalsRow?.commission ?? 0),
    totalOrders: Number(totalsRow?.orders ?? 0),
    byCategory: byCategory.rows.map((r: any) => ({ category: r.category, revenueEur: Number(r.revenue), commissionEur: Number(r.commission), orders: Number(r.orders) })),
    byCountry: byCountry.rows.map((r: any) => ({ countryCode: r.country_code, revenueEur: Number(r.revenue), orders: Number(r.orders) })),
    byPartner: byPartner.rows.map((r: any) => ({ partnerId: r.partner_id, revenueEur: Number(r.revenue), commissionEur: Number(r.commission), orders: Number(r.orders) })),
  };
}

export async function getPartnersByIds(ids: string[]): Promise<RoadServicePartnerProfile[]> {
  if (ids.length === 0) return [];
  return await db.select().from(roadServicePartnerProfiles).where(inArray(roadServicePartnerProfiles.id, ids));
}
