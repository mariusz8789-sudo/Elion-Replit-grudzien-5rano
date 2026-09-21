import { canonicalJson, fnv1a } from '../events/hash';
import type { GraphEpistemicStatus } from '../experimentFabric/experimentGraph';
import type { CampaignResult } from './discoveryCampaign';

/**
 * DISCOVERY GRAPH — one campaign's reasoning, as a lineage-preserving graph,
 * and the only sanctioned way knowledge moves BETWEEN campaigns.
 *
 * WHAT IT IS FOR. A `CampaignResult` already contains everything a campaign
 * did, but as nested arrays keyed by round: to ask "which observation killed
 * this model, and which model replaced it?" you must re-derive the answer by
 * walking rounds and matching fingerprints. This module derives that structure
 * ONCE, deterministically, so lineage is a property of the record rather than
 * of whoever reads it.
 *
 * WHY IT IS A THIRD GRAPH, AND NOT A FOURTH COPY OF ANYTHING. Two graphs
 * already exist and neither answers this question:
 *  - `experimentGraph.ts` — what happened in ONE LIVE investigation session,
 *    over transient `ExperimentRun[]`, wired to an actionable screen.
 *  - `epistemicStateGraph.ts` — the whole PERSISTED research state, over
 *    `SavedExperiment[]` from Science Memory.
 * This one is over a CAMPAIGN: question, competing models, predictions,
 * experiments, observations, residuals, revisions, falsifications, derived
 * models, discovery. Retargeting either existing builder would mean inventing
 * a grouping its substrate does not have.
 *
 * IT REUSES `GraphEpistemicStatus` rather than inventing a ninth status
 * vocabulary. This codebase has already paid for that mistake once (see the
 * consolidation note in `epistemicReliability.ts`).
 *
 * THE TRANSFER RULE, which is the whole point of §5:
 *  - epistemic status is PRESERVED on import, NEVER upgraded;
 *  - a SUPPORTED node does not become a FACT by being imported;
 *  - a FALSIFIED model cannot be resurrected as a new model without a
 *    DECLARED CHANGE OF ASSUMPTIONS — enforced here, and consistent with
 *    `falsifiedModelRegistry.ts`, which treats a changed assumption set as a
 *    different scope;
 *  - UNKNOWN stays UNKNOWN.
 * Import is therefore lossy in exactly one direction: it can only ever carry
 * a claim across at the same strength or weaker, never stronger.
 */

export const DISCOVERY_GRAPH_CONTRACT_VERSION = '1.0.0';

export type DiscoveryNodeKind =
  | 'QUESTION'
  | 'MODEL'
  | 'PREDICTION'
  | 'EXPERIMENT'
  | 'OBSERVATION'
  | 'RESIDUAL'
  | 'REVISION'
  | 'FALSIFICATION'
  | 'NEW_MODEL'
  | 'OBSERVATION_GAP'
  | 'DISCOVERY';

export type DiscoveryEdgeKind =
  | 'proposes'
  | 'predicts'
  | 'tests'
  | 'observes'
  | 'yields_residual'
  | 'motivates'
  | 'revises'
  | 'falsifies'
  | 'supersedes'
  | 'requests'
  | 'concludes'
  | 'transfers_to';

export interface DiscoveryNode {
  readonly nodeId: string;
  readonly campaignId: string;
  readonly kind: DiscoveryNodeKind;
  readonly label: string;
  readonly epistemicStatus: GraphEpistemicStatus;
  /** Node ids this node would not exist without. Edges are derived from this and from explicit relations. */
  readonly lineage: readonly string[];
  readonly detail: readonly string[];
  /** Set on a node imported from another campaign — the campaign it came from. Null for native nodes. */
  readonly importedFrom: string | null;
  readonly fingerprint: string;
}

export interface DiscoveryEdge {
  readonly from: string;
  readonly to: string;
  readonly kind: DiscoveryEdgeKind;
}

export interface DiscoveryGraph {
  readonly contractVersion: string;
  readonly campaignId: string;
  readonly nodes: readonly DiscoveryNode[];
  readonly edges: readonly DiscoveryEdge[];
  readonly graphFingerprint: string;
}

