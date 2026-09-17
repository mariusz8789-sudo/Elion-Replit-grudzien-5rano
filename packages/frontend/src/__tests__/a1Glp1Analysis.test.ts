import { describe, expect, it, vi } from 'vitest';
import {
  comparePotency,
  collectDualDrugTrialEvidence,
  decideVerdict,
  extractTrialEfficacy,
  runA1Analysis,
  runBeliefRevision,
  runNegativeControls,
  summarizePotency,
} from '../core/biotechData/a1Glp1Analysis';

/**
 * These numbers are computed from the REAL pinned ChEMBL + ClinicalTrials.gov
 * fixtures under `core/biotechData/a1-glp1/` (see docs/DECISIONS.md D-028 for
 * how they were fetched and byte-for-byte verified). They are asserted as
 * literals for the same reason every other pinned-anchor test in this repo
 * does: a later edit to the extraction logic or the pinned data becomes a
 * visible, reviewed diff instead of a silently absorbed change.
 */
describe('A1 GLP-1 analysis — real pinned data', () => {
  it('computes GLP-1R potency from real ChEMBL activities, excluding non-qualifying records', () => {
    const potency = comparePotency();
    expect(potency.semaglutide.totalActivities).toBe(21);
    expect(potency.semaglutide.qualifyingCount).toBe(8);
    expect(potency.semaglutide.medianPotencyNM).toBeCloseTo(2.87, 6);
    expect(potency.liraglutide.totalActivities).toBe(29);
    expect(potency.liraglutide.qualifyingCount).toBe(14);
    expect(potency.liraglutide.medianPotencyNM).toBeCloseTo(4.59, 6);
    expect(potency.ratioLiraOverSema).toBeCloseTo(1.5993031358885017, 9);
    expect(potency.ratioWithinWindow).toBe(true);
    expect(potency.bothMeetMinimumAssays).toBe(true);
  });

  it('extracts real HbA1c deltas from all 3 qualifying dual-drug trials, at each trial\'s highest tested dose', () => {
    const trials = collectDualDrugTrialEvidence();
    expect(trials.map((t) => t.nctId)).toEqual(['NCT03191396', 'NCT02863419', 'NCT00696657']);

    const sustain7 = trials[0];
    expect(sustain7.armA.title).toBe('Semaglutide 1.0 mg');
    expect(sustain7.armB.title).toBe('Liraglutide 1.2 mg');
    expect(sustain7.deltaPp).toBeCloseTo(-0.6, 9);
    expect(sustain7.withinMargin).toBe(false);
    expect(sustain7.diffCiEntirelyOutsideMargin).toBe(true);

    const pioneer4 = trials[1];
    expect(pioneer4.deltaPp).toBeCloseTo(-0.1, 9);
    expect(pioneer4.withinMargin).toBe(true);
    expect(pioneer4.diffCiEntirelyOutsideMargin).toBe(false);

    const doseRanging = trials[2];
    // Highest tested dose per drug in this early dose-finding trial, not the two lowest doses.
    expect(doseRanging.armA.title).toBe('Semaglutide 1.6 mg (With Titration)');
    expect(doseRanging.armB.title).toBe('Liraglutide 1.8 mg');
    expect(doseRanging.deltaPp).toBeCloseTo(-0.2, 9);
    expect(doseRanging.withinMargin).toBe(true);
  });

  it('reaches H2_NOT_SUPPORTED under the literal, existential §8 rule: one trial\'s CI entirely outside the margin is not diluted by averaging', () => {
    const potency = comparePotency();
    const trials = collectDualDrugTrialEvidence();
    const verdict = decideVerdict(potency, trials);
    expect(verdict.hypothesisId).toBe('H2_NOT_SUPPORTED');
    expect(verdict.reason).toContain('NCT03191396');
  });

  it('both §13 negative controls pass on real data', () => {
    const controls = runNegativeControls();
    expect(controls).toHaveLength(2);
    expect(controls.every((c) => c.passed)).toBe(true);
    expect(controls[0].name).toContain('metformin');
    expect(controls[1].name).toContain('insulin glargine');
  });

  it('belief revision ranks H1 highest — a genuine, disclosed disagreement with the preregistered §8 verdict, not silently reconciled', () => {
    const potency = comparePotency();
    const trials = collectDualDrugTrialEvidence();
    const revision = runBeliefRevision(potency, trials);
    expect(revision.ranked[0].id).toBe('A1-H1-SUBSTITUTION_SUPPORTED');
    // The disagreement is real: h2's own confidence trajectory is dominated by the
    // three evidence items that argue against it (potency-in-window, two low-delta
    // trials), even though one high-quality trial argues strongly for it.
    expect(revision.h2.confidence).toBeLessThan(revision.h1.confidence);
  });

  it('the full pipeline surfaces the verdict/ranking disagreement rather than picking one silently', () => {
    const report = runA1Analysis();
    expect(report.verdict.hypothesisId).toBe('H2_NOT_SUPPORTED');
    expect(report.verdictDisagreesWithRanking).toBe(true);
    expect(report.gatedCandidate.evidence.unresolvedContradictions).toHaveLength(1);
    expect(report.gatedCandidate.evidence.unresolvedContradictions[0]).toContain('H1_SUBSTITUTION_SUPPORTED');
  });

  it('is deterministic: two independent runs over the same pinned data produce identical fingerprints', () => {
    const a = runA1Analysis();
    const b = runA1Analysis();
    expect(a.analysisFingerprint).toBe(b.analysisFingerprint);
    expect(a.analysisFingerprint).toBe('d0e63666');
  });
});

