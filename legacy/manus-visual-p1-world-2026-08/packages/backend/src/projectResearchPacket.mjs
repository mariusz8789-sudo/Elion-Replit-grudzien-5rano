import { createHash } from 'node:crypto';

export const PROJECT_RESEARCH_PACKET_VERSION = '1.0.0';
export const MAX_PROJECT_RESEARCH_QUERY_LENGTH = 500;
export const MAX_PROJECT_RESEARCH_EXCERPT_LENGTH = 900;
export const PROJECT_RESEARCH_REPLAY_VERSION = '1.0.0';

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

/**
 * Rebuilds a packet from the exact immutable source versions named by an
 * earlier packet. The caller must resolve those versions through the project
 * RBAC boundary before calling this function. MATCH proves only packet
 * identity; it does not prove scientific validity, source truth or solver
 * correctness.
 */
export function replayProjectResearchPacket({ projectId, expectedPacket, materials }) {
  if (!expectedPacket || expectedPacket.projectId !== projectId) {
    return {
      contractVersion: PROJECT_RESEARCH_REPLAY_VERSION,
      status: 'PROJECT_MISMATCH',
      expectedPacketFingerprint: expectedPacket?.packetFingerprint ?? null,
      replayedPacketFingerprint: null,
      packet: null,
      disclaimer: 'Replay wymaga packetu należącego do tego samego projektu. Nie wykonano obliczeń ani nie zmieniono solvera.',
    };
  }
  const expectedSourceIds = (Array.isArray(expectedPacket.sources) ? expectedPacket.sources : [])
    .map((source) => source?.referenceId)
    .filter((referenceId) => typeof referenceId === 'string')
    .sort((left, right) => left.localeCompare(right));
  const availableSourceIds = (Array.isArray(materials) ? materials : [])
    .map((material) => sourceReference(projectId, material).referenceId)
    .sort((left, right) => left.localeCompare(right));
  if (expectedSourceIds.length !== availableSourceIds.length || expectedSourceIds.some((id, index) => id !== availableSourceIds[index])) {
    return {
      contractVersion: PROJECT_RESEARCH_REPLAY_VERSION,
      status: 'SOURCE_VERSION_UNAVAILABLE',
      expectedPacketFingerprint: expectedPacket.packetFingerprint ?? null,
      replayedPacketFingerprint: null,
      packet: null,
      disclaimer: 'Replay nie odnalazł kompletu immutable wersji źródeł wskazanych przez packet. Nie wykonano obliczeń ani nie zmieniono solvera.',
    };
  }
  const packet = createProjectResearchPacket({
    projectId,
    query: expectedPacket.normalizedQuery ?? '',
    materials,
  });
  const status = packet.packetFingerprint === expectedPacket.packetFingerprint ? 'MATCH' : 'DRIFT';
  return {
    contractVersion: PROJECT_RESEARCH_REPLAY_VERSION,
    status,
    expectedPacketFingerprint: expectedPacket.packetFingerprint ?? null,
    replayedPacketFingerprint: packet.packetFingerprint,
    packet,
    disclaimer: 'MATCH oznacza, że wskazane immutable wersje źródeł odtworzyły ten sam packet. Nie oznacza prawdziwości materiału, niezależnej recenzji, poprawności naukowej ani zmiany capability solvera.',
  };
}

export function serializeProjectResearchPacket(packet) {
  return stableJson(packet);
}
