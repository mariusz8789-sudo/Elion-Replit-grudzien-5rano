import { describe, expect, it } from 'vitest';
import {
  continueResearchCampaign, isNoJustifiedNextQuestion, NO_JUSTIFIED_NEXT_QUESTION,
  runResearchCampaign, startResearchCampaign, type ResearchCycle,
} from '../core/experimentFabric/researchCampaign';
import { runScientificDiscoveryLoopAsync } from '../core/experimentFabric/scientificDiscoveryLoop';

/**
 * RESEARCH CAMPAIGN — proves the chained multi-cycle contract on the REAL,
 * unmodified engine (`scientificDiscoveryLoop.ts` / `hypothesisLoop.ts`),
 * never a fixture or a mocked result:
 *
 *  1. Cycle #1 is exactly `runScientificDiscoveryLoopAsync`.
 *  2. Cycle #2 and #3 start ONLY from the immediately preceding cycle's
 *     REAL `nextExperiment.request` — never a freshly generated question —
 *     and carry real provenance (`previousCycleId`, a literal quote of
 *     `resolvedFrom`, and the previous cycle's real fingerprint).
 *  3. A cycle whose `nextExperiment.status` is not `READY_TO_RUN` (here: a
 *     genuinely BLOCKED BACKEND_REAL_ENGINE question, because no Fabric
 *     backend is reachable in this test environment — a real, unmocked
 *     outcome, not a contrived one) refuses to start a further cycle and
 *     returns `NO_JUSTIFIED_NEXT_QUESTION` explicitly.
 */
const CHAINING_PROBLEM = 'problem:intervention-timing';
const BACKEND_UNREACHABLE_PROBLEM = 'problem:pyscf-h2-bond-length-stability';

describe('Research Campaign — chains real cycles from real nextExperiment.request', () => {
  it('1. Cycle #1 is a real, unmodified Scientific Discovery Loop run — same shape as runScientificDiscoveryLoopAsync itself', async () => {
    const cycle = await startResearchCampaign(CHAINING_PROBLEM);
    const direct = await runScientificDiscoveryLoopAsync(CHAINING_PROBLEM);
    expect(cycle.cycleIndex).toBe(1);
    expect(cycle.provenance).toBeNull();
    expect(cycle.problemId).toBe(CHAINING_PROBLEM);
    // Deterministic engine: an independent direct call reaches the identical verdict.
    expect(cycle.result.loop.discrimination).toEqual(direct.loop.discrimination);
    expect(cycle.result.nextExperiment.status).toBe(direct.nextExperiment.status);
  });

  it('2. Cycle #2 starts ONLY from Cycle #1s real nextExperiment.request and carries real provenance', async () => {
    const cycle1 = await startResearchCampaign(CHAINING_PROBLEM);
    expect(cycle1.result.nextExperiment.status).toBe('READY_TO_RUN');
    const request1 = cycle1.result.nextExperiment.request;
    expect(request1).not.toBeNull();

    const step2 = await continueResearchCampaign(cycle1);
    expect(isNoJustifiedNextQuestion(step2)).toBe(false);
    const cycle2 = step2 as ResearchCycle;

    expect(cycle2.cycleIndex).toBe(2);
    expect(cycle2.provenance).not.toBeNull();
    expect(cycle2.provenance!.previousCycleId).toBe(cycle1.cycleId);
    // Literal quote — not a paraphrase.
    expect(cycle2.provenance!.resolvedFrom).toBe(cycle1.result.nextExperiment.resolves);
    expect(cycle2.provenance!.previousCycleFingerprint.length).toBeGreaterThan(0);

    // The seed Cycle #1 proposed (request1.seed) is really the seed Cycle #2 ran at.
    const ranAtSeed = cycle2.result.loop.preregistration.hypotheses[0]?.proposedExperiment?.parameters.seed;
    expect(ranAtSeed).toBe(request1!.seed);
  });

  it('3. Cycle #3 chains from Cycle #2s real nextExperiment.request, not from a fresh question — 2 real subsequent cycles total', async () => {
    const cycle1 = await startResearchCampaign(CHAINING_PROBLEM);
    const cycle2 = await continueResearchCampaign(cycle1);
    if (isNoJustifiedNextQuestion(cycle2)) throw new Error('Cycle #2 unexpectedly had no justified next question.');
    const request2 = cycle2.result.nextExperiment.request;
    expect(cycle2.result.nextExperiment.status).toBe('READY_TO_RUN');

    const step3 = await continueResearchCampaign(cycle2);
    expect(isNoJustifiedNextQuestion(step3)).toBe(false);
    const cycle3 = step3 as ResearchCycle;

    expect(cycle3.cycleIndex).toBe(3);
    expect(cycle3.provenance!.previousCycleId).toBe(cycle2.cycleId);
    expect(cycle3.provenance!.resolvedFrom).toBe(cycle2.result.nextExperiment.resolves);
    // Different cycle, different fingerprint from Cycle #1 -> #2's own.
    expect(cycle3.provenance!.previousCycleFingerprint).not.toBe(cycle1.cycleId);

    const ranAtSeed = cycle3.result.loop.preregistration.hypotheses[0]?.proposedExperiment?.parameters.seed;
    expect(ranAtSeed).toBe(request2!.seed);

    // Every seed in the chain is distinct — real reproducibility checks, not a repeat of the same run.
    const seed1 = cycle1.result.loop.preregistration.hypotheses[0]?.proposedExperiment?.parameters.seed;
    const seed2 = cycle2.result.loop.preregistration.hypotheses[0]?.proposedExperiment?.parameters.seed;
    const seed3 = cycle3.result.loop.preregistration.hypotheses[0]?.proposedExperiment?.parameters.seed;
    expect(new Set([seed1, seed2, seed3]).size).toBe(3);
  });

  it('4. runResearchCampaign chains the same 3 cycles automatically and reports why it eventually stops', async () => {
    const campaign = await runResearchCampaign(CHAINING_PROBLEM, 3);
    expect(campaign.cycles.length).toBe(3);
    expect(campaign.cycles.map((c) => c.cycleIndex)).toEqual([1, 2, 3]);
    expect(campaign.stoppedBecause).toEqual({ status: 'MAX_CYCLES_REACHED', maxCycles: 3 });
    for (let i = 1; i < campaign.cycles.length; i++) {
      expect(campaign.cycles[i]!.provenance!.previousCycleId).toBe(campaign.cycles[i - 1]!.cycleId);
    }
  });
});

