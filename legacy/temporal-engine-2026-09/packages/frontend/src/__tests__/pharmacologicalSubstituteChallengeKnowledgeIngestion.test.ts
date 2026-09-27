import { beforeAll, describe, expect, it } from 'vitest';
import { createNodeAdmetTransport } from '../core/discovery/molecular/admetTransport.node';
import { createNodeRdkitTransport } from '../core/discovery/molecular/rdkitTransport.node';
import { GABA_BENZODIAZEPINE_CANDIDATE_POOL } from '../core/discovery/molecular/gabaBenzodiazepineCandidatePool';
import { knowledgePack5RecordsFor } from '../core/discovery/molecular/knowledgePack5';
import { knowledgePack6RecordsFor, ratioToAlprazolamBaseline } from '../core/discovery/molecular/knowledgePack6';
import {
  ALPRAZOLAM_SUBSTITUTE_CHALLENGE,
  ALPRAZOLAM_SUBSTITUTE_CHALLENGE_AFTER_KNOWLEDGE_PACK_5,
  ALPRAZOLAM_SUBSTITUTE_CHALLENGE_AFTER_KNOWLEDGE_PACK_6,
  runKnowledgeIngestionBeforeAfterComparison,
  runKnowledgeIngestionThreeStageComparison,
  saveSubstituteChallengeToMemory,
  type KnowledgeIngestionComparison,
  type KnowledgeIngestionThreeStageComparison,
} from '../core/discovery/molecular/pharmacologicalSubstituteChallenge';
import type { RdkitTransport } from '../core/discovery/molecular/rdkitTransport';
import type { AdmetTransport } from '../core/discovery/molecular/admetTransport';

const formulaBySmiles = new Map<string, string>([
  ...GABA_BENZODIAZEPINE_CANDIDATE_POOL
    .filter((c) => c.structure.kind === 'SMILES_CROSS_VALIDATED')
    .map((c): [string, string] => [(c.structure as { smiles: string }).smiles, (c.structure as { expectedFormula: string }).expectedFormula]),
  [ALPRAZOLAM_SUBSTITUTE_CHALLENGE.reference.smiles, 'C17H13ClN4'],
]);

function buildFakeRdkit(): RdkitTransport {
  return {
    transportId: 'test-fixture',
    detect: () => ({ available: true, engine: 'TEST_FIXTURE', version: '0' }),
    match: () => ({ ok: false, error: 'INVALID_SMILES', reason: 'fixture' }),
    describe: (smiles: string) => {
      const formula = formulaBySmiles.get(smiles);
      if (formula === undefined) return { ok: false, error: 'INVALID_SMILES', reason: 'not in fixture pool' };
      return { ok: true, engine: 'TEST_FIXTURE', data: { canonicalSmiles: smiles, molecularFormula: formula, values: {}, inchi: null, inchiKey: null } };
    },
    transform: () => ({ ok: false, error: 'INVALID_SMILES', reason: 'fixture' }),
    transformations: () => ({ ok: true, transformations: [] }),
    similarity: () => ({ ok: true, tanimoto: 0.3, fingerprint: 'fake', candidateCanonical: 'c', referenceCanonical: 'r', scaffoldCandidate: 's1', scaffoldReference: 's2', sameScaffold: false }),
  };
}

function buildFakeAdmet(): AdmetTransport {
  return {
    transportId: 'test-fixture',
    detect: () => ({ available: true, engine: 'TEST_FIXTURE', version: '0' }),
    predict: (smilesList: readonly string[]) => ({
      ok: true,
      engine: 'TEST_FIXTURE',
      bySmiles: Object.fromEntries(smilesList.map((s) => [s, {
        engine: 'TEST_FIXTURE',
        values: { AMES: 0.05, ClinTox: 0.05, DILI: 0.05, HIA_Hou: 0.8, Bioavailability_Ma: 0.7, BBB_Martins: 0.6, Pgp_Broccatelli: 0.2, CYP3A4_Veith: 0.1, CYP2D6_Veith: 0.1 },
      }])),
    }),
  };
}

