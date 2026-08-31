import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseScienceChatMessage } from '../core/experimentFabric/parser';
import { runExperiment } from '../core/experimentFabric/executor';
import { buildPinnedChEMBLCaffeineDiscovery } from '../core/biotechData/chembl';
import { buildPinnedChEMBLAdenosineDiscovery } from '../core/biotechData/adenosine';
import { buildPinnedChEMBLTheophyllineDiscovery } from '../core/biotechData/theophylline';

function makeFakeStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

describe('Experiment Fabric to Scientific Memory', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
  });

  it('persists the complete run identity, outputs, analysis and execution provenance', async () => {
    const run = runExperiment(parseScienceChatMessage('Oblicz promień Schwarzschilda dla 2 masy Słońca.'));
    const { saveExperimentRunToMemory, listExperiments } = await import('../core/scienceMemory');
    const saved = saveExperimentRunToMemory(run);
    const loaded = listExperiments()[0];

    expect(run.result.status).toBe('completed');
    expect(saved.execution).toMatchObject({
      status: 'completed',
      runId: run.runId,
      runFingerprint: run.provenance.runFingerprint,
      resultOrigin: 'real-engine',
      modelId: run.request.modelId,
      route: run.result.route,
    });
    expect(saved.params).toEqual(run.request.parameters);
    expect(saved.observations).toEqual(run.result.outputs);
    expect(saved.analysis?.[0]).toMatchObject({ body: run.result.summary, kind: 'fabric-result' });
    expect(saved.honestyNote).toContain('resultOrigin=real-engine');
    expect(loaded?.execution?.runFingerprint).toBe(run.provenance.runFingerprint);
  });

  it('keeps knowledge-only biotech status explicit when saving a run', async () => {
    const { saveExperimentRunToMemory } = await import('../core/scienceMemory');
    const parsed = parseScienceChatMessage('Znajdź naturalnych kandydatów dla targetu A1: kofeina.');
    const run = runExperiment({ ...parsed, parameters: { ...parsed.parameters, targetQuery: 'kofeina A1' } });
    const saved = saveExperimentRunToMemory(run);

    expect(run.result.status).toBe('knowledge_only');
    expect(saved.execution).toMatchObject({ status: 'knowledge_only', resultOrigin: 'knowledge-only' });
    expect(saved.epistemicStatus).toBe('UNKNOWN');
    expect(saved.honestyNote).toContain('status=knowledge_only');
  });
});

describe('Saved biotech comparison replay integrity', () => {
  it('replays an intact source-backed comparison as MATCH', async () => {
    const { saveBiotechDiscoveryComparisonToMemory, replaySavedBiotechComparison } = await import('../core/scienceMemory');
    const reports = [
      buildPinnedChEMBLCaffeineDiscovery().report,
      buildPinnedChEMBLAdenosineDiscovery().report,
      buildPinnedChEMBLTheophyllineDiscovery().report,
    ];
    const saved = saveBiotechDiscoveryComparisonToMemory(reports);
    expect(replaySavedBiotechComparison(saved.biotech?.comparison, reports)).toEqual({
      status: 'MATCH',
      reason: expect.stringContaining('fingerprint'),
    });
  });

  it('detects comparison fingerprint drift without claiming a biological rerun', async () => {
    const { saveBiotechDiscoveryComparisonToMemory, replaySavedBiotechComparison } = await import('../core/scienceMemory');
    const reports = [buildPinnedChEMBLCaffeineDiscovery().report, buildPinnedChEMBLAdenosineDiscovery().report];
    const saved = saveBiotechDiscoveryComparisonToMemory(reports);
    const drifted = { ...saved.biotech!.comparison!, scientificFingerprint: 'tampered-fingerprint' };
    expect(replaySavedBiotechComparison(drifted, reports).status).toBe('DRIFT');
  });

  it('blocks replay when the saved comparison or report set is incomplete', async () => {
    const { replaySavedBiotechComparison } = await import('../core/scienceMemory');
    expect(replaySavedBiotechComparison(undefined, [buildPinnedChEMBLCaffeineDiscovery().report])).toMatchObject({ status: 'BLOCKED' });
  });
});


describe('Candidate Dossier source lineage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
  });

  it('persists source-backed structure records and keeps full artifact replay MATCH', async () => {
    const { saveBiotechDiscoveryComparisonToMemory, replaySavedBiotechDiscoveryArtifact } = await import('../core/scienceMemory');
    const reports = [buildPinnedChEMBLCaffeineDiscovery().report, buildPinnedChEMBLAdenosineDiscovery().report];
    const sourceRecords = [{ name: 'caffeine', cid: 2519, formula: 'C8H10N4O2', smiles: 'CN1C=NC2=C1C(=O)N(C)C(=O)N2C', inchiKey: 'RYYVLZVUVIJVGH-UHFFFAOYSA-N', molecularWeight: '194.19', source: 'PubChem', sourceVersion: 'PubChem CID 2519', retrievedAt: '2026-08-30', atoms3d: [{ element: 'O', x: 0.47, y: 2.5688, z: 0.0006 }] }];
    const activityRecords = [{ pubchemCid: 2519, compoundId: 'chembl:compound:CHEMBL113', targetId: 'chembl:target:CHEMBL255', activityId: 123, assayId: 'chembl:assay:CHEMBL123', type: 'Ki' as const, relation: '=', value: '12.5', units: 'nM', assayContext: 'human A1 receptor binding', assayQuality: 'HIGH' as const, source: 'ChEMBL' as const, sourceVersion: 'ChEMBL API', retrievedAt: '2026-08-30', sourceUrl: 'https://www.ebi.ac.uk/chembl/explore/activities/CHEMBL123' }];
    const saved = saveBiotechDiscoveryComparisonToMemory(reports, { sourceRecords, activityRecords });
    expect(saved.biotech?.artifact?.sourceRecords).toEqual(sourceRecords);
    expect(saved.biotech?.artifact?.activityRecords).toEqual(activityRecords);
    expect(replaySavedBiotechDiscoveryArtifact(saved.biotech?.artifact, saved.biotech?.artifact?.reports ?? [], { sourceRecords, activityRecords })).toMatchObject({ status: 'MATCH' });
  });
});
