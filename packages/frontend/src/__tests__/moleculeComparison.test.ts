/**
 * moleculeComparison (Stage 6) — the selection engine. Ranking, verdicts, reference
 * diffs, portfolio and matrix must be deterministic, explain themselves, and never
 * assert biology/efficacy. These are the honesty + correctness invariants.
 */
import { describe, expect, it } from 'vitest';
import {
  developabilityScore, decisionFor, rankCandidates, rankingWhy, differencesVsReference,
  portfolioBuckets, buildMatrix, descriptorFavorability, strengthsWeaknesses, VERDICT_META,
  type Candidate,
} from '../core/moleculeComparison';
import type { MoleculeProps } from '../core/moleculeInterpretation';

const ASPIRIN: MoleculeProps = { molWt: 180.16, logP: 1.31, tpsa: 63.6, hbd: 1, hba: 3, lipinskiViolations: 0, lipinskiPass: true };
const IBUPROFEN: MoleculeProps = { molWt: 206.28, logP: 3.5, tpsa: 37.3, hbd: 1, hba: 2, lipinskiViolations: 0, lipinskiPass: true };
const HEAVY: MoleculeProps = { molWt: 780, logP: 6.8, tpsa: 180, hbd: 7, hba: 13, lipinskiViolations: 3, lipinskiPass: false };
const MIDDLING: MoleculeProps = { molWt: 520, logP: 5.4, tpsa: 95, hbd: 2, hba: 6, lipinskiViolations: 1, lipinskiPass: false };

const cand = (id: string, props: MoleculeProps, alerts: string[] = []): Candidate => ({ id, name: id, smiles: `smiles-${id}`, props, alerts });

describe('developabilityScore', () => {
  it('is deterministic and bounded 0–100', () => {
    expect(developabilityScore(ASPIRIN)).toEqual(developabilityScore(ASPIRIN));
    for (const p of [ASPIRIN, IBUPROFEN, HEAVY, MIDDLING]) {
      const s = developabilityScore(p);
      expect(s.score).toBeGreaterThanOrEqual(0);
      expect(s.score).toBeLessThanOrEqual(100);
    }
  });
  it('rewards a clean drug-like molecule over a heavy violator', () => {
    expect(developabilityScore(ASPIRIN).score).toBeGreaterThan(developabilityScore(HEAVY).score);
  });
  it('attributes every point to a named rule with a reason', () => {
    for (const part of developabilityScore(IBUPROFEN).parts) {
      expect(part.label.length).toBeGreaterThan(0);
      expect(part.reason.length).toBeGreaterThan(0);
    }
  });
  it('penalises structural alerts', () => {
    expect(developabilityScore(ASPIRIN, ['Michael acceptor']).score).toBeLessThan(developabilityScore(ASPIRIN).score);
  });
});

describe('decisionFor', () => {
  it('rejects hard physicochemical liabilities with descriptor reasons', () => {
    const d = decisionFor(HEAVY);
    expect(d.verdict).toBe('REJECT');
    expect(d.reasons.some((r) => /Lipinskiego|LogP|MW/.test(r))).toBe(true);
  });
  it('flags high uncertainty when a structural alert is present', () => {
    expect(decisionFor(ASPIRIN, ['nitro group']).verdict).toBe('HIGH_UNCERTAINTY');
  });
  it('flags high uncertainty for borderline LogP and names it a model estimate', () => {
    const d = decisionFor(MIDDLING);
    expect(d.verdict).toBe('HIGH_UNCERTAINTY');
    expect(d.reasons.some((r) => /oszacowanie modelu|±0\.5/.test(r))).toBe(true);
  });
  it('recommends CONTINUE for a clean profile — but still demands validation', () => {
    const d = decisionFor(ASPIRIN);
    expect(d.verdict).toBe('CONTINUE');
    expect(d.reasons.some((r) => /walidacja eksperymentalna/i.test(r))).toBe(true);
  });
  it('never asserts biological activity or efficacy in any verdict', () => {
    const forbidden = /\b(jest aktywn|będzie skuteczn|leczy|udowodnion[oa] skuteczność)\b/i;
    for (const p of [ASPIRIN, IBUPROFEN, HEAVY, MIDDLING]) {
      expect(decisionFor(p).reasons.every((r) => !forbidden.test(r))).toBe(true);
    }
  });
});

