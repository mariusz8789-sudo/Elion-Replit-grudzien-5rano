import { canonicalHash } from '../provenance.mjs';

export const LITERATURE_RETRIEVAL_STATUS = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  METADATA_ONLY: 'METADATA_ONLY',
  NO_ACCESS: 'NO_ACCESS',
  BLOCKED_BY_LICENSE: 'BLOCKED_BY_LICENSE',
  BLOCKED_BY_NETWORK: 'BLOCKED_BY_NETWORK',
  NOT_FOUND: 'NOT_FOUND',
});

export const LITERATURE_LICENCE_STATUS = Object.freeze({
  APPROVED: 'APPROVED',
  CONDITIONAL: 'CONDITIONAL',
  BLOCKED: 'BLOCKED',
  UNKNOWN: 'UNKNOWN',
});

const APPROVED_LICENCES = new Set(['CC0', 'CC0-1.0']);
const CONDITIONAL_LICENCES = new Set(['CC-BY', 'CC-BY-4.0', 'CC-BY-3.0', 'CC-BY-SA', 'CC-BY-SA-4.0']);
const BLOCKED_LICENCES = new Set(['CC-BY-NC', 'CC-BY-NC-4.0', 'CC-BY-NC-ND', 'CC-BY-NC-ND-4.0']);

export function classifyLiteratureLicence(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { licence: null, licenceStatus: LITERATURE_LICENCE_STATUS.UNKNOWN };
  }
  const licence = value.trim().toUpperCase().replaceAll('_', '-').replace(/\s+/g, '-');
  if (APPROVED_LICENCES.has(licence)) return { licence, licenceStatus: LITERATURE_LICENCE_STATUS.APPROVED };
  if (CONDITIONAL_LICENCES.has(licence)) return { licence, licenceStatus: LITERATURE_LICENCE_STATUS.CONDITIONAL };
  if (BLOCKED_LICENCES.has(licence) || licence.includes('-NC')) {
    return { licence, licenceStatus: LITERATURE_LICENCE_STATUS.BLOCKED };
  }
  return { licence, licenceStatus: LITERATURE_LICENCE_STATUS.UNKNOWN };
}

function canonicalIdentity(source) {
  if (source.doi) return `doi:${source.doi.toLowerCase()}`;
  if (source.pmid) return `pmid:${source.pmid}`;
  if (source.pmcid) return `pmcid:${source.pmcid.toUpperCase()}`;
  return `source:${source.sourceId}`;
}

export function deduplicateLiteratureSources(sources) {
  const unique = new Map();
  for (const source of sources) {
    const identity = canonicalIdentity(source);
    if (!unique.has(identity)) unique.set(identity, source);
  }
  return [...unique.values()];
}

export function literatureMetadataHash(source) {
  return canonicalHash({
    sourceId: source.sourceId,
    title: source.title,
    authors: source.authors,
    doi: source.doi,
    pmid: source.pmid,
    pmcid: source.pmcid,
    canonicalUrl: source.canonicalUrl,
    publicationDate: source.publicationDate,
    sourceProvider: source.sourceProvider,
    licence: source.licence,
    licenceStatus: source.licenceStatus,
    fullTextAvailability: source.fullTextAvailability,
  });
}

export function validateLiteratureQuery(query) {
  const text = typeof query?.text === 'string' ? query.text.trim() : '';
  if (text.length < 2 || text.length > 1_000) {
    return { ok: false, error: 'INVALID_QUERY', message: 'Literature query must contain 2-1000 characters.' };
  }
  const limit = Number.isInteger(query?.limit) ? query.limit : 20;
  if (limit < 1 || limit > 100) {
    return { ok: false, error: 'INVALID_LIMIT', message: 'Literature query limit must be between 1 and 100.' };
  }
  return { ok: true, value: { text, limit } };
}
