import { describe, expect, it } from 'vitest';
import { runGovDrugDiscoveryCampaign } from '../core/biotechData/govDrugDiscoveryCampaign';
import {
  GDD_CAMPAIGN_PREREGISTRATION,
  GDD_EXHAUSTION_PATHS,
  GDD_SHORTLIST_SIZE,
  GDD_FINALIST_SIZE,
} from '../core/biotechData/govDrugDiscoveryCampaignPreregistration';
import { E2E01_PREREGISTRATION, E2E01_WINNER_RULES, E2E01_ALLOWED_OUTCOMES } from '../core/biotechData/govDrugDiscoveryE2EPreregistration';
import { runGovDrugDiscoveryE2E } from '../core/biotechData/govDrugDiscoveryE2E';
import { evaluatePracticalCandidate, type GatedCandidate } from '../core/agent/practicalCandidateGate';

const run = runGovDrugDiscoveryCampaign();

describe('the sealed E2E-01 preregistration is NOT modified by this campaign', () => {
  it('keeps E2E-01\'s fingerprint exactly as its own lineage field records it', () => {
    expect(GDD_CAMPAIGN_PREREGISTRATION.inheritedFromFingerprint).toBe(E2E01_PREREGISTRATION.fingerprint);
    expect(run.inheritedFromFingerprint).toBe(E2E01_PREREGISTRATION.fingerprint);
  });

  it('inherits the winner rules VERBATIM — not restated, not retuned', () => {
    expect(GDD_CAMPAIGN_PREREGISTRATION.winnerRules).toBe(E2E01_WINNER_RULES);
  });

  it('leaves E2E-01 runnable and unchanged alongside it', () => {
    const original = runGovDrugDiscoveryE2E();
    expect(original.preregistrationFingerprint).toBe(E2E01_PREREGISTRATION.fingerprint);
    expect(E2E01_ALLOWED_OUTCOMES).toContain(original.decision.outcome);
  });

  it('declares openly that this is not a blind seal', () => {
    expect(GDD_CAMPAIGN_PREREGISTRATION.dataAlreadyObserved).toMatch(/NOT A BLIND SEAL/);
  });
});

describe('the funnel: MANY -> SCREENING -> TOP10 -> TOP2', () => {
  it('starts from a generated space far larger than any hand-supplied list', () => {
    expect(run.generationCheck.generatedCount).toBeGreaterThan(1000);
    expect(run.generationCheck.outsidePresuppliedCount).toBeGreaterThan(100);
    expect(run.generationCheck.equalsPresuppliedSet).toBe(false);
    expect(run.generationCheck.passed).toBe(true);
  });

  it('strictly reduces at every stage, and logs a reason for every elimination', () => {
    let previous = run.generationCheck.generatedCount;
    for (const stage of run.stages) {
      expect(stage.inputCount).toBe(previous);
      expect(stage.outputCount).toBeLessThan(stage.inputCount);
      expect(stage.eliminatedCount).toBe(stage.inputCount - stage.outputCount);
      previous = stage.outputCount;
    }
  });

  it('caps the shortlist at 10 and the finalists at 2 — and never pads to reach them', () => {
    expect(run.shortlist.length).toBeLessThanOrEqual(GDD_SHORTLIST_SIZE);
    expect(run.finalists.length).toBeLessThanOrEqual(GDD_FINALIST_SIZE);
    const tier2Survivors = run.stages[run.stages.length - 1].outputCount;
    expect(run.shortlist.length).toBe(Math.min(GDD_SHORTLIST_SIZE, tier2Survivors));
  });

  it('runs deep falsification over the WHOLE shortlist, not just the top few', () => {
    expect(run.falsifications.length).toBe(run.shortlist.length);
    for (const f of run.falsifications) expect(f.attacks.length).toBe(6);
  });

  it('every finalist actually came from the shortlist', () => {
    const shortlistIds = new Set(run.shortlist.map((c) => c.moleculeChemblId));
    for (const f of run.finalists) expect(shortlistIds.has(f.moleculeChemblId)).toBe(true);
  });
});

