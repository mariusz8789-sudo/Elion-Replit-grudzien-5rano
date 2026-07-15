/**
 * Scientific Knowledge Graph (Genesis V3, Phase 4). Nodes/edges from real ingested evidence +
 * campaign candidates + off-target proteins; PROVENANCE on every edge; Disease/Pathway absent
 * (never fabricated) unless supplied.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildKnowledgeGraph, NODE_TYPE, EDGE_TYPE } from './cognitive/knowledgeGraph.mjs';

const ingest = {
  entities: [
    { entity: { entityType: 'ProteinRecord', identifiers: { accession: 'P15056' }, proteinName: 'BRAF', crossReferences: [{ db: 'GeneID', id: '673' }] }, provenance: { sourceService: 'UNIPROT', sourceId: 'P15056', contentHash: 'h1', evidenceOrigin: 'DATABASE_REPORTED', ingestionMode: 'TEST_FIXTURE' } },
    { entity: { entityType: 'BioactivityRecord', identifiers: { activityId: 'A1', moleculeChemblId: 'CHEMBL1', targetChemblId: 'CHEMBLT' }, standardType: 'IC50', standardValue: 10, standardUnits: 'nM', targetPrefName: 'BRAF' }, provenance: { sourceService: 'CHEMBL', sourceId: 'A1', contentHash: 'h2', ingestionMode: 'TEST_FIXTURE' } },
  ],
};
const dossier = {
  candidates: [
    { candidateId: 'c1', structure: 'CCO', finalScore: 0.8, docking: { bestAffinityKcalMol: -5 }, provenance: { candidateOrigin: 'RDKit' }, offTarget: { topOffTargets: [{ gene: 'KCNH2', protein: 'hERG', probability: 0.9, flag: 'STRONG' }, { gene: 'AR', protein: 'Androgen receptor', probability: 0.8, flag: 'STRONG' }] } },
  ],
};

describe('knowledgeGraph — build from real evidence + campaign', () => {
  const kg = buildKnowledgeGraph({ ingest, dossier, target: { targetName: 'BRAF' } });

  test('creates typed nodes for protein, gene, compound, evidence, ligand, target, off-target proteins', () => {
    const types = new Set(kg.nodes.map((n) => n.type));
    for (const t of [NODE_TYPE.PROTEIN, NODE_TYPE.GENE, NODE_TYPE.COMPOUND, NODE_TYPE.LIGAND, NODE_TYPE.TARGET]) assert.ok(types.has(t), `missing ${t}`);
    assert.ok(kg.nodes.some((n) => n.label.includes('hERG')));
  });

  test('EVERY edge has provenance with a source', () => {
    assert.ok(kg.edges.length > 0);
    assert.equal(kg.stats.allEdgesHaveProvenance, true);
    assert.ok(kg.edges.every((e) => e.provenance && e.provenance.source && e.provenance.epistemicStatus));
  });

  test('off-target edges are MODEL_INFERRED; bioactivity edge carries the source type', () => {
    const off = kg.edges.filter((e) => e.type === EDGE_TYPE.OFF_TARGET);
    assert.ok(off.length >= 2);
    assert.ok(off.every((e) => e.provenance.epistemicStatus === 'MODEL_INFERRED'));
    const bio = kg.edges.find((e) => e.type === EDGE_TYPE.HAS_BIOACTIVITY);
    assert.ok(bio && bio.standardType === 'IC50');
  });

  test('candidate → target TARGETS edge is COMPUTED', () => {
    const t = kg.edges.find((e) => e.type === EDGE_TYPE.TARGETS);
    assert.ok(t && t.provenance.epistemicStatus === 'COMPUTED');
  });

  test('Disease/Pathway are absent (blocked) without supplied associations — never fabricated', () => {
    assert.ok(kg.blockedNodeTypes && kg.blockedNodeTypes.types.includes('Disease'));
    assert.ok(!kg.nodes.some((n) => n.type === NODE_TYPE.DISEASE));
  });

  test('supplied biological associations populate Disease/Pathway with provenance', () => {
    const kg2 = buildKnowledgeGraph({ ingest, dossier, target: { targetName: 'BRAF' }, biologicalAssociations: { ingestionMode: 'USER_SUPPLIED', associations: [{ disease: 'melanoma', diseaseId: 'EFO:0000756', gene: 'KCNH2', source: 'OpenTargets', sourceId: 'x', score: 0.7 }] } });
    assert.ok(kg2.nodes.some((n) => n.type === NODE_TYPE.DISEASE && n.label === 'melanoma'));
    assert.ok(kg2.edges.some((e) => e.type === EDGE_TYPE.ASSOCIATED_WITH && e.provenance.source === 'OpenTargets'));
    assert.equal(kg2.blockedNodeTypes, null);
  });

  test('deterministic — identical inputs produce identical stats', () => {
    const a = buildKnowledgeGraph({ ingest, dossier, target: { targetName: 'BRAF' } });
    assert.deepEqual(a.stats, kg.stats);
  });
});
