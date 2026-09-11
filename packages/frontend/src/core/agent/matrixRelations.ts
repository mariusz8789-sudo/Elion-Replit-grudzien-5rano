import type { SavedExperiment } from '../scienceMemory';

/**
 * MATRIX RELATIONS — the edges of the Genesis Matrix, derived ONLY from
 * fields that really link two Science Memory records to each other.
 *
 * Why this module exists: the Matrix was a set of columns of records. Columns
 * are not a map — the thing worth seeing is which record EXPLAINS which other
 * record. But a graph is also the easiest place in this codebase to lie: draw
 * a plausible-looking edge and the screen instantly looks like a knowledge
 * system it is not. So the rule here is absolute:
 *
 *   AN EDGE EXISTS ONLY WHEN A CONCRETE FIELD PROVES IT, AND EVERY EDGE
 *   CARRIES THE NAME OF THE FIELD THAT PROVED IT (`basis`).
 *
 * There is no similarity heuristic, no shared-keyword matching, no
 * "these happened close together so they are probably related". A relation
 * the data cannot support is not drawn faintly or guessed at — it is reported
 * in `missing`, with the reason, so the UI can show the gap AS a gap.
 *
 * This is a stateless projection over records the caller already has. It is
 * not a second Memory, a second Evidence store, or a second graph database —
 * it reads `SavedExperiment[]` and returns edges.
 */

export type MatrixEdgeKind =
  /** A real measurement judged against a specific earlier prediction run. */
  | 'VERIFIES_PREDICTION'
  /** Two records that were sealed into the same evidence pack. */
  | 'SHARED_EVIDENCE_PACK'
  /** Two records on the same evidence chain. */
  | 'SHARED_EVIDENCE_CHAIN'
  /** Two records replaying the same capsule. */
  | 'SAME_REPLAY_CAPSULE'
  /** The same lab experiment run more than once. */
  | 'SAME_EXPERIMENT_RERUN';

export interface MatrixEdge {
  readonly fromId: string;
  readonly toId: string;
  readonly kind: MatrixEdgeKind;
  /** The exact field that proves this edge. Never a heuristic. */
  readonly basis: string;
  /** True when the relation has a direction (verification → prediction). */
  readonly directed: boolean;
}

export type MissingRelationReason =
  /** The schema carries no field that could ever link these two stages. */
  | 'NO_LINKING_FIELD'
  /** A link field exists and is populated, but its other end is not present. */
  | 'ENDPOINT_MISSING'
  /** Both stages exist but nothing has connected them yet. */
  | 'NOT_YET_LINKED';

export interface MissingRelation {
  readonly from: string;
  readonly to: string;
  readonly reason: MissingRelationReason;
  readonly detail: string;
}

export interface MatrixRelationGraph {
  readonly edges: readonly MatrixEdge[];
  readonly missing: readonly MissingRelation[];
}

/** Deterministic ordering so the rendered graph never reshuffles between renders. */
function cmpEdge(a: MatrixEdge, b: MatrixEdge): number {
  return a.kind.localeCompare(b.kind) || a.fromId.localeCompare(b.fromId) || a.toId.localeCompare(b.toId);
}

/** Undirected pairs within one group, each pair emitted once. */
function pairsWithin(ids: readonly string[], kind: MatrixEdgeKind, basis: string): MatrixEdge[] {
  const sorted = [...ids].sort((a, b) => a.localeCompare(b));
  const edges: MatrixEdge[] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      edges.push({ fromId: sorted[i], toId: sorted[j], kind, basis, directed: false });
    }
  }
  return edges;
}

function groupBy(records: readonly SavedExperiment[], key: (r: SavedExperiment) => string | undefined): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const record of records) {
    const value = key(record);
    if (!value) continue;
    const bucket = groups.get(value);
    if (bucket) bucket.push(record.id);
    else groups.set(value, [record.id]);
  }
  return groups;
}

