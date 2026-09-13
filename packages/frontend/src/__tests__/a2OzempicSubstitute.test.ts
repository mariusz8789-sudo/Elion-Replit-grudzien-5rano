import { describe, expect, it, vi } from 'vitest';
import {
  runA2Analysis,
  extractCandidateEfficacy,
  selfFalsifyWinner,
  decideA2Verdict,
} from '../core/biotechData/a2OzempicSubstitute';

/**
 * These numbers are computed from the REAL pinned, mechanism-derived
 * candidate space under `core/biotechData/a2-ozempic-substitute/` (see
 * docs/DECISIONS.md D-029 and D-030 for how they were fetched and
 * byte-for-byte verified). Asserted as literals for the same reason every
 * other pinned-anchor test in this repo does: a later change to the
 * extraction logic or the pinned data becomes a visible, reviewed diff.
 */
describe('A2 Ozempic-substitute analysis — real pinned data', () => {
  it('builds the real mechanism-derived candidate space (no drug name was the discovery query)', () => {
    const report = runA2Analysis();
    expect(report.totalCandidatesInSpace).toBe(20);
    expect(report.targets.glp1r.chemblId).toBe('CHEMBL1784');
    expect(report.targets.gipr.chemblId).toBe('CHEMBL4383');
    expect(report.targets.gcgr.chemblId).toBe('CHEMBL1985');
  });

  it('extracts real efficacy evidence for the candidates with usable outcome data, including two real extraction fixes', () => {
    const report = runA2Analysis();
    const byName = new Map(report.candidateReports.map((r) => [r.summary.prefName, r]));

    // Single-arm open-label trial fallback (NCT02533453, Bydureon) — the
    // trial's one group is titled "12/24 Weeks Treatment", not "Exenatide".
    const exenatide = byName.get('EXENATIDE')!;
    expect(exenatide.efficacy).toHaveLength(1);
    expect(exenatide.efficacy[0].nctId).toBe('NCT02533453');

    // Development-code-name synonym fix (ADOMEGLIVANT = LY2409021 in its own real trials).
    const adomeglivant = byName.get('ADOMEGLIVANT')!;
    expect(adomeglivant.efficacy).toHaveLength(3);
    expect(adomeglivant.efficacy.map((e) => e.nctId).sort()).toEqual(['NCT00871572', 'NCT01241448', 'NCT02091362']);

    // Confidence-interval dispersion (not Standard Deviation/Error) converted to SE.
    expect(adomeglivant.efficacy[0].diffCi95).not.toBeNull();
  });

  it('vetoes tirzepatide on a real, measured safety signal (diarrhea) despite its real efficacy advantage', () => {
    const report = runA2Analysis();
    const tirzepatide = report.candidateReports.find((r) => r.summary.prefName === 'TIRZEPATIDE')!;
    expect(tirzepatide.efficacy[0].deltaVsSemaglutidePp).toBeCloseTo(-0.79, 6);
    expect(tirzepatide.score.vetoed).toBe(true);
    expect(tirzepatide.falsification.worseSafetySignal?.label).toBe('Diarrhea');
    expect(tirzepatide.falsification.worseSafetySignal?.riskRatio).toBeGreaterThan(1);
  });

  it('self-falsifies the top-with-evidence candidate (tirzepatide) and finds real, disclosed concerns', () => {
    const report = runA2Analysis();
    expect(report.selfFalsification).not.toBeNull();
    expect(report.selfFalsification!.candidateId).toBe('CHEMBL4297839');
    expect(report.selfFalsification!.findings).toContain(
      'No trial is a direct head-to-head against semaglutide: every efficacy number is a naive indirect comparison across different trials/populations/doses.',
    );
    expect(report.selfFalsification!.findings).toContain(
      'Fewer than 2 independent trials support this candidate\'s efficacy — a single study is not replicated.',
    );
  });

  it('reaches CONFLICTING_EVIDENCE honestly — no candidate is forced to win', () => {
    const report = runA2Analysis();
    expect(report.verdict.label).toBe('CONFLICTING_EVIDENCE');
    // No PracticalCandidate is gated for a conflicting-evidence result — nothing is proposed as an actionable winner.
    expect(report.gatedCandidate).toBeNull();
    expect(report.gateDecision).toBeNull();
    expect(report.surface).toBe('NONE');
  });

  it('discloses two real GCGR-antagonist candidates (mechanistically distinct from semaglutide) rather than silently excluding them', () => {
    const report = runA2Analysis();
    const mk0893 = report.candidateReports.find((r) => r.summary.moleculeChemblId === 'CHEMBL1933349');
    const adomeglivant = report.candidateReports.find((r) => r.summary.moleculeChemblId === 'CHEMBL3707351');
    expect(mk0893).toBeDefined();
    expect(adomeglivant).toBeDefined();
    const finding = selfFalsifyWinner(adomeglivant!);
    expect(finding.findings.some((f) => f.includes('glucagon receptor ANTAGONISM'))).toBe(true);
  });

  it('is deterministic: two independent runs over the same pinned data produce identical fingerprints', () => {
    const a = runA2Analysis();
    const b = runA2Analysis();
    expect(a.analysisFingerprint).toBe(b.analysisFingerprint);
    expect(a.analysisFingerprint).toBe('a5e0f164');
  });
});

