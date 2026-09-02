import { describe, expect, it, vi } from 'vitest';
import {
  buildPrecisionEvidencePack,
  buildSavedPrecisionAnalysisRun,
  isSavedPrecisionAnalysisRun,
  PRECISION_EVIDENCE_PACK_NAME,
  proposeNextPrecisionExperiment,
  replaySavedPrecisionAnalysisRun,
} from '../core/discovery/molecular/precisionEvidencePack';
import { runPrecisionReferenceAnalysis, type PrecisionCompoundRequest } from '../core/discovery/molecular/precisionReferenceAnalysis';
import { createNodeRdkitTransport } from '../core/discovery/molecular/rdkitTransport.node';

/** Same fake-localStorage idiom `scienceMemory.test.ts` already uses — this runtime has no real `window`. */
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

/**
 * 3-MMC / 4-CMC PRECISION MISSION — Evidence Pack, replay, Scientific Memory
 * (tests 9, 10, 11 of the mission's 12-item list).
 */
const rdkit = createNodeRdkitTransport();
const rdkitAvailable = rdkit.detect().available;

const THREE_MMC: PrecisionCompoundRequest = { name: '3-MMC', fallbackSmiles: 'CNC(C)C(=O)c1cccc(C)c1', fallbackFormula: 'C11H15NO' };
const FOUR_CMC: PrecisionCompoundRequest = { name: '4-CMC', fallbackSmiles: 'CNC(C)C(=O)c1ccc(Cl)cc1', fallbackFormula: 'C10H12ClNO' };

describe('isSavedPrecisionAnalysisRun', () => {
  it('odrzuca dane niepełne', () => {
    expect(isSavedPrecisionAnalysisRun(null)).toBe(false);
    expect(isSavedPrecisionAnalysisRun({})).toBe(false);
    expect(isSavedPrecisionAnalysisRun({ version: '1.0.0', resultFingerprint: 'x' })).toBe(false);
  });
});

describe(`REALNY Evidence Pack + replay (RDKit=${rdkitAvailable})`, () => {
  if (!rdkitAvailable) {
    it('bez RDKit replay jest deterministycznie BLOCKED lub MATCH, nigdy udawany sukces', () => {
      const saved = buildSavedPrecisionAnalysisRun(THREE_MMC, FOUR_CMC, { rdkit });
      const replay = replaySavedPrecisionAnalysisRun(saved, { rdkit });
      expect(['MATCH', 'BLOCKED']).toContain(replay.status);
    });
    return;
  }

  it('Test 9 — 3MMC_4CMC_PRECISION_EVIDENCE_PACK zawiera wszystkie wymagane sekcje', () => {
    const result = runPrecisionReferenceAnalysis(THREE_MMC, FOUR_CMC, { rdkit });
    const pack = buildPrecisionEvidencePack(THREE_MMC, FOUR_CMC, result, rdkit.detect().available ? 'RDKit' : 'none');

    expect(pack.packName).toBe(PRECISION_EVIDENCE_PACK_NAME);
    expect(pack.input.compoundA.name).toBe('3-MMC');
    expect(pack.resolvedIdentities.compoundA.formula).toBe('C11H15NO');
    expect(pack.structures.compoundA.ok).toBe(true);
    expect(pack.computedDescriptors.similarity.available).toBe(true);
    expect(pack.mechanismEvidence.compoundA).toHaveLength(3);
    expect(pack.comparison.length).toBeGreaterThan(5);
    expect(pack.claims.length).toBeGreaterThan(0);
    expect(pack.falsification.checks).toHaveLength(5);
    expect(pack.uncertainty.length).toBeGreaterThan(0);
    expect(pack.nextExperiment.length).toBeGreaterThan(0);
    expect(pack.resultFingerprint).toBe(result.resultFingerprint);
  }, 30_000);

  it('Test 10 — replay identycznego inputu daje MATCH', () => {
    const saved = buildSavedPrecisionAnalysisRun(THREE_MMC, FOUR_CMC, { rdkit });
    expect(isSavedPrecisionAnalysisRun(saved)).toBe(true);
    const replay = replaySavedPrecisionAnalysisRun(saved, { rdkit });
    expect(replay.status).toBe('MATCH');
    expect(replay.result).not.toBeNull();
  }, 30_000);

  it('Test 11 — zmodyfikowany input (inna nazwa referencyjna trzeciego związku) daje DRIFT, nigdy MATCH', () => {
    const saved = buildSavedPrecisionAnalysisRun(THREE_MMC, FOUR_CMC, { rdkit });
    const tampered = { ...saved, requestB: { ...saved.requestB, fallbackSmiles: 'CNC(C)C(=O)c1ccccc1', fallbackFormula: 'C10H13NO' } };
    const replay = replaySavedPrecisionAnalysisRun(tampered, { rdkit });
    expect(replay.status).toBe('DRIFT');
    expect(replay.result).toBeNull();
  }, 30_000);

  it('uszkodzony zapis jest BLOCKED, nigdy nie przeliczany na oślep', () => {
    const replay = replaySavedPrecisionAnalysisRun({ version: '1.0.0' }, { rdkit });
    expect(replay.status).toBe('BLOCKED');
  });

  it('proposeNextPrecisionExperiment wskazuje realną, konkretną lukę dowodową', () => {
    const result = runPrecisionReferenceAnalysis(THREE_MMC, FOUR_CMC, { rdkit });
    const next = proposeNextPrecisionExperiment(result);
    expect(next).toMatch(/DAT\/NET\/SERT|transporter/i);
    expect(next.toLowerCase()).not.toMatch(/synthesis route|reflux|add \d/);
  }, 30_000);

  it('zapis do Scientific Memory używa WYŁĄCZNIE istniejącego saveExperiment API', async () => {
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: makeFakeStorage() });
    try {
      const { listExperiments } = await import('../core/scienceMemory');
      const { savePrecisionAnalysisToMemory } = await import('../core/discovery/molecular/precisionEvidencePack');

      const before = listExperiments().length;
      const result = runPrecisionReferenceAnalysis(THREE_MMC, FOUR_CMC, { rdkit });
      const saved = savePrecisionAnalysisToMemory(result);

      expect(saved.labId).toBe('molecular-precision-reference-analysis');
      expect(saved.analysis).toBeDefined();
      expect(saved.analysis!.length).toBeGreaterThanOrEqual(5);
      expect(listExperiments().length).toBe(before + 1);
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  }, 30_000);
});
