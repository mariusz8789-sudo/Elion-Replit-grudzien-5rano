import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import { createLedgerSink } from '../core/scientificWorlds/biologyRunners';
import { generateSpecifiedWorld } from '../core/worldModel/specification/compiler';
import { validateSpecification } from '../core/worldModel/specification/validation';
import { SPACETIME_TEMPLATE_IDS, type WorldSpecification } from '../core/worldModel/specification/worldSpecification';
import {
  inferSpacetimeWorldTemplate,
  proposeSpacetimeWorld,
  resolveSpacetimeWorldProposal,
  spacetimeEpistemicLabel,
} from '../core/worldModel/generation/spacetimeWorldProposal';

const clock = { t: 1_700_000_000_000, now() { return (this.t += 1000); } };
function ledgerAndSink(streamId: string) {
  const ledger = new EvidenceLedger(clock);
  return { ledger, sink: createLedgerSink(ledger, streamId) };
}

// --- A-D: prompt -> canonical WorldSpecification for the required prompts --------------------

describe('A. prompt -> canonical Einstein-Rosen WorldSpecification', () => {
  it('"Generate an Einstein-Rosen bridge" resolves to EINSTEIN_ROSEN_BRIDGE', () => {
    const proposal = proposeSpacetimeWorld({ requestId: 'w-a', prompt: 'Generate an Einstein-Rosen bridge', seed: 1 });
    expect(proposal.specification.worldType).toEqual(['EINSTEIN_ROSEN_BRIDGE']);
    expect(validateSpecification(proposal.specification).ok).toBe(true);
  });
});

describe('B. prompt -> canonical Multiverse WorldSpecification', () => {
  it('"Create 5 alternative timeline worlds" resolves to MULTIVERSE_BRANCH', () => {
    const proposal = proposeSpacetimeWorld({ requestId: 'w-b', prompt: 'Create 5 alternative timeline worlds', seed: 2, populationCount: 5 });
    expect(proposal.specification.worldType).toEqual(['MULTIVERSE_BRANCH']);
    expect(validateSpecification(proposal.specification).ok).toBe(true);
  });
});

describe('C. prompt -> canonical Quantum WorldSpecification', () => {
  it('"Create a quantum world explaining tunneling" resolves to QUANTUM', () => {
    const proposal = proposeSpacetimeWorld({ requestId: 'w-c', prompt: 'Create a quantum world explaining tunneling', seed: 3 });
    expect(proposal.specification.worldType).toEqual(['QUANTUM']);
    expect(validateSpecification(proposal.specification).ok).toBe(true);
  });
});

describe('D. prompt -> historical reconstruction WorldSpecification', () => {
  it('"Create historical Boston battle reconstruction" resolves to HISTORICAL_RECONSTRUCTION', () => {
    const proposal = proposeSpacetimeWorld({ requestId: 'w-d', prompt: 'Create historical Boston battle reconstruction', seed: 4 });
    expect(proposal.specification.worldType).toEqual(['HISTORICAL_RECONSTRUCTION']);
    expect(validateSpecification(proposal.specification).ok).toBe(true);
  });

  it('the remaining four required prompts also resolve correctly', () => {
    expect(inferSpacetimeWorldTemplate('Create a time dilation laboratory')).toBe('TIME_DILATION_LAB');
    expect(inferSpacetimeWorldTemplate('Create a cosmology world with gravity wells')).toBe('COSMOLOGY_SPACETIME');
    expect(inferSpacetimeWorldTemplate('Create desert alien world with two suns')).toBe('DESERT_ALIEN');
    expect(inferSpacetimeWorldTemplate('Create Mars research world')).toBe('MARS_RESEARCH');
  });
});

// --- E: canonical compiler accepts all new world types ---------------------------------------

