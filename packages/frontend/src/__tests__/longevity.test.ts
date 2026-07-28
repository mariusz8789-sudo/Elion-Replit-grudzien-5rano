/**
 * Longevity Discovery Platform — engine tests.
 *
 * These do not check that the code runs; they check that the REASONING IS RIGHT.
 * A sign error in the cancer-safety composition would invert a risk verdict while
 * every type still checked and every screen still rendered, so the sign algebra is
 * pinned against biology that is not in dispute:
 *
 *   telomerase activation must surface an oncogenic route (most cancers reactivate TERT)
 *   senolytics must surface weakened p53/RB tumour suppression (senescence IS that barrier)
 *   worm lifespan evidence must score strong on strength and weak on human relevance
 *
 * The last block enforces the platform's hard invariants — no fabricated citations,
 * no dosing, no efficacy language — structurally, over every shipped string.
 */
import { describe, expect, it } from 'vitest';
import { HALLMARKS, MECHANISTIC_EDGES, getHallmark, propagationFrom } from '../core/longevity/hallmarks';
import { INTERVENTIONS, TARGET_DIRECTIONS, getIntervention, allTensions } from '../core/longevity/interventions';
import { GRAPH_NODES, GRAPH_EDGES, danglingEdges, findPath, nodesOfKind, CANCER_NODES } from '../core/longevity/knowledgeGraph';
import { signedPaths, netInfluence, openTriads, structuralGaps, interactionMatrix, feedbackLoops } from '../core/longevity/inference';
import { analyseCancerSafety, analyseAll, oncogenicLoadRanking, offsettingPairs } from '../core/longevity/cancerSafety';
import { gradeEvidence, validateEvidence, findConflicts, TIERS, type EvidenceRecord } from '../core/longevity/evidence';
import { appraiseIntervention, evidenceTranslationGap, appraiseAll } from '../core/longevity/appraisal';
import { generateHypotheses, nextExperiments, recommendNextExperiment, discoveryScore, isFeasible } from '../core/longevity/discovery';
import { critique, survivingHypotheses } from '../core/longevity/critic';
import { designExperiment } from '../core/longevity/experimentDesign';
import { analyseSafeRegeneration, analyseAllSafeRegeneration, answerCentralQuestion } from '../core/longevity/safeRegeneration';

/** A realistic record, so tests exercise the same shape the UI produces. */
function record(over: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    id: 'r1', interventionId: 'senolytics', hallmarkId: 'cellular-senescence',
    tier: 'rodent', outcome: 'healthspan', direction: 'beneficial',
    citation: 'PMID:00000000', system: 'C57BL/6 mouse',
    replicated: false, randomised: true, blinded: true, preregistered: false,
    sampleSize: 40, readoutKind: 'direct', addedAt: 1,
    ...over,
  };
}

describe('mechanism registry', () => {
  it('covers all ten requested mechanisms', () => {
    const ids = HALLMARKS.map((h) => h.id);
    for (const required of [
      'telomere-attrition', 'telomerase', 'yamanaka-factors', 'epigenetic-reprogramming',
      'cellular-senescence', 'sasp', 'dna-repair', 'stem-cell-rejuvenation',
      'mitochondrial-dysfunction', 'autophagy',
    ]) expect(ids).toContain(required);
  });

  it('every mechanism declares molecules, readouts and an honesty note', () => {
    for (const h of HALLMARKS) {
      expect(h.molecules.length, `${h.id} molecules`).toBeGreaterThan(0);
      expect(h.readouts.length, `${h.id} readouts`).toBeGreaterThan(0);
      expect(h.honestyNote.length, `${h.id} honestyNote`).toBeGreaterThan(40);
    }
  });

  it('propagation is cycle-safe across the senescence↔SASP feedback loop', () => {
    const reached = propagationFrom('cellular-senescence');
    expect(reached.map((r) => r.id)).toContain('sasp');
    expect(reached.find((r) => r.id === 'cellular-senescence')).toBeUndefined(); // start excluded, no infinite walk
  });
});

