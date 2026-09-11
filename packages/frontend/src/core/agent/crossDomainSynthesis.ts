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
 * SCOPE, HONESTLY: this reads four of the nine investigation shapes —
 * `cyberInvestigation`, `deciphermentCase`, `researchChain`, and
 * `worldDiscovery` (its `loopResult.unresolvedQuestions` only — the
 * `comparisonResult` alternative shape is not yet read) — because those
 * already carry an explicit, unambiguous "this is still open" signal in
 * their own persisted record. The other five (`parameterInquiry`,
 * `mechanismComposition`, `realExperimentVerification`,
 * `substitutionInvestigation`, the legacy `hypothesisLoop`/`discoveryLoop`/
 * `investigation` Fabric shapes) do not currently expose a comparably
 * explicit "still open" flag on their own saved shape without additional
 * interpretation this module does not attempt yet —
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
  | 'INCONCLUSIVE_HYPOTHESIS';

/**
 * Explicit, named, ORDINAL ranking of open-item kinds — not a probability,
 * not a learned weight. Reasoning: an unresolved conflict is the most
 * epistemically urgent (Genesis is holding two contradictory truths at
 * once); a stalled chain is next (Genesis itself already tried to continue
 * and stopped); an unresolved question from a world-discovery loop ranks
 * just under that — the loop stopped without the contradiction a conflict
 * implies, but still named a specific question it could not answer; a
 * blocked chain is last among "still open" because no further experiment —
 * only a new capability — can move it; and a bare inconclusive hypothesis
 * is the least urgent of the truly open items, since nothing about it says
 * progress stalled, only that no test has discriminated it yet.
 */
const OPEN_ITEM_PRIORITY: Record<CrossDomainOpenItemKind, number> = {
  UNRESOLVED_CONFLICT: 5,
  UNSETTLED_CHAIN: 4,
  UNRESOLVED_QUESTION: 3,
  INCONCLUSIVE_HYPOTHESIS: 2,
  BLOCKED_CHAIN: 1,
};

export interface CrossDomainOpenItem {
  readonly sourceExperimentId: string;
  readonly labId: string;
  readonly shape: 'cyberInvestigation' | 'deciphermentCase' | 'researchChain' | 'worldDiscovery';
  readonly kind: CrossDomainOpenItemKind;
  readonly question: string;
  readonly detail: string;
  readonly createdAt: string;
  readonly evidencePackId: string | null;
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

/** Every open item across every domain — the whole point being that nothing here filters by domain first. */
export function collectCrossDomainOpenItems(records?: readonly SavedExperiment[]): readonly CrossDomainOpenItem[] {
  const all = records ?? listExperiments();
  const items: CrossDomainOpenItem[] = [];
  for (const record of all) {
    items.push(
      ...cyberOpenItems(record),
      ...deciphermentOpenItems(record),
      ...researchChainOpenItems(record),
      ...worldDiscoveryOpenItems(record),
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
    case 'UNRESOLVED_QUESTION':
      return 'Would answer a question the world-discovery loop itself named as unresolved when it stopped, rather than leaving it implicit in an unread trace.';
  }
}

function nextTestOrExperiment(item: CrossDomainOpenItem): string {
  switch (item.shape) {
    case 'cyberInvestigation':
      return 'Re-run the adaptive cyber investigation (`runAdaptiveInvestigation`, cyberReasoningKernel.ts) — its test planner will select a discriminating retest for this hypothesis if one is available and safe.';
    case 'deciphermentCase':
      return 'Plan the next decipherment test for this hypothesis via `planNextTest` (deciphermentTestPlanner.ts) against a fresh held-out segment of the same glyph sequence.';
    case 'researchChain':
      return item.kind === 'BLOCKED_CHAIN'
        ? `No experiment resolves this without a new actuator: "${item.detail}" names the missing capability.`
        : 'Continue this chain: call `runResearchChain`/`runMechanismResearchChain` again on the same catalog and goal with a larger step budget, or address why it stopped: "' + item.detail + '"';
    case 'worldDiscovery':
      return 'Re-run the world-discovery loop (`runDiscoveryLoop`, discoveryLoop.ts) on the same world/catalog with a larger round budget, targeting this specific unresolved question.';
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
    whyThisQuestion: `Kind=${winner.kind} (priority ${OPEN_ITEM_PRIORITY[winner.kind]} of ${Object.keys(OPEN_ITEM_PRIORITY).length}) — ${winner.detail}`,
    whyNow: `Highest-ranked open item across ${domainsScanned} domain(s) scanned (${items.length} open item(s) total: ` +
      `${items.filter((i) => i.kind === 'UNRESOLVED_CONFLICT').length} conflict(s), ` +
      `${items.filter((i) => i.kind === 'UNSETTLED_CHAIN').length} unsettled chain(s), ` +
      `${items.filter((i) => i.kind === 'UNRESOLVED_QUESTION').length} unresolved question(s), ` +
      `${items.filter((i) => i.kind === 'BLOCKED_CHAIN').length} blocked chain(s), ` +
      `${items.filter((i) => i.kind === 'INCONCLUSIVE_HYPOTHESIS').length} inconclusive hypothesis(es)); ` +
      `raised ${relativeAge(winner.createdAt, nowMs)} and never resolved since.`,
    relatedPriorWork,
    conflicts: conflictsInSameDomain,
    expectedDiscrimination: expectedDiscrimination(winner.kind, winner),
    nextTestOrExperiment: nextTestOrExperiment(winner),
    consideredAlternatives: alternatives.map((a) => ({ domain: a.labId, question: a.question, kind: a.kind })),
    domainsScanned,
    openItemCount: items.length,
  };
}
