/**
 * Corpus → Evidence Intelligence bridge (Corpus Mandate Phases 13–14).
 *
 * Loads a verified bundle, normalizes every entity, resolves identities, and projects
 * literature/bioactivity records into evidence records for the EXISTING claim registry —
 * WITHOUT collapsing categories. A TEST_FIXTURE stays TEST_FIXTURE; a DATABASE_REPORTED
 * bioactivity is not a PUBLISHER_REPORTED article; nothing becomes "supports a claim" merely
 * because the record exists. Record-exists ≠ claim-supported.
 */
import { openBundle } from './bundleAdapter.mjs';
import { resolveEntities } from './entityResolution.mjs';
import { ENTITY_TYPE } from './sourcePort.mjs';

/**
 * Ingest a bundle into a campaign-scoped evidence view.
 * Returns { bundleId, ingestionMode, entities, evidenceRecords, resolution, summary }.
 * evidenceRecords are consumable by evidenceIntelligence.buildClaimRegistry (they carry
 * evidenceId + direction), and each carries provenance + evidenceOrigin (never flattened).
 */
export function ingestBundle(bundleRoot, { campaignId = null, projectId = null } = {}) {
  const bundle = openBundle(bundleRoot);
  const verify = bundle.verifyAll();
  if (!verify.ok) {
    const bad = verify.results.filter((r) => !r.ok);
    throw new Error(`bundle integrity failure — refusing to ingest: ${bad.map((b) => `${b.entryId}:${b.error}`).join('; ')}`);
  }
  const entities = [];
  const evidenceRecords = [];
  for (const meta of bundle.listEntries()) {
    const r = bundle.getById(meta.sourceService, meta.sourceId);
    if (r.status !== 'OK') continue;
    entities.push({ entity: r.entity, provenance: r.provenance });
    // Only ARTICLE and BIOACTIVITY project into claim-supporting evidence; a bare compound or
    // structure existing is NOT evidence of efficacy (kept as entities, not as claim support).
    if (r.entity.entityType === ENTITY_TYPE.ARTICLE || r.entity.entityType === ENTITY_TYPE.BIOACTIVITY) {
      const identifier = r.entity.identifiers.doi ?? r.entity.identifiers.pmid ?? r.entity.identifiers.activityId ?? r.provenance.sourceId;
      evidenceRecords.push({
        evidenceId: `ev_${r.provenance.sourceService}_${identifier}`,
        sourceType: r.provenance.sourceService, origin: r.provenance.evidenceOrigin,
        identifier: String(identifier), direction: 'supporting',
        provenanceId: r.provenance.provenanceId, contentHash: r.provenance.contentHash,
        sourceUrl: r.provenance.sourceUrl, license: r.provenance.license,
        entityType: r.entity.entityType, campaignId, projectId,
        note: 'record existence is not claim support — a downstream claim must explicitly cite this evidenceId.',
      });
    }
  }
  const resolution = resolveEntities(entities.map((e) => e.entity));
  const summary = {
    bundleId: bundle.bundleId, ingestionMode: bundle.ingestionMode, entities: entities.length,
    byType: entities.reduce((acc, e) => { acc[e.entity.entityType] = (acc[e.entity.entityType] ?? 0) + 1; return acc; }, {}),
    byOrigin: entities.reduce((acc, e) => { acc[e.provenance.evidenceOrigin] = (acc[e.provenance.evidenceOrigin] ?? 0) + 1; return acc; }, {}),
    evidenceRecords: evidenceRecords.length, resolvedGroups: resolution.groups.length, unresolved: resolution.unresolved.length,
  };
  return { bundleId: bundle.bundleId, ingestionMode: bundle.ingestionMode, entities, evidenceRecords, resolution, summary };
}
