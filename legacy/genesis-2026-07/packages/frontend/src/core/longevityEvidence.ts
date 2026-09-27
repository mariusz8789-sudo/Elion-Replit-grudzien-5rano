import { useCallback, useEffect, useState } from 'react';
import type { EvidenceRecord } from '@genesis-os/reasoning/evidence';
import { getToken } from './backend/session';
import { listStoredEvidence, storeEvidence, type StoredEvidence, type ApiResult } from './backend/client';

/**
 * Evidence, held where it can survive a reload.
 *
 * Until Phase 0 these records lived in a `useState` inside LongevityScreen: a
 * scientist could spend an afternoon entering studies and lose all of it by
 * refreshing. Nothing could be reviewed, cited by an artifact, or replayed.
 *
 * WHY THIS IS NOT SIMPLY "MOVE IT TO THE SERVER". Genesis is local-first by
 * design — the app must keep working with no backend and no account, and that
 * promise is not negotiable for one feature. So this does both, and is explicit
 * about which is in force:
 *
 *   signed in    → the server is the source of truth; records are graded there
 *   signed out   → records stay in memory and `persisted` is false
 *   offline      → same, and `error` says the write did not reach the server
 *
 * The one thing it will NOT do is pretend. A record that failed to store is
 * still shown — losing what someone typed is worse — but it is never reported
 * as saved, because someone who believes their evidence is on the server closes
 * the tab.
 *
 * The two decisions live in plain functions below rather than inside the hook,
 * so they can be tested by calling them. A rule that can only be exercised by
 * rendering a component is a rule that mostly goes untested.
 */

/** Server row → the shape the reasoning core and the UI already speak. */
export function toRecord(row: StoredEvidence): EvidenceRecord {
  return {
    id: row.id,
    interventionId: row.intervention ?? '',
    hallmarkId: row.hallmark ?? '',
    tier: row.tier,
    outcome: row.outcome,
    direction: row.direction,
    citation: row.citation,
    system: row.species ?? '',
    replicated: false,
    randomised: false,
    blinded: false,
    preregistered: false,
    sampleSize: row.sample_size ?? 0,
    readoutKind: 'direct',
    addedAt: row.created_at,
  } as unknown as EvidenceRecord;
}

export interface SyncState {
  records: EvidenceRecord[];
  persisted: boolean;
  error: string | null;
}

/** What to show after an attempted load. Pure: the fetch is the caller's job. */
export function resolveLoad(result: ApiResult<StoredEvidence[]> | null): SyncState {
  if (result === null) return { records: [], persisted: false, error: null }; // signed out
  if (result.ok) return { records: result.data.map(toRecord), persisted: true, error: null };
  // Signed in but unreachable. An empty list here would read as "you have no
  // evidence", which is a different and much more alarming statement.
  return {
    records: [], persisted: false,
    error: 'Evidence could not be loaded from the server. Working locally — new records will not be saved.',
  };
}

/** What to keep after an attempted write. The draft is never discarded. */
export function resolveAdd(
  draft: EvidenceRecord,
  result: ApiResult<{ evidence: StoredEvidence }> | null,
): { record: EvidenceRecord; persisted: boolean; error: string | null } {
  if (result === null) return { record: draft, persisted: false, error: null }; // signed out: expected, not an error
  if (result.ok) {
    // The SERVER's grade is authoritative — the browser's was a preview, and
    // only the stored one carries a graded_with version.
    return { record: toRecord(result.data.evidence), persisted: true, error: null };
  }
  return {
    record: draft, persisted: false,
    error: result.message || 'The record was not saved to the server. It is shown here but exists only in this tab.',
  };
}

export interface EvidenceStore extends SyncState {
  loading: boolean;
  add: (record: EvidenceRecord) => Promise<void>;
}

export function useEvidenceStore(): EvidenceStore {
  const [state, setState] = useState<SyncState>({ records: [], persisted: false, error: null });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    listStoredEvidence(token).then((r) => {
      if (cancelled) return;
      setLoading(false);
      setState(resolveLoad(r));
    });
    return () => { cancelled = true; };
  }, []);

  const add = useCallback(async (record: EvidenceRecord) => {
    const token = getToken();
    const result = token
      ? await storeEvidence(token, record as unknown as Record<string, unknown>)
      : null;
    const outcome = resolveAdd(record, result);
    setState((prev) => ({
      records: [...prev.records, outcome.record],
      persisted: prev.persisted && outcome.persisted,
      error: outcome.error,
    }));
  }, []);

  return { ...state, loading, add };
}
