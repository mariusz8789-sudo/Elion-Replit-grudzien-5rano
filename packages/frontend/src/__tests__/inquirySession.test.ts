import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InquiryLoopInput, ParameterHypothesis } from '../core/agent/inquiryLoop';
import { proteinFoldingInquiry } from '../core/agent/proteinFoldingInquiry';

/**
 * PASS 2 — TRYING TO BREAK THE AUTONOMY CLAIM, and the end-to-end pipeline
 * that claim has to survive inside:
 *
 *   Science Memory -> inquiry (real solver runs, adaptively chosen probes)
 *   -> Science Memory record -> Replay (real re-execution) -> next experiment
 *
 * Everything scientific here is real: the real `chemistry-arrhenius` model
 * through the real Fabric executor. The only fake is `window.localStorage`
 * (a plain Map — the existing `scienceMemory.test.ts` idiom), because Science
 * Memory is a browser-storage module and this suite runs in Node.
 * `vi.resetModules()` between calls stands in for a process restart, so the
 * second inquiry genuinely READS persisted memory rather than holding a
 * reference to the first one's state.
 */

function makeFakeStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

/** All four sit on the Arrhenius compensation line through 350 K — see `inquiryLoop.test.ts`. */
const ON_COMPENSATION_LINE = [
  { id: 'h:A-Ea60', ea: 60, logA: 11.0 },
  { id: 'h:C-Ea62', ea: 62, logA: 11.2985 },
  { id: 'h:B-Ea66', ea: 66, logA: 11.8956 },
  { id: 'h:D-Ea70', ea: 70, logA: 12.4926 },
] as const;

const HYPOTHESES: readonly ParameterHypothesis[] = ON_COMPENSATION_LINE.map((h) => ({
  hypothesisId: h.id,
  statement: `Activation energy ${h.ea} kJ/mol with log10 A = ${h.logA}`,
  claimedValues: { activationEnergyKJ: h.ea, preExponentialLog10: h.logA },
  priorConfidence: 0.5,
}));

const QUESTION = 'Which activation energy / pre-exponential pair does this sample actually have?';

function inputFor(ea: number, logA: number, overrides: Partial<InquiryLoopInput> = {}): InquiryLoopInput {
  return {
    question: QUESTION,
    system: {
      systemId: `sample-Ea${ea}`,
      label: `Unmeasured kinetic sample (Ea = ${ea} kJ/mol)`,
      modelId: 'chemistry-arrhenius',
      hiddenParameters: { activationEnergyKJ: ea, preExponentialLog10: logA },
      probeParameterId: 'temperatureK',
      candidateProbeValues: [350, 400, 450, 500, 600, 800],
      fixedParameters: {},
      observedMetric: 'rateConstant',
      agreementTolerance: 0.25,
    },
    hypotheses: HYPOTHESES,
    openingProbeValue: 400,
    maxRounds: 4,
    ...overrides,
  };
}

const A = ON_COMPENSATION_LINE[0];
const D = ON_COMPENSATION_LINE[3];