function node(
  campaignId: string,
  kind: DiscoveryNodeKind,
  localId: string,
  label: string,
  epistemicStatus: GraphEpistemicStatus,
  lineage: readonly string[],
  detail: readonly string[],
  importedFrom: string | null = null,
): DiscoveryNode {
  const nodeId = `${campaignId}:${kind}:${localId}`;
  return {
    nodeId,
    campaignId,
    kind,
    label,
    epistemicStatus,
    lineage,
    detail,
    importedFrom,
    fingerprint: fnv1a(canonicalJson({ nodeId, kind, label, epistemicStatus, lineage: [...lineage].sort(), importedFrom })),
  };
}

/**
 * Derives the graph from a finished campaign. Pure and deterministic: the same
 * `CampaignResult` always produces the same nodes, edges and fingerprint.
 *
 * Status assignment is DERIVED from what the campaign actually did, never
 * declared: an admitted point is `OBSERVED`; a model still standing is
 * `HYPOTHESIS`; a model the campaign ended holding as falsified is `BLOCKED`
 * (the vocabulary's existing "this line is closed" value); a raised gap is
 * `VERIFY_REQUIRED`, because that is exactly what it asks for; a campaign that
 * reached no winner yields `UNKNOWN` rather than an empty claim.
 */
export function buildDiscoveryGraph(result: CampaignResult): DiscoveryGraph {
  const campaignId = result.labId;
  const nodes: DiscoveryNode[] = [];
  const edges: DiscoveryEdge[] = [];

  const question = node(campaignId, 'QUESTION', 'root', result.problem, 'QUESTION', [], [
    `Stopped with ${result.stopReason} after ${result.rounds.length} round(s).`,
  ]);
  nodes.push(question);

  const firstRound = result.rounds[0] ?? null;
  const finalRound = result.rounds[result.rounds.length - 1] ?? null;
  const falsifiedPrints = new Set(result.discovery.falsifiedModels.map((m) => m.fingerprint));

  // --- models: those enumerated up front, and those derived mid-campaign ---
  const seenModels = new Set<string>();
  for (const round of result.rounds) {
    for (const model of round.models) {
      if (seenModels.has(model.fingerprint)) continue;
      seenModels.add(model.fingerprint);
      const derived = model.enteredAtRound > 0 && model.derivedFrom !== null;
      const kind: DiscoveryNodeKind = derived ? 'NEW_MODEL' : 'MODEL';
      const status: GraphEpistemicStatus = falsifiedPrints.has(model.fingerprint) ? 'BLOCKED' : 'HYPOTHESIS';
      const lineage = derived ? [`${campaignId}:MODEL:${model.derivedFrom}`] : [question.nodeId];
      const modelNode = node(campaignId, kind, model.fingerprint, model.formula, status, lineage, [
        `Entered at round ${model.enteredAtRound}.`,
        model.derivationOperator === null ? 'Enumerated from the declared grammar.' : `Derived by ${model.derivationOperator}.`,
        model.rss === null ? 'Not fitted on the final admitted set.' : `Weighted RSS ${model.rss.toFixed(6)}.`,
      ]);
      nodes.push(modelNode);
      edges.push({ from: question.nodeId, to: modelNode.nodeId, kind: 'proposes' });
      if (derived) edges.push({ from: `${campaignId}:MODEL:${model.derivedFrom}`, to: modelNode.nodeId, kind: 'supersedes' });
      if (falsifiedPrints.has(model.fingerprint)) {
        const falsification = node(campaignId, 'FALSIFICATION', model.fingerprint, `Falsified: ${model.formula}`, 'BLOCKED', [modelNode.nodeId], [
          'The campaign ended holding this model below the belief threshold.',
        ]);
        nodes.push(falsification);
        edges.push({ from: modelNode.nodeId, to: falsification.nodeId, kind: 'falsifies' });
      }
    }
  }

  // --- experiments, observations, residuals and revisions, per round ---
  for (const round of result.rounds) {
    const roundNode = node(campaignId, 'EXPERIMENT', `round-${round.round}`, `Round ${round.round}: ${round.admittedX.length} observation(s) admitted`, 'OBSERVED', [question.nodeId], [
      round.selectionReason,
    ]);
    nodes.push(roundNode);
    edges.push({ from: question.nodeId, to: roundNode.nodeId, kind: 'tests' });

    for (const x of round.admittedX) {
      const observationId = `${campaignId}:OBSERVATION:x-${x}`;
      if (!nodes.some((n) => n.nodeId === observationId)) {
        const observation = node(campaignId, 'OBSERVATION', `x-${x}`, `Observation at x=${x}`, 'OBSERVED', [roundNode.nodeId], [
          'A real measurement from the laboratory, admitted to the fitted set.',
        ]);
        nodes.push(observation);
        edges.push({ from: roundNode.nodeId, to: observation.nodeId, kind: 'observes' });
      }
    }

    for (const [index, finding] of round.residualFindings.entries()) {
      const residual = node(campaignId, 'RESIDUAL', `r${round.round}-${index}`, `${finding.kind} in the best model's residuals`, 'MODEL_ESTIMATE', [roundNode.nodeId], [finding.evidence]);
      nodes.push(residual);
      edges.push({ from: roundNode.nodeId, to: residual.nodeId, kind: 'yields_residual' });
      for (const derivedModel of round.derivedThisRound) {
        edges.push({ from: residual.nodeId, to: `${campaignId}:NEW_MODEL:${derivedModel.fingerprint}`, kind: 'motivates' });
      }
    }

    if (round.bestFingerprint !== null) {
      const revision = node(campaignId, 'REVISION', `round-${round.round}`, `Round ${round.round} belief revision`, 'MODEL_ESTIMATE', [roundNode.nodeId], [
        round.decisive ? `Decisive: best/runner-up RSS ratio ${round.rssRatio?.toFixed(4)}.` : 'No model separated decisively this round.',
      ]);
      nodes.push(revision);
      edges.push({ from: roundNode.nodeId, to: revision.nodeId, kind: 'revises' });
    }

    if (round.observationGap !== null) {
      const gap = node(campaignId, 'OBSERVATION_GAP', `round-${round.round}`, `Requested: ${round.observationGap.requiredObservable.quantity}`, 'VERIFY_REQUIRED', [roundNode.nodeId], [
        round.observationGap.rationale,
        `Instrument class: ${round.observationGap.requiredObservable.instrumentClass}.`,
      ]);
      nodes.push(gap);
      edges.push({ from: roundNode.nodeId, to: gap.nodeId, kind: 'requests' });
    }
  }

  // --- the discovery itself ---
  const winner = result.discovery.winningModel;
  const discovery = node(
    campaignId,
    'DISCOVERY',
    'result',
    winner === null ? 'No model was established.' : (result.discovery.winningFormulaWithCoefficients ?? winner.formula),
    winner === null ? 'UNKNOWN' : 'MODEL_ESTIMATE',
    winner === null ? [question.nodeId] : [`${campaignId}:${winner.enteredAtRound > 0 && winner.derivedFrom !== null ? 'NEW_MODEL' : 'MODEL'}:${winner.fingerprint}`],
    [result.discovery.decisionBasis, result.discovery.uncertainty],
  );
  nodes.push(discovery);
  if (finalRound !== null) edges.push({ from: `${campaignId}:EXPERIMENT:round-${finalRound.round}`, to: discovery.nodeId, kind: 'concludes' });
  void firstRound;

  return {
    contractVersion: DISCOVERY_GRAPH_CONTRACT_VERSION,
    campaignId,
    nodes,
    edges,
    graphFingerprint: fnv1a(canonicalJson({ campaignId, nodes: nodes.map((n) => n.fingerprint), edges })),
  };
}

