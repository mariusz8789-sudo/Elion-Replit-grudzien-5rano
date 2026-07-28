import {
  openTriads, structuralGaps, interactionMatrix, feedbackLoops, netInfluence, explainPath, hubRanking,
  type OpenTriad,
} from './inference';
import { getNode, nodesOfKind, type GraphNodeId } from './knowledgeGraph';
import { offsettingPairs } from './cancerSafety';
import { INTERVENTIONS, getIntervention, type InterventionId } from './interventions';
import { appraiseIntervention } from './appraisal';
import { TIERS, OUTCOMES, type EvidenceRecord, type EvidenceTier, type OutcomeType } from './evidence';
import type { HallmarkId } from './hallmarks';

/**
 * Longevity Discovery Platform — Discovery Engine.
 *
 * The platform's thesis in one sentence: Genesis never claims a therapy works.
 * It answers a different question, one that is both honestly computable and
 * actually valuable — WHAT IS THE NEXT EXPERIMENT WORTH DOING?
 *
 * That question is decision-theoretic, not biological. It asks how much of what
 * we do not know a given experiment would remove, and at what cost. Both terms
 * are computable from the evidence graph without predicting any biological
 * outcome. Nothing here forecasts a result; it forecasts how much UNCERTAINTY a
 * result would retire, which is a fact about the literature, not about cells.
 *
 * Hypotheses are generated STRUCTURALLY — by finding shapes in a curated
 * mechanism graph (open triads, offsetting safety profiles, unbridged strong
 * couplings), the literature-based-discovery approach applied to curated edges
 * rather than to raw text. The engine therefore cannot invent a relationship no
 * curator asserted, and every hypothesis ships with the exact edge chain that
 * produced it. A reader who disagrees can point at the edge.
 *
 * NO CITATION IS EVER GENERATED HERE. Citations exist only inside EvidenceRecords
 * entered by a scientist. A hypothesis lists what evidence is MISSING; it never
 * manufactures a reference to support itself.
 */

export type HypothesisKind =
  /** A→B and B→C are documented but A→C is not. */
  | 'indirect-path'
  /** Two strategies whose oncogenic liabilities cancel on the same axis. */
  | 'safety-offset'
  /** Strongly interacting mechanisms with no intervention addressing the pair. */
  | 'unaddressed-coupling'
  /** A self-reinforcing loop that an intervention could break. */
  | 'loop-interruption'
  /** Documented paths disagree in sign — something moderates the outcome. */
  | 'conflict-resolution'
  /** A mechanism with no way to measure it. */
  | 'missing-measurement';

export interface Hypothesis {
  id: string;
  kind: HypothesisKind;
  /** The testable statement, phrased as a proposition — never as a finding. */
  statement: string;
  /** Ordered biological reasoning, one line per graph edge traversed. */
  reasoning: string[];
  /** Nodes the hypothesis concerns, for graph highlighting. */
  nodes: GraphNodeId[];
  /**
   * 0–100. Derived from the honesty of the edges the reasoning rests on and the
   * length of the chain. It is confidence in the ARGUMENT, not in the outcome.
   */
  plausibility: number;
  /**
   * 0–100. How little the implied relationship is already covered by evidence
   * records. High novelty with high plausibility is the interesting quadrant;
   * high novelty alone usually just means nobody thought it worth testing.
   */
  novelty: number;
  /** Exactly what would have to be measured. Never a citation. */
  missingEvidence: string[];
  /** Why this might be wrong — populated by the critic (critic.ts). */
  challenges: string[];
}

function labelOf(id: GraphNodeId): string {
  return getNode(id)?.label ?? String(id);
}

/** Causal degree of a node — how far a result about it would propagate. */
function centralityOf(id: GraphNodeId): number {
  return hubRanking().find((h) => h.id === id)?.total ?? 0;
}

/** Does any record already speak to this pair of nodes? Drives the novelty term. */
function evidenceTouching(records: EvidenceRecord[], nodes: GraphNodeId[]): EvidenceRecord[] {
  const set = new Set(nodes.map(String));
  return records.filter((r) => set.has(r.hallmarkId) || set.has(r.interventionId));
}

