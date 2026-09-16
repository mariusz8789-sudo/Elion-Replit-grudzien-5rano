import { describe, expect, it, vi } from 'vitest';
import {
  runGovDrugDiscoveryE2E,
  loadGeneratedCandidates,
  loadPresuppliedCandidateIds,
  checkGenerationNotPinned,
  selectWinner,
  generateResearchRecipe,
  applyInjectedCounterevidence,
  loadInjectedCounterevidence,
  loadNoAccessDeclarations,
  applyActionPreference,
  scanForBannedStrings,
  missingRequiredOutputFields,
  type E2E01Top3Entry,
  type E2E01DeepFalsification,
} from '../core/biotechData/govDrugDiscoveryE2E';
import {
  E2E01_ALLOWED_OUTCOMES,
  E2E01_FALSIFICATION_ATTACKS,
  E2E01_GRADED_SAFETY_LABELS,
  E2E01_NO_ACCESS_LABEL,
} from '../core/biotechData/govDrugDiscoveryE2EPreregistration';
import { runA3GovernmentRecommendation } from '../core/biotechData/a3GovernmentDrugRecommendation';

/**
 * Every number here is computed from the REAL pinned generated candidate
 * space (2671 molecules, SHA-256 verified, D-032) and A2/A3's own real
 * evidence. Asserted as literals so a later change to the data or the
 * funnel becomes a visible, reviewed diff.
 */
describe('GOV-DRUG-DISCOVERY-E2E-01 — T1: generation, not selection', () => {
  it('the generated space is the real mechanism query output, far larger than any pre-supplied list', () => {
    const generated = loadGeneratedCandidates();
    expect(generated).toHaveLength(2671);
  });

  it('T1 passes on the real data: >= 60 generated, >= 20 outside the pre-supplied list, sets not equal', () => {
    const check = checkGenerationNotPinned(loadGeneratedCandidates());
    expect(check.passed).toBe(true);
    expect(check.failures).toEqual([]);
    expect(check.generatedCount).toBe(2671);
    expect(check.presuppliedCount).toBe(12);
    expect(check.outsidePresuppliedCount).toBe(2659);
    expect(check.equalsPresuppliedSet).toBe(false);
  });

  it('every generated candidate carries all four required provenance fields and generatedBy=GENERATOR', () => {
    const check = checkGenerationNotPinned(loadGeneratedCandidates());
    expect(check.everyCandidateHasFullProvenance).toBe(true);
    expect(check.everyCandidateGeneratedByGenerator).toBe(true);
  });

  it('the overwhelming majority of generated candidates were never named by a human — bare ChEMBL identifiers', () => {
    const generated = loadGeneratedCandidates();
    const unnamed = generated.filter((c) => c.prefName === null);
    expect(unnamed.length).toBe(2647);
    expect(unnamed.length / generated.length).toBeGreaterThan(0.95);
  });

  it('T1 FAILS, loudly, if the generated set is replaced by the pre-supplied list — the negative control really is negative', () => {
    const presupplied = [...loadPresuppliedCandidateIds()];
    const generated = loadGeneratedCandidates();
    const asIfSelected = generated.filter((c) => presupplied.includes(c.moleculeChemblId));
    const check = checkGenerationNotPinned(asIfSelected);
    expect(check.passed).toBe(false);
    expect(check.equalsPresuppliedSet).toBe(true);
    expect(check.failures.some((f) => f.includes('selection from a list, not generation'))).toBe(true);
  });
});