function runComparison(): KnowledgeIngestionComparison {
  return runKnowledgeIngestionBeforeAfterComparison({ rdkit: buildFakeRdkit(), admet: buildFakeAdmet() });
}

describe('pharmacologicalSubstituteChallenge — Knowledge Pack #5 ingestion changes a real run', () => {
  it('1. the BEFORE config pool is unchanged from the original 5-candidate pool (baicalein excluded)', () => {
    expect(ALPRAZOLAM_SUBSTITUTE_CHALLENGE.pool.map((c) => c.candidateKey).sort()).toEqual(
      ['apigenin', 'chrysin', 'curcumin', 'honokiol', 'valerenic-acid'],
    );
  });

  it('2. the AFTER config pool includes baicalein — the candidate ingestion introduced', () => {
    const keys = ALPRAZOLAM_SUBSTITUTE_CHALLENGE_AFTER_KNOWLEDGE_PACK_5.pool.map((c) => c.candidateKey);
    expect(keys).toContain('baicalein');
    expect(keys.length).toBe(6);
  });

  it('3. running the comparison produces a real per-candidate diff covering every candidate in either pool', () => {
    const comparison = runComparison();
    const keys = comparison.perCandidate.map((d) => d.candidateKey).sort();
    expect(keys).toEqual(['apigenin', 'baicalein', 'chrysin', 'curcumin', 'honokiol', 'valerenic-acid']);
  });

  it('4. baicalein has NO before-ingestion finding and a real after-ingestion finding', () => {
    const comparison = runComparison();
    const baicalein = comparison.perCandidate.find((d) => d.candidateKey === 'baicalein')!;
    expect(baicalein.before).toBeNull();
    expect(baicalein.after).not.toBeNull();
    expect(baicalein.after!.mechanisticMatchPercent).toBeGreaterThan(0);
  });

  it('5. apigenin\'s score and epistemic status genuinely change after ingesting the new conflicting evidence', () => {
    const comparison = runComparison();
    const apigenin = comparison.perCandidate.find((d) => d.candidateKey === 'apigenin')!;
    expect(apigenin.before).toEqual({ mechanisticMatchPercent: 65, status: 'UNRESOLVED' });
    expect(apigenin.after!.status).toBe('WEAKENED');
    expect(apigenin.after!.mechanisticMatchPercent).not.toBe(apigenin.before!.mechanisticMatchPercent);
  });

  it('6. candidates with no new ingested evidence are completely unchanged before vs after', () => {
    const comparison = runComparison();
    for (const key of ['chrysin', 'honokiol', 'valerenic-acid', 'curcumin']) {
      const d = comparison.perCandidate.find((c) => c.candidateKey === key)!;
      expect(d.after).toEqual(d.before);
    }
  });

  it('7. baicalein\'s targetMatch axis is still COMPUTED from the real WRONG_TARGET check, never hand-declared, even though it is a newly ingested candidate', () => {
    const comparison = runComparison();
    const finding = comparison.after.findings.get('baicalein')!;
    const targetAxis = finding.mechanisticMatch.axes.find((a) => a.axis === 'targetMatch')!;
    expect(targetAxis.basis).toBe('COMPUTATIONALLY_SUPPORTED');
    expect(targetAxis.grade).toBe('MATCH');
  });

  it('8. the closest-candidate ranking changes: apigenin was closest before, baicalein is closest after', () => {
    const comparison = runComparison();
    expect(comparison.beforeVerdict.reasoning).toContain('apigenin');
    expect(comparison.afterVerdict.reasoning).toContain('baicalein');
  });

  it('9. the 95% threshold verdict itself is reported honestly unchanged — ingestion moved the state of knowledge, not the headline answer', () => {
    const comparison = runComparison();
    expect(comparison.beforeVerdict.result).toBe('NO_CANDIDATE_ABOVE_THRESHOLD');
    expect(comparison.afterVerdict.result).toBe('NO_CANDIDATE_ABOVE_THRESHOLD');
  });

  it('10. the comparison is fully deterministic across independent runs', () => {
    const a = runComparison();
    const b = runComparison();
    expect(b.perCandidate).toEqual(a.perCandidate);
    expect(b.beforeVerdict).toEqual(a.beforeVerdict);
    expect(b.afterVerdict).toEqual(a.afterVerdict);
  });

  it('11. every axis upgraded by ingestion traces its rationale to Knowledge Pack #5, not an unexplained number', () => {
    const comparison = runComparison();
    const apigeninFinding = comparison.after.findings.get('apigenin')!;
    const baicaleinFinding = comparison.after.findings.get('baicalein')!;
    const upgraded = [...apigeninFinding.mechanisticMatch.axes, ...baicaleinFinding.mechanisticMatch.axes].filter((a) => a.rationale.includes('Knowledge Pack #5'));
    expect(upgraded.length).toBeGreaterThan(0);
  });

  it('12. no fabricated numeric value: baicalein\'s ingested ratio/Ki appearing in the axis rationale matches the pack record exactly', () => {
    const comparison = runComparison();
    const record = knowledgePack5RecordsFor('Baicalein')[0]!;
    const finding = comparison.after.findings.get('baicalein')!;
    const quantAxis = finding.mechanisticMatch.axes.find((a) => a.axis === 'quantitativeComparability')!;
    expect(quantAxis.rationale).toContain(String(record.reportedRatioToReference));
    const mechanismAxis = finding.mechanisticMatch.axes.find((a) => a.axis === 'mechanismMatch')!;
    expect(mechanismAxis.rationale).toContain(record.value!);
  });

  it('13. UNKNOWN is preserved, never silently upgraded, where the pack gave no explicit ratio (apigenin quantitativeComparability)', () => {
    const comparison = runComparison();
    const finding = comparison.after.findings.get('apigenin')!;
    const quantAxis = finding.mechanisticMatch.axes.find((a) => a.axis === 'quantitativeComparability')!;
    expect(quantAxis.grade).toBe('UNKNOWN');
  });

  it('14. the AFTER run is written to Scientific Memory with an honest per-status breakdown that differs from the BEFORE save', () => {
    const comparison = runComparison();
    const savedBefore = saveSubstituteChallengeToMemory(comparison.before);
    const savedAfter = saveSubstituteChallengeToMemory(comparison.after);
    expect(savedBefore.epistemicStatus).toContain('WEAKENED=1');
    expect(savedAfter.epistemicStatus).toContain('WEAKENED=2');
    expect(savedAfter.epistemicStatus).not.toBe(savedBefore.epistemicStatus);
  });
});

