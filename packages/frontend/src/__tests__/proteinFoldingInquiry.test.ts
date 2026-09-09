import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAutonomousInquiry } from '../core/agent/inquiryLoop';
import { runDiscovery } from '../core/agent/discoveryOrchestrator';
import { parameterStrategy } from '../core/agent/discoveryStrategies';
import { getRouterModel } from '../core/experimentFabric/router';
import {
  proteinFoldingInquiry,
  proteinFoldingSystem,
  PROTEIN_FOLDING_CANDIDATES,
  PROTEIN_FOLDING_MODEL_ID,
  PROTEIN_FOLDING_NOT_MODELLED,
  PROTEIN_FOLDING_OPENING_STEPS,
} from '../core/agent/proteinFoldingInquiry';

/**
 * MOLECULAR SCALE — the first PARAMETER inquiry at true molecular scale
 * (a folding polymer, not an atom or a population), on a router model that
 * was already registered and already real: `biology-protein-folding-hp`.
 *
 * Every number below was measured from the real seeded Metropolis solver
 * before being written down. See `proteinFoldingInquiry.ts`'s module doc for
 * why the five originally-suggested candidates (pyscf-h2, rdkit-descriptors,
 * openmm-md, hiv-pdb-comparison, depmap-crispr) do not have this shape at
 * all — none has two independent numeric axes, which `SystemUnderStudy`
 * structurally requires.
 */

const [COLD, COOL, WARM, HOT] = PROTEIN_FOLDING_CANDIDATES;
const cache = new Map<string, ReturnType<typeof runAutonomousInquiry>>();
/** Memoised per candidate: the same question is asked of the same real solver repeatedly in this file. */
function run(c: (typeof PROTEIN_FOLDING_CANDIDATES)[number]) {
  const cached = cache.get(c.id);
  if (cached) return cached;
  const fresh = runAutonomousInquiry(proteinFoldingInquiry(c.temperature));
  cache.set(c.id, fresh);
  return fresh;
}

describe('protein-folding inquiry — the substrate is real', () => {
  it('runs on a Fabric model that exists, not a stub defined here', () => {
    const model = getRouterModel(PROTEIN_FOLDING_MODEL_ID);
    expect(model).toBeDefined();
    expect(model?.domainId).toBe('biology');
    expect(model?.engine).toBe('genesis-hp-metropolis@1.0.0');
    const result = run(COLD);
    expect(result.domainId).toBe('biology');
    for (const round of result.rounds) {
      expect(round.runId).toBeTruthy();
      expect(round.runFingerprint).toBeTruthy();
      expect(round.observed).not.toBeNull();
    }
  });

  it('is deterministic: the same fold twice gives the same probes and beliefs', () => {
    // Deliberately NOT through the memoising `run` helper — two independent executions.
    const a = runAutonomousInquiry(proteinFoldingInquiry(WARM.temperature));
    const b = runAutonomousInquiry(proteinFoldingInquiry(WARM.temperature));
    expect(b.rounds.map((r) => r.probeValue)).toEqual(a.rounds.map((r) => r.probeValue));
    expect(b.finalBeliefs).toEqual(a.finalBeliefs);
  });

  it('has no external runtime dependency — a real seeded PRNG in-process, unlike the rejected candidates', () => {
    // pyscf/rdkit/openmm/biopython all require a configured external Python
    // runtime (see router.ts's own rationale strings); this model does not,
    // which the successful run above already demonstrates, and which is why
    // it can be exercised in this suite without any environment setup at all.
    const model = getRouterModel(PROTEIN_FOLDING_MODEL_ID)!;
    expect(model.capability).toBeUndefined(); // undefined = default real engine, not BACKEND_REAL_ENGINE
  });
});

describe('protein-folding inquiry — the opening measurement is genuinely uninformative', () => {
  it('reads back the exact same acceptance rate regardless of the true temperature', () => {
    for (const c of PROTEIN_FOLDING_CANDIDATES) {
      const first = run(c).rounds[0]!;
      expect(first.probeValue).toBe(PROTEIN_FOLDING_OPENING_STEPS);
      expect(first.observed).toBeCloseTo(0.13, 6);
      // A real algorithmic floor, not "close": nothing is falsified either.
      expect(first.beliefsAfter.filter((b) => b.status === 'FALSIFIED_WITHIN_PROTOCOL')).toHaveLength(0);
    }
  });
});

/**
 * PROOF OF AUTONOMY. Identical question, identical four hypotheses, identical
 * priors, identical candidate step list, identical opening measurement of 200
 * steps. The ONLY difference between these four runs is which fold is
 * actually on the bench. What happens next differs in real, measurable ways:
 * which hypotheses get ruled out, how many further measurements are needed,
 * and whether the inquiry can resolve at all.
 */
