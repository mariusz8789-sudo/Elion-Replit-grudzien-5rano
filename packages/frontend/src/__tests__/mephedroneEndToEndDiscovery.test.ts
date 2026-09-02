import { beforeAll, describe, expect, it } from 'vitest';
import { createNodeAdmetTransport } from '../core/discovery/molecular/admetTransport.node';
import { createNodeRdkitTransport } from '../core/discovery/molecular/rdkitTransport.node';
import { mephedroneDiscoveryRequest, MEPHEDRONE_SUBJECT } from '../core/discovery/molecular/mephedroneDiscoveryCase';
import { runEndToEndDiscovery, type EndToEndDiscoveryResult } from '../core/discovery/molecular/endToEndDiscovery';
import {
  buildEndToEndEvidencePack,
  buildSavedEndToEndRun,
  exportEndToEndRoCrate,
  nextExperiments,
  replaySavedEndToEndRun,
  saveEndToEndRunToMemory,
} from '../core/discovery/molecular/endToEndDiscoveryEvidence';

/**
 * REAL end-to-end execution against the REAL engines in this runtime — real
 * RDKit and real ADMET-AI, both spawned as child processes. Nothing here is
 * mocked, so every number this file prints and asserts on came out of an
 * actual run.
 *
 * The run is executed ONCE in `beforeAll` and every test reads that result,
 * because re-running would spawn hundreds of Python processes per test.
 */
const RUN_TIMEOUT_MS = 1_800_000;

let result: EndToEndDiscoveryResult;
let rdkitAvailable = false;

beforeAll(async () => {
  const rdkit = createNodeRdkitTransport({ timeoutMs: 60_000 });
  const admet = createNodeAdmetTransport({ timeoutMs: 900_000 });
  rdkitAvailable = rdkit.detect().available;
  result = runEndToEndDiscovery(mephedroneDiscoveryRequest(), { rdkit, admet });
  printDossier(result);
}, RUN_TIMEOUT_MS);

