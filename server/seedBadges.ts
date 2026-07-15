import { db } from "./db";
import { badges } from "@shared/schema";

// Idempotent (ON CONFLICT DO NOTHING on the unique code) so a fresh deployment's database
// gets the full badge catalog automatically - previously these existed only because someone
// had manually inserted them once, and a new environment would have none.
const CATALOG: Array<{ code: string; name: string; description: string; icon: string }> = [
  { code: "super_carrier", name: "Super Carrier", description: "4.8+ rating with 20+ reviews", icon: "award" },
  { code: "premium", name: "Premium", description: "Premium subscription tier", icon: "star" },
  { code: "elite", name: "Elite", description: "Enterprise subscription tier", icon: "crown" },
  { code: "completed_100", name: "100 Deliveries", description: "100 completed bookings", icon: "package" },
  { code: "completed_500", name: "500 Deliveries", description: "500 completed bookings", icon: "package" },
  { code: "completed_1000", name: "1000 Deliveries", description: "1000 completed bookings", icon: "package" },
  // Green MoveX - awarded from real, persisted CO2-savings data (environmental_calculations),
  // never a fabricated "green score".
  { code: "green_company", name: "Green Company", description: "100kg+ of real, persisted CO2 saved across completed bookings", icon: "leaf" },
  { code: "green_driver", name: "Green Driver", description: "50kg+ of real, persisted CO2 saved across completed deliveries", icon: "leaf" },
  { code: "green_customer", name: "Green Customer", description: "20kg+ of real, persisted CO2 saved across your bookings", icon: "leaf" },
];

export async function seedBadgesCatalog(): Promise<number> {
  const result = await db.insert(badges)
    .values(CATALOG)
    .onConflictDoNothing({ target: badges.code })
    .returning();
  return result.length;
}
