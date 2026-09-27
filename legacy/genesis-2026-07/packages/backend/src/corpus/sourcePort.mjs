/**
 * Genesis Scientific Corpus Factory V1 — canonical source port + taxonomy (Corpus Mandate
 * Phases 3, 6, 7). The domain (Evidence Intelligence, Truth Engine, Target Intelligence,
 * Reasoning Brain) must not care whether a scientific record arrived from a verified offline
 * bundle, a live API, or a user. This module defines the stable enums and the ingestion
 * router; adapters (bundle/live) implement the port behind it.
 *
 * ORTHOGONAL DIMENSIONS — these must NEVER silently collapse into one another:
 *   ingestion mode  (HOW it arrived)        LIVE_API | VERIFIED_BUNDLE | USER_SUPPLIED | BULK_IMPORT | TEST_FIXTURE
 *   evidence origin (WHAT kind of thing)     PUBLISHER_REPORTED | DATABASE_REPORTED | USER_SUPPLIED | COMPUTED | MODEL_INFERRED | HEURISTIC | TEST_FIXTURE
 *   rights/license  (LEGAL reuse)            CC0 | CC-BY | PUBLISHER_SPECIFIC | PUBLIC_DOMAIN | UNKNOWN
 *   quality         (EPISTEMIC assessment)   handled downstream by Evidence Intelligence
 * Licence status is NOT evidence quality. A non-CC0 record is not "unverified".
 */
export const SOURCE_SERVICE = Object.freeze({ EUROPE_PMC: 'EUROPE_PMC', RCSB_PDB: 'RCSB_PDB', PUBCHEM: 'PUBCHEM', CHEMBL: 'CHEMBL', UNIPROT: 'UNIPROT' });
export const ENTITY_TYPE = Object.freeze({ ARTICLE: 'ScientificArticle', PROTEIN: 'ProteinRecord', STRUCTURE: 'ProteinStructure', COMPOUND: 'ChemicalCompound', BIOACTIVITY: 'BioactivityRecord', ASSAY: 'AssayRecord' });
export const INGESTION_MODE = Object.freeze({ LIVE_API: 'LIVE_API', VERIFIED_BUNDLE: 'VERIFIED_BUNDLE', USER_SUPPLIED: 'USER_SUPPLIED', BULK_IMPORT: 'BULK_IMPORT', TEST_FIXTURE: 'TEST_FIXTURE' });
export const EVIDENCE_ORIGIN = Object.freeze({ PUBLISHER_REPORTED: 'PUBLISHER_REPORTED', DATABASE_REPORTED: 'DATABASE_REPORTED', USER_SUPPLIED: 'USER_SUPPLIED', COMPUTED: 'COMPUTED', MODEL_INFERRED: 'MODEL_INFERRED', HEURISTIC: 'HEURISTIC', TEST_FIXTURE: 'TEST_FIXTURE' });
export const RIGHTS = Object.freeze({ CC0: 'CC0', CC_BY: 'CC-BY', PUBLISHER_SPECIFIC: 'PUBLISHER_SPECIFIC', PUBLIC_DOMAIN: 'PUBLIC_DOMAIN', UNKNOWN: 'UNKNOWN' });
export const HASH_ALGO = 'sha256';
export const PORT_STATUS = Object.freeze({ OK: 'OK', NOT_FOUND: 'NOT_FOUND', CAPABILITY_BLOCKED: 'CAPABILITY_BLOCKED', INTEGRITY_FAILURE: 'INTEGRITY_FAILURE', PARSE_FAILURE: 'PARSE_FAILURE' });

/** Default evidence origin implied by a source service (a DATABASE record vs a PUBLISHER article). */
export function defaultOrigin(sourceService) {
  return sourceService === SOURCE_SERVICE.EUROPE_PMC ? EVIDENCE_ORIGIN.PUBLISHER_REPORTED : EVIDENCE_ORIGIN.DATABASE_REPORTED;
}

/**
 * A ScientificDataSourcePort adapter implements:
 *   getById(sourceService, sourceId) -> { status, entity?, provenance?, raw? }
 *   query(sourceService, plan)       -> { status, entities?, provenance? }
 *   getRawPayload(ref)               -> { status, raw? }
 *   capabilities()                   -> { modes:[...], services:[...] }
 * The ingestion router routes a request to the right adapter and NORMALIZES the result,
 * so the domain sees one stable evidence contract regardless of provenance path.
 */
export function createIngestionRouter({ bundleAdapter = null, liveAdapter = null, userAdapter = null } = {}) {
  const byMode = {
    [INGESTION_MODE.VERIFIED_BUNDLE]: bundleAdapter,
    [INGESTION_MODE.TEST_FIXTURE]: bundleAdapter, // a fixture bundle uses the same adapter, TEST_FIXTURE-labelled
    [INGESTION_MODE.LIVE_API]: liveAdapter,
    [INGESTION_MODE.USER_SUPPLIED]: userAdapter,
  };
  return {
    capabilities() {
      const modes = Object.entries(byMode).filter(([, a]) => a).map(([m]) => m);
      return { modes, services: Object.values(SOURCE_SERVICE) };
    },
    getById({ mode, sourceService, sourceId }) {
      const adapter = byMode[mode];
      if (!adapter) return { status: PORT_STATUS.CAPABILITY_BLOCKED, reason: `no adapter for ingestion mode ${mode}` };
      return adapter.getById(sourceService, sourceId);
    },
    query({ mode, sourceService, plan }) {
      const adapter = byMode[mode];
      if (!adapter) return { status: PORT_STATUS.CAPABILITY_BLOCKED, reason: `no adapter for ingestion mode ${mode}` };
      return adapter.query(sourceService, plan);
    },
  };
}
