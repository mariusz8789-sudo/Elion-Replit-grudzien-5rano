import type React from 'react';
import type { LowerHarmRunDetail, LowerHarmWinnerRecord, NoWinnerBlocker } from '../../core/orchestrator/winnerRecord';

/**
 * ProvenanceDag — the evidence → decision chain of one run as a directed
 * graph (D-117): pinned SOURCE → CUSTODY (hash) → OBSERVATIONS (NCT rows) →
 * CANDIDATES (TOP2 + the eliminated rest) → G2 EXPERIMENT → per-candidate
 * GATE → WinnerRecord or the NoWinnerBlocker. `buildProvenanceGraph` is a pure
 * projection of `LowerHarmRunDetail` + the record; it adds no node the run
 * did not produce and ends at the blocker when there is no record.
 */

export type DagNodeKind = 'source' | 'custody' | 'observation' | 'candidate' | 'others' | 'experiment' | 'gate' | 'record' | 'blocker' | 'none';
export type DagTone = 'ok' | 'warn' | 'fail' | 'neutral';

export interface DagNode {
  readonly id: string;
  readonly column: number;
  readonly kind: DagNodeKind;
  readonly label: string;
  readonly sub: string;
  readonly tone: DagTone;
}

export interface DagEdge { readonly from: string; readonly to: string; }

export interface CustodyView { readonly sourceId: string; readonly hash: string | null; readonly status: string; }

export const DAG_COLUMNS = ['SOURCE', 'CUSTODY', 'OBSERVATIONS', 'CANDIDATES', 'EXPERIMENT', 'GATE', 'OUTCOME'] as const;

export function buildProvenanceGraph(
  detail: LowerHarmRunDetail,
  record: LowerHarmWinnerRecord | NoWinnerBlocker | undefined,
  custody: CustodyView | null,
): { readonly nodes: readonly DagNode[]; readonly edges: readonly DagEdge[] } {
  const nodes: DagNode[] = [];
  const edges: DagEdge[] = [];
  const custodyView = custody ?? (record?.kind === 'WINNER_RECORD' ? record.evidenceCustody : null);

  nodes.push({ id: 'source', column: 0, kind: 'source', label: custodyView?.sourceId ?? 'pinned dataset', sub: 'ChEMBL + ClinicalTrials.gov', tone: 'neutral' });
  nodes.push({
    id: 'custody', column: 1, kind: 'custody',
    label: custodyView === null ? 'custody: not recorded' : `custody ${custodyView.status}`,
    sub: custodyView?.hash !== null && custodyView?.hash !== undefined ? `sha256 ${custodyView.hash.slice(0, 12)}…` : 'no hash',
    tone: custodyView === null ? 'warn' : /FROZEN|OK|VERIFIED/i.test(custodyView.status) ? 'ok' : 'fail',
  });
  edges.push({ from: 'source', to: 'custody' });

  const top2 = new Set(detail.top2Ids);
  const seenObs = new Set<string>();
  for (const e of detail.evidence) {
    const id = `obs:${e.nctId}:${e.candidateId}`;
    if (seenObs.has(id)) continue;
    seenObs.add(id);
    nodes.push({
      id, column: 2, kind: 'observation', label: e.nctId,
      sub: `${e.comparisonType} · n=${e.candidateArmN}${e.withinMargin === null ? '' : e.withinMargin ? ' · within margin' : ' · OUTSIDE margin'}`,
      tone: e.withinMargin === false ? 'warn' : 'neutral',
    });
    edges.push({ from: 'custody', to: id });
    edges.push({ from: id, to: top2.has(e.candidateId) ? `cand:${e.candidateId}` : 'others' });
  }

  const top2Entries = detail.candidates.filter((c) => top2.has(c.candidateId));
  for (const c of top2Entries) {
    nodes.push({
      id: `cand:${c.candidateId}`, column: 3, kind: 'candidate', label: c.candidateName,
      sub: `${c.candidateId} · score ${c.lowerHarmScore === null ? 'n/a' : c.lowerHarmScore.toFixed(3)}`, tone: 'ok',
    });
  }
  const eliminated = detail.candidates.filter((c) => !top2.has(c.candidateId));
  if (eliminated.length > 0) {
    nodes.push({ id: 'others', column: 3, kind: 'others', label: `${eliminated.length} eliminated`, sub: 'floor / veto / evidence — each with its own reason', tone: 'neutral' });
  }

  const f = detail.falsification;
  nodes.push({
    id: 'experiment', column: 4, kind: 'experiment',
    label: f === null ? 'G2: not reached' : f.outcome === 'EXPERIMENT_SELECTED' ? `G2 · ${f.observableId ?? ''}` : 'G2: no experiment',
    sub: f === null ? 'no TOP2 pair' : f.outcome === 'EXPERIMENT_SELECTED' ? `${f.discriminability?.toFixed(2) ?? 'n/a'}σ · rule ${f.decisionRuleFingerprint?.slice(0, 8) ?? ''}` : (f.reason ?? ''),
    tone: f !== null && f.outcome === 'EXPERIMENT_SELECTED' ? 'ok' : 'warn',
  });
  for (const c of top2Entries) edges.push({ from: `cand:${c.candidateId}`, to: 'experiment' });

  for (const g of detail.gateDecisions) {
    const id = `gate:${g.candidateId}`;
    nodes.push({
      id, column: 5, kind: 'gate', label: g.outcome.replace(/_/g, ' '), sub: g.candidateName,
      tone: g.outcome === 'REFUSE' ? 'fail' : g.outcome === 'REQUIRES_HUMAN_APPROVAL' ? 'warn' : 'ok',
    });
    edges.push({ from: 'experiment', to: id });
  }

  if (record?.kind === 'WINNER_RECORD') {
    nodes.push({ id: 'outcome', column: 6, kind: 'record', label: `WinnerRecord · ${record.candidateName}`, sub: `record ${record.recordFingerprint} · recipe ${record.fingerprints.recipeFingerprint}`, tone: 'ok' });
    edges.push({ from: `gate:${record.winnerId}`, to: 'outcome' });
  } else if (record?.kind === 'NO_WINNER_BLOCKER') {
    nodes.push({ id: 'outcome', column: 6, kind: 'blocker', label: `${record.verdict} · blocked at`, sub: record.blockedAt, tone: 'fail' });
    const from = detail.gateDecisions.length > 0 ? `gate:${detail.gateDecisions[0]!.candidateId}` : 'experiment';
    edges.push({ from, to: 'outcome' });
  } else {
    nodes.push({ id: 'outcome', column: 6, kind: 'none', label: 'no record', sub: 'run did not finish', tone: 'neutral' });
  }

  const known = new Set(nodes.map((n) => n.id));
  return { nodes, edges: edges.filter((e) => known.has(e.from) && known.has(e.to)) };
}

