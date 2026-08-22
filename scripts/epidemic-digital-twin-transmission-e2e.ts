import {
  EventRegistry,
  EventStream,
  analyseEpidemicTransmissionEvents,
  ingestTransmissions,
  serializeEpidemicTransmissionAnalysis,
} from '../packages/frontend/src/core/events';
import { EpidemicCitySimulation } from '../packages/frontend/src/core/simulation/epidemicCity';
import { runExperiment } from '../packages/frontend/src/core/experimentFabric';

const SEED = 321;
const HORIZON_DAYS = 30;
const STEP_DAYS = 0.05;

function executeRealTransmissionRun() {
  const sim = new EpidemicCitySimulation({ nAgents: 220, r0: 4, contactRadius: 18, seed: SEED });
  const registry = new EventRegistry({ modelId: 'biology.city', experimentId: 'epidemic-digital-twin-e2e', seed: SEED });
  for (let step = 0; step < Math.round(HORIZON_DAYS / STEP_DAYS); step++) {
    sim.tick(STEP_DAYS);
    ingestTransmissions(registry, sim.lastTransmissions(), {
      simTime: (step + 1) * STEP_DAYS,
      modelId: 'biology.city',
      experimentId: 'epidemic-digital-twin-e2e',
      seed: SEED,
      params: sim.getParams(),
    });
  }
  const stream = new EventStream(registry);
  return { sim, events: stream.all(), analysis: analyseEpidemicTransmissionEvents(stream.all()) };
}

function main(): void {
  const first = executeRealTransmissionRun();
  const replay = executeRealTransmissionRun();
  const fabricRequest = {
    contractVersion: '1.0.0',
    sourceText: 'Uruchom realną epidemię i przeanalizuj zdarzenia transmisji.',
    domainId: 'biology',
    operation: 'simulate' as const,
    modelId: 'epidemic-city',
    parameters: { r0: 4, horizonDays: HORIZON_DAYS, nAgents: 220 },
    seed: SEED,
  };
  const fabricRun = runExperiment(fabricRequest);
  const noTransmissionControl = runExperiment({
    ...fabricRequest,
    sourceText: 'Uruchom kontrolny wariant z wyłączoną transmisją i izolacją.',
    parameters: { ...fabricRequest.parameters, transmissionScale: 0, restrictions: 0.9, isolate: true },
  });
  const assertions = {
    realModelProducedEvents: first.events.length > 0,
    analysisAvailable: first.analysis.status === 'AVAILABLE',
    everyEventIsModelProvenanced: first.events.every((event) => event.provenance?.origin === 'model' && event.modelId === 'biology.city'),
    graphHasNodesAndEdges: first.analysis.graph.nodes.length > 0 && first.analysis.graph.edges.length > 0,
    hotspotRankingUsesEvents: first.analysis.hotspots.length > 0 && first.analysis.hotspots[0].transmissionCount > 0,
    replayMatches: serializeEpidemicTransmissionAnalysis(first.analysis) === serializeEpidemicTransmissionAnalysis(replay.analysis),
    fabricPublishesSameKindOfMetrics: fabricRun.result.status === 'completed'
      && fabricRun.result.eventAnalysis?.status === 'AVAILABLE'
      && Number(fabricRun.result.eventAnalysis.metrics.transmissionEvents) > 0
      && Number(fabricRun.result.eventAnalysis.metrics.transmissionHotspotCells) > 0,
    noTransmissionControlIsReal: noTransmissionControl.result.status === 'completed'
      && noTransmissionControl.provenance.parameterSnapshot.transmissionScale === 0
      && noTransmissionControl.provenance.parameterSnapshot.isolate === true
      && noTransmissionControl.result.eventSummary?.count === 0
      && noTransmissionControl.result.eventAnalysis?.status === 'NO_TRANSMISSIONS',
  };
  if (Object.values(assertions).some((value) => !value)) {
    throw new Error(`Epidemic Digital Twin E2E assertions failed:\n${JSON.stringify({ assertions, first: first.analysis, replay: replay.analysis, fabricRun }, null, 2)}`);
  }
  process.stdout.write(`${JSON.stringify({
    status: 'PASS',
    model: 'EpidemicCitySimulation',
    modelClassification: 'SIMULATED_MODEL_OUTPUT',
    horizonDays: HORIZON_DAYS,
    seed: SEED,
    transmissionEvents: first.analysis.metrics.transmissionCount,
    uniqueTransmissionSources: first.analysis.metrics.uniqueSourceAgents,
    uniqueTransmissionTargets: first.analysis.metrics.uniqueTargetAgents,
    hotspotCount: first.analysis.hotspots.length,
    largestHotspotTransmissionCount: first.analysis.hotspots[0].transmissionCount,
    peakTransmissionTime: first.analysis.metrics.peakTransmissionTimestamp,
    analysisFingerprint: first.analysis.analysisFingerprint,
    replayStatus: 'MATCH',
    fabricRunFingerprint: fabricRun.provenance.runFingerprint,
    noTransmissionControlRunFingerprint: noTransmissionControl.provenance.runFingerprint,
    assertions,
    limitations: first.analysis.limitations,
  }, null, 2)}\n`);
}

main();