export type TransferRefusalReason =
  | 'FALSIFIED_WITHOUT_ASSUMPTION_CHANGE'
  | 'DUPLICATE_FINGERPRINT';

export interface TransferOutcome {
  readonly graph: DiscoveryGraph;
  readonly imported: readonly DiscoveryNode[];
  readonly refused: readonly { readonly node: DiscoveryNode; readonly reason: TransferRefusalReason; readonly detail: string }[];
}

/**
 * Imports knowledge from another campaign's graph into `target`.
 *
 * THE THREE RULES, enforced here rather than documented:
 *
 *  1. STATUS IS NEVER UPGRADED. An imported node keeps the epistemic status it
 *     earned in the campaign that produced it. There is no argument by which
 *     import strengthens a claim: moving a result to a new context cannot add
 *     evidence to it.
 *
 *  2. A FALSIFIED MODEL CANNOT BE RESURRECTED without `changedAssumptions`
 *     naming what is now different. This mirrors `falsifiedModelRegistry.ts`
 *     exactly: a changed assumption set is a different scope, and a verdict
 *     reached under the old one no longer speaks to the new question. Without
 *     that declaration the node is REFUSED, and the refusal is returned rather
 *     than thrown, so the caller sees what was rejected and why.
 *
 *  3. FINGERPRINT DEDUP. A node already present is not imported twice; the
 *     graph is a set of facts, not a pile of copies.
 *
 * Every imported node is stamped `importedFrom`, so provenance survives the
 * move and nothing looks native that was not.
 */
