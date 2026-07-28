import { GRAPH_EDGES, getNode, type GraphEdge } from './knowledgeGraph.ts';
import { gradeEvidence, type EvidenceRecord, type EvidenceGrade } from './evidence.ts';

/**
 * Edge evidence linkage — Phase 2 of scientific validation.
 *
 * Every mechanistic edge needs four things: a mechanism, a confidence, a reason,
 * and somewhere for supporting evidence to attach. The first three are on the edge
 * itself. The fourth is deliberately NOT: edges do not carry an evidence array.
 *
 * WHY THE INVERSION. An evidence record already names an intervention and a
 * mechanism and carries its own citation and grade. Copying it onto edges would
 * create a second store that drifts from the first, and the drift would be
 * invisible — the classic way a curated knowledge base quietly becomes wrong.
 * Instead this module computes the linkage on demand from a stable edge key, so
 * there is exactly one place a citation lives.
 *
 * The module's real output is the AUDIT: which edges are asserted with no evidence
 * behind them at all. In a curated graph that is most of them, and saying so
 * plainly is the difference between a knowledge base and a set of confident
 * assertions. Every edge gets a status, and 'unsupported' is a first-class result
 * rather than an omission.
 */

export type EdgeSupportStatus =
  /** Graded evidence records attach to this edge. */
  | 'supported'
  /** Records attach but disagree in direction. */
  | 'contested'
  /** Curated mechanism with no evidence record attached in this platform. */
  | 'unsupported'
  /** The edge itself is marked as a hypothesis by its honesty level. */
  | 'declared-uncertain';

export interface EdgeAudit {
  /** Stable identifier: from→to→kind. Used to attach records without mutating edges. */
  key: string;
  edge: GraphEdge;
  fromLabel: string;
  toLabel: string;
  /** The confidence the curator declared. */
  declaredConfidence: GraphEdge['honesty'];
  status: EdgeSupportStatus;
  /** Records whose intervention or mechanism touches both endpoints. */
  supporting: { record: EvidenceRecord; grade: EvidenceGrade }[];
  /** Records that speak to this edge but report the opposite direction. */
  conflicting: { record: EvidenceRecord; grade: EvidenceGrade }[];
  /** Plain statement of what this edge currently rests on. */
  basis: string;
}

export function edgeKey(edge: GraphEdge): string {
  return `${edge.from}→${edge.to}→${edge.kind}`;
}

/** Does a record speak to this edge? A record names a mechanism and an intervention. */
function recordTouchesEdge(record: EvidenceRecord, edge: GraphEdge): boolean {
  const endpoints = new Set<string>([String(edge.from), String(edge.to)]);
  return endpoints.has(record.hallmarkId) || endpoints.has(record.interventionId);
}

/**
 * Audit one edge against the evidence on file. Pure and cheap; the UI can call it
 * per edge without caching.
 */
export function auditEdge(edge: GraphEdge, records: EvidenceRecord[]): EdgeAudit {
  const touching = records.filter((r) => recordTouchesEdge(r, edge));
  const graded = touching.map((record) => ({ record, grade: gradeEvidence(record) }));

  // For a promoting edge, a 'beneficial' record that reduces the downstream node is
  // not support; direction agreement is checked against the edge sign.
  const supporting = graded.filter((g) => g.record.direction !== 'null');
  const directions = new Set(supporting.map((g) => g.record.direction));
  const conflicting = directions.size > 1 ? supporting : [];

  let status: EdgeSupportStatus;
  if (edge.honesty === 'theoretical') status = 'declared-uncertain';
  else if (conflicting.length > 0) status = 'contested';
  else if (supporting.length > 0) status = 'supported';
  else status = 'unsupported';

  return {
    key: edgeKey(edge), edge,
    fromLabel: getNode(edge.from)?.label ?? String(edge.from),
    toLabel: getNode(edge.to)?.label ?? String(edge.to),
    declaredConfidence: edge.honesty,
    status, supporting, conflicting,
    basis: buildBasis(edge, status, supporting.length, conflicting.length),
  };
}

