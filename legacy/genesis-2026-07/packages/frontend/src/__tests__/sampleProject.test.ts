/**
 * Sample project (first-user experience). Proves the one-click sample is a real,
 * honest starting point: real molecules with SMILES, added as PENDING with NO
 * pre-computed descriptor values (nothing is passed off as an RDKit result), and
 * deterministic ids so loading twice upserts instead of duplicating.
 */
import { describe, expect, it } from 'vitest';
import { buildSampleCampaigns } from '../core/sampleProject';

describe('buildSampleCampaigns', () => {
  it('creates real projects owned by the user with stable ids', () => {
    const a = buildSampleCampaigns('u1', 'me@lab.org', 1000);
    const b = buildSampleCampaigns('u1', 'me@lab.org', 9999);
    expect(a).toHaveLength(2);
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id)); // deterministic ids
    for (const c of a) {
      expect(c.ownerId).toBe('u1');
      expect(c.owner).toBe('me@lab.org');
      expect(c.molecules.length).toBeGreaterThan(0);
    }
  });

  it('adds molecules as PENDING with real SMILES and NO fabricated results', () => {
    const [triage] = buildSampleCampaigns('u1', 'me@lab.org', 1000);
    for (const m of triage.molecules) {
      expect(m.status).toBe('PENDING');       // user runs the real analysis
      expect(m.props).toBeUndefined();          // nothing pretends to be an RDKit result
      expect(m.smiles.length).toBeGreaterThan(2);
      expect(m.name.length).toBeGreaterThan(0);
    }
    expect(triage.molecules.map((m) => m.name)).toContain('Aspirin');
  });

  it('labels the projects as samples so they are never mistaken for real analyses', () => {
    for (const c of buildSampleCampaigns('u1', 'me@lab.org', 1000)) {
      expect(c.name.toLowerCase()).toContain('sample');
    }
  });
});