describe('protein-folding inquiry — PROOF OF AUTONOMY: the observation decides what happens next', () => {
  it('starts every inquiry from a genuinely identical state', () => {
    const results = PROTEIN_FOLDING_CANDIDATES.map(run);
    for (const result of results) {
      expect(result.rounds[0]!.probeValue).toBe(PROTEIN_FOLDING_OPENING_STEPS);
      expect(result.rounds[0]!.selection.rule).toBe('OPENING_PROBE_DECLARED');
    }
    // Every hypothesis's own prediction at the opening measurement is identical
    // across all four runs — the hypotheses are the same, so what they expect
    // at 200 steps is the same. Only the real measurement differs.
    const predictions = results.map((r) => r.rounds[0]!.outcomes.map((o) => o.predicted));
    expect(predictions[1]).toEqual(predictions[0]);
    expect(predictions[2]).toEqual(predictions[0]);
    expect(predictions[3]).toEqual(predictions[0]);
  });

  it('takes a genuinely different second measurement for the cool fold than for the cold one', () => {
    // Both need a real round 2 at 5000 steps — but from there their paths
    // split: cold resolves immediately, cool needs a THIRD measurement.
    expect(run(COLD).rounds[1]?.probeValue).toBe(5000);
    expect(run(COOL).rounds[1]?.probeValue).toBe(5000);
    expect(run(COLD).rounds).toHaveLength(2);
    expect(run(COOL).rounds).toHaveLength(3);
    expect(run(COOL).rounds[2]?.probeValue).toBe(20000);
    // Real, different runs — not the same measurement read twice.
    expect(run(COLD).rounds[1]!.runFingerprint).not.toBe(run(COOL).rounds[1]!.runFingerprint);
  });

  it('rules out a different set of hypotheses depending on which fold is real', () => {
    expect([...run(COLD).falsifiedHypothesisIds].sort()).toEqual(['h:cool', 'h:hot', 'h:warm']);
    expect([...run(COOL).falsifiedHypothesisIds].sort()).toEqual(['h:cold', 'h:hot', 'h:warm']);
    // Warm's own measurements rule out cold and cool, but never separate warm
    // from hot — a genuinely different, weaker result than cold's or cool's own
    // measurement produced. `h:cool` is ruled out by the information-gain
    // widening in `selectNextProbe`: no setting separates the top two
    // (warm/hot), so it runs the one that separates a lower-ranked pair
    // instead. See that function's doc for the measured numbers.
    expect([...run(WARM).falsifiedHypothesisIds].sort()).toEqual(['h:cold', 'h:cool']);
    expect([...run(HOT).falsifiedHypothesisIds].sort()).toEqual(['h:cold', 'h:cool']);
  });

  it('converges on the fold that is actually on the bench, when the temperatures are far enough apart', () => {
    expect(run(COLD).survivingHypothesisIds).toEqual(['h:cold']);
    expect(run(COLD).stopReason).toBe('NO_CONTENDERS_LEFT');
    expect(run(COOL).survivingHypothesisIds).toEqual(['h:cool']);
    expect(run(COOL).stopReason).toBe('NO_CONTENDERS_LEFT');
  });
});

/**
 * HONESTY: warm (1.2) and hot (2.0) sit in a real, measured saturating region
 * of the Metropolis acceptance rate — the gap between them stayed small
 * (0.01-0.06) across every one of six seeds checked while building this file
 * (see the module doc), a genuine physical limit of this observable at higher
 * temperature, not noise from the one seed this inquiry pins. The loop is
 * required to say so rather than pick a winner it cannot support.
 */
