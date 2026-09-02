import { describe, expect, it } from 'vitest';
import { structuralEngineFromRecords } from '../core/discovery/molecular/chemistry';
import { buildDemoDiscoveryQuestion, buildDemoGenerationSpec } from '../core/discovery/molecular/demoFixture';
import { runMolecularDiscovery } from '../core/discovery/molecular/discoveryRun';
import { buildDiscoveryEvidenceChain, buildDiscoveryEvidencePack, buildDiscoveryExperimentRun } from '../core/discovery/molecular/evidence';
import { buildDiscoveryExperimentGraph, explainDiscoveryEvidence, proposeNextDiscoverySteps } from '../core/discovery/molecular/nextStep';
import { buildSavedDiscoveryRun, isSavedDiscoveryRun, replaySavedDiscoveryRun } from '../core/discovery/molecular/replay';
import { verifyEvidencePackRoCrateRoundTrip } from '../core/experimentFabric/evidencePackRoCrate';

/**
 * EVIDENCE / REPLAY / RO-CRATE / NEXT EXPERIMENT — test matrix items J
 * (hypothesis creation), K (falsification), M (Evidence Pack), N (provenance),
 * O (RO-Crate round trip), P/Q/R (replay MATCH/DRIFT/BLOCKED), S (next
 * experiment), T (end-to-end fixture).
 *
 * Every Genesis engine touched here (`createScientificEvidencePack`,
 * `exportEvidencePackRoCrate`, `verifyEvidencePackRoCrateRoundTrip`,
 * `buildExperimentGraph`, `explainScientificEvidence`) is called UNMODIFIED.
 */

const question = buildDemoDiscoveryQuestion();
const generation = buildDemoGenerationSpec();
const result = runMolecularDiscovery(question, generation);

describe('N — prowieniencja', () => {
  it('ExperimentRun jest realny, deterministyczny i nie udaje więcej, niż policzył', () => {
    const run = buildDiscoveryExperimentRun(result);

    expect(run.provenance.resultOrigin).toBe('real-engine');
    expect(run.provenance.domainId).toBe('molecular-discovery');
    expect(run.provenance.deterministic).toBe(true);
    expect(run.runId).toBe(buildDiscoveryExperimentRun(result).runId);
    // Założenia jawnie odcinają wszystko, czego ten przebieg NIE zrobił.
    const assumptions = run.result.assumptions.join(' ');
    expect(assumptions).toMatch(/not a generative model/);
    expect(assumptions).toMatch(/No target-affinity, ADMET, toxicity or safety engine/);
    expect(assumptions).toMatch(/not a discovery/);
  });

  it('luki zdolności trafiają do ostrzeżeń przebiegu, a nie znikają', () => {
    const run = buildDiscoveryExperimentRun(result);
    expect(run.result.warnings.some((w) => w.includes('logP') && w.includes('REQUIRES_EXTERNAL_ENGINE'))).toBe(true);
  });
});

