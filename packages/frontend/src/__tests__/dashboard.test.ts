/**
 * Scientific Command Center view-model logic (Genesis V3, P0 · Milestone 2). Proves the
 * pure functions behind the dashboard are honest and correct: the reproducibility badge
 * reflects real analysis completeness, attention is derived only from real facts, the
 * leading candidate comes from the single scoring engine, and the view model assembles
 * and sorts correctly. No DOM, no network.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  reproState, reproLabel, deriveAttention, leadingCandidate, relativeTime, buildCommandCenter,
} from '../core/dashboard';
import { setLocale } from '../core/i18n';

// These assertions read the English strings; pin the locale so they're deterministic.
beforeEach(() => { setLocale('en'); });
import type { Campaign, CampaignMolecule } from '../core/campaigns';
import type { PortfolioEntry } from '../core/backend/client';
import type { MoleculeProps } from '../core/moleculeInterpretation';

const ASPIRIN: MoleculeProps = { molWt: 180.16, logP: 1.31, tpsa: 63.6, hbd: 1, hba: 3, lipinskiViolations: 0, lipinskiPass: true };
const HEAVY: MoleculeProps = { molWt: 780, logP: 6.8, tpsa: 180, hbd: 7, hba: 13, lipinskiViolations: 3, lipinskiPass: false };

function analysedMol(id: string, props: MoleculeProps): CampaignMolecule {
  return { id, name: id, smiles: 'x', status: 'ANALYSED', stage: 'ANALYSED', props, alerts: [], analysedAt: 1, timeline: [] };
}
function campaign(molecules: CampaignMolecule[]): Campaign {
  return { id: 'c1', ownerId: 'u1', name: 'C1', description: '', goal: '', owner: 'o', createdAt: 1, status: 'ACTIVE', molecules };
}
function entry(over: Partial<PortfolioEntry> = {}): PortfolioEntry {
  return {
    id: 'c1', name: 'C1', status: 'ACTIVE', role: 'owner', ownerId: 'u1',
    total: 0, analysed: 0, pending: 0, invalid: 0, unresolvedComments: 0, snapshotCount: 0,
    createdAt: 1, updatedAt: 1, lastActivityAt: 1, ...over,
  };
}

describe('reproState / reproLabel — honest analysis completeness', () => {
  it('all analysed is verified, some is partial, none is unchecked', () => {
    expect(reproState(2, 2)).toBe('verified');
    expect(reproState(1, 2)).toBe('partial');
    expect(reproState(0, 3)).toBe('unchecked');
    expect(reproState(0, 0)).toBe('unchecked');
  });
  it('labels never overclaim', () => {
    expect(reproLabel(2, 2)).toBe('Verified');
    expect(reproLabel(1, 3)).toBe('1/3 analysed');
    expect(reproLabel(0, 2)).toBe('Not analysed');
    expect(reproLabel(0, 0)).toBe('No molecules');
  });
});

describe('leadingCandidate — via the single scoring engine', () => {
  it('ranks the more developable molecule first', () => {
    const lead = leadingCandidate(campaign([analysedMol('heavy', HEAVY), analysedMol('aspirin', ASPIRIN)]));
    expect(lead?.name).toBe('aspirin');
    expect(lead?.decision.verdict).toBe('CONTINUE');
  });
  it('returns null when nothing is analysed', () => {
    expect(leadingCandidate(campaign([]))).toBeNull();
  });
});

describe('deriveAttention — facts only, never fabricated', () => {
  it('a clean, fully-analysed project needs no attention', () => {
    const lead = leadingCandidate(campaign([analysedMol('aspirin', ASPIRIN)]));
    const a = deriveAttention(entry({ total: 1, analysed: 1 }), lead);
    expect(a.severity).toBe(0);
    expect(a.reasons).toEqual([]);
  });
  it('flags unresolved comments', () => {
    const a = deriveAttention(entry({ total: 2, analysed: 2, unresolvedComments: 3 }));
    expect(a.severity).toBeGreaterThan(0);
    expect(a.reasons.join(' ')).toContain('3 unresolved comments');
  });
  it('flags a project with nothing analysed', () => {
    const a = deriveAttention(entry({ total: 5, analysed: 0, pending: 5 }));
    expect(a.reasons.join(' ')).toContain('No molecules analysed yet');
  });
  it('flags partial analysis without overclaiming', () => {
    const a = deriveAttention(entry({ total: 5, analysed: 3, pending: 2 }));
    expect(a.reasons.join(' ')).toContain('2 molecules awaiting analysis');
  });
  it('flags a leading candidate the scoring engine rejects', () => {
    const lead = leadingCandidate(campaign([analysedMol('heavy', HEAVY)]));
    expect(lead?.decision.verdict).toBe('REJECT');
    const a = deriveAttention(entry({ total: 1, analysed: 1 }), lead);
    expect(a.reasons.join(' ')).toContain('Reject for now');
  });
});

describe('relativeTime', () => {
  const now = 10_000_000_000;
  it('formats recent and older timestamps', () => {
    expect(relativeTime(now - 30_000, now)).toBe('just now');
    expect(relativeTime(now - 5 * 60_000, now)).toBe('5m ago');
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3h ago');
    expect(relativeTime(now - 25 * 3_600_000, now)).toBe('yesterday');
    expect(relativeTime(now - 4 * 86_400_000, now)).toBe('4d ago');
  });
  it('guards invalid input', () => {
    expect(relativeTime(0, now)).toBe('—');
    expect(relativeTime(now + 1000, now)).toBe('—');
  });
});

describe('buildCommandCenter — assembles and sorts the view model', () => {
  it('continue is the first (most recent) row; attention is filtered and sorted', () => {
    const portfolio: PortfolioEntry[] = [
      entry({ id: 'recent', name: 'Recent', total: 2, analysed: 2, lastActivityAt: 100 }),      // clean
      entry({ id: 'stale', name: 'Stale', total: 3, analysed: 0, pending: 3, lastActivityAt: 50, unresolvedComments: 1 }), // high severity
    ];
    const model = buildCommandCenter(portfolio, new Map());
    expect(model.rows).toHaveLength(2);
    expect(model.continueRow?.entry.id).toBe('recent');
    expect(model.needsAttention.map((r) => r.entry.id)).toEqual(['stale']);
  });
  it('sorts multiple attention rows by severity, highest first', () => {
    const portfolio: PortfolioEntry[] = [
      entry({ id: 'low', total: 4, analysed: 3, pending: 1, lastActivityAt: 100 }),               // severity 1
      entry({ id: 'high', total: 4, analysed: 0, pending: 4, unresolvedComments: 2, lastActivityAt: 90 }), // severity 4
    ];
    const model = buildCommandCenter(portfolio, new Map());
    expect(model.needsAttention.map((r) => r.entry.id)).toEqual(['high', 'low']);
  });
});