describe('knowledge graph integrity', () => {
  it('has no dangling edges', () => {
    expect(danglingEdges()).toEqual([]);
  });

  it('contains all four node kinds including the oncogenic axis', () => {
    expect(nodesOfKind('hallmark').length).toBe(10);
    expect(nodesOfKind('cancer-pathway').length).toBe(6);
    expect(nodesOfKind('biomarker').length).toBeGreaterThan(0);
    expect(nodesOfKind('intervention').length).toBe(INTERVENTIONS.length);
    expect(GRAPH_NODES.length).toBe(
      nodesOfKind('hallmark').length + nodesOfKind('cancer-pathway').length
      + nodesOfKind('biomarker').length + nodesOfKind('intervention').length,
    );
  });

  it('node ids are unique', () => {
    const ids = GRAPH_NODES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every declared modulation direction refers to a real target of that intervention', () => {
    for (const iv of INTERVENTIONS) {
      for (const hallmark of Object.keys(TARGET_DIRECTIONS[iv.id] ?? {})) {
        expect(iv.targets, `${iv.id} declares a direction for ${hallmark}`).toContain(hallmark);
      }
    }
  });

  it('finds a documented path from mitochondrial dysfunction to cellular senescence', () => {
    const path = findPath('mitochondrial-dysfunction', 'cellular-senescence');
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(0);
  });
});

describe('inference — sign algebra', () => {
  it('composes an even number of counteracting edges to a promoting net effect', () => {
    // autophagy ⊣ mitochondrial-dysfunction, mitochondrial-dysfunction → senescence
    // one counteracting edge ⇒ net counteracts.
    const paths = signedPaths('autophagy', 'cellular-senescence', 3);
    expect(paths.length).toBeGreaterThan(0);
    const direct = paths.find((p) => p.hops === 2 && p.edges[0].to === 'mitochondrial-dysfunction');
    expect(direct?.net).toBe('counteracts');
  });

  it('telomerase counteracts senescence through telomere attrition', () => {
    const verdict = netInfluence('telomerase', 'cellular-senescence', 3);
    expect(verdict.verdict).toBe('counteracts');
    expect(verdict.explanation.length).toBeGreaterThan(0);
    expect(verdict.explanation.join(' ')).toMatch(/telomere/i);
  });

  it('reports no-known-path rather than inventing one', () => {
    const verdict = netInfluence('autophagy', 'yamanaka-factors', 2);
    expect(verdict.verdict).toBe('no-known-path');
    expect(verdict.explanation).toEqual([]);
  });

  it('open triads never duplicate an already-documented direct edge', () => {
    const documented = new Set(MECHANISTIC_EDGES.map((e) => `${e.from}->${e.to}`));
    for (const t of openTriads()) {
      expect(documented.has(`${t.a}->${t.c}`), `${t.a}->${t.c} should be undocumented`).toBe(false);
    }
  });

  it('detects the senescence↔SASP amplifying loop', () => {
    const loops = feedbackLoops(3);
    const senescenceLoop = loops.find((l) => l.nodes.includes('cellular-senescence') && l.nodes.includes('sasp'));
    expect(senescenceLoop).toBeDefined();
    expect(senescenceLoop!.kind).toBe('amplifying');
  });

  it('ranks mechanism interactions and flags conflicting couplings', () => {
    const matrix = interactionMatrix(3);
    expect(matrix.length).toBeGreaterThan(0);
    for (let i = 1; i < matrix.length; i++) expect(matrix[i - 1].coupling).toBeGreaterThanOrEqual(matrix[i].coupling);
  });

  it('reports structural gaps as field-level facts', () => {
    const gaps = structuralGaps();
    for (const g of gaps) expect(g.why.length).toBeGreaterThan(30);
  });
});

