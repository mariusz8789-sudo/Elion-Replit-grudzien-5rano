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

  it('routes the public product worlds without exposing internal module selection', () => {
    expect(resolveCommand('Pokaż serce człowieka', null).action).toEqual({ type: 'openRoute', hash: '#/human-biology-lab?focus=heart&level=organ' });
    expect(resolveCommand('Pokaż tkankę wątroby', null).action).toEqual({ type: 'openRoute', hash: '#/human-biology-lab?focus=liver&level=tissue' });
    expect(resolveCommand('Pokaż komórki płuca', null).action).toEqual({ type: 'openRoute', hash: '#/human-biology-lab?focus=left-lung&level=cell' });
    expect(resolveCommand('Pokaż krew pod mikroskopem', null).action).toEqual({ type: 'openRoute', hash: '#/human-biology-lab?specimen=blood&magnification=500' });
    expect(resolveCommand('Pokaż Multiverse Nexus', null).action).toEqual({ type: 'openRoute', hash: '#/lab/multiverse' });
    expect(resolveCommand('Otwórz Reality Navigator', null).action).toEqual({ type: 'openRoute', hash: '#/reality' });
    expect(resolveCommand('Pokaż maszynę czasu', null).action).toEqual({ type: 'openRoute', hash: '#/myths-theories' });
    expect(resolveCommand('Pokaż SW-4', null).action).toEqual({ type: 'openRoute', hash: '#/world-director?prompt=SW-4%20epidemic%20city' });
  });

  it('separates CERN toy execution from published CMS data', () => {
    const toy = resolveCommand('Zderz protony w CERN', null);
    expect(toy.action).toEqual({ type: 'openRoute', hash: '#/cern-complex?action=collision' });
    expect(toy.text).toMatch(/TOY_MC_MODEL/);
    const real = resolveCommand('Pokaż prawdziwe dane CERN z CMS Open Data', null);
    expect(real.action).toEqual({ type: 'openRoute', hash: '#/physics/cms-z' });
    expect(real.text).toMatch(/historycznych danych offline/i);
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