export function buildMatrixRelationGraph(records: readonly SavedExperiment[]): MatrixRelationGraph {
  const byId = new Map(records.map((record) => [record.id, record]));
  const edges: MatrixEdge[] = [];
  const missing: MissingRelation[] = [];

  // ---- The most important edge in Genesis: a real measurement pointing back
  // at the exact prediction run it judged. This is the loop actually closing,
  // and it is a real stored reference, not an inference.
  let danglingVerifications = 0;
  for (const record of records) {
    const sourceId = record.realExperimentVerification?.predictionSourceExperimentId;
    if (!sourceId) continue;
    if (byId.has(sourceId)) {
      edges.push({
        fromId: record.id,
        toId: sourceId,
        kind: 'VERIFIES_PREDICTION',
        basis: 'realExperimentVerification.predictionSourceExperimentId',
        directed: true,
      });
    } else {
      danglingVerifications += 1;
      missing.push({
        from: record.id,
        to: sourceId,
        reason: 'ENDPOINT_MISSING',
        detail: `Weryfikacja wskazuje na przebieg predykcji „${sourceId}", którego nie ma już w Pamięci Naukowej.`,
      });
    }
  }

  for (const [packId, ids] of groupBy(records, (r) => r.evidencePackId)) {
    edges.push(...pairsWithin(ids, 'SHARED_EVIDENCE_PACK', `evidencePackId=${packId}`));
  }
  for (const [chainId, ids] of groupBy(records, (r) => r.evidenceChainId)) {
    edges.push(...pairsWithin(ids, 'SHARED_EVIDENCE_CHAIN', `evidenceChainId=${chainId}`));
  }
  for (const [capsuleId, ids] of groupBy(records, (r) => r.replayIdentity?.capsuleId)) {
    edges.push(...pairsWithin(ids, 'SAME_REPLAY_CAPSULE', `replayIdentity.capsuleId=${capsuleId}`));
  }
  for (const [key, ids] of groupBy(records, (r) => `${r.labId}::${r.experimentId}`)) {
    edges.push(...pairsWithin(ids, 'SAME_EXPERIMENT_RERUN', `labId+experimentId=${key}`));
  }

  // ---- Gaps, stated as gaps.
  const predictions = records.filter((r) => r.worldDiscovery).length;
  const verifications = records.filter((r) => r.realExperimentVerification).length;
  const linkedPredictions = new Set(edges.filter((e) => e.kind === 'VERIFIES_PREDICTION').map((e) => e.toId)).size;

  if (predictions > 0 && verifications === 0) {
    missing.push({
      from: 'PREDICTION',
      to: 'REAL RESULT',
      reason: 'NOT_YET_LINKED',
      detail: `${predictions} przebieg${predictions === 1 ? '' : 'ów'} predykcji nie został jeszcze skonfrontowany z żadnym realnym pomiarem.`,
    });
  } else if (predictions > linkedPredictions + danglingVerifications) {
    missing.push({
      from: 'PREDICTION',
      to: 'REAL RESULT',
      reason: 'NOT_YET_LINKED',
      detail: `${predictions - linkedPredictions - danglingVerifications} z ${predictions} przebiegów predykcji wciąż czeka na realny pomiar.`,
    });
  }

  // The schema genuinely has no field tying a hypothesis record to the
  // experiment record that tested it — they are linked only through a shared
  // evidence pack, when one exists. Saying so is more useful than drawing a
  // line that means nothing.
  const hypotheses = records.filter((r) => r.discoveryLoop || r.hypothesisLoop || r.parameterInquiry);
  const unpackedHypotheses = hypotheses.filter((r) => !r.evidencePackId && !r.evidenceChainId).length;
  if (unpackedHypotheses > 0) {
    missing.push({
      from: 'HYPOTHESIS',
      to: 'EXPERIMENT',
      reason: 'NO_LINKING_FIELD',
      detail: `${unpackedHypotheses} zapis${unpackedHypotheses === 1 ? ' hipotezy nie ma' : 'ów hipotez nie ma'} evidence packa ani chaina — a poza nimi schemat nie niesie pola wiążącego hipotezę z eksperymentem, który ją testował.`,
    });
  }

  edges.sort(cmpEdge);
  return { edges, missing };
}

/** Every edge touching one record, for the selected-object panel. */
export function edgesFor(graph: MatrixRelationGraph, recordId: string): readonly MatrixEdge[] {
  return graph.edges.filter((edge) => edge.fromId === recordId || edge.toId === recordId);
}

export const EDGE_LABEL: Record<MatrixEdgeKind, string> = {
  VERIFIES_PREDICTION: 'weryfikuje predykcję',
  SHARED_EVIDENCE_PACK: 'wspólny evidence pack',
  SHARED_EVIDENCE_CHAIN: 'wspólny evidence chain',
  SAME_REPLAY_CAPSULE: 'ta sama kapsuła replay',
  SAME_EXPERIMENT_RERUN: 'ponowny przebieg tego samego eksperymentu',
};