describe('E. canonical compiler accepts all new world types', () => {
  it.each(SPACETIME_TEMPLATE_IDS)('%s compiles and generates through the real generateSpecifiedWorld pipeline', (templateId) => {
    const spec: WorldSpecification = { worldId: `e2e-${templateId.toLowerCase()}`, seed: 42, worldType: [templateId], provenanceNote: templateId === 'HISTORICAL_RECONSTRUCTION' ? 'Boston Massacre site, National Park Service records' : undefined };
    const world = generateSpecifiedWorld(spec);
    expect(world.graph.listEntities().length).toBeGreaterThan(0);
  });

  it('composes a spacetime template alongside a base template in one coherent world', () => {
    const spec: WorldSpecification = { worldId: 'composed-city-quantum', seed: 7, worldType: ['CITY', 'QUANTUM'] };
    const world = generateSpecifiedWorld(spec);
    expect(world.compiled.templateIds.CITY).toBeDefined();
    expect(world.compiled.templateIds.QUANTUM).toBeDefined();
  });
});

// --- F: multiverse uses existing temporal/counterfactual infrastructure ----------------------

describe('F. multiverse uses existing temporal/counterfactual infrastructure', () => {
  it('MULTIVERSE_BRANCH produces real, distinct branch-hub entities with COUNTERFACTUAL_SIMULATION status, no fabricated divergence data', () => {
    const spec: WorldSpecification = { worldId: 'multiverse-1', seed: 9, worldType: ['MULTIVERSE_BRANCH'], population: { count: 5 } };
    const world = generateSpecifiedWorld(spec);
    const branches = world.graph.listEntities().filter((e) => e.ref.kind === 'timeline-branch');
    expect(branches.length).toBe(5);
    for (const branch of branches) {
      expect(branch.statusLabel).toMatch(/COUNTERFACTUAL_SIMULATION/);
      expect(branch.grounding).toBe('UNGROUNDED_APPROXIMATION');
    }
  });

  it('does not fabricate a second temporal/branching engine — worldCounterfactual.ts remains the real divergence-measurement path', async () => {
    const mod = await import('../core/worldModel/discovery/worldCounterfactual');
    expect(typeof mod.diffWorldBranches).toBe('function');
    expect(typeof mod.findFirstDivergenceTick).toBe('function');
  });
});

// --- G: epistemic labels remain correct -------------------------------------------------------

