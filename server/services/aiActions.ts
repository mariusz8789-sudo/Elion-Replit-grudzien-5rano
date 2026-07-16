import { z } from "zod";
import { storage } from "../storage";

// Bounded, real write-actions an AI Operations agent can propose. Every action is scoped to the
// acting company (never trusts an id blindly - each execute() re-checks ownership against the
// database) and only ever runs after the user explicitly confirms via POST .../actions/execute -
// there is no autonomous, unattended execution path anywhere in this file.

export interface AiActionResult {
  success: boolean;
  message: string;
}

interface AiActionDefinition {
  description: string;
  paramsSchema: z.ZodType<any>;
  execute: (params: any, ctx: { companyId: string }) => Promise<AiActionResult>;
}

export const AI_ACTIONS: Record<string, AiActionDefinition> = {
  assign_driver: {
    description: "Assign a driver to an accepted booking that doesn't have a driver yet",
    paramsSchema: z.object({ bookingId: z.string(), driverId: z.string() }),
    execute: async ({ bookingId, driverId }, { companyId }) => {
      const booking = await storage.getBooking(bookingId);
      if (!booking || booking.companyId !== companyId) {
        return { success: false, message: "Booking not found for this company" };
      }
      const driver = await storage.getDriver(driverId);
      if (!driver || driver.companyId !== companyId) {
        return { success: false, message: "Driver not found for this company" };
      }
      const updated = await storage.updateBookingDriver(bookingId, driverId);
      return updated
        ? { success: true, message: `Assigned driver to booking ${bookingId.slice(0, 8)}` }
        : { success: false, message: "Assignment failed" };
    },
  },
  set_vehicle_availability: {
    description: "Mark a vehicle as available or unavailable",
    paramsSchema: z.object({ vehicleId: z.string(), available: z.boolean() }),
    execute: async ({ vehicleId, available }, { companyId }) => {
      const vehicle = await storage.getVehicle(vehicleId);
      if (!vehicle || vehicle.companyId !== companyId) {
        return { success: false, message: "Vehicle not found for this company" };
      }
      const updated = await storage.setVehicleAvailability(vehicleId, available);
      return updated
        ? { success: true, message: `Vehicle marked ${available ? "available" : "unavailable"}` }
        : { success: false, message: "Update failed" };
    },
  },
};

export async function executeAiAction(actionType: string, rawParams: unknown, companyId: string): Promise<AiActionResult> {
  const action = AI_ACTIONS[actionType];
  if (!action) {
    return { success: false, message: `Unknown action: ${actionType}` };
  }
  const parsed = action.paramsSchema.safeParse(rawParams);
  if (!parsed.success) {
    return { success: false, message: `Invalid parameters: ${parsed.error.message}` };
  }
  return action.execute(parsed.data, { companyId });
}
