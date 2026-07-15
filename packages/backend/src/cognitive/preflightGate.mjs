/**
 * Scientific Pre-Flight Gate (Phase 4 — Claude Original Invention, implemented).
 *
 * "Compile-time for physics." Before an expensive campaign or simulation runs, this
 * gate composes the formal kernel + Necropolis + capability checks into a single,
 * content-hashed GO / WARN / BLOCK certificate. It removes wasted compute and expert
 * hours by refusing dimensionally-inconsistent configurations, known dead ends, and
 * missing-capability runs BEFORE they consume resources.
 *
 * First-principles insight: the cheapest computation is the one you never run. A large
 * fraction of R&D compute (and expert time) is spent on runs that were physically
 * inconsistent, previously-failed, or impossible-in-this-runtime from the start. A
 * formal pre-flight that catches these is proprietary accumulated advantage (its
 * Necropolis grows per client) and directly compresses human hours.
 *
 * Honesty: a GO certificate asserts only "no blocking reason found by the implemented
 * checks" — never physical/biological correctness. It is a NECESSARY, not sufficient,
 * pre-condition. Every check and its evidence is recorded; nothing is fabricated.
 */
import { canonicalHash } from '../provenance.mjs';
import * as fk from './formalKernel.mjs';

export const PREFLIGHT_VERDICT = Object.freeze({ GO: 'GO', WARN: 'WARN', BLOCK: 'BLOCK' });

/**
 * Run the pre-flight gate.
 * spec = {
 *   equationTerms?: [{symbol, dimension}],        // dimensional consistency (BLOCK on fail)
 *   requiredCapabilities?: [id],                  // capability availability
 *   capabilityResolver?: (id)=>bool,
 *   parameterVector?: {..}, context?, scales?,    // Necropolis dead-end check
 *   assumptions?: [..],                           // must be non-empty (WARN if unstated)
 *   db?, missionId?                               // for Necropolis lookup
 * }
 */
export function preflight(spec = {}) {
  const checks = [];
  const add = (name, status, detail) => checks.push({ check: name, status, detail });

  // 1) Dimensional consistency — a BLOCKING physical error if inconsistent.
  if (Array.isArray(spec.equationTerms) && spec.equationTerms.length > 0) {
    const dc = fk.checkDimensionalConsistency(spec.equationTerms);
    add('dimensional-consistency', dc.consistent ? 'PASS' : 'BLOCK', dc);
  } else {
    add('dimensional-consistency', 'SKIP', 'no equation terms supplied');
  }

  // 2) Capability availability — BLOCK if a required engine is unavailable.
  if (Array.isArray(spec.requiredCapabilities) && spec.requiredCapabilities.length > 0) {
    const resolve = spec.capabilityResolver ?? (() => false);
    const missing = spec.requiredCapabilities.filter((c) => !resolve(c));
    add('capability-availability', missing.length === 0 ? 'PASS' : 'BLOCK', { missing });
  } else {
    add('capability-availability', 'SKIP', 'no required capabilities declared');
  }

  // 3) Necropolis dead-end check — BLOCK on a known dead end, WARN on high similarity.
  if (spec.db && spec.missionId && spec.parameterVector && spec.context) {
    const region = fk.assessRegion(spec.db, spec.missionId, { context: spec.context, parameterVector: spec.parameterVector, scales: spec.scales });
    const status = region.verdict === 'KNOWN_DEAD_END' ? 'BLOCK' : region.verdict === 'HIGH_FAILURE_SIMILARITY' ? 'WARN' : 'PASS';
    add('necropolis-dead-end', status, region);
  } else {
    add('necropolis-dead-end', 'SKIP', 'no parameter vector/context for failure-memory lookup');
  }

  // 4) Assumptions stated — WARN if a run declares no assumptions (hidden-assumption risk).
  const assumptions = spec.assumptions ?? [];
  add('assumptions-stated', assumptions.length > 0 ? 'PASS' : 'WARN', { count: assumptions.length });

  const blocking = checks.filter((c) => c.status === 'BLOCK');
  const warnings = checks.filter((c) => c.status === 'WARN');
  const verdict = blocking.length > 0 ? PREFLIGHT_VERDICT.BLOCK : warnings.length > 0 ? PREFLIGHT_VERDICT.WARN : PREFLIGHT_VERDICT.GO;

  const certificate = {
    verdict, checks,
    blockingReasons: blocking.map((c) => c.check),
    warnings: warnings.map((c) => c.check),
    note: 'GO means no blocking reason found by the implemented checks; it is a NECESSARY, not sufficient, pre-condition and asserts no physical/biological correctness.',
  };
  certificate.contentHash = canonicalHash(certificate);
  return certificate;
}
