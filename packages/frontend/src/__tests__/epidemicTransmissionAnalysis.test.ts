import { describe, expect, it } from 'vitest';
import { GENESIS_EVENT_CONTRACT_VERSION, type GenesisEvent } from '../core/events/genesisEvent';
import { analyseEpidemicTransmissionEvents, serializeEpidemicTransmissionAnalysis } from '../core/events/epidemicTransmissionAnalysis';

/**
 * EPIDEMIC TRANSMISSION ANALYSIS — extracted from `manus/visual-p1-world`,
 * which shipped it without any test of its own. These are new: they pin the
 * behaviour that makes the module trustworthy — that it BLOCKS rather than
 * silently drops bad input, that its graph/hotspot aggregation is real, and
 * that its fingerprint is deterministic.
 */
function transmission(overrides: Partial<GenesisEvent> & { sourceAgent: number; targetAgent: number; x: number; y: number; timestamp: number; id: string }): GenesisEvent {
  const { sourceAgent, targetAgent, x, y, ...rest } = overrides;
  return {
    contractVersion: GENESIS_EVENT_CONTRACT_VERSION,
    type: 'infection.transmission',
    cause: 'contact',
    source: { kind: 'agent', id: sourceAgent },
    affectedEntities: [{ kind: 'agent', id: targetAgent }],
    location: { x, y },
    modelId: 'epidemic-agents',
    provenance: { origin: 'model', modelId: 'epidemic-agents', experimentId: 'exp-1', seed: 42, paramsHash: 'abc123' },
    ...rest,
  } as GenesisEvent;
}

