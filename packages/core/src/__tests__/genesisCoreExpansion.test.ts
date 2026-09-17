/* Proprietary / All Rights Reserved - Genesis OS */
import { describe, expect, it } from 'vitest';
import { HypothesisTournament, C_LIGHT } from '../engine/hypothesisTournament.js';
import { buildContainerBundle, verifyContainerOffline, computeStateHashes, parseZip, zipStore, type ContainerDelta } from '../evidence/evidenceContainer.js';
import { generateAuditReport, mapDeltaToVisual } from '../reports/auditReportGenerator.js';
import { GisOpenUSDAdapter } from '../connectors/gisOpenUSDAdapter.js';
import { SensorWebhookStream, InMemoryTransport } from '../connectors/sensorWebhookStream.js';
import { bindTournamentToDirector, bindGisToWorldGraph, type WorldGraph, type ObservationDirector } from '../glue/genesisBindings.js';
const clock = { t: 1000, now() { return this.t; } };
describe('hypothesis tournament', () => {
  it('rejects superluminal hypothesis pre-execution', () => {
    const t = new HypothesisTournament({ maxVelocity: C_LIGHT, conservationTolerance: 0 }, clock);
    t.addHypothesis({ id: 'H1', statement: 'FTL', domain: 'physics', predictedEffect: { velocity: C_LIGHT * 2 }, assumptions: [], grounded: true });
    const v = t.reflect('H1');
    expect(v.passesPhysicalBounds).toBe(false); expect(t.gatedRejects()).toContain('H1');
  });
  it('flags ungrounded state explicitly', () => {
    const t = new HypothesisTournament({}, clock);
    t.addHypothesis({ id: 'H2', statement: 'x', domain: 'd', predictedEffect: {}, assumptions: [], grounded: false });
    expect(t.getUngroundedFlags()).toContain('UNGROUNDED_STATE:H2');
  });
  it('elo updates deterministically & sets LEADING', () => {
    const mk = () => { const t = new HypothesisTournament({}, clock); t.addHypothesis({ id: 'A', statement: 'a', domain: 'd', predictedEffect: {}, assumptions: [], grounded: true }); t.addHypothesis({ id: 'B', statement: 'b', domain: 'd', predictedEffect: {}, assumptions: [], grounded: true }); t.runRound([['A', 'B']], ['A']); return t.getStandings(); };
    expect(mk()).toEqual(mk()); expect(mk()[0].hypothesis.id).toBe('A'); expect(mk()[0].status).toBe('LEADING');
  });
});
describe('evidence container', () => {
  const input = { tank: { temp: 20, ph: 7 } };
  const deltas: ContainerDelta[] = [{ seq: 0, op: 'set', path: 'tank.temp', value: 24 }, { seq: 1, op: 'add', path: 'tank.ph', value: 0.2 }];
  it('hash chain length = deltas+1', () => { expect(computeStateHashes(input, deltas).hashes.length).toBe(3); });
  it('offline verification passes on intact bundle', () => { const bundle = buildContainerBundle(input, deltas, clock); expect(verifyContainerOffline(bundle).ok).toBe(true); });
  it('offline verification fails on tampered delta', () => {
    const bundle = buildContainerBundle(input, deltas, clock);
    const map = parseZip(bundle);
    const payload = JSON.parse(new TextDecoder().decode(map.get('container.json')!)) as { deltas: ContainerDelta[] };
    payload.deltas[0].value = 99;
    const tampered = zipStore([{ name: 'container.json', data: new TextEncoder().encode(JSON.stringify(payload)) }, { name: 'manifest.json', data: map.get('manifest.json')! }]);
    expect(verifyContainerOffline(tampered).ok).toBe(false);
  });
});
describe('audit report generator', () => {
  it('maps deltas to visual states', () => { expect(mapDeltaToVisual({ step: 0, metric: 'p', value: 1, thresholdWarning: 2, thresholdCritical: 5 })).toBe('NORMAL'); expect(mapDeltaToVisual({ step: 1, metric: 'p', value: 3, thresholdWarning: 2, thresholdCritical: 5 })).toBe('WARNING'); expect(mapDeltaToVisual({ step: 2, metric: 'p', value: 6, thresholdWarning: 2, thresholdCritical: 5 })).toBe('CRITICAL'); });
  it('json-ld + html + deterministic fingerprint', () => {
    const trail = { runId: 'R1', steps: [{ step: 0, metric: 'p', value: 6, thresholdWarning: 2, thresholdCritical: 5 }], counterfactualBranches: [{ branchId: 'B1', divergenceStep: 0, visualState: 'CRITICAL' as const }], decisionTree: [{ nodeId: 'N1', parent: null, choice: 'stop', visualState: 'CRITICAL' as const }] };
    const a = generateAuditReport(trail, clock); const b = generateAuditReport(trail, clock);
    expect(a.jsonLd['@context']).toBeTruthy(); expect(a.html).toContain('CRITICAL'); expect(a.fingerprint).toBe(b.fingerprint);
  });
});
describe('gis/usd adapter & stream->ecs', () => {
  it('ingests gis + usd into grounded ecs entities', () => {
    const a = new GisOpenUSDAdapter();
    const ents = a.ingestBoth([{ id: '1', kind: 'node', coordinates: [1, 2, 3] }], [{ path: '/Pump/1', typeName: 'Pump', attributes: { xyz: [4, 5, 6], verified: true } }]);
    expect(ents.length).toBe(2); expect(ents[0].grounded).toBe(true); expect(ents[1].grounded).toBe(true);
    expect(a.toWorldGraphPatch(ents).addNodes.length).toBe(2); expect(a.validate(ents).length).toBe(0);
  });
  it('sensor stream maps drift flags', () => {
    const tr = new InMemoryTransport();
    const s = new SensorWebhookStream(tr, () => 100, 1);
    s.start(); tr.push({ sensorId: 'S1', metric: 'pressure', value: 100.5, observedAt: 1 }); tr.push({ sensorId: 'S1', metric: 'pressure', value: 108, observedAt: 2 });
    const u = s.getUpdates(); expect(u[0].driftFlag).toBe('OK'); expect(u[1].driftFlag).toBe('DRIFT_CRITICAL'); s.stop();
  });
});
describe('glue bindings', () => {
  it('binds rejects + gis patch to directors/worldgraph', () => {
    const t = new HypothesisTournament({ conservationTolerance: 0 }, clock);
    t.addHypothesis({ id: 'H1', statement: 'mass create', domain: 'd', predictedEffect: { massDelta: 5 }, assumptions: [], grounded: true });
    t.reflect('H1');
    const obs: unknown[] = []; const director: ObservationDirector = { record: o => obs.push(o) };
    bindTournamentToDirector(t, director, clock); expect(obs.length).toBeGreaterThan(0);
    const nodes: unknown[] = []; const wg: WorldGraph = { addNode: n => nodes.push(n) };
    bindGisToWorldGraph(new GisOpenUSDAdapter(), new GisOpenUSDAdapter().ingestGis([{ id: '9', kind: 'node', coordinates: [0, 0, 0] }]), wg);
    expect(nodes.length).toBe(1);
  });
});
