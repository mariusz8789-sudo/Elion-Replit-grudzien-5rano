/**
 * Biological Data Integration (Genesis V3, Phase 8). A registry + retrieval contract for public
 * biological databases (Open Targets, Ensembl, Reactome, Gene Ontology, DisGeNET, ClinicalTrials.gov,
 * plus the existing UniProt / PDB / ChEMBL / PubChem). Every retrieved record is wrapped with full
 * provenance: source, source URL, accession ID, version/date, licence, confidence, epistemic status.
 *
 * HONESTY: this environment's egress is policy-blocked, so live retrieval returns BLOCKED_BY_RUNTIME
 * with the attempted URL and reason — NEVER fabricated biological data. The identical code path
 * produces provenance-carrying records on a network-enabled host (or via the offline supplied-bundle
 * path). `fetchImpl` is injectable so the retrieval + provenance logic is fully testable.
 */
/* global AbortController */
export const BIO_SOURCES_VERSION = 'genesis-biological-sources/1';

/** Registry of biological sources with official endpoints + the provenance each record must carry. */
export const BIOLOGICAL_SOURCES = Object.freeze({
  OPEN_TARGETS: { service: 'OPEN_TARGETS', kind: 'disease-target-association', license: 'CC0', url: (id) => `https://api.platform.opentargets.org/api/v4/graphql (target/disease ${id})`, provenance: ['associationScore', 'datatypeScores', 'version'] },
  ENSEMBL: { service: 'ENSEMBL', kind: 'gene', license: 'Apache-2.0/EMBL', url: (id) => `https://rest.ensembl.org/lookup/id/${id}?content-type=application/json`, provenance: ['ensemblRelease', 'assembly'] },
  REACTOME: { service: 'REACTOME', kind: 'pathway', license: 'CC-BY-4.0', url: (id) => `https://reactome.org/ContentService/data/query/${id}`, provenance: ['reactomeVersion'] },
  GENE_ONTOLOGY: { service: 'GENE_ONTOLOGY', kind: 'ontology-annotation', license: 'CC-BY-4.0', url: (id) => `https://api.geneontology.org/api/bioentity/${id}/function`, provenance: ['goReleaseDate', 'evidenceCode'] },
  DISGENET: { service: 'DISGENET', kind: 'gene-disease-association', license: 'CC-BY-NC-SA-4.0', url: (id) => `https://www.disgenet.org/api/gda/gene/${id}`, provenance: ['score', 'source', 'disgenetVersion'] },
  CLINICALTRIALS: { service: 'CLINICALTRIALS', kind: 'clinical-trial', license: 'PUBLIC_DOMAIN', url: (id) => `https://clinicaltrials.gov/api/v2/studies/${id}`, provenance: ['nctId', 'phase', 'status', 'lastUpdatePostDate'] },
  UNIPROT: { service: 'UNIPROT', kind: 'protein', license: 'CC-BY-4.0', url: (id) => `https://rest.uniprot.org/uniprotkb/${id}.json`, provenance: ['uniprotRelease'] },
  RCSB_PDB: { service: 'RCSB_PDB', kind: 'structure', license: 'CC0', url: (id) => `https://data.rcsb.org/rest/v1/core/entry/${id}`, provenance: ['depositDate', 'revisionDate'] },
  CHEMBL: { service: 'CHEMBL', kind: 'bioactivity', license: 'CC-BY-SA-3.0', url: (id) => `https://www.ebi.ac.uk/chembl/api/data/activity/${id}.json`, provenance: ['chemblRelease'] },
  PUBCHEM: { service: 'PUBCHEM', kind: 'compound', license: 'PUBLIC_DOMAIN', url: (id) => `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${id}/JSON`, provenance: [] },
});

export const BIO_SERVICES = Object.freeze(Object.keys(BIOLOGICAL_SOURCES));

async function defaultFetch(url, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try { const r = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } }); clearTimeout(to); return { ok: r.ok, status: r.status, text: r.ok ? await r.text() : null }; }
  catch (e) { clearTimeout(to); return { ok: false, error: String(e?.message ?? e) }; }
}

/** Wrap a retrieved raw record with the mandated provenance envelope. Never invents fields. */
export function wrapProvenance(service, id, raw, { retrievedAt = null, version = null, confidence = null } = {}) {
  const src = BIOLOGICAL_SOURCES[service];
  return {
    service, kind: src?.kind ?? null, accession: String(id),
    sourceUrl: src?.url(id) ?? null, license: src?.license ?? 'UNKNOWN',
    version, retrievedAt, confidence,
    epistemicStatus: 'DATABASE_REPORTED',
    provenanceComplete: Boolean(src && id && (src.url(id))),
    raw,
  };
}

/**
 * Retrieve one record from a biological source. Returns a provenance-wrapped record on success, or
 * BLOCKED_BY_RUNTIME with the attempted URL + reason when the source is unreachable — never fabricated.
 * `opts`: { fetchImpl?, retrievedAt?, parse? }
 */
export async function retrieveBiological({ service, id, fetchImpl = defaultFetch, retrievedAt = null, parse = (t) => JSON.parse(t) } = {}) {
  const src = BIOLOGICAL_SOURCES[service];
  if (!src) return { status: 'INVALID_INPUT', reason: `unknown biological source ${service}` };
  if (!id) return { status: 'INVALID_INPUT', reason: 'accession id required' };
  const url = src.url(id);
  const res = await fetchImpl(url);
  if (!res || !res.ok) {
    const blocked = res?.status === 403 || /CONNECT tunnel failed|403|ENOTFOUND|EAI_AGAIN|aborted|timeout/i.test(res?.error ?? '');
    return { status: 'BLOCKED_BY_RUNTIME', service, accession: String(id), attemptedUrl: url, httpStatus: res?.status ?? null, reason: blocked ? 'egress policy blocked / source unreachable — no data fabricated' : `retrieval failed: ${res?.error ?? res?.status}` };
  }
  let raw;
  try { raw = parse(res.text); } catch (e) { return { status: 'PARSE_FAILURE', service, accession: String(id), attemptedUrl: url, reason: String(e?.message ?? e).slice(0, 120) }; }
  return { status: 'COMPLETED', record: wrapProvenance(service, id, raw, { retrievedAt, version: raw?.version ?? null, confidence: raw?.score ?? raw?.associationScore ?? null }) };
}

/** Probe reachability of every biological source (all BLOCKED_BY_RUNTIME under blocked egress). */
export async function probeBiologicalSources({ fetchImpl = defaultFetch, services = BIO_SERVICES } = {}) {
  const results = [];
  for (const service of services) {
    const r = await retrieveBiological({ service, id: '__probe__', fetchImpl });
    results.push({ service, status: r.status, reachable: r.status === 'COMPLETED', reason: r.reason ?? null, attemptedUrl: r.attemptedUrl ?? BIOLOGICAL_SOURCES[service].url('__probe__') });
  }
  return { version: BIO_SOURCES_VERSION, probedAt: null, sources: results, anyReachable: results.some((r) => r.reachable), note: 'No biological data is fabricated; unreachable sources are BLOCKED_BY_RUNTIME with their attempted URL.' };
}
