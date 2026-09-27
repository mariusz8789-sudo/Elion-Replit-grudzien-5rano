/**
 * Scientific Validation Suite — metrics, research-quality validator, readiness scoring, publication
 * package generation, and the orchestrator. Logic is exercised with injected fakes (fast, no Python);
 * a guarded case drives real RDKit descriptor correctness when RDKit is installed.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as sv from './validation/scientificValidation.mjs';
import { validateResearchQuality } from './validation/researchQuality.mjs';
import { scoreReadiness } from './validation/readiness.mjs';
import { generatePublicationPackage } from './validation/publications.mjs';
import { runValidationSuite, TRUTH_CASES, MCRE_CASES, buildRecovery } from './validation/suite.mjs';
import { referenceMolWt, REFERENCE_MOLECULES } from './validation/knownChemistry.mjs';
import * as rdkit from './compute/rdkitAdapter.mjs';
import { canonicalHash } from './provenance.mjs';

describe('knownChemistry — reference MW from first principles', () => {
  test('aspirin C9H8O4 ≈ 180.159, caffeine C8H10N4O2 ≈ 194.19', () => {
    assert.ok(Math.abs(referenceMolWt('C9H8O4') - 180.159) < 0.01);
    assert.ok(Math.abs(referenceMolWt('C8H10N4O2') - 194.19) < 0.05);
    assert.throws(() => referenceMolWt('Xx2'), /no atomic weight/);
  });
});

describe('scientificValidation — descriptorAccuracy', () => {
  const perfect = (s) => ({ ok: true, data: { molWt: REFERENCE_MOLECULES.find((m) => m.smiles === s).referenceMolWt } });
  test('exact predictions → pass, MAE 0, Pearson 1', () => {
    const r = sv.descriptorAccuracy(perfect);
    assert.equal(r.status, 'COMPLETED');
    assert.equal(r.pass, true);
    assert.equal(r.mae, 0);
    assert.equal(r.pearsonR, 1);
    assert.equal(r.labelProvenance, 'DETERMINISTIC_CHEMISTRY');
  });
  test('a blocked descriptor engine → BLOCKED_BY_RUNTIME (never fabricated)', () => {
    const r = sv.descriptorAccuracy(() => ({ ok: false, error: 'BLOCKED_BY_RUNTIME', reason: 'no rdkit' }));
    assert.equal(r.status, 'BLOCKED_BY_RUNTIME');
  });
});

describe('scientificValidation — reproducibility & stability', () => {
  test('deterministic fn → reproducible; nondeterministic → not', () => {
    let n = 0;
    assert.equal(sv.reproducibility(() => ({ x: 1 })).reproducible, true);
    assert.equal(sv.reproducibility(() => ({ x: n++ })).reproducible, false);
  });
  test('rankingStability: order-independent ranking is stable (rho 1)', () => {
    const rank = () => [{ id: 'a', score: 3 }, { id: 'b', score: 2 }, { id: 'c', score: 1 }];
    const r = sv.rankingStability(rank, rank);
    assert.equal(r.stable, true);
    assert.equal(r.spearmanRho, 1);
  });
});

describe('scientificValidation — rankingRecovery', () => {
  const labeledSet = { items: [{ id: 'p1', label: true }, { id: 'p2', label: true }, { id: 'n1', label: false }, { id: 'n2', label: false }], labelProvenance: 'COMPUTATIONAL_CRITERION', criterion: 'test' };
  test('perfect ranking → precision/recall/AUC = 1, echoes label provenance', () => {
    const rankFn = () => [{ id: 'p1', score: 0.9 }, { id: 'p2', score: 0.8 }, { id: 'n1', score: 0.2 }, { id: 'n2', score: 0.1 }];
    const r = sv.rankingRecovery({ labeledSet, rankFn });
    assert.equal(r.status, 'COMPLETED');
    assert.equal(r.rocAuc, 1);
    assert.equal(r.precision, 1);
    assert.equal(r.labelProvenance, 'COMPUTATIONAL_CRITERION');
    assert.match(r.note, /require.*EXPERIMENTAL/i);
  });
  test('no labelled set → BLOCKED_BY_RESOURCES (never fabricated recovery)', () => {
    assert.equal(sv.rankingRecovery({ rankFn: () => [] }).status, 'BLOCKED_BY_RESOURCES');
    assert.equal(sv.rankingRecovery({ labeledSet: { items: [{ id: 'a', label: true }] }, rankFn: () => [] }).status, 'BLOCKED_BY_RESOURCES');
  });
});

describe('scientificValidation — Truth & MCRE benchmarks', () => {
  test('truth benchmark scores accuracy + consistency', () => {
    const runTruth = (p) => ({ decision: p.want });
    const r = sv.truthEngineBenchmark([{ name: 'a', proposal: { want: 'GO' }, expectedDecision: 'GO' }, { name: 'b', proposal: { want: 'BLOCK' }, expectedDecision: 'WARN' }], runTruth);
    assert.equal(r.accuracy, 0.5);
    assert.equal(r.consistency, 1);
  });
  test('mcre benchmark scores conflict detection', () => {
    const detect = (i) => (i.conflict ? [{}] : []);
    const r = sv.mcreBenchmark([{ name: 'a', input: { conflict: true }, expectConflict: true }, { name: 'b', input: { conflict: false }, expectConflict: false }], detect);
    assert.equal(r.accuracy, 1);
  });
});

describe('researchQuality — dossier validation', () => {
  function goodDossier() {
    const base = {
      evidence: { provenance: [{ sourceService: 'CHEMBL' }] },
      remainingUncertainty: ['no measured binding'],
      experimentalRecommendations: ['assay top candidates'],
      summaries: { admet: { epistemicStatus: 'MODEL_INFERRED' }, docking: { epistemicStatus: 'MODEL_ESTIMATE' } },
      didGenesisDiscoverADrug: 'NO',
      candidates: [{ computationalConfidence: 0.7, provenance: { x: 1 }, rationale: 'r', nextExperiment: 'e', rejectedAlternatives: [] }],
    };
    base.dossierHash = canonicalHash({ ...base, dossierHash: undefined, benchmarkExecutionMs: undefined });
    return base;
  }
  test('a complete dossier passes every check', () => {
    const r = validateResearchQuality(goodDossier());
    assert.equal(r.pass, true, JSON.stringify(r.checks.filter((c) => !c.pass)));
    assert.equal(r.score, 1);
  });
  test('a tampered dossier fails provenance integrity', () => {
    const d = goodDossier(); d.candidates[0].rationale = 'TAMPERED';
    const r = validateResearchQuality(d);
    assert.equal(r.pass, false);
    assert.equal(r.checks.find((c) => c.dimension === 'provenance.integrity').pass, false);
  });
});

describe('readiness — scored only from measured evidence', () => {
  test('strong evidence → higher scores; each dimension has evidence + gaps', () => {
    const ev = {
      descriptorAccuracy: { pass: true, pearsonR: 1, mae: 0 },
      reproducibility: [{ reproducible: true }, { reproducible: true }],
      rankingRecovery: { status: 'COMPLETED', rocAuc: 1, labelProvenance: 'COMPUTATIONAL_CRITERION' },
      truth: { accuracy: 1, consistency: 1 }, mcre: { accuracy: 1, consistency: 1 },
      researchQuality: { score: 1, passedChecks: 7, totalChecks: 7, checks: [{ dimension: 'provenance.integrity', pass: true }] },
      enginesExecuted: ['RDKit', 'ADMET-AI', 'AutoDock Vina'], blockedEngines: [],
    };
    const r = scoreReadiness(ev);
    assert.ok(r.overall > 0.7);
    for (const dim of ['research', 'biotech', 'pharma', 'grant', 'investor']) {
      assert.ok(r.dimensions[dim].evidence.length > 0 && r.dimensions[dim].gaps.length > 0, dim);
    }
  });
});

describe('publications — deterministic package generation', () => {
  test('generates valid SVG figures, CSV/MD tables, methodology, reports, manifest', () => {
    const result = runValidationSuiteFake();
    const pkg = generatePublicationPackage(result, { generatedAt: 'T', engineVersions: { RDKit: 'x' }, resultHash: 'h' });
    assert.ok(pkg.figures['fig1_benchmark_summary.svg'].startsWith('<svg') && pkg.figures['fig1_benchmark_summary.svg'].endsWith('</svg>'));
    assert.ok(pkg.tables['table2_benchmark_metrics.csv'].includes('metric,value'));
    assert.match(pkg.methodology, /Methodology/);
    assert.equal(pkg.benchmarkReport.didGenesisDiscoverADrug, 'NO');
    assert.equal(pkg.reproducibility.reproduceCommand, 'node scripts/run-scientific-validation.mjs');
    // deterministic: same input → identical package
    const pkg2 = generatePublicationPackage(result, { generatedAt: 'T', engineVersions: { RDKit: 'x' }, resultHash: 'h' });
    assert.equal(canonicalHash(pkg), canonicalHash(pkg2));
  });
});

describe('suite — calibrated cases + fixtures', () => {
  test('TRUTH_CASES / MCRE_CASES are well-formed', () => {
    assert.ok(TRUTH_CASES.length >= 4 && TRUTH_CASES.every((c) => c.expectedDecision));
    assert.ok(MCRE_CASES.length >= 3 && MCRE_CASES.every((c) => typeof c.expectConflict === 'boolean'));
  });
  test('buildRecovery labels the curated drug set as positives', () => {
    const { labeledSet } = buildRecovery(() => ({ ok: true, data: { molWt: 200, aromaticRings: 1, hbd: 1, hba: 2, rotatableBonds: 2, lipinskiViolations: 0 } }));
    assert.equal(labeledSet.labelProvenance, 'COMPUTATIONAL_CRITERION');
    assert.ok(labeledSet.items.some((i) => i.label) && labeledSet.items.some((i) => !i.label));
  });
});

// Real-engine guarded: descriptor correctness against first-principles chemistry.
describe('suite — REAL RDKit descriptor correctness', () => {
  (rdkit.detect().available ? test : test.skip)('runValidationSuite: RDKit MW matches reference (MAE < 0.6)', () => {
    const r = runValidationSuite({});
    assert.equal(r.metrics.descriptorAccuracy.status, 'COMPLETED');
    assert.equal(r.metrics.descriptorAccuracy.pass, true);
    assert.ok(r.metrics.descriptorAccuracy.mae < 0.6);
    assert.equal(r.metrics.truth.status, 'COMPLETED');
    assert.equal(r.metrics.mcre.status, 'COMPLETED');
  });
});

/** A fully-synthetic validation result for testing publication generation (no engines). */
function runValidationSuiteFake() {
  return {
    version: 'test', enginesExecuted: ['RDKit'], blockedEngines: [],
    metrics: {
      descriptorAccuracy: { status: 'COMPLETED', n: 3, mae: 0, maxAbsError: 0, pearsonR: 1, pass: true, labelProvenance: 'DETERMINISTIC_CHEMISTRY', cases: [{ name: 'aspirin', formula: 'C9H8O4', referenceMolWt: 180.159, computedMolWt: 180.159, absError: 0, withinTolerance: true }] },
      reproducibility: [{ label: 'x', reproducible: true, runs: 3, hash: 'h' }],
      rankingStability: { spearmanRho: 1, identicalOrder: true, stable: true },
      rankingRecovery: { status: 'COMPLETED', labelProvenance: 'COMPUTATIONAL_CRITERION', n: 4, positives: 2, precision: 1, recall: 1, f1: 1, topK: {}, enrichment: {}, rocAuc: 1 },
      truth: { status: 'COMPLETED', n: 5, accuracy: 1, consistency: 1 },
      mcre: { status: 'COMPLETED', n: 3, accuracy: 1, consistency: 1 },
    },
    researchQuality: { pass: true, score: 1, passedChecks: 7, totalChecks: 7 },
    readiness: { overall: 0.7, overallBand: 'MEDIUM', dimensions: { research: { score: 0.8, band: 'HIGH', evidence: ['x'], gaps: ['y'] } } },
  };
}
