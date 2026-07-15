import { describe, it, expect } from "vitest";
import { calculateCapacityBookingPrice } from "../capacityPricing";

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