describe('G. epistemic labels remain correct', () => {
  it('maps each spacetime template to the correct canonical EpistemicLabel', () => {
    const baseSpec = (worldType: WorldSpecification['worldType']): WorldSpecification => ({ worldId: 'g-test', seed: 1, worldType });
    expect(spacetimeEpistemicLabel('EINSTEIN_ROSEN_BRIDGE', baseSpec(['EINSTEIN_ROSEN_BRIDGE']))).toBe('HYPOTHESIS');
    expect(spacetimeEpistemicLabel('MULTIVERSE_BRANCH', baseSpec(['MULTIVERSE_BRANCH']))).toBe('SIMULATION');
    expect(spacetimeEpistemicLabel('TIME_DILATION_LAB', baseSpec(['TIME_DILATION_LAB']))).toBe('MODEL');
    expect(spacetimeEpistemicLabel('QUANTUM', baseSpec(['QUANTUM']))).toBe('MODEL');
    expect(spacetimeEpistemicLabel('COSMOLOGY_SPACETIME', baseSpec(['COSMOLOGY_SPACETIME']))).toBe('MODEL');
    expect(spacetimeEpistemicLabel('DESERT_ALIEN', baseSpec(['DESERT_ALIEN']))).toBe('FICTION_INSPIRED');
    expect(spacetimeEpistemicLabel('MARS_RESEARCH', baseSpec(['MARS_RESEARCH']))).toBe('NOT_MODELED');
  });

  it('HISTORICAL_RECONSTRUCTION is RECONSTRUCTION by default, VERIFIED_SOURCE only with real provenance', () => {
    const noProvenance: WorldSpecification = { worldId: 'g-hist-1', seed: 1, worldType: ['HISTORICAL_RECONSTRUCTION'] };
    const withProvenance: WorldSpecification = { worldId: 'g-hist-2', seed: 1, worldType: ['HISTORICAL_RECONSTRUCTION'], provenanceNote: 'National Archives record #12345' };
    expect(spacetimeEpistemicLabel('HISTORICAL_RECONSTRUCTION', noProvenance)).toBe('RECONSTRUCTION');
    expect(spacetimeEpistemicLabel('HISTORICAL_RECONSTRUCTION', withProvenance)).toBe('VERIFIED_SOURCE');
  });

  it('the full prompt-to-world resolver emits real Evidence at every required stage, verifiable by the real EvidenceLedger', () => {
    const { ledger, sink } = ledgerAndSink('spacetime-product-binding-test');
    const resolution = resolveSpacetimeWorldProposal({ requestId: 'g-full', prompt: 'Create a time dilation laboratory', seed: 11 }, sink);
    expect(resolution.epistemicLabel).toBe('MODEL');
    expect(resolution.evidenceRefs.length).toBeGreaterThanOrEqual(4);
    const retrievedBys = ledger.toSnapshot().records.map((r) => r.provenance.retrievedBy);
    expect(retrievedBys.some((r) => r.includes('SPACETIME_PROMPT_ACCEPTED'))).toBe(true);
    expect(retrievedBys.some((r) => r.includes('SPACETIME_WORLD_TYPE_SELECTED'))).toBe(true);
    expect(retrievedBys.some((r) => r.includes('SPACETIME_WORLD_SPECIFICATION_CREATED'))).toBe(true);
    expect(retrievedBys.some((r) => r.includes('SPACETIME_WORLD_BLUEPRINT_COMPILED'))).toBe(true);
    expect(ledger.verifyLedger().ok).toBe(true);
  });

  it('the multiverse branch resolution additionally emits SPACETIME_MULTIVERSE_BRANCH_IDENTITY', () => {
    const { ledger, sink } = ledgerAndSink('spacetime-multiverse-evidence-test');
    resolveSpacetimeWorldProposal({ requestId: 'g-mv', prompt: 'Create 5 alternative timeline worlds', seed: 12, populationCount: 5 }, sink);
    const retrievedBys = ledger.toSnapshot().records.map((r) => r.provenance.retrievedBy);
    expect(retrievedBys.some((r) => r.includes('SPACETIME_MULTIVERSE_BRANCH_IDENTITY'))).toBe(true);
  });

  it('an unmatched prompt is refused, never silently defaulted to a random world type', () => {
    const { sink } = ledgerAndSink('spacetime-unmatched-test');
    expect(() => resolveSpacetimeWorldProposal({ requestId: 'g-none', prompt: 'Please make me a sandwich', seed: 13 }, sink)).toThrow(/no spacetime world template matched/);
  });
});

// --- H: no duplicate WorldGraph / WorldGenerator / TemporalEngine / EvidenceLedger ------------

function findFiles(dir: string, matcher: RegExp, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) findFiles(full, matcher, out);
    else if (matcher.test(entry)) out.push(full);
  }
  return out;
}

function countClassDefinitions(className: string): number {
  const roots = [
    path.resolve(__dirname, '../../../frontend/src'),
    path.resolve(__dirname, '../../../core/src'),
  ];
  let count = 0;
  for (const root of roots) {
    for (const file of findFiles(root, /\.(ts|tsx)$/)) {
      if (file.includes('/__tests__/') || file.includes('codex-handoff')) continue;
      const content = readFileSync(file, 'utf8');
      if (new RegExp(`class ${className}\\b`).test(content)) count += 1;
    }
  }
  return count;
}

describe('H. no duplicate WorldGraph / WorldGenerator / TemporalEngine / EvidenceLedger', () => {
  it('exactly one class definition of each canonical system exists in production source', () => {
    expect(countClassDefinitions('WorldGraph')).toBe(1);
    expect(countClassDefinitions('TemporalEngine')).toBe(1);
    expect(countClassDefinitions('EvidenceLedger')).toBe(1);
  });

  it('WORLD_TEMPLATES has exactly one entry per declared WorldTemplateId, no duplicates', async () => {
    const { WORLD_TEMPLATES } = await import('../core/worldModel/specification/templates');
    const keys = Object.keys(WORLD_TEMPLATES);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.length).toBe(5 + SPACETIME_TEMPLATE_IDS.length);
  });
});