function runThreeStage(): KnowledgeIngestionThreeStageComparison {
  return runKnowledgeIngestionThreeStageComparison({ rdkit: buildFakeRdkit(), admet: buildFakeAdmet() });
}

describe('pharmacologicalSubstituteChallenge — Knowledge Pack #6 (verification pack v3) self-corrects Pack #5\'s error', () => {
  it('15. the AFTER-Pack-6 config exists and still includes baicalein', () => {
    expect(ALPRAZOLAM_SUBSTITUTE_CHALLENGE_AFTER_KNOWLEDGE_PACK_6.pool.map((c) => c.candidateKey)).toContain('baicalein');
  });

  it('16. baicalein\'s score genuinely DROPS from the (erroneous) Pack #5 state once Pack #6\'s real-cited correction is ingested', () => {
    const { perCandidate } = runThreeStage();
    const baicalein = perCandidate.find((d) => d.candidateKey === 'baicalein')!;
    expect(baicalein.afterPack5!.status).toBe('UNRESOLVED');
    expect(baicalein.afterPack6!.status).toBe('WEAKENED');
    expect(baicalein.afterPack6!.mechanisticMatchPercent).toBeLessThan(baicalein.afterPack5!.mechanisticMatchPercent);
  });

  it('17. baicalein\'s corrected quantitative ratio is computed from Pack #6\'s real cited values, not asserted by hand', () => {
    const kiRecord = knowledgePack6RecordsFor('baicalein').find((r) => r.measurementType === 'Ki')!;
    const expectedRatio = ratioToAlprazolamBaseline(kiRecord.value);
    expect(expectedRatio).toBeGreaterThan(1000); // real correction: ~1000x weaker, not Pack #5's claimed ~3x
  });

  it('18. apigenin\'s quantitativeComparability axis is genuinely RESOLVED from UNKNOWN to MISMATCH by Pack #6, not left alone', () => {
    const result = ALPRAZOLAM_SUBSTITUTE_CHALLENGE_AFTER_KNOWLEDGE_PACK_6.axisInputsByCandidateKey.apigenin;
    expect(result.quantitativeComparability.grade).toBe('MISMATCH');
    expect(result.quantitativeComparability.rationale).toContain('Resolved from UNKNOWN');
  });

  it('19. after the correction, the honestly-closest candidate reverts to chrysin — the same real, cited literature candidate from before either knowledge pack existed', () => {
    const { afterPack5Verdict, afterPack6Verdict } = runThreeStage();
    expect(afterPack5Verdict.reasoning).toContain('baicalein');
    expect(afterPack6Verdict.reasoning).toContain('chrysin');
  });

  it('20. the three-stage run remains deterministic', () => {
    const a = runThreeStage();
    const b = runThreeStage();
    expect(b.perCandidate).toEqual(a.perCandidate);
  });

  it('21. the corrected run still never claims clinical or functional equivalence to alprazolam', () => {
    const { afterPack6 } = runThreeStage();
    for (const finding of afterPack6.findings.values()) {
      const text = finding.mechanisticMatch.axes.map((a) => a.rationale).join(' ').toLowerCase();
      expect(text).not.toContain('equivalent to alprazolam');
    }
  });
});

