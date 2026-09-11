import { listExperiments, type SavedExperiment } from '../scienceMemory';
import { buildMatrixRelationGraph, edgesFor, type MatrixEdge } from './matrixRelations';

/**
 * CROSS-DOMAIN NEXT QUESTION / MEMORY SYNTHESIS — the one layer this
 * project's own gap analysis named as its most important missing piece:
 * something that looks across EVERY domain's saved history at once and
 * answers "what should Genesis do next?", instead of each domain only ever
 * being asked to look at its own.
 *
 * READ-ONLY / DECISION-PROJECTION, nothing else. This module:
 *   - reads `listExperiments()` (Science Memory — the one store, all nine
 *     investigation shapes already unified in `SavedExperiment`);
 *   - reads `matrixRelations.ts` (the one relation graph, derived only from
 *     fields that really link two records);
 *   - and reads each domain's OWN terminal-status/conflict vocabulary,
 *     which already exists per shape (`SavedResearchChainManifest.
 *     terminalStatus`, `CyberInvestigationResult.verdicts[].assessment`,
 *     `DeciphermentCaseResult.conflicts`).
 *
 * It creates no second Memory, no second Discovery Engine, no second
 * Information Gain Engine, no second Matrix, and no probability-of-truth
 * number: every field below is either a literal quote of what a domain
 * already recorded, or an explicit, named, non-numeric heuristic ranking
 * (`OPEN_ITEM_PRIORITY`) — never a fabricated confidence score.
 *
 * SCOPE, HONESTLY: this reads seven of the investigation shapes —
 * `cyberInvestigation`, `deciphermentCase`, `researchChain`,
 * `worldDiscovery` (its `loopResult.unresolvedQuestions` only — the
 * `comparisonResult` alternative shape is not yet read),
 * `mechanismComposition` (its `assessment.interaction === 'INCONCLUSIVE'`,
 * `mechanismInteraction.ts`'s own explicit fourth outcome alongside
 * ADDITIVE/SUB_ADDITIVE/SUPER_ADDITIVE), and `hypothesisLoop` +
 * `discoveryLoop` — because those already carry an explicit, unambiguous
 * "this is still open" signal in their own persisted record.
 *
 * WHY `hypothesisLoop`/`discoveryLoop` matter most of the seven: they are
 * Genesis's FLAGSHIP scientific record. A `SavedHypothesisLoop` is a
 * preregistered, fingerprinted set of competing hypotheses that was
 * actually EXECUTED against a real engine, with a per-hypothesis
 * `HypothesisStatus` and a real `discrimination` verdict. A
 * `SavedScientificDiscoveryLoop` goes further and already carries
 * `nextExperiment` — the next step Genesis's OWN selector
 * (`hypothesisLoop.ts::selectNextHypothesisExperiment`) derived from that
 * loop's real state. Leaving those two unread meant the loop could close
 * everywhere except at its last arrow: the system ran real science and
 * then could not see its own unfinished business when asked "what next?".
 * Nothing is re-derived here — for a discovery loop this module QUOTES the
 * persisted `nextExperiment.why`/`.resolves` verbatim (see `domainNextStep`)
 * rather than inventing a second opinion about it.
 *
 * The remaining shapes (`parameterInquiry`, `realExperimentVerification`,
 * `substitutionInvestigation`, the legacy `investigation` shape) still do
 * not expose a comparably explicit "still open" flag on their own saved
 * shape without additional interpretation this module does not attempt —
 * INTEGRATION_POINT_TO_CONFIRM for whoever extends this. Silently guessing
 * at open-ness for those shapes would be worse than naming the gap.
 */

