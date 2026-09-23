import { describe, expect, it } from 'vitest';
import { resolveCommand } from '../core/scienceChat/resolveCommand';
import { directGenesisPromptWorld } from '../core/worldDirector/genesisWorldDirector';

describe('Science Chat → canonical worlds', () => {
  it('opens the permanent Genesis laboratory explicitly', () => {
    expect(resolveCommand('Open Genesis Lab', null).action).toEqual({ type: 'openRoute', hash: '#/scientific-worlds' });
  });

  it('opens the permanent CERN complex explicitly', () => {
    expect(resolveCommand('Open CERN', null).action).toEqual({ type: 'openRoute', hash: '#/cern-complex' });
  });

  it('routes an explicit request for real CERN data to the checksum-pinned CMS analysis', () => {
    expect(resolveCommand('Pokaż prawdziwe dane CERN z CMS Open Data', null).action).toEqual({ type: 'openRoute', hash: '#/physics/cms-z' });
  });

  it('forwards the unchanged free-form world prompt instead of generating a second world in chat', () => {
    const prompt = 'Create a cinematic underwater research city';
    expect(resolveCommand(prompt, null).action).toEqual({ type: 'openWorldPrompt', prompt });
  });

  it('routes a cinematic film request to the same canonical World Director', () => {
    const prompt = 'Stwórz film o Marsie z kinową kamerą';
    expect(resolveCommand(prompt, null).action).toEqual({ type: 'openWorldPrompt', prompt });
  });
});

describe('Underwater Research City canonical path', () => {
  it('generates one real canonical WorldGraph with habitat, observatory and laboratory content', () => {
    const directed = directGenesisPromptWorld('Create a cinematic underwater research city');
    expect(directed.primaryTemplate).toBe('UNDERWATER_RESEARCH_CITY');
    expect(directed.descriptor.kind).toBe('UNDERWATER_CITY');
    expect(directed.descriptor.epistemic).toBe('SIMULATION');
    const entities = directed.runtime.engine.graph.listEntities();
    expect(entities.some((entity) => entity.id === 'building:underwater-research-habitat')).toBe(true);
    expect(entities.some((entity) => entity.id === 'instrument:underwater-observatory')).toBe(true);
    expect(entities.some((entity) => entity.ref.kind === 'lab')).toBe(true);
  });
});