describe('analyseEpidemicTransmissionEvents', () => {
  it('builds a real transmission graph: per-agent in/out degree and deduplicated edges', () => {
    const analysis = analyseEpidemicTransmissionEvents([
      transmission({ id: 'e1', sourceAgent: 1, targetAgent: 2, x: 10, y: 10, timestamp: 5 }),
      transmission({ id: 'e2', sourceAgent: 1, targetAgent: 3, x: 12, y: 11, timestamp: 6 }),
      transmission({ id: 'e3', sourceAgent: 1, targetAgent: 2, x: 15, y: 12, timestamp: 9 }), // same pair again
      transmission({ id: 'e4', sourceAgent: 2, targetAgent: 4, x: 400, y: 400, timestamp: 11 }),
    ]);

    expect(analysis.status).toBe('AVAILABLE');
    expect(analysis.classification).toBe('SIMULATED_MODEL_OUTPUT');
    expect(analysis.metrics.transmissionCount).toBe(4);
    expect(analysis.metrics.uniqueSourceAgents).toBe(2); // agents 1 and 2
    expect(analysis.metrics.uniqueTargetAgents).toBe(3); // agents 2, 3, 4
    expect(analysis.metrics.largestSourceTransmissionCount).toBe(3); // agent 1 infected three times

    const agent1 = analysis.graph.nodes.find((n) => n.agentId === 1)!;
    expect(agent1.outgoingTransmissionCount).toBe(3);
    expect(agent1.incomingTransmissionCount).toBe(0);
    const agent2 = analysis.graph.nodes.find((n) => n.agentId === 2)!;
    expect(agent2.incomingTransmissionCount).toBe(2); // e1 + e3
    expect(agent2.outgoingTransmissionCount).toBe(1); // e4

    // The 1->2 pair is ONE edge carrying both events, with the real first/last timestamps.
    const edge12 = analysis.graph.edges.find((e) => e.sourceAgentId === 1 && e.targetAgentId === 2)!;
    expect(edge12.transmissionCount).toBe(2);
    expect(edge12.firstTimestamp).toBe(5);
    expect(edge12.lastTimestamp).toBe(9);
    expect([...edge12.eventIds].sort()).toEqual(['e1', 'e3']);
  });

  it('aggregates hotspots on an explicit grid over exact coordinates, never an invented venue', () => {
    const analysis = analyseEpidemicTransmissionEvents(
      [
        transmission({ id: 'a', sourceAgent: 1, targetAgent: 2, x: 5, y: 5, timestamp: 1 }),
        transmission({ id: 'b', sourceAgent: 3, targetAgent: 4, x: 25, y: 15, timestamp: 2 }),
        transmission({ id: 'c', sourceAgent: 5, targetAgent: 6, x: 500, y: 500, timestamp: 3 }),
      ],
      { cellSizeWorldUnits: 100 },
    );

    // First two share a 100-unit cell; the third is far away in its own cell.
    expect(analysis.hotspots).toHaveLength(2);
    const busiest = analysis.hotspots[0];
    expect(busiest.transmissionCount).toBe(2);
    expect(busiest.cellSizeWorldUnits).toBe(100);
    expect(busiest.centroid).toEqual({ x: 15, y: 10 }); // exact mean of (5,5) and (25,15)
    expect([...busiest.eventIds].sort()).toEqual(['a', 'b']);
  });

  it('BLOCKS on an event missing model provenance instead of silently dropping it', () => {
    const good = transmission({ id: 'ok', sourceAgent: 1, targetAgent: 2, x: 1, y: 1, timestamp: 1 });
    const unprovenanced = { ...good, id: 'bad', provenance: undefined } as unknown as GenesisEvent;

    const analysis = analyseEpidemicTransmissionEvents([good, unprovenanced]);
    expect(analysis.status).toBe('BLOCKED_INCOMPLETE_PROVENANCE');
    expect(analysis.rejectedEventIds).toContain('bad');
    // The whole conclusion is withheld — a mixed stream must never be presented as a real graph.
    expect(analysis.metrics.transmissionCount).toBe(0);
    expect(analysis.graph.edges).toHaveLength(0);
  });

  it('BLOCKS on a duplicated event id', () => {
    const event = transmission({ id: 'dup', sourceAgent: 1, targetAgent: 2, x: 1, y: 1, timestamp: 1 });
    const analysis = analyseEpidemicTransmissionEvents([event, { ...event }]);
    expect(analysis.status).toBe('BLOCKED_DUPLICATE_EVENT_ID');
    expect(analysis.rejectedEventIds).toEqual(['dup']);
  });

  it('reports NO_TRANSMISSIONS for an unrelated event stream rather than inventing an empty "result"', () => {
    const analysis = analyseEpidemicTransmissionEvents([
      { ...transmission({ id: 'x', sourceAgent: 1, targetAgent: 2, x: 0, y: 0, timestamp: 0 }), type: 'hydraulics.pumppipe.step' } as GenesisEvent,
    ]);
    expect(analysis.status).toBe('NO_TRANSMISSIONS');
    expect(analysis.limitations.length).toBeGreaterThan(0);
  });

  it('is deterministic: identical input yields an identical fingerprint and serialization', () => {
    const build = () => [
      transmission({ id: 'e1', sourceAgent: 1, targetAgent: 2, x: 10, y: 10, timestamp: 5 }),
      transmission({ id: 'e2', sourceAgent: 2, targetAgent: 3, x: 11, y: 12, timestamp: 7 }),
    ];
    const first = analyseEpidemicTransmissionEvents(build());
    const second = analyseEpidemicTransmissionEvents(build());
    expect(second.analysisFingerprint).toBe(first.analysisFingerprint);
    expect(serializeEpidemicTransmissionAnalysis(second)).toBe(serializeEpidemicTransmissionAnalysis(first));

    // A different event set must NOT collide with the previous fingerprint.
    const different = analyseEpidemicTransmissionEvents([transmission({ id: 'e1', sourceAgent: 9, targetAgent: 8, x: 1, y: 1, timestamp: 1 })]);
    expect(different.analysisFingerprint).not.toBe(first.analysisFingerprint);
  });

  it('rejects a non-positive grid size rather than guessing one', () => {
    expect(() => analyseEpidemicTransmissionEvents([], { cellSizeWorldUnits: 0 })).toThrow(/greater than zero/);
  });
});