function printDossier(r: EndToEndDiscoveryResult): void {
  const lines: string[] = [];
  const push = (s = '') => lines.push(s);

  push('');
  push('================= GENESIS DISCOVERY RESULT =================');
  push('');
  push('QUESTION:');
  push(`  ${r.question.question}`);
  push('');
  push('REFERENCE IDENTITY:');
  push(`  name              ${r.referenceIdentity.name}`);
  push(`  declared SMILES   ${r.referenceIdentity.declaredSmiles}`);
  push(`  canonical SMILES  ${r.referenceIdentity.canonicalSmiles ?? 'NOT_AVAILABLE'}`);
  push(`  formula           ${r.referenceIdentity.molecularFormula ?? 'NOT_AVAILABLE'} (cross-check ${r.referenceIdentity.formulaCrossCheck})`);
  push(`  InChIKey          ${r.referenceIdentity.inchiKey ?? 'NOT_AVAILABLE'}`);
  push(`  molecular weight  ${r.referenceIdentity.molecularWeight ?? 'NOT_AVAILABLE'}`);
  push(`  engine            ${r.referenceIdentity.engine}`);
  push('');
  push('TARGET / MECHANISM (subject, from ingested records only):');
  push(`  targets           ${MEPHEDRONE_SUBJECT.targets.join(', ')}`);
  push(`  mechanism class   ${MEPHEDRONE_SUBJECT.mechanismClass}`);
  for (const m of MEPHEDRONE_SUBJECT.measurements) {
    push(`  record            ${m.target} ${m.parameter}=${m.value}${m.unit ? ` ${m.unit}` : ''} | ${m.assay} | ${m.model} (${m.species}) | ${m.source}`);
  }
  push('');
  push('REFERENCE COMPARISONS:');
  push(`  ${r.referenceComparisons.summary}`);
  for (const c of r.referenceComparisons.comparisons) {
    push('');
    push(`  vs ${c.reference}  [claim strength: ${c.claim.strength}, confidence ${c.claim.confidence}]`);
    for (const axis of c.axes) push(`    ${axis.axis.padEnd(11)} ${axis.verdict.padEnd(16)} ${axis.statement}`);
    push(`    comparable measurement pairs: ${c.comparableMeasurementPairs.length}`);
  }
  push('');
  push('CANDIDATE GENERATION:');
  push(`  method            ${r.discovery.generationCapability.methodId} (${r.discovery.generationCapability.kind})`);
  push(`  deterministic     ${r.discovery.generationCapability.deterministic}`);
  push(`  transformations   ${r.discovery.batch.transformations.join(', ')}`);
  for (const note of r.discovery.generationNotes) push(`  note              ${note}`);
  push('');
  push('FILTER FUNNEL (every number is a real array length from this run):');
  push(`  generated                 ${r.funnel.generated}`);
  push(`  RDKit valid               ${r.funnel.rdkitValid}`);
  push(`  screening retained        ${r.funnel.screeningRetained}`);
  push(`  screening rejected        ${r.funnel.screeningRejected}`);
  push(`  screening not-resolved    ${r.funnel.screeningNotResolved}`);
  push(`  ADMET evaluable           ${r.funnel.admetEvaluable}`);
  push(`  mechanism not-excluded    ${r.funnel.mechanismNotExcluded}`);
  push(`  mechanism excluded        ${r.funnel.mechanismExcluded}`);
  push(`  mechanism unevaluable     ${r.funnel.mechanismUnevaluable}`);
  push(`  Pareto front              ${r.funnel.paretoFront}`);
  push('');
  push(`ADMET ENGINE: ${r.admet.engineId} (available=${r.admet.available})${r.admet.available ? '' : ` — ${r.admet.reason}`}`);
  push('');
  push('TOP CANDIDATES (Pareto front):');
  if (r.topCandidates.length === 0) push('  (empty)');
  const shown = ['logP', 'tpsa', 'molecularWeight', 'bloodBrainBarrier', 'mutagenicity', 'liverInjury', 'clinicalToxicity', 'admetAbsorption'];
  for (const [i, c] of r.topCandidates.entries()) {
    push(`  ${i + 1}. ${c.candidateId}  ${c.formula}  ${c.canonicalSmiles ?? 'NOT_AVAILABLE'}`);
    push(`     from ${c.parentFormula ?? 'SEED'} via ${c.transformation ?? '-'}`);
    const evaluated = r.evaluatedCandidates.find((e) => e.candidateId === c.candidateId);
    const values = shown
      .map((id) => {
        const p = evaluated?.properties.find((q) => q.propertyId === id);
        return p === undefined ? null : `${id}=${p.value === null ? p.status : p.value}${p.status === 'MODEL_PREDICTION' ? '*' : ''}`;
      })
      .filter((v): v is string => v !== null);
    push(`     ${values.join('  ')}`);
    push(`     ${c.reason}`);
  }
  push('  (* = ADMET-AI MODEL_PREDICTION, not a measurement)');
  push('');
  push('WHY OTHERS FAILED (grouped by deciding stage):');
  const rejected = r.outcomes.filter((o) => !o.onParetoFront);
  const byStage = new Map<string, typeof rejected>();
  for (const o of rejected) byStage.set(o.stage, [...(byStage.get(o.stage) ?? []), o]);
  for (const [stage, group] of [...byStage.entries()].sort()) {
    push(`  ${stage}: ${group.length}`);
    for (const o of group.slice(0, 4)) push(`    - ${o.candidateId} (${o.formula}): ${o.reason.slice(0, 200)}`);
    if (group.length > 4) push(`    ... and ${group.length - 4} more`);
  }
  push('');
  push('FALSIFICATION:');
  push(`  candidates analysed       ${r.falsification.perCandidate.length}`);
  push(`  fragile (thin margin)     ${r.falsification.fragileCandidateIds.length}`);
  push(`  untested refutations      ${r.falsification.untestedRefutations.join(', ') || 'none'}`);
  push('');
  push('RANKING:');
  push(`  objectives never evaluable: ${r.ranking.objectivesNeverEvaluable.join(', ') || 'none'}`);
  push(`  caveat: ${r.ranking.frontCaveat}`);
  push('');
  push('NEXT EXPERIMENT:');
  for (const step of nextExperiments(r).slice(0, 6)) {
    push(`  - [${step.kind}] ${step.action}`);
    push(`      resolves: ${step.resolves} | ${step.reason}`);
  }
  push('');
  push('UNKNOWN / LIMITATIONS:');
  for (const l of r.limitations) push(`  - ${l}`);
  push('');
  push(`RESULT FINGERPRINT: ${r.resultFingerprint}`);
  push('============================================================');
  push('');

  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));
}

