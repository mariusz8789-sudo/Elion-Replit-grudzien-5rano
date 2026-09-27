import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { LAB_CAMPUS_DOORS, LabFpvView, runMix, stateFile } from '../components/LabFpvView';
import { ThermodynamicLabEngine } from '@genesis/core/lab/ThermodynamicLabEngine.js';
import { kernelLedger } from '../core/agent/cyberReasoningKernel';

/**
 * The FPV lab is a client of the single kernel's thermo-lab provider: the
 * result it paints is the engine's own, anchored in the kernel ledger, and
 * the state file is that result verbatim with its ledger hash.
 */
describe('LabFpvView — provider boundary and state file', () => {
  it('runMix returns the engine result through the kernel with its ledger anchor and the model label', () => {
    const a = runMix(0x4c4142, { H2: 2, O2: 1 }, true, 298.15);
    expect('error' in a).toBe(false);
    if ('error' in a) return;
    expect(a.label).toBe('THERMODYNAMIC_MODEL');
    expect(a.result.eventHash).toBe(new ThermodynamicLabEngine(0x4c4142).mix({ H2: 2, O2: 1 }, true, 298.15).eventHash);
    expect(a.result.outcome.explosion).toBe(true);
    expect(kernelLedger.getEntries().some((e) => e.contentHash === a.ledgerContentHash)).toBe(true);
  });
  it('the state file is the engine result plus its anchor, parseable, nothing added', () => {
    const a = runMix(1, { HCl_aq: 1, NaOH_aq: 1 }, false, 298.15);
    if ('error' in a) throw new Error(a.error);
    const parsed = JSON.parse(stateFile(a, { HCl_aq: 1, NaOH_aq: 1 }, false, 298.15));
    expect(parsed.kind).toBe('genesis-lab-fpv-state');
    expect(parsed.result).toEqual(a.result);
    expect(parsed.ledgerContentHash).toBe(a.ledgerContentHash);
    expect(parsed.input).toEqual({ reagents: { HCl_aq: 1, NaOH_aq: 1 }, ignition: false, T0: 298.15 });
  });
});

describe('LabFpvView — static render (no WebGL)', () => {
  const html = renderToStaticMarkup(<LabFpvView />);
  it('renders the bench with every tabulated species, the controls, and no result before mixing', () => {
    expect(html).toContain('data-testid="lab-fpv"');
    for (const id of ['lab-stage', 'lab-mix', 'lab-save', 'lab-record', 'lab-ignition', 'lab-t0', 'lab-amt-H2', 'lab-amt-CuSO4_aq']) expect(html).toContain(`data-testid="${id}"`);
    expect(html).not.toContain('data-testid="lab-readout"');
    expect(html).toContain('2 H2 + O2 -&gt; 2 H2O(g)');
    expect(html).toContain('data-testid="lab-campus-doors"');
    for (const door of LAB_CAMPUS_DOORS) {
      expect(html).toContain(`data-testid="lab-door-${door.id}"`);
      expect(door.hash.startsWith('#/')).toBe(true);
    }
    expect(new Set(LAB_CAMPUS_DOORS.map((door) => door.hash)).size).toBe(LAB_CAMPUS_DOORS.length);
  });
});