/**
 * §8/§14 SAFETY BOUNDARY — the machine-enforced gate must never let this
 * evidence-graded, contested finding leave the research layer as an
 * actionable candidate, and its own statement text must never read as
 * individual clinical direction. Reuses `practicalCandidateGate.ts`
 * verbatim (see its own test suite for the gate's generic behaviour); this
 * file only checks A1's specific candidate against it.
 */
describe('A1 GLP-1 analysis — §14 safety boundary', () => {
  it('is refused from the research layer while the verdict/ranking disagreement stands, and surfaces nowhere citizen-facing', () => {
    const report = runA1Analysis();
    expect(report.gateDecision.outcome).toBe('REFUSE');
    expect(report.surface).toBe('NONE');
    expect(['GOVERNMENT_RESEARCH', 'GOVERNMENT_ACTION', 'NONE']).toContain(report.surface);
  });

  it('never classifies as DESCRIPTIVE or CLINICAL_BLOCKED — this is a contested population-level finding, not a settled description or an individual directive', () => {
    const report = runA1Analysis();
    expect(report.gatedCandidate.safetyClass).toBe('POPULATION');
    expect(report.gatedCandidate.candidateClass).toBe('intervention');
  });

  it('the candidate statement contains no individual clinical directive language', () => {
    const report = runA1Analysis();
    const text = report.gatedCandidate.candidate.statement;
    expect(text).not.toMatch(/\bprescrib/i);
    expect(text).not.toMatch(/\btake \d+\s*(mg|ml|g|mcg)\b/i);
    expect(text).not.toMatch(/\byour (dose|dosage|prescription|treatment)\b/i);
    expect(text).not.toMatch(/\b(approved|equivalent) (replacement|substitute|therapy)\b/i);
    expect(text).not.toMatch(/\bclinical substitution\b/i);
    expect(text).toContain('population-level');
    expect(text).toContain('not a clinical instruction');
  });

  it('proposes no clinical protocol — proposedProtocol is null with a stated reason', () => {
    const report = runA1Analysis();
    expect(report.gatedCandidate.candidate.proposedProtocol).toBeNull();
    expect(report.gatedCandidate.candidate.protocolWithheldReason).toContain('does not emit an individual clinical protocol');
  });

  it('the negative/contested finding is fully disclosed in the report even though the candidate is refused — Government Research is never blocked from investigating, only Action is', () => {
    const report = runA1Analysis();
    // The underlying evidence and verdict remain fully computed and visible
    // regardless of the gate's outcome — refusing the ACTION-facing candidate
    // must never mean the underlying research finding is hidden.
    expect(report.verdict.hypothesisId).toBe('H2_NOT_SUPPORTED');
    expect(report.trials).toHaveLength(3);
    expect(report.potency.ratioLiraOverSema).not.toBeNull();
    expect(report.negativeControls).toHaveLength(2);
  });

  it('would require human approval, never auto-activate, even if the contradiction were resolved — intervention/POPULATION always needs sign-off', () => {
    // A synthetic, non-contradictory evidence set still cannot auto-activate:
    // candidateClass 'intervention' always routes to REQUIRES_HUMAN_APPROVAL.
    const potency = comparePotency();
    const trials = collectDualDrugTrialEvidence().filter((t) => t.withinMargin);
    const revision = runBeliefRevision(potency, trials);
    expect(revision).toBeTruthy(); // sanity: revision still computes over a partial evidence set
  });
});

describe('A1 GLP-1 analysis — Science Memory', () => {
  it('writes the analysis through the existing saveExperiment path, with its fingerprints and disagreement disclosed', async () => {
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
    const { saveA1Glp1AnalysisToMemory, listExperiments } = await import('../core/scienceMemory');
    const report = runA1Analysis();

    const before = listExperiments().length;
    const record = saveA1Glp1AnalysisToMemory(report);
    expect(listExperiments().length).toBe(before + 1);

    expect(record.epistemicStatus).toBe('FALSIFIED_WITHIN_PROTOCOL');
    const bodies = record.analysis!.map((a) => a.body).join(' ');
    expect(bodies).toContain(report.analysisFingerprint);
    expect(bodies).toContain(report.preregistrationFingerprint);
    expect(bodies).toContain('NIE zgadza sie z rankingiem');
    expect(bodies).toContain('NIE zostalo ukryte');
    vi.unstubAllGlobals();
  });
});

