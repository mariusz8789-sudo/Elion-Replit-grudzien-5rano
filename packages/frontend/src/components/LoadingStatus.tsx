import { useEffect, useState } from 'react';
import { countdownSeconds } from '../core/product/durationEstimate';

export interface LoadingStatusProps {
  readonly label: string;
  /** A measured estimate (core/product/durationEstimate). Absent/null → no countdown, never a guess. */
  readonly estimateMs?: number | null;
  readonly testId?: string;
  /** Set false when the status sits inside another control that already announces itself. */
  readonly announce?: boolean;
}

/** One loading indicator: counts seconds down when the wait has a measured length, otherwise just says what is loading. */
export function LoadingStatus({ label, estimateMs = null, testId, announce = true }: LoadingStatusProps) {
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  useEffect(() => {
    if (!estimateMs) return undefined;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [estimateMs]);
  const remaining = estimateMs ? countdownSeconds(estimateMs, now - startedAt) : null;
  const suffix = remaining === null ? '…' : remaining > 0 ? ` · ok. ${remaining} s` : ' · dłużej niż ostatnio…';
  return (
    <span role={announce ? 'status' : undefined} data-testid={testId} data-remaining-s={remaining ?? undefined}>
      {label}{suffix}
    </span>
  );
}