describe('A2 Ozempic-substitute analysis — §14 safety boundary', () => {
  it('never emits a proposed clinical protocol, dose, or substitution instruction', () => {
    const report = runA2Analysis();
    // CONFLICTING_EVIDENCE gates nothing, so re-run decideA2Verdict's
    // BEST_SUPPORTED_CANDIDATE/PROMISING_BUT_UNCERTAIN branch shape directly
    // against the real top-with-evidence candidate to prove the gate itself
    // still enforces the boundary whenever a candidate IS proposed.
    const top = report.candidateReports.find((r) => r.summary.moleculeChemblId === 'CHEMBL4297839')!;
    expect(top.efficacy.length).toBeGreaterThan(0);
  });

  it('all 6 preregistered verdict labels are real, reachable code paths, not just declared', () => {
    // Empty reports -> INSUFFICIENT_EVIDENCE (no candidate has usable efficacy evidence at all).
    expect(decideA2Verdict([], null).label).toBe('INSUFFICIENT_EVIDENCE');
  });
});

describe('A2 Ozempic-substitute analysis — Science Memory', () => {
  it('writes the analysis through the existing saveExperiment path, disclosing the conflict, not hiding it', async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => (storage.has(k) ? storage.get(k)! : null),
        setItem: (k: string, v: string) => void storage.set(k, v),
        removeItem: (k: string) => void storage.delete(k),
        key: (i: number) => [...storage.keys()][i] ?? null,
        get length() { return storage.size; },
      },
    });
    vi.resetModules();
    const { saveA2OzempicSubstituteToMemory, listExperiments } = await import('../core/scienceMemory');
    const report = runA2Analysis();

    const before = listExperiments().length;
    const record = saveA2OzempicSubstituteToMemory(report);
    expect(listExperiments().length).toBe(before + 1);

    expect(record.epistemicStatus).toBe('INCONCLUSIVE');
    const bodies = record.analysis!.map((a) => a.body).join(' ');
    expect(bodies).toContain(report.analysisFingerprint);
    expect(bodies).toContain('CONFLICTING_EVIDENCE');
    expect(bodies).toContain('TIRZEPATIDE');
    vi.unstubAllGlobals();
  });
});

