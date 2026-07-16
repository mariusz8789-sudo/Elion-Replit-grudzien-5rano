/**
 * campaigns / decisionTrace / stats / export (Stage 7). Campaigns reuse the Stage 6
 * engine as the single source of truth: decisionTrace is a projection (no recompute),
 * exports carry only verified computations + grounded interpretation + provenance, and
 * the store never recalculates stored descriptors.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';

// The test env is node (no DOM); stub a persistent localStorage like assistantHistory.test.
const store = new Map<string, string>();
const fakeLocalStorage = {
  getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => store.clear(),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() { return store.size; },
};
beforeEach(() => { store.clear(); vi.stubGlobal('window', { localStorage: fakeLocalStorage }); });

import {
  createCampaign, addMolecules, transitionMolecule, pendingMolecules, campaignCandidates,
  getCampaign, listCampaigns, saveCampaign, deleteCampaign, type Campaign, type CampaignMolecule,
} from '../core/campaigns';
import { rankCandidates, decisionTrace, rankingWhy } from '../core/moleculeComparison';
import { campaignSummary } from '../core/campaignStats';
import { campaignToCSV, campaignToJSON } from '../core/campaignExport';
import type { MoleculeProps } from '../core/moleculeInterpretation';

const ASPIRIN: MoleculeProps = { molWt: 180.16, logP: 1.31, tpsa: 63.6, hbd: 1, hba: 3, lipinskiViolations: 0, lipinskiPass: true };
const HEAVY: MoleculeProps = { molWt: 780, logP: 6.8, tpsa: 180, hbd: 7, hba: 13, lipinskiViolations: 3, lipinskiPass: false };

function analysed(m: CampaignMolecule, props: MoleculeProps, alerts: string[] = []): CampaignMolecule {
  return { ...m, status: 'ANALYSED', stage: 'ANALYSED', props, alerts, analysedAt: 1 };
}

/** A campaign with two analysed molecules, persisted. */
function seeded(): Campaign {
  let c = createCampaign({ ownerId: 'u1', name: 'Snake Venom Inhibitors', description: 'd', goal: 'najlepsi kandydaci', owner: 'chemik@lab.io' });
  c = addMolecules(c, [{ name: 'Aspiryna', smiles: 'CC(=O)Oc1ccccc1C(=O)O' }, { name: 'Heavy', smiles: 'X'.repeat(5) }]);
  c = { ...c, molecules: [analysed(c.molecules[0], ASPIRIN), analysed(c.molecules[1], HEAVY, ['epoxide'])] };
  saveCampaign(c);
  return c;
}

describe('campaign store', () => {
  it('creates, lists and reads back a campaign', () => {
    const c = createCampaign({ ownerId: 'u1', name: 'P', description: '', goal: 'g', owner: 'o' });
    expect(listCampaigns('u1').map((x) => x.id)).toContain(c.id);
    expect(getCampaign('u1', c.id)?.goal).toBe('g');
    expect(getCampaign('u2', c.id)).toBeNull(); // scoped per owner
  });
  it('adds molecules as NEW/PENDING and dedupes by SMILES', () => {
    let c = createCampaign({ ownerId: 'u1', name: 'P', description: '', goal: '', owner: 'o' });
    c = addMolecules(c, [{ name: 'A', smiles: 'CCO' }, { name: 'A2', smiles: 'CCO' }, { name: 'B', smiles: 'CCC' }]);
    expect(c.molecules.length).toBe(2);
    expect(c.molecules.every((m) => m.status === 'PENDING' && m.stage === 'NEW')).toBe(true);
    expect(pendingMolecules(c).length).toBe(2);
  });
  it('records a timeline entry on every stage transition and ignores no-op transitions', () => {
    let c = createCampaign({ ownerId: 'u1', name: 'P', description: '', goal: '', owner: 'o' });
    c = addMolecules(c, [{ name: 'A', smiles: 'CCO' }]);
    const id = c.molecules[0].id;
    c = transitionMolecule(c, id, 'SELECTED', 'ręczny wybór');
    expect(c.molecules[0].stage).toBe('SELECTED');
    expect(c.molecules[0].timeline.at(-1)).toMatchObject({ from: 'NEW', to: 'SELECTED', note: 'ręczny wybór' });
    const before = c.molecules[0].timeline.length;
    c = transitionMolecule(c, id, 'SELECTED'); // no-op
    expect(c.molecules[0].timeline.length).toBe(before);
  });
  it('deletes a campaign', () => {
    const c = createCampaign({ ownerId: 'u1', name: 'P', description: '', goal: '', owner: 'o' });
    deleteCampaign('u1', c.id);
    expect(getCampaign('u1', c.id)).toBeNull();
  });
});

