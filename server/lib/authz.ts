import type { Booking, Driver, User } from "@shared/schema";

/**
 * Shared ownership check reused by every booking read/sub-resource route: the customer who
 * placed a booking, the company/driver assigned to it, or an admin may access its details.
 * Takes a `getDriver` lookup instead of the storage singleton so it stays unit-testable.
 */
export async function userCanAccessBooking(
  user: User,
  booking: Booking,
  getDriver: (driverId: string) => Promise<Driver | undefined>,
): Promise<boolean> {
  if (user.role === "admin") return true;
  if (user.id === booking.userId) return true;
  if (booking.companyId && user.companyId === booking.companyId) return true;
  if (booking.driverId) {
    const driver = await getDriver(booking.driverId);
    if (driver?.userId === user.id) return true;
  }
  return false;
}