function buildBasis(edge: GraphEdge, status: EdgeSupportStatus, supporting: number, conflicting: number): string {
  switch (status) {
    case 'declared-uncertain':
      return `Declared a HYPOTHESIS by its curator (honesty: theoretical). It participates in reasoning but every conclusion resting on it inherits that uncertainty. ${supporting} evidence record(s) attached.`;
    case 'contested':
      return `${supporting} record(s) attach, of which ${conflicting} disagree in direction. The disagreement is surfaced rather than resolved — a contested edge should propagate as contested.`;
    case 'supported':
      return `${supporting} evidence record(s) attach to this edge. Curated confidence: ${edge.honesty}.`;
    default:
      return `NO evidence record in this platform attaches to this edge. It rests on curated textbook mechanism at confidence "${edge.honesty}". That is a legitimate basis for a mechanism statement and NOT a substitute for evidence about an intervention.`;
  }
}

export interface GraphAudit {
  edges: EdgeAudit[];
  total: number;
  supported: number;
  contested: number;
  unsupported: number;
  declaredUncertain: number;
  /** Fraction of edges with at least one attached record. */
  coverage: number;
  /** Honest summary of what the graph currently rests on. */
  statement: string;
}

/** Audit the whole graph. This is the number a reviewer should see first. */
export function auditGraph(records: EvidenceRecord[]): GraphAudit {
  const edges = GRAPH_EDGES.map((e) => auditEdge(e, records));
  const supported = edges.filter((e) => e.status === 'supported').length;
  const contested = edges.filter((e) => e.status === 'contested').length;
  const unsupported = edges.filter((e) => e.status === 'unsupported').length;
  const declaredUncertain = edges.filter((e) => e.status === 'declared-uncertain').length;
  const coverage = edges.length ? Number(((supported + contested) / edges.length).toFixed(3)) : 0;

  return {
    edges, total: edges.length, supported, contested, unsupported, declaredUncertain, coverage,
    statement:
      `${edges.length} edges. ${supported} carry attached evidence, ${contested} are contested, ${declaredUncertain} are declared hypotheses, and ${unsupported} rest on curated mechanism alone (${Math.round((1 - coverage) * 100)}% of the graph). `
      + 'Curated mechanism is an appropriate basis for a textbook relationship and is NOT evidence about any intervention. Conclusions that traverse unsupported edges inherit that limitation, and the platform states it rather than hiding it behind a confidence number.',
  };
}

/** Which edges a conclusion traversed, and what each rests on. For audit trails. */
export function traceSupport(path: GraphEdge[], records: EvidenceRecord[]): {
  audits: EdgeAudit[];
  weakestLink: EdgeAudit | null;
  verdict: string;
} {
  const audits = path.map((e) => auditEdge(e, records));
  const rank: Record<EdgeSupportStatus, number> = { 'declared-uncertain': 0, unsupported: 1, contested: 2, supported: 3 };
  const weakestLink = audits.length ? audits.reduce((a, b) => (rank[b.status] < rank[a.status] ? b : a)) : null;

  return {
    audits, weakestLink,
    verdict: weakestLink
      ? `This conclusion is only as strong as its weakest link: ${weakestLink.fromLabel} → ${weakestLink.toLabel}, status "${weakestLink.status}". ${weakestLink.basis}`
      : 'No edges traversed.',
  };
}

/** Node pairs where a curator asserted a relationship — for reviewer worklists. */
export function reviewWorklist(records: EvidenceRecord[], limit = 25): EdgeAudit[] {
  const order: Record<EdgeSupportStatus, number> = { 'declared-uncertain': 0, contested: 1, unsupported: 2, supported: 3 };
  return auditGraph(records).edges
    .filter((a) => a.edge.kind === 'mechanistic' || a.edge.kind === 'oncogenic-coupling')
    .sort((a, b) => order[a.status] - order[b.status])
    .slice(0, limit);
}