function noveltyFrom(records: EvidenceRecord[], nodes: GraphNodeId[]): number {
  const touching = evidenceTouching(records, nodes);
  if (touching.length === 0) return 95;
  // Each existing record erodes novelty, with diminishing effect; a well-studied
  // pair converges toward "already known" rather than to exactly zero.
  return Math.max(5, Math.round(95 * Math.exp(-touching.length / 3)));
}

/* --------------------- structural hypothesis generation --------------------- */

function fromOpenTriads(triads: OpenTriad[], records: EvidenceRecord[]): Hypothesis[] {
  return triads.map((t, i) => {
    const [ab, bc] = t.via;
    const verb = t.impliedEffect === 'promotes' ? 'increases' : 'reduces';
    const nodes = [t.a, t.b, t.c];
    return {
      id: `hyp-triad-${i}`,
      kind: 'indirect-path' as const,
      statement: `Modulating ${labelOf(t.a)} ${verb} ${labelOf(t.c)}, mediated by ${labelOf(t.b)} — a relationship the graph implies but does not document directly.`,
      reasoning: [
        `${labelOf(ab.from)} ${ab.effect === 'promotes' ? 'drives' : 'opposes'} ${labelOf(ab.to)} — ${ab.mechanism}`,
        `${labelOf(bc.from)} ${bc.effect === 'promotes' ? 'drives' : 'opposes'} ${labelOf(bc.to)} — ${bc.mechanism}`,
        `Composing the signs, the net implied effect of ${labelOf(t.a)} on ${labelOf(t.c)} is "${t.impliedEffect}".`,
        `No direct ${labelOf(t.a)} → ${labelOf(t.c)} edge is documented, so this composition is untested rather than established.`,
      ],
      nodes,
      plausibility: Math.round(t.confidence * 100 * 0.85), // two-hop composition is weaker than either link
      novelty: noveltyFrom(records, nodes),
      missingEvidence: [
        `A study perturbing ${labelOf(t.a)} and measuring ${labelOf(t.c)} directly, with ${labelOf(t.b)} measured as the proposed mediator.`,
        `A mediation control: blocking ${labelOf(t.b)} should abolish the effect if the proposed route is the real one.`,
      ],
      challenges: [],
    };
  });
}

function fromSafetyOffsets(records: EvidenceRecord[]): Hypothesis[] {
  return offsettingPairs().slice(0, 8).map((p, i) => {
    const axes = [...new Set(p.offsetAxes.map((o) => labelOf(o.axis)))];
    const nodes: GraphNodeId[] = [p.a, p.b, ...p.offsetAxes.map((o) => o.axis)];
    return {
      id: `hyp-offset-${i}`,
      kind: 'safety-offset' as const,
      statement: `Combining ${labelOf(p.a)} with ${labelOf(p.b)} offsets oncogenic liability on ${axes.join(' and ')}, because each strategy pushes that axis in the opposite direction.`,
      reasoning: [
        ...p.offsetAxes.map((o) => `${labelOf(o.raisedBy)} raises risk on ${labelOf(o.axis)}, while ${labelOf(o.loweredBy)} lowers it — the same axis, opposite directions.`),
        'If the two effects act on the same axis with comparable magnitude, the combination would carry less oncogenic liability than the riskier strategy alone.',
        'MAGNITUDE IS NOT ENCODED IN THIS GRAPH. Offsetting directions do not guarantee offsetting sizes, and this is the hypothesis’s central weakness.',
      ],
      nodes,
      plausibility: 45, // direction-only reasoning; deliberately capped well below single-mechanism claims
      novelty: noveltyFrom(records, [p.a, p.b]),
      missingEvidence: [
        `A factorial design (neither / ${labelOf(p.a)} / ${labelOf(p.b)} / both) with an oncogenic endpoint, not a surrogate.`,
        `Quantitative measurement of each strategy's effect size on ${axes.join(' and ')} separately, since offsetting requires comparable magnitudes.`,
        'Long-term tumour incidence — the endpoint that would actually settle it, and the one short studies cannot reach.',
      ],
      challenges: [],
    };
  });
}