export function transferKnowledge(
  target: DiscoveryGraph,
  source: DiscoveryGraph,
  options: { readonly changedAssumptions?: readonly string[] } = {},
): TransferOutcome {
  const changed = options.changedAssumptions ?? [];
  const present = new Set(target.nodes.map((n) => n.fingerprint));
  const imported: DiscoveryNode[] = [];
  const refused: { node: DiscoveryNode; reason: TransferRefusalReason; detail: string }[] = [];

  for (const candidate of source.nodes) {
    if (present.has(candidate.fingerprint)) {
      refused.push({ node: candidate, reason: 'DUPLICATE_FINGERPRINT', detail: 'This exact fact is already in the target graph.' });
      continue;
    }
    const isDeadModel = (candidate.kind === 'MODEL' || candidate.kind === 'NEW_MODEL' || candidate.kind === 'FALSIFICATION')
      && candidate.epistemicStatus === 'BLOCKED';
    if (isDeadModel && changed.length === 0) {
      refused.push({
        node: candidate,
        reason: 'FALSIFIED_WITHOUT_ASSUMPTION_CHANGE',
        detail: `"${candidate.label}" was falsified in ${candidate.campaignId}. Importing it requires naming which assumption is now different — without that, the original verdict still applies.`,
      });
      continue;
    }
    const moved: DiscoveryNode = {
      ...candidate,
      // Status preserved, never raised. The fingerprint is recomputed only to
      // record the import, and the status inside it is the one it arrived with.
      importedFrom: candidate.campaignId,
      detail: isDeadModel
        ? [...candidate.detail, `Imported under changed assumptions: ${changed.join('; ')}. The original falsification stands for the original assumptions.`]
        : [...candidate.detail, `Imported from ${candidate.campaignId}; epistemic status preserved as ${candidate.epistemicStatus}.`],
    };
    imported.push(moved);
    present.add(moved.fingerprint);
  }

  const nodes = [...target.nodes, ...imported];
  const edges = [
    ...target.edges,
    ...imported.map((n): DiscoveryEdge => ({ from: n.nodeId, to: `${target.campaignId}:QUESTION:root`, kind: 'transfers_to' })),
  ];
  return {
    graph: {
      contractVersion: DISCOVERY_GRAPH_CONTRACT_VERSION,
      campaignId: target.campaignId,
      nodes,
      edges,
      graphFingerprint: fnv1a(canonicalJson({ campaignId: target.campaignId, nodes: nodes.map((n) => n.fingerprint), edges })),
    },
    imported,
    refused,
  };
}

/** MATCH or DRIFT, mirroring every other replay comparator in this codebase. */
export function compareDiscoveryGraphReplay(first: Pick<DiscoveryGraph, 'graphFingerprint'>, second: Pick<DiscoveryGraph, 'graphFingerprint'>): 'MATCH' | 'DRIFT' {
  return first.graphFingerprint === second.graphFingerprint ? 'MATCH' : 'DRIFT';
}
