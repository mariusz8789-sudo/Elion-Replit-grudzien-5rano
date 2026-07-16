import { describe, it, expect } from "vitest";
import { scoreLead, customerHealth, suggestUpsells } from "./crm";

describe("scoreLead", () => {
  const now = new Date("2026-07-16T00:00:00Z");

  it("scores a brand-new lead with no contact info low", () => {
    const score = scoreLead({ stage: "new", createdAt: now, now });
    expect(score).toBe(10);
  });

  it("rewards complete contact info and estimated value", () => {
    const score = scoreLead({
      stage: "qualified",
      email: "a@b.com",
      phone: "+123",
      estimatedValueEur: 5000,
      createdAt: now,
      now,
    });
    // 50 (qualified) + 10 (both contacts) + 10 (5000/500) = 70
    expect(score).toBe(70);
  });

  it("caps the estimated-value bonus at 20", () => {
    const score = scoreLead({ stage: "new", estimatedValueEur: 100_000, createdAt: now, now });
    expect(score).toBe(10 + 20);
  });

  it("penalizes stale open leads but not won/lost ones", () => {
    const staleDate = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
    const staleOpen = scoreLead({ stage: "contacted", createdAt: staleDate, now });
    const staleWon = scoreLead({ stage: "won", createdAt: staleDate, now });
    expect(staleOpen).toBe(30 - 10);
    expect(staleWon).toBe(100);
  });

  it("never goes below 0 or above 100", () => {
    expect(scoreLead({ stage: "lost", createdAt: new Date(now.getTime() - 100 * 86400000), now })).toBeGreaterThanOrEqual(0);
    expect(scoreLead({ stage: "won", estimatedValueEur: 999_999, email: "a@b.com", phone: "1", createdAt: now, now })).toBeLessThanOrEqual(100);
  });
});

describe("customerHealth", () => {
  it("classifies a customer with no bookings as new", () => {
    expect(customerHealth({ totalBookings: 0, daysSinceLastBooking: null })).toBe("new");
  });

  it("classifies recent activity as healthy", () => {
    expect(customerHealth({ totalBookings: 3, daysSinceLastBooking: 10 })).toBe("healthy");
    expect(customerHealth({ totalBookings: 3, daysSinceLastBooking: 60 })).toBe("healthy");
  });

  it("classifies moderate gaps as at_risk", () => {
    expect(customerHealth({ totalBookings: 3, daysSinceLastBooking: 61 })).toBe("at_risk");
    expect(customerHealth({ totalBookings: 3, daysSinceLastBooking: 180 })).toBe("at_risk");
  });

  it("classifies long gaps as churned", () => {
    expect(customerHealth({ totalBookings: 3, daysSinceLastBooking: 181 })).toBe("churned");
  });
});

describe("suggestUpsells", () => {
  it("suggests nothing for a customer with fewer than 2 bookings", () => {
    expect(suggestUpsells([], ["Residential Moving", "Packing Services"], 1)).toEqual([]);
  });

  it("suggests services never used by a repeat customer", () => {
    const result = suggestUpsells(["Residential Moving"], ["Residential Moving", "Packing Services", "Long Distance"], 3);
    expect(result).toEqual(["Packing Services", "Long Distance"]);
  });

  it("suggests nothing if the customer has already used every service", () => {
    const result = suggestUpsells(["A", "B"], ["A", "B"], 5);
    expect(result).toEqual([]);
  });
});