export type CrossDomainOpenItemKind =
  /** A hypothesis whose history holds BOTH a SUPPORTED and a FALSIFIED assessment — preserved, not averaged. */
  | 'UNRESOLVED_CONFLICT'
  /** A research chain (`researchChain.ts`) that stopped OPEN or INCONCLUSIVE — Genesis itself flagged this as unfinished. */
  | 'UNSETTLED_CHAIN'
  /** A world-discovery loop (`discoveryLoop.ts`) that stopped with at least one question in its own `unresolvedQuestions` — Genesis itself named the question as unanswered. */
  | 'UNRESOLVED_QUESTION'
  /** A research chain that stopped BLOCKED — not a data gap, an actuator Genesis does not have yet. */
  | 'BLOCKED_CHAIN'
  /** A single hypothesis whose only verdict so far is INCONCLUSIVE. */
  | 'INCONCLUSIVE_HYPOTHESIS'
  /** A preregistered hypothesis that could not be executed at all (`HypothesisStatus` BLOCKED) — no executor, not a weak result. */
  | 'BLOCKED_HYPOTHESIS'
  /** A preregistered set that RAN, stayed intact, and still could not tell its competing hypotheses apart (`discrimination.decisive === false`). */
  | 'UNDECIDED_DISCRIMINATION'
  /** A discovery loop whose OWN `selectNextHypothesisExperiment` says a step is still outstanding. */
  | 'OPEN_NEXT_EXPERIMENT';

/**
 * Explicit, named, ORDINAL ranking of open-item kinds — not a probability,
 * not a learned weight. Reasoning: an unresolved conflict is the most
 * epistemically urgent (Genesis is holding two contradictory truths at
 * once); an undecided discrimination is next, because a real preregistered
 * set was executed and STILL failed to separate its competitors, which is
 * nearly the same predicament arrived at by a more expensive route; an
 * outstanding next experiment ranks alongside it because Genesis's own
 * selector already decided that step is owed (and for READY_TO_RUN has
 * already built the request); a stalled chain is next (Genesis itself tried
 * to continue and stopped); an unresolved question from a world-discovery
 * loop ranks just under that — the loop stopped without the contradiction a
 * conflict implies, but still named a specific question it could not
 * answer; a bare inconclusive hypothesis is less urgent still, since
 * nothing about it says progress stalled, only that no test has
 * discriminated it yet; and anything BLOCKED is last among "still open"
 * because no further experiment — only a new capability — can move it.
 *
 * NOTE, deliberately not silently reconciled: `hypothesisLoop.ts`'s own
 * `NEXT_EXPERIMENT_PRIORITY` ranks BLOCKED *above* INCONCLUSIVE. That is
 * not a contradiction — it answers a different question ("what is the next
 * step for THIS loop?", where an unexecutable hypothesis is the first thing
 * to resolve) than this table does ("across everything, what is worth
 * investigating next?", where an item no experiment can move is the worst
 * use of the next run). Both orders are stated where they apply; neither
 * overrides the other.
 */
const OPEN_ITEM_PRIORITY: Record<CrossDomainOpenItemKind, number> = {
  UNRESOLVED_CONFLICT: 6,
  UNDECIDED_DISCRIMINATION: 5,
  OPEN_NEXT_EXPERIMENT: 5,
  UNSETTLED_CHAIN: 4,
  UNRESOLVED_QUESTION: 3,
  INCONCLUSIVE_HYPOTHESIS: 2,
  BLOCKED_CHAIN: 1,
  BLOCKED_HYPOTHESIS: 1,
};

const MAX_OPEN_ITEM_PRIORITY = Math.max(...Object.values(OPEN_ITEM_PRIORITY));

const OPEN_ITEM_LABEL: Record<CrossDomainOpenItemKind, string> = {
  UNRESOLVED_CONFLICT: 'conflict(s)',
  UNDECIDED_DISCRIMINATION: 'undecided discrimination(s)',
  OPEN_NEXT_EXPERIMENT: 'outstanding next experiment(s)',
  UNSETTLED_CHAIN: 'unsettled chain(s)',
  UNRESOLVED_QUESTION: 'unresolved question(s)',
  INCONCLUSIVE_HYPOTHESIS: 'inconclusive hypothesis(es)',
  BLOCKED_CHAIN: 'blocked chain(s)',
  BLOCKED_HYPOTHESIS: 'blocked hypothesis(es)',
};

/**
 * Derived from the kind table rather than hand-listed, so a kind added later
 * cannot silently vanish from the tally — which is exactly how the flagship
 * `hypothesisLoop`/`discoveryLoop` shapes went unreported before this pass.
 * Zero-count kinds are omitted so the sentence states what is there, not what
 * could have been.
 */
