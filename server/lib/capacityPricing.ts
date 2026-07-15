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
