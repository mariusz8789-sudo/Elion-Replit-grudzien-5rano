import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SCIENTIFIC_OS, SHOWCASE, labelOf, levelOf } from '../core/scientificOs/catalogue';
import { parseScienceChatMessage } from '../core/experimentFabric/parser';
import { resolveCommand } from '../core/scienceChat/resolveCommand';
import { buildCapabilityIndex, buildGoalIndex, filterSearchIndex } from '../core/search';

/**
 * More · Scientific OS is the owner-approved map (29 Sep 2026). These checks
 * keep it honest: every door is a real route or a real Ask command, every label
 * follows from the audit state, and the names the owner keeps off the product
 * are not in it.
 */

const SRC = dirname(dirname(fileURLToPath(import.meta.url)));
const APP = readFileSync(join(SRC, 'App.tsx'), 'utf8');
const PARSE = APP.slice(APP.indexOf('export function parseHash'), APP.indexOf('export default function App'));
const ROUTES = [...PARSE.matchAll(/'(#\/[^']*)'/g)].map((m) => m[1]!);

function routable(hash: string): boolean {
  if (hash === '#/') return true;
  if (/^#\/lab\/[\w-]+$/.test(hash)) return true;
  return ROUTES.some((r) => r === hash || (hash.startsWith(`${r}?`) && PARSE.includes(`h.startsWith('${r}?')`)));
}

const ALL = [...SCIENTIFIC_OS.flatMap((g) => g.items), ...SHOWCASE];

describe('Scientific OS catalogue', () => {
  it('has the eight owner groups in order, 68 capabilities, unique ids', () => {
    expect(SCIENTIFIC_OS.map((g) => g.name)).toEqual([
      'Life Sciences', 'Evidence & Verification', 'Government & Public Sector', 'Physics, Quantum & CERN',
      'World & Digital Twin', 'Education', 'Platform & Infrastructure',
    ]);
    expect(SCIENTIFIC_OS.flatMap((g) => g.items)).toHaveLength(68);
    const ids = ALL.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every route is one the router resolves', () => {
    const broken = ALL.filter((c) => c.hash !== undefined && !routable(c.hash)).map((c) => `${c.id} -> ${c.hash}`);
    expect(broken).toEqual([]);
  });

  it('every row has exactly one kind of door, or says why it has none', () => {
    for (const c of ALL) {
      const doors = [c.hash, c.ask].filter((d) => d !== undefined).length;
      if (doors === 0) expect(c.note, c.id).toBeTruthy();
      else expect(doors, c.id).toBe(1);
    }
  });

  it('each Ask command reaches the real engine it names', () => {
    const expected: Record<string, string> = {
      openmm: 'biology-openmm-md-1vii-reference',
      pyscf: 'quantum-chemistry-pyscf-h2-rhf',
      biopython: 'biology-hiv-10e8-pdb-structural-comparison',
      depmap: 'biology-depmap-crispr-senescence-panel',
      pymeep: 'electrodynamics-maxwell-fdtd',
    };
    for (const [id, model] of Object.entries(expected)) {
      const cap = ALL.find((c) => c.id === id)!;
      expect(parseScienceChatMessage(cap.ask!).modelId, id).toBe(model);
      expect(resolveCommand(cap.ask!, null).action?.type, id).not.toBe('runScientificIntegration');
    }
  });

  it('labels follow from the audit state only; nothing claims production or external validation', () => {
    for (const c of ALL) {
      expect(['AVAILABLE', 'PARTIAL', 'DEMO', 'BLOCKED', 'PLANNED']).toContain(labelOf(c.state));
      expect(['PRODUCTION VERIFIED', 'EXTERNALLY VALIDATED']).not.toContain(levelOf(c));
      if (c.state === 'NO_CODE') expect(c.hash).toBeUndefined();
    }
  });

  it('Government is split the owner’s way and never claims readiness', () => {
    const gov = SCIENTIFIC_OS.find((g) => g.id === 'gov')!;
    expect(gov.subgroups!.map((s) => s.label)).toEqual(['Closest to pilot', 'Method / showcase', 'Demo only', 'Planned']);
    expect(gov.subgroups!.flatMap((s) => s.ids).sort()).toEqual(gov.items.map((c) => c.id).sort());
    const status = (id: string) => labelOf(gov.items.find((c) => c.id === id)!.state);
    expect(status('cyber')).toBe('DEMO');
    expect(status('earthquake')).toBe('DEMO');
    expect(status('sovereign')).toBe('PLANNED');
    expect(JSON.stringify(gov.items)).not.toMatch(/government-ready|production-ready/i);
    expect(gov.line).toContain('nothing here is government-ready yet');
  });

  it('keeps the owner’s excluded names out of the product', () => {
    const text = JSON.stringify(ALL);
    expect(text).not.toMatch(/CICADA|City Enterprise|OMNICORE|Supreme|self-driving|warp|retrocausal|MoveX/i);
    expect(ALL.some((c) => /GNINA/.test(c.name))).toBe(false);
  });
});

describe('Search finds goals first and the hidden capabilities', () => {
  it('goals point at real routes', () => {
    for (const g of buildGoalIndex()) expect(routable(g.hash!), g.hash).toBe(true);
  });

  it('typing an engine or topic finds its capability, with the right door', () => {
    const idx = buildCapabilityIndex();
    const find = (q: string) => filterSearchIndex(idx, q);
    expect(find('retrosynthesis')[0]?.hash).toBe('#/reviewer');
    // Engine names still find the capability; the Ask command names the capability, not the engine.
    expect(find('openmm')[0]?.ask).toBe('Uruchom dynamikę molekularną białka 1VII');
    expect(find('pyscf')[0]?.ask).toBe('Policz energię Hartree-Fock RHF dla H2');
    expect(find('ro-crate')[0]?.hash).toBe('#/pilot');
    expect(find('tournament')[0]?.hash).toBe('#/conflict');
    expect(find('d-063')[0]?.hash).toBe('#/research-console?panel=gov');
    expect(find('depmap')[0]?.ask).toBeTruthy();
  });
});