function fromUnaddressedCouplings(records: EvidenceRecord[]): Hypothesis[] {
  const strong = interactionMatrix(3).filter((m) => m.coupling > 0.4).slice(0, 10);
  const out: Hypothesis[] = [];
  for (const [i, m] of strong.entries()) {
    const targeting = INTERVENTIONS.filter((iv) => iv.targets.includes(m.a) && iv.targets.includes(m.b));
    if (targeting.length > 0) continue; // already addressed as a pair
    const nodes: GraphNodeId[] = [m.a, m.b];
    out.push({
      id: `hyp-coupling-${i}`,
      kind: 'unaddressed-coupling',
      statement: `${labelOf(m.a)} and ${labelOf(m.b)} are strongly coupled (${m.pathCount} documented route(s), shortest ${m.shortestHops} hop(s)), yet no registered strategy targets both. A dual-targeting intervention would address the pair rather than one side of it.`,
      reasoning: [
        `The graph documents ${m.pathCount} causal route(s) between these mechanisms${m.bidirectional ? ', in both directions' : ''}.`,
        m.conflicting
          ? 'Those routes disagree in sign, so the coupling is not a simple one-way dependency — which is itself a reason to intervene on both ends rather than either.'
          : 'The routes agree in sign, so intervening on one mechanism should propagate to the other.',
        'No intervention in the registry lists both as targets, so the coupling is currently addressed only indirectly.',
      ],
      nodes,
      plausibility: Math.round(Math.min(1, m.coupling) * 70),
      novelty: noveltyFrom(records, nodes),
      missingEvidence: [
        `Evidence that perturbing ${labelOf(m.a)} alone changes ${labelOf(m.b)} by a useful amount — if it does, dual targeting may be unnecessary.`,
        'A comparison of single- versus dual-targeting in the same model system.',
      ],
      challenges: [],
    });
  }
  return out;
}

function fromFeedbackLoops(records: EvidenceRecord[]): Hypothesis[] {
  return feedbackLoops(3)
    .filter((l) => l.kind === 'amplifying')
    .slice(0, 5)
    .map((l, i) => {
      const names = l.nodes.map(labelOf);
      return {
        id: `hyp-loop-${i}`,
        kind: 'loop-interruption' as const,
        statement: `The amplifying loop ${names.join(' → ')} → ${names[0]} is self-reinforcing, so interrupting any single edge should reduce the whole loop's output disproportionately to the size of the intervention.`,
        reasoning: [
          ...l.edges.map((e) => `${labelOf(e.from)} ${e.effect === 'promotes' ? 'drives' : 'opposes'} ${labelOf(e.to)} — ${e.mechanism}`),
          'The cycle contains an even number of counteracting edges, so its net sign is positive: perturbations are amplified rather than damped.',
          'In an amplifying loop, effect size at any single edge is multiplied around the cycle — which predicts non-linear response to a modest intervention.',
        ],
        nodes: l.nodes,
        plausibility: Math.round(l.confidence * 100 * 0.8),
        novelty: noveltyFrom(records, l.nodes),
        missingEvidence: [
          'A dose–response series at one edge, testing whether the loop output responds non-linearly as the loop model predicts.',
          'Time-course measurement — an amplifying loop predicts a characteristic delay and overshoot that a single endpoint cannot detect.',
        ],
        challenges: [],
      };
    });
}

function fromConflicts(records: EvidenceRecord[]): Hypothesis[] {
  const out: Hypothesis[] = [];
  const pairs = new Set<string>();
  // Conflicts are a property of the MECHANISM graph, not of intervention→target
  // edges: a `targets` edge records intent and carries no sign, so asking it for a
  // net influence can only ever return "no known path". The meaningful question is
  // which pairs of mechanisms the literature couples in both directions at once.
  const mechanisms = nodesOfKind('hallmark').map((n) => n.id as HallmarkId);
  for (const from of mechanisms) {
    for (const to of mechanisms) {
      if (from === to) continue;
      const verdict = netInfluence(from, to, 3);
      if (verdict.verdict !== 'conflicting') continue;
      const key = `${from}->${to}`;
      if (pairs.has(key)) continue;
      pairs.add(key);
      const nodes: GraphNodeId[] = [from, to];
      out.push({
        id: `hyp-conflict-${pairs.size}`,
        kind: 'conflict-resolution',
        statement: `The graph contains routes by which ${labelOf(from)} both promotes and counteracts ${labelOf(to)}. A moderating variable — cell type, timing, exposure regime or baseline damage burden — determines which route dominates.`,
        reasoning: [
          ...(verdict.promotingPaths[0] ? ['Promoting route:', ...explainPath(verdict.promotingPaths[0])] : []),
          ...(verdict.counteractingPaths[0] ? ['Counteracting route:', ...explainPath(verdict.counteractingPaths[0])] : []),
          'Both routes are documented, so the disagreement is structural rather than an error in one of them.',
          'A single net answer cannot be derived from the graph; identifying what selects between the routes is the actual open question.',
        ],
        nodes,
        plausibility: Math.round(verdict.confidence * 100 * 0.75),
        novelty: noveltyFrom(records, nodes),
        missingEvidence: [
          'The same perturbation applied across contexts (cell type, age, damage burden) with the outcome measured identically in each.',
          'Measurement of BOTH routes in the same experiment, rather than one route per paper — which is how the contradiction persists.',
        ],
        challenges: [],
      });
    }
  }
  return out;
}