function tallyByKind(items: readonly CrossDomainOpenItem[]): string {
  const parts = (Object.keys(OPEN_ITEM_PRIORITY) as CrossDomainOpenItemKind[])
    .map((kind) => ({ kind, count: items.filter((item) => item.kind === kind).length }))
    .filter((entry) => entry.count > 0)
    .sort((a, b) => OPEN_ITEM_PRIORITY[b.kind] - OPEN_ITEM_PRIORITY[a.kind] || (a.kind < b.kind ? -1 : 1))
    .map((entry) => `${entry.count} ${OPEN_ITEM_LABEL[entry.kind]}`);
  return parts.length > 0 ? parts.join(', ') : 'none';
}

export interface CrossDomainOpenItem {
  readonly sourceExperimentId: string;
  readonly labId: string;
  readonly shape:
    | 'cyberInvestigation' | 'deciphermentCase' | 'researchChain'
    | 'worldDiscovery' | 'mechanismComposition'
    | 'hypothesisLoop' | 'discoveryLoop';
  readonly kind: CrossDomainOpenItemKind;
  readonly question: string;
  readonly detail: string;
  readonly createdAt: string;
  readonly evidencePackId: string | null;
  /**
   * The domain's OWN already-computed next step, quoted verbatim when the
   * record carries one — today only `SavedScientificDiscoveryLoop.nextExperiment`,
   * produced by `selectNextHypothesisExperiment`. When present, this module
   * reports it instead of proposing anything of its own: re-deriving a next
   * step over a record that already contains Genesis's real answer would be
   * a second opinion with less information than the first.
   */
  readonly domainNextStep?: string;
}

function cyberOpenItems(record: SavedExperiment): CrossDomainOpenItem[] {
  if (!record.cyberInvestigation) return [];
  const { result } = record.cyberInvestigation;
  const items: CrossDomainOpenItem[] = [];
  // Real conflicts (SUPPORTED_WITHIN_PROTOCOL and FALSIFIED_WITHIN_PROTOCOL both on record for the
  // same hypothesis) rank above a bare INCONCLUSIVE — see OPEN_ITEM_PRIORITY. `result.conflicts` is
  // only ever non-empty on records built via `toCyberInvestigationResultFromAdaptive`, since that is
  // the one seam that carries `runAdaptiveInvestigation`'s live conflict tracking through to Memory.
  for (const hypothesisId of result.conflicts) {
    const hyp = result.hypotheses.find((h) => h.hypothesisId === hypothesisId);
    const relevantVerdicts = result.verdicts.filter((v) => v.hypothesisId === hypothesisId);
    items.push({
      sourceExperimentId: record.id,
      labId: record.labId,
      shape: 'cyberInvestigation',
      kind: 'UNRESOLVED_CONFLICT',
      question: hyp ? hyp.statement : `Hypothesis ${hypothesisId} in "${result.goal}"`,
      detail: `History: ${relevantVerdicts.map((v) => v.assessment).join(' -> ')}.`,
      createdAt: record.createdAt,
      evidencePackId: record.evidencePackId ?? null,
    });
  }
  for (const verdict of result.verdicts) {
    if (verdict.assessment !== 'INCONCLUSIVE') continue;
    if (result.conflicts.includes(verdict.hypothesisId)) continue; // already reported as a conflict, not a mere inconclusive
    const hyp = result.hypotheses.find((h) => h.hypothesisId === verdict.hypothesisId);
    items.push({
      sourceExperimentId: record.id,
      labId: record.labId,
      shape: 'cyberInvestigation',
      kind: 'INCONCLUSIVE_HYPOTHESIS',
      question: hyp ? hyp.statement : `Hypothesis ${verdict.hypothesisId} in "${result.goal}"`,
      detail: verdict.reasoning,
      createdAt: record.createdAt,
      evidencePackId: record.evidencePackId ?? null,
    });
  }
  return items;
}