describe('SAFETY GATE — the defect this milestone exists to fix', () => {
  it('is actually invoked: every finalist carries a real gate decision', () => {
    expect(run.safetyGate.length).toBe(run.finalists.length);
    for (const g of run.safetyGate) expect(g.decision.contractVersion.length).toBeGreaterThan(0);
  });

  it('NEVER passes an empty contradiction list when the candidate has unresolved counterevidence', () => {
    for (const g of run.safetyGate) {
      const falsification = run.falsifications.find((f) => f.moleculeChemblId === g.moleculeChemblId);
      const expectedFromFalsification = falsification?.unresolvedCounterevidence.length ?? 0;
      expect(g.unresolvedContradictions.length).toBeGreaterThanOrEqual(expectedFromFalsification);
    }
  });

  it('NEGATIVE TEST: an unresolved critical contradiction BLOCKS the candidate — the criterion that was previously unreachable', () => {
    const clean: GatedCandidate = {
      candidate: {
        derivedFromModelFingerprint: 'test-fingerprint',
        statement: 'Population-level research finding under test.',
        constraints: ['Applies only to the populations examined.'],
        requiredValidation: ['Institutional review.'],
        proposedProtocol: null,
        protocolWithheldReason: 'No individual protocol is emitted.',
      },
      candidateClass: 'intervention',
      safetyClass: 'POPULATION',
      notProven: ['Individual outcome.', 'Cost-effectiveness.'],
      handoff: { recipient: 'INSTITUTION', boundary: 'Government Research plane only.' },
      evidence: {
        observationIds: ['ctgov:NCT1', 'ctgov:NCT2', 'ctgov:NCT3'],
        replayFingerprint: 'abc123',
        provenance: { sourceUrl: 'https://clinicaltrials.gov', sourceVersion: '2026-09-13' },
        unresolvedContradictions: [],
        epistemicStatus: 'EVIDENCE_GRADED_POPULATION_FINDING',
      },
    };
    // Identical in every respect EXCEPT one unresolved contradiction.
    const contradicted: GatedCandidate = {
      ...clean,
      evidence: { ...clean.evidence, unresolvedContradictions: ['SAFETY: risk ratio for a serious adverse-event category is materially worse than the reference arm and nothing in this run resolves it.'] },
    };

    const cleanDecision = evaluatePracticalCandidate(clean);
    const contradictedDecision = evaluatePracticalCandidate(contradicted);

    expect(cleanDecision.outcome).not.toBe('REFUSE');
    expect(contradictedDecision.outcome).toBe('REFUSE');
    expect(contradictedDecision.failures.map((f) => f.criterion)).toContain('NO_UNRESOLVED_CRITICAL_CONTRADICTION');
  });

  it('a gate-refused candidate can never be the named winner', () => {
    const blocked = new Set(run.safetyGate.filter((g) => g.blocked).map((g) => g.moleculeChemblId));
    if (run.decision.winnerId !== null) expect(blocked.has(run.decision.winnerId)).toBe(false);
  });

  it('no finalist reaches a citizen-facing surface — Government Research or nothing', () => {
    for (const g of run.safetyGate) expect(['GOVERNMENT_RESEARCH', 'GOVERNMENT_ACTION', 'NONE']).toContain(g.surface);
  });
});

