import type { RoadServicePartnerProfile } from "@shared/schema";

// Pure commission math, isolated from the storage layer so it can be unit tested without a DB.

export interface OrderPricing {
  unitPriceEur: number;
  quantity: number;
  totalPriceEur: number;
  commissionEur: number;
  netToPartnerEur: number;
}

export function calculateOrderPricing(
  unitPriceEur: number,
  quantity: number,
  partner: Pick<RoadServicePartnerProfile, "commissionType" | "commissionValue">,
): OrderPricing {
  if (unitPriceEur < 0 || quantity < 1) {
    throw new Error("unitPriceEur must be non-negative and quantity must be at least 1");
  }

  const totalPriceEur = round2(unitPriceEur * quantity);
  const commissionValue = Number(partner.commissionValue);

  const commissionEur = partner.commissionType === "percent"
    ? round2(totalPriceEur * (commissionValue / 100))
    : round2(commissionValue * quantity);

  const cappedCommissionEur = Math.min(commissionEur, totalPriceEur);

  return {
    unitPriceEur: round2(unitPriceEur),
    quantity,
    totalPriceEur,
    commissionEur: cappedCommissionEur,
    netToPartnerEur: round2(totalPriceEur - cappedCommissionEur),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