function deciphermentOpenItems(record: SavedExperiment): CrossDomainOpenItem[] {
  if (!record.deciphermentCase) return [];
  const { result } = record.deciphermentCase;
  return result.conflicts.map((conflict) => {
    const hyp = result.hypotheses.find((h) => h.hypothesisId === conflict.hypothesisId);
    return {
      sourceExperimentId: record.id,
      labId: record.labId,
      shape: 'deciphermentCase' as const,
      kind: 'UNRESOLVED_CONFLICT' as const,
      question: hyp ? hyp.statement : `Hypothesis ${conflict.hypothesisId} in case ${result.caseId}`,
      detail: `History: ${conflict.history.join(' -> ')}.`,
      createdAt: record.createdAt,
      evidencePackId: record.evidencePackId ?? null,
    };
  });
}

function researchChainOpenItems(record: SavedExperiment): CrossDomainOpenItem[] {
  if (!record.researchChain) return [];
  const chain = record.researchChain;
  if (chain.terminalStatus === 'SETTLED') return [];
  return [{
    sourceExperimentId: record.id,
    labId: record.labId,
    shape: 'researchChain',
    kind: chain.terminalStatus === 'BLOCKED' ? 'BLOCKED_CHAIN' : 'UNSETTLED_CHAIN',
    question: chain.initialQuestion,
    detail: chain.stoppedBecause,
    createdAt: record.createdAt,
    evidencePackId: record.evidencePackId ?? null,
  }];
}

/**
 * The flagship shape: a preregistered, fingerprinted, really-executed set of
 * competing hypotheses. Every open item below is a literal read of a status
 * the loop itself recorded — `HypothesisStatus` per outcome and the loop's
 * own `discrimination.decisive`. Nothing is inferred about hypotheses the
 * loop marked SUPPORTED or FALSIFIED: those are settled within their
 * protocol, and re-opening them here would be this module second-guessing a
 * preregistered verdict it did not run.
 */
function hypothesisLoopOpenItems(record: SavedExperiment): CrossDomainOpenItem[] {
  const loop = record.hypothesisLoop;
  if (!loop) return [];
  const items: CrossDomainOpenItem[] = [];
  const base = {
    sourceExperimentId: record.id,
    labId: record.labId,
    shape: 'hypothesisLoop' as const,
    createdAt: record.createdAt,
  };

  for (const outcome of loop.outcomes) {
    if (outcome.status !== 'INCONCLUSIVE' && outcome.status !== 'BLOCKED') continue;
    const hypothesis = loop.hypotheses.find((entry) => entry.hypothesisId === outcome.hypothesisId);
    const question = hypothesis?.statement ?? `Hypothesis ${outcome.hypothesisId} in "${loop.problem.statement}"`;
    items.push({
      ...base,
      kind: outcome.status === 'BLOCKED' ? 'BLOCKED_HYPOTHESIS' : 'INCONCLUSIVE_HYPOTHESIS',
      question,
      detail: outcome.status === 'BLOCKED'
        ? `Preregistered but never executed: ${hypothesis?.blockedReason ?? 'no executor available for this hypothesis'}.`
        : `Executed without a comparable value for "${loop.problem.primaryMetric}" (observed=${outcome.observedMetric ?? 'none'}, baseline=${outcome.baselineMetric ?? 'none'}).`,
      evidencePackId: outcome.evidencePackId ?? record.evidencePackId ?? null,
    });
  }

  if (!loop.discrimination.decisive) {
    items.push({
      ...base,
      kind: 'UNDECIDED_DISCRIMINATION',
      question: loop.problem.statement,
      detail: `A preregistered set of ${loop.hypotheses.length} competing hypotheses ran intact and the ranking on "${loop.problem.primaryMetric}" still did not separate them (winner=${loop.discrimination.winnerHypothesisId ?? 'none'}).`,
      evidencePackId: record.evidencePackId ?? null,
    });
  }

  return items;
}

/**
 * The discovery loop already asked Genesis's own selector what comes next
 * and persisted the answer. This reads that answer; it does not compute a
 * rival one. RESOLVED means the selector itself found no further executable
 * step — that is a closed item, not something to reopen here.
 */
