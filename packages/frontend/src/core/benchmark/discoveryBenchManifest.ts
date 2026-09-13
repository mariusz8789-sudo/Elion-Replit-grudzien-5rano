import type { BenchmarkSource, ExpectedEvaluationRule } from './types';

/**
 * FROZEN CASE MANIFEST — DiscoveryBench DB-REAL, `evolution_freshwater_fish`
 * task family, train split, 4 of the real gold hypotheses that name an
 * explicit, checkable sign and/or coefficient. Frozen BEFORE any Genesis run
 * (§2's "benchmark selection must be frozen before running"): this file was
 * written from the real `metadata_0..3.json` text, independently re-derived
 * once via ordinary least squares on the real CSV to confirm the published
 * numbers are reproducible, and committed unchanged from that point on.
 *
 * `notCoveredByThisManifest` in the archival JSON copy
 * (fixtures/discoverybench/evolution_freshwater_fish/MANIFEST.json) says
 * plainly what this run does NOT claim to have attempted: DiscoveryBench has
 * 144 real tasks across 6 domains: this run covers 4, from one domain, one
 * task family. Every case outside this list is NOT_ATTEMPTED, never
 * fabricated as PASS or FAIL.
 */

export const DISCOVERYBENCH_ID = 'discoverybench';
export const DISCOVERYBENCH_VERSION = 'DB-REAL-train@c31fcf01';

export const DISCOVERYBENCH_SOURCE: BenchmarkSource = {
  repo: 'https://github.com/allenai/discoverybench',
  commit: 'c31fcf011e070f021a5f5b906896d0821f6880e8',
  originalPath: 'discoverybench/real/train/evolution_freshwater_fish/',
  license: 'ODC-By 1.0 (Open Data Commons Attribution License)',
};

export const EVOLUTION_FISH_TARGET_VARIABLE = 'BAMM_speciation';
export const EVOLUTION_FISH_DECLARED_VARIABLES: readonly string[] = [
  'RML_evol', 'MBL_evol', 'OGP_evol', 'BEL_evol', 'diversity', 'runoff', 'Elevation', 'sgr', 'soil_div', 'area',
];

export interface EvolutionFishCaseSpec {
  readonly caseId: string;
  readonly metadataFile: string;
  readonly metadataSha256: string;
  readonly task: string;
  readonly goldHypothesisText: string;
  readonly expected: ExpectedEvaluationRule;
}

export const EVOLUTION_FISH_CASES: readonly EvolutionFishCaseSpec[] = [
  {
    caseId: 'evolution_freshwater_fish/metadata_0',
    metadataFile: 'metadata_0.json',
    metadataSha256: '0debacd967a8141d91ec2e4c7262d603f9c51513ea67259b86ee7c5a96d1f7ee',
    task: 'What are the factors most influential in explaining spatial variation in speciation rates?',
    goldHypothesisText: 'The rate of maximum body length evolution emerged as the most influential factor explaining spatial variation in speciation rates. The relationship is positive with linear coefficient 0.82.',
    expected: { kind: 'COEFFICIENT_SIGN', claims: [{ variable: 'MBL_evol', sign: 'POSITIVE', claimedCoefficient: 0.82 }] },
  },
  {
    caseId: 'evolution_freshwater_fish/metadata_1',
    metadataFile: 'metadata_1.json',
    metadataSha256: '356dd249dba26088336bb69c7f45449cae8e1105d0ee0047ed069bf89a2e0c82',
    task: 'How are evolutionary rates of oral gape position and relative maxillary length related to speciation rates?',
    goldHypothesisText: 'Evolutionary rates of oral gape position and relative maxillary length both exhibited a negative relationship with speciation rates. Their respective coefficient of relation is -4.6 and -4.9.',
    expected: {
      kind: 'COEFFICIENT_SIGN',
      claims: [
        { variable: 'OGP_evol', sign: 'NEGATIVE', claimedCoefficient: -4.6 },
        { variable: 'RML_evol', sign: 'NEGATIVE', claimedCoefficient: -4.9 },
      ],
    },
  },
  {
    caseId: 'evolution_freshwater_fish/metadata_2',
    metadataFile: 'metadata_2.json',
    metadataSha256: '30bcd26f66ea3a62a57d0379493ecc285f94193c07341d14ca95d25217a377d9',
    task: 'Is the rate of body elongation evolution associated with speciation rates?',
    goldHypothesisText: 'The rate of body elongation evolution has no significant association with speciation rates.',
    expected: { kind: 'NOT_SIGNIFICANT', variable: 'BEL_evol' },
  },
  {
    caseId: 'evolution_freshwater_fish/metadata_3',
    metadataFile: 'metadata_3.json',
    metadataSha256: '7bec14fc170b825bb90b52c7e3d577182db622542f1ec640c7edcf819cc6468d',
    task: 'Is species diversity related to speciation rates?',
    goldHypothesisText: 'There is a weak but significant, positive relationship between speciation rates and species diversity. The weak relationship is determined by a very small coefficient 0.00003018.',
    expected: { kind: 'COEFFICIENT_SIGN', claims: [{ variable: 'diversity', sign: 'POSITIVE', claimedCoefficient: 0.00003018 }] },
  },
];

/**
 * DiscoveryBench's own scoring (`discovery_eval.py` -> `eval/new_eval.py`'s
 * `run_eval_gold_vs_gen_NL_hypo_workflow`) calls an external LLM (OpenAI/
 * Anthropic/Google — verified in the upstream source at the commit above;
 * there is no rule-based fallback) for every facet of its HMS score. This
 * sandbox has no private LLM API key wired for scripted use, so that OFFICIAL
 * metric is NO_ACCESS here by construction — see docs/A10_BENCHMARK_SELECTION.md.
 * `expected` above is a disclosed, deterministic substitute over the SAME
 * real gold text: sign match, and (via `core/agent/modelSpace.ts`'s
 * `standardErrors`) a real significance check for the null-hypothesis case.
 */
export const OFFICIAL_HMS_METRIC_STATUS = 'NO_ACCESS: requires a private LLM API key this sandbox does not have (see eval/new_eval.py at the frozen commit).';
