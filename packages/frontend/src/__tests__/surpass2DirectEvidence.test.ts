import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  SURPASS2_POPULATION,
  SURPASS2_RAW_BYTES,
  SURPASS2_RAW_SHA256,
  SURPASS2_STUDY,
  surpass2Arms,
  surpass2ArmByTitle,
  surpass2DirectComparisons,
  surpass2Observation,
  surpass2OutcomeTerms,
} from '../core/biotechData/surpass2DirectEvidence';
import { EVIDENCE_CLASS_RANK, assertComparisonEvidenceClass, compareCountedOutcomes, selectDecisionComparison } from '../core/agent/evidenceProvenance';

const FIXTURE = fileURLToPath(new URL('../core/biotechData/a2-ozempic-substitute/reference-semaglutide-NCT03987919.json', import.meta.url));
const SEMAGLUTIDE_ARM = '1 mg Semaglutide';

describe('SURPASS-2 ingest — provenance is verified, not quoted', () => {
  it('the declared sha256 and byte count are recomputed from the file on disk', () => {
    const bytes = readFileSync(FIXTURE);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(SURPASS2_STUDY.contentSha256);
    expect(bytes.byteLength).toBe(SURPASS2_STUDY.contentBytes);
  });

  it('carries the upstream raw hash separately from the narrowed one', () => {
    // Two different artefacts, two different hashes. Conflating them is how a
    // provenance chain quietly stops meaning anything.
    expect(SURPASS2_RAW_SHA256).not.toBe(SURPASS2_STUDY.contentSha256);
    expect(SURPASS2_RAW_BYTES).toBeGreaterThan(SURPASS2_STUDY.contentBytes);
    expect(SURPASS2_STUDY.sourceUrl).toBe('https://clinicaltrials.gov/api/v2/studies/NCT03987919');
  });

  it('does not claim a MedDRA version the pinned bytes do not carry', () => {
    expect(surpass2Observation('Diarrhoea', SEMAGLUTIDE_ARM).codingSystem).toBeNull();
  });

  it('carries the trial population so a T2D number is never read as an obesity number', () => {
    expect(SURPASS2_POPULATION).toMatch(/type 2 diabetes/i);
    expect(surpass2Observation('Diarrhoea', SEMAGLUTIDE_ARM).population).toBe(SURPASS2_POPULATION);
  });
});

describe('SURPASS-2 ingest — the arms that were previously unreachable', () => {
  it('exposes all four randomised arms', () => {
    expect(surpass2Arms().map((a) => a.title)).toEqual(['5 mg Tirzepatide', '10 mg Tirzepatide', '15 mg Tirzepatide', SEMAGLUTIDE_ARM]);
    expect(SURPASS2_STUDY.randomised).toBe(true);
  });

  it('reads the real diarrhoea counts from every arm', () => {
    const counts = surpass2Arms().map((a) => {
      const o = surpass2Observation('Diarrhoea', a.title);
      return [o.numAffected, o.numAtRisk];
    });
    expect(counts).toEqual([[62, 470], [77, 469], [65, 470], [54, 469]]);
  });

  it('reports the outcome terms the trial actually published at its threshold', () => {
    expect(surpass2OutcomeTerms()).toEqual(['Abdominal pain', 'Constipation', 'Diarrhoea', 'Dyspepsia', 'Nausea', 'Vomiting', 'Decreased appetite']);
  });

  it('throws on an unknown arm rather than guessing', () => {
    expect(() => surpass2ArmByTitle('2.4 mg Semaglutide')).toThrow(/has no arm titled/);
  });

  it('throws on an unreported outcome rather than returning zero', () => {
    // A term the trial never published is NO DATA. Returning 0/469 would turn
    // silence into evidence of absence.
    expect(() => surpass2Observation('Pancreatitis', SEMAGLUTIDE_ARM)).toThrow(/does not report "Pancreatitis"/);
  });
});