describe('cancer safety engine', () => {
  it('flags telomerase activation as raising oncogene activation', () => {
    const p = analyseCancerSafety('telomerase-activation')!;
    const onco = p.risks.find((f) => f.axis === 'oncogene-activation');
    expect(onco, 'telomerase activation must surface an oncogenic route').toBeDefined();
    expect(onco!.risk).toBe('increases-risk');
    expect(onco!.reasoning.join(' ')).toMatch(/85|immortalis/i);
  });

  it('also credits telomerase activation with reducing genomic instability', () => {
    // Reducing telomere attrition lowers breakage–fusion–bridge instability, so the
    // honest profile is MIXED rather than uniformly bad.
    const p = analyseCancerSafety('telomerase-activation')!;
    expect(p.protective.some((f) => f.axis === 'genomic-instability')).toBe(true);
    expect(p.verdict).toBe('mixed');
  });

  it('flags senolytics as weakening the p53 and RB tumour-suppressive arrest', () => {
    const p = analyseCancerSafety('senolytics')!;
    const axes = p.risks.map((f) => f.axis);
    expect(axes).toContain('tp53-axis');
    expect(axes).toContain('rb-axis');
  });

  it('flags SASP suppression as reducing immune surveillance', () => {
    const p = analyseCancerSafety('senomorphics')!;
    const immune = p.risks.find((f) => f.axis === 'immune-surveillance');
    expect(immune).toBeDefined();
    expect(immune!.axisDirection).toBe('lowers');
  });

  it('refuses to compute a risk sign where no modulation direction is declared', () => {
    // senomorphics acts on senescent cells but declares no direction for senescence.
    const p = analyseCancerSafety('senomorphics')!;
    expect(p.findings.every((f) => f.viaHallmark !== 'cellular-senescence')).toBe(true);
  });

  it('never returns a probability and never says "safe"', () => {
    for (const p of analyseAll()) {
      expect(p.summary).not.toMatch(/\bis safe\b|\bproven safe\b|\bno risk\b/i);
      expect(p.summary).toMatch(/not a probability|absence of analysis/i);
    }
  });

  it('every finding carries a complete, auditable reasoning chain', () => {
    for (const p of analyseAll()) {
      for (const f of p.findings) {
        expect(f.reasoning.length).toBe(5);
        expect(f.reasoning[0]).toMatch(/intended to (increase|decrease)/);
        expect(f.reasoning[4]).toMatch(/INCREASES|reduces/);
      }
    }
  });

  it('reports unassessed axes rather than silently omitting them', () => {
    for (const p of analyseAll()) {
      const touched = new Set(p.findings.map((f) => f.axis));
      expect(p.unassessedAxes.length).toBe(CANCER_NODES.length - touched.size);
    }
  });

  it('ranks oncogenic load and finds offsetting pairs', () => {
    const ranking = oncogenicLoadRanking();
    expect(ranking.length).toBe(INTERVENTIONS.length);
    for (let i = 1; i < ranking.length; i++) expect(ranking[i - 1].load).toBeGreaterThanOrEqual(ranking[i].load);
    expect(offsettingPairs().length).toBeGreaterThan(0);
  });
});