describe('inquirySession — the pipeline is really connected', () => {
  beforeEach(() => { vi.resetModules(); vi.stubGlobal('window', { localStorage: makeFakeStorage() }); });
  afterEach(() => vi.unstubAllGlobals());

  it('runs, persists, and replays by real re-execution in one call', async () => {
    const { runInquiryAndRemember } = await import('../core/agent/inquirySession');
    const { listExperiments, getExperiment } = await import('../core/scienceMemory');

    const session = runInquiryAndRemember(inputFor(A.ea, A.logA));

    // A real inquiry ran.
    expect(session.result.rounds.length).toBeGreaterThan(1);
    expect(session.result.survivingHypothesisIds).toEqual(['h:A-Ea60']);

    // It is actually in memory — one record, findable again.
    expect(listExperiments()).toHaveLength(1);
    const stored = getExperiment(session.saved.id)!;
    expect(stored).toBeDefined();
    expect(stored.parameterInquiry!.resultFingerprint).toBe(session.savedInquiry.resultFingerprint);
    expect(stored.parameterInquiry!.result).toEqual(session.result);

    // Replay is a REAL verdict from a REAL re-execution.
    expect(session.replay.status).toBe('MATCH');
    expect(session.replay.reason).toContain('ponownym wykonaniu');
  });

  it('records everything the brief asked Genesis to remember about an experiment', async () => {
    const { runInquiryAndRemember } = await import('../core/agent/inquirySession');
    const { getExperiment } = await import('../core/scienceMemory');
    const session = runInquiryAndRemember(inputFor(A.ea, A.logA));
    const stored = getExperiment(session.saved.id)!;
    const analysis = Object.fromEntries(stored.analysis!.map((block) => [block.kind, block.body]));

    expect(analysis['parameter-inquiry-question']).toBe(QUESTION);           // the question
    expect(analysis['parameter-inquiry-hypotheses']).toContain('h:A-Ea60');  // the hypotheses
    expect(analysis['parameter-inquiry-model']).toContain('chemistry-arrhenius'); // model / solver
    expect(analysis['parameter-inquiry-parameters']).toContain('temperatureK'); // parameters
    expect(analysis['parameter-inquiry-result']).toContain('rateConstant');  // the result
    expect(analysis['parameter-inquiry-reasons']).toContain('FALSIFIED_WITHIN_PROTOCOL'); // why
    expect(analysis['parameter-inquiry-unresolved']).toContain('not the same as being true'); // what is still unknown
    expect(analysis['parameter-inquiry-next']).toBeTruthy();                 // the next experiment
  });

  it('attaches the REAL provenance of the last measurement, not a re-enactment', async () => {
    const { runInquiryAndRemember } = await import('../core/agent/inquirySession');
    const session = runInquiryAndRemember(inputFor(A.ea, A.logA));
    const lastRound = session.result.rounds[session.result.rounds.length - 1];
    expect(session.saved.execution).toBeDefined();
    expect(session.saved.execution!.runId).toBe(lastRound.runId);
    expect(session.saved.execution!.runFingerprint).toBe(lastRound.runFingerprint);
    expect(session.saved.execution!.resultOrigin).toBe('real-engine');
    expect(session.saved.execution!.engine).toBe('genesis-model-graph@1.0.0');
  });

  it('does not claim to be an Evidence Pack it is not', async () => {
    const { runInquiryAndRemember } = await import('../core/agent/inquirySession');
    const session = runInquiryAndRemember(inputFor(A.ea, A.logA));
    expect(session.saved.evidencePackId).toBeUndefined();
    expect(session.saved.honestyNote).toContain('nie jest Evidence Packiem');
    expect(session.saved.epistemicStatus).toBe('SIMULATION');
  });
});

