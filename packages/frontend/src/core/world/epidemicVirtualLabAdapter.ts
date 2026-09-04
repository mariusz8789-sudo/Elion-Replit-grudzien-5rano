import { buildWorldState, type WorldState } from './scientificWorldState';
import type { WorldStateView } from '../simulation/worldEngineContract';

/**
 * Thin bridge for the current VisualSimulationScreen. It only re-labels the
 * existing read-only world projection; it does not derive outcomes or invent
 * entities absent from the live simulation.
 */
export function projectEpidemicScreenState(view: WorldStateView, worldId = 'epidemic-city'): WorldState {
  const entities = [
    ...view.agents.map((agent) => ({
      ref: { kind: 'agent', id: String(agent.id) }, label: `Agent #${agent.id}`,
      properties: [
        { key: 'health', value: agent.health }, { key: 'x', value: agent.x }, { key: 'y', value: agent.y },
        { key: 'inTransit', value: agent.behavior !== 'stationary' },
      ],
    })),
    ...view.locations.map((location, index) => ({
      ref: { kind: 'location', id: `${location.kind}:${index}` }, label: location.label ?? location.kind,
      properties: [{ key: 'x', value: location.x }, { key: 'y', value: location.y }, { key: 'closed', value: location.closed }],
    })),
  ];
  const events = view.transmissions.map((transmission, index) => ({
    contractVersion: '1.0.0', id: `transmission:${view.clock.day}:${index}`,
    type: 'infection.transmission', timestamp: view.clock.day,
    location: { x: transmission.x, y: transmission.y }, source: { kind: 'agent', id: String(transmission.from) },
    affectedEntities: [{ kind: 'agent', id: String(transmission.to) }],
    parameters: { from: transmission.from, to: transmission.to }, provenance: { origin: 'model' as const },
  }));
  return buildWorldState({
    worldId, domainId: 'EPIDEMIOLOGY', tick: view.clock.day, entities, relations: [], observations: [], events,
    experiment: { experimentId: worldId, status: 'RUNNING', runs: [] }, epistemic: null, evidence: [], replay: null,
    notModeled: view.notModeled,
  });
}