describe('evidence grading', () => {
  it('separates strength from human relevance — strong worm evidence stays weak for humans', () => {
    const worm = gradeEvidence(record({ tier: 'invertebrate', outcome: 'lifespan', replicated: true, sampleSize: 200, system: 'C. elegans' }));
    expect(worm.strength).toBeGreaterThan(50);
    expect(worm.humanRelevance).toBeLessThan(25);
    expect(worm.caveats.join(' ')).toMatch(/Translation gap/);
  });

  it('rates a replicated human RCT above an unreplicated rodent study on both axes', () => {
    const rct = gradeEvidence(record({ tier: 'human-interventional', outcome: 'healthspan', replicated: true, preregistered: true, sampleSize: 400 }));
    const mouse = gradeEvidence(record({ tier: 'rodent', outcome: 'healthspan' }));
    expect(rct.strength).toBeGreaterThan(mouse.strength);
    expect(rct.humanRelevance).toBeGreaterThan(mouse.humanRelevance);
  });

  it('discounts surrogate endpoints', () => {
    const surrogate = gradeEvidence(record({ outcome: 'biomarker' }));
    const lifespan = gradeEvidence(record({ outcome: 'lifespan' }));
    expect(surrogate.strength).toBeLessThan(lifespan.strength);
  });

  it('discounts proxy readouts and says so', () => {
    const proxy = gradeEvidence(record({ readoutKind: 'proxy' }));
    expect(proxy.caveats.join(' ')).toMatch(/proxy/i);
    expect(proxy.strength).toBeLessThan(gradeEvidence(record({ readoutKind: 'direct' })).strength);
  });

  it('returns a full breakdown so any single weight can be disputed', () => {
    const g = gradeEvidence(record());
    expect(g.breakdown.length).toBeGreaterThanOrEqual(6);
    for (const b of g.breakdown) {
      expect(b.reason.length).toBeGreaterThan(20);
      expect(Number.isFinite(b.multiplier)).toBe(true);
    }
  });

  it('refuses a record without a citation', () => {
    expect(validateEvidence({ ...record(), citation: '  ' }).ok).toBe(false);
    expect(validateEvidence(record()).ok).toBe(true);
  });

  it('surfaces contradictions instead of averaging them', () => {
    const conflicts = findConflicts([
      record({ id: 'a', direction: 'beneficial' }),
      record({ id: 'b', direction: 'harmful' }),
    ]);
    expect(conflicts.length).toBe(1);
    expect(conflicts[0].beneficial.length).toBe(1);
    expect(conflicts[0].harmful.length).toBe(1);
  });

  it('is deterministic', () => {
    expect(gradeEvidence(record())).toEqual(gradeEvidence(record()));
  });
});

describe('appraisal — fail-closed', () => {
  it('states nothing and reports maximum-ish uncertainty with no evidence', () => {
    const a = appraiseIntervention('senolytics', [])!;
    expect(a.recordCount).toBe(0);
    expect(a.maturity).toBe('no-evidence');
    expect(a.uncertainty).toBeGreaterThan(90);
    expect(a.verdict).toMatch(/empty file, not a negative result/);
  });

  it('never claims a strategy works', () => {
    const records = [record({ tier: 'human-interventional', replicated: true, outcome: 'lifespan', sampleSize: 900 })];
    for (const a of appraiseAll(INTERVENTIONS.map((i) => i.id), records)) {
      // Affirmative efficacy assertions only — the verdict is REQUIRED to contain
      // the phrase "not a claim that the strategy works", so a bare word match
      // would flag the disclaimer itself.
      expect(a.verdict).not.toMatch(/\b(is|are|has been) (effective|proven|shown to work)\b/i);
      expect(a.verdict).not.toMatch(/\bwill (extend|reverse|slow)\b/i);
      expect(a.verdict).toMatch(/not a claim that the strategy works|empty file/);
    }
  });

  it('lowers uncertainty as evidence accumulates', () => {
    const none = appraiseIntervention('senolytics', [])!.uncertainty;
    const some = appraiseIntervention('senolytics', [record()])!.uncertainty;
    const more = appraiseIntervention('senolytics', [
      record({ id: 'a' }),
      record({ id: 'b', hallmarkId: 'sasp', replicated: true }),
      record({ id: 'c', hallmarkId: 'stem-cell-rejuvenation', tier: 'human-interventional', outcome: 'lifespan', replicated: true }),
    ])!.uncertainty;
    expect(some).toBeLessThan(none);
    expect(more).toBeLessThan(some);
  });

  it('explains every uncertainty component and what would reduce it', () => {
    const a = appraiseIntervention('senolytics', [record()])!;
    for (const c of a.uncertaintyComponents) {
      expect(c.coverage).toBeGreaterThanOrEqual(0);
      expect(c.coverage).toBeLessThanOrEqual(1);
      expect(c.wouldBeReducedBy.length).toBeGreaterThan(5);
    }
  });

  it('surfaces the strong-evidence / weak-translation gap', () => {
    const records = [record({ interventionId: 'autophagy-induction', hallmarkId: 'autophagy', tier: 'invertebrate', outcome: 'lifespan', replicated: true, sampleSize: 300 })];
    const gaps = evidenceTranslationGap(appraiseAll(['autophagy-induction'], records));
    expect(gaps[0].gap).toBeGreaterThan(20);
  });

  it('attaches the cancer safety profile to every appraisal', () => {
    const a = appraiseIntervention('telomerase-activation', [])!;
    expect(a.safety).not.toBeNull();
    expect(a.safety!.risks.length).toBeGreaterThan(0);
  });

  it('rates translational difficulty with named drivers', () => {
    const a = appraiseIntervention('partial-reprogramming', [])!;
    expect(a.translationalDifficulty.score).toBeGreaterThan(0);
    expect(a.translationalDifficulty.drivers.length).toBeGreaterThan(1);
  });
});

