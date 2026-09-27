import { describe, it, expect } from "vitest";
import { evaluateConditions, readContextField } from "./automation";

describe("readContextField", () => {
  it("reads a nested dot-path", () => {
    expect(readContextField({ booking: { totalPrice: 500 } }, "booking.totalPrice")).toBe(500);
  });

  it("returns undefined for a missing path", () => {
    expect(readContextField({ booking: { totalPrice: 500 } }, "booking.status")).toBeUndefined();
    expect(readContextField({}, "booking.totalPrice")).toBeUndefined();
  });
});

describe("evaluateConditions", () => {
  it("matches everything when there are no conditions", () => {
    expect(evaluateConditions([], {})).toBe(true);
  });

  it("evaluates equals/not_equals", () => {
    const ctx = { booking: { status: "delivered" } };
    expect(evaluateConditions([{ field: "booking.status", operator: "equals", value: "delivered" }], ctx)).toBe(true);
    expect(evaluateConditions([{ field: "booking.status", operator: "equals", value: "canceled" }], ctx)).toBe(false);
    expect(evaluateConditions([{ field: "booking.status", operator: "not_equals", value: "canceled" }], ctx)).toBe(true);
  });

  it("evaluates greater_than/less_than numerically", () => {
    const ctx = { booking: { totalPrice: 750 } };
    expect(evaluateConditions([{ field: "booking.totalPrice", operator: "greater_than", value: 500 }], ctx)).toBe(true);
    expect(evaluateConditions([{ field: "booking.totalPrice", operator: "greater_than", value: 1000 }], ctx)).toBe(false);
    expect(evaluateConditions([{ field: "booking.totalPrice", operator: "less_than", value: 1000 }], ctx)).toBe(true);
  });

  it("evaluates contains case-insensitively on strings", () => {
    const ctx = { booking: { pickupAddress: "10 Main St, Berlin" } };
    expect(evaluateConditions([{ field: "booking.pickupAddress", operator: "contains", value: "berlin" }], ctx)).toBe(true);
    expect(evaluateConditions([{ field: "booking.pickupAddress", operator: "contains", value: "paris" }], ctx)).toBe(false);
  });

  it("AND-combines multiple conditions", () => {
    const ctx = { booking: { status: "delivered", totalPrice: 750 } };
    expect(evaluateConditions([
      { field: "booking.status", operator: "equals", value: "delivered" },
      { field: "booking.totalPrice", operator: "greater_than", value: 500 },
    ], ctx)).toBe(true);
    expect(evaluateConditions([
      { field: "booking.status", operator: "equals", value: "delivered" },
      { field: "booking.totalPrice", operator: "greater_than", value: 5000 },
    ], ctx)).toBe(false);
  });
});
