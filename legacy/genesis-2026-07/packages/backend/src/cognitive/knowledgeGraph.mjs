/**
 * Scientific Knowledge Graph (Genesis V3, Phase 4). Connects Disease / Gene / Protein / Ligand /
 * Compound / Pathway / Publication / Evidence with PROVENANCE ON EVERY EDGE. Nodes and edges are
 * derived only from REAL ingested evidence (corpus entities, provenance) and REAL campaign outputs
 * (candidates, off-target predictions). Nothing is invented: node/edge types that require external
 * biological databases (Disease/Gene associations, Pathways from Open Targets / Reactome / GO /
 * DisGeNET) appear ONLY when such data is supplied — otherwise they are simply absent, never faked.
 *
 * Off-target edges are MODEL_INFERRED (ADMET-AI); bioactivity edges carry the source's provenance;
 * candidate→target edges are COMPUTED. Every edge records its epistemic status.
 */
export const KNOWLEDGE_GRAPH_VERSION = 'genesis-knowledge-graph/1';

export const NODE_TYPE = Object.freeze({
  DISEASE: 'Disease', GENE: 'Gene', PROTEIN: 'Protein', LIGAND: 'Ligand', COMPOUND: 'Compound',
  PATHWAY: 'Pathway', PUBLICATION: 'Publication', EVIDENCE: 'Evidence', TARGET: 'Target', STRUCTURE: 'Structure',
});
export const EDGE_TYPE = Object.freeze({
  ENCODES: 'ENCODES', TARGETS: 'TARGETS', OFF_TARGET: 'OFF_TARGET', HAS_BIOACTIVITY: 'HAS_BIOACTIVITY',
  SUPPORTED_BY: 'SUPPORTED_BY', CITES: 'CITES', ASSOCIATED_WITH: 'ASSOCIATED_WITH', PARTICIPATES_IN: 'PARTICIPATES_IN',
  HAS_STRUCTURE: 'HAS_STRUCTURE',
});

/**
 * Build a knowledge graph. Inputs:
 *   ingest   — corpus ingest result { entities:[{entity, provenance}], evidenceRecords }
 *   dossier  — a campaign Discovery Dossier (candidates + off-target) (optional)
 *   target   — { targetName, gene?, accession? } (optional)
 *   biologicalAssociations — supplied Disease/Gene/Pathway associations with provenance (optional;
 *              absent in-sandbox because Open Targets / Reactome / GO / DisGeNET egress is blocked)
 */
