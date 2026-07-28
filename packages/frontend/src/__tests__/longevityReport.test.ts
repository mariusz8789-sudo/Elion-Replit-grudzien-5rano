/**
 * Longevity Discovery Platform — reasoning report.
 *
 * Prints what the engines actually conclude, so the output can be read and
 * disputed by a biologist rather than only type-checked by a compiler. Structural
 * tests prove the machinery is consistent; this proves the machinery says
 * something worth reading.
 *
 * To print:  npm run longevity:report
 */
import { describe, expect, it } from 'vitest';
import { analyseCancerSafety, oncogenicLoadRanking } from '../core/longevity/cancerSafety';
import { interactionMatrix, feedbackLoops, structuralGaps, netInfluence } from '../core/longevity/inference';
import { generateHypotheses } from '../core/longevity/discovery';
import { survivingHypotheses } from '../core/longevity/critic';
import { nextExperiments, experimentFrontier, rankingDegeneracy } from '../core/longevity/discovery';
import { designExperiment } from '../core/longevity/experimentDesign';
import { getNode } from '../core/longevity/knowledgeGraph';

/* eslint-disable no-console */
const log = (...a: unknown[]) => console.log(...a);
const label = (id: string) => getNode(id as never)?.label ?? id;

describe('reasoning report', () => {
  it('cancer safety — telomerase activation, full chain', () => {
    const p = analyseCancerSafety('telomerase-activation')!;
    log(`\n=== CANCER SAFETY: ${p.interventionLabel} — verdict "${p.verdict}" ===`);
    log(p.summary);
    for (const f of p.findings) {
      log(`\n  [${f.risk === 'increases-risk' ? 'RISK' : 'protective'}] ${f.axisLabel} (via ${f.viaHallmarkLabel}, confidence: ${f.confidence})`);
      f.reasoning.forEach((r, i) => log(`    ${i + 1}) ${r}`));
    }
    log(`\n  Unassessed axes: ${p.unassessedAxes.map((a) => a.axisLabel).join(', ') || 'none'}`);
    expect(p.findings.length).toBeGreaterThan(0);
  });

  it('cancer safety — comparative oncogenic load', () => {
    log('\n=== ONCOGENIC LOAD RANKING ===');
    for (const r of oncogenicLoadRanking()) {
      log(`  ${r.load.toFixed(1).padStart(4)}  ${r.label.padEnd(38)} risk:${r.riskRoutes} protective:${r.protectiveRoutes} unassessed:${r.unassessedAxes}  [${r.verdict}]`);
    }
    expect(oncogenicLoadRanking().length).toBeGreaterThan(0);
  });

  it('inference — strongest mechanism couplings', () => {
    log('\n=== MECHANISM INTERACTION (top 8) ===');
    for (const m of interactionMatrix(3).slice(0, 8)) {
      log(`  ${m.coupling.toFixed(2)}  ${label(m.a)} ↔ ${label(m.b)}  paths:${m.pathCount} shortest:${m.shortestHops}${m.bidirectional ? ' bidirectional' : ''}${m.conflicting ? '  ⚠ CONFLICTING SIGNS' : ''}`);
    }
    log('\n=== AMPLIFYING FEEDBACK LOOPS ===');
    for (const l of feedbackLoops(3).filter((x) => x.kind === 'amplifying')) {
      log(`  ${l.nodes.map((n) => label(n)).join(' → ')} → ${label(l.nodes[0])}   (confidence ${l.confidence.toFixed(2)})`);
    }
    expect(interactionMatrix(3).length).toBeGreaterThan(0);
  });

  it('inference — a conflicting influence, both routes shown', () => {
    const v = netInfluence('senomorphics', 'sasp', 3);
    log(`\n=== NET INFLUENCE: senomorphics → SASP = "${v.verdict}" ===`);
    v.explanation.forEach((e) => log(`  ${e}`));
    expect(v).toBeTruthy();
  });

  it('structural gaps in the field', () => {
    log('\n=== STRUCTURAL GAPS ===');
    for (const g of structuralGaps()) log(`  [${g.kind}] ${g.label}: ${g.why}`);
    expect(structuralGaps).toBeTruthy();
  });

  it('discovery — top hypotheses after critique', () => {
    const hypotheses = generateHypotheses([]);
    log(`\n=== ${hypotheses.length} HYPOTHESES GENERATED; TOP 4 AFTER CRITIQUE ===`);
    for (const { hypothesis: h, critique: c, survivalScore } of survivingHypotheses(hypotheses, 4)) {
      log(`\n  ── [${h.kind}] plausibility ${h.plausibility} → ${c.adjustedPlausibility} after critique · novelty ${h.novelty} · survival ${survivalScore}`);
      log(`  ${h.statement}`);
      log('  REASONING:');
      h.reasoning.forEach((r) => log(`    · ${r}`));
      log('  CHALLENGES:');
      c.challenges.forEach((ch) => log(`    · [${ch.severity}] ${ch.statement}`));
      if (c.alternativeMechanisms.length) {
        log('  ALTERNATIVE MECHANISMS:');
        c.alternativeMechanisms.forEach((a) => log(`    · ${a.statement}`));
      }
      log('  MISSING EVIDENCE:');
      h.missingEvidence.forEach((m) => log(`    · ${m}`));
    }
    expect(hypotheses.length).toBeGreaterThan(0);
  });

  it('value of information — what humanity should run next', () => {
    log('\n=== NEXT EXPERIMENTS (uncertainty retired per unit effort, no evidence on file) ===');
    for (const c of nextExperiments([], undefined, 8)) {
      log(`\n  ${c.valuePerEffort.toFixed(2)} per effort · retires ${c.uncertaintyReduction} pts (${c.uncertaintyBefore}→${c.uncertaintyAfter}) · effort ${c.effort}`);
      log(`    ${c.interventionLabel} × ${c.hallmarkLabel} · ${c.tierLabel} · ${c.outcomeLabel}`);
      log(`    ${c.justification}`);
    }
    expect(nextExperiments([], undefined, 3).length).toBeGreaterThan(0);
  });

  it('experiment designer — a complete plan', () => {
    const h = generateHypotheses([])[0];
    const plan = designExperiment(h);
    log(`\n=== EXPERIMENTAL PLAN ===`);
    log(`  QUESTION: ${plan.question}`);
    log(`  CELL MODELS:`);
    plan.cellModels.forEach((m) => log(`    · ${m.name}\n        why: ${m.rationale}\n        limit: ${m.limitation}`));
    log(`  ANIMAL MODELS:`);
    plan.animalModels.forEach((m) => log(`    · ${m.name} — ${m.limitation}`));
    log(`  CONTROLS:`);
    plan.controls.forEach((c) => log(`    · [${c.kind}] ${c.description}\n        guards against: ${c.guardsAgainst}`));
    log(`  ENDPOINTS:`);
    plan.endpoints.forEach((e) => log(`    · [${e.role}/${e.kind}] ${e.assay} — ${e.measures}${e.caveat ? `\n        caveat: ${e.caveat}` : ''}`));
    log(`  DISCRIMINATING PREDICTIONS:`);
    plan.discriminatingPredictions.forEach((p) => log(`    · IF TRUE: ${p.underHypothesis}\n      IF NULL: ${p.underNull}`));
    log(`  FAILURE MODES:`);
    plan.failureModes.slice(0, 6).forEach((f) => log(`    · [${f.likelihood}] ${f.description}\n        mitigation: ${f.mitigation}`));
    log(`  DESIGN NOTES:`);
    plan.designNotes.forEach((n) => log(`    · ${n}`));
    expect(plan.isUninformative).toBe(false);
  });
});

describe('efficiency frontier', () => {
  it('shows the whole cost/information trade-off, not just the cheapest point', () => {
    const frontier = experimentFrontier([]);
    const degeneracy = rankingDegeneracy([]);
    log(`\n=== RANKING DEGENERACY: ${degeneracy.tiedCandidates} candidates tied at ${degeneracy.topValue} per effort${degeneracy.isDegenerate ? ' — DEGENERATE, choose on grounds the platform cannot see' : ''} ===`);
    log('\n=== EFFICIENCY FRONTIER (nothing here is dominated) ===');
    for (const c of frontier) {
      log(`  effort ${String(c.effort).padStart(2)} → retires ${c.uncertaintyReduction} pts  ·  ${c.interventionLabel} × ${c.hallmarkLabel} · ${c.tierLabel} · ${c.outcomeLabel}`);
    }
    expect(frontier.length).toBeGreaterThan(1);
    for (let i = 1; i < frontier.length; i++) {
      expect(frontier[i].effort).toBeGreaterThan(frontier[i - 1].effort);
      expect(frontier[i].uncertaintyReduction).toBeGreaterThan(frontier[i - 1].uncertaintyReduction);
    }
  });
});