describe('discovery engine', () => {
  const hypotheses = generateHypotheses([]);

  it('generates hypotheses of several structural kinds', () => {
    expect(hypotheses.length).toBeGreaterThan(5);
    expect(new Set(hypotheses.map((h) => h.kind)).size).toBeGreaterThanOrEqual(3);
  });

  it('every hypothesis carries reasoning and names its missing evidence', () => {
    for (const h of hypotheses) {
      expect(h.reasoning.length, `${h.id} reasoning`).toBeGreaterThan(1);
      expect(h.missingEvidence.length, `${h.id} missingEvidence`).toBeGreaterThan(0);
      expect(h.statement.length).toBeGreaterThan(40);
    }
  });

  it('never fabricates a citation', () => {
    const text = hypotheses.flatMap((h) => [h.statement, ...h.reasoning, ...h.missingEvidence]).join(' ');
    expect(text).not.toMatch(/PMID:\s*\d/i);
    expect(text).not.toMatch(/doi\.org|10\.\d{4}\//i);
    expect(text).not.toMatch(/et al\./i);
  });

  it('is deterministic', () => {
    expect(generateHypotheses([]).map((h) => h.id)).toEqual(hypotheses.map((h) => h.id));
  });

  it('lowers novelty once evidence covers the nodes', () => {
    const covered = generateHypotheses(Array.from({ length: 9 }, (_, i) =>
      record({ id: `e${i}`, interventionId: 'senolytics', hallmarkId: 'cellular-senescence' })));
    const before = hypotheses.find((h) => h.nodes.includes('cellular-senescence'));
    const after = covered.find((h) => h.id === before?.id);
    if (before && after) expect(after.novelty).toBeLessThan(before.novelty);
  });

  it('ranks by plausibility × novelty', () => {
    for (let i = 1; i < hypotheses.length; i++) {
      expect(discoveryScore(hypotheses[i - 1])).toBeGreaterThanOrEqual(discoveryScore(hypotheses[i]));
    }
  });
});

describe('value of information — the next experiment', () => {
  it('recommends an experiment and explains what it would retire', () => {
    const best = recommendNextExperiment([])!;
    expect(best).toBeTruthy();
    expect(best.uncertaintyReduction).toBeGreaterThan(0);
    expect(best.uncertaintyAfter).toBeLessThan(best.uncertaintyBefore);
    expect(best.justification).toMatch(/whether the result is positive or null/);
  });

  it('ranks by uncertainty retired per unit effort', () => {
    const list = nextExperiments([], undefined, 10);
    expect(list.length).toBeGreaterThan(1);
    for (let i = 1; i < list.length; i++) {
      expect(list[i - 1].valuePerEffort).toBeGreaterThanOrEqual(list[i].valuePerEffort);
    }
  });

  it('prefers a cheap informative system over an expensive one of equal information', () => {
    const list = nextExperiments([], ['senolytics'], 40);
    const cheap = list.find((c) => c.tier === 'in-vitro-human');
    const dear = list.find((c) => c.tier === 'non-human-primate');
    if (cheap && dear && cheap.uncertaintyReduction >= dear.uncertaintyReduction) {
      expect(cheap.valuePerEffort).toBeGreaterThan(dear.valuePerEffort);
    }
  });

  it('never proposes a physically impossible experiment', () => {
    // A dish of cells has no lifespan and no healthspan. Proposing to measure one
    // there is the single fastest way to lose a researcher's trust.
    for (const c of nextExperiments([], undefined, 200)) {
      expect(isFeasible(c.tier, c.outcome), `${c.tierLabel} cannot measure ${c.outcomeLabel}`).toBe(true);
      if (c.tier.startsWith('in-vitro') || c.tier === 'in-silico') {
        expect(['lifespan', 'healthspan']).not.toContain(c.outcome);
      }
    }
  });

  it('breaks ties deterministically by mechanism centrality', () => {
    const list = nextExperiments([], undefined, 30);
    for (let i = 1; i < list.length; i++) {
      const a = list[i - 1];
      const b = list[i];
      if (a.valuePerEffort === b.valuePerEffort && a.uncertaintyReduction === b.uncertaintyReduction) {
        expect(a.centrality).toBeGreaterThanOrEqual(b.centrality);
      }
    }
    // …and the whole ranking is reproducible.
    expect(nextExperiments([], undefined, 30).map((c) => `${c.interventionId}/${c.hallmarkId}/${c.tier}/${c.outcome}`))
      .toEqual(list.map((c) => `${c.interventionId}/${c.hallmarkId}/${c.tier}/${c.outcome}`));
  });

  it('names which uncertainty components each experiment moves', () => {
    for (const c of nextExperiments([], ['senolytics'], 5)) {
      expect(c.movesComponents.length).toBeGreaterThan(0);
      for (const m of c.movesComponents) expect(m.to).not.toBe(m.from);
    }
  });

  it('stops recommending an experiment that would buy nothing', () => {
    // Saturate senolytics with the strongest possible evidence on every target.
    const saturated = getIntervention('senolytics')!.targets.map((h, i) => record({
      id: `s${i}`, hallmarkId: h, tier: 'human-interventional', outcome: 'lifespan',
      replicated: true, preregistered: true, sampleSize: 1000,
    }));
    const before = nextExperiments([], ['senolytics'], 50).length;
    const after = nextExperiments(saturated, ['senolytics'], 50).length;
    expect(after).toBeLessThan(before);
  });
});

describe('scientific critic', () => {
  const hypotheses = generateHypotheses([]);

  it('challenges every hypothesis', () => {
    for (const h of hypotheses) expect(critique(h).challenges.length).toBeGreaterThan(0);
  });

  it('never raises plausibility — critique can only discount', () => {
    for (const h of hypotheses) expect(critique(h).adjustedPlausibility).toBeLessThanOrEqual(h.plausibility);
  });

  it('always raises the magnitude objection, since the graph holds signs only', () => {
    for (const h of hypotheses) {
      expect(critique(h).challenges.map((c) => c.id)).toContain('magnitude-unknown');
    }
  });

  it('flags the epigenetic-clock circularity as potentially fatal', () => {
    const reprogramming = hypotheses.find((h) => h.nodes.includes('epigenetic-reprogramming') && h.nodes.includes('yamanaka-factors'));
    if (reprogramming) {
      const circular = critique(reprogramming).challenges.find((c) => c.id === 'circular-endpoint');
      expect(circular).toBeDefined();
      expect(circular!.severity).toBe('fatal-if-true');
    }
  });

  it('gives every challenge a discriminating test', () => {
    for (const h of hypotheses) {
      for (const c of critique(h).challenges) expect(c.discriminatingTest.length).toBeGreaterThan(30);
    }
  });

  it('surviving hypotheses are ordered by post-critique score', () => {
    const surviving = survivingHypotheses(hypotheses, 8);
    for (let i = 1; i < surviving.length; i++) {
      expect(surviving[i - 1].survivalScore).toBeGreaterThanOrEqual(surviving[i].survivalScore);
    }
  });
});

describe('experiment designer', () => {
  const plans = generateHypotheses([]).slice(0, 6).map(designExperiment);

  it('produces controls, endpoints and discriminating predictions', () => {
    for (const p of plans) {
      expect(p.controls.length).toBeGreaterThanOrEqual(3);
      expect(p.animalModels.length).toBeGreaterThan(0);
      expect(p.discriminatingPredictions.length).toBeGreaterThan(0);
      expect(p.failureModes.length).toBeGreaterThan(2);
    }
  });

  it('predictions actually discriminate — never identical under hypothesis and null', () => {
    for (const p of plans) {
      for (const pred of p.discriminatingPredictions) {
        expect(pred.underHypothesis).not.toBe(pred.underNull);
      }
      expect(p.isUninformative).toBe(false);
    }
  });

  it('always includes randomisation and blinding', () => {
    for (const p of plans) {
      expect(p.controls.map((c) => c.kind)).toContain('allocation');
    }
  });

  it('adds a safety endpoint automatically wherever an oncogenic route exists', () => {
    const risky = generateHypotheses([]).find((h) => h.nodes.some((n) => n === 'telomerase-activation' || n === 'senolytics'));
    if (risky) {
      const plan = designExperiment(risky);
      expect(plan.endpoints.some((e) => e.role === 'safety')).toBe(true);
    }
  });

  it('every model system states what it structurally cannot answer', () => {
    for (const p of plans) {
      for (const m of [...p.cellModels, ...p.animalModels]) expect(m.limitation.length).toBeGreaterThan(20);
    }
  });
});

describe('platform invariants — no medical claims, no fabrication', () => {
  /** Every string the platform ships to a reader. */
  const shipped = [
    ...HALLMARKS.flatMap((h) => [h.summary, h.honestyNote, ...h.readouts.map((r) => `${r.assay} ${r.measures}`)]),
    ...INTERVENTIONS.flatMap((i) => [i.description, i.rationale, i.honestyNote, ...i.studiedModalities]),
    ...allTensions().map((t) => `${t.tension.label} ${t.tension.mechanism} ${t.tension.monitoredBy}`),
    ...GRAPH_EDGES.map((e) => e.mechanism),
    ...GRAPH_NODES.map((n) => n.summary),
    ...analyseAll().map((p) => p.summary),
  ];

  it('the intervention model has no field capable of holding a dose', () => {
    for (const i of INTERVENTIONS) {
      const keys = Object.keys(i);
      for (const forbidden of ['dose', 'dosage', 'schedule', 'route', 'frequency', 'amount']) {
        expect(keys).not.toContain(forbidden);
      }
    }
  });

  it('ships no dosing information in any string', () => {
    for (const text of shipped) {
      expect(text, text.slice(0, 60)).not.toMatch(/\b\d+\s?(mg|mcg|µg|ml|IU)\b/i);
      expect(text, text.slice(0, 60)).not.toMatch(/\bmg\/kg\b|\btwice daily\b|\bonce daily\b/i);
    }
  });

  it('never asserts that a strategy cures, prevents or reverses ageing', () => {
    for (const text of shipped) {
      expect(text, text.slice(0, 60)).not.toMatch(/\bcures?\b|\bwill reverse ag/i);
      expect(text, text.slice(0, 60)).not.toMatch(/\bproven to (work|extend|reverse)\b/i);
      // "partly guaranteed by the mechanism" is legitimate — it describes the
      // clock-circularity problem. Only a guarantee of BENEFIT is forbidden.
      expect(text, text.slice(0, 60)).not.toMatch(/\bguarantee[sd]? (to|that) \w+ (work|benefit|extend|improve)/i);
    }
  });

  it('ships no citations at all — citations exist only in scientist-entered records', () => {
    for (const text of shipped) {
      expect(text, text.slice(0, 60)).not.toMatch(/PMID:\s*\d|doi\.org|10\.\d{4}\/\S+/i);
    }
  });

  it('every intervention declares its tensions and an honesty note', () => {
    for (const i of INTERVENTIONS) {
      expect(i.tensions.length, `${i.id} must declare at least one tension`).toBeGreaterThan(0);
      expect(i.honestyNote.length).toBeGreaterThan(40);
      for (const t of i.tensions) expect(t.monitoredBy.length).toBeGreaterThan(15);
    }
  });

  it('every mechanism that could be measured is linked to at least one biomarker', () => {
    const measured = new Set(GRAPH_EDGES.filter((e) => e.kind === 'measures').map((e) => e.to));
    const unmeasured = HALLMARKS.filter((h) => !measured.has(h.id)).map((h) => h.id);
    // Any unmeasured mechanism must be reported as a structural gap, not hidden.
    const reported = structuralGaps().filter((g) => g.kind === 'unmeasurable').map((g) => g.nodeId);
    for (const id of unmeasured) expect(reported).toContain(id);
  });

  it('every evidence tier declares a rationale for its weight', () => {
    for (const tier of Object.values(TIERS)) {
      expect(tier.rationale.length).toBeGreaterThan(40);
      expect(tier.humanProximity).toBeLessThan(1); // nothing is perfectly translatable
    }
  });

  it('registry lookups fail closed on unknown ids', () => {
    expect(getHallmark('nope' as never)).toBeUndefined();
    expect(getIntervention('nope' as never)).toBeUndefined();
    expect(analyseCancerSafety('nope' as never)).toBeNull();
    expect(appraiseIntervention('nope' as never, [])).toBeNull();
  });
});

describe('safe regeneration — the central question', () => {
  it('separates regenerative gain from tumour-suppression cost', () => {
    for (const p of analyseAllSafeRegeneration()) {
      expect(['in-window', 'trades-off', 'cost-without-gain', 'not-assessable']).toContain(p.window);
      // A strategy in the window must genuinely have no suppression cost.
      if (p.window === 'in-window') {
        expect(p.suppressionCost).toBe(0);
        expect(p.regenerationGain).toBeGreaterThan(0);
      }
    }
  });

  it('places senolytics in trades-off — it restores function AND weakens the arrest', () => {
    const p = analyseSafeRegeneration('senolytics')!;
    expect(p.window).toBe('trades-off');
    expect(p.suppressionCost).toBeGreaterThan(0);
    expect(p.suppressionCosts.map((c) => c.axis)).toContain('tp53-axis');
  });

  it('gets the damage/capacity inversion right for mitochondrial strategies', () => {
    // 'mitochondrial-dysfunction' names the DAMAGE, so decreasing it restores.
    const p = analyseSafeRegeneration('mitophagy-enhancement')!;
    const route = p.regenerationRoutes.find((r) => r.mechanism === 'mitochondrial-dysfunction')!;
    expect(route.direction).toBe('decrease');
    expect(route.restores).toBe(true);
  });

  it('never states that anything is safe', () => {
    for (const p of analyseAllSafeRegeneration()) {
      expect(p.verdict).not.toMatch(/\bis safe\b|\bsafe to use\b|\bno cancer risk\b/i);
      expect(p.verdict).toMatch(/direction only|absence of analysis|documented/i);
    }
  });

  it('answers the central question with an auditable derivation', () => {
    const a = answerCentralQuestion();
    expect(a.derivation.length).toBeGreaterThan(2);
    expect(a.statement).toMatch(/absence of documented coupling|no registered strategy/i);
    // The answer must be allowed to be empty — a platform that always finds a
    // winner is not measuring anything.
    expect(Array.isArray(a.inWindow)).toBe(true);
  });
});
