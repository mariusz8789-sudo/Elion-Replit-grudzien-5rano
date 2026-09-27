/**
 * Necropolis — tenant-isolated accumulating failure memory (Commercial Hardening Phase 4).
 *
 * The prior audit named the per-tenant Necropolis as the ONE genuinely compounding moat.
 * This module hardens it into a first-class product subsystem on top of the v20
 * `formal_failure_regions` columns (project_id, domain, provenance, region_version):
 *
 *   - recordFailure   — explicit tenant ownership + domain + provenance + dedup by hash
 *   - assess          — STRICT per-tenant lookup; tenant A's regions are invisible to B
 *   - exportArtifact  — deterministic, hashed export (id/timestamp excluded from the hash)
 *   - importArtifact  — schema + field validation, duplicate detection, provenance kept
 *
 * ISOLATION IS THE CONTRACT: every read is filtered by project_id. There is no global
 * "negative-knowledge exchange" here and none is implied — cross-tenant sharing would
 * require an explicit, separate, legally-reviewed design. A tenant only ever sees, and is
 * only ever influenced by, its own recorded failures.
 *
 * Honesty: a KNOWN_DEAD_END verdict means "this proposal is within the failure radius of a
 * region THIS tenant previously recorded as failed" — accumulated operational memory, not a
 * universal impossibility claim.
 */
import { canonicalHash } from '../provenance.mjs';
import * as store from '../store.mjs';

export const NECROPOLIS_SCHEMA = 'zefir-necropolis/1';
export const DEFAULT_RADIUS = 0.15;
export const VERDICT = Object.freeze({ KNOWN_DEAD_END: 'KNOWN_DEAD_END', HIGH_FAILURE_SIMILARITY: 'HIGH_FAILURE_SIMILARITY', POTENTIAL_FAILURE_NEIGHBORHOOD: 'POTENTIAL_FAILURE_NEIGHBORHOOD', NOVEL_REGION: 'NOVEL_REGION' });

/** Scale-normalize a parameter vector (dimensionless comparison across regimes). */
function normalize(vec = {}, scales = null) {
  const out = {};
  for (const k of Object.keys(vec)) out[k] = scales?.[k] ? vec[k] / scales[k] : vec[k];
  return out;
}

/** Deterministic identity of a failure region within a tenant (excludes id/timestamp). */
export function regionContentHash({ projectId, domain = null, failureClass, context = null, normalized }) {
  return canonicalHash({ projectId: projectId ?? null, domain: domain ?? null, failureClass, context: context ?? null, normalized });
}

/**
 * Record a tenant-owned failure region. Deduplicates by content hash within the tenant:
 * an identical region is not stored twice (returns { duplicate: true, region: existing }).
 */
export function recordFailure(db, { projectId, missionId = null, domain = null, failureClass, context = null, parameterVector = {}, scales = null, assumptions = [], failureMode = null, provenance = {}, verificationState = 'RECORDED' }) {
  if (!projectId) throw new Error('necropolis.recordFailure requires projectId (tenant ownership is mandatory)');
  if (!failureClass) throw new Error('necropolis.recordFailure requires failureClass');
  const normalized = normalize(parameterVector, scales);
  const contentHash = regionContentHash({ projectId, domain, failureClass, context, normalized });
  const existing = store.listFailureRegionsByProject(db, projectId, { context }).find((r) => r.contentHash === contentHash);
  if (existing) return { duplicate: true, region: existing };
  const region = store.saveFailureRegion(db, { projectId, missionId, domain, failureClass, context, parameterVector, normalized, assumptions, failureMode, verificationState, provenance, version: 1, contentHash });
  return { duplicate: false, region };
}

/**
 * Assess a candidate against ONLY this tenant's failure memory. Never reads another
 * tenant's regions. Same distance semantics as the formal kernel, project-scoped.
 */
