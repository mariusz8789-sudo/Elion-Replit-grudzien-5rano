import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ColliderChamber, PROCESS_LABEL, requestEvent, summarise } from '../components/ColliderChamber';
import { QuantumColliderEngine } from '@genesis/core/collider/QuantumColliderEngine.js';
import { kernelLedger } from '../core/agent/cyberReasoningKernel';

/**
 * The detector view is a client of the single kernel's collider provider:
 * the event it shows is the engine's own (same hash as calling the engine
 * directly), already anchored in the kernel ledger, labelled as a toy model.
 */
describe('ColliderChamber — provider boundary', () => {
  it('requestEvent returns the engine event through the kernel, with its ledger anchor and the model label', () => {
    const a = requestEvent(42, 7, 13000);
    expect('error' in a).toBe(false);
    if ('error' in a) return;
    expect(a.label).toBe('TOY_MC_MODEL');
    expect(a.event.eventHash).toBe(new QuantumColliderEngine(42).generateEvent(7).eventHash);
    expect(kernelLedger.getEntries().some((e) => e.contentHash === a.ledgerContentHash)).toBe(true);
    const again = requestEvent(42, 7, 13000);
    expect('error' in again ? 'ERROR' : again.event.eventHash).toBe(a.event.eventHash);
  });
  it('summarise counts charged, photons and neutrinos and finds the leading pT', () => {
    const a = requestEvent(7, 3, 13000);
    if ('error' in a) throw new Error(a.error);
    const s = summarise(a);
    expect(s.charged + s.photons + s.neutrinos).toBeLessThanOrEqual(a.event.finals.length);
    expect(s.leadPT).toBeLessThanOrEqual(s.sumPT);
    expect(s.leadPT).toBeGreaterThan(0);
    expect(Object.keys(PROCESS_LABEL)).toEqual(['qcd', 'z', 'w', 'h']);
  });
});

describe('ColliderChamber — static render (no WebGL)', () => {
  const html = renderToStaticMarkup(<ColliderChamber />);
  it('renders the controls, the stage and a readout of a real event with its ledger hash', () => {
    expect(html).toContain('data-testid="collider-chamber"');
    for (const id of ['col-seed', 'col-index', 'col-pt', 'col-process', 'col-next', 'col-stage', 'col-readout', 'col-ledger-hash']) expect(html).toContain(`data-testid="${id}"`);
    expect(html).toMatch(/contentHash [0-9a-f]{64}/);
    expect(html).toContain('TOY_MC_MODEL');
    expect(html).toContain('EVT-');
    expect(html).not.toContain('Silnik zderzacza niedostępny');
  });
});
