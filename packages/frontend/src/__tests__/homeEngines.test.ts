import { describe, expect, it } from 'vitest';
import { HOME_ENGINES, liveLabel } from '../components/home/HomeEngines';
import { PIPELINE_STEPS } from '../components/home/HomePipeline';
import type { ToolchainEntry } from '../core/backend/client';

/** Start never paints an engine green on its own: the chip is the backend's word, or says it has none. */
const entry = (toolId: string, status: ToolchainEntry['status'], version: string | null = null): ToolchainEntry => ({
  toolId, engineName: toolId, domain: 'chemistry', license: 'x', status, version, engine: null, modelDomain: '', assumptions: '', validation: null,
});

describe('Start engines', () => {
  it('lists the required engines, with GNINA as benchmark-only and outside the runtime registry', () => {
    const names = HOME_ENGINES.map((e) => e.name);
    for (const n of ['RDKit', 'AutoDock Vina', 'Meeko', 'GNINA', 'ADMET-AI', 'PySCF', 'OpenMM', 'AiZynthFinder', 'Biopython']) expect(names).toContain(n);
    const gnina = HOME_ENGINES.find((e) => e.name === 'GNINA')!;
    expect(gnina.toolId).toBeNull();
    expect(gnina.note).toMatch(/benchmark scorer only.*not a product dependency/i);
  });

  it('reports BLOCKED as blocked, AVAILABLE only when the server says so, and checking before it answers', () => {
    const rdkit = HOME_ENGINES.find((e) => e.toolId === 'rdkit')!;
    expect(liveLabel(rdkit, { phase: 'checking' })).toEqual({ text: 'Live: checking…', tone: 'muted' });
    expect(liveLabel(rdkit, { phase: 'unreachable' }).tone).toBe('muted');
    const blocked = new Map([['rdkit', entry('rdkit', 'BLOCKED_BY_RUNTIME')]]);
    expect(liveLabel(rdkit, { phase: 'ready', byId: blocked })).toEqual({ text: 'Live: BLOCKED_BY_RUNTIME', tone: 'warn' });
    const ok = new Map([['rdkit', entry('rdkit', 'AVAILABLE', '2026.03.6')]]);
    expect(liveLabel(rdkit, { phase: 'ready', byId: ok })).toEqual({ text: 'Live: AVAILABLE · 2026.03.6', tone: 'ok' });
    expect(liveLabel(rdkit, { phase: 'ready', byId: new Map() }).text).toBe('Live: not reported');
  });

  it('every engine with a runtime id matches a tool the backend registry really declares', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const registry = readFileSync(resolve(__dirname, '../../../backend/src/campaign/toolchain.mjs'), 'utf8');
    for (const e of HOME_ENGINES) if (e.toolId) expect(registry).toContain(`toolId: '${e.toolId}'`);
  });

  it('the pipeline covers question to next experiment and links only to routes that exist', async () => {
    expect(PIPELINE_STEPS.map((s) => s.label)).toEqual(['Question', 'Target', 'Candidates', 'RDKit', 'ADMET / Tox', 'Docking', 'QM / MD', 'Ranking', 'Falsification', 'Retrosynthesis', 'Evidence', 'Replay', 'Next experiment']);
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const app = readFileSync(resolve(__dirname, '../App.tsx'), 'utf8');
    for (const s of PIPELINE_STEPS) if (s.hash) expect(app).toContain(`'${s.hash}'`);
  });
});