function fromMissingMeasurement(records: EvidenceRecord[]): Hypothesis[] {
  return structuralGaps()
    .filter((g) => g.kind === 'unmeasurable')
    .map((g, i) => ({
      id: `hyp-measure-${i}`,
      kind: 'missing-measurement' as const,
      statement: `${g.label} has no biomarker in the graph, so no intervention against it can currently be evaluated in a living subject. Developing a validated readout is a prerequisite for any trial that targets it.`,
      reasoning: [
        `No node of kind "biomarker" has a documented "measures" edge to ${g.label}.`,
        'Without a readout, an intervention aimed at this mechanism can only be assessed through downstream proxies, which cannot distinguish target engagement from indirect effects.',
        'This is a gap in the field, not in any single study.',
      ],
      nodes: [g.nodeId],
      plausibility: 90, // a structural absence is a fact about the graph, not an inference
      novelty: noveltyFrom(records, [g.nodeId]),
      missingEvidence: [
        `An assay that tracks ${g.label} in a living subject, with test–retest reliability established.`,
        'Demonstration that the assay responds to a known perturbation of the mechanism — analytical validation before use as an endpoint.',
      ],
      challenges: [],
    }));
}

/**
 * Generate the full hypothesis set. Deterministic: same graph plus same records
 * always yields the same hypotheses in the same order, so a result can be cited
 * and re-derived by anyone holding the same inputs.
 */
export function generateHypotheses(records: EvidenceRecord[] = []): Hypothesis[] {
  const all = [
    ...fromOpenTriads(openTriads(), records),
    ...fromSafetyOffsets(records),
    ...fromUnaddressedCouplings(records),
    ...fromFeedbackLoops(records),
    ...fromConflicts(records),
    ...fromMissingMeasurement(records),
  ];
  // Rank by the product of plausibility and novelty: a plausible but well-known
  // statement is not a discovery, and a novel but implausible one is not a lead.
  return all.sort((a, b) => (b.plausibility * b.novelty) - (a.plausibility * a.novelty));
}

/** Plausibility × novelty, normalised — the "worth pursuing" quadrant score. */
export function discoveryScore(h: Hypothesis): number {
  return Math.round((h.plausibility * h.novelty) / 100);
}

/* ------------------------- value of information ------------------------- */

/**
 * Relative effort to run a study in each system. These are ORDER-OF-MAGNITUDE
 * PLANNING BANDS for prioritisation arithmetic, not costs, durations or prices.
 * They are stated openly so a lab with different economics can substitute its own.
 */
/**
 * Which endpoints a given system can physically deliver.
 *
 * This constraint is not a preference — it is a fact about what an experiment can
 * measure. A dish of human fibroblasts has no lifespan and no healthspan; it has
 * replicative capacity, which is a cell-level biomarker, not organismal survival.
 * Without this table the value-of-information engine cheerfully proposes
 * "measure lifespan in vitro", which is the kind of output that ends a
 * conversation with a researcher in the first minute.
 */
export const FEASIBLE_OUTCOMES: Record<EvidenceTier, OutcomeType[]> = {
  'in-silico': ['target-engagement'],
  'in-vitro-nonhuman': ['biomarker', 'target-engagement'],
  'in-vitro-human': ['biomarker', 'target-engagement'],
  invertebrate: ['lifespan', 'healthspan', 'biomarker', 'target-engagement'],
  rodent: ['lifespan', 'healthspan', 'biomarker', 'target-engagement'],
  'non-human-primate': ['lifespan', 'healthspan', 'biomarker', 'target-engagement'],
  'human-observational': ['lifespan', 'healthspan', 'biomarker'],
  'human-interventional': ['lifespan', 'healthspan', 'biomarker', 'target-engagement'],
};