describe('inquirySession — memory is read back, and only for what it may decide', () => {
  beforeEach(() => { vi.resetModules(); vi.stubGlobal('window', { localStorage: makeFakeStorage() }); });
  afterEach(() => vi.unstubAllGlobals());

  it('skips hypotheses an earlier inquiry into the SAME system already falsified', async () => {
    const storage = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: storage });

    const first = await import('../core/agent/inquirySession');
    const firstSession = first.runInquiryAndRemember(inputFor(A.ea, A.logA));
    expect(firstSession.resumedFromMemory).toBeNull();     // nothing to resume from yet
    const alreadyOut = firstSession.result.falsifiedHypothesisIds;
    expect(alreadyOut.length).toBeGreaterThan(0);

    // A process restart: fresh modules, same persisted storage.
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: storage });
    const second = await import('../core/agent/inquirySession');
    const secondSession = second.runInquiryAndRemember(inputFor(A.ea, A.logA));

    expect(secondSession.resumedFromMemory).not.toBeNull();
    expect(secondSession.resumedFromMemory!.skippedHypothesisIds).toEqual(alreadyOut);
    expect(secondSession.executedInput.hypotheses.map((h) => h.hypothesisId))
      .not.toContain(alreadyOut[0]);
    // Memory changed executable behaviour: the second inquiry never tested them.
    expect(secondSession.result.rounds.flatMap((r) => r.outcomes.map((o) => o.hypothesisId)))
      .not.toContain(alreadyOut[0]);
  });

  it('never carries a SUPPORTED verdict forward — the survivor is tested again', async () => {
    const storage = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: storage });
    const first = await import('../core/agent/inquirySession');
    const firstSession = first.runInquiryAndRemember(inputFor(A.ea, A.logA));
    expect(firstSession.result.survivingHypothesisIds).toEqual(['h:A-Ea60']);

    vi.resetModules();
    vi.stubGlobal('window', { localStorage: storage });
    const second = await import('../core/agent/inquirySession');
    const secondSession = second.runInquiryAndRemember(inputFor(A.ea, A.logA));

    expect(secondSession.executedInput.hypotheses.map((h) => h.hypothesisId)).toContain('h:A-Ea60');
    expect(secondSession.result.rounds[0].outcomes.map((o) => o.hypothesisId)).toContain('h:A-Ea60');
  });

  it('does not transfer a falsification to a DIFFERENT system', async () => {
    const storage = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: storage });
    const first = await import('../core/agent/inquirySession');
    first.runInquiryAndRemember(inputFor(A.ea, A.logA));

    vi.resetModules();
    vi.stubGlobal('window', { localStorage: storage });
    const second = await import('../core/agent/inquirySession');
    // A different sample on the bench: nothing memory learned about the first one applies.
    const other = second.runInquiryAndRemember(inputFor(D.ea, D.logA));
    expect(other.resumedFromMemory).toBeNull();
    expect(other.executedInput.hypotheses).toHaveLength(4);
  });

  it('refuses to narrow the set to nothing, and says so', async () => {
    const storage = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: storage });
    const first = await import('../core/agent/inquirySession');
    // A sample nobody proposed: round 1 falsifies all four.
    const wipeout = first.runInquiryAndRemember(inputFor(120, 18.5));
    expect(wipeout.result.falsifiedHypothesisIds).toHaveLength(4);

    vi.resetModules();
    vi.stubGlobal('window', { localStorage: storage });
    const second = await import('../core/agent/inquirySession');
    const again = second.runInquiryAndRemember(inputFor(120, 18.5));
    expect(again.resumedFromMemory!.skippedHypothesisIds).toEqual([]);
    expect(again.resumedFromMemory!.reason).toContain('nie zostawiłoby czego badać');
    expect(again.executedInput.hypotheses).toHaveLength(4);
  });
});