describe('rankCandidates + rankingWhy', () => {
  const ranked = rankCandidates([cand('heavy', HEAVY), cand('aspirin', ASPIRIN), cand('ibuprofen', IBUPROFEN)]);
  it('orders by score descending with 1-based ranks', () => {
    expect(ranked.map((c) => c.rank)).toEqual([1, 2, 3]);
    expect(ranked[0].scored.score).toBeGreaterThanOrEqual(ranked[1].scored.score);
    expect(ranked[2].id).toBe('heavy');
  });
  it('explains WHY each ranks where it does', () => {
    for (const c of ranked) expect(rankingWhy(c).length).toBeGreaterThan(0);
    expect(rankingWhy(ranked[0]).some((w) => w.startsWith('+'))).toBe(true);
  });
  it('is deterministic', () => {
    const again = rankCandidates([cand('heavy', HEAVY), cand('aspirin', ASPIRIN), cand('ibuprofen', IBUPROFEN)]);
    expect(again.map((c) => c.id)).toEqual(ranked.map((c) => c.id));
  });
});

describe('differencesVsReference', () => {
  it('interprets direction, not just the raw number', () => {
    const diffs = differencesVsReference(IBUPROFEN, ASPIRIN);
    const logp = diffs.find((d) => d.key === 'logP')!;
    expect(logp.direction).toBe('higher');
    expect(logp.interpretation).toMatch(/lipofilowa/);
    const tpsa = diffs.find((d) => d.key === 'tpsa')!;
    expect(tpsa.direction).toBe('lower');
    expect(tpsa.interpretation).toMatch(/absorpcji/);
  });
  it('marks near-equal descriptors as equal', () => {
    const diffs = differencesVsReference(ASPIRIN, ASPIRIN);
    expect(diffs.every((d) => d.direction === 'equal')).toBe(true);
  });
});

describe('portfolioBuckets', () => {
  it('separates continue / needs-validation / rejected', () => {
    const ranked = rankCandidates([cand('a', ASPIRIN), cand('h', HEAVY), cand('m', MIDDLING), cand('al', ASPIRIN, ['epoxide'])]);
    const pf = portfolioBuckets(ranked);
    expect(pf.best.every((c) => c.decision.verdict === 'CONTINUE')).toBe(true);
    expect(pf.rejected.every((c) => c.decision.verdict === 'REJECT')).toBe(true);
    expect(pf.rejected.some((c) => c.id === 'h')).toBe(true);
    expect(pf.needsValidation.some((c) => c.id === 'm' || c.id === 'al')).toBe(true);
  });
});

describe('buildMatrix + descriptorFavorability', () => {
  it('builds a row per molecule with favourability in [0,1]', () => {
    const ranked = rankCandidates([cand('a', ASPIRIN), cand('h', HEAVY)]);
    const matrix = buildMatrix(ranked);
    expect(matrix.length).toBe(2);
    for (const row of matrix) {
      for (const cell of row.cells) {
        expect(cell.favorability).toBeGreaterThanOrEqual(0);
        expect(cell.favorability).toBeLessThanOrEqual(1);
      }
    }
  });
  it('scores an ideal descriptor higher than a poor one', () => {
    expect(descriptorFavorability('logP', 2)).toBeGreaterThan(descriptorFavorability('logP', 7));
    expect(descriptorFavorability('lipinskiViolations', 0)).toBe(1);
    expect(descriptorFavorability('alerts', 0)).toBeGreaterThan(descriptorFavorability('alerts', 3));
  });
});

describe('strengthsWeaknesses + VERDICT_META', () => {
  it('surfaces strengths for a clean molecule and weaknesses for a bad one', () => {
    expect(strengthsWeaknesses(developabilityScore(ASPIRIN)).strengths.length).toBeGreaterThan(0);
    expect(strengthsWeaknesses(developabilityScore(HEAVY)).weaknesses.length).toBeGreaterThan(0);
  });
  it('exposes a label + kind for every verdict', () => {
    for (const v of ['CONTINUE', 'NEEDS_EXPERIMENTS', 'HIGH_UNCERTAINTY', 'REJECT'] as const) {
      expect(VERDICT_META[v].label.length).toBeGreaterThan(0);
    }
  });
});
