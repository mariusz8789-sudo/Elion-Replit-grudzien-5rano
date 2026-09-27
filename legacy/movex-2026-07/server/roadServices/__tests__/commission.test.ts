import { describe, it, expect } from "vitest";
import { calculateOrderPricing } from "../commission";

describe("calculateOrderPricing", () => {
  it("calculates percent commission on the total price", () => {
    const pricing = calculateOrderPricing(10, 2, { commissionType: "percent", commissionValue: "15" as any });
    expect(pricing.totalPriceEur).toBe(20);
    expect(pricing.commissionEur).toBe(3);
    expect(pricing.netToPartnerEur).toBe(17);
  });

  it("calculates fixed commission per unit", () => {
    const pricing = calculateOrderPricing(10, 3, { commissionType: "fixed", commissionValue: "2" as any });
    expect(pricing.totalPriceEur).toBe(30);
    expect(pricing.commissionEur).toBe(6);
    expect(pricing.netToPartnerEur).toBe(24);
  });

  it("caps commission at the total price so a partner is never paid negative", () => {
    const pricing = calculateOrderPricing(5, 1, { commissionType: "fixed", commissionValue: "50" as any });
    expect(pricing.commissionEur).toBe(5);
    expect(pricing.netToPartnerEur).toBe(0);
  });

  it("rejects a negative unit price", () => {
    expect(() => calculateOrderPricing(-1, 1, { commissionType: "percent", commissionValue: "10" as any })).toThrow();
  });

  it("rejects a quantity below 1", () => {
    expect(() => calculateOrderPricing(10, 0, { commissionType: "percent", commissionValue: "10" as any })).toThrow();
  });

  it("rounds to 2 decimal places", () => {
    const pricing = calculateOrderPricing(9.99, 3, { commissionType: "percent", commissionValue: "10" as any });
    expect(pricing.totalPriceEur).toBe(29.97);
    expect(pricing.commissionEur).toBe(3);
  });
});
