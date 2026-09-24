import { describe, expect, it } from 'vitest';
import {
  getGenesisCapability,
  listGenesisCapabilities,
  matchGenesisCapabilityIntent,
} from '../core/capabilities/genesisCapabilityRegistry';
import { resolveCommand } from '../core/scienceChat/resolveCommand';

describe('canonical Genesis capability registry', () => {
  it('has unique ids and honest blocking metadata', () => {
    const capabilities = listGenesisCapabilities();
    expect(new Set(capabilities.map(({ id }) => id)).size).toBe(capabilities.length);
    for (const capability of capabilities) {
      expect(capability.userIntents).toBeDefined();
      expect(capability.execution.id).not.toBe('');
      expect(capability.limitations.length).toBeGreaterThan(0);
      if (['PROTOTYPE', 'BLOCKED_BY_RUNTIME', 'BLOCKED_DATA', 'NOT_IMPLEMENTED'].includes(capability.readiness)) {
        expect(capability.blockedReason, capability.id).toBeTruthy();
      }
    }
  });

  it('declares the three public reference paths against existing runners', () => {
    expect(getGenesisCapability('drug-discovery')).toMatchObject({ selectionMode: 'CUSTOM_FLOW', evidenceSupport: 'CANONICAL', replaySupport: 'CANONICAL' });
    expect(getGenesisCapability('chemistry-titration')).toMatchObject({ execution: { kind: 'fabric-model', id: 'chemistry-titration' }, readiness: 'AVAILABLE' });
    expect(getGenesisCapability('physics-black-hole')).toMatchObject({ execution: { kind: 'fabric-model', id: 'einstein-schwarzschild' }, readiness: 'AVAILABLE' });
    expect(getGenesisCapability('physics-three-body')).toMatchObject({ execution: { kind: 'fabric-model', id: 'universe-three-body' }, readiness: 'AVAILABLE' });
  });

  it.each([
    ['Znajdź naturalnych kandydatów dla receptora A1', 'drug-discovery'],
    ['Uruchom miareczkowanie', 'chemistry-titration'],
    ['Pokaż czarną dziurę', 'physics-black-hole'],
    ['Pokaż problem trzech ciał', 'physics-three-body'],
    ['Pokaż prawdziwe dane CMS', 'cern-cms-open-data'],
    ['Uruchom zabawkowe zderzenie CERN', 'cern-toy-collision'],
    ['Otwórz World Director', 'world-director'],
    ['Pokaż SW-4', 'sw4'],
    ['Otwórz Reality Navigator', 'reality-navigator'],
    ['Pokaż multiwersum', 'multiverse'],
    ['Otwórz laboratorium czasoprzestrzeni', 'spacetime'],
    ['Pokaż silnik 5D', 'manifold-5d'],
    ['Pokaż wormhole', 'wormhole'],
    ['Pokaż maszynę czasu', 'time-machine'],
  ])('maps %s to %s', (message, id) => {
    expect(matchGenesisCapabilityIntent(message)?.id).toBe(id);
  });

  it('keeps 9D honest and out of public execution', () => {
    const capability = matchGenesisCapabilityIntent('Pokaż silnik 9D');
    expect(capability).toMatchObject({ id: 'genesis-9d', readiness: 'PROTOTYPE', selectionMode: 'UNAVAILABLE', visualizationRoute: null });
    const response = resolveCommand('Pokaż silnik 9D', null);
    expect(response.todo).toBe(true);
    expect(response.action).toBeUndefined();
  });

  it.each([
    ['Pokaż prawdziwe dane CMS', '#/physics/cms-z'],
    ['Uruchom zabawkowe zderzenie CERN', '#/cern-complex?action=collision'],
    ['Otwórz World Director', '#/world-director'],
    ['Pokaż SW-4', '#/world-director?prompt=SW-4%20epidemic%20city'],
    ['Otwórz Reality Navigator', '#/reality'],
    ['Pokaż multiwersum', '#/lab/multiverse'],
    ['Otwórz laboratorium czasoprzestrzeni', '#/lab/spacetime'],
    ['Pokaż silnik 5D', '#/matrix-stage'],
    ['Pokaż wormhole', '#/world-director?prompt=wormhole'],
    ['Pokaż maszynę czasu', '#/myths-theories'],
  ])('routes %s through the registry to %s', (message, hash) => {
    expect(resolveCommand(message, null).action).toEqual({ type: 'openRoute', hash });
  });

  it('does not call optional workers AVAILABLE because the service process is online', () => {
    const workers = listGenesisCapabilities().filter(({ domain }) => domain === 'compute-worker');
    expect(workers.length).toBeGreaterThan(0);
    expect(workers.every(({ readiness }) => readiness === 'BLOCKED_BY_RUNTIME')).toBe(true);
  });
});