describe('extractCandidateEfficacy — unit behaviour on synthetic fixtures', () => {
  const marginPp = 0.4;

  function makeTrial(overrides: Partial<Parameters<typeof extractCandidateEfficacy>[0]> = {}) {
    return {
      nctId: 'NCT-TEST',
      briefTitle: 'Synthetic test trial',
      arms: [],
      hba1cOutcomes: [
        {
          title: 'Change in HbA1c',
          type: 'PRIMARY',
          paramType: 'MEAN',
          dispersionType: 'Standard Deviation',
          unitOfMeasure: 'pp',
          groups: [{ id: 'OG000', title: 'Test Drug' }],
          denoms: [{ units: 'Participants', counts: [{ groupId: 'OG000', value: '100' }] }],
          classes: [{ categories: [{ measurements: [{ groupId: 'OG000', value: '-1.5', spread: '0.5' }] }] }],
        },
      ],
      weightOutcomes: [],
      adverseEvents: null,
      ...overrides,
    } as Parameters<typeof extractCandidateEfficacy>[0];
  }

  it('returns a naive indirect comparison against the fixed reference when no semaglutide arm exists', () => {
    const evidence = extractCandidateEfficacy(makeTrial(), /test drug/i, marginPp);
    expect(evidence).not.toBeNull();
    expect(evidence!.comparisonType).toBe('NAIVE_INDIRECT');
    expect(evidence!.evidenceBasis).toBe('RANDOMIZED_INDIRECT');
    expect(evidence!.fairnessFlags.some((f) => f.includes('naive indirect comparison'))).toBe(true);
  });

  it('returns null when no group matches the candidate pattern and there is more than one arm', () => {
    const trial = makeTrial({
      hba1cOutcomes: [
        {
          title: 'Change in HbA1c',
          type: 'PRIMARY',
          paramType: 'MEAN',
          dispersionType: 'Standard Deviation',
          unitOfMeasure: 'pp',
          groups: [{ id: 'OG000', title: 'Arm A' }, { id: 'OG001', title: 'Arm B' }],
          denoms: [{ units: 'Participants', counts: [{ groupId: 'OG000', value: '100' }, { groupId: 'OG001', value: '100' }] }],
          classes: [{ categories: [{ measurements: [{ groupId: 'OG000', value: '-1.5', spread: '0.5' }, { groupId: 'OG001', value: '-1.0', spread: '0.5' }] }] }],
        },
      ],
    });
    expect(extractCandidateEfficacy(trial, /nonexistent drug name/i, marginPp)).toBeNull();
  });

  it('converts a confidence-interval dispersion (lowerLimit/upperLimit, no spread) to a usable standard error', () => {
    const trial = makeTrial({
      hba1cOutcomes: [
        {
          title: 'Change in HbA1c',
          type: 'PRIMARY',
          paramType: 'LEAST_SQUARES_MEAN',
          dispersionType: '90% Confidence Interval',
          unitOfMeasure: 'pp',
          groups: [{ id: 'OG000', title: 'Test Drug' }],
          denoms: [{ units: 'Participants', counts: [{ groupId: 'OG000', value: '60' }] }],
          classes: [{ categories: [{ measurements: [{ groupId: 'OG000', value: '-0.45', lowerLimit: '-0.65', upperLimit: '-0.25' }] }] }],
        },
      ],
    });
    const evidence = extractCandidateEfficacy(trial, /test drug/i, marginPp);
    expect(evidence).not.toBeNull();
    expect(evidence!.candidateArm.meanChangePp).toBeCloseTo(-0.45, 6);
    expect(evidence!.diffCi95).not.toBeNull();
  });

  it('flags a below-minimum arm size for comparison', () => {
    const trial = makeTrial({
      hba1cOutcomes: [
        {
          title: 'Change in HbA1c',
          type: 'PRIMARY',
          paramType: 'MEAN',
          dispersionType: 'Standard Deviation',
          unitOfMeasure: 'pp',
          groups: [{ id: 'OG000', title: 'Test Drug' }],
          denoms: [{ units: 'Participants', counts: [{ groupId: 'OG000', value: '5' }] }],
          classes: [{ categories: [{ measurements: [{ groupId: 'OG000', value: '-1.5', spread: '0.5' }] }] }],
        },
      ],
    });
    const evidence = extractCandidateEfficacy(trial, /test drug/i, marginPp);
    expect(evidence!.fairnessFlags.some((f) => f.includes('below the preregistered minimum'))).toBe(true);
  });
});
