/** ADAPTER/VALIDATOR UTILITY (fix area 6) — validates externally-supplied reachability
 * facts; does not itself scan the repo. */
export type ReachabilityLevel =
  | "PRODUCTION_REACHABLE"
  | "TEST_ONLY"
  | "INTENTIONALLY_ORPHANED"
  | "DEAD_CODE"
  | "UNKNOWN";

export interface ModuleReachabilityRecord {
  moduleId: string;
  path: string;
  entrypointChain: string[];
  level: ReachabilityLevel;
  reason?: string;
}

export function validateReachability(records: readonly ModuleReachabilityRecord[]): string[] {
  const errors: string[] = [];
  for (const r of records) {
    if (r.level === "PRODUCTION_REACHABLE" && r.entrypointChain.length < 2) {
      errors.push(`${r.moduleId}: production reachability requires an import/route chain.`);
    }
    if (r.level === "INTENTIONALLY_ORPHANED" && !r.reason) {
      errors.push(`${r.moduleId}: intentionally orphaned module requires a documented reason.`);
    }
  }
  return errors;
}