describe('campaignCandidates → engine reuse', () => {
  it('turns analysed molecules into engine Candidates without recomputing', () => {
    const c = seeded();
    const cands = campaignCandidates(c);
    expect(cands.length).toBe(2);
    expect(cands[0].props).toBe(c.molecules[0].props); // same object — not recomputed
  });
  it('excludes invalid/pending molecules from ranking', () => {
    let c = createCampaign({ ownerId: 'u1', name: 'P', description: '', goal: '', owner: 'o' });
    c = addMolecules(c, [{ name: 'bad', smiles: 'ZZZ' }]);
    c = { ...c, molecules: [{ ...c.molecules[0], status: 'INVALID', invalidReason: 'Invalid SMILES' }] };
    expect(campaignCandidates(c).length).toBe(0);
  });
});

describe('decisionTrace (single source of truth)', () => {
  it('projects the SAME WHY (+/−) lines the ranking table uses — no second engine', () => {
    const ranked = rankCandidates(campaignCandidates(seeded()));
    for (const c of ranked) {
      const trace = decisionTrace(c);
      const why = rankingWhy(c);
      expect(trace.positives).toEqual(why.filter((w) => w.startsWith('+')));
      expect(trace.negatives).toEqual(why.filter((w) => w.startsWith('−')));
      expect(trace.descriptorsUsed).toEqual(c.scored.parts.map((p) => p.label));
      expect(trace.groundingStatus).toMatch(/RDKit/);
    }
  });
});

describe('campaignSummary', () => {
  it('counts analysed/invalid/pending and buckets verdicts without predictions', () => {
    let c = seeded();
    c = addMolecules(c, [{ name: 'later', smiles: 'CCN' }]); // one pending
    const ranked = rankCandidates(campaignCandidates(c));
    const s = campaignSummary(c, ranked);
    expect(s.analysed).toBe(2);
    expect(s.pending).toBe(1);
    expect(s.total).toBe(3);
    expect(s.rejected.length).toBe(1); // HEAVY rejected
    expect(s.averages?.count).toBe(2);
    expect(s.grounding.withAlerts).toBe(1);
    expect(s.grounding.note).toMatch(/[Bb]ez predykcji/);
  });
});

describe('exports carry only verified + grounded + provenance', () => {
  const meta = { rdkitVersion: '2026.03.3', generatedAt: 1_700_000_000_000 };
  it('CSV includes descriptors, verdict, provenance and an invalid row', () => {
    let c = seeded();
    c = addMolecules(c, [{ name: 'bad', smiles: 'QQQ' }]);
    c = { ...c, molecules: c.molecules.map((m) => m.status === 'PENDING' ? { ...m, status: 'INVALID' as const, invalidReason: 'Invalid SMILES' } : m) };
    const csv = campaignToCSV(c, meta);
    expect(csv.split('\n')[0]).toContain('score,verdict,molWt');
    expect(csv).toMatch(/2026\.03\.3/);
    expect(csv).toMatch(/Invalid SMILES/);
    expect(csv).toMatch(/genesis-grounding\/1/);
  });
  it('JSON marks experimental validation required and asserts no biological CLAIM', () => {
    const json = JSON.parse(campaignToJSON(seeded(), meta));
    expect(json.experimentalValidationRequired).toBe(true);
    expect(json.provenance.rdkitVersion).toBe('2026.03.3');
    expect(json.molecules[0].verifiedComputations).toBeTruthy();
    // Disclaimers may mention biology to DENY it; only positive activity/efficacy claims are forbidden.
    const forbidden = /\b(jest aktywn|wykazuje aktywność|będzie skuteczn|jest skuteczn|leczy|potwierdzona skuteczność)\b/i;
    expect(JSON.stringify(json)).not.toMatch(forbidden);
  });
});
