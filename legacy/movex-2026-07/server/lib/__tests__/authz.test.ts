import { describe, it, expect, vi } from "vitest";
import { userCanAccessBooking } from "../authz";
import type { Booking, Driver, User } from "@shared/schema";

function makeUser(overrides: Partial<User> = {}): User {
  return { id: "user-1", role: "customer", companyId: null, ...overrides } as User;
}

function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return { id: "booking-1", userId: "owner-1", companyId: null, driverId: null, ...overrides } as Booking;
}

describe("userCanAccessBooking", () => {
  it("allows an admin regardless of ownership", async () => {
    const user = makeUser({ id: "someone-else", role: "admin" });
    const booking = makeBooking();
    const getDriver = vi.fn();
    await expect(userCanAccessBooking(user, booking, getDriver)).resolves.toBe(true);
    expect(getDriver).not.toHaveBeenCalled();
  });

  it("allows the customer who placed the booking", async () => {
    const user = makeUser({ id: "owner-1" });
    const booking = makeBooking({ userId: "owner-1" });
    await expect(userCanAccessBooking(user, booking, vi.fn())).resolves.toBe(true);
  });

  it("allows a user from the assigned company", async () => {
    const user = makeUser({ id: "staff-1", companyId: "company-1" });
    const booking = makeBooking({ companyId: "company-1" });
    await expect(userCanAccessBooking(user, booking, vi.fn())).resolves.toBe(true);
  });

  it("allows the assigned driver's own user account", async () => {
    const user = makeUser({ id: "driver-user-1" });
    const booking = makeBooking({ driverId: "driver-1" });
    const getDriver = vi.fn(async () => ({ userId: "driver-user-1" } as Driver));
    await expect(userCanAccessBooking(user, booking, getDriver)).resolves.toBe(true);
  });

  it("rejects an unrelated authenticated user", async () => {
    const user = makeUser({ id: "random-user", companyId: "other-company" });
    const booking = makeBooking({ userId: "owner-1", companyId: "company-1", driverId: "driver-1" });
    const getDriver = vi.fn(async () => ({ userId: "driver-user-1" } as Driver));
    await expect(userCanAccessBooking(user, booking, getDriver)).resolves.toBe(false);
  });
});
