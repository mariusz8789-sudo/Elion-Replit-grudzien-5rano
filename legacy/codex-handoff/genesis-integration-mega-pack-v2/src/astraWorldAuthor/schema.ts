import type {
  HistoricalClaim,
  LayoutZone,
  ProceduralCodeTask,
  SceneVariant,
  WorldAuthorProposal
} from "./types.js";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((x) => typeof x === "string");
}

function isLayoutZone(value: unknown): value is LayoutZone {
  if (!isObject(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.kind === "string" &&
    typeof value.label === "string" &&
    Array.isArray(value.position) &&
    value.position.length === 3 &&
    value.position.every((x) => typeof x === "number") &&
    Array.isArray(value.size) &&
    value.size.length === 3 &&
    value.size.every((x) => typeof x === "number") &&
    isStringArray(value.tags)
  );
}

function isTask(value: unknown): value is ProceduralCodeTask {
  if (!isObject(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.targetSubsystem === "string" &&
    typeof value.objective === "string" &&
    isStringArray(value.constraints) &&
    isStringArray(value.acceptance)
  );
}

function isVariant(value: unknown): value is SceneVariant {
  return isObject(value) && typeof value.id === "string" && typeof value.label === "string" && isStringArray(value.changes);
}

/** NOTE (red-team finding): this schema guard only checks `typeof value.label ===
 * "string"` — it does NOT verify `label` is one of the 4 canonical EpistemicLabel
 * values. That enforcement happens downstream in validation.ts's
 * `validateHistoricalClaims`, which is why that check must never be removed even
 * though it looks redundant with this type guard's name. */
function isHistoricalClaim(value: unknown): value is HistoricalClaim {
  return (
    isObject(value) &&
    typeof value.entityOrFeature === "string" &&
    typeof value.label === "string" &&
    typeof value.rationale === "string" &&
    isStringArray(value.sourceRefs)
  );
}

export function parseWorldAuthorProposal(value: unknown): WorldAuthorProposal {
  if (!isObject(value)) throw new Error("WorldAuthorProposal must be an object.");
  if (value.schemaVersion !== "1") throw new Error("Unsupported WorldAuthorProposal schemaVersion.");
  if (typeof value.requestId !== "string") throw new Error("requestId missing.");
  if (typeof value.title !== "string") throw new Error("title missing.");
  if (typeof value.summary !== "string") throw new Error("summary missing.");
  if (!isObject(value.canonicalSpecPatch)) throw new Error("canonicalSpecPatch missing.");
  if (!Array.isArray(value.layout) || !value.layout.every(isLayoutZone)) throw new Error("layout invalid.");
  if (!Array.isArray(value.assets)) throw new Error("assets invalid.");
  if (!Array.isArray(value.proceduralTasks) || !value.proceduralTasks.every(isTask)) throw new Error("proceduralTasks invalid.");
  if (!isObject(value.lighting)) throw new Error("lighting invalid.");
  if (!Array.isArray(value.variants) || !value.variants.every(isVariant)) throw new Error("variants invalid.");
  if (!Array.isArray(value.historicalClaims) || !value.historicalClaims.every(isHistoricalClaim)) {
    throw new Error("historicalClaims invalid.");
  }
  if (!isStringArray(value.warnings)) throw new Error("warnings invalid.");
  return value as unknown as WorldAuthorProposal;
}
