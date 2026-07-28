import {
  signedPaths, netInfluence, explainPath, interactionMatrix, structuralGaps, hubRanking,
  type SignedPath,
} from './inference.ts';
import { getNode, nodesOfKind, type GraphNodeId, type GraphEdge } from './knowledgeGraph.ts';
import { analyseCancerSafety, oncogenicLoadRanking } from './cancerSafety.ts';
import { INTERVENTIONS, type InterventionId } from './interventions.ts';
import { appraiseAll, evidenceTranslationGap } from './appraisal.ts';
import { generateHypotheses, nextExperiments, experimentFrontier, rankingDegeneracy } from './discovery.ts';
import { survivingHypotheses } from './critic.ts';
import type { EvidenceRecord } from './evidence.ts';
import type { HallmarkId } from './hallmarks.ts';

/**
 * Longevity Discovery Platform — Discovery Workspace query layer.
 *
 * The questions a researcher actually asks, answered as STRUCTURED QUERIES over
 * the reasoning engines rather than as free text.
 *
 * WHY NOT NATURAL LANGUAGE. A text box that accepts anything and answers in prose
 * is a chatbot: it cannot tell the user what it is unable to answer, and it fails
 * by producing fluent output instead of an error. A typed query surface states
 * exactly what can be asked, returns a typed answer, and carries the derivation
 * with it. When a question has no answer in the graph, it says so — which a
 * generative interface structurally cannot do.
 *
 * Every answer carries `derivation`: the ordered reasoning steps, each traceable
 * to a graph edge or a scored evidence record. Nothing is summarised into an
 * opinion.
 */

export type QueryKind =
  | 'influences-without-cancer-risk'
  | 'all-paths-between'
  | 'strongest-evidence-weakest-translation'
  | 'highest-value-experiments'
  | 'strongest-interactions'
  | 'safety-profile'
  | 'hypotheses-about'
  | 'research-gaps';

export interface QueryAnswer<T = unknown> {
  kind: QueryKind;
  /** The question restated precisely as the engine understood it. */
  question: string;
  /** Typed payload — shape depends on the query. */
  results: T[];
  /** Ordered reasoning, one line per inferential step. */
  derivation: string[];
  /** What this answer cannot tell you. Always populated. */
  limitations: string[];
  /** True when the engine has nothing to say — never dressed up as an answer. */
  empty: boolean;
}

const label = (id: GraphNodeId): string => getNode(id)?.label ?? String(id);

/**
 * "What mechanisms influence X without increasing cancer risk?"
 *
 * Walks every mechanism that reaches X, then checks each against the oncogenic
 * axes via the strategies that target it. A mechanism is only returned when NO
 * strategy addressing it has a documented risk-increasing route — a conservative
 * filter, because absence of a documented route is not evidence of safety and
 * the limitations say so.
 */
export function influencesWithoutCancerRisk(target: HallmarkId): QueryAnswer<{
  mechanism: HallmarkId; label: string; net: 'promotes' | 'counteracts'; hops: number;
  viaStrategies: InterventionId[]; derivation: string[];
}> {
  const derivation: string[] = [];
  const mechanisms = nodesOfKind('hallmark').map((n) => n.id as HallmarkId).filter((m) => m !== target);
  derivation.push(`Considering all ${mechanisms.length} other mechanisms as possible influences on ${label(target)}.`);

  const riskyMechanisms = new Set<HallmarkId>();
  for (const iv of INTERVENTIONS) {
    const safety = analyseCancerSafety(iv.id);
    if (!safety) continue;
    for (const risk of safety.risks) riskyMechanisms.add(risk.viaHallmark);
  }
  derivation.push(`${riskyMechanisms.size} mechanism(s) carry at least one documented route by which modulating them raises cancer risk: ${[...riskyMechanisms].map(label).join(', ')}.`);

  const results = mechanisms
    .map((m) => ({ m, paths: signedPaths(m, target, 3) }))
    .filter((x) => x.paths.length > 0 && !riskyMechanisms.has(x.m))
    .map(({ m, paths }) => {
      const best = paths[0];
      return {
        mechanism: m, label: label(m), net: best.net, hops: best.hops,
        viaStrategies: INTERVENTIONS.filter((iv) => iv.targets.includes(m)).map((iv) => iv.id),
        derivation: explainPath(best),
      };
    })
    .sort((a, b) => a.hops - b.hops);

  derivation.push(`${results.length} mechanism(s) influence ${label(target)} and are not implicated in any documented risk-increasing route.`);

  return {
    kind: 'influences-without-cancer-risk',
    question: `Which mechanisms influence ${label(target)} without a documented route to increased cancer risk?`,
    results, derivation,
    limitations: [
      'A mechanism appears here when NO documented risk route was found. That is an absence of evidence in the graph, not evidence of safety.',
      'Only strategies present in the registry were checked. A mechanism with no strategy targeting it trivially has no documented risk route.',
      'The graph encodes direction, never magnitude — a small protective route and a large harmful one look identical here.',
    ],
    empty: results.length === 0,
  };
}