describe('GOV-DRUG-DISCOVERY-E2E-01 — the funnel reduces, and logs every elimination', () => {
  it('each stage strictly reduces the previous one', () => {
    const run = runGovDrugDiscoveryE2E();
    const [tier1, tier2] = run.stages;
    expect(tier1.inputCount).toBe(2671);
    expect(tier1.outputCount).toBe(20);
    expect(tier2.inputCount).toBe(20);
    expect(tier2.outputCount).toBe(8);
    expect(tier1.outputCount).toBeLessThan(tier1.inputCount);
    expect(tier2.outputCount).toBeLessThan(tier2.inputCount);
    expect(run.top3.length).toBeLessThanOrEqual(3);
  });

  it('every eliminated candidate carries a reason AND its evidence — no silent drops', () => {
    const run = runGovDrugDiscoveryE2E();
    for (const stage of run.stages) {
      expect(stage.eliminated.length).toBe(stage.inputCount - stage.outputCount);
      for (const e of stage.eliminated) {
        expect(e.reason.length).toBeGreaterThan(0);
        expect(e.evidence.length).toBeGreaterThan(0);
        expect(e.stage).toBe(stage.stage);
      }
    }
  });

  it('Tier-1 reproduces A2\'s pinned 20 exactly — the same real query, differing only in the stage A2 discarded', () => {
    const run = runGovDrugDiscoveryE2E();
    expect(run.stages[0].survivorIds).toHaveLength(20);
    for (const id of ['CHEMBL4297839', 'CHEMBL4084119', 'CHEMBL414357', 'CHEMBL567']) {
      expect(run.stages[0].survivorIds).toContain(id);
    }
  });

  it('Tier-2 eliminations name the real reason: no posted-result trial, or no computable comparison', () => {
    const run = runGovDrugDiscoveryE2E();
    const tier2 = run.stages[1];
    expect(tier2.eliminated.some((e) => e.reason.includes('No ClinicalTrials.gov study with posted results'))).toBe(true);
    expect(tier2.eliminated.some((e) => e.reason.includes('numerically computable efficacy comparison'))).toBe(true);
  });

  it('every TOP3 entry explains why it survived', () => {
    const run = runGovDrugDiscoveryE2E();
    expect(run.top3).toHaveLength(3);
    for (const c of run.top3) {
      expect(c.whySurvived).toContain('Tier-1');
      expect(c.whySurvived).toContain('Tier-2');
      expect(c.whySurvived.length).toBeGreaterThan(120);
    }
  });

  it('a safety-vetoed candidate stays VISIBLE in TOP3 — the veto blocks winning, it does not erase the record', () => {
    const run = runGovDrugDiscoveryE2E();
    const tirzepatide = run.top3.find((c) => c.prefName === 'TIRZEPATIDE');
    expect(tirzepatide).toBeDefined();
    expect(tirzepatide!.vetoed).toBe(true);
    expect(tirzepatide!.whySurvived).toContain('VISIBLY');
  });
});

describe('GOV-DRUG-DISCOVERY-E2E-01 — deep falsification runs all six attacks', () => {
  it('every TOP3 candidate is put through all six preregistered attacks', () => {
    const run = runGovDrugDiscoveryE2E();
    expect(run.falsifications).toHaveLength(3);
    for (const f of run.falsifications) {
      expect(f.attacks.map((a) => a.attack)).toEqual([...E2E01_FALSIFICATION_ATTACKS]);
    }
  });

  it('real counterevidence is surfaced, with evidence references, not merely asserted', () => {
    const run = runGovDrugDiscoveryE2E();
    for (const f of run.falsifications) {
      expect(f.unresolvedCounterevidence.length).toBeGreaterThan(0);
      for (const a of f.attacks) {
        if (!a.survived) expect(a.counterevidence).not.toBeNull();
        expect(a.evidenceRefs.length).toBeGreaterThan(0);
      }
    }
  });

  it('tirzepatide\'s real measured safety signal is surfaced by the SAFETY attack', () => {
    const run = runGovDrugDiscoveryE2E();
    const tirzepatide = run.falsifications.find((f) => f.prefName === 'TIRZEPATIDE')!;
    const safety = tirzepatide.attacks.find((a) => a.attack === 'SAFETY')!;
    expect(safety.survived).toBe(false);
    expect(safety.counterevidence).toContain('Diarrhea');
  });
});