export function isFeasible(tier: EvidenceTier, outcome: OutcomeType): boolean {
  return FEASIBLE_OUTCOMES[tier].includes(outcome);
}

export const TIER_EFFORT: Record<EvidenceTier, number> = {
  'in-silico': 1,
  'in-vitro-nonhuman': 2,
  'in-vitro-human': 3,
  invertebrate: 4,
  rodent: 12,
  'non-human-primate': 45,
  'human-observational': 18,
  'human-interventional': 60,
};

export interface ExperimentCandidate {
  interventionId: InterventionId;
  interventionLabel: string;
  hallmarkId: HallmarkId;
  hallmarkLabel: string;
  tier: EvidenceTier;
  tierLabel: string;
  outcome: OutcomeType;
  outcomeLabel: string;
  /** Uncertainty before, 0–100. */
  uncertaintyBefore: number;
  /** Uncertainty after this study is added, 0–100. */
  uncertaintyAfter: number;
  /** Points of uncertainty this study would retire. */
  uncertaintyReduction: number;
  effort: number;
  /** Uncertainty reduction per unit effort — the ranking quantity. */
  valuePerEffort: number;
  /**
   * Causal degree of the mechanism under test. Breaks ties in value-per-effort:
   * with no evidence on file many candidates score identically, and a result on a
   * well-connected mechanism propagates further through the graph than one on a
   * leaf. This orders equally-informative experiments; it never overrides value.
   */
  centrality: number;
  /** Which uncertainty components move, and by how much. */
  movesComponents: { factor: string; from: number; to: number }[];
  /** Why this experiment, in plain language. */
  justification: string;
}

/**
 * A hypothetical study with realistic, unexceptional quality — the point is to
 * ask "what would ONE more competent study buy us?", not to model a perfect one.
 * Not replicated, because a new study never is.
 */
function hypotheticalRecord(interventionId: InterventionId, hallmarkId: HallmarkId, tier: EvidenceTier, outcome: OutcomeType): EvidenceRecord {
  return {
    id: '__hypothetical__', interventionId, hallmarkId, tier, outcome,
    direction: 'beneficial',
    citation: 'HYPOTHETICAL — not a real study, used only for value-of-information arithmetic',
    system: 'hypothetical', replicated: false, randomised: true, blinded: true,
    preregistered: true, sampleSize: 50, readoutKind: 'direct', addedAt: 0,
  };
}

/**
 * Rank the experiments that would most reduce uncertainty per unit of effort.
 *
 * This is the platform's headline answer. It is computed by simulating the
 * addition of each candidate study to the record set and re-running the appraisal
 * — so the ranking is a statement about the RUBRIC and the current evidence
 * coverage, both fully visible, and never a prediction about what the study
 * would find. A null result retires the same coverage uncertainty as a positive
 * one, which is precisely why the recommendation is honest.
 */
