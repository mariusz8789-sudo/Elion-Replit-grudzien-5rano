/**
 * dashboard (Genesis V3, P0 — the Scientific Command Center) — pure view-model logic
 * for the morning screen. No React, no I/O: every function here is deterministic and
 * unit-tested, so the component stays a thin renderer.
 *
 * Scientific honesty (the governing principle): attention and reproducibility are
 * derived ONLY from data that already exists — molecule-analysis provenance, unresolved
 * comments, and the real scoring engine's verdict. Nothing here invents a "verification"
 * state for a system Genesis does not actually run (replay-verification lives on Scientific
 * Runs, not on campaign snapshots), and the leading candidate is produced by the ONE
 * scoring engine (core/moleculeComparison.ts), never re-implemented.
 */
import type { PortfolioEntry } from './backend/client';
import { rankCandidates, type RankedCandidate, type Verdict } from './moleculeComparison';
import { campaignCandidates, type Campaign } from './campaigns';

/** Campaign-level analysis completeness — the honest basis for the reproducibility badge. */
export type ReproState = 'verified' | 'partial' | 'unchecked';

export function reproState(analysed: number, total: number): ReproState {
  if (total > 0 && analysed >= total) return 'verified';
  if (analysed > 0) return 'partial';
  return 'unchecked';
}

/** Human label for the badge. "Verified" means every molecule carries real RDKit descriptors. */
export function reproLabel(analysed: number, total: number): string {
  switch (reproState(analysed, total)) {
    case 'verified': return 'Verified';
    case 'partial': return `${analysed}/${total} analysed`;
    default: return total === 0 ? 'No molecules' : 'Not analysed';
  }
}

/** English labels for the scoring engine's verdicts (the Command Center is English-first per V3). */
export const VERDICT_LABEL_EN: Record<Verdict, string> = {
  CONTINUE: 'Continue',
  NEEDS_EXPERIMENTS: 'Needs experiments',
  HIGH_UNCERTAINTY: 'High uncertainty',
  REJECT: 'Reject for now',
};

/** The leading candidate of a campaign, via the single scoring engine. Null if nothing is analysed. */
export function leadingCandidate(campaign: Campaign): RankedCandidate | null {
  const candidates = campaignCandidates(campaign);
  if (!candidates.length) return null;
  return rankCandidates(candidates)[0] ?? null;
}

export interface Attention {
  reasons: string[];
  severity: number;
}

/**
 * What (if anything) makes a project need attention today. Facts only:
 *  - unresolved comments (a colleague is waiting),
 *  - molecules not yet analysed (work left undone),
 *  - the leading candidate flagged REJECT / HIGH_UNCERTAINTY by the real ranking rules.
 * `leading` is optional so the same function works for shared campaigns whose molecule
 * data isn't held locally — it degrades to comment/analysis signals, never fabricates one.
 */
export function deriveAttention(entry: PortfolioEntry, leading?: RankedCandidate | null): Attention {
  const reasons: string[] = [];
  let severity = 0;

  if (entry.unresolvedComments > 0) {
    reasons.push(`${entry.unresolvedComments} unresolved comment${entry.unresolvedComments > 1 ? 's' : ''}`);
    severity += 2;
  }
  if (entry.total > 0 && entry.analysed === 0) {
    reasons.push('No molecules analysed yet');
    severity += 2;
  } else if (entry.pending > 0) {
    reasons.push(`${entry.pending} molecule${entry.pending > 1 ? 's' : ''} awaiting analysis`);
    severity += 1;
  }
  if (leading && (leading.decision.verdict === 'REJECT' || leading.decision.verdict === 'HIGH_UNCERTAINTY')) {
    reasons.push(`Leading candidate flagged "${VERDICT_LABEL_EN[leading.decision.verdict]}"`);
    severity += 1;
  }
  return { reasons, severity };
}

/** Short relative-time label ("just now", "2h ago", "yesterday", "3d ago", or a date). */
export function relativeTime(ts: number, now: number): string {
  const ms = now - ts;
  if (!Number.isFinite(ts) || ts <= 0 || ms < 0) return '—';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return 'yesterday';
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w ago`;
  return new Date(ts).toISOString().slice(0, 10);
}

export interface CommandCenterRow {
  entry: PortfolioEntry;
  leading: RankedCandidate | null;
  attention: Attention;
}

/**
 * Assemble the dashboard view model. `localById` supplies locally-held campaign data
 * (owned campaigns, local-first) so the scoring engine can compute a leading candidate;
 * entries without local data simply carry `leading: null` (honest, not blank-filled).
 */
export function buildCommandCenter(
  portfolio: PortfolioEntry[],
  localById: Map<string, Campaign>,
): { rows: CommandCenterRow[]; needsAttention: CommandCenterRow[]; continueRow: CommandCenterRow | null } {
  const rows: CommandCenterRow[] = portfolio.map((entry) => {
    const local = localById.get(entry.id) ?? null;
    const leading = local ? leadingCandidate(local) : null;
    return { entry, leading, attention: deriveAttention(entry, leading) };
  });
  const needsAttention = rows
    .filter((r) => r.attention.severity > 0)
    .sort((a, b) => b.attention.severity - a.attention.severity || b.entry.lastActivityAt - a.entry.lastActivityAt);
  // Portfolio arrives already sorted by lastActivity desc, so the first row is "continue".
  const continueRow = rows[0] ?? null;
  return { rows, needsAttention, continueRow };
}
