// Pure pricing math for the spare-capacity/empty-return matching engine, kept separate from
// the storage layer so it's testable without a DB.
export function calculateCapacityBookingPrice(
  volumeM3: number,
  pricePerM3Eur: number | null,
  minimumPriceEur: number | null,
): number {
  const base = pricePerM3Eur !== null ? volumeM3 * pricePerM3Eur : 0;
  const price = minimumPriceEur !== null ? Math.max(base, minimumPriceEur) : base;
  return Math.round(price * 100) / 100;
}

// Platform commission on a company-to-company capacity claim in the Return Trip Marketplace
// network - same flat percent-of-price model as the existing Road Services partner commission
// (server/roadServices/commission.ts), not a new pricing concept.
export const CAPACITY_NETWORK_COMMISSION_RATE = 0.10;

export function calculateCapacityClaimSplit(priceEur: number): { platformFeeEur: number; payoutEur: number } {
  const platformFeeEur = Math.round(priceEur * CAPACITY_NETWORK_COMMISSION_RATE * 100) / 100;
  const payoutEur = Math.round((priceEur - platformFeeEur) * 100) / 100;
  return { platformFeeEur, payoutEur };
}