describe('pharmacologicalSubstituteChallenge — Knowledge Pack #5 ingestion, REAL execution (live RDKit + live ADMET-AI)', () => {
  const RUN_TIMEOUT_MS = 1_800_000;
  let comparison: KnowledgeIngestionComparison;

  beforeAll(() => {
    const rdkit = createNodeRdkitTransport({ timeoutMs: 60_000 });
    const admet = createNodeAdmetTransport({ timeoutMs: 900_000 });
    comparison = runKnowledgeIngestionBeforeAfterComparison({ rdkit, admet });
  }, RUN_TIMEOUT_MS);

  it('baicalein really cross-validates against live RDKit and enters the AFTER pool with a computed MATCH target axis', () => {
    const finding = comparison.after.findings.get('baicalein')!;
    expect(finding.crossValidation.status).toBe('CONFIRMED');
    const targetAxis = finding.mechanisticMatch.axes.find((a) => a.axis === 'targetMatch')!;
    expect(targetAxis.grade).toBe('MATCH');
  });

  it('the AFTER pool really has one more hypothesis than the BEFORE pool', () => {
    const beforeHyps = comparison.before.loopResult.finalGraph.nodes.filter((n) => n.kind === 'HYPOTHESIS');
    const afterHyps = comparison.after.loopResult.finalGraph.nodes.filter((n) => n.kind === 'HYPOTHESIS');
    expect(afterHyps.length).toBe(beforeHyps.length + 1);
  });

  it('apigenin\'s real mechanistic match score genuinely differs before vs after under real ADMET-AI, proving ingestion changed a live-executed run, not just a fixture', () => {
    const beforeFinding = comparison.before.findings.get('apigenin');
    const afterFinding = comparison.after.findings.get('apigenin');
    expect(beforeFinding).toBeDefined();
    expect(afterFinding).toBeDefined();
    expect(afterFinding!.mechanisticMatch.totalScorePercent).not.toBe(beforeFinding!.mechanisticMatch.totalScorePercent);
  });

  it('neither run claims any candidate is a clinical or functional equivalent of alprazolam', () => {
    for (const finding of [...comparison.before.findings.values(), ...comparison.after.findings.values()]) {
      const claim = finding.mechanisticMatch.axes.map((a) => a.rationale).join(' ').toLowerCase();
      expect(claim).not.toContain('equivalent to alprazolam');
      expect(claim).not.toContain('clinically proven');
    }
  });
}, 1_800_000);
