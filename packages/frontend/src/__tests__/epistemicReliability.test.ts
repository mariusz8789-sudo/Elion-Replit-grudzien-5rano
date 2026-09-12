import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  RELIABILITY_RANK_ORDER, reliabilityRankIndex,
  knowledgeToCanonicalReliability, biotechToCanonicalReliability, canonicalReliabilityLabel,
} from '../core/epistemicReliability';
import { EPISTEMIC_LABELS, type EpistemicStatus } from '../core/generator/recipe';
import type { KnowledgeEpistemicStatus } from '../core/knowledge/supplementalRegistry';
import type { BiotechEpistemicStatus } from '../core/biotechDiscoveryContract';

const ALL_KNOWLEDGE_STATUSES: readonly KnowledgeEpistemicStatus[] = [
  'FACT', 'MODEL', 'THEORY', 'HYPOTHESIS', 'SCENARIO_ASSUMPTION', 'FICTIONAL_REFERENCE',
];
const ALL_BIOTECH_STATUSES: readonly BiotechEpistemicStatus[] = [
  'FACT', 'OBSERVED', 'LITERATURE_SUPPORTED', 'PREDICTION', 'INFERENCE', 'HYPOTHESIS', 'UNKNOWN', 'BLOCKED',
];

describe('G6 canonical epistemic reliability dictionary (P1)', () => {
  it('RELIABILITY_RANK_ORDER is exactly the EpistemicStatus universe, each value once', () => {
    const canonicalUniverse = Object.keys(EPISTEMIC_LABELS).sort();
    expect([...RELIABILITY_RANK_ORDER].sort()).toEqual(canonicalUniverse);
    expect(new Set(RELIABILITY_RANK_ORDER).size).toBe(RELIABILITY_RANK_ORDER.length);
  });

  it('reliabilityRankIndex is strictly increasing along RELIABILITY_RANK_ORDER and deterministic', () => {
    const indices = RELIABILITY_RANK_ORDER.map((status) => reliabilityRankIndex(status));
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
    expect(new Set(indices).size).toBe(indices.length);
    for (const status of RELIABILITY_RANK_ORDER) {
      expect(reliabilityRankIndex(status)).toBe(reliabilityRankIndex(status));
    }
  });

  it('reliabilityRankIndex rejects a value outside the canonical scale', () => {
    expect(() => reliabilityRankIndex('NOT_A_REAL_TIER' as EpistemicStatus)).toThrow();
  });

  it('knowledgeToCanonicalReliability is total and deterministic over every real KnowledgeEpistemicStatus value', () => {
    for (const status of ALL_KNOWLEDGE_STATUSES) {
      const mapped = knowledgeToCanonicalReliability(status);
      expect(RELIABILITY_RANK_ORDER).toContain(mapped);
      expect(knowledgeToCanonicalReliability(status)).toBe(mapped);
    }
  });

  it('knowledgeToCanonicalReliability: FACT and HYPOTHESIS keep their face-value meaning', () => {
    expect(knowledgeToCanonicalReliability('FACT')).toBe('ESTABLISHED_SCIENCE');
    expect(knowledgeToCanonicalReliability('HYPOTHESIS')).toBe('HYPOTHESIS');
  });

  it('knowledgeToCanonicalReliability: FICTIONAL_REFERENCE lands at the honest floor of the scale', () => {
    expect(knowledgeToCanonicalReliability('FICTIONAL_REFERENCE')).toBe('UNSUPPORTED_CLAIM');
  });

  it('biotechToCanonicalReliability is deterministic over every real BiotechEpistemicStatus value', () => {
    for (const status of ALL_BIOTECH_STATUSES) {
      const mapped = biotechToCanonicalReliability(status);
      expect(biotechToCanonicalReliability(status)).toBe(mapped);
    }
  });

  it('biotechToCanonicalReliability: FACT and HYPOTHESIS keep their face-value meaning', () => {
    expect(biotechToCanonicalReliability('FACT')).toBe('ESTABLISHED_SCIENCE');
    expect(biotechToCanonicalReliability('HYPOTHESIS')).toBe('HYPOTHESIS');
  });

  it('biotechToCanonicalReliability: BLOCKED is a process state, not a reliability tier — refuses to guess', () => {
    expect(biotechToCanonicalReliability('BLOCKED')).toBeUndefined();
  });

  it('biotechToCanonicalReliability: every non-BLOCKED value lands on the canonical scale', () => {
    for (const status of ALL_BIOTECH_STATUSES) {
      if (status === 'BLOCKED') continue;
      expect(RELIABILITY_RANK_ORDER).toContain(biotechToCanonicalReliability(status));
    }
  });

  it('canonicalReliabilityLabel reuses the already-shipped Polish EPISTEMIC_LABELS verbatim, not a duplicate copy', () => {
    for (const status of RELIABILITY_RANK_ORDER) {
      expect(canonicalReliabilityLabel(status)).toBe(EPISTEMIC_LABELS[status]);
    }
  });

  it('consolidating Knowledge+Biotech into the canonical scale never produces a rank ABOVE stated FACT/ESTABLISHED_SCIENCE', () => {
    const top = reliabilityRankIndex('ESTABLISHED_SCIENCE');
    for (const status of ALL_KNOWLEDGE_STATUSES) {
      expect(reliabilityRankIndex(knowledgeToCanonicalReliability(status))).toBeLessThanOrEqual(top);
    }
    for (const status of ALL_BIOTECH_STATUSES) {
      const mapped = biotechToCanonicalReliability(status);
      if (mapped !== undefined) expect(reliabilityRankIndex(mapped)).toBeLessThanOrEqual(top);
    }
  });
});

describe('G6: the four orthogonal axes stay untouched — zero breaking of saved data', () => {
  it('this module never imports the four orthogonal-axis types (HypothesisAssessment / terminalStatus / DataProvenance / scienceMemory) — doc-comment mentions are fine, a real import is not', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'core', 'epistemicReliability.ts'), 'utf8');
    const importLines = source.split('\n').filter((line) => /^\s*import\b/.test(line)).join('\n');
    expect(importLines).not.toMatch(/HypothesisAssessment/);
    expect(importLines).not.toMatch(/DataProvenance/);
    expect(importLines).not.toMatch(/scienceMemory/);
    expect(importLines).not.toMatch(/researchChain/i);
  });

  it('scienceMemory.ts is untouched by this consolidation: SavedExperimentEpistemicStatus still unions all six original vocabularies verbatim', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'core', 'scienceMemory.ts'), 'utf8');
    expect(source).toContain('export type SavedExperimentEpistemicStatus =');
    expect(source).toContain('| KnowledgeEpistemicStatus');
    expect(source).toContain('| HypothesisAssessment');
    expect(source).toContain("| SavedResearchChainManifest['terminalStatus']");
    expect(source).toContain('| DataProvenance');
    expect(source).toContain('| EpistemicStatus');
    expect(source).toContain('| BiotechEpistemicStatus');
  });
});
