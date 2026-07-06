import { storage } from "../storage";
import { db } from "../db";
import { users } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";

const MAX_PLAUSIBLE_SPEED_KMH = 180; // fastest plausible ground-transport speed
const EARTH_RADIUS_KM = 6371;

function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface GpsAnomalyResult {
  anomalous: boolean;
  impliedSpeedKmh?: number;
  reason?: string;
}

export function checkGpsAnomaly(
  prev: { lat: number; lng: number; createdAt: Date },
  next: { lat: number; lng: number; createdAt: Date },
): GpsAnomalyResult {
  const distanceKm = haversineDistanceKm(prev.lat, prev.lng, next.lat, next.lng);
  const hours = (next.createdAt.getTime() - prev.createdAt.getTime()) / 3_600_000;
  if (hours <= 0) return { anomalous: false };

  const impliedSpeedKmh = distanceKm / hours;
  if (impliedSpeedKmh > MAX_PLAUSIBLE_SPEED_KMH) {
    return {
      anomalous: true,
      impliedSpeedKmh,
      reason: `Implied speed of ${impliedSpeedKmh.toFixed(0)} km/h between consecutive GPS updates exceeds plausible ground transport speed`,
    };
  }
  return { anomalous: false, impliedSpeedKmh };
}

export interface DuplicateAccountCheck {
  isDuplicate: boolean;
  matchedUserIds: string[];
  reasons: string[];
}

export async function checkDuplicateAccount(userId: string, phone: string, fingerprintHash?: string): Promise<DuplicateAccountCheck> {
  const reasons: string[] = [];
  const matchedUserIds = new Set<string>();

  const phoneMatches = await db.select().from(users).where(and(eq(users.phone, phone), sql`${users.id} != ${userId}`));
  if (phoneMatches.length > 0) {
    reasons.push("Phone number shared with another account");
    phoneMatches.forEach((u) => matchedUserIds.add(u.id));
  }

  if (fingerprintHash) {
    const fingerprintMatches = await storage.findUsersBySharedFingerprint(fingerprintHash);
    const otherUsers = fingerprintMatches.filter((f) => f.userId !== userId);
    if (otherUsers.length > 0) {
      reasons.push("Device fingerprint shared with another account");
      otherUsers.forEach((f) => matchedUserIds.add(f.userId));
    }
  }

  return { isDuplicate: matchedUserIds.size > 0, matchedUserIds: Array.from(matchedUserIds), reasons };
}

export interface PaymentRiskCheck {
  score: number; // 0-100
  reasons: string[];
}

export async function assessPaymentRisk(userId: string, amount: number): Promise<PaymentRiskCheck> {
  const reasons: string[] = [];
  let score = 0;

  const recentCountResult = await db.execute(sql`
    SELECT COUNT(*)::int AS count FROM bookings
    WHERE user_id = ${userId} AND created_at >= now() - interval '1 hour'
  `);
  const recentCount = Number((recentCountResult.rows[0] as any)?.count ?? 0);
  if (recentCount >= 5) {
    score += 40;
    reasons.push(`${recentCount} bookings created in the last hour (velocity anomaly)`);
  } else if (recentCount >= 3) {
    score += 15;
    reasons.push(`${recentCount} bookings created in the last hour`);
  }

  const avgResult = await db.execute(sql`
    SELECT AVG(total_price::numeric) AS avg_price FROM bookings WHERE user_id = ${userId}
  `);
  const avgPrice = Number((avgResult.rows[0] as any)?.avg_price ?? 0);
  if (avgPrice > 0 && amount > avgPrice * 5) {
    score += 30;
    reasons.push(`Booking amount (${amount}) is more than 5x this user's average (${avgPrice.toFixed(2)})`);
  }

  return { score: Math.min(score, 100), reasons };
}

export async function scoreAndRecordUserRisk(userId: string, amount: number): Promise<{ score: number; reasons: string[] }> {
  const paymentRisk = await assessPaymentRisk(userId, amount);
  await storage.recordRiskScore("user", userId, paymentRisk.score, paymentRisk.reasons);
  return paymentRisk;
}