describe('protein-folding inquiry — honesty when the candidates genuinely will not separate', () => {
  it('refuses to resolve warm from hot rather than guessing', () => {
    const warm = run(WARM);
    expect(warm.stopReason).toBe('NO_DISCRIMINATING_PROBE');
    expect(warm.nextExperiment.probeValue).toBeNull();
    // The tie it refuses to break is warm-vs-hot, and ONLY that: `h:cool` was
    // ruled out first by the information-gain widening (round 3 at 20000
    // steps), so what is left standing is the pair the physics genuinely
    // cannot separate — not a field the selection simply never got around to
    // narrowing.
    expect([...warm.survivingHypothesisIds].sort()).toEqual(['h:hot', 'h:warm']);

    const hot = run(HOT);
    expect(hot.stopReason).toBe('NO_DISCRIMINATING_PROBE');
    expect([...hot.survivingHypothesisIds].sort()).toEqual(['h:hot', 'h:warm']);
  });

  it('INFORMATION GAIN: runs the experiment that narrows the field when none settles the top two', () => {
    const warm = run(WARM);
    // Round 3 exists at all only because of the widening: rounds 1-2 leave
    // warm/hot tied at every remaining step count, and the old selection
    // stopped there with all three still standing.
    expect(warm.rounds).toHaveLength(3);
    const third = warm.rounds[2]!;
    expect(third.probeValue).toBe(20000);
    expect(third.selection.rule).toBe('DISCRIMINATES_OTHER_PAIR');
    // It says plainly which pair it separates — and that it is NOT the top two.
    expect(third.selection.betweenHypothesisIds).toContain('h:cool');
    expect(third.selection.why).toContain('does not settle the strongest disagreement');
    // And the round actually decided something: cool goes from standing to ruled out.
    expect(warm.rounds[1]!.beliefsAfter.find((b) => b.hypothesisId === 'h:cool')!.status).not.toBe('FALSIFIED_WITHIN_PROTOCOL');
    expect(third.beliefsAfter.find((b) => b.hypothesisId === 'h:cool')!.status).toBe('FALSIFIED_WITHIN_PROTOCOL');
  });

  it('says every candidate was wrong rather than crowning a least-wrong one', () => {
    // A fold nobody proposed: sits between cold and cool, far enough from both
    // to falsify every declared candidate — MEASURED, not assumed: 1.6 and
    // above land back in the saturating region and honestly tie warm/hot
    // instead, which is a different (and equally real) honest outcome.
    const unproposed = runAutonomousInquiry(proteinFoldingInquiry(0.5));
    expect(unproposed.survivingHypothesisIds).toHaveLength(0);
    expect(unproposed.falsifiedHypothesisIds.length).toBeGreaterThan(0);
    expect(unproposed.openQuestions.join(' ')).toContain('not among the values anyone proposed');
  });

  it('states the model boundary rather than implying a claim about a real protein', () => {
    const limitations = run(COLD).limitations.join(' ');
    expect(limitations).toContain(PROTEIN_FOLDING_MODEL_ID);
    expect(limitations).toContain('which is not the same as being true of any real substance');
    expect(PROTEIN_FOLDING_NOT_MODELLED.join(' ')).toContain('NP-hard');
    expect(PROTEIN_FOLDING_NOT_MODELLED.join(' ')).toContain('No real experimental measurement');
  });

  it('never repeats a measurement it has already taken', () => {
    for (const c of PROTEIN_FOLDING_CANDIDATES) {
      const probes = run(c).rounds.map((r) => r.probeValue);
      expect(new Set(probes).size).toBe(probes.length);
    }
  });
});

describe('protein-folding inquiry — routed through the SAME orchestrator, untouched', () => {
  it('runDiscovery({shape: "PARAMETER"}) produces exactly what calling the strategy directly produces', () => {
    const input = proteinFoldingInquiry(COOL.temperature);
    const direct = parameterStrategy.run(input);
    const outcome = runDiscovery({ shape: 'PARAMETER', input });
    expect(outcome.status).toBe('RAN');
    if (outcome.status !== 'RAN') return;
    expect(outcome.run).toEqual(direct);
    expect(outcome.admission.status).toBe('REAL');
    expect(outcome.shape).toBe('PARAMETER');
  });

  it('carries the real router rationale as the admission caveat, not a paraphrase', () => {
    const outcome = runDiscovery({ shape: 'PARAMETER', input: proteinFoldingInquiry(COLD.temperature) });
    expect(outcome.status).toBe('RAN');
    if (outcome.status !== 'RAN') return;
    expect(outcome.admission.caveat).toBe(getRouterModel(PROTEIN_FOLDING_MODEL_ID)!.rationale);
  });
});

describe('protein-folding inquiry — goes through the existing memory/replay pipeline, no new plumbing', () => {
  beforeEach(() => {
    vi.resetModules();
    const values = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => values.get(k) ?? null,
        setItem: (k: string, v: string) => void values.set(k, v),
        removeItem: (k: string) => void values.delete(k),
        key: (i: number) => [...values.keys()][i] ?? null,
        get length() { return values.size; },
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('runs, persists and replays by real re-execution', async () => {
    const { runInquiryAndRemember } = await import('../core/agent/inquirySession');
    const { proteinFoldingInquiry: build } = await import('../core/agent/proteinFoldingInquiry');
    const { listExperiments } = await import('../core/scienceMemory');

    const session = runInquiryAndRemember(build(COLD.temperature));
    expect(session.result.survivingHypothesisIds).toEqual(['h:cold']);
    expect(listExperiments()).toHaveLength(1);
    expect(session.saved.labId).toBe('biology');
    expect(session.replay.status).toBe('MATCH');
  });
});

describe('proteinFoldingSystem — the hidden temperature never leaks into the reported result', () => {
  it('never appears as a key in the serialized result', () => {
    const result = runAutonomousInquiry(proteinFoldingInquiry(COOL.temperature));
    expect(JSON.stringify(result)).not.toContain('hiddenParameters');
  });

  it('builds a system with the declared model id and probe axis', () => {
    const system = proteinFoldingSystem(1.0, 'test-system');
    expect(system.systemId).toBe('test-system');
    expect(system.modelId).toBe(PROTEIN_FOLDING_MODEL_ID);
    expect(system.probeParameterId).toBe('steps');
    expect(system.observedMetric).toBe('acceptanceRate');
  });
});