export function assess(db, projectId, { context = null, parameterVector = {}, scales = null, domain = null, radius = DEFAULT_RADIUS } = {}) {
  const known = store.listFailureRegionsByProject(db, projectId, { context, domain });
  if (known.length === 0) return { verdict: VERDICT.NOVEL_REGION, nearest: null, distance: null, tenantRegionsConsidered: 0 };
  const norm = normalize(parameterVector, scales);
  let best = null; let bestD = Infinity;
  for (const k of known) {
    const keys = new Set([...Object.keys(norm), ...Object.keys(k.normalized)]);
    let sum = 0; let n = 0;
    for (const key of keys) { const a = norm[key] ?? 0; const b = k.normalized[key] ?? 0; sum += (a - b) ** 2; n++; }
    const d = Math.sqrt(sum / (n || 1));
    if (d < bestD) { bestD = d; best = k; }
  }
  let verdict;
  if (bestD <= radius * 0.34) verdict = VERDICT.KNOWN_DEAD_END;
  else if (bestD <= radius) verdict = VERDICT.HIGH_FAILURE_SIMILARITY;
  else if (bestD <= radius * 2.5) verdict = VERDICT.POTENTIAL_FAILURE_NEIGHBORHOOD;
  else verdict = VERDICT.NOVEL_REGION;
  return {
    verdict,
    nearest: best ? { id: best.id, failureClass: best.failureClass, failureMode: best.failureMode, domain: best.domain } : null,
    distance: +bestD.toFixed(4),
    tenantRegionsConsidered: known.length,
  };
}

/**
 * Deterministic, hashed export of a tenant's Necropolis. The exportHash is stable for the
 * same set of regions regardless of insertion order or machine (id/createdAt excluded).
 */
export function exportArtifact(db, projectId) {
  const regions = store.listFailureRegionsByProject(db, projectId).map((r) => ({
    domain: r.domain ?? null, failureClass: r.failureClass, context: r.context ?? null,
    parameterVector: r.parameterVector, normalized: r.normalized, assumptions: r.assumptions,
    failureMode: r.failureMode ?? null, provenance: r.provenance ?? {}, version: r.version ?? 1,
    contentHash: r.contentHash,
  }));
  regions.sort((a, b) => String(a.contentHash).localeCompare(String(b.contentHash)));
  const core = { schema: NECROPOLIS_SCHEMA, projectId, count: regions.length, regions };
  const exportHash = canonicalHash(core);
  return { ...core, exportHash, exportedAt: Date.now() };
}

/**
 * Import an export artifact into a tenant. Validates the schema and each region, and
 * deduplicates by content hash (against existing tenant regions AND within the artifact).
 * Returns { imported, duplicates, rejected: [{reason,...}] }. Provenance is preserved and a
 * note records that the region was imported.
 */
export function importArtifact(db, projectId, artifact) {
  if (!projectId) throw new Error('necropolis.importArtifact requires a destination projectId');
  if (!artifact || artifact.schema !== NECROPOLIS_SCHEMA) return { ok: false, error: 'unsupported_or_missing_schema', imported: 0, duplicates: 0, rejected: [] };
  if (!Array.isArray(artifact.regions)) return { ok: false, error: 'artifact_missing_regions', imported: 0, duplicates: 0, rejected: [] };
  let imported = 0; let duplicates = 0; const rejected = [];
  const seenInBatch = new Set();
  for (const r of artifact.regions) {
    if (!r || typeof r !== 'object' || !r.failureClass || typeof r.normalized !== 'object' || r.normalized === null) {
      rejected.push({ reason: 'invalid_region_shape', region: r }); continue;
    }
    // Recompute the content hash under the DESTINATION tenant (ownership changes on import).
    const contentHash = regionContentHash({ projectId, domain: r.domain ?? null, failureClass: r.failureClass, context: r.context ?? null, normalized: r.normalized });
    if (seenInBatch.has(contentHash)) { duplicates++; continue; }
    seenInBatch.add(contentHash);
    const exists = store.listFailureRegionsByProject(db, projectId, { context: r.context ?? null }).some((e) => e.contentHash === contentHash);
    if (exists) { duplicates++; continue; }
    store.saveFailureRegion(db, {
      projectId, missionId: null, domain: r.domain ?? null, failureClass: r.failureClass, context: r.context ?? null,
      parameterVector: r.parameterVector ?? {}, normalized: r.normalized, assumptions: r.assumptions ?? [],
      failureMode: r.failureMode ?? null, verificationState: 'IMPORTED',
      provenance: { ...(r.provenance ?? {}), importedFrom: artifact.projectId ?? null, importedSchema: artifact.schema },
      version: Number.isFinite(r.version) ? r.version : 1, contentHash,
    });
    imported++;
  }
  return { ok: true, imported, duplicates, rejected };
}

/** Summary stats for a tenant's Necropolis (for the product UI / audit). */
export function stats(db, projectId) {
  const regions = store.listFailureRegionsByProject(db, projectId);
  const byDomain = {}; const byClass = {};
  for (const r of regions) { byDomain[r.domain ?? 'unspecified'] = (byDomain[r.domain ?? 'unspecified'] ?? 0) + 1; byClass[r.failureClass] = (byClass[r.failureClass] ?? 0) + 1; }
  return { projectId, total: regions.length, byDomain, byClass };
}