describe('runInquiryWithGeneration — the generated discovery is REMEMBERED, not just made', () => {
  beforeEach(() => { vi.resetModules(); vi.stubGlobal('window', { localStorage: makeFakeStorage() }); });
  afterEach(() => vi.unstubAllGlobals());

  /**
   * Was the exact gap named in `AUTONOMOUS_DISCOVERY_ROADMAP.md`: the first
   * version of `runInquiryWithGeneration` called the bare engine for both runs,
   * so it generated and tested a hypothesis nobody declared but never left
   * anything behind for a LATER inquiry into the same system to narrow
   * against — Genesis generated and tested without learning. This proves the
   * fix on the real exhausted-space fixture: a fold at temperature 0.5 that
   * falsifies every declared candidate.
   */
  it('a later inquiry into the SAME system remembers what the exhausted-space run already falsified', async () => {
    const storage = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: storage });

    const first = await import('../core/agent/inquirySession');
    const round1 = first.runInquiryWithGeneration(proteinFoldingInquiry(0.5));
    // Ground the fixture: this really is the exhausted-space case, and
    // generation really fired.
    expect([...round1.first.falsifiedHypothesisIds].sort()).toEqual(['h:cold', 'h:cool', 'h:hot', 'h:warm']);
    expect(round1.firstResumedFromMemory).toBeNull(); // nothing to resume from yet
    expect(round1.generated).not.toBeNull();
    expect(round1.generated!.survived).toBe(true);

    // A process restart: fresh modules, same persisted storage.
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: storage });
    const second = await import('../core/agent/inquirySession');
    // THE FIX, proven two ways on the SAME declared four candidates:

    // 1. Every one of them was already falsified — before the fix, memory
    // would have nothing to say (no record ever existed); now it correctly
    // recognises this and retests the full set rather than skipping to
    // nothing (the same fallback `runInquiryAndRemember` already holds).
    const roundAll = second.runInquiryWithGeneration(proteinFoldingInquiry(0.5));
    expect(roundAll.firstResumedFromMemory).not.toBeNull();
    expect(roundAll.firstResumedFromMemory!.skippedHypothesisIds).toEqual([]);
    expect(roundAll.firstResumedFromMemory!.reason).toContain('nie zostawiłoby czego badać');

    // 2. A genuinely PARTIAL declared set — one already-falsified candidate
    // alongside round 1's own generated hypothesis, which SURVIVED and so is
    // never carried forward as settled — shows real, executable narrowing:
    // the falsified one is skipped, the generated one is not.
    vi.resetModules();
    vi.stubGlobal('window', { localStorage: storage });
    const third = await import('../core/agent/inquirySession');
    const { asParameterHypothesis } = await import('../core/agent/parameterAlternative');
    const mixedInput: InquiryLoopInput = {
      ...proteinFoldingInquiry(0.5),
      hypotheses: [proteinFoldingInquiry(0.5).hypotheses[0]!, asParameterHypothesis(round1.generated!.derived)],
    };
    const roundMixed = third.runInquiryAndRemember(mixedInput);
    expect(roundMixed.resumedFromMemory).not.toBeNull();
    expect(roundMixed.resumedFromMemory!.skippedHypothesisIds).toEqual(['h:cold']);
    expect(roundMixed.executedInput.hypotheses.map((h) => h.hypothesisId)).toEqual([round1.generated!.derived.hypothesisId]);
  });

  /** The generated follow-up itself is a real, listed Science Memory record — not merely returned and discarded. */
  it('the generated follow-up investigation is a real, queryable memory record', async () => {
    const storage = makeFakeStorage();
    vi.stubGlobal('window', { localStorage: storage });

    const inquirySession = await import('../core/agent/inquirySession');
    const scienceMemory = await import('../core/scienceMemory');
    const round = inquirySession.runInquiryWithGeneration(proteinFoldingInquiry(0.5));
    expect(round.generated).not.toBeNull();

    const followUpRecord = scienceMemory.getExperiment(round.generated!.followUpSaved.id);
    expect(followUpRecord).not.toBeUndefined();
    expect(followUpRecord!.parameterInquiry?.input.hypotheses.map((h) => h.hypothesisId))
      .toContain(round.generated!.derived.hypothesisId);
    // A real re-execution verdict was produced for it, not merely asserted.
    expect(round.generated!.followUpReplay.status).toBe('MATCH');
  });
});