function discoveryLoopOpenItems(record: SavedExperiment): CrossDomainOpenItem[] {
  const loop = record.discoveryLoop;
  if (!loop) return [];
  const next = loop.nextExperiment;
  if (next.status === 'RESOLVED') return [];
  return [{
    sourceExperimentId: record.id,
    labId: record.labId,
    shape: 'discoveryLoop',
    // BLOCKED/VALIDATION_REQUIRED mean no executor can take the step as it stands;
    // READY_TO_RUN means the selector already built a runnable request.
    kind: next.status === 'READY_TO_RUN' ? 'OPEN_NEXT_EXPERIMENT' : 'BLOCKED_HYPOTHESIS',
    question: loop.statement,
    detail: `${next.status}: ${next.why}`,
    createdAt: record.createdAt,
    evidencePackId: record.evidencePackId ?? null,
    domainNextStep: `${next.resolves} (${next.rule}) — selected by Genesis's own selectNextHypothesisExperiment over this loop's real state; status ${next.status}${next.aboutHypothesisIds.length > 0 ? `, about ${next.aboutHypothesisIds.join(', ')}` : ''}.`,
  }];
}

/**
 * Only `loopResult.unresolvedQuestions` — `discoveryLoop.ts`'s own explicit
 * "what the loop could not settle" list, named by the loop itself, never
 * inferred from `stopReason`/`bestSupported` by this module. The alternative
 * `comparisonResult` shape (`crossActionComparison.ts`) is not read here —
 * INTEGRATION_POINT_TO_CONFIRM, same honesty as the module doc's scope note.
 */
function worldDiscoveryOpenItems(record: SavedExperiment): CrossDomainOpenItem[] {
  const loopResult = record.worldDiscovery?.loopResult;
  if (!loopResult) return [];
  return loopResult.unresolvedQuestions.map((question) => ({
    sourceExperimentId: record.id,
    labId: record.labId,
    shape: 'worldDiscovery' as const,
    kind: 'UNRESOLVED_QUESTION' as const,
    question,
    detail: `Stop reason: ${loopResult.stopReason}. ${loopResult.bestSupported.length} best-supported mechanism(s) so far, ${loopResult.failedHypotheses.length} refuted.`,
    createdAt: record.createdAt,
    evidencePackId: record.evidencePackId ?? null,
  }));
}

/**
 * `assessment.interaction === 'INCONCLUSIVE'` is `mechanismInteraction.ts`'s
 * own fourth, explicit outcome alongside ADDITIVE/SUB_ADDITIVE/
 * SUPER_ADDITIVE — a joint-mechanism hypothesis Genesis measured but could
 * not classify, the same "no test has discriminated this yet" shape
 * `INCONCLUSIVE_HYPOTHESIS` already names for cyber, reused here rather
 * than invented afresh.
 */
function mechanismCompositionOpenItems(record: SavedExperiment): CrossDomainOpenItem[] {
  const composition = record.mechanismComposition;
  if (!composition || composition.assessment.interaction !== 'INCONCLUSIVE') return [];
  return [{
    sourceExperimentId: record.id,
    labId: record.labId,
    shape: 'mechanismComposition',
    kind: 'INCONCLUSIVE_HYPOTHESIS',
    question: composition.derived.statement,
    detail: composition.assessment.reason,
    createdAt: record.createdAt,
    evidencePackId: record.evidencePackId ?? null,
  }];
}

/** Every open item across every domain — the whole point being that nothing here filters by domain first. */
export function collectCrossDomainOpenItems(records?: readonly SavedExperiment[]): readonly CrossDomainOpenItem[] {
  const all = records ?? listExperiments();
  const items: CrossDomainOpenItem[] = [];
  for (const record of all) {
    items.push(
      ...cyberOpenItems(record),
      ...deciphermentOpenItems(record),
      ...researchChainOpenItems(record),
      ...hypothesisLoopOpenItems(record),
      ...discoveryLoopOpenItems(record),
      ...worldDiscoveryOpenItems(record),
      ...mechanismCompositionOpenItems(record),
    );
  }
  return items;
}