describe('SURPASS-2 ingest — every within-trial comparison classifies as DIRECT', () => {
  const comparisons = surpass2DirectComparisons('Diarrhoea', SEMAGLUTIDE_ARM);

  it('produces one comparison per tirzepatide arm, all DIRECT_RANDOMISED', () => {
    expect(comparisons).toHaveLength(3);
    for (const c of comparisons) {
      expect(c.evidenceClass).toBe('DIRECT_RANDOMISED');
      expect(c.sameStudy).toBe(true);
      expect(c.studyIds).toEqual(['NCT03987919']);
      assertComparisonEvidenceClass(c, 'surpass2DirectComparisons');
    }
  });

  it('reproduces the three direct risk ratios from the pinned counts', () => {
    const byArm = Object.fromEntries(comparisons.map((c) => [c.exposed.arm.title, c]));
    // Denominators differ by one participant between arms, so these are not
    // simply ratios of the numerators.
    expect(byArm['5 mg Tirzepatide'].riskRatio).toBeCloseTo(1.145705, 6);
    expect(byArm['10 mg Tirzepatide'].riskRatio).toBeCloseTo(1.425926, 6);
    expect(byArm['15 mg Tirzepatide'].riskRatio).toBeCloseTo(1.201143, 6);

    // Only the 10 mg arm's interval clears 1 — the other two straddle it.
    expect(byArm['5 mg Tirzepatide'].ci95.low).toBeCloseTo(0.814120, 6);
    expect(byArm['10 mg Tirzepatide'].ci95.low).toBeCloseTo(1.031821, 6);
    expect(byArm['15 mg Tirzepatide'].ci95.low).toBeCloseTo(0.857114, 6);
    expect(byArm['10 mg Tirzepatide'].ci95.high).toBeCloseTo(1.970559, 6);
  });

  it('rests on 131 events, against the 59 behind the indirect comparison it can replace', () => {
    const worst = selectDecisionComparison(comparisons)!;
    expect(worst.exposed.arm.title).toBe('10 mg Tirzepatide');
    expect(worst.totalEvents).toBe(131);
    // The comparison currently driving the veto: 5 + 54 events across two trials.
    expect(worst.totalEvents).toBeGreaterThan(5 + 54);
  });

  it('every one of the three outranks the cross-trial comparison, whichever is chosen', () => {
    // Not "the chosen one is better" but "none of them is worse": the decision
    // no longer depends on which arm happens to be picked.
    const indirect = compareCountedOutcomes(
      {
        observationId: 'NCT03322631:EG002:Diarrhoea',
        study: { ...SURPASS2_STUDY, studyId: 'NCT03322631', title: 'Japanese phase 2', contentSha256: 'other' },
        arm: { groupId: 'EG002', title: '5 mg/10 mg/15 mg Tirzepatide (Cohort 2)', nAtRisk: 16 },
        term: 'Diarrhoea',
        numAffected: 5,
        numAtRisk: 16,
        codingSystem: null,
        population: 'Japanese adults with type 2 diabetes',
      },
      surpass2Observation('Diarrhoea', SEMAGLUTIDE_ARM),
    )!;

    expect(indirect.evidenceClass).toBe('INDIRECT_RANDOMISED');
    expect(indirect.riskRatio).toBeCloseTo(2.7141, 4);
    for (const c of comparisons) {
      expect(EVIDENCE_CLASS_RANK[c.evidenceClass]).toBeGreaterThan(EVIDENCE_CLASS_RANK[indirect.evidenceClass]);
    }
    expect(selectDecisionComparison([...comparisons, indirect])!.evidenceClass).toBe('DIRECT_RANDOMISED');
  });

  it('works for every published term, not just the one under dispute', () => {
    for (const term of surpass2OutcomeTerms()) {
      const cs = surpass2DirectComparisons(term, SEMAGLUTIDE_ARM);
      expect(cs.length).toBeGreaterThan(0);
      for (const c of cs) expect(c.evidenceClass).toBe('DIRECT_RANDOMISED');
    }
  });

  it('vomiting reverses direction under direct comparison', () => {
    // Recorded because it is the strongest counter-example to reading pooled
    // safety impressions as within-trial facts, and because it cuts AGAINST
    // the candidate's critics — evidence that helps a candidate is evidence.
    const cs = surpass2DirectComparisons('Vomiting', SEMAGLUTIDE_ARM);
    const byArm = Object.fromEntries(cs.map((c) => [c.exposed.arm.title, c]));
    expect(byArm['5 mg Tirzepatide'].riskRatio).toBeLessThan(1);
    expect(byArm['10 mg Tirzepatide'].riskRatio).toBeCloseTo(1.0, 2);
  });
});
