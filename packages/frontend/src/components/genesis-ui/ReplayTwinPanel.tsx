import type React from 'react';
import type { GenesisDomainReplayResult } from '../../core/orchestrator/genesisDomainRegistry';

/**
 * ReplayTwinPanel — stage-by-stage twin of two independent runs (D-117).
 * `compareStages` is a pure projection: a row matches only when the two
 * stage fingerprints are byte-identical. MATCH is never assumed; a single
 * differing stage is shown in red where it differs.
 */

export interface TwinRow { readonly stage: string; readonly a: string | null; readonly b: string | null; readonly statusA: string | null; readonly statusB: string | null; readonly match: boolean; }

type StageLike = { readonly stage: string; readonly status: string; readonly fingerprint: string };

export function compareStages(a: readonly StageLike[], b: readonly StageLike[]): readonly TwinRow[] {
  const order: string[] = [];
  const seen = new Set<string>();
  for (const s of [...a, ...b]) if (!seen.has(s.stage)) { seen.add(s.stage); order.push(s.stage); }
  const byA = new Map(a.map((s) => [s.stage, s] as const));
  const byB = new Map(b.map((s) => [s.stage, s] as const));
  return order.map((stage) => {
    const ra = byA.get(stage) ?? null; const rb = byB.get(stage) ?? null;
    return {
      stage,
      a: ra?.fingerprint ?? null, b: rb?.fingerprint ?? null,
      statusA: ra?.status ?? null, statusB: rb?.status ?? null,
      match: ra !== null && rb !== null && ra.fingerprint === rb.fingerprint && ra.status === rb.status,
    };
  });
}

export function ReplayTwinPanel({ replay }: { readonly replay: GenesisDomainReplayResult }): React.ReactElement {
  const first = replay.first; const second = replay.second;
  if (first.kind !== 'RUN' || second.kind !== 'RUN') {
    return <p className="gu-hint" data-testid="replay-twin">One of the runs did not produce stages ({first.kind} / {second.kind}) — nothing to compare stage by stage.</p>;
  }
  const rows = compareStages(first.stages, second.stages);
  const mismatches = rows.filter((r) => !r.match).length;
  return (
    <div className="gu-twin" data-testid="replay-twin">
      <div className="gu-twin-head">
        <span className="section-label">Stage-by-stage twin</span>
        <span className={mismatches === 0 ? 'gu-twin-ok' : 'gu-twin-bad'}>{rows.length} stages · {mismatches === 0 ? 'all fingerprints identical' : `${mismatches} differ`}</span>
      </div>
      <ol className="gu-twin-rows">
        {rows.map((r, i) => (
          <li key={r.stage} className={`gu-twin-row ${r.match ? 'gu-twin-match' : 'gu-twin-mismatch'}`} data-testid={`twin-${r.stage}`}>
            <span className="gu-twin-idx">{i + 1}</span>
            <span className="gu-twin-stage">{r.stage.replace(/^\d+_/, '').replace(/_/g, ' ').toLowerCase()}</span>
            <code className="gu-twin-fp">{r.a?.slice(0, 8) ?? '—'}</code>
            <span className="gu-twin-mark" aria-label={r.match ? 'identical' : 'different'}>{r.match ? '=' : '≠'}</span>
            <code className="gu-twin-fp">{r.b?.slice(0, 8) ?? '—'}</code>
          </li>
        ))}
      </ol>
    </div>
  );
}
