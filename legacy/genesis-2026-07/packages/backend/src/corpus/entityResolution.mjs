/**
 * Explicit, auditable entity resolution (Corpus Mandate Phase 11).
 * Identity is by SOURCE IDENTIFIERS, never by human-readable name similarity and never
 * because "a model says they look equivalent". Every decision carries its method + basis;
 * ambiguous resolution stays AMBIGUOUS.
 */
export const RESOLUTION = Object.freeze({ RESOLVED: 'RESOLVED', AMBIGUOUS: 'AMBIGUOUS', UNRESOLVED: 'UNRESOLVED' });

/** Ordered identity keys per entity type — the FIRST present, strong identifier wins. */
const IDENTITY_KEYS = {
  ScientificArticle: ['doi', 'pmcid', 'pmid'],
  ProteinRecord: ['accession'],
  ProteinStructure: ['pdbId'],
  ChemicalCompound: ['inchiKey', 'cid'], // canonical SMILES is a representation, NOT the sole identity
  BioactivityRecord: ['activityId'],
};

/** Canonical identity of one normalized entity. Returns null when no strong id is present. */
export function identityOf(entity) {
  const keys = IDENTITY_KEYS[entity.entityType];
  if (!keys) return null;
  for (const k of keys) {
    const v = entity.identifiers?.[k];
    if (v) return { type: entity.entityType, key: k, value: String(v), canonicalId: `${entity.entityType}:${k}:${v}` };
  }
  return null;
}

/**
 * Resolve a set of normalized entities into identity groups. Two entities merge ONLY if they
 * share a strong source identifier. Name-only overlap never merges. Entities with no strong id
 * are UNRESOLVED (kept separate, flagged).
 */
export function resolveEntities(entities = []) {
  const groups = new Map(); // canonicalId -> { identity, members:[] }
  const unresolved = [];
  for (const e of entities) {
    const id = identityOf(e);
    if (!id) { unresolved.push({ entity: e, reason: 'no strong source identifier', resolution: RESOLUTION.UNRESOLVED }); continue; }
    if (!groups.has(id.canonicalId)) groups.set(id.canonicalId, { identity: id, members: [], resolutionMethod: `source-identifier:${id.key}`, resolution: RESOLUTION.RESOLVED });
    groups.get(id.canonicalId).members.push(e);
  }
  return { groups: [...groups.values()], unresolved };
}

/**
 * Would two entities merge? Explicit predicate with a stated basis. NEVER true on name alone.
 */
export function sameEntity(a, b) {
  const ia = identityOf(a); const ib = identityOf(b);
  if (!ia || !ib) return { same: false, resolution: RESOLUTION.UNRESOLVED, basis: 'one or both lack a strong identifier' };
  if (ia.type !== ib.type) return { same: false, resolution: RESOLUTION.RESOLVED, basis: 'different entity types' };
  if (ia.canonicalId === ib.canonicalId) return { same: true, resolution: RESOLUTION.RESOLVED, basis: `shared ${ia.key}=${ia.value}` };
  // Different strong ids of the same type: not mergeable here (could be genuinely different or a
  // cross-id case requiring a source-backed mapping) — stay AMBIGUOUS, never guess.
  return { same: false, resolution: RESOLUTION.AMBIGUOUS, basis: `distinct ${ia.key} vs ${ib.key} — no source-backed cross-mapping` };
}