export function nextExperiments(
  records: EvidenceRecord[],
  interventionIds: InterventionId[] = INTERVENTIONS.map((i) => i.id),
  limit = 15,
): ExperimentCandidate[] {
  const tiers: EvidenceTier[] = ['in-vitro-human', 'invertebrate', 'rodent', 'non-human-primate', 'human-observational', 'human-interventional'];
  const outcomes: OutcomeType[] = ['lifespan', 'healthspan', 'biomarker'];
  const candidates: ExperimentCandidate[] = [];

  for (const interventionId of interventionIds) {
    const intervention = getIntervention(interventionId);
    const before = appraiseIntervention(interventionId, records);
    if (!intervention || !before) continue;

    for (const hallmarkId of intervention.targets) {
      for (const tier of tiers) {
        for (const outcome of outcomes) {
          // A system that cannot deliver the endpoint is not a candidate experiment.
          if (!isFeasible(tier, outcome)) continue;
          const simulated = [...records, hypotheticalRecord(interventionId, hallmarkId, tier, outcome)];
          const after = appraiseIntervention(interventionId, simulated);
          if (!after) continue;

          const reduction = before.uncertainty - after.uncertainty;
          if (reduction <= 0) continue; // buys nothing the platform can see

          const effort = TIER_EFFORT[tier];
          const moves = before.uncertaintyComponents
            .map((c, idx) => ({ factor: c.factor, from: Math.round(c.coverage * 100), to: Math.round((after.uncertaintyComponents[idx]?.coverage ?? c.coverage) * 100) }))
            .filter((m) => m.to !== m.from);

          candidates.push({
            interventionId, interventionLabel: intervention.label,
            hallmarkId, hallmarkLabel: getNode(hallmarkId)?.label ?? hallmarkId,
            tier, tierLabel: TIERS[tier].label,
            outcome, outcomeLabel: OUTCOMES[outcome].label,
            centrality: centralityOf(hallmarkId),
            uncertaintyBefore: before.uncertainty,
            uncertaintyAfter: after.uncertainty,
            uncertaintyReduction: reduction,
            effort,
            valuePerEffort: Number((reduction / effort).toFixed(3)),
            movesComponents: moves,
            justification: `Measuring ${OUTCOMES[outcome].label.toLowerCase()} for ${intervention.label} against ${getNode(hallmarkId)?.label ?? hallmarkId} in ${TIERS[tier].label.toLowerCase()} would retire ${reduction} points of uncertainty${moves.length ? ` by improving ${moves.map((m) => m.factor.toLowerCase()).join(' and ')}` : ''}. Effort band ${effort}. This holds whether the result is positive or null.`,
          });
        }
      }
    }
  }

  return candidates
    .sort((a, b) =>
      b.valuePerEffort - a.valuePerEffort
      || b.uncertaintyReduction - a.uncertaintyReduction
      || b.centrality - a.centrality
      || a.interventionId.localeCompare(b.interventionId) // final tie-break keeps the order deterministic
      || a.hallmarkId.localeCompare(b.hallmarkId))
    .slice(0, limit);
}

/** The single highest-value next experiment across everything the platform holds. */
export function recommendNextExperiment(records: EvidenceRecord[]): ExperimentCandidate | null {
  return nextExperiments(records, undefined, 1)[0] ?? null;
}

/**
 * The efficiency frontier: experiments not dominated by any other, where
 * "dominated" means another candidate retires at least as much uncertainty for
 * strictly less effort.
 *
 * WHY THIS EXISTS. Ranking purely by value-per-effort has a degenerate answer
 * when the evidence base is empty: the cheapest system always wins, because every
 * strategy starts at maximum uncertainty and one cheap study moves the same
 * components for all of them. That answer — "run the cheap in-vitro screen first"
 * — is correct decision theory and nearly useless as planning input. The frontier
 * shows the whole trade-off instead: the cheapest informative study at one end,
 * the most informative study at any price at the other, and nothing dominated in
 * between. A lab picks its own point on that curve.
 */
export function experimentFrontier(records: EvidenceRecord[], interventionIds?: InterventionId[]): ExperimentCandidate[] {
  const all = nextExperiments(records, interventionIds, 4000);
  const frontier = all.filter((c) => !all.some((other) =>
    other !== c
    && other.effort <= c.effort
    && other.uncertaintyReduction >= c.uncertaintyReduction
    && (other.effort < c.effort || other.uncertaintyReduction > c.uncertaintyReduction)));

  // Collapse candidates that sit at the same (effort, reduction) point, keeping the
  // most central mechanism — otherwise the frontier is padded with equivalent ties.
  const best = new Map<string, ExperimentCandidate>();
  for (const c of frontier) {
    const key = `${c.effort}|${c.uncertaintyReduction}`;
    const cur = best.get(key);
    if (!cur || c.centrality > cur.centrality) best.set(key, c);
  }
  return [...best.values()].sort((a, b) => a.effort - b.effort);
}

/**
 * How many candidates share the top score. A large number means the ranking is
 * degenerate and the choice should be made on grounds the platform cannot see —
 * stated openly rather than hidden behind an arbitrary winner.
 */
export function rankingDegeneracy(records: EvidenceRecord[]): { topValue: number; tiedCandidates: number; isDegenerate: boolean } {
  const all = nextExperiments(records, undefined, 4000);
  if (all.length === 0) return { topValue: 0, tiedCandidates: 0, isDegenerate: false };
  const topValue = all[0].valuePerEffort;
  const tied = all.filter((c) => c.valuePerEffort === topValue).length;
  return { topValue, tiedCandidates: tied, isDegenerate: tied > 3 };
}
