import { describe, expect, it } from 'vitest';
import { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import type { NewEvidenceInput } from '@genesis/core/knowledge/EvidenceLedger.js';
import { createScientificWorldsCognitiveCore } from '../core/scientificWorlds/cognitiveBridge';
import { inMemoryScienceMemoryPort, scienceMemoryPort } from '../core/scientificWorlds/scienceMemoryPort';
import { instrumentsFor, numericPairs, runCuriosityCycle } from '../core/scientificWorlds/curiosityCycle';
import { LAB_CATALOG, LAB_STATIONS, LAB_WORLD_ID } from '../core/scientificWorlds/labWorld';
import { parseWorldCommands } from '../core/scientificWorlds/worldCommand';
import { createLabExperimentRunner } from '../core/scientificWorlds/experimentRunners';
import { replayExperimentSession } from '../core/scientificWorlds/experimentSession';

const clock = { t: 1_700_000_000_000, now() { return (this.t += 1000); } };
const rec = (sourceUrl: string, claim: string, claimType: NewEvidenceInput['claimType'] = 'model'): NewEvidenceInput => ({ sourceUrl, sourceTimestamp: null, claim, claimType, confidence: 0.7, provenance: { sourceKind: 'document', retrievedBy: 'test', independentSourceIds: [] } });

function world(memory = inMemoryScienceMemoryPort()) {
  const ledger = new EvidenceLedger(clock);
  const runner = createLabExperimentRunner(LAB_WORLD_ID, ledger);
  const probeRunner = createLabExperimentRunner(LAB_WORLD_ID, new EvidenceLedger(clock));
  const binding = { worldId: LAB_WORLD_ID, catalog: LAB_CATALOG, stations: LAB_STATIONS, parse: (t: string, lt: number) => parseWorldCommands(t, LAB_CATALOG, lt), runner, ledger, memory };
  const bridge = createScientificWorldsCognitiveCore(binding);
  return { ledger, runner, probeRunner, binding, bridge, memory };
}

describe('autonomous curiosity cycle (D-130) — gap → question → … → belief revision → memory → next gap, on the existing stack', () => {
  it('a cross-host numeric contradiction on peakDay is resolved within the model by the epidemiology console; beliefs revised; memory written; the next run does not repeat the question', async () => {
    const w = world();
    // two hosts disagree on the peak day of the default SEIRD run; the console is an instrument that produces `peakDay`
    w.ledger.addRecord(rec('https://a.example.org/seir', 'SEIRD run peakDay=41 r0=2.5'));
    w.ledger.addRecord(rec('https://b.example.org/seir', 'SEIRD run peakDay=90 r0=2.5'));
    expect(w.bridge.memory).not.toBeNull();
    expect(instrumentsFor('peakDay', LAB_STATIONS, w.probeRunner, 7).map((s) => s.experimentId)).toEqual(['seir-epidemic']);
    expect(numericPairs('x=1 y=2.5 z=abc')).toEqual([{ key: 'x', value: 1 }, { key: 'y', value: 2.5 }]);
    const activeBefore = w.ledger.getActive().length;

    const blocked = await runCuriosityCycle({ bridge: w.bridge, binding: w.binding, probeRunner: w.probeRunner, approvedBy: null });
    expect(blocked.terminal).toBe('AWAITING_HUMAN_APPROVAL');
    expect(blocked.iterations[0].experiment?.experimentId).toBe('seir-epidemic');
    expect(blocked.iterations[0].session).toBeNull();
    expect(w.ledger.getActive().length).toBe(activeBefore); // nothing ran without approval
    expect(w.memory.records.length).toBe(1); // the blocked iteration is remembered too

    const w2 = world();
    w2.ledger.addRecord(rec('https://a.example.org/seir', 'SEIRD run peakDay=41 r0=2.5'));
    w2.ledger.addRecord(rec('https://b.example.org/seir', 'SEIRD run peakDay=90 r0=2.5'));
    const run = await runCuriosityCycle({ bridge: w2.bridge, binding: w2.binding, probeRunner: w2.probeRunner, approvedBy: 'dr-owner', maxIterations: 3 });
    const it = run.iterations[0];
    expect(it.question.kind).toBe('RESOLVE_CONTRADICTION'); expect(it.key).toBe('peakDay');
    expect(it.retrieved.map((r) => r.host).sort()).toEqual(['a.example.org', 'b.example.org']);
    expect(it.sourceSearch.mode).toBe('LEDGER_RETRIEVAL_ONLY');
    expect(it.hypotheses.map((h) => h.hypothesis.criterion.expectedValue)).toEqual([41, 90]);
    expect(it.discriminability?.discriminates).toBe(true);
    expect(it.terminal).toBe('RESOLVED_WITHIN_MODEL');
    expect(it.session?.experimentId).toBe('seir-epidemic'); expect(it.session?.epistemicStatus).toBe('SIMULATION');
    expect(typeof it.observed).toBe('number');
    const supported = it.hypotheses.filter((h) => h.assessment === 'SUPPORTED_WITHIN_PROTOCOL'); const falsified = it.hypotheses.filter((h) => h.assessment === 'FALSIFIED_WITHIN_PROTOCOL');
    expect(supported.length + falsified.length).toBe(2);
    for (const h of supported) expect(h.revised.confidence).toBeGreaterThan(h.hypothesis.confidence);
    for (const h of falsified) expect(h.revised.confidence).toBeLessThan(h.hypothesis.confidence);
    expect(w2.bridge.approvals.has(`curiosity:${it.question.questionId}:seir-epidemic`)).toBe(true);
    // evidence: the session is on the ledger and replays MATCH
    expect(w2.ledger.getActive().length).toBeGreaterThan(2);
    expect(replayExperimentSession(it.session!, w2.runner).status).toBe('MATCH');
    // memory: cognitive core observed it; Science Memory holds the typed record; the next pick is a different question (or none)
    expect(w2.bridge.core.memory.recentObservations().some((o) => o.subject === 'peakDay' && o.source === 'EXPERIMENT')).toBe(true);
    expect(w2.memory.records.find((r) => r.questionId === it.question.questionId)).toMatchObject({ terminal: 'RESOLVED_WITHIN_MODEL', experiment: { experimentId: 'seir-epidemic', sessionId: it.session!.sessionId } });
    expect(w2.memory.records.length).toBe(run.iterations.length);
    expect(run.iterations.every((x, i, arr) => arr.findIndex((y) => y.question.questionId === x.question.questionId) === i)).toBe(true);
    expect(run.iterations[0].fingerprint).toMatch(/^cyc-/);
  });
  it('a question without a numeric key, or a key no instrument produces, ends honestly and is still remembered', async () => {
    const w = world();
    w.ledger.addRecord(rec('https://a.example.org/x', 'the pump valve limits the flow rate in the pipe', 'reported_claim'));
    const r1 = await runCuriosityCycle({ bridge: w.bridge, binding: w.binding, probeRunner: w.probeRunner, approvedBy: 'dr-owner' });
    expect(r1.iterations[0].question.kind).toBe('INDEPENDENT_CONFIRMATION');
    expect(r1.terminal).toBe('NO_NUMERIC_KEY'); expect(r1.iterations[0].sourceSearch.ingestionRequest).toMatch(/independent source/);
    const w2 = world();
    w2.ledger.addRecord(rec('https://a.example.org/m', 'lattice model unobtainium=12.5'));
    w2.ledger.addRecord(rec('https://b.example.org/m', 'lattice model unobtainium=99'));
    const r2 = await runCuriosityCycle({ bridge: w2.bridge, binding: w2.binding, probeRunner: w2.probeRunner, approvedBy: 'dr-owner' });
    expect(r2.terminal).toBe('NO_INSTRUMENT_FOR_KEY'); expect(r2.iterations[0].session).toBeNull();
    expect(w2.memory.records[0].terminal).toBe('NO_INSTRUMENT_FOR_KEY');
    const empty = await runCuriosityCycle({ bridge: world().bridge, binding: world().binding, probeRunner: w.probeRunner, approvedBy: 'dr-owner' });
    expect(empty.terminal).toBe('NO_GAPS');
  });
  it('the production Science Memory port refuses untyped records', async () => {
    await expect(scienceMemoryPort().write({ anything: 1 })).rejects.toThrow(/SCIENCE_MEMORY_REJECTS_UNTYPED_RECORD/);
    await expect(inMemoryScienceMemoryPort().write('x')).rejects.toThrow(/SCIENCE_MEMORY_REJECTS_UNTYPED_RECORD/);
  });
});
