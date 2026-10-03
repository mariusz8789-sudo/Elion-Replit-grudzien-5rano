/**
 * Which retrieved sources a ResearchRun plan may cite, and how a hypothesis's citations are resolved.
 * Pure functions over the run's KNOWLEDGE_SNAPSHOT payloads; no store, no network.
 */
import { PROVENANCE_CLASS } from '../provenanceClass.mjs';

const STR = (value, max) => typeof value === 'string' && value.trim().length > 0 ? value.trim().slice(0, max) : null;

/** Stable id of one snapshot: the request plus how many attempts of the same request came before it. */
export function snapshotIdOf(snapshot) {
  return snapshot?.snapshotId ?? `lit-${snapshot?.requestFingerprint}`;
}

/* ---------------- citation catalog: what a plan may cite ---------------- */

function citationOf(source, snapshot, role) {
  return {
    sourceId: source.sourceId,
    title: source.title,
    doi: source.doi ?? null,
    pmid: source.pmid ?? null,
    pmcid: source.pmcid ?? null,
    canonicalUrl: source.canonicalUrl ?? null,
    sourceProvider: source.sourceProvider ?? null,
    licenceStatus: source.licenceStatus ?? 'UNKNOWN',
    retrievedAt: source.retrievalTimestamp ?? source.provenance?.retrievedAt ?? snapshot.retrievedAt ?? null,
    recordHash: source.provenance?.recordHash ?? null,
    responseHash: source.provenance?.responseHash ?? null,
    metadataHash: source.metadataHash ?? null,
    snapshotId: snapshotIdOf(snapshot),
    retrievalRole: role,
    provenanceClass: PROVENANCE_CLASS.SOURCE_FACT,
  };
}

/** Every source this run actually retrieved, by sourceId. The first retrieval of a source is its citation. */
export function literatureCatalogOf(literatureSnapshots = []) {
  const catalog = new Map();
  for (const snapshot of literatureSnapshots) {
    if (snapshot.status === 'BLOCKED') continue;
    for (const source of snapshot.primary?.sources ?? []) if (!catalog.has(source.sourceId)) catalog.set(source.sourceId, citationOf(source, snapshot, 'CLAIM_CONTEXT'));
    for (const source of snapshot.contradictionSearch?.sources ?? []) if (!catalog.has(source.sourceId)) catalog.set(source.sourceId, citationOf(source, snapshot, 'CONTRADICTION_SEARCH'));
  }
  return catalog;
}

const STRS = (value) => (Array.isArray(value) ? value : []).map((v) => STR(v, 500)).filter(Boolean).slice(0, 20);

/**
 * The literature block of one proposed hypothesis. A cited sourceId must be one this run retrieved; anything
 * else is kept visibly as UNKNOWN (never resolved, never invented). Contradiction-search candidates are
 * shown on every hypothesis whether or not the model mentioned them.
 */
export function hypothesisLiteratureOf(raw, catalog) {
  const citations = [];
  const unresolvedSourceRefs = [];
  for (const [field, relationship] of [['sourceRefs', 'SUPPORTS'], ['contradictingSourceRefs', 'CONTRADICTS']]) {
    for (const ref of STRS(raw?.[field])) {
      const found = catalog.get(ref);
      if (!found) { unresolvedSourceRefs.push({ field, ref, reason: 'SOURCE_NOT_RETRIEVED_IN_THIS_RUN', provenanceClass: PROVENANCE_CLASS.UNKNOWN }); continue; }
      if (citations.some((c) => c.sourceId === ref && c.relationship === relationship)) continue;
      citations.push({ ...found, relationship, relationshipStatus: 'PROPOSED', relationshipProvenanceClass: PROVENANCE_CLASS.MODEL_PROPOSAL, epistemicStatus: 'NOT_EVIDENCE' });
    }
  }
  const contradictionCandidates = [...catalog.values()]
    .filter((c) => c.retrievalRole === 'CONTRADICTION_SEARCH')
    .map((c) => ({ sourceId: c.sourceId, title: c.title, recordHash: c.recordHash, snapshotId: c.snapshotId, relationship: 'UNKNOWN', provenanceClass: PROVENANCE_CLASS.UNKNOWN }));
  return {
    status: citations.length > 0 ? 'CITED' : 'UNKNOWN',
    provenanceClass: citations.length > 0 ? PROVENANCE_CLASS.SOURCE_FACT : PROVENANCE_CLASS.UNKNOWN,
    citations,
    contradictingCitations: citations.filter((c) => c.relationship === 'CONTRADICTS').map((c) => c.sourceId),
    contradictionCandidates,
    unresolvedSourceRefs,
  };
}