export function buildKnowledgeGraph({ ingest = { entities: [] }, dossier = null, target = null, biologicalAssociations = null } = {}) {
  const nodes = new Map();
  const edges = [];
  const addNode = (id, type, label, provenance) => { if (!nodes.has(id)) nodes.set(id, { id, type, label, provenance }); return id; };
  const addEdge = (from, to, type, provenance, extra = {}) => { if (from && to) edges.push({ id: `${from}|${type}|${to}`, from, to, type, provenance, ...extra }); };

  // ── Corpus entities (real ingested evidence, each carrying provenance) ─────────────────────────
  for (const e of ingest.entities ?? []) {
    const ent = e.entity; const prov = e.provenance ?? {};
    const p = { source: prov.sourceService, sourceId: prov.sourceId, sourceUrl: prov.sourceUrl ?? null, contentHash: prov.contentHash ?? null, ingestionMode: prov.ingestionMode, epistemicStatus: prov.evidenceOrigin ?? 'DATABASE_REPORTED' };
    if (ent?.entityType === 'ProteinRecord') {
      const id = addNode(`protein:${ent.identifiers?.accession}`, NODE_TYPE.PROTEIN, ent.proteinName ?? ent.identifiers?.accession, p);
      for (const x of ent.crossReferences ?? []) if (/HGNC|GeneID|Ensembl/i.test(x.db ?? '')) { const g = addNode(`gene:${x.db}:${x.id}`, NODE_TYPE.GENE, x.id, p); addEdge(g, id, EDGE_TYPE.ENCODES, p); }
    } else if (ent?.entityType === 'ChemicalCompound') {
      addNode(`compound:${ent.identifiers?.cid ?? ent.identifiers?.inchiKey}`, NODE_TYPE.COMPOUND, ent.identifiers?.cid ?? ent.identifiers?.inchiKey, p);
    } else if (ent?.entityType === 'ScientificArticle') {
      addNode(`pub:${ent.identifiers?.pmid ?? ent.identifiers?.doi}`, NODE_TYPE.PUBLICATION, ent.title ?? ent.identifiers?.pmid, p);
    } else if (ent?.entityType === 'ProteinStructure') {
      addNode(`structure:${ent.identifiers?.pdbId}`, NODE_TYPE.STRUCTURE, ent.identifiers?.pdbId, p);
    } else if (ent?.entityType === 'BioactivityRecord') {
      const evId = addNode(`evidence:${ent.identifiers?.activityId}`, NODE_TYPE.EVIDENCE, `${ent.standardType ?? 'activity'} ${ent.standardValue ?? ''}${ent.standardUnits ?? ''}`, p);
      const compId = ent.identifiers?.moleculeChemblId ? addNode(`compound:${ent.identifiers.moleculeChemblId}`, NODE_TYPE.COMPOUND, ent.identifiers.moleculeChemblId, p) : null;
      const tgtId = ent.identifiers?.targetChemblId ? addNode(`protein:${ent.identifiers.targetChemblId}`, NODE_TYPE.PROTEIN, ent.targetPrefName ?? ent.identifiers.targetChemblId, p) : null;
      if (compId && tgtId) addEdge(compId, tgtId, EDGE_TYPE.HAS_BIOACTIVITY, p, { via: evId, standardType: ent.standardType, standardValue: ent.standardValue, standardUnits: ent.standardUnits });
    }
  }

  // ── Target ─────────────────────────────────────────────────────────────────────────────────────
  let targetId = null;
  if (target?.targetName) {
    targetId = addNode(`target:${target.accession ?? target.targetName}`, NODE_TYPE.TARGET, target.targetName, { source: 'campaign', epistemicStatus: 'EVIDENCE_BACKED_CLAIM' });
    if (target.accession) addEdge(`protein:${target.accession}`, targetId, EDGE_TYPE.ASSOCIATED_WITH, { source: 'campaign', epistemicStatus: 'COMPUTED' });
  }

  // ── Candidates + off-target liability (real campaign outputs) ──────────────────────────────────
  for (const c of dossier?.candidates ?? []) {
    const ligId = addNode(`ligand:${c.candidateId}`, NODE_TYPE.LIGAND, c.structure ?? c.candidateId, { source: 'campaign:candidateGenV2', epistemicStatus: 'COMPUTED', note: c.provenance?.candidateOrigin });
    if (targetId) addEdge(ligId, targetId, EDGE_TYPE.TARGETS, { source: 'campaign', epistemicStatus: 'COMPUTED', note: 'computational campaign candidate for the target' }, { finalScore: c.finalScore ?? null, docking: c.docking?.bestAffinityKcalMol ?? null });
    for (const ot of c.offTarget?.topOffTargets ?? []) {
      const protId = addNode(`protein:gene:${ot.gene}`, NODE_TYPE.PROTEIN, `${ot.protein} (${ot.gene})`, { source: 'ADMET-AI', epistemicStatus: 'MODEL_INFERRED' });
      const geneId = addNode(`gene:${ot.gene}`, NODE_TYPE.GENE, ot.gene, { source: 'ADMET-AI', epistemicStatus: 'MODEL_INFERRED' });
      addEdge(geneId, protId, EDGE_TYPE.ENCODES, { source: 'HGNC-symbol', epistemicStatus: 'DATABASE_REPORTED' });
      addEdge(ligId, protId, EDGE_TYPE.OFF_TARGET, { source: 'ADMET-AI (Tox21)', epistemicStatus: 'MODEL_INFERRED', note: 'predicted off-target liability, NOT experimental binding' }, { probability: ot.probability, flag: ot.flag });
    }
  }

  // ── Supplied biological associations (Disease/Gene/Pathway) — external DBs, absent if egress-blocked ─
  const bioBlocked = !biologicalAssociations;
  for (const a of biologicalAssociations?.associations ?? []) {
    const p = { source: a.source, sourceId: a.sourceId, sourceUrl: a.sourceUrl ?? null, epistemicStatus: a.epistemicStatus ?? 'DATABASE_REPORTED', ingestionMode: biologicalAssociations.ingestionMode };
    if (a.disease) addNode(`disease:${a.diseaseId ?? a.disease}`, NODE_TYPE.DISEASE, a.disease, p);
    if (a.pathway) addNode(`pathway:${a.pathwayId ?? a.pathway}`, NODE_TYPE.PATHWAY, a.pathway, p);
    if (a.disease && a.gene) addEdge(`gene:${a.gene}`, `disease:${a.diseaseId ?? a.disease}`, EDGE_TYPE.ASSOCIATED_WITH, p, { score: a.score ?? null });
    if (a.gene && a.pathway) addEdge(`gene:${a.gene}`, `pathway:${a.pathwayId ?? a.pathway}`, EDGE_TYPE.PARTICIPATES_IN, p);
  }

  const nodeList = [...nodes.values()];
  const byType = {};
  for (const n of nodeList) byType[n.type] = (byType[n.type] ?? 0) + 1;
  const edgeByType = {};
  for (const e of edges) edgeByType[e.type] = (edgeByType[e.type] ?? 0) + 1;

  return {
    version: KNOWLEDGE_GRAPH_VERSION,
    nodes: nodeList, edges,
    stats: {
      nodes: nodeList.length, edges: edges.length, nodesByType: byType, edgesByType: edgeByType,
      allEdgesHaveProvenance: edges.every((e) => e.provenance && e.provenance.source),
    },
    blockedNodeTypes: bioBlocked ? { types: ['Disease', 'Pathway'], reason: 'Open Targets / Reactome / GO / DisGeNET egress unavailable — supply associations to populate (never fabricated)' } : null,
  };
}
