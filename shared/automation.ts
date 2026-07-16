// Deterministic condition evaluation for the workflow automation engine - pure and testable in
// isolation from the DB/action side effects in server/services/automationEngine.ts.
export const AUTOMATION_METHODOLOGY = "movex-automation-v1";

export type ConditionOperator = "equals" | "not_equals" | "greater_than" | "less_than" | "contains";

export interface AutomationCondition {
  field: string; // dot-path into the trigger context, e.g. "booking.totalPrice"
  operator: ConditionOperator;
  value: string | number | boolean;
}

export interface AutomationAction {
  type: string;
  params: Record<string, unknown>;
}

// Reads a dot-path ("booking.totalPrice") out of a plain context object.
export function readContextField(context: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, context);
}

function evaluateOne(actual: unknown, operator: ConditionOperator, expected: string | number | boolean): boolean {
  switch (operator) {
    case "equals":
      return String(actual) === String(expected);
    case "not_equals":
      return String(actual) !== String(expected);
    case "greater_than":
      return Number(actual) > Number(expected);
    case "less_than":
      return Number(actual) < Number(expected);
    case "contains":
      return typeof actual === "string" && actual.toLowerCase().includes(String(expected).toLowerCase());
    default:
      return false;
  }
}

// All conditions must pass (AND-combined) - an empty list always matches, so a rule with no
// conditions fires on every occurrence of its trigger event.
export function evaluateConditions(conditions: AutomationCondition[], context: Record<string, unknown>): boolean {
  return conditions.every((c) => evaluateOne(readContextField(context, c.field), c.operator, c.value));
}