describe('GOV-DRUG-DISCOVERY-E2E-01 — winner selection is evidence-driven, and an honest non-winner is the answer', () => {
  it('the real run reaches NO_WINNER, one of the five preregistered outcomes', () => {
    const run = runGovDrugDiscoveryE2E();
    expect(E2E01_ALLOWED_OUTCOMES).toContain(run.decision.outcome);
    expect(run.decision.outcome).toBe('NO_WINNER');
    expect(run.decision.winnerId).toBeNull();
  });

  it('the reason states the real direction of the evidence, not a composite score', () => {
    const run = runGovDrugDiscoveryE2E();
    expect(run.decision.reason).toContain('0.29pp WORSE than semaglutide');
    expect(run.decision.reason).toContain('blocked by the existential safety veto');
    const glp1 = run.top3.find((c) => c.prefName === 'GLP-1')!;
    expect(glp1.bestEfficacyDeltaPp).toBeCloseTo(0.29, 2);
    const tirzepatide = run.top3.find((c) => c.prefName === 'TIRZEPATIDE')!;
    expect(tirzepatide.bestEfficacyDeltaPp).toBeCloseTo(-0.79, 2);
  });

  it('no research recipe is emitted for a non-winner', () => {
    const run = runGovDrugDiscoveryE2E();
    expect(run.researchRecipe).toBeNull();
    expect(run.governmentOutput.researchRecipe).toBeUndefined();
  });

  it('WINNER is a real, reachable path — proven with synthetic inputs through the real selector', () => {
    const top3: E2E01Top3Entry[] = [{
      moleculeChemblId: 'SYNTH-1', prefName: 'SYNTHETIC_CANDIDATE', rank: 1, weightedScore: 1.2,
      bestEfficacyDeltaPp: -0.9, vetoed: false, vetoReason: null, safetyLabel: 'LOWER_OBSERVED_RISK',
      populationCoverage: 'DIRECT_EVIDENCE_FOR_POPULATION', whySurvived: 'synthetic',
    }];
    const falsifications: E2E01DeepFalsification[] = [{
      moleculeChemblId: 'SYNTH-1', prefName: 'SYNTHETIC_CANDIDATE',
      attacks: E2E01_FALSIFICATION_ATTACKS.map((attack) => ({ attack, survived: true, counterevidence: null, evidenceRefs: ['synthetic'] })),
      unresolvedCounterevidence: [], survivedAll: true,
    }];
    const decision = selectWinner(top3, falsifications, 1);
    expect(decision.outcome).toBe('WINNER');
    expect(decision.winnerId).toBe('SYNTH-1');
    expect(decision.whyWinnerSurvivedFalsification).toContain('EFFICACY: survived');
  });

  it('NO_SAFE_WINNER is reachable when every eligible candidate is vetoed', () => {
    const top3: E2E01Top3Entry[] = [{
      moleculeChemblId: 'SYNTH-2', prefName: 'SYNTHETIC_VETOED', rank: 1, weightedScore: 2,
      bestEfficacyDeltaPp: -1.5, vetoed: true, vetoReason: 'Existential safety veto: synthetic signal.',
      safetyLabel: null, populationCoverage: 'DIRECT_EVIDENCE_FOR_POPULATION', whySurvived: 'synthetic',
    }];
    expect(selectWinner(top3, [], 1).outcome).toBe('NO_SAFE_WINNER');
  });

  it('INSUFFICIENT_EVIDENCE is reachable when nothing reaches Tier-2', () => {
    expect(selectWinner([], [], 0).outcome).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('CONFLICTING_EVIDENCE is reachable when eligible candidates genuinely disagree in direction', () => {
    const mk = (id: string, delta: number): E2E01Top3Entry => ({
      moleculeChemblId: id, prefName: id, rank: 1, weightedScore: 0.5, bestEfficacyDeltaPp: delta,
      vetoed: false, vetoReason: null, safetyLabel: 'NO_SIGNAL_DETECTED',
      populationCoverage: 'DIRECT_EVIDENCE_FOR_POPULATION', whySurvived: 'synthetic',
    });
    const decision = selectWinner([mk('BETTER', -0.8), mk('WORSE', 0.6)], [], 2);
    expect(decision.outcome).toBe('CONFLICTING_EVIDENCE');
    expect(decision.reason).toContain('opposite directions');
  });
});

describe('GOV-DRUG-DISCOVERY-E2E-01 — adversarial self-falsification (FLIP)', () => {
  it('the injected counterevidence really lands on the leading candidate\'s record in the real run', () => {
    const flipped = runGovDrugDiscoveryE2E({ injectCounterevidence: true });
    const touched = flipped.falsifications.filter((f) => f.unresolvedCounterevidence.some((c) => c.includes('INJECTED')));
    expect(touched).toHaveLength(1);
    expect(touched[0].prefName).toBe('GLP-1');
    expect(flipped.decision.outcome).not.toBe('WINNER');
  });

  it('a would-be WINNER is REVISED away by injected counterevidence — the system attacks its own conclusion', () => {
    const top3: E2E01Top3Entry[] = [{
      moleculeChemblId: 'SYNTH-1', prefName: 'SYNTHETIC_CANDIDATE', rank: 1, weightedScore: 1.2,
      bestEfficacyDeltaPp: -0.9, vetoed: false, vetoReason: null, safetyLabel: 'LOWER_OBSERVED_RISK',
      populationCoverage: 'DIRECT_EVIDENCE_FOR_POPULATION', whySurvived: 'synthetic',
    }];
    const clean: E2E01DeepFalsification = {
      moleculeChemblId: 'SYNTH-1', prefName: 'SYNTHETIC_CANDIDATE',
      attacks: E2E01_FALSIFICATION_ATTACKS.map((attack) => ({ attack, survived: true, counterevidence: null, evidenceRefs: ['synthetic'] })),
      unresolvedCounterevidence: [], survivedAll: true,
    };
    expect(selectWinner(top3, [clean], 1).outcome).toBe('WINNER');

    const attacked = applyInjectedCounterevidence(clean, loadInjectedCounterevidence());
    expect(attacked.survivedAll).toBe(false);
    expect(attacked.unresolvedCounterevidence.some((c) => c.includes('INJECTED'))).toBe(true);

    const revised = selectWinner(top3, [attacked], 1);
    expect(revised.outcome).not.toBe('WINNER');
    expect(['NO_WINNER', 'CONFLICTING_EVIDENCE', 'NO_SAFE_WINNER']).toContain(revised.outcome);
  });
});

describe('GOV-DRUG-DISCOVERY-E2E-01 — truth-engine assertions', () => {
  it('no banned string appears anywhere in the real government output', () => {
    const run = runGovDrugDiscoveryE2E();
    expect(run.bannedStringHits).toEqual([]);
  });

  it('the banned-string scanner really catches a banned string — the check is not vacuous', () => {
    const hits = scanForBannedStrings({ nested: { deep: ['this candidate is a cudowny lek'] } });
    expect(hits).toHaveLength(1);
    expect(hits[0].banned).toBe('cudowny lek');
  });

  it('safety is expressed only through the graded vocabulary, never as an unqualified claim', () => {
    const run = runGovDrugDiscoveryE2E();
    for (const line of run.governmentOutput.safetyProfile) {
      const usesGraded = E2E01_GRADED_SAFETY_LABELS.some((l) => line.includes(l));
      const declaresVeto = line.includes('no reassuring label applies');
      expect(usesGraded || declaresVeto).toBe(true);
    }
  });

  it('required-but-unavailable sources are DECLARED NO_ACCESS_DECLARED, not filled in', () => {
    const declarations = loadNoAccessDeclarations();
    expect(declarations.length).toBeGreaterThanOrEqual(3);
    for (const d of declarations) expect(d.status).toBe(E2E01_NO_ACCESS_LABEL);
    const run = runGovDrugDiscoveryE2E();
    expect(run.governmentOutput.uncertainty.some((u) => u.includes(E2E01_NO_ACCESS_LABEL))).toBe(true);
    expect(run.governmentOutput.uncertainty.some((u) => u.includes('national-procurement-pricing'))).toBe(true);
  });

  it('an Action-layer preference contradicting the AnswerRecord is REJECTED, and the AnswerRecord is unchanged', () => {
    const run = runGovDrugDiscoveryE2E();
    const result = applyActionPreference(run.decision, { preferredWinnerId: 'CHEMBL4297839', rationale: 'politically convenient' });
    expect(result.accepted).toBe(false);
    expect(result.reason).toContain('may never rewrite what was found');
    expect(result.answerRecordOutcomeAfter).toBe(run.decision.outcome);
    expect(result.answerRecordWinnerIdAfter).toBe(run.decision.winnerId);
  });

  it('a non-contradicting Action-layer preference is accepted without touching the AnswerRecord', () => {
    const run = runGovDrugDiscoveryE2E();
    const result = applyActionPreference(run.decision, { preferredWinnerId: null, rationale: 'defer to the evidence' });
    expect(result.accepted).toBe(true);
    expect(result.answerRecordOutcomeAfter).toBe(run.decision.outcome);
  });
});

describe('GOV-DRUG-DISCOVERY-E2E-01 — government output and replay', () => {
  it('all 18 required fields are present and non-empty', () => {
    const run = runGovDrugDiscoveryE2E();
    expect(missingRequiredOutputFields(run.governmentOutput)).toEqual([]);
  });

  it('the recommendation is population-level and carries no individual clinical direction', () => {
    const run = runGovDrugDiscoveryE2E();
    expect(run.governmentOutput.governmentRecommendation).toContain('Population-level research finding');
    expect(run.governmentOutput.governmentRecommendation).toContain('not a prescription');
    expect(run.governmentOutput.status).toBe('TRUTH');
  });

  it('provenance names the real sources and the sealed lineage', () => {
    const run = runGovDrugDiscoveryE2E();
    const provenance = run.governmentOutput.fullProvenance.join(' ');
    expect(provenance).toContain('ChEMBL');
    expect(provenance).toContain('ClinicalTrials.gov');
    expect(provenance).toContain('dc44475a');
    expect(provenance).toContain('f528c881');
  });

  it('the run is deterministic: two runs over the same pinned data produce the same fingerprint', () => {
    const a = runGovDrugDiscoveryE2E();
    const b = runGovDrugDiscoveryE2E();
    expect(a.runFingerprint).toBe(b.runFingerprint);
    // D-113: moved from '399221f5' — this run calls A3, which re-runs A2's
    // own analysis, so orforglipron's real second efficacy observation
    // (NCT05048719, see a2OzempicSubstitute.test.ts's D-113 note) flows
    // through here too. The real outcome is unchanged (still NO_WINNER,
    // asserted elsewhere in this file) — only the fingerprint, because the
    // underlying data genuinely changed.
    expect(a.runFingerprint).toBe('94495ec1');
    expect(a.preregistrationFingerprint).toBe('f528c881');
  });

  it('the population control still holds: with no population, A3 refuses rather than guessing', () => {
    expect(runA3GovernmentRecommendation().status).toBe('REQUIRED_POLICY_INPUT');
  });
});

describe('GOV-DRUG-DISCOVERY-E2E-01 — Science Memory', () => {
  it('records the funnel shape and the honest outcome, not just a headline', async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (k: string) => (storage.has(k) ? storage.get(k)! : null),
        setItem: (k: string, v: string) => void storage.set(k, v),
        removeItem: (k: string) => void storage.delete(k),
        key: (i: number) => [...storage.keys()][i] ?? null,
        get length() { return storage.size; },
      },
    });
    vi.resetModules();
    const { saveGovDrugDiscoveryE2EToMemory, listExperiments } = await import('../core/scienceMemory');
    const run = runGovDrugDiscoveryE2E();

    const before = listExperiments().length;
    const record = saveGovDrugDiscoveryE2EToMemory(run);
    expect(listExperiments().length).toBe(before + 1);
    expect(record.epistemicStatus).toBe('FALSIFIED_WITHIN_PROTOCOL');
    expect(record.stats.generatedCandidates).toBe(2671);
    expect(record.stats.tier1Survivors).toBe(20);
    expect(record.stats.bannedStringHits).toBe(0);
    const bodies = record.analysis!.map((a) => a.body).join(' ');
    expect(bodies).toContain('NO_WINNER');
    expect(bodies).toContain('NIE wygenerowany');
    expect(bodies).toContain(run.runFingerprint);
    vi.unstubAllGlobals();
  });
});

