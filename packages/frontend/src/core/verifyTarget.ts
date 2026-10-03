/**
 * "VERIFY THIS RESULT" — how a result screen hands one executed experiment to
 * Genesis Verify (`#/verify`) so the project, research run and experiment are
 * already picked there.
 *
 * Two carriers, read in this order:
 *   1. in-app state: the link's click remembers the target here, so it arrives
 *      even when the hash is reduced to a plain `#/verify` (shared links keep
 *      only a plain anchor);
 *   2. route params on the hash, `#/verify?project=…&run=…&experiment=…`, the
 *      same `?` form other routes already use (`#/dossier?candidate=…`).
 * The in-app target is consumed once; Verify never guesses an id it was not
 * given, and an id the server does not list is simply not preselected.
 */

export interface VerifyTarget {
  readonly projectId?: string | null;
  readonly researchRunId: string;
  readonly experimentId?: string | null;
}

export const VERIFY_HASH = '#/verify';

let pending: VerifyTarget | null = null;
let latest: VerifyTarget | null = null;

/** The link target: `#/verify` with route params for the ids it carries. */
export function verifyHref(target: VerifyTarget): string {
  const params = new URLSearchParams();
  if (target.projectId) params.set('project', target.projectId);
  params.set('run', target.researchRunId);
  if (target.experimentId) params.set('experiment', target.experimentId);
  return `${VERIFY_HASH}?${params.toString()}`;
}

/** Called on the link's click: the next Verify screen picks this target. */
export function rememberVerifyTarget(target: VerifyTarget): void {
  pending = target;
  latest = target;
}

/** Called when a screen shows an executed result, so the Reviewer Room can offer to verify it. */
export function noteLatestResult(target: VerifyTarget): void {
  latest = target;
}

/** The most recent executed result shown in this visit, or null. */
export function latestResult(): VerifyTarget | null {
  return latest;
}

/** Route params of a `#/verify?…` hash, or null for a plain `#/verify` (or another route). */
export function verifyTargetFromHash(hash: string): VerifyTarget | null {
  if (!hash.startsWith(`${VERIFY_HASH}?`)) return null;
  const params = new URLSearchParams(hash.slice(VERIFY_HASH.length + 1));
  const researchRunId = params.get('run');
  if (!researchRunId) return null;
  return { projectId: params.get('project'), researchRunId, experimentId: params.get('experiment') };
}

/** What the Verify screen preselects: the in-app target (consumed), else the hash params. */
export function takeVerifyTarget(hash: string): VerifyTarget | null {
  const fromState = pending;
  pending = null;
  return fromState ?? verifyTargetFromHash(hash);
}

/** Test seam. */
export function resetVerifyTargets(): void {
  pending = null;
  latest = null;
}
