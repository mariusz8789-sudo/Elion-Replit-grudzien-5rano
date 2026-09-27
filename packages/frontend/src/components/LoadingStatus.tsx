import { useEffect, useState } from 'react';
import { countdownSeconds, ringProgress, RING_SEGMENTS } from '../core/product/durationEstimate';

export interface LoadingStatusProps {
  readonly label: string;
  /** A measured estimate (core/product/durationEstimate). Absent/null → no countdown, never a guess. */
  readonly estimateMs?: number | null;
  readonly testId?: string;
  /** Set false when the status sits inside another control that already announces itself. */
  readonly announce?: boolean;
  /** Hide the ring where only the text belongs (dense inline places). */
  readonly ring?: boolean;
}

const R = 16;
const CX = 20;
const CIRCUMFERENCE = 2 * Math.PI * R;
const GAP = 4; // path units between ticks, so the ring reads as separate marks

/**
 * The waiting ring — AN ESTIMATE OF TIME, NOT A MEASURE OF WORK DONE.
 *
 * Its ticks are fifths of how long this same operation took LAST time, counted against the clock. It
 * knows nothing about what the engine is doing inside: a full ring does not mean the stage finished,
 * and an empty one does not mean nothing happened. Only the backend ends a stage; the ring is a
 * courtesy so the wait does not feel blind. It is labelled as an estimate everywhere it appears.
 *
 * With no past measurement there is nothing to count down, so the ring turns instead of filling. When
 * the wait outlasts the estimate it stops at full, turns amber, and says it is taking longer than last
 * time — never an invented 99 %.
 */
function WaitRing({ filled, segments, active, overrun, determinate }: {
  readonly filled: number; readonly segments: number; readonly active: number | null;
  readonly overrun: boolean; readonly determinate: boolean;
}) {
  const span = CIRCUMFERENCE / segments;
  const dash = Math.max(1, span - GAP);
  return (
    <svg className={`gx-ring${determinate ? '' : ' is-indeterminate'}${overrun ? ' is-overrun' : ''}`} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      {Array.from({ length: segments }, (_, i) => (
        <circle
          key={i} className={`gx-ring-tick${determinate && i < filled ? ' is-done' : ''}${determinate && i === active ? ' is-active' : ''}`}
          cx={CX} cy={CX} r={R} fill="none" strokeWidth={4} strokeLinecap="round"
          strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
          transform={`rotate(${-90 + (i * 360) / segments} ${CX} ${CX})`}
        />
      ))}
    </svg>
  );
}

/** One loading indicator: counts seconds down when the wait has a measured length, otherwise just says what is loading. */
export function LoadingStatus({ label, estimateMs = null, testId, announce = true, ring = true }: LoadingStatusProps) {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  const elapsed = now - startedAt;
  const remaining = estimateMs ? countdownSeconds(estimateMs, elapsed) : null;
  const progress = ringProgress(estimateMs, elapsed);
  // The wording never lets a countdown read as progress: it is time, estimated from the last run.
  const suffix = remaining === null ? '…' : remaining > 0 ? ` · szacowany czas: ok. ${remaining} s` : ' · dłużej niż ostatnio…';
  const estimateNote = 'Szacowany czas na podstawie poprzedniego pomiaru tej samej operacji. To NIE jest postęp pracy silnika — etap kończy wyłącznie backend.';
  return (
    <span
      className="gx-loading" role={announce ? 'status' : undefined} data-testid={testId}
      title={estimateMs ? estimateNote : undefined}
      data-indicator={estimateMs ? 'TIME_ESTIMATE' : 'INDETERMINATE'}
      data-remaining-s={remaining ?? undefined}
      data-ring-segments={ring ? progress.segments : undefined}
      data-ring-filled={ring && estimateMs ? progress.filled : undefined}
      data-ring-overrun={ring && progress.overrun ? 'true' : undefined}
    >
      {ring && <WaitRing filled={progress.filled} segments={progress.segments} active={progress.active} overrun={progress.overrun} determinate={Boolean(estimateMs)} />}
      <span className="gx-loading-text">{label}{suffix}</span>
      {/* Said once, in words, for anyone who might read the ring as a progress bar. */}
      {estimateMs ? <span className="gx-loading-note">szacunek czasu, nie postęp pracy</span> : null}
    </span>
  );
}

export { RING_SEGMENTS };
