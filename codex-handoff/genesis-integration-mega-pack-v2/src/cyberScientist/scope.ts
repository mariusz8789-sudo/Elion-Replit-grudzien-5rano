import type { AuthorizedScope } from "./types.js";

/** Internal self-consistency check on a caller-supplied scope object. NOT a real
 * sandbox/network/filesystem enforcement boundary — this package has no execution
 * primitives at all, so there is nothing else for it to enforce against. */
export function assertScopeSafe(scope: AuthorizedScope): void {
  if (!scope.scopeId.trim()) throw new Error("scopeId required.");
  if (scope.mode === "REPOSITORY_ONLY" && scope.allowNetworkTargets.length > 0) {
    throw new Error("REPOSITORY_ONLY scope cannot include network targets.");
  }
  const denied = new Set(scope.denyNetworkTargets);
  for (const target of scope.allowNetworkTargets) {
    if (denied.has(target)) throw new Error(`Target both allowed and denied: ${target}`);
  }
}

/**
 * FIX (red-team finding): this function was defined but never called anywhere in V1's
 * own code — dead scaffolding from this package's own perspective. It remains unused
 * BY DESIGN (this package has no network dispatch of its own to guard), but it is now
 * explicitly documented as the function any host-bound `DefensiveAnalyzerPort`
 * implementation that reaches a real network target MUST call before doing so. Codex
 * integration must not treat its mere existence as protection — it protects nothing
 * until a real analyzer implementation actually calls it.
 */
export function targetAllowed(scope: AuthorizedScope, target: string): boolean {
  if (scope.denyNetworkTargets.includes(target)) return false;
  return scope.allowNetworkTargets.includes(target);
}