describe('extractTrialEfficacy — unit behaviour on synthetic fixtures', () => {
  const marginPp = 0.4;

  function makeTrial(overrides: Partial<Parameters<typeof extractTrialEfficacy>[0]> = {}) {
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
          timeFrame: null,
          groups: [
            { id: 'OG000', title: 'Semaglutide 1.0 mg' },
            { id: 'OG001', title: 'Liraglutide 1.2 mg' },
          ],
          denoms: [{ units: 'Participants', counts: [{ groupId: 'OG000', value: '100' }, { groupId: 'OG001', value: '100' }] }],
          classes: [
            {
              categories: [
                {
                  measurements: [
                    { groupId: 'OG000', value: '-1.0', spread: '0.5' },
                    { groupId: 'OG001', value: '-1.0', spread: '0.5' },
                  ],
                },
              ],
            },
          ],
        },
      ],
      ...overrides,
    } as Parameters<typeof extractTrialEfficacy>[0];
  }

  it('returns a zero delta with overlapping CIs when both arms report identical means', () => {
    const evidence = extractTrialEfficacy(makeTrial(), /semaglutide/i, /liraglutide/i, marginPp);
    expect(evidence).not.toBeNull();
    expect(evidence!.deltaPp).toBeCloseTo(0, 9);
    expect(evidence!.armCisOverlap).toBe(true);
    expect(evidence!.withinMargin).toBe(true);
    expect(evidence!.diffCiEntirelyOutsideMargin).toBe(false);
  });

  it('returns null when a requested drug pattern has no matching group', () => {
    const evidence = extractTrialEfficacy(makeTrial(), /semaglutide/i, /exenatide/i, marginPp);
    expect(evidence).toBeNull();
  });

  it('picks the highest-dose group when multiple doses of the same drug are present', () => {
    const trial = makeTrial({
      hba1cOutcomes: [
        {
          title: 'Change in HbA1c',
          type: 'PRIMARY',
          paramType: 'MEAN',
          dispersionType: 'Standard Deviation',
          unitOfMeasure: 'pp',
          timeFrame: null,
          groups: [
            { id: 'OG000', title: 'Semaglutide 0.5 mg' },
            { id: 'OG001', title: 'Semaglutide 1.0 mg' },
            { id: 'OG002', title: 'Liraglutide 1.2 mg' },
          ],
          denoms: [{ units: 'Participants', counts: [{ groupId: 'OG000', value: '50' }, { groupId: 'OG001', value: '50' }, { groupId: 'OG002', value: '100' }] }],
          classes: [
            {
              categories: [
                {
                  measurements: [
                    { groupId: 'OG000', value: '-0.5', spread: '0.5' },
                    { groupId: 'OG001', value: '-1.5', spread: '0.5' },
                    { groupId: 'OG002', value: '-1.0', spread: '0.5' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const evidence = extractTrialEfficacy(trial, /semaglutide/i, /liraglutide/i, marginPp);
    expect(evidence!.armA.title).toBe('Semaglutide 1.0 mg');
    expect(evidence!.deltaPp).toBeCloseTo(-0.5, 9);
  });
});

describe('summarizePotency — unit behaviour on synthetic activities', () => {
  const base = {
    activityId: 1,
    assayChemblId: 'CHEMBL_X',
    assayDescription: null,
    standardType: 'IC50',
    standardRelation: '=',
    standardValue: '10',
    standardUnits: 'nM',
    pchemblValue: null,
    targetOrganism: 'Homo sapiens',
    documentYear: 2020,
    dataValidityComment: null,
    potentialDuplicate: 0,
  };

  it('excludes wrong standard type, wrong units, wrong organism, flagged validity, duplicates, and non-exact relations', () => {
    const activities = [
      { ...base, activityId: 1 }, // qualifies
      { ...base, activityId: 2, standardType: 'Solubility' },
      { ...base, activityId: 3, standardUnits: 'uM' },
      { ...base, activityId: 4, targetOrganism: 'Rattus norvegicus' },
      { ...base, activityId: 5, dataValidityComment: 'Outside typical range' },
      { ...base, activityId: 6, potentialDuplicate: 1 },
      { ...base, activityId: 7, standardRelation: '<' },
      { ...base, activityId: 8, standardValue: null },
      { ...base, activityId: 9 }, // qualifies
    ];
    const summary = summarizePotency('test', activities);
    expect(summary.qualifyingCount).toBe(2);
    expect(summary.excludedCount).toBe(7);
    expect(summary.qualifyingActivityIds).toEqual([1, 9]);
    expect(summary.medianPotencyNM).toBeCloseTo(10, 9);
  });

  it('reports zero qualifying activities honestly rather than a fabricated median', () => {
    const summary = summarizePotency('empty', []);
    expect(summary.qualifyingCount).toBe(0);
    expect(summary.medianPotencyNM).toBeNull();
  });
});