const COL_W = 150;
const NODE_W = 132;
const NODE_H = 46;
const ROW_H = 58;
const TOP = 30;

export function ProvenanceDag({ detail, record, custody }: {
  readonly detail: LowerHarmRunDetail;
  readonly record: LowerHarmWinnerRecord | NoWinnerBlocker | undefined;
  readonly custody: CustodyView | null;
}): React.ReactElement {
  const { nodes, edges } = buildProvenanceGraph(detail, record, custody);
  const rowsPerColumn = DAG_COLUMNS.map((_, col) => nodes.filter((n) => n.column === col).length);
  const height = TOP + Math.max(1, ...rowsPerColumn) * ROW_H + 10;
  const width = DAG_COLUMNS.length * COL_W + 20;
  const pos = new Map<string, { x: number; y: number }>();
  const rowIndex = new Array<number>(DAG_COLUMNS.length).fill(0);
  for (const n of nodes) {
    const row = rowIndex[n.column]!;
    rowIndex[n.column] = row + 1;
    pos.set(n.id, { x: 10 + n.column * COL_W, y: TOP + row * ROW_H });
  }
  return (
    <figure className="gu-dag" data-testid="provenance-dag">
      <svg viewBox={`0 0 ${width} ${height}`} className="gu-dag-svg" role="img" aria-label="Evidence provenance graph">
        {DAG_COLUMNS.map((c, i) => <text key={c} x={10 + i * COL_W} y={16} className="gu-dag-col">{c}</text>)}
        {edges.map((e) => {
          const a = pos.get(e.from)!; const b = pos.get(e.to)!;
          const x1 = a.x + NODE_W; const y1 = a.y + NODE_H / 2; const x2 = b.x; const y2 = b.y + NODE_H / 2;
          const cx = (x1 + x2) / 2;
          return <path key={`${e.from}->${e.to}`} d={`M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`} className="gu-dag-edge" />;
        })}
        {nodes.map((n) => {
          const p = pos.get(n.id)!;
          return (
            <g key={n.id} className={`gu-dag-node gu-dag-${n.kind} gu-dag-tone-${n.tone}`} data-testid={`dag-${n.id}`}>
              <title>{`${n.label} — ${n.sub}`}</title>
              <rect x={p.x} y={p.y} width={NODE_W} height={NODE_H} rx={8} className="gu-dag-box" />
              <text x={p.x + 8} y={p.y + 18} className="gu-dag-label">{n.label.length > 20 ? `${n.label.slice(0, 19)}…` : n.label}</text>
              <text x={p.x + 8} y={p.y + 34} className="gu-dag-sub">{n.sub.length > 24 ? `${n.sub.slice(0, 23)}…` : n.sub}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="gu-hint">Provenance: every node is a real artefact of this run — hover for its full identifier. Indirect (NAIVE_INDIRECT) comparisons stay labelled as such.</figcaption>
    </figure>
  );
}
