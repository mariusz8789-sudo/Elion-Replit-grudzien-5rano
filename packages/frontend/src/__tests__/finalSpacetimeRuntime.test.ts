import { describe, expect, it } from 'vitest';
import { EvidenceLedger } from '@genesis/core/knowledge/EvidenceLedger.js';
import { directGenesisPromptWorld, recordDirectedPromptWorld } from '../core/worldDirector/genesisWorldDirector';
import { createSpacetimeWorldSpecification, inferSpacetimeWorldTemplate, resolveSpacetimeWorldPrompt } from '../core/worldModel/generation/spacetimeWorldProposal';
import { validateSpecification } from '../core/worldModel/specification/validation';

const CASES = [
  ['Generate an Einstein-Rosen bridge and show a cinematic flythrough.', 'EINSTEIN_ROSEN_BRIDGE', 'WORMHOLE_RINGS', 'HYPOTHESIS'],
  ['Create 5 alternative timeline worlds.', 'MULTIVERSE_BRANCH', 'TIMELINE_BRANCHES', 'SIMULATION'],
  ['Create a time dilation laboratory.', 'TIME_DILATION_LAB', 'RELATIVISTIC_CLOCKS', 'MODEL'],
  ['Create a quantum world explaining superposition and tunneling.', 'QUANTUM', 'QUANTUM_BARRIER', 'MODEL'],
  ['Create a cosmology world with gravity wells, dark matter and time dilation.', 'COSMOLOGY_SPACETIME', 'GRAVITY_WELL_GRID', 'MODEL'],
  ['Create a historical Boston battle reconstruction.', 'HISTORICAL_RECONSTRUCTION', 'HISTORICAL_CITY', 'RECONSTRUCTION'],
  ['Create a desert alien planet with ruins and two suns.', 'DESERT_ALIEN', 'ALIEN_DESERT', 'FICTION_INSPIRED'],
  ['Create a Mars research world.', 'MARS_RESEARCH', 'MARS_STATION', 'SIMULATION'],
] as const;

describe('final canonical spacetime/world product runtime', () => {
  it.each(CASES)('classifies and validates %s', (prompt, template) => {
    expect(inferSpacetimeWorldTemplate(prompt)).toBe(template);
    const proposed = createSpacetimeWorldSpecification(prompt);
    expect(proposed.primaryTemplate).toBe(template);
    expect(validateSpecification(proposed.specification).ok).toBe(true);
  });

  it.each(CASES)('realizes %s through one canonical WorldGraph and descriptor', (prompt, template, kind, epistemic) => {
    const resolved = directGenesisPromptWorld(prompt);
    expect(resolved.primaryTemplate).toBe(template);
    expect(resolved.world.generated.graph).toBe(resolved.world.graph);
    expect(resolved.world.generated.generationEvent.parameters.templateIds).toEqual(resolved.specification.worldType);
    expect(resolved.world.graph.listEntities().length).toBeGreaterThan(1);
    expect(resolved.descriptor.kind).toBe(kind);
    expect(resolved.descriptor.epistemic).toBe(epistemic);
    expect(resolved.descriptor.primitives.length).toBeGreaterThan(0);
    expect(resolved.descriptor.sourceEntityIds.length).toBeGreaterThan(0);
  });

  it('creates the requested number of structural branches without claiming observed universes', () => {
    const resolved = directGenesisPromptWorld('Create 5 alternative timeline worlds.');
    const branches = resolved.world.graph.listEntities().filter((entity) => entity.ref.kind === 'timeline-branch');
    expect(branches).toHaveLength(5);
    expect(branches.every((branch) => branch.statusLabel?.startsWith('SIMULATION'))).toBe(true);
    expect(resolved.descriptor.limitations.join(' ')).toMatch(/simulation alternatives/i);
  });

  it('binds quantum to the existing canonical tunnelling solver', () => {
    const resolved = directGenesisPromptWorld('Create a quantum world explaining superposition and tunneling.');
    const junction = resolved.world.graph.listEntities().find((entity) => entity.ref.kind === 'tunnel-junction');
    expect(junction?.domainBinding).toEqual({ solverId: 'quantum-tunneling-split-step-fourier', domainId: 'quantum-mechanics' });
  });

  it('produces stable graph/descriptor fingerprints for replay', () => {
    const prompt = 'Generate an Einstein-Rosen bridge and show a cinematic flythrough.';
    expect(resolveSpacetimeWorldPrompt(prompt).deterministicFingerprint).toBe(resolveSpacetimeWorldPrompt(prompt).deterministicFingerprint);
  });

  it('records the active prompt world and graph fingerprint in the canonical EvidenceLedger', () => {
    const directed = directGenesisPromptWorld('Create a cosmology world with gravity wells, dark matter and time dilation.');
    const ledger = new EvidenceLedger({ now: () => 42 });
    const hash = recordDirectedPromptWorld(ledger, directed);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(ledger.verifyLedger()).toMatchObject({ ok: true });
    const record = ledger.toSnapshot().records[0]!;
    expect(record.claim).toContain(directed.world.generated.worldId);
    expect(record.claim).toContain(`graphFingerprint=${directed.deterministicFingerprint}`);
    expect(record.claim).toContain('epistemic=MODEL');
  });

  it('refuses unsupported prose instead of silently inventing a world', () => {
    expect(() => resolveSpacetimeWorldPrompt('Make something surprising.')).toThrow(/WORLD_PROMPT_UNSUPPORTED/);
  });
});