/** "Show every pathway connecting A to B." Complete enumeration up to a hop limit. */
export function allPathsBetween(from: GraphNodeId, to: GraphNodeId, maxHops = 4): QueryAnswer<{
  net: 'promotes' | 'counteracts'; hops: number; confidence: number; steps: string[]; edges: GraphEdge[];
}> {
  const paths: SignedPath[] = signedPaths(from, to, maxHops);
  const verdict = netInfluence(from, to, maxHops);
  const derivation = [
    `Enumerating every simple causal path from ${label(from)} to ${label(to)} up to ${maxHops} hops.`,
    `Found ${paths.length} path(s): ${verdict.promotingPaths.length} net-promoting, ${verdict.counteractingPaths.length} net-counteracting.`,
    verdict.verdict === 'conflicting'
      ? 'The paths disagree in sign. This is a CONFLICTING MECHANISM: the literature encodes both directions, and no net answer follows from the graph.'
      : verdict.verdict === 'no-known-path'
        ? 'No documented causal route exists between these nodes in the graph.'
        : `All documented paths agree: the net effect is "${verdict.verdict}".`,
  ];

  return {
    kind: 'all-paths-between',
    question: `Every documented pathway connecting ${label(from)} to ${label(to)}.`,
    results: paths.map((p) => ({ net: p.net, hops: p.hops, confidence: p.confidence, steps: explainPath(p), edges: p.edges })),
    derivation,
    limitations: [
      `Only paths of at most ${maxHops} hops were considered; longer routes exist in biology and are not shown.`,
      'Path enumeration reflects what curators have entered. An undocumented route is invisible here, which is not the same as absent in nature.',
      'Signs compose; magnitudes do not. A long chain of weak effects and a short chain of strong ones carry the same sign.',
    ],
    empty: paths.length === 0,
  };
}

/** "Which intervention has the strongest evidence but the weakest human translation?" */
export function strongestEvidenceWeakestTranslation(records: EvidenceRecord[]): QueryAnswer<{
  interventionId: InterventionId; label: string; strength: number; humanRelevance: number; gap: number;
}> {
  const appraisals = appraiseAll(INTERVENTIONS.map((i) => i.id), records);
  const gaps = evidenceTranslationGap(appraisals);
  const derivation = [
    'Grading every evidence record on two independent axes: strength (support for its own conclusion in its own system) and human relevance (transfer of that conclusion to human ageing).',
    'For each strategy, taking the best value achieved on each axis, then ranking by the difference.',
    gaps.length
      ? `Largest gap: ${gaps[0].label}, strength ${gaps[0].strength} against human relevance ${gaps[0].humanRelevance} — convincing in its own system, unestablished for humans.`
      : 'No strategy has any evidence records, so no gap can be computed.',
  ];

  return {
    kind: 'strongest-evidence-weakest-translation',
    question: 'Which strategies are best supported in their own experimental system yet furthest from human relevance?',
    results: gaps, derivation,
    limitations: [
      'Only records entered into this platform are considered. A gap here reflects this database, not the whole literature.',
      'A large gap is not a criticism of the work — it is a statement about which question the work answered.',
    ],
    empty: gaps.length === 0,
  };
}

/** "What experiments would reduce uncertainty the most?" */
export function highestValueExperiments(records: EvidenceRecord[], limit = 10): QueryAnswer<ReturnType<typeof nextExperiments>[number]> {
  const ranked = nextExperiments(records, undefined, limit);
  const frontier = experimentFrontier(records);
  const degeneracy = rankingDegeneracy(records);

  const derivation = [
    'For each feasible combination of strategy, mechanism, experimental system and endpoint, simulating the addition of one competent study and recomputing the appraisal.',
    'Ranking by uncertainty retired per unit of effort. The simulation assumes nothing about what the study would FIND — a null result retires the same coverage uncertainty as a positive one.',
    `${frontier.length} experiment(s) sit on the efficiency frontier, from effort ${frontier[0]?.effort ?? '—'} to ${frontier[frontier.length - 1]?.effort ?? '—'}.`,
  ];
  if (degeneracy.isDegenerate) {
    derivation.push(`WARNING: ${degeneracy.tiedCandidates} candidates tie at the top score. With a sparse evidence base the ranking is degenerate and the choice must be made on grounds this platform cannot see — existing reagents, local expertise, sample access.`);
  }

  return {
    kind: 'highest-value-experiments',
    question: 'Which experiment would retire the most uncertainty per unit of effort?',
    results: ranked, derivation,
    limitations: [
      'Uncertainty here is COVERAGE of the evidence a decision would need — not probability that a strategy works. No such probability is derivable from this platform.',
      'Effort bands are order-of-magnitude planning figures for prioritisation arithmetic, not costs or durations. Substitute your own.',
      'The engine cannot see reagent availability, local expertise, ethics approval or sample access, all of which usually dominate the real decision.',
    ],
    empty: ranked.length === 0,
  };
}