function relativeAge(createdAt: string, now: number): string {
  const ms = now - new Date(createdAt).getTime();
  if (!(ms >= 0)) return 'just now';
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.round(ms / 60_000)} minute(s) ago`;
  if (hours < 48) return `${Math.round(hours)} hour(s) ago`;
  return `${Math.round(hours / 24)} day(s) ago`;
}

function expectedDiscrimination(kind: CrossDomainOpenItemKind, item: CrossDomainOpenItem): string {
  switch (kind) {
    case 'UNRESOLVED_CONFLICT':
      return 'Would determine which of the SUPPORTED and FALSIFIED assessments already on record for this hypothesis was right — both currently stand, preserved rather than averaged.';
    case 'UNSETTLED_CHAIN':
      return `Would move this chain past its current terminal status (${item.detail.includes('BLOCKED') ? 'BLOCKED' : 'OPEN/INCONCLUSIVE'}) toward SETTLED, rather than adding one more isolated data point.`;
    case 'BLOCKED_CHAIN':
      return 'Would resolve nothing by itself: this chain stopped because Genesis has no actuator for the question it raised, not for lack of data. The gap is architectural, not experimental — see "next test" below.';
    case 'INCONCLUSIVE_HYPOTHESIS':
      return 'Would move this single hypothesis from INCONCLUSIVE to a terminal SUPPORTED_WITHIN_PROTOCOL or FALSIFIED_WITHIN_PROTOCOL.';
    case 'BLOCKED_HYPOTHESIS':
      return 'Would resolve nothing by re-running it: this hypothesis was preregistered but never executed, because no admitted executor could take its request. The gap is a missing capability, not a missing measurement.';
    case 'UNDECIDED_DISCRIMINATION':
      return 'Would determine whether the tie between these preregistered hypotheses is a property of the model or an artefact of the single seed this set ran on — the one question a decisive-looking ranking cannot answer about itself.';
    case 'OPEN_NEXT_EXPERIMENT':
      return 'Would complete the step Genesis\'s own selector already judged outstanding for this loop; the expected discrimination is the one stated in that step\'s own `resolves`, quoted under "next test".';
    case 'UNRESOLVED_QUESTION':
      return 'Would answer a question the world-discovery loop itself named as unresolved when it stopped, rather than leaving it implicit in an unread trace.';
  }
}

function nextTestOrExperiment(item: CrossDomainOpenItem): string {
  // A record that already carries Genesis's own computed next step wins outright:
  // this module has strictly less information about that loop than the selector did.
  if (item.domainNextStep !== undefined) return item.domainNextStep;
  switch (item.shape) {
    case 'cyberInvestigation':
      return 'Re-run the adaptive cyber investigation (`runAdaptiveInvestigation`, cyberReasoningKernel.ts) — its test planner will select a discriminating retest for this hypothesis if one is available and safe.';
    case 'deciphermentCase':
      return 'Plan the next decipherment test for this hypothesis via `planNextTest` (deciphermentTestPlanner.ts) against a fresh held-out segment of the same glyph sequence.';
    case 'researchChain':
      return item.kind === 'BLOCKED_CHAIN'
        ? `No experiment resolves this without a new actuator: "${item.detail}" names the missing capability.`
        : 'Continue this chain: call `runResearchChain`/`runMechanismResearchChain` again on the same catalog and goal with a larger step budget, or address why it stopped: "' + item.detail + '"';
    case 'hypothesisLoop':
      return item.kind === 'BLOCKED_HYPOTHESIS'
        ? `No run resolves this without a new executor: "${item.detail}" names what was missing when the preregistered request was offered.`
        : 'Re-enter this loop through its own selector: `selectNextHypothesisExperiment` (hypothesisLoop.ts) reads this exact state and returns the real next `StructuredExperimentRequest` — including, for an undecided ranking, the same protocol re-run on the next seed.';
    case 'discoveryLoop':
      // Unreachable in practice: every discoveryLoop item carries `domainNextStep`,
      // which returns above. Kept so the switch stays exhaustive by type, not by luck.
      return 'See this loop\'s own persisted `nextExperiment` (selectNextHypothesisExperiment).';
    case 'worldDiscovery':
      return 'Re-run the world-discovery loop (`runDiscoveryLoop`, discoveryLoop.ts) on the same world/catalog with a larger round budget, targeting this specific unresolved question.';
    case 'mechanismComposition':
      return 'Re-measure the joint arm for these two mechanisms (`runMechanismDiscoveryAndRemember`, discoveryOrchestrator.ts) — a tighter tolerance band or a repeated measurement may resolve ADDITIVE/SUB_ADDITIVE/SUPER_ADDITIVE where this run could not.';
  }
}

export interface RelatedPriorWork {
  readonly experimentId: string;
  readonly labId: string;
  readonly relation: MatrixEdge['kind'];
  readonly basis: string;
}

export interface CrossDomainNextQuestion {
  readonly question: string;
  readonly domain: string;
  readonly whyThisQuestion: string;
  readonly whyNow: string;
  readonly relatedPriorWork: readonly RelatedPriorWork[];
  readonly conflicts: readonly string[];
  readonly expectedDiscrimination: string;
  readonly nextTestOrExperiment: string;
  /** Every other open item this pick was ranked above, for transparency — never hidden. */
  readonly consideredAlternatives: readonly { readonly domain: string; readonly question: string; readonly kind: CrossDomainOpenItemKind }[];
  readonly domainsScanned: number;
  readonly openItemCount: number;
}

/**
 * Deterministic tie-break ranking: priority kind first, then OLDEST first
 * (an item nobody has revisited longest is the most neglected, not the
 * freshest — the opposite of a recency bias) — never a random or
 * fabricated-confidence order.
 */
function rankOpenItems(items: readonly CrossDomainOpenItem[]): readonly CrossDomainOpenItem[] {
  return [...items].sort((a, b) => {
    const byPriority = OPEN_ITEM_PRIORITY[b.kind] - OPEN_ITEM_PRIORITY[a.kind];
    if (byPriority !== 0) return byPriority;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

/**
 * Synthesizes ONE next question across every domain scanned. Returns null
 * when nothing is open — an honest "nothing to report", not a fabricated
 * question. `records`/`nowMs` are injectable for deterministic tests; real
 * callers omit both.
 */
export function synthesizeNextQuestion(
  records?: readonly SavedExperiment[],
  nowMs: number = Date.now(),
): CrossDomainNextQuestion | null {
  const all = records ?? listExperiments();
  const items = collectCrossDomainOpenItems(all);
  if (items.length === 0) return null;

  const ranked = rankOpenItems(items);
  const winner = ranked[0]!;
  const alternatives = ranked.slice(1);
  const domainsScanned = new Set(all.map((r) => r.labId)).size;

  const graph = buildMatrixRelationGraph(all);
  const relatedPriorWork: RelatedPriorWork[] = edgesFor(graph, winner.sourceExperimentId).map((edge) => {
    const otherId = edge.fromId === winner.sourceExperimentId ? edge.toId : edge.fromId;
    const other = all.find((r) => r.id === otherId);
    return { experimentId: otherId, labId: other?.labId ?? 'unknown', relation: edge.kind, basis: edge.basis };
  });

  const conflictsInSameDomain = items
    .filter((i) => i.labId === winner.labId && i.kind === 'UNRESOLVED_CONFLICT')
    .map((i) => `${i.question} — ${i.detail}`);

  return {
    question: winner.question,
    domain: winner.labId,
    whyThisQuestion: `Kind=${winner.kind} (priority ${OPEN_ITEM_PRIORITY[winner.kind]} of ${MAX_OPEN_ITEM_PRIORITY}) — ${winner.detail}`,
    whyNow: `Highest-ranked open item across ${domainsScanned} domain(s) scanned (${items.length} open item(s) total: ` +
      `${tallyByKind(items)}); raised ${relativeAge(winner.createdAt, nowMs)} and never resolved since.`,
    relatedPriorWork,
    conflicts: conflictsInSameDomain,
    expectedDiscrimination: expectedDiscrimination(winner.kind, winner),
    nextTestOrExperiment: nextTestOrExperiment(winner),
    consideredAlternatives: alternatives.map((a) => ({ domain: a.labId, question: a.question, kind: a.kind })),
    domainsScanned,
    openItemCount: items.length,
  };
}
