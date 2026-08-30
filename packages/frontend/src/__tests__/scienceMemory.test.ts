import { describe, it, expect, vi, beforeEach } from 'vitest';

function makeFakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

describe('scienceMemory: contentHash', () => {
  beforeEach(() => { vi.resetModules(); vi.stubGlobal('window', { localStorage: makeFakeStorage() }); });

  it('is deterministic and independent of param key order', async () => {
    const { contentHash } = await import('../core/scienceMemory');
    const a = contentHash({ labId: 'universe', experimentId: 'threebody', params: { m1: 1, m2: 2 } });
    const b = contentHash({ labId: 'universe', experimentId: 'threebody', params: { m2: 2, m1: 1 } });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{8}$/);
  });

  it('changes when a parameter changes (reproducibility fingerprint)', async () => {
    const { contentHash } = await import('../core/scienceMemory');
    const a = contentHash({ labId: 'universe', experimentId: 'threebody', params: { m1: 1 } });
    const b = contentHash({ labId: 'universe', experimentId: 'threebody', params: { m1: 2 } });
    expect(a).not.toBe(b);
  });
});

describe('scienceMemory: save / list / get / delete', () => {
  beforeEach(() => { vi.resetModules(); vi.stubGlobal('window', { localStorage: makeFakeStorage() }); });

  const input = {
    labId: 'universe', experimentId: 'threebody', experimentName: 'Problem trzech ciał',
    params: { mass: 1.0 }, stats: { energy: -0.5 },
    honesty: 'exact' as const, honestyNote: 'Velocity-Verlet.',
    equations: ['a_i = Σ ...'], assumptions: ['Newton'], epistemicStatus: 'Nauka ustalona',
  };

  it('saves an experiment carrying model, params, equations, stats and a hash', async () => {
    const { saveExperiment, listExperiments } = await import('../core/scienceMemory');
    const saved = saveExperiment(input);
    expect(saved.contentHash).toMatch(/^[0-9a-f]{8}$/);
    expect(saved.equations).toEqual(['a_i = Σ ...']);
    const list = listExperiments();
    expect(list.length).toBe(1);
    expect(list[0].experimentName).toBe('Problem trzech ciał');
    expect(list[0].stats.energy).toBe(-0.5);
  });

  it('persists across a fresh module load (real localStorage round-trip)', async () => {
    const fake = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: fake });
    const first = await import('../core/scienceMemory');
    first.saveExperiment(input);

    vi.resetModules();
    vi.stubGlobal('window', { localStorage: fake });
    const second = await import('../core/scienceMemory');
    expect(second.countExperiments()).toBe(1);
    expect(second.listExperiments()[0].experimentId).toBe('threebody');
  });

  it('delete removes the record', async () => {
    const { saveExperiment, listExperiments, deleteExperiment } = await import('../core/scienceMemory');
    const s = saveExperiment(input);
    deleteExperiment(s.id);
    expect(listExperiments().length).toBe(0);
  });

  it('ignores a tampered content hash instead of treating it as reproducible', async () => {
    const fake = makeFakeStorage();
    const { contentHash } = await import('../core/scienceMemory');
    const params = { mass: 1 };
    fake.setItem('genesis-os:science-memory/v1', JSON.stringify([{
      id: 'tampered', createdAt: new Date().toISOString(), labId: 'universe', experimentId: 'threebody', experimentName: 'Tampered',
      params: { mass: 2 }, stats: {}, honesty: 'exact', honestyNote: 'tampered', equations: [], assumptions: [], epistemicStatus: '', contentHash: contentHash({ labId: 'universe', experimentId: 'threebody', params }),
    }]));
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: fake });
    expect((await import('../core/scienceMemory')).listExperiments()).toEqual([]);
  });

  it('ignores corrupted rows instead of throwing (defensive read)', async () => {
    const fake = makeFakeStorage();
    fake.setItem('genesis-os:science-memory/v1', JSON.stringify([{ garbage: true }, null, 42]));
    vi.stubGlobal('window', { localStorage: fake });
    const { listExperiments } = await import('../core/scienceMemory');
    expect(listExperiments()).toEqual([]);
  });
});


