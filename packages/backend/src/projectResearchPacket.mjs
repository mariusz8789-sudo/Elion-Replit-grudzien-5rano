import { createHash } from 'node:crypto';

export const PROJECT_RESEARCH_PACKET_VERSION = '1.0.0';
export const MAX_PROJECT_RESEARCH_QUERY_LENGTH = 500;
export const MAX_PROJECT_RESEARCH_EXCERPT_LENGTH = 900;

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function packetHash(seed) {
  return createHash('sha256').update(stableJson(seed)).digest('hex');
}

function normalizeQuery(query) {
  return String(query ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pl-PL');
}

function sourceExcerpt(text) {
  const normalized = String(text ?? '').trim();
  return normalized.length > MAX_PROJECT_RESEARCH_EXCERPT_LENGTH
    ? `${normalized.slice(0, MAX_PROJECT_RESEARCH_EXCERPT_LENGTH)}\n…(przycięte)`
    : normalized;
}

function sourceReference(projectId, material) {
  if (!material.id || !material.versionId || !material.contentSha256) {
    throw new Error('Project Research Packet requires an immutable material id, version id and content SHA-256.');
  }
  return {
    referenceId: `project:${projectId}:knowledge:${material.id}:version:${material.versionId}`,
    kind: 'project-knowledge',
    projectId,
    materialId: material.id,
    materialVersionId: material.versionId,
    materialVersion: material.version,
    title: material.title,
    fileName: material.fileName,
    mimeType: material.mimeType,
    byteSize: material.byteSize,
    contentSha256: material.contentSha256,
    topics: Array.isArray(material.topics) ? material.topics : [],
    sourceUrl: material.sourceUrl,
    extractionStatus: material.extractionStatus,
    epistemicStatus: material.epistemicStatus,
    provenance: material.provenance ?? {},
    excerpt: sourceExcerpt(material.extractedText),
    solverEffect: 'NONE',
  };
}

/**
 * Projects only current, RBAC-authorized Knowledge Ingestion material versions
 * into a deterministic source packet. It never selects a model, changes
 * solver capability, generates a scientific claim, or returns the original
 * binary artifact. The API authorization boundary remains the caller's
 * responsibility; callers pass only materials already scoped to their project.
 */
export function createProjectResearchPacket({ projectId, query, materials }) {
  const normalizedQuery = normalizeQuery(query);
  if (normalizedQuery.length > MAX_PROJECT_RESEARCH_QUERY_LENGTH) {
    throw new Error(`Project research query must not exceed ${MAX_PROJECT_RESEARCH_QUERY_LENGTH} characters.`);
  }
  const sources = (Array.isArray(materials) ? materials : [])
    .map((material) => sourceReference(projectId, material))
    .sort((left, right) => left.referenceId.localeCompare(right.referenceId));
  const status = sources.length > 0 ? 'RETRIEVED' : 'NO_MATCH';
  const seed = {
    contractVersion: PROJECT_RESEARCH_PACKET_VERSION,
    projectId,
    normalizedQuery,
    status,
    sourceVersions: sources.map((source) => ({
      referenceId: source.referenceId,
      contentSha256: source.contentSha256,
      extractionStatus: source.extractionStatus,
      epistemicStatus: source.epistemicStatus,
    })),
  };
  const packetFingerprint = `project_research_${packetHash(seed)}`;
  return {
    contractVersion: PROJECT_RESEARCH_PACKET_VERSION,
    packetId: packetFingerprint,
    projectId,
    status,
    normalizedQuery,
    sources,
    packetFingerprint,
    solverEffect: 'NONE',
    disclaimer: 'Project Research Packet zawiera wyłącznie uprawnione, wersjonowane referencje do materiałów projektu i ograniczone excerpty. Nie jest RAG-generowaną odpowiedzią, naukowym claimem, pełnym eksportem źródła, zmianą capability solvera ani wynikiem obliczeń. Każdy eksperyment nadal wymaga osobnego, prerejestrowanego protokołu i realnego execution.',
  };
}

export function serializeProjectResearchPacket(packet) {
  return stableJson(packet);
}
