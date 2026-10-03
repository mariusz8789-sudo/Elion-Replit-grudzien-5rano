import { describe, expect, it } from 'vitest';
import { HOME_ENGINES, liveLabel } from '../components/home/HomeEngines';
import type { SelfModelEngine, ToolchainEntry } from '../core/backend/client';

/** Start never paints an engine green on its own: the chip is the backend's word, or says it has none. */
const entry = (toolId: string, status: ToolchainEntry['status'], version: string | null = null): ToolchainEntry => ({
  toolId, engineName: toolId, domain: 'chemistry', license: 'x', status, version, engine: null, modelDomain: '', assumptions: '', validation: null,
});

const self = (toolId: string, runtimeAvailableNow: boolean): SelfModelEngine => ({
  toolId, engineName: toolId, capabilityId: null, capabilityExists: true, runtimeAvailableNow,
  status: runtimeAvailableNow ? 'AVAILABLE' : 'BLOCKED', blockedBy: runtimeAvailableNow ? null : 'UNVALIDATED', reason: null, proof: null,
  statement: runtimeAvailableNow ? `Mam adapter ${toolId} i działa.` : `Mam adapter ${toolId}, ale obecnie runtime jest niedostępny (UNVALIDATED).`,
});

describe('Start engines', () => {
  it('lists the required engines, with GNINA as benchmark-only and outside the runtime registry', () => {
    const names = HOME_ENGINES.map((e) => e.name);
    for (const n of ['RDKit', 'AutoDock Vina', 'Meeko', 'GNINA', 'ADMET-AI', 'PySCF', 'OpenMM', 'AiZynthFinder', 'Biopython']) expect(names).toContain(n);
    const gnina = HOME_ENGINES.find((e) => e.name === 'GNINA')!;
    expect(gnina.toolId).toBeNull();
    expect(gnina.note).toMatch(/benchmark only.*not in product/i);
  });

  it('reads the self model: AVAILABLE only when the runtime works now, BLOCKED with the backend sentence otherwise', () => {
    const rdkit = HOME_ENGINES.find((e) => e.toolId === 'rdkit')!;
    expect(liveLabel(rdkit, { phase: 'checking' })).toEqual({ text: 'checking…', tone: 'muted' });
    expect(liveLabel(rdkit, { phase: 'unreachable' }).tone).toBe('muted');
    // The toolchain probe alone says AVAILABLE, but the self model has no proof run: it stays BLOCKED.
    const probeOnly = new Map([['rdkit', entry('rdkit', 'AVAILABLE', '2026.03.6')]]);
    const blocked = liveLabel(rdkit, { phase: 'ready', self: new Map([['rdkit', self('rdkit', false)]]), byId: probeOnly });
    expect(blocked).toMatchObject({ text: 'BLOCKED', tone: 'warn' });
    expect(blocked.detail).toMatch(/runtime jest niedostępny/);
    const ok = liveLabel(rdkit, { phase: 'ready', self: new Map([['rdkit', self('rdkit', true)]]), byId: probeOnly });
    expect(ok).toMatchObject({ text: 'AVAILABLE · 2026.03.6', tone: 'ok' });
    expect(liveLabel(rdkit, { phase: 'ready', self: new Map(), byId: probeOnly }).text).toBe('not reported');
  });

  it('every engine with a runtime id matches a tool the backend registry really declares', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const registry = readFileSync(resolve(__dirname, '../../../backend/src/campaign/toolchain.mjs'), 'utf8');
    for (const e of HOME_ENGINES) if (e.toolId) expect(registry).toContain(`toolId: '${e.toolId}'`);
  });
});
