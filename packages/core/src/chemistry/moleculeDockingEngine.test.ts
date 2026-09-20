import { describe, expect, it } from 'vitest';
import { dockLigand } from './moleculeDockingEngine.js';
import { RECEPTORS } from './receptorVisuals.js';
import { chemistryAdapter } from './chemistryKnowledgeAdapter.js';

const H2SO4_SMILES = 'O=S(=O)(O)O';
const BENZENE_SMILES = 'c1ccccc1';

describe('moleculeDockingEngine — deterministic docking heuristic', () => {
  it('is fully deterministic: identical ligand + receptor always yields an identical DockingResult', () => {
    const a = dockLigand(H2SO4_SMILES, RECEPTORS[0].id);
    const b = dockLigand(H2SO4_SMILES, RECEPTORS[0].id);
    expect(a).toEqual(b);
  });

  it('reuses the canonical chemistryKnowledgeAdapter\'s own SMILES (w-h2so4) rather than a fabricated string', () => {
    const compound = chemistryAdapter.getCompound('w-h2so4');
    expect(compound?.smiles).toBe(H2SO4_SMILES);
    expect(() => dockLigand(compound!.smiles!, RECEPTORS[0].id)).not.toThrow();
  });

  it('throws on an unknown receptor id rather than silently substituting one', () => {
    expect(() => dockLigand(H2SO4_SMILES, 'receptor:does-not-exist')).toThrow('UNKNOWN_RECEPTOR');
  });

  it('throws on an unparseable ligand SMILES rather than silently substituting one', () => {
    expect(() => dockLigand('not a smiles $', RECEPTORS[0].id)).toThrow();
  });

  it('receptor hydrophobicity actually participates: a polar ligand and a lipophilic ligand rank oppositely across a polar vs. a hydrophobic pocket', () => {
    const kinase = RECEPTORS.find((r) => r.id === 'receptor:kinase-atp-pocket-illustrative')!; // hydrophobicity 0.45 (more polar)
    const nuclear = RECEPTORS.find((r) => r.id === 'receptor:nuclear-hormone-illustrative')!; // hydrophobicity 0.85 (very hydrophobic)
    expect(kinase.hydrophobicity).toBeLessThan(nuclear.hydrophobicity);

    const polarLigand = dockLigand(H2SO4_SMILES, kinase.id).contacts.hydrophobicFit;
    const polarLigandVsHydrophobic = dockLigand(H2SO4_SMILES, nuclear.id).contacts.hydrophobicFit;
    const lipophilicLigand = dockLigand(BENZENE_SMILES, nuclear.id).contacts.hydrophobicFit;
    const lipophilicLigandVsPolarSite = dockLigand(BENZENE_SMILES, kinase.id).contacts.hydrophobicFit;

    // The polar ligand fits the more-polar (kinase) pocket better than the very hydrophobic (nuclear) pocket, and vice versa for the lipophilic ligand.
    expect(polarLigand).toBeGreaterThan(polarLigandVsHydrophobic);
    expect(lipophilicLigand).toBeGreaterThan(lipophilicLigandVsPolarSite);
  });

  it('receptor chargeProfile actually participates: an anionic ligand fits the receptor with the stronger positive patch better', () => {
    const anion = '[O-]S(=O)(=O)[O-]'; // net -2 ligand
    const kinase = dockLigand(anion, 'receptor:kinase-atp-pocket-illustrative'); // positivePatchStrength 0.55
    const gpcr = dockLigand(anion, 'receptor:gpcr-orthosteric-illustrative'); // positivePatchStrength 0.2
    const kinasePositive = RECEPTORS.find((r) => r.id === 'receptor:kinase-atp-pocket-illustrative')!.chargeProfile.positivePatchStrength;
    const gpcrPositive = RECEPTORS.find((r) => r.id === 'receptor:gpcr-orthosteric-illustrative')!.chargeProfile.positivePatchStrength;
    expect(kinasePositive).toBeGreaterThan(gpcrPositive);
    expect(kinase.contacts.electrostaticFit).toBeGreaterThan(gpcr.contacts.electrostaticFit);
  });

  it('binding-site geometry actually participates: a small ligand fits a small pocket better than an oversized one, and vice versa', () => {
    const smallLigand = 'CC'; // ethane, 2 heavy atoms
    const largeLigand = 'CCCCCCCCCCCCCCCCCCCC'; // 20-carbon chain, far larger than any receptor's ideal extent
    const kinasePocketVolume = RECEPTORS.find((r) => r.id === 'receptor:kinase-atp-pocket-illustrative')!.bindingSiteGeometry.pocketVolumeA3;
    const nuclearPocketVolume = RECEPTORS.find((r) => r.id === 'receptor:nuclear-hormone-illustrative')!.bindingSiteGeometry.pocketVolumeA3;
    expect(nuclearPocketVolume).toBeGreaterThan(kinasePocketVolume);

    const smallInSmallPocket = dockLigand(smallLigand, 'receptor:kinase-atp-pocket-illustrative').contacts.stericFit;
    const smallInLargePocket = dockLigand(smallLigand, 'receptor:nuclear-hormone-illustrative').contacts.stericFit;
    expect(smallInSmallPocket).toBeGreaterThan(smallInLargePocket);

    const largeInLargePocket = dockLigand(largeLigand, 'receptor:nuclear-hormone-illustrative').contacts.stericFit;
    const largeInSmallPocket = dockLigand(largeLigand, 'receptor:kinase-atp-pocket-illustrative').contacts.stericFit;
    expect(largeInLargePocket).toBeGreaterThan(largeInSmallPocket);
  });

  it('bindingScore and every fit term stay within their declared bounds', () => {
    for (const receptor of RECEPTORS) {
      for (const smiles of [H2SO4_SMILES, BENZENE_SMILES, 'CC(=O)Oc1ccccc1C(=O)O']) {
        const r = dockLigand(smiles, receptor.id);
        expect(r.bindingScore).toBeGreaterThanOrEqual(0);
        expect(r.bindingScore).toBeLessThanOrEqual(100);
        expect(r.contacts.electrostaticFit).toBeGreaterThanOrEqual(0);
        expect(r.contacts.electrostaticFit).toBeLessThanOrEqual(1);
        expect(r.contacts.hydrophobicFit).toBeGreaterThanOrEqual(0);
        expect(r.contacts.hydrophobicFit).toBeLessThanOrEqual(1);
        expect(r.contacts.stericFit).toBeGreaterThanOrEqual(0);
        expect(r.contacts.stericFit).toBeLessThanOrEqual(1);
        expect(r.affinityProxyKcalMol).toBeLessThanOrEqual(0);
        expect(r.epistemic).toBe('MODEL');
      }
    }
  });
});