describe('4-MMC end-to-end discovery: REAL execution', () => {
  it('resolves the reference compound through real RDKit and cross-checks its formula', () => {
    if (!rdkitAvailable) {
      expect(result.referenceIdentity.formulaCrossCheck).toBe('NOT_AVAILABLE');
      return;
    }
    expect(result.referenceIdentity.resolved).toBe(true);
    expect(result.referenceIdentity.molecularFormula).toBe('C11H15NO');
    expect(result.referenceIdentity.formulaCrossCheck).toBe('CONFIRMED');
    expect(result.referenceIdentity.inchiKey).toBe('YELGFTGWJGBAQU-UHFFFAOYSA-N');
    expect(result.referenceIdentity.engine).toContain('RDKit');
  });

  it('generates candidates with a deterministic enumerator, never claiming a generative model', () => {
    expect(result.discovery.generationCapability.kind).toBe('DETERMINISTIC_ENUMERATOR');
    expect(result.discovery.generationCapability.deterministic).toBe(true);
    if (rdkitAvailable) expect(result.funnel.generated).toBeGreaterThan(0);
  });

  it('funnel counts are internally consistent and never exceed the stage above', () => {
    const f = result.funnel;
    expect(f.rdkitValid).toBeLessThanOrEqual(f.generated);
    expect(f.screeningRetained + f.screeningRejected + f.screeningNotResolved).toBeLessThanOrEqual(f.generated);
    expect(f.mechanismNotExcluded + f.mechanismExcluded + f.mechanismUnevaluable).toBe(f.screeningRetained);
    expect(f.paretoFront).toBeLessThanOrEqual(f.mechanismNotExcluded);
    expect(f.admetEvaluable).toBeLessThanOrEqual(f.screeningRetained);
  });

  it('every generated candidate has an outcome with a stated reason — none vanish', () => {
    expect(result.outcomes).toHaveLength(result.funnel.generated);
    for (const outcome of result.outcomes) {
      expect(outcome.reason.length).toBeGreaterThan(0);
    }
  });

  it('4-MMC shares no documented target with ketamine, morphine or diazepam', () => {
    const byReference = new Map(result.referenceComparisons.comparisons.map((c) => [c.reference, c]));
    for (const reference of ['Ketamine', 'Morphine', 'Diazepam']) {
      const comparison = byReference.get(reference);
      expect(comparison, `missing comparison for ${reference}`).toBeDefined();
      expect(comparison!.sharedTargets).toEqual([]);
      expect(comparison!.axes.find((a) => a.axis === 'TARGET')!.verdict).toBe('DISTINCT');
    }
  });

  it('shares VMAT2 with the endogenous reference but still has no comparable measurement pair', () => {
    const dopamine = result.referenceComparisons.comparisons.find((c) => c.reference === 'Dopamine')!;
    expect(dopamine.sharedTargets).toContain('VMAT2');
    // Dopamine carries no ingested measurement, so nothing can be set side by side.
    expect(dopamine.comparableMeasurementPairs).toEqual([]);
    expect(dopamine.axes.find((a) => a.axis === 'FUNCTIONAL')!.verdict).toBe('NOT_ESTABLISHED');
  });

  it('never emits a CLINICALLY_EQUIVALENT or FUNCTIONAL_SIMILARITY claim', () => {
    for (const comparison of result.referenceComparisons.comparisons) {
      expect(comparison.claim.strength).not.toBe('CLINICALLY_EQUIVALENT');
      expect(comparison.claim.strength).not.toBe('FUNCTIONAL_SIMILARITY');
      expect(comparison.claim.limitation.length).toBeGreaterThan(0);
    }
  });

  it('structural similarity is never promoted into a target or functional claim', () => {
    for (const comparison of result.referenceComparisons.comparisons) {
      const structural = comparison.axes.find((a) => a.axis === 'STRUCTURAL')!;
      expect(structural.statement).toContain('not evidence of shared biological activity');
      if (comparison.sharedTargets.length === 0) {
        expect(comparison.claim.strength).toBe('STRUCTURAL_SIMILARITY');
      }
    }
  });

  it('mechanism prerequisites retain candidates as NOT_EXCLUDED, never as active', () => {
    for (const report of result.mechanism.reports) {
      expect(['NOT_EXCLUDED', 'EXCLUDED', 'UNEVALUABLE']).toContain(report.verdict);
      expect(report.standing).toContain('REQUIRES_EXPERIMENT');
      if (report.verdict === 'EXCLUDED') expect(report.exclusionReasons.length).toBeGreaterThan(0);
    }
  });

  it('no candidate carries a target-affinity value from any engine', () => {
    for (const candidate of result.discovery.batch.candidates) {
      const affinity = candidate.properties.find((p) => p.propertyId === 'affinity' || p.propertyId === 'targetAffinity');
      if (affinity !== undefined) {
        expect(['REQUIRES_EXPERIMENT', 'REQUIRES_EXTERNAL_ENGINE', 'NOT_AVAILABLE']).toContain(affinity.status);
        expect(affinity.value).toBeNull();
      }
    }
  });

  it('ADMET values are MODEL_PREDICTION, never COMPUTED or ACTUAL_SOURCE', () => {
    if (!result.admet.available) {
      expect(result.limitations.join(' ')).toContain('ADMET prediction did not run');
      return;
    }
    const admetIds = new Set(['mutagenicity', 'liverInjury', 'clinicalToxicity', 'admetAbsorption', 'bloodBrainBarrier']);
    let seen = 0;
    for (const candidate of result.evaluatedCandidates) {
      for (const property of candidate.properties) {
        if (!admetIds.has(property.propertyId) || property.value === null) continue;
        expect(property.status).toBe('MODEL_PREDICTION');
        seen++;
      }
    }
    if (result.funnel.admetEvaluable > 0) expect(seen).toBeGreaterThan(0);
  });

  it('the ADMET-derived BBB prerequisite is genuinely evaluated, not silently unevaluable', () => {
    if (!result.admet.available || result.funnel.admetEvaluable === 0) return;
    const evaluated = result.mechanism.reports.filter((r) =>
      r.checks.some((c) => c.prerequisiteId === 'predicted-bbb-penetration' && c.status !== 'UNEVALUABLE'));
    // If ADMET ran, the exposure prerequisite that reads its prediction must
    // have had a real value to test — otherwise the filter only looked like
    // it consulted ADMET.
    expect(evaluated.length).toBe(result.funnel.admetEvaluable);
  });

  it('builds an Evidence Pack and a valid RO-Crate through the existing engines', () => {
    const pack = buildEndToEndEvidencePack(result);
    expect(pack).toBeDefined();
    const crate = exportEndToEndRoCrate(result);
    expect(crate).toBeDefined();
    expect(JSON.stringify(crate).length).toBeGreaterThan(100);
  });

  it('replays MATCH against itself and BLOCKED under a different engine set', () => {
    const saved = buildSavedEndToEndRun(result);
    expect(replaySavedEndToEndRun(saved, result).status).toBe('MATCH');

    const differentEngine = { ...saved, admetEngine: 'ADMET-AI 0.0.1-other' };
    const blocked = replaySavedEndToEndRun(differentEngine, result);
    expect(blocked.status).toBe('BLOCKED');
    expect(blocked.reason).toContain('Engine set differs');

    expect(replaySavedEndToEndRun({ version: '1.0.0' }, result).status).toBe('BLOCKED');
  });

  it('drift is reported as DRIFT, not silently accepted', () => {
    const saved = { ...buildSavedEndToEndRun(result), resultFingerprint: 'deadbeef' };
    const replay = replaySavedEndToEndRun(saved, result);
    expect(replay.status).toBe('DRIFT');
  });

  it('saves to Scientific Memory with the honesty note and funnel intact', () => {
    const saved = saveEndToEndRunToMemory(result);
    expect(saved).toBeDefined();
    expect(saved.honestyNote).toContain('no measured affinity');
    expect(saved.epistemicStatus).toContain('TARGET_AFFINITY=REQUIRES_EXPERIMENT');
  });

  it('states plainly that nothing here is a safety, efficacy or equivalence claim', () => {
    const text = result.limitations.join(' ');
    expect(text).toContain('Nothing in this result is a claim of safety');
    expect(text).toContain('REQUIRES_EXPERIMENT');
    // The word "equivalence" may appear only inside an explicit disclaimer.
    for (const limitation of result.limitations) {
      if (limitation.includes('equivalence')) expect(limitation).toContain('Nothing in this result is');
    }
  });
});