describe('scienceMemory: Fabric observations', () => {
  beforeEach(() => { vi.resetModules(); vi.stubGlobal('window', { localStorage: makeFakeStorage() }); });

  it('round-trips scalar and series observations through localStorage', async () => {
    const { saveExperiment } = await import('../core/scienceMemory');
    const saved = saveExperiment({
      labId: 'universe', experimentId: 'series', experimentName: 'Series memory',
      params: { mass: 1 }, stats: { energy: -0.5 },
      honesty: 'exact', honestyNote: 'deterministic',
      observations: { probability: 0.5, trajectory: [0.1, 0.2, 0.3] },
    });
    expect(saved.observations).toEqual({ probability: 0.5, trajectory: [0.1, 0.2, 0.3] });
    vi.resetModules();
    expect((await import('../core/scienceMemory')).listExperiments()[0].observations).toEqual(saved.observations);
  });

  it('indexes a real Evidence Pack in Scientific Memory without losing canonical IDs', async () => {
    const { saveScientificEvidencePackToMemory } = await import('../core/scienceMemory');
    const { createScientificEvidencePack, designScientificExperiment, executeScientificExperiment, parseScienceChatMessage } = await import('../core/experimentFabric');
    const design = designScientificExperiment({
      hypothesis: {
        statement: 'Promień rośnie wraz z masą.', domainId: 'spacetime-einstein', modelId: 'einstein-schwarzschild',
        declaredAssumptions: [], falsification: { metric: 'radiusKm', relation: 'monotonic-increase', rationale: 'Test.' },
      },
      baselineRequest: parseScienceChatMessage('Oblicz promień Schwarzschilda dla 1 masy Słońca.'),
      sweep: { parameter: 'massSolar', values: [1, 2], label: 'Masa M☉' }, repetitionsPerArm: 1,
    });
    const pack = createScientificEvidencePack(executeScientificExperiment(design));
    const saved = saveScientificEvidencePackToMemory(pack);
    expect(saved.evidencePackId).toBe(pack.evidencePackId);
    expect(saved.evidenceChainId).toBe(pack.evidenceChainId);
    expect(saved.execution?.runFingerprint).toBe(pack.runs[0].provenance.runFingerprint);
    expect(saved.observations?.radiusKm).toEqual(pack.runs.map((run) => run.result.outputs.radiusKm));
    expect(saved.analysis?.[0].body).toBe(pack.hypothesisAssessment.message);
  });

  it('round-trips analyzed observation blocks with series', async () => {
    const { saveExperiment } = await import('../core/scienceMemory');
    const saved = saveExperiment({
      labId: 'biology', experimentId: 'custom-recording', experimentName: 'Recorded growth',
      params: { rate: 0.2 }, stats: { population: 12 }, observations: { population: [8, 9, 12] },
      analysis: [{ title: 'Trend', body: 'Population increased across the recorded samples.', kind: 'trend' }],
      honesty: 'simplified', honestyNote: 'observed local run', assumptions: [],
    });
    vi.resetModules();
    const loaded = (await import('../core/scienceMemory')).listExperiments()[0];
    expect(loaded.analysis).toEqual(saved.analysis);
    expect(loaded.observations).toEqual(saved.observations);
  });

  it('round-trips a structured biotech discovery report context', async () => {
    const { saveBiotechDiscoveryReportToMemory } = await import('../core/scienceMemory');
    const { createCandidateDiscoveryReport, rankTherapeuticCandidate } = await import('../core/biotechDiscoveryContract');
    const candidate = {
      kind: 'therapeutic-candidate' as const, id: 'candidate-demo', namespace: 'synthetic-demo', label: 'Synthetic demo candidate', status: 'HYPOTHESIS' as const,
      materialId: 'material-demo', compoundIds: ['compound-demo'], targetIds: ['target-demo'], mechanismIds: ['mechanism-demo'],
      supportingEvidenceIds: ['evidence-demo'], safetySignalIds: ['safety-demo'], hypothesisIds: ['hypothesis-demo'], provenance: [],
    };
    const hypothesis = {
      kind: 'therapeutic-hypothesis' as const, id: 'hypothesis-demo', namespace: 'synthetic-demo', label: 'Synthetic demo hypothesis', status: 'HYPOTHESIS' as const,
      claim: 'Synthetic demo only; not a biological claim.', candidateId: candidate.id, targetIds: candidate.targetIds, mechanismIds: candidate.mechanismIds,
      supportingEvidenceIds: candidate.supportingEvidenceIds, safetySignalIds: candidate.safetySignalIds, provenance: [],
    };
    const ranking = rankTherapeuticCandidate({ candidate, evidenceQuality: 'UNKNOWN', targetRelevance: 0, safetySignals: [], uncertaintyPenalty: 1 });
    const report = createCandidateDiscoveryReport({ candidate, hypothesis, ranking, uncertainty: 'SYNTHETIC_DEMO; no biological validation.' });
    const saved = saveBiotechDiscoveryReportToMemory(report);
    expect(saved.biotech?.reportId).toBe(report.reportId);
    vi.resetModules();
    const loaded = (await import('../core/scienceMemory')).listExperiments()[0];
    expect(loaded.biotech).toMatchObject({ reportId: report.reportId, candidateId: candidate.id, hypothesisId: hypothesis.id, evidenceIds: ['evidence-demo'], safetySignalIds: ['safety-demo'], scientificFingerprint: report.scientificFingerprint, ranking: { score: report.ranking?.score, epistemicStatus: 'PREDICTION' } });
  });

  it('round-trips a real multi-candidate comparison through Scientific Memory', async () => {
    const { saveBiotechDiscoveryComparisonToMemory } = await import('../core/scienceMemory');
    const { buildPinnedChEMBLCaffeineDiscovery } = await import('../core/biotechData/chembl');
    const { buildPinnedChEMBLAdenosineDiscovery } = await import('../core/biotechData/adenosine');
    const saved = saveBiotechDiscoveryComparisonToMemory([
      buildPinnedChEMBLCaffeineDiscovery().report,
      buildPinnedChEMBLAdenosineDiscovery().report,
    ], { activityIds: ['chembl:activity:189031'], assayIds: ['chembl:assay:CHEMBL876556'] });
    expect(saved.biotech?.comparison).toMatchObject({
      reportIds: expect.arrayContaining([
        buildPinnedChEMBLCaffeineDiscovery().report.reportId,
        buildPinnedChEMBLAdenosineDiscovery().report.reportId,
      ]),
      epistemicStatus: 'PREDICTION',
    });
    expect(saved.biotech?.artifact).toMatchObject({
      candidateIds: expect.arrayContaining(saved.biotech.comparison!.candidateIds),
      comparisonId: saved.biotech.comparison!.comparisonId,
      artifactFingerprint: expect.any(String),
    });
    vi.resetModules();
    const loaded = (await import('../core/scienceMemory')).listExperiments()[0];
    expect(loaded.biotech?.comparison).toEqual(saved.biotech?.comparison);
    expect(loaded.biotech?.activityIds).toEqual(['chembl:activity:189031']);
    expect(loaded.biotech?.assayIds).toEqual(['chembl:assay:CHEMBL876556']);
    expect(loaded.biotech?.comparison?.uncertainty).toMatch(/not efficacy|clinical suitability/i);
  });

  it('round-trips confirmed execution and replay identity', async () => {
    const { saveExperiment } = await import('../core/scienceMemory');
    const saved = saveExperiment({
      labId: 'quantum', experimentId: 'double-slit', experimentName: 'Double slit',
      params: { slitDistance: 1 }, stats: { peak: 0.5 }, observations: { profile: [0.1, 0.2] },
      execution: { status: 'completed', runId: 'run-1', runFingerprint: 'fp-1', resultOrigin: 'real-engine', summary: 'completed', modelId: 'double-slit', engine: 'local' },
      replayIdentity: { capsuleId: 'capsule-1', planId: 'plan-1', confirmationId: 'confirm-1' },
      honesty: 'simplified', honestyNote: 'bounded model', assumptions: [],
    });
    vi.resetModules();
    const loaded = (await import('../core/scienceMemory')).listExperiments()[0];
    expect(loaded.execution).toEqual(saved.execution);
    expect(loaded.replayIdentity).toEqual(saved.replayIdentity);
    expect(loaded.observations).toEqual(saved.observations);
  });

  it('rejects empty analysis blocks before persisting', async () => {
    const { saveExperiment } = await import('../core/scienceMemory');
    const base = { labId: 'quantum', experimentId: 'tunneling', experimentName: 'Tunneling', params: { energy: 0.55 }, stats: { transmission: 0.2 }, honesty: 'simplified' as const, honestyNote: 'run' };
    expect(() => saveExperiment({ ...base, analysis: [] })).toThrow(/Analiza/);
    expect(() => saveExperiment({ ...base, analysis: [{ title: ' ', body: 'wynik' }] })).toThrow(/Analiza/);
  });

  it('rejects empty evidence and replay identity fields', async () => {
    const { saveExperiment } = await import('../core/scienceMemory');
    const base = { labId: 'quantum', experimentId: 'tunneling', experimentName: 'Tunneling', params: { energy: 0.55 }, stats: { transmission: 0.2 }, honesty: 'simplified' as const, honestyNote: 'run' };
    expect(() => saveExperiment({ ...base, evidencePackId: ' ', evidenceChainId: 'chain-1' })).toThrow(/identyfikator/);
    expect(() => saveExperiment({ ...base, replayIdentity: { capsuleId: '', planId: 'plan-1', confirmationId: 'confirm-1' } })).toThrow(/identyfikator/);
  });

  it('rejects completed execution with non-real or incomplete provenance', async () => {
    const { saveExperiment } = await import('../core/scienceMemory');
    const base = { labId: 'quantum', experimentId: 'tunneling', experimentName: 'Tunneling', params: { energy: 0.55 }, stats: { transmission: 0.2 }, honesty: 'simplified' as const, honestyNote: 'run' };
    expect(() => saveExperiment({ ...base, execution: { status: 'completed', runId: 'run-1', runFingerprint: 'fp-1', resultOrigin: 'engine-not-available', summary: 'completed' } })).toThrow(/real-engine/);
    expect(() => saveExperiment({ ...base, execution: { status: 'completed', runId: '', runFingerprint: 'fp-1', resultOrigin: 'real-engine', summary: 'completed' } })).toThrow(/kompletne provenance/);
  });

  it('rejects non-finite observation series before persisting', async () => {
    const { saveExperiment } = await import('../core/scienceMemory');
    const base = {
      labId: 'universe', experimentId: 'series', experimentName: 'Series memory',
      params: { mass: 1 }, stats: { energy: -0.5 },
      honesty: 'exact' as const, honestyNote: 'deterministic',
    };
    expect(() => saveExperiment({ ...base, observations: { trajectory: [0, Number.NaN] } })).toThrow(/skończone/);
    expect(() => saveExperiment({ ...base, observations: { trajectory: [0, Number.POSITIVE_INFINITY] } })).toThrow(/skończone/);
    expect(() => saveExperiment({ ...base, observations: { trajectory: [] } })).toThrow(/skończone/);
    expect(() => saveExperiment({ ...base, observations: {} })).toThrow(/skończone/);
    expect(() => saveExperiment({ ...base, stats: { energy: Number.NaN } })).toThrow(/Statystyki/);
    expect(() => saveExperiment({ ...base, stats: { energy: Number.POSITIVE_INFINITY } })).toThrow(/Statystyki/);
    expect(() => saveExperiment({ ...base, params: { mass: Number.NaN } })).toThrow(/Parametry/);
    expect(() => saveExperiment({ ...base, params: { mass: Number.POSITIVE_INFINITY } })).toThrow(/Parametry/);
  });
});
