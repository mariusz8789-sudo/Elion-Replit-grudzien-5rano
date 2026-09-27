import { db } from "./db";
import { skills } from "@shared/schema";

// Canonical skill catalog for the Skills Engine / Team Matching / Professional Services.
// Idempotent (ON CONFLICT DO NOTHING on the unique name) so it's safe to run on every boot -
// this is how the catalog reaches a fresh deployment without a manual seed step.
const CATALOG: Array<{ name: string; category: string; requiresCertification?: string }> = [
  // moving
  { name: "Furniture assembly", category: "moving" },
  { name: "Furniture disassembly", category: "moving" },
  { name: "Wardrobe installation", category: "moving" },
  { name: "IKEA specialist", category: "moving" },
  { name: "Heavy lifting", category: "moving" },
  // installation
  { name: "Kitchen installation", category: "installation" },
  { name: "Bathroom installation", category: "installation" },
  { name: "Floor installation", category: "installation" },
  // trades (licensed)
  { name: "Electrical work", category: "trades", requiresCertification: "SEP" },
  { name: "Gas installation", category: "trades", requiresCertification: "Gas" },
  { name: "Plumbing", category: "trades", requiresCertification: "Hydraulic" },
  { name: "Painting", category: "trades" },
  { name: "Carpentry", category: "trades" },
  { name: "Construction work", category: "trades", requiresCertification: "Construction" },
  { name: "Forklift operation", category: "trades", requiresCertification: "Forklift" },
  { name: "Crane operation", category: "trades", requiresCertification: "UDT" },
  { name: "HDS crane operation", category: "trades", requiresCertification: "HDS" },
  // specialty transport
  { name: "Piano transport", category: "specialty_transport" },
  { name: "Safe transport", category: "specialty_transport" },
  { name: "Glass transport", category: "specialty_transport" },
  { name: "Medical equipment transport", category: "specialty_transport" },
  { name: "ADR transport", category: "specialty_transport", requiresCertification: "ADR" },
  { name: "Artwork transport", category: "specialty_transport" },
  { name: "Vehicle transport", category: "specialty_transport" },
  { name: "Pet relocation", category: "specialty_transport" },
  // relocation
  { name: "Office relocation", category: "relocation" },
  { name: "Server relocation", category: "relocation" },
  { name: "IT relocation", category: "relocation" },
  { name: "Laboratory relocation", category: "relocation" },
  { name: "Medical relocation", category: "relocation" },
  { name: "International relocation", category: "relocation" },
  // cleaning
  { name: "Cleaning", category: "cleaning" },
  { name: "Deep cleaning", category: "cleaning" },
];

export async function seedSkillsCatalog(): Promise<number> {
  const result = await db.insert(skills)
    .values(CATALOG.map((s) => ({ name: s.name, category: s.category, requiresCertification: s.requiresCertification ?? null })))
    .onConflictDoNothing({ target: skills.name })
    .returning();
  return result.length;
}
