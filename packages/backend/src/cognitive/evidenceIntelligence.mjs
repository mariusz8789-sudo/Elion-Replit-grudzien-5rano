/**
 * Evidence Intelligence + Claim Registry (Live Discovery Brain, Phases 3–4).
 *
 * Acquires and normalizes scientific evidence and derives a provenance-preserving claim
 * registry. HONESTY IS THE WHOLE POINT:
 *  - Live scientific sources (Europe PMC / RCSB PDB / PubChem / UniProt) are queried through
 *    a connector abstraction. In THIS environment the egress policy blocks those hosts, so a
 *    live query returns SOURCE_UNAVAILABLE — it is NEVER fabricated into evidence.
 *  - The legitimate, non-fabricated path is USER_SUPPLIED evidence: real public identifiers
 *    (DOI / PMID / PDB ID / PubChem CID) the caller provides, stored with full provenance and
 *    labelled USER_SUPPLIED — never presented as a live current search.
 *  - A model statement is NOT evidence. A claim only becomes SUPPORTED when a real source with
 *    an identifier backs it. No source → no strong claim.
 */
import { canonicalHash } from '../provenance.mjs';

export const SOURCE_TYPE = Object.freeze({ EUROPE_PMC: 'EUROPE_PMC', PUBMED: 'PUBMED', CROSSREF: 'CROSSREF', RCSB_PDB: 'RCSB_PDB', UNIPROT: 'UNIPROT', CHEMBL: 'CHEMBL', PUBCHEM: 'PUBCHEM', USER_SUPPLIED: 'USER_SUPPLIED' });
export const EVIDENCE_ORIGIN = Object.freeze({ LIVE: 'LIVE_EVIDENCE', CACHED: 'CACHED_EVIDENCE', FIXTURE: 'FIXTURE_EVIDENCE', USER_SUPPLIED: 'USER_SUPPLIED_EVIDENCE' });
export const CLAIM_STATUS = Object.freeze({ SUPPORTED: 'SUPPORTED', CONTESTED: 'CONTESTED', WEAK: 'WEAK', UNSUPPORTED: 'UNSUPPORTED', RETRACTED_OR_INVALIDATED: 'RETRACTED_OR_INVALIDATED', HUMAN_REVIEW_REQUIRED: 'HUMAN_REVIEW_REQUIRED' });
export const SOURCE_STATUS = Object.freeze({ AVAILABLE: 'AVAILABLE', SOURCE_UNAVAILABLE: 'SOURCE_UNAVAILABLE' });

/** Live source connectors. `liveFetch` is injectable so tests never touch the network. */
export function defaultConnectors() {
  const endpoints = {
    [SOURCE_TYPE.EUROPE_PMC]: (q) => `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(q)}&format=json&pageSize=5`,
    [SOURCE_TYPE.RCSB_PDB]: (id) => `https://data.rcsb.org/rest/v1/core/entry/${encodeURIComponent(id)}`,
    [SOURCE_TYPE.PUBCHEM]: (name) => `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/property/CanonicalSMILES/JSON`,
  };
  return {
    endpoints,
    // Attempts a real HTTPS call; on ANY failure (policy block / network) returns unavailable.
    liveFetch: async (source, query) => {
      const url = endpoints[source]?.(query);
      if (!url) return { status: SOURCE_STATUS.SOURCE_UNAVAILABLE, reason: `no connector for ${source}` };
      try {
        const timeout = globalThis.AbortSignal?.timeout ? globalThis.AbortSignal.timeout(15000) : undefined;
        const res = await fetch(url, { signal: timeout });
        if (!res.ok) return { status: SOURCE_STATUS.SOURCE_UNAVAILABLE, reason: `HTTP ${res.status}`, url };
        return { status: SOURCE_STATUS.AVAILABLE, data: await res.json(), url };
      } catch (e) {
        return { status: SOURCE_STATUS.SOURCE_UNAVAILABLE, reason: String(e?.message ?? e), url };
      }
    },
  };
}

/**
 * Probe which live sources are actually reachable in this environment. Returns honest
 * per-source availability — used to label the campaign LIVE vs. capability-blocked.
 */
export async function probeSources(sources = [SOURCE_TYPE.EUROPE_PMC, SOURCE_TYPE.RCSB_PDB, SOURCE_TYPE.PUBCHEM], { connectors = defaultConnectors(), probeQuery = 'test' } = {}) {
  const out = {};
  for (const s of sources) {
    const r = await connectors.liveFetch(s, s === SOURCE_TYPE.RCSB_PDB ? '6LU7' : probeQuery);
    out[s] = { status: r.status, reason: r.reason ?? null };
  }
  return out;
}

