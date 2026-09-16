import type React from 'react';
import type { StageRecord } from '../../core/orchestrator/contracts';

/**
 * PipelineTimeline — the 20 fixed orchestrator stages as one horizontal
 * track (D-117). Pure projection of `run.stages`: status, order and the
 * stage fingerprint are exactly what `orchestrator.ts` recorded; the track
 * never invents a stage, a status or a fingerprint.
 */

const shortName = (stage: string): string => stage.replace(/^\d+_/, '').replace(/_/g, ' ').toLowerCase();

export function PipelineTimeline({ stages }: { readonly stages: readonly StageRecord[] }): React.ReactElement {
  const okCount = stages.filter((s) => s.status === 'OK').length;
  return (
    <div className="gu-timeline" data-testid="pipeline-timeline">
      <div className="gu-timeline-head">
        <span className="section-label">Pipeline — {stages.length} stages, {okCount} OK</span>
        <span className="gu-hint">every stage carries its own fingerprint; the audit fingerprint is the hash of all of them</span>
      </div>
      <ol className="gu-timeline-track">
        {stages.map((s, i) => (
          <li
            key={s.stage}
            className={`gu-timeline-step gu-timeline-${s.status.toLowerCase()}`}
            title={`${s.stage} — ${s.status} — fp ${s.fingerprint}${s.note !== undefined ? ` — ${s.note}` : ''}`}
            data-testid={`timeline-${s.stage}`}
          >
            <span className="gu-timeline-dot">{i + 1}</span>
            <span className="gu-timeline-name">{shortName(s.stage)}</span>
            <code className="gu-timeline-fp">{s.fingerprint.slice(0, 6)}</code>
          </li>
        ))}
      </ol>
    </div>
  );
}
