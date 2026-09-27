import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ChemistrySessionVisual from '../components/ChemistrySessionVisual';
import { createChemistryExperimentRunner } from '../core/scientificWorlds/chemistryRunners';
import { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';

const ledger = new EvidenceLedger({ now: () => Date.now() });
const runner = createChemistryExperimentRunner('world:test', ledger);

describe('ChemistrySessionVisual — renders the SAME sealed artifact, never re-simulates', () => {
  it('renders nothing for a null artifact', () => {
    expect(renderToStaticMarkup(<ChemistrySessionVisual artifact={null} />)).toBe('');
  });

  it('renders nothing for a chemistry artifact kind it does not have a chart for (sample identification)', () => {
    const result = runner('chemistry-sample-identification', 1, {});
    expect(renderToStaticMarkup(<ChemistrySessionVisual artifact={result.artifact} />)).toBe('');
  });

  it('docking: renders three fit bars and the binding score, using the values already in the artifact', () => {
    const result = runner('chemistry-molecular-docking', 1, { receptorId: 'receptor:kinase-atp-pocket-illustrative' });
    const artifact = result.artifact;
    if (artifact.kind !== 'chemistry-docking') throw new Error('expected chemistry-docking artifact');
    const markup = renderToStaticMarkup(<ChemistrySessionVisual artifact={artifact} />);
    expect(markup).toContain('sw-chem-docking-visual');
    expect(markup).toContain('sw-chem-fit-electrostatic');
    expect(markup).toContain('sw-chem-fit-hydrophobic');
    expect(markup).toContain('sw-chem-fit-steric');
    expect(markup).toContain(artifact.result.receptorLabel);
    expect(markup).toContain(artifact.result.bindingScore.toFixed(1));
    const expectedPct = `${Math.round(artifact.result.contacts.electrostaticFit * 100)}%`;
    expect(markup).toContain(expectedPct);
  });

  it('pharmacokinetics: renders a chart with one point per series entry and the real half-life/Cmax values', () => {
    const result = runner('chemistry-pharmacokinetics', 2, { timeSeconds: 30, activity: 0.25 });
    const artifact = result.artifact;
    if (artifact.kind !== 'chemistry-pharmacokinetics') throw new Error('expected chemistry-pharmacokinetics artifact');
    const markup = renderToStaticMarkup(<ChemistrySessionVisual artifact={artifact} />);
    expect(markup).toContain('sw-chem-pk-visual');
    expect(markup).toContain('sw-chem-pk-chart');
    const pointCount = (markup.match(/points="[^"]*"/)?.[0].match(/\d+\.\d,\d+\.\d/g) ?? []).length;
    expect(pointCount).toBe(artifact.profile.series.length);
    expect(markup).toContain(artifact.profile.halfLifeHours.toFixed(2));
    expect(markup).toContain(artifact.profile.cMaxProxyMgL.toFixed(3));
    expect(markup).toContain(String(artifact.profile.doseMg));
  });

  it('is deterministic: identical artifact renders identical markup', () => {
    const result = runner('chemistry-molecular-docking', 1, {});
    const a = renderToStaticMarkup(<ChemistrySessionVisual artifact={result.artifact} />);
    const b = renderToStaticMarkup(<ChemistrySessionVisual artifact={result.artifact} />);
    expect(a).toBe(b);
  });
});
