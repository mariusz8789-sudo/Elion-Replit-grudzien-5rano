import { describe, expect, it } from 'vitest';
import {
  AgentToolRegistry,
  declareTool,
  toolOutputNeedsQualifier,
  toolOutputQualifier,
  type ErasedAgentTool,
} from '../core/agent/agentTool';
import {
  GENESIS_AGENT_TOOLS,
  GENESIS_TOOLS,
  WORLD_DECISION_TOOL,
  WORLD_DIFF_TOOL,
} from '../core/agent/genesisAgentTools';
import { compareBranches } from '../core/worldModel/bridge/worldFrameState';
import { CAPABILITY_CODE, solverCapabilityFor } from '../core/worldModel/capability/solverCapability';
import { diffWorldBranches } from '../core/worldModel/discovery/worldCounterfactual';
import { buildGenesisScientificCity3 } from '../core/worldModel/domains/genesisScientificCity3';
import { TemporalBranchRegistry, TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * THE TOOL MANIFEST DESCRIBES REAL FUNCTIONS, AND CARRIES THEIR HONESTY.
 *
 * Two things must hold for this layer to be worth having: every declared tool
 * must actually invoke the real function it claims to wrap, and every tool must
 * carry the same capability the scenario registry already declares — not a
 * second, more flattering copy of it.
 */

describe('Every declared tool wraps a real function', () => {
  it('the diff tool really produces the same diff as calling the function directly', () => {
    const registry = new TemporalBranchRegistry();
    const run = (options: { rainfallAtTick?: number }) => {
      const city = buildGenesisScientificCity3(options);
      const engine = new TemporalEngine(city.graph, { registry });
      for (let i = 0; i < 12; i++) engine.advance(1, city.updater);
      return engine;
    };
    const baseline = run({});
    const storm = run({ rainfallAtTick: 2 });
    const comparison = compareBranches(registry, baseline.branchId, storm.branchId, 12);

    expect(GENESIS_TOOLS.diffTool.invoke(comparison)).toEqual(diffWorldBranches(comparison));
  });

  it('declares an input schema for every tool, naming what is required', () => {
    for (const tool of GENESIS_AGENT_TOOLS.list()) {
      expect(tool.inputSchema.length).toBeGreaterThan(0);
      expect(tool.capabilityTags.length).toBeGreaterThan(0);
      expect(typeof tool.invoke).toBe('function');
      for (const parameter of tool.inputSchema) expect(parameter.description).toBeTruthy();
    }
  });

  it('lists deterministically and finds tools by domain and by tag', () => {
    const names = GENESIS_AGENT_TOOLS.list().map((t) => t.name);
    expect(names).toEqual([...names].sort());
    expect(GENESIS_AGENT_TOOLS.get(WORLD_DIFF_TOOL)).toBeDefined();
    expect(GENESIS_AGENT_TOOLS.byDomain('flood-hydrology').length).toBe(names.length);
    expect(GENESIS_AGENT_TOOLS.byTag('decide').map((t) => t.name)).toContain(WORLD_DECISION_TOOL);
    expect(GENESIS_AGENT_TOOLS.byDomain('no-such-domain')).toEqual([]);
  });

  it('refuses to register the same tool name twice', () => {
    const registry = new AgentToolRegistry(GENESIS_AGENT_TOOLS.list());
    expect(() => registry.register(GENESIS_AGENT_TOOLS.get(WORLD_DIFF_TOOL)!)).toThrow(/Duplicate/);
  });
});

describe('Tool capability is read from the registry, never restated more favourably', () => {
  it('carries exactly the capability the scenario registry declares', () => {
    const flood = solverCapabilityFor('FLOOD');
    for (const tool of GENESIS_AGENT_TOOLS.byDomain('flood-hydrology')) {
      expect(tool.capability).toEqual(flood);
    }
  });

  it('marks flood tool output as needing a qualifier, because FLOOD is only partially modelled', () => {
    // Asserted from the registry rather than hardcoded: if FLOOD is ever fully
    // modelled, this test says so instead of silently passing.
    const flood = solverCapabilityFor('FLOOD');
    expect(flood.capability).toBe(CAPABILITY_CODE.PARTIALLY_MODELLED);
    const tool = GENESIS_AGENT_TOOLS.get(WORLD_DIFF_TOOL)!;
    expect(toolOutputNeedsQualifier(tool)).toBe(true);
    // And the qualifier is the registry's own caveat text, not a new one.
    expect(toolOutputQualifier(tool)).toBe(flood.caveat);
    expect(GENESIS_AGENT_TOOLS.fullyModelled()).toEqual([]);
  });

  it('reports no qualifier for a fully modelled tool', () => {
    const tool = declareTool({
      name: 'test.modelled',
      domain: 'test',
      description: 'A fully modelled stand-in.',
      capabilityTags: ['simulate'],
      capability: { capability: CAPABILITY_CODE.MODELLED, solverId: 'test-solver' },
      inputSchema: [{ name: 'x', type: 'number', required: true, description: 'x' }],
      invoke: (x: number) => x * 2,
    });
    expect(toolOutputNeedsQualifier(tool as unknown as ErasedAgentTool)).toBe(false);
    expect(toolOutputQualifier(tool as unknown as ErasedAgentTool)).toBeNull();
    expect(tool.invoke(21)).toBe(42);
  });

  it('names what is missing when a tool is not modelled at all', () => {
    const tool = declareTool({
      name: 'test.unmodelled',
      domain: 'test',
      description: 'Stands for something Genesis cannot do.',
      capabilityTags: ['simulate'],
      capability: { capability: CAPABILITY_CODE.NOT_MODELLED, missing: ['a real solver for this'] },
      inputSchema: [{ name: 'x', type: 'number', required: true, description: 'x' }],
      invoke: (x: number) => x,
    });
    expect(toolOutputQualifier(tool as unknown as ErasedAgentTool)).toMatch(/Not modelled. Missing: a real solver/);
  });

  it('refuses a partial capability that declares no caveat, or a missing one that names nothing', () => {
    const base = {
      name: 'test.bad',
      domain: 'test',
      description: 'd',
      capabilityTags: ['simulate'] as const,
      inputSchema: [],
      invoke: () => null,
    };
    // A partial capability with no caveat is exactly the overclaim this layer exists to stop.
    expect(() => declareTool({ ...base, capability: { capability: CAPABILITY_CODE.PARTIALLY_MODELLED } })).toThrow(/no caveat/);
    expect(() => declareTool({ ...base, capability: { capability: CAPABILITY_CODE.NOT_MODELLED, missing: [] } })).toThrow(/nothing missing/);
  });
});
