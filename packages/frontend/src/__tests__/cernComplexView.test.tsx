import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CernComplexView, ION_PRESETS, MODE_LABEL, latticeInstances, requestFormation, requestSynthesis } from '../components/CernComplexView';
import { BlackHoleEventHorizonEngine, CONST } from '@genesis/core/cern/BlackHoleEventHorizonEngine.js';
import { MaterialsDiscoveryEngine } from '@genesis/core/cern/MaterialsDiscoveryEngine.js';
import { kernelLedger } from '../core/agent/cyberReasoningKernel';

/**
 * The CERN complex is a client of the single kernel's two CERN providers: the
 * formation attempt and the synthesis it shows are the engines' own (same
 * hashes as calling them directly), anchored in the kernel ledger, with the
 * engines' epistemic labels passed through untouched.
 */
describe('CernComplexView — provider boundary', () => {
  it('requestFormation: 13 TeV is BELOW_THRESHOLD (NOT_FORMED); the ADD scenario is labelled speculative; both anchored', () => {
    const miss = requestFormation(1, 13000, null);
    if ('error' in miss) throw new Error(miss.error);
    expect(miss.label).toBe('NOT_FORMED');
    expect(miss.result.reason).toBe('BELOW_THRESHOLD');
    expect(miss.result.eventHash).toBe(new BlackHoleEventHorizonEngine(1).attemptFormation(13000).eventHash);
    expect(kernelLedger.getEntries().some((e) => e.contentHash === miss.ledgerContentHash)).toBe(true);
    const add = requestFormation(1, 13000, 5);
    if ('error' in add) throw new Error(add.error);
    expect(add.label).toBe('speculative');
    expect(add.result.regime).toBe('ADD_TEV_SPECULATIVE');
    const planck = requestFormation(1, CONST.M_PLANCK_GEV, null);
    if ('error' in planck) throw new Error(planck.error);
    expect(planck.label).toBe('hypothesis');
  });
  it('requestSynthesis: the preset composition gives the engine structure with its ledger anchor and the estimate label', () => {
    const a = requestSynthesis(21, ION_PRESETS.SrTiO3);
    if ('error' in a) throw new Error(a.error);
    expect(a.label).toBe('EMPIRICAL_ESTIMATE_MODEL');
    expect(a.crystal.lattice).toBe('perovskite');
    expect(a.crystal.structureHash).toBe(new MaterialsDiscoveryEngine(21).synthesize(ION_PRESETS.SrTiO3).structureHash);
    expect(kernelLedger.getEntries().some((e) => e.contentHash === a.ledgerContentHash)).toBe(true);
  });
  it('latticeInstances maps every site to one instance and one colour per species', () => {
    const c = new MaterialsDiscoveryEngine(21).synthesize(ION_PRESETS.NaCl);
    const { positions, colors } = latticeInstances(c.sites);
    expect(positions.length).toBe(c.sites.length);
    expect(new Set(colors).size).toBe(2);
    expect(positions[0]).toEqual([-0.16, 0, -0.16]);
  });
});

describe('CernComplexView — static render (no WebGL)', () => {
  const html = renderToStaticMarkup(<CernComplexView />);
  it('renders the stage, the four camera modes, both provider panels and no readout before any run', () => {
    expect(html).toContain('data-testid="cern-complex"');
    expect(html).toContain('data-mode="WALK"');
    for (const id of ['cern-stage', 'cern-mode-WALK', 'cern-mode-GLASS', 'cern-mode-CONSOLE', 'cern-mode-TUNNEL', 'cern-cms-open-data', 'cern-detail-SCHOOL', 'cern-detail-UNIVERSITY', 'cern-detail-RESEARCH', 'cern-sqrts', 'cern-add', 'cern-simulate', 'cern-preset', 'cern-synthesize']) expect(html).toContain(`data-testid="${id}"`);
    expect(Object.keys(MODE_LABEL)).toEqual(['WALK', 'GLASS', 'CONSOLE', 'TUNNEL']);
    expect(html).not.toContain('cern-bh-readout');
    expect(html).not.toContain('cern-mat-readout');
    expect(html).not.toContain('cern-event-panel');
    expect(html).toContain('SPECULATIVE');
    expect(html).toContain('EMPIRICAL_ESTIMATE_MODEL');
    expect(html).toContain('TOY_MC_MODEL');
    expect(html).toContain('REAL CMS DATA');
    expect(html).toContain('ZDERZ PROTONY [Q]');
    expect(html).toContain('WIĄZKI: GOTOWE');
    expect(html).toContain('przeciwbieżne wiązki');
  });
});