describe('EXHAUSTION — NO_WINNER must be expensive to reach', () => {
  it('walks every declared path before any non-winner verdict is accepted', () => {
    expect(run.exhaustion.allPathsAttempted).toBe(true);
    for (const path of GDD_EXHAUSTION_PATHS) {
      const step = run.exhaustion.steps.find((s) => s.path === path);
      expect(step, `path ${path} was never attempted`).toBeDefined();
      expect(step!.status).not.toBe('NOT_ATTEMPTED');
      expect(step!.finding.length).toBeGreaterThan(0);
    }
  });

  it('runs a real differentiating experiment over the finalists, or says honestly why it could not', () => {
    const step = run.exhaustion.steps.find((s) => s.path === 'DIFFERENTIATING_EXPERIMENT')!;
    if (run.exhaustion.differentiatingExperiment !== null) {
      expect(run.exhaustion.differentiatingExperiment.decisionRuleFingerprint.length).toBeGreaterThan(0);
      expect(run.exhaustion.differentiatingExperiment.falsificationPower).toBeGreaterThanOrEqual(0);
    } else {
      expect(step.finding.length).toBeGreaterThan(0);
    }
  });

  it('when the finalists cannot be separated, a REAL observation gap request names what is missing', () => {
    const gap = run.exhaustion.observationGapRequest;
    if (gap !== null) {
      expect(gap.status).toBe('OPEN');
      expect(gap.requiredObservable.quantity.length).toBeGreaterThan(0);
      // The cost is UNDECLARED, never invented.
      expect(gap.feasibility.costEstimate).toBeNull();
      expect(gap.liveHypothesisIds.length).toBe(run.finalists.length);
    }
  });

  it('records both the provisional and the final verdict, so a reader sees whether exhaustion changed anything', () => {
    expect(E2E01_ALLOWED_OUTCOMES).toContain(run.provisionalDecision.outcome);
    expect(run.exhaustionChangedVerdict).toBe(run.decision.outcome !== run.provisionalDecision.outcome);
  });
});

describe('TRIAL REGISTRY — multiplicity from what was actually tried', () => {
  it('records every candidate evaluation and every falsification attack', () => {
    const attacks = run.trials.filter((t) => t.kind === 'FALSIFICATION_ATTACK').length;
    expect(attacks).toBe(run.falsifications.reduce((n, f) => n + f.attacks.length, 0));
    expect(run.trials.filter((t) => t.kind === 'CANDIDATE_EVALUATION').length).toBeGreaterThan(1000);
  });

  it('every recorded trial carries a real reason', () => {
    for (const t of run.trials) expect(t.reason.trim().length).toBeGreaterThan(0);
  });

  it('corrects alpha by the number of attacks actually run, not by a hand-chosen number', () => {
    expect(run.multiplicity.method).toBe('BONFERRONI');
    expect(run.multiplicity.trialsCounted).toBe(run.falsifications.reduce((n, f) => n + f.attacks.length, 0));
    expect(run.multiplicity.correctedAlpha).toBeCloseTo(0.05 / run.multiplicity.trialsCounted, 12);
    expect(run.multiplicity.correctedAlpha).toBeLessThan(0.05);
  });
});

describe('the verdict is evidence-driven, never authored', () => {
  it('reaches one of the preregistered outcomes', () => {
    expect(E2E01_ALLOWED_OUTCOMES).toContain(run.decision.outcome);
  });

  it('emits a research recipe IF AND ONLY IF there is a winner', () => {
    if (run.decision.outcome === 'WINNER') {
      expect(run.researchRecipe).not.toBeNull();
      expect(run.researchRecipe!.dualUseGuard).toBe('ASSERTED');
      expect(run.researchRecipe!.conceptualSynthesisRoute).toMatch(/CONCEPTUAL ONLY/);
    } else {
      expect(run.researchRecipe).toBeNull();
    }
  });

  it('names a winner in the recommendation only when one was actually selected', () => {
    if (run.decision.winnerName === null) {
      expect(run.governmentRecommendation).toMatch(/names NO candidate/);
    } else {
      expect(run.governmentRecommendation).toContain(run.decision.winnerName);
    }
  });

  it('emits no banned marketing or clinical-claim language anywhere in the run', () => {
    expect(run.bannedStringHits).toEqual([]);
  });

  it('is deterministic: two runs produce an identical campaign fingerprint', () => {
    const again = runGovDrugDiscoveryCampaign();
    expect(again.campaignFingerprint).toBe(run.campaignFingerprint);
    expect(again.trialRegistryFingerprint).toBe(run.trialRegistryFingerprint);
    expect(again.decision.outcome).toBe(run.decision.outcome);
  });

  it('carries provenance and a replayable fingerprint', () => {
    expect(run.campaignFingerprint.length).toBeGreaterThan(0);
    expect(run.preregistrationFingerprint).toBe(GDD_CAMPAIGN_PREREGISTRATION.fingerprint);
    expect(run.noAccessDeclarations.length).toBeGreaterThan(0);
  });
});