/** "Which hallmarks interact the most strongly?" */
export function strongestInteractions(limit = 10): QueryAnswer<ReturnType<typeof interactionMatrix>[number]> {
  const matrix = interactionMatrix(3).slice(0, limit);
  return {
    kind: 'strongest-interactions',
    question: 'Which ageing mechanisms are most strongly coupled?',
    results: matrix,
    derivation: [
      'For every pair of mechanisms, enumerating causal paths in both directions up to 3 hops.',
      'Coupling = Σ (path confidence ÷ path length): dense, short, well-established routes score highest; a single long theoretical chain scores near zero.',
      `Strongest coupling: ${matrix[0] ? `${label(matrix[0].a)} ↔ ${label(matrix[0].b)}` : 'none'}.`,
      'Pairs flagged "conflicting" have routes that disagree in sign — that is where a modelling assumption is doing hidden work.',
    ],
    limitations: [
      'Coupling measures how densely the GRAPH connects two mechanisms, which reflects curation effort as well as biology. A well-studied pair looks more coupled than an equally coupled but less-studied one.',
      'No magnitude is encoded, so a strong coupling is not necessarily a large effect.',
    ],
    empty: matrix.length === 0,
  };
}

/** Full oncogenic analysis of one strategy, or comparative load across all of them. */
export function safetyProfile(interventionId?: InterventionId): QueryAnswer<unknown> {
  if (interventionId) {
    const p = analyseCancerSafety(interventionId);
    return {
      kind: 'safety-profile',
      question: `How does ${label(interventionId)} interact with the oncogenic axes?`,
      results: p ? p.findings : [],
      derivation: p
        ? [p.summary, ...p.findings.flatMap((f) => f.reasoning)]
        : ['No such strategy in the registry.'],
      limitations: [
        'This states mechanistic couplings. It is not a probability of cancer, not a safety clearance, and not clinical guidance.',
        p && p.unassessedAxes.length
          ? `${p.unassessedAxes.length} oncogenic axis/axes have no documented coupling for this strategy and are unassessed — that is missing analysis, not a clean result.`
          : 'All six oncogenic axes have at least one documented coupling for this strategy.',
      ],
      empty: !p || p.findings.length === 0,
    };
  }
  const ranking = oncogenicLoadRanking();
  return {
    kind: 'safety-profile',
    question: 'Comparative oncogenic load across every registered strategy.',
    results: ranking,
    derivation: [
      'For each strategy, composing its intended direction on each targeted mechanism with that mechanism’s documented coupling to each oncogenic axis.',
      'Load weights each risk-increasing route by how well established it is — established routes count fully, theoretical ones least.',
      `Highest load: ${ranking[0]?.label ?? '—'}; lowest: ${ranking[ranking.length - 1]?.label ?? '—'}.`,
    ],
    limitations: [
      'Load counts documented ROUTES, weighted by how established they are. It is not a hazard ratio and does not combine into a risk estimate.',
      'A strategy with few routes may simply be less studied. Unassessed axes are reported per strategy for exactly this reason.',
    ],
    empty: ranking.length === 0,
  };
}

/** Hypotheses touching a given node, already challenged by the critic. */
export function hypothesesAbout(node: GraphNodeId | undefined, records: EvidenceRecord[], limit = 8): QueryAnswer<ReturnType<typeof survivingHypotheses>[number]> {
  const all = generateHypotheses(records);
  const scoped = node ? all.filter((h) => h.nodes.includes(node)) : all;
  const surviving = survivingHypotheses(scoped, limit);
  return {
    kind: 'hypotheses-about',
    question: node ? `Which testable hypotheses involve ${label(node)}?` : 'Which testable hypotheses does the graph structure imply?',
    results: surviving,
    derivation: [
      `Generated ${all.length} hypotheses structurally — open triads, offsetting safety profiles, unaddressed couplings, amplifying loops, sign conflicts and unmeasurable mechanisms.`,
      node ? `${scoped.length} of them involve ${label(node)}.` : 'No node filter applied.',
      'Each was then challenged by the critic; the plausibility shown is AFTER those challenges were applied, never before.',
    ],
    limitations: [
      'A hypothesis is a structurally motivated place to look, not a finding. High novelty frequently means an obvious experiment produced a null that was never published.',
      'No citation supports any of these — the platform never manufactures references. Each lists what evidence is MISSING.',
    ],
    empty: surviving.length === 0,
  };
}

/** Where the graph itself is incomplete — the field-level gaps. */
export function researchGaps(): QueryAnswer<ReturnType<typeof structuralGaps>[number]> {
  const gaps = structuralGaps();
  const hubs = hubRanking().slice(0, 3);
  return {
    kind: 'research-gaps',
    question: 'Where is the mechanism graph itself incomplete?',
    results: gaps,
    derivation: [
      'Checking every mechanism for four structural absences: no biomarker (unmeasurable), no strategy targeting it (untargeted), no oncogenic coupling (unassessed for cancer), and no downstream edge (terminal).',
      `${gaps.length} gap(s) found.`,
      `For contrast, the most connected nodes are ${hubs.map((h) => `${h.label} (${h.total} causal edges)`).join(', ')}.`,
    ],
    limitations: [
      'These are gaps in THIS graph. A gap may reflect curation effort rather than a genuine hole in the field.',
      'A mechanism with no documented oncogenic coupling is unassessed, which is not the same as safe.',
    ],
    empty: gaps.length === 0,
  };
}
