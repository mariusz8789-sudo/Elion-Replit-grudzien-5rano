import { describe, it, expect } from "vitest";
import {
  insertDriverAvailabilitySchema,
  insertDriverTimeOffSchema,
  insertCargoItemSchema,
  insertCouponSchema,
  insertBookingSchema,
} from "./schema";

describe("insertDriverAvailabilitySchema", () => {
  const base = { driverId: "d1", dayOfWeek: 1, startTime: "09:00", endTime: "17:00" };

  it("accepts a valid HH:MM 24h slot", () => {
    expect(() => insertDriverAvailabilitySchema.parse(base)).not.toThrow();
  });

  it("rejects an out-of-range dayOfWeek", () => {
    expect(() => insertDriverAvailabilitySchema.parse({ ...base, dayOfWeek: 7 })).toThrow();
  });

  it("rejects a malformed time string", () => {
    expect(() => insertDriverAvailabilitySchema.parse({ ...base, startTime: "9am" })).toThrow();
    expect(() => insertDriverAvailabilitySchema.parse({ ...base, startTime: "25:00" })).toThrow();
  });
});

describe("insertDriverTimeOffSchema", () => {
  it("coerces date strings and validates the type enum", () => {
    const parsed = insertDriverTimeOffSchema.parse({
      driverId: "d1",
      type: "vacation",
      startDate: "2026-07-01",
      endDate: "2026-07-10",
    });
    expect(parsed.startDate).toBeInstanceOf(Date);
  });

  it("rejects an invalid time-off type", () => {
    expect(() =>
      insertDriverTimeOffSchema.parse({
        driverId: "d1",
        type: "nap",
        startDate: "2026-07-01",
        endDate: "2026-07-10",
      }),
    ).toThrow();
  });
});

describe("insertCargoItemSchema", () => {
  it("accepts a minimal valid cargo item", () => {
    expect(() =>
      insertCargoItemSchema.parse({
        bookingId: "b1",
        imageUrl: "data:image/jpeg;base64,abc123",
      }),
    ).not.toThrow();
  });

  it("requires imageUrl and bookingId", () => {
    expect(() => insertCargoItemSchema.parse({ imageUrl: "x" })).toThrow();
  });
});

describe("insertCouponSchema", () => {
  it("coerces numeric fields to strings for decimal columns", () => {
    const parsed = insertCouponSchema.parse({
      code: "SAVE10",
      discountType: "percent",
      discountValue: 10,
    });
    expect(parsed.discountValue).toBe("10");
  });
});

describe("insertBookingSchema", () => {
  it("accepts multi-stop bookings alongside the legacy single pickup/delivery fields", () => {
    const parsed = insertBookingSchema.parse({
      userId: "u1",
      serviceId: "s1",
      pickupAddress: "A",
      deliveryAddress: "B",
      pickupDate: "2026-08-01T10:00:00Z",
      estimatedDistance: 12.5,
      totalPrice: 99.99,
      stops: [
        { type: "pickup", address: "A", order: 0 },
        { type: "dropoff", address: "B", order: 1 },
      ],
    });
    expect(parsed.stops).toHaveLength(2);
  });
});