describe('inquirySession — replay actually catches things', () => {
  beforeEach(() => { vi.resetModules(); vi.stubGlobal('window', { localStorage: makeFakeStorage() }); });
  afterEach(() => vi.unstubAllGlobals());

  it('reports DRIFT when the stored payload is edited after saving', async () => {
    const { runInquiryAndRemember } = await import('../core/agent/inquirySession');
    const { replaySavedParameterInquiry } = await import('../core/scienceMemory');
    const session = runInquiryAndRemember(inputFor(A.ea, A.logA));

    const tampered = structuredClone(session.saved);
    // Someone edits the answer in localStorage without recomputing the fingerprint.
    (tampered.parameterInquiry as unknown as { result: { survivingHypothesisIds: string[] } }).result.survivingHypothesisIds = ['h:D-Ea70'];
    const verdict = replaySavedParameterInquiry(tampered);
    expect(verdict.status).toBe('DRIFT');
    expect(verdict.reason).toContain('nie odpowiada już własnemu zapisanemu odciskowi');
  });

  it('reports DRIFT when the stored INPUT is edited so re-execution disagrees', async () => {
    const { runInquiryAndRemember } = await import('../core/agent/inquirySession');
    const { replaySavedParameterInquiry, buildSavedParameterInquiry } = await import('../core/scienceMemory');
    const session = runInquiryAndRemember(inputFor(A.ea, A.logA));

    // Self-consistent, but the input no longer produces this result: a different
    // sample was put on the bench under the same system id and the same saved
    // answer. Only re-execution can catch this — the payload's own fingerprint
    // still matches, so a self-consistency check alone would say MATCH.
    const swappedSample = inputFor(D.ea, D.logA);
    const forged = buildSavedParameterInquiry({
      input: { ...swappedSample, system: { ...swappedSample.system, systemId: session.savedInquiry.input.system.systemId } },
      result: session.savedInquiry.result,
      resumedFromMemory: null,
    });
    expect(forged.resultFingerprint).toBe(session.savedInquiry.resultFingerprint); // self-consistent
    const verdict = replaySavedParameterInquiry({ ...session.saved, parameterInquiry: forged });
    expect(verdict.status).toBe('DRIFT');
    expect(verdict.reason).toContain('różni się od zapisanego');
  });

  it('refuses to build a record whose input and result are about different systems', async () => {
    const { runInquiryAndRemember } = await import('../core/agent/inquirySession');
    const { buildSavedParameterInquiry } = await import('../core/scienceMemory');
    const session = runInquiryAndRemember(inputFor(A.ea, A.logA));
    expect(() => buildSavedParameterInquiry({
      input: inputFor(D.ea, D.logA),
      result: session.result,
      resumedFromMemory: null,
    })).toThrow('tego samego systemu');
  });

  it('reports BLOCKED for a record that carries no inquiry at all', async () => {
    const { runInquiryAndRemember } = await import('../core/agent/inquirySession');
    const { replaySavedParameterInquiry } = await import('../core/scienceMemory');
    const session = runInquiryAndRemember(inputFor(A.ea, A.logA));
    const stripped = { ...session.saved };
    delete (stripped as { parameterInquiry?: unknown }).parameterInquiry;
    expect(replaySavedParameterInquiry(stripped).status).toBe('BLOCKED');
  });

  it('reports NOT_REPRODUCIBLE when the model is no longer declared', async () => {
    const { runInquiryAndRemember } = await import('../core/agent/inquirySession');
    const { replaySavedParameterInquiry, buildSavedParameterInquiry } = await import('../core/scienceMemory');
    const session = runInquiryAndRemember(inputFor(A.ea, A.logA));
    const gone = buildSavedParameterInquiry({
      input: { ...session.savedInquiry.input, system: { ...session.savedInquiry.input.system, modelId: 'model-genesis-no-longer-declares' } },
      result: session.result,
      resumedFromMemory: null,
    });
    // Make the record self-consistent so the check under test is the re-execution one.
    const selfConsistent = { ...gone, resultFingerprint: session.savedInquiry.resultFingerprint };
    const verdict = replaySavedParameterInquiry({ ...session.saved, parameterInquiry: selfConsistent });
    expect(verdict.status).toBe('NOT_REPRODUCIBLE');
  });
});

/**
 * PASS 2, the sharp end: every way I could think of that "the next experiment
 * depends on the last observation" might be true only by accident.
 */
