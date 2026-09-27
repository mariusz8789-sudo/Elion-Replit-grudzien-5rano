import { describe, it, expect } from "vitest";
import { calculateCapacityBookingPrice, calculateCapacityClaimSplit, CAPACITY_NETWORK_COMMISSION_RATE } from "../capacityPricing";

describe("calculateCapacityBookingPrice", () => {
  it("charges volume * pricePerM3 when no minimum is set", () => {
    expect(calculateCapacityBookingPrice(4, 10, null)).toBe(40);
  });

  it("returns 0 when neither pricePerM3 nor minimum is set", () => {
    expect(calculateCapacityBookingPrice(4, null, null)).toBe(0);
  });

  it("applies the minimum price when the volume-based price is lower", () => {
    expect(calculateCapacityBookingPrice(1, 10, 50)).toBe(50);
  });

  it("uses the volume-based price when it exceeds the minimum", () => {
    expect(calculateCapacityBookingPrice(10, 10, 50)).toBe(100);
  });

  it("applies the minimum even with no per-m3 price set", () => {
    expect(calculateCapacityBookingPrice(4, null, 30)).toBe(30);
  });

  it("rounds to 2 decimal places", () => {
    expect(calculateCapacityBookingPrice(3, 3.333, null)).toBe(10);
  });
});

describe("calculateCapacityClaimSplit", () => {
  it("splits at the standard 10% platform commission rate", () => {
    expect(CAPACITY_NETWORK_COMMISSION_RATE).toBe(0.10);
    expect(calculateCapacityClaimSplit(100)).toEqual({ platformFeeEur: 10, payoutEur: 90 });
  });

  it("fee and payout always sum back to the original price", () => {
    const { platformFeeEur, payoutEur } = calculateCapacityClaimSplit(333.33);
    expect(Math.round((platformFeeEur + payoutEur) * 100) / 100).toBe(333.33);
  });

  it("rounds both figures to 2 decimal places", () => {
    const result = calculateCapacityClaimSplit(19.99);
    expect(result.platformFeeEur).toBe(2);
    expect(result.payoutEur).toBe(17.99);
  });

  it("returns zero for a zero price", () => {
    expect(calculateCapacityClaimSplit(0)).toEqual({ platformFeeEur: 0, payoutEur: 0 });
  });
});