/** Normalize a USER_SUPPLIED evidence record — real identifiers only, full provenance. */
export function ingestUserEvidence(records = [], { campaignId, projectId } = {}) {
  const out = [];
  for (const r of records) {
    if (!r || typeof r !== 'object') continue;
    const identifier = r.doi ?? r.pmid ?? r.pdbId ?? r.cid ?? r.identifier ?? null;
    if (!identifier) continue; // USER_SUPPLIED evidence MUST carry a real public identifier
    const sourceType = SOURCE_TYPE[r.sourceType] ?? SOURCE_TYPE.USER_SUPPLIED;
    const direction = r.direction === 'contradicting' ? 'contradicting' : 'supporting';
    const claimText = r.claimText ?? null;
    // evidenceId derives from SOURCE CONTENT (stable across campaigns/tenants) so a caller can
    // predict it: ingest evidence → reference the returned id in claims → registry links cleanly.
    const evidenceId = 'ev_' + canonicalHash({ sourceType, identifier: String(identifier), direction, claimText }).slice(0, 16);
    out.push({
      evidenceId, sourceType, origin: EVIDENCE_ORIGIN.USER_SUPPLIED,
      identifier: String(identifier), title: r.title ?? null, authors: r.authors ?? null,
      publicationDate: r.publicationDate ?? null, sourceLocator: r.url ?? r.sourceLocator ?? null,
      direction, claimText, campaignId: campaignId ?? null, projectId: projectId ?? null,
      retrievalTimestamp: null,
      note: 'USER_SUPPLIED — a real public identifier provided by the caller; NOT a live search result.',
      sourceHash: canonicalHash({ identifier: String(identifier), title: r.title ?? null }),
    });
  }
  return out;
}

/**
 * Build a claim registry from claims + an evidence index. A claim is SUPPORTED only when a
 * real supporting source (with an identifier) backs it. Model-proposed text with no source is
 * never SUPPORTED. Referencing an evidence ID that does not exist is rejected (invented-source
 * guard).
 */
export function buildClaimRegistry(claims = [], evidence = []) {
  const byId = new Map(evidence.map((e) => [e.evidenceId, e]));
  const registry = [];
  const rejected = [];
  for (const c of claims) {
    const supportingIds = (c.supportingEvidenceIds ?? []).filter((id) => byId.has(id));
    const contradictingIds = (c.contradictingEvidenceIds ?? []).filter((id) => byId.has(id));
    const invented = [...(c.supportingEvidenceIds ?? []), ...(c.contradictingEvidenceIds ?? [])].filter((id) => !byId.has(id));
    if (invented.length) { rejected.push({ claim: c.text, reason: 'references non-existent evidence IDs (invented-source guard)', invented }); continue; }
    let status;
    if (supportingIds.length && contradictingIds.length) status = CLAIM_STATUS.CONTESTED;
    else if (supportingIds.length >= 1) status = CLAIM_STATUS.SUPPORTED;
    else if (contradictingIds.length) status = CLAIM_STATUS.RETRACTED_OR_INVALIDATED;
    else if (c.proposedByModel) status = CLAIM_STATUS.UNSUPPORTED; // model text, no source
    else status = CLAIM_STATUS.WEAK;
    registry.push({
      claimId: 'clm_' + canonicalHash({ text: c.text, supportingIds, contradictingIds }).slice(0, 16),
      normalizedClaim: String(c.text ?? '').trim(), claimType: c.claimType ?? 'ASSOCIATION',
      supportingEvidenceIds: supportingIds, contradictingEvidenceIds: contradictingIds,
      confidence: supportingIds.length >= 2 ? 'moderate' : supportingIds.length === 1 ? 'low' : 'none',
      confidenceRationale: `${supportingIds.length} supporting, ${contradictingIds.length} contradicting real source(s)`,
      producedBy: c.proposedByModel ? 'MODEL_PROPOSED (requires source)' : (c.producedBy ?? 'DETERMINISTIC'),
      status,
    });
  }
  return { registry, rejected };
}

/** Summary for the dossier. */
export function evidenceSummary(evidence, claimRegistry) {
  const byOrigin = {}; const bySource = {};
  for (const e of evidence) { byOrigin[e.origin] = (byOrigin[e.origin] ?? 0) + 1; bySource[e.sourceType] = (bySource[e.sourceType] ?? 0) + 1; }
  const byStatus = {};
  for (const c of claimRegistry) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
  return { totalEvidence: evidence.length, byOrigin, bySource, totalClaims: claimRegistry.length, claimsByStatus: byStatus };
}