describe('GOV-DRUG-DISCOVERY-E2E-01 — research recipe is gated and dual-use guarded', () => {
  it('generateResearchRecipe returns null for every non-WINNER outcome', () => {
    const run = runGovDrugDiscoveryE2E();
    const view = runA3GovernmentRecommendation({ kind: 'T2D_AND_OBESITY' });
    if (view.status !== 'ANSWERED') throw new Error('unreachable');
    const anyView = view.answerRecord.candidateViews[0];
    for (const outcome of ['NO_WINNER', 'NO_SAFE_WINNER', 'INSUFFICIENT_EVIDENCE', 'CONFLICTING_EVIDENCE'] as const) {
      expect(generateResearchRecipe({ outcome, winnerId: 'x', winnerName: 'x', reason: '', whyWinnerSurvivedFalsification: null }, anyView, run.runFingerprint)).toBeNull();
    }
  });

  it('on a WINNER it emits a research-grade recipe with a dual-use guard and NO dose or operational route', () => {
    const run = runGovDrugDiscoveryE2E();
    const a3 = runA3GovernmentRecommendation({ kind: 'T2D_AND_OBESITY' });
    if (a3.status !== 'ANSWERED') throw new Error('unreachable');
    const view = a3.answerRecord.candidateViews.find((v) => v.report.summary.prefName === 'TIRZEPATIDE')!;
    const recipe = generateResearchRecipe(
      { outcome: 'WINNER', winnerId: view.report.summary.moleculeChemblId, winnerName: 'TIRZEPATIDE', reason: 'synthetic', whyWinnerSurvivedFalsification: 'synthetic' },
      view, run.runFingerprint,
    );
    expect(recipe).not.toBeNull();
    expect(recipe!.dualUseGuard).toBe('ASSERTED');
    expect(recipe!.conceptualSynthesisRoute).toContain('CONCEPTUAL ONLY');
    expect(recipe!.conceptualSynthesisRoute).toContain('no step-level procedure');
    expect(recipe!.replay).toBe(run.runFingerprint);
    expect(recipe!.identifiers).toContain(view.report.summary.moleculeChemblId);
    // No dose, no prescription language anywhere in the recipe.
    const text = JSON.stringify(recipe).toLowerCase();
    expect(/\b\d+\s*(mg|ml|mcg|µg)\b/.test(text)).toBe(false);
    expect(text).not.toContain('prescri');
    expect(scanForBannedStrings(recipe)).toEqual([]);
  });
});