describe('J/K — hipoteza i falsyfikacja', () => {
  it('hipoteza ma prerejestrowane kryterium i jawny disclaimer', () => {
    const chain = buildDiscoveryEvidenceChain(result);

    expect(chain.createdFromRealRunsOnly).toBe(true);
    expect(chain.design.hypothesis.falsification.metric).toBe('retainedCandidateCount');
    expect(chain.design.hypothesis.disclaimer).toMatch(/not a discovery|not a bioactivity claim/i);
  });

  it('demo bez silnika strukturalnego kończy się INCONCLUSIVE, nie falsyfikacją i nie sukcesem', () => {
    // Wymagane kryterium logP jest REQUIRES_EXTERNAL_ENGINE, więc żaden kandydat
    // nie może zostać zachowany — ale to NIE jest dowód, że kandydaci są źli.
    expect(result.decision.verdict).toBe('NOT_RESOLVED');
    expect(buildDiscoveryEvidenceChain(result).assessment.assessment).toBe('INCONCLUSIVE');
  });

  it('gdy WSZYSTKO da się ocenić i wszystko przepada — dopiero wtedy FALSIFIED', () => {
    const impossible = {
      ...question,
      constraints: {
        ...question.constraints,
        criteria: [{ criterionId: 'mw-impossible', propertyId: 'molecularWeight', op: 'lte' as const, value: 1, required: true, rationale: 'test' }],
      },
    };
    const falsified = runMolecularDiscovery(impossible, generation);

    expect(falsified.decision.verdict).toBe('FALSIFIED_WITHIN_PROTOCOL');
    expect(buildDiscoveryEvidenceChain(falsified).assessment.assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
  });

  it('gdy wszystkie wymagane kryteria są policzalne i spełnione — SUPPORTED', () => {
    const satisfiable = {
      ...question,
      constraints: {
        ...question.constraints,
        criteria: [{ criterionId: 'mw-window', propertyId: 'molecularWeight', op: 'range' as const, value: 60, valueMax: 400, required: true, rationale: 'test' }],
      },
    };
    const supported = runMolecularDiscovery(satisfiable, generation);

    expect(supported.decision.verdict).toBe('SUPPORTED_WITHIN_PROTOCOL');
    expect(supported.ranking.length).toBeGreaterThan(0);
    expect(buildDiscoveryEvidencePack(supported).hypothesisAssessment.assessment).toBe('SUPPORTED_WITHIN_PROTOCOL');
  });
});

describe('M/O — Evidence Pack i RO-Crate przez ISTNIEJĄCE silniki', () => {
  it('paczka dowodowa powstaje z realnego przebiegu', () => {
    const pack = buildDiscoveryEvidencePack(result);

    expect(pack.runCount).toBe(1);
    expect(pack.runs[0]!.provenance.resultOrigin).toBe('real-engine');
    expect(pack.protocol.primaryMetric).toBe('retainedCandidateCount');
  });

  it('RO-Crate round trip daje MATCH', () => {
    const roundTrip = verifyEvidencePackRoCrateRoundTrip(buildDiscoveryEvidencePack(result));
    expect(roundTrip.status).toBe('MATCH');
    expect(roundTrip.missing).toEqual([]);
  });
});

describe('P/Q/R — replay MATCH / DRIFT / BLOCKED', () => {
  it('P — niezmieniony przebieg odtwarza się jako MATCH', () => {
    const saved = buildSavedDiscoveryRun(question, generation);
    const replay = replaySavedDiscoveryRun(saved);

    expect(replay.status).toBe('MATCH');
    expect(replay.result!.resultFingerprint).toBe(saved.resultFingerprint);
  });

  it('Q — zmieniony parametr wejściowy daje DRIFT', () => {
    const saved = buildSavedDiscoveryRun(question, generation);
    const tampered = { ...saved, generation: { ...saved.generation, seedFormulas: ['C6H6'] } };

    expect(replaySavedDiscoveryRun(tampered).status).toBe('DRIFT');
  });

  it('R — uszkodzony zapis jest BLOCKED, nigdy cichym MATCH', () => {
    expect(replaySavedDiscoveryRun(undefined).status).toBe('BLOCKED');
    expect(replaySavedDiscoveryRun({}).status).toBe('BLOCKED');
    expect(isSavedDiscoveryRun({ contractVersion: '1.0.0', resultFingerprint: 'x' })).toBe(false);
  });

  it('R — odtworzenie pod INNYM silnikiem chemicznym jest BLOCKED, nie MATCH', () => {
    const saved = buildSavedDiscoveryRun(question, generation);
    const otherEngine = structuralEngineFromRecords('other-engine@1', {}, 'TEST_FIXTURE');

    const replay = replaySavedDiscoveryRun(saved, otherEngine);
    expect(replay.status).toBe('BLOCKED');
    expect(replay.reason).toMatch(/different chemistry engine/);
  });
});

describe('S — następny eksperyment', () => {
  it('graf eksperymentu (ISTNIEJĄCY buildExperimentGraph) zawiera pytanie, hipotezę i dowód', () => {
    const kinds = buildDiscoveryExperimentGraph(result).nodes.map((n) => n.kind);
    expect(kinds).toContain('QUESTION');
    expect(kinds).toContain('HYPOTHESIS');
    expect(kinds).toContain('EVIDENCE');
  });

  it('whyNextExperiment przyjmuje ten łańcuch bez adaptacji', () => {
    const advice = explainDiscoveryEvidence(result);
    expect(advice.nextExperiment.autoRun).toBe(false);
  });

  it('kroki nazywają brakującą zdolność i nigdy nie udają wykonania eksperymentu', () => {
    const steps = proposeNextDiscoverySteps(result);

    expect(steps.some((s) => s.kind === 'REQUIRES_EXTERNAL_ENGINE' && s.resolves === 'logP')).toBe(true);
    expect(steps.some((s) => s.kind === 'REQUIRES_EXTERNAL_EXPERIMENT' && s.resolves === 'safety')).toBe(true);
    expect(steps.some((s) => s.resolves === 'targetAffinity')).toBe(true);
    // Nic, czego Genesis nie potrafi, nie jest oznaczone jako wykonywalne.
    expect(steps.filter((s) => s.kind === 'RUNNABLE_IN_GENESIS').every((s) => s.resolves === 'candidateSpace')).toBe(true);
  });
});

describe('T — pełny przebieg odkrywczy end-to-end', () => {
  it('pytanie → kandydaci → screening → decyzja → dowód → RO-Crate → replay → następny krok', () => {
    // 1. Realna enumeracja z realną chemią kompozycyjną.
    expect(result.batch.candidates.length).toBeGreaterThan(5);
    expect(result.batch.candidates.every((c) => c.properties.some((p) => p.propertyId === 'molecularWeight' && p.status === 'COMPUTED'))).toBe(true);

    // 2. Screening rozdziela realne porażki od braku danych.
    expect(result.decision.rejectedCount).toBeGreaterThan(0);
    expect(result.decision.notResolvedCount).toBeGreaterThan(0);

    // 3. Struktura i właściwości eksperymentalne pozostają jawnie niedostępne.
    expect(result.batch.candidates.every((c) => c.structure.status === 'REQUIRES_EXTERNAL_ENGINE')).toBe(true);
    const safety = result.batch.candidates[0]!.properties.find((p) => p.propertyId === 'safety')!;
    expect(safety.status).toBe('REQUIRES_EXPERIMENT');
    expect(safety.value).toBeNull();

    // 4. Dowód + RO-Crate + replay.
    expect(verifyEvidencePackRoCrateRoundTrip(buildDiscoveryEvidencePack(result)).status).toBe('MATCH');
    expect(replaySavedDiscoveryRun(buildSavedDiscoveryRun(question, generation)).status).toBe('MATCH');

    // 5. Następny krok jest konkretny i uczciwy co do wykonalności.
    expect(proposeNextDiscoverySteps(result).length).toBeGreaterThan(0);
  });

  it('nie mutuje wejściowego pytania ani specyfikacji', () => {
    const q = buildDemoDiscoveryQuestion();
    const g = buildDemoGenerationSpec();
    const snapshot = JSON.parse(JSON.stringify({ q, g }));
    runMolecularDiscovery(q, g);
    expect(JSON.parse(JSON.stringify({ q, g }))).toEqual(snapshot);
  });
});