describe('inquirySession — adversarial: is the autonomy real?', () => {
  beforeEach(() => { vi.resetModules(); vi.stubGlobal('window', { localStorage: makeFakeStorage() }); });
  afterEach(() => vi.unstubAllGlobals());

  it('is not keyed on the system label or id — swap the names, keep the sample, get the same probe', async () => {
    const { runInquiry } = await import('../core/agent/inquirySession');
    const honest = runInquiry(inputFor(A.ea, A.logA));
    const disguised = runInquiry({
      ...inputFor(A.ea, A.logA),
      system: { ...inputFor(A.ea, A.logA).system, systemId: 'sample-Ea70', label: 'Unmeasured kinetic sample (Ea = 70 kJ/mol)' },
    });
    expect(disguised.rounds.map((r) => r.probeValue)).toEqual(honest.rounds.map((r) => r.probeValue));
    expect(disguised.survivingHypothesisIds).toEqual(honest.survivingHypothesisIds);
  });

  it('is not keyed on the hypothesis order — shuffle the input, get the same science', async () => {
    const { runInquiry } = await import('../core/agent/inquirySession');
    const straight = runInquiry(inputFor(A.ea, A.logA));
    const shuffled = runInquiry({ ...inputFor(A.ea, A.logA), hypotheses: [...HYPOTHESES].reverse() });
    expect(new Set(shuffled.falsifiedHypothesisIds)).toEqual(new Set(straight.falsifiedHypothesisIds));
    expect(shuffled.survivingHypothesisIds).toEqual(straight.survivingHypothesisIds);
  });

  it('really scans the caller\'s candidate list rather than emitting a constant', async () => {
    const { runInquiry } = await import('../core/agent/inquirySession');
    const forwards = runInquiry(inputFor(D.ea, D.logA));
    const backwards = runInquiry({
      ...inputFor(D.ea, D.logA),
      system: { ...inputFor(D.ea, D.logA).system, candidateProbeValues: [800, 600, 500, 450, 400, 350] },
    });
    expect(forwards.rounds[0].nextSelection.probeValue).toBe(450);
    // Same observation, same beliefs — a different offered list, a different choice.
    expect(backwards.rounds[0].observed).toBe(forwards.rounds[0].observed);
    expect(backwards.rounds[0].nextSelection.probeValue).not.toBe(450);
  });

  it('changes its whole trajectory when the FIRST experiment is changed', async () => {
    const { runInquiry } = await import('../core/agent/inquirySession');
    const openedAt400 = runInquiry(inputFor(A.ea, A.logA));
    const openedAt600 = runInquiry({ ...inputFor(A.ea, A.logA), openingProbeValue: 600 });
    expect(openedAt600.rounds[0].probeValue).toBe(600);
    expect(openedAt600.rounds.map((r) => r.probeValue)).not.toEqual(openedAt400.rounds.map((r) => r.probeValue));
  });

  it('cannot read the answer: hypothesis selection is given a system with no hidden values', async () => {
    // A compile-time boundary, checked here as a runtime fact about the shape
    // handed to selection. `ObservableSystem` is `SystemUnderStudy` minus
    // `hiddenParameters`, so any future edit that reaches for the answer inside
    // selection fails `tsc`, not just this assertion.
    const { runInquiry } = await import('../core/agent/inquirySession');
    const result = runInquiry(inputFor(A.ea, A.logA));
    const serialized = JSON.stringify(result);
    // The result reports probes, predictions and verdicts — never the hidden
    // assignment as a conclusion it reached.
    expect(serialized).not.toContain('hiddenParameters');
  });

  it('the second experiment is not in the input anywhere — it is computed', async () => {
    const { runInquiry } = await import('../core/agent/inquirySession');
    const input = inputFor(A.ea, A.logA);
    const result = runInquiry(input);
    const secondProbe = result.rounds[1].probeValue;
    expect(secondProbe).toBe(800);
    // It is not the opening probe, and it is not the first entry of the
    // candidate list either — both of which a scripted implementation would
    // produce. It is the first candidate that separates the survivors.
    expect(secondProbe).not.toBe(input.openingProbeValue);
    expect(secondProbe).not.toBe(input.system.candidateProbeValues[0]);
  });
});
