import type React from 'react';
import type { LowerHarmRunDetail, LowerHarmWinnerRecord, NoWinnerBlocker } from '../../core/orchestrator/winnerRecord';

/**
 * VerdictWhyStrip — the one-line "why" under the verdict banner (D-117):
 * each Winner Gate conjunct as a chip, the favourite's governance gate, the
 * observation count and, for a NO_WINNER, the exact blocker. Every chip is a
 * boolean or a string the run already recorded.
 */
export function VerdictWhyStrip({ detail, record }: { readonly detail: LowerHarmRunDetail; readonly record: LowerHarmWinnerRecord | NoWinnerBlocker | undefined }): React.ReactElement {
  const favourite = detail.gateDecisions[0];
  return (
    <div className="gu-why" data-testid="verdict-why">
      {detail.conjuncts.map((c) => (
        <span key={c.criterion} className={`gu-why-chip ${c.held ? 'gu-why-held' : 'gu-why-failed'}`} title={c.detail}>
          {c.held ? '✓' : '✗'} {c.criterion.toLowerCase().replace(/_/g, ' ')}
        </span>
      ))}
      {favourite !== undefined && (
        <span className={`gu-why-chip gu-why-gate-${favourite.outcome.toLowerCase()}`} title={favourite.reason}>
          gate · {favourite.candidateName}: {favourite.outcome.replace(/_/g, ' ')}
        </span>
      )}
      <span className="gu-why-chip gu-why-neutral">{detail.evidence.length} real observations</span>
      {record?.kind === 'NO_WINNER_BLOCKER' && <span className="gu-why-chip gu-why-failed" title={record.reason}>blocked at {record.blockedAt}</span>}
      {record?.kind === 'WINNER_RECORD' && <span className="gu-why-chip gu-why-held">record {record.recordFingerprint}</span>}
    </div>
  );
}