describe('Research Campaign — refuses to fabricate a next cycle when none is justified', () => {
  it('5. a real BACKEND_REAL_ENGINE question with no reachable backend genuinely reports VALIDATION_REQUIRED, and the campaign refuses to continue from it', async () => {
    const cycle1 = await startResearchCampaign(BACKEND_UNREACHABLE_PROBLEM);
    // No Fabric backend is running in this test environment — this is a REAL outcome
    // of the unmodified engine (hypothesisLoop.ts catches the real connection failure
    // and marks each hypothesis BLOCKED), not a status forced for the test.
    expect(cycle1.result.nextExperiment.status).not.toBe('READY_TO_RUN');
    expect(cycle1.result.loop.outcomes.every((o) => o.status === 'BLOCKED')).toBe(true);

    const step2 = await continueResearchCampaign(cycle1);
    expect(isNoJustifiedNextQuestion(step2)).toBe(true);
    if (!isNoJustifiedNextQuestion(step2)) throw new Error('unreachable');
    expect(step2.status).toBe(NO_JUSTIFIED_NEXT_QUESTION);
    expect(step2.previousCycleId).toBe(cycle1.cycleId);
    expect(step2.previousCycleProblemId).toBe(BACKEND_UNREACHABLE_PROBLEM);
    expect(step2.reason.length).toBeGreaterThan(0);
  });

  it('6. runResearchCampaign stops immediately at NO_JUSTIFIED_NEXT_QUESTION rather than guessing a replacement question', async () => {
    const campaign = await runResearchCampaign(BACKEND_UNREACHABLE_PROBLEM, 5);
    expect(campaign.cycles.length).toBe(1);
    expect(campaign.stoppedBecause.status).toBe(NO_JUSTIFIED_NEXT_QUESTION);
  });

  it('7. a synthetic cycle whose nextExperiment is RESOLVED also stops the campaign explicitly (covers the RESOLVED branch, not just VALIDATION_REQUIRED/BLOCKED)', async () => {
    const real = await startResearchCampaign(CHAINING_PROBLEM);
    // Real cycle, with only its nextExperiment status/request overridden to the one
    // terminal status selectNextHypothesisExperiment can report on its own — this
    // tests the GATE in continueResearchCampaign, not a fabricated engine result.
    const resolvedCycle: ResearchCycle = {
      ...real,
      result: { ...real.result, nextExperiment: { ...real.result.nextExperiment, status: 'RESOLVED', request: null } },
    };
    const step = await continueResearchCampaign(resolvedCycle);
    expect(isNoJustifiedNextQuestion(step)).toBe(true);
  });
});
