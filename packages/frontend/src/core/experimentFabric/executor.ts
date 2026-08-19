import { atomCount, degreeOfUnsaturation, molecularWeight, parseFormula } from '../compute/cheminformatics';
import { buildPumpPipeModel } from '../engineeringGraph/pumpPipe';
import { solveKitaevBulk } from '../compute/kitaevBulk';
import { EventRegistry, EventStream, ingestTransmissions } from '../events';
import { buildAtmosphericEscapeGraph } from '../modelGraph/atmosphericEscapeGraph';
import { buildBohrModelGraph } from '../modelGraph/bohrModelGraph';
import { buildChemistryKineticsGraph } from '../modelGraph/chemistryKineticsGraph';
import { buildGaussianGraph } from '../modelGraph/gaussianGraph';
import { buildLogisticGrowthGraph } from '../modelGraph/logisticGrowthGraph';
import { buildNuclearModelGraph } from '../modelGraph/nuclearGraph';
import { buildOrbitalModelGraph } from '../modelGraph/orbitalGraph';
import { buildRelativisticEnergyGraph } from '../modelGraph/relativisticEnergyGraph';
import { buildSpecialRelativityGraph } from '../modelGraph/specialRelativityGraph';
import { buildPhotonGraph } from '../modelGraph/photonGraph';
import { chirpMassSolar, iscoFrequency, kardashevPower, schwarzschildRadius } from '../physics';
import { EpidemicCitySimulation, DEFAULT_CITY_PARAMS } from '../simulation/epidemicCity';
import { createExperimentProvenance, statusForCapability } from './provenance';
import { createExperimentIntent, createExperimentPlan, getRouterModel, validateStructuredExperimentRequest } from './router';
import { registerLiveExperimentWorld } from './worldHandoff';
import {
  EXPERIMENT_FABRIC_VERSION,
  type ExperimentResult,
  type ExperimentRoute,
  type ExperimentRun,
  type ExperimentValue,
  type StructuredExperimentRequest,
} from './types';

const SOLAR_MASS_KG = 1.989e30;

type ExecutableGraph = {
  getParameterNodeIds(): readonly string[];
  applyParameterSnapshot(snapshot: Record<string, number>): void;
  getValue(id: string): number;
  getNode(id: string): { unit: string; honestyNote: string } | undefined;
};

function routeForUnavailable(): ExperimentRoute { return { kind: 'none' }; }

function unavailableResult(status: Exclude<ExperimentResult['status'], 'completed' | 'rejected' | 'failed'>, summary: string, route: ExperimentRoute): ExperimentResult {
  return {
    contractVersion: EXPERIMENT_FABRIC_VERSION,
    status,
    summary,
    outputs: {},
    units: {},
    warnings: [summary],
    assumptions: [],
    visualization: [],
    route,
  };
}

function rejectedResult(errors: readonly string[]): ExperimentResult {
  return {
    contractVersion: EXPERIMENT_FABRIC_VERSION,
    status: 'rejected',
    summary: `Eksperyment odrzucony przez walidację: ${errors.join(' ')}`,
    outputs: {}, units: {}, warnings: [], assumptions: [], visualization: [], route: routeForUnavailable(),
  };
}

function graphOutputs(
  graph: ExecutableGraph,
  params: Record<string, ExperimentValue>,
  outputIds: readonly string[],
): { outputs: Record<string, number>; units: Record<string, string>; assumptions: string[] } {
  const snapshot: Record<string, number> = {};
  for (const id of graph.getParameterNodeIds()) {
    const candidate = params[id];
    if (typeof candidate === 'number') snapshot[id] = candidate;
  }
  graph.applyParameterSnapshot(snapshot);
  const outputs: Record<string, number> = {};
  const units: Record<string, string> = {};
  const assumptions: string[] = [];
  for (const id of outputIds) {
    outputs[id] = graph.getValue(id);
    const node = graph.getNode(id);
    if (node) { units[id] = node.unit; assumptions.push(node.honestyNote); }
  }
  return { outputs, units, assumptions };
}

function executeRealModel(request: StructuredExperimentRequest, onLiveWorld?: (simulation: EpidemicCitySimulation) => void): ExperimentResult {
  const model = request.modelId ? getRouterModel(request.modelId) : undefined;
  if (!model) throw new Error('Brak lokalnego adaptera realnego modelu.');
  const params = request.parameters;
  switch (model.id) {
    case 'einstein-schwarzschild': {
      const massSolar = typeof params.massSolar === 'number' ? params.massSolar : 1;
      const radiusMeters = schwarzschildRadius(massSolar * SOLAR_MASS_KG);
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed',
        summary: `Promień Schwarzschilda obliczony dla masy ${massSolar} M☉.`,
        outputs: { radiusMeters, radiusKm: radiusMeters / 1000 }, units: { radiusMeters: 'm', radiusKm: 'km' }, warnings: [],
        validity: 'Metryka Schwarzschilda: czarna dziura nieobracająca się i nie naładowana.',
        assumptions: ['r_s = 2GM/c²', 'Brak spinu i ładunku.'], visualization: ['numeric', 'graph', 'scene-3d'], route: model.route,
      };
    }
    case 'universe-kepler': {
      const details = graphOutputs(buildOrbitalModelGraph(), params, ['orbitalPeriodYears', 'orbitalSpeedAuPerYear', 'relativeTidalStrength']);
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: 'Wykonano graf orbitalny Keplera.',
        outputs: details.outputs, units: details.units, warnings: [], validity: 'Zagadnienie dwóch ciał; orbita kołowa.',
        assumptions: details.assumptions, visualization: ['numeric', 'graph', 'scene-3d'], route: model.route,
      };
    }
    case 'atom-bohr': {
      const details = graphOutputs(buildBohrModelGraph(), params, ['energyLevelEV', 'orbitalRadiusPm', 'ionizationPhotonEV']);
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: 'Wykonano model Bohra dla układu wodoropodobnego.',
        outputs: details.outputs, units: details.units, warnings: [], validity: 'Ścisły dla atomów i jonów jednoelektronowych.',
        assumptions: details.assumptions, visualization: ['numeric', 'graph', 'scene-3d'], route: model.route,
      };
    }
    case 'photon-energy': {
      const details = graphOutputs(buildPhotonGraph(), params, ['photonEnergyEV', 'photonFrequencyTHz', 'photonEnergyKJmol']);
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: 'Obliczono energię i częstotliwość fotonu z długości fali.',
        outputs: details.outputs, units: details.units, warnings: [], validity: 'Model opisuje pojedynczy foton E = hc/λ, nie pole elektromagnetyczne.',
        assumptions: details.assumptions, visualization: ['numeric', 'graph'], route: model.route,
      };
    }
    case 'nuclear-semf': {
      const details = graphOutputs(buildNuclearModelGraph(), params, ['massNumber', 'bindingEnergy', 'bindingPerNucleon', 'stabilityGradient']);
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: 'Wykonano istniejący model jądrowy SEMF.',
        outputs: details.outputs, units: details.units, warnings: [], validity: 'Model kroplowy; pomija efekty powłokowe.',
        assumptions: details.assumptions, visualization: ['numeric', 'graph', 'scene-3d'], route: model.route,
      };
    }
    case 'sr-lorentz': {
      const details = graphOutputs(buildSpecialRelativityGraph(), params, ['lorentzGammaFactor', 'dilatedTimeSeconds', 'contractedLengthMeters', 'dopplerApproaching']);
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: 'Wykonano istniejący graf szczególnej teorii względności.',
        outputs: details.outputs, units: details.units, warnings: [], validity: 'Ruch inercjalny wzdłuż jednej osi; β < 1.',
        assumptions: details.assumptions, visualization: ['numeric', 'graph', 'scene-3d'], route: model.route,
      };
    }
    case 'universe-atmospheric-escape': {
      const details = graphOutputs(buildAtmosphericEscapeGraph(), params, ['equilibriumTempK', 'escapeVelocityMs', 'thermalVelocityMs', 'jeansParameter', 'thermalToEscapeRatio']);
      const lambda = details.outputs.jeansParameter;
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: 'Wykonano istniejący model ucieczki atmosferycznej Jeansa.',
        outputs: details.outputs, units: details.units,
        warnings: lambda < 15 ? ['Parametr Jeansa < 15: przybliżenie stabilnej atmosfery nie obowiązuje.'] : [],
        validity: 'Ucieczka termiczna Jeansa; bez efektu cieplarnianego, hydrodynamiki i wiatru gwiazdowego.',
        assumptions: details.assumptions, visualization: ['numeric', 'graph', 'scene-3d'], route: model.route,
      };
    }
    case 'particle-relativistic-energy': {
      const details = graphOutputs(buildRelativisticEnergyGraph(), params, ['lorentzGammaFactor', 'totalEnergyMeV', 'kineticEnergyMeV', 'momentumMeVc']);
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: 'Wykonano istniejący model energii relatywistycznej cząstki.',
        outputs: details.outputs, units: details.units, warnings: [], validity: 'Cząstka swobodna w próżni; β < 1.',
        assumptions: details.assumptions, visualization: ['numeric', 'graph', 'scene-3d'], route: model.route,
      };
    }
    case 'chemistry-arrhenius': {
      const details = graphOutputs(buildChemistryKineticsGraph(), params, ['rateConstant', 'halfLifeFirstOrder', 'speedupVsRoom']);
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: 'Wykonano istniejący graf kinetyki Arrheniusa.',
        outputs: details.outputs, units: details.units, warnings: [], validity: 'Stały czynnik A i energia aktywacji; model reakcji I rzędu dla t½.',
        assumptions: details.assumptions, visualization: ['numeric', 'graph'], route: model.route,
      };
    }
    case 'math-gaussian': {
      const details = graphOutputs(buildGaussianGraph(), params, ['zScore', 'pdfValue', 'probWithinZ']);
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: 'Wykonano istniejący graf rozkładu normalnego.',
        outputs: details.outputs, units: details.units, warnings: [], validity: 'σ > 0; rozkład normalny.',
        assumptions: details.assumptions, visualization: ['numeric', 'graph'], route: model.route,
      };
    }
    case 'biology-logistic': {
      const details = graphOutputs(buildLogisticGrowthGraph(), params, ['populationAtT', 'fractionOfCapacity']);
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: 'Wykonano istniejący model wzrostu logistycznego.',
        outputs: details.outputs, units: details.units, warnings: [], validity: 'Stałe r i K; bez struktury wiekowej, opóźnień i stochastyki.',
        assumptions: details.assumptions, visualization: ['numeric', 'graph'], route: model.route,
      };
    }
    case 'einstein-chirp-mass': {
      const m1Solar = numberParam(params, 'm1Solar', 30);
      const m2Solar = numberParam(params, 'm2Solar', 30);
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: 'Obliczono istniejącą funkcję masy chirp i częstotliwości ISCO.',
        outputs: { chirpMassSolar: chirpMassSolar(m1Solar, m2Solar), iscoFrequencyHz: iscoFrequency(m1Solar + m2Solar) },
        units: { chirpMassSolar: 'M☉', iscoFrequencyHz: 'Hz' }, warnings: [],
        validity: 'Przybliżenie punktowe inspiralu; ISCO Schwarzschilda przed połączeniem.',
        assumptions: ['Brak spinu i pełnej numerycznej relatywistyki.'], visualization: ['numeric', 'graph', 'scene-3d'], route: model.route,
      };
    }
    case 'chem-molecular-weight': {
      const formula = typeof params.formula === 'string' ? params.formula : 'H2O';
      const parsed = parseFormula(formula);
      if (!parsed.ok) throw new Error(parsed.error ?? 'Niepoprawny wzór sumaryczny.');
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: 'Obliczono masę molową z istniejącego parsera wzoru sumarycznego.',
        outputs: { molarMassGmol: molecularWeight(parsed.counts), atomCount: atomCount(parsed.counts), degreeOfUnsaturation: degreeOfUnsaturation(parsed.counts) },
        units: { molarMassGmol: 'g/mol', atomCount: '', degreeOfUnsaturation: '' }, warnings: [],
        validity: 'Wzory bez nawiasów, hydratów i izotopów; stopień nienasycenia dla CHNOX.',
        assumptions: ['Parser cheminformatyczny Genesis v1.'], visualization: ['numeric', 'graph'], route: model.route,
      };
    }
    case 'civilization-kardashev': {
      const kardashevType = numberParam(params, 'kardashevType', 1);
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: 'Obliczono istniejącą klasyfikacyjną skalę mocy Kardaszewa.',
        outputs: { powerWatts: kardashevPower(kardashevType) }, units: { powerWatts: 'W' }, warnings: [],
        validity: 'Skala klasyfikacyjna Sagana; ekstrapolacja interpretacyjna, nie prognoza społeczna.',
        assumptions: ['P = 10^(10K+6) W.'], visualization: ['numeric', 'graph', 'narrative'], route: model.route,
      };
    }
    case 'quantum-kitaev-bulk': {
      const chemicalPotential = numberParam(params, 'chemicalPotential', 0);
      const hopping = numberParam(params, 'hopping', 1);
      const pairing = numberParam(params, 'pairing', 1);
      const solved = solveKitaevBulk({ chemicalPotential, hopping, pairing });
      const warning = solved.phase === 'CRITICAL_BOUNDARY'
        ? ['Bulk gap zamyka się na granicy fazy; klasyfikacja topologiczna nie jest tam stabilna.']
        : [];
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed',
        summary: `Wykonano analityczny bulk model BdG łańcucha Kitaeva: ${solved.phase}.`,
        outputs: {
          bulkGap: solved.bulkGap,
          momentumAtGapRad: solved.momentumAtGap,
          topologicalInvariant: solved.topologicalInvariant,
          phaseClass: solved.phase,
          criticalChemicalPotentialNegative: solved.criticalChemicalPotentialNegative,
          criticalChemicalPotentialPositive: solved.criticalChemicalPotentialPositive,
        },
        units: {
          bulkGap: 'jedn. energii', momentumAtGapRad: 'rad', topologicalInvariant: '', phaseClass: '',
          criticalChemicalPotentialNegative: 'jedn. energii', criticalChemicalPotentialPositive: 'jedn. energii',
        },
        warnings: warning,
        validity: 'Bezinterakcyjny, translacyjnie niezmienny 1D spinless p-wave bulk model BdG; nie jest modelem nanodrutu, materiału, urządzenia ani wyniku eksperymentu Majorana 1.',
        assumptions: [
          'E(k)=±√((-2t cos k−μ)²+4Δ² sin²k).',
          'Klasyfikacja bulk: |μ|<2|t| przy Δ≠0.',
          solved.finiteSizeCaveat,
        ],
        visualization: ['numeric', 'graph'], route: model.route,
      };
    }
    case 'water-pump-pipe': {
      const defaults = {
        volumetricFlow: numberParam(params, 'volumetricFlow', 0.05), pipeDiameter: numberParam(params, 'pipeDiameter', 0.1),
        pipeLength: numberParam(params, 'pipeLength', 100), pipeRoughnessMm: numberParam(params, 'pipeRoughnessMm', 0.045),
        staticLift: numberParam(params, 'staticLift', 10), fluidDensity: numberParam(params, 'fluidDensity', 998),
        fluidViscosity: numberParam(params, 'fluidViscosity', 1.002e-3), pumpEfficiency: numberParam(params, 'pumpEfficiency', 0.7),
      };
      const engineering = buildPumpPipeModel(defaults);
      const ids = ['flowVelocity', 'reynolds', 'frictionFactor', 'headLoss', 'totalHead', 'hydraulicPower', 'shaftPower'];
      const outputs: Record<string, number> = {};
      const units: Record<string, string> = {};
      const assumptions: string[] = [];
      for (const id of ids) {
        outputs[id] = engineering.getValue(id);
        const node = engineering.graph.getNode(id);
        if (node) { units[id] = node.unit; assumptions.push(node.honestyNote); }
      }
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed', summary: 'Wykonano rzeczywisty model pompa–rurociąg.',
        outputs, units, warnings: [], validity: 'Swamee–Jain obowiązuje w zadanym zakresie przepływu; wynik nie jest CFD.',
        assumptions, visualization: ['numeric', 'graph'], route: model.route,
      };
    }
    case 'epidemic-city': {
      const seed = request.seed ?? numberParam(params, 'seed', DEFAULT_CITY_PARAMS.seed);
      const horizonDays = numberParam(params, 'horizonDays', 90);
      const sim = new EpidemicCitySimulation({
        r0: numberParam(params, 'r0', DEFAULT_CITY_PARAMS.r0),
        nAgents: numberParam(params, 'nAgents', DEFAULT_CITY_PARAMS.nAgents),
        seed,
      });
      const registry = new EventRegistry({ modelId: 'biology.city', experimentId: 'epidemic-city', seed });
      const steps = Math.round(horizonDays * 4);
      for (let step = 0; step < steps; step++) {
        sim.tick(0.25);
        ingestTransmissions(registry, sim.lastTransmissions(), {
          simTime: step * 0.25,
          modelId: 'biology.city', experimentId: 'epidemic-city', seed, params: sim.getParams(),
        });
      }
      const stream = new EventStream(registry);
      const events = stream.all();
      onLiveWorld?.(sim);
      return {
        contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'completed',
        summary: `Wykonano ${horizonDays}-dniowy, deterministyczny przebieg EpidemicCitySimulation.`,
        outputs: sim.stats(), units: { dzien: 'dni', agenci: 'osób', S: 'osób', E: 'osób', I: 'osób', R: 'osób', D: 'osób' },
        warnings: ['Model przedstawia abstrakcyjny Pathogen X i jest edukacyjny, nie prognostyczny.'],
        validity: 'Agentowy model SEIRD z kontaktami przestrzennymi i stałymi parametrami runu.',
        assumptions: ['Jeden realny model EpidemicCitySimulation.', 'GenesisEvent powstaje wyłącznie z lastTransmissions().'],
        visualization: ['world-3d', 'graph'], route: model.route,
        eventSummary: { count: events.length, types: [...new Set(events.map((event) => event.type))] },
      };
    }
  }
  throw new Error(`Nieobsługiwany adapter ${model.id}.`);
}

function numberParam(params: Record<string, ExperimentValue>, key: string, fallback: number): number {
  const value = params[key];
  return typeof value === 'number' ? value : fallback;
}

/** Full deterministic request → result/provenance execution path for local real models. */
export function runExperiment(request: StructuredExperimentRequest): ExperimentRun {
  const validation = validateStructuredExperimentRequest(request);
  const intent = createExperimentIntent(request);
  const plan = createExperimentPlan(intent);
  let result: ExperimentResult;
  let liveWorld: EpidemicCitySimulation | undefined;
  if (!validation.ok) result = rejectedResult(validation.errors);
  else {
    const status = statusForCapability(intent.capability);
    if (status === 'knowledge_only') result = unavailableResult(status, `Corpus Genesis opisuje domenę „${request.domainId}”, ale nie ma dla niej wykonawczego solvera.`, routeForUnavailable());
    else if (status === 'capability_seam') result = unavailableResult(status, `${intent.rationale} Wymagany solver: ${intent.requiredSolver}.`, routeForUnavailable());
    else if (status === 'engine_not_available') result = unavailableResult(status, `${intent.rationale} Wymagany solver: ${intent.requiredSolver}.`, routeForUnavailable());
    else {
      try { result = executeRealModel(request, (simulation) => { liveWorld = simulation; }); }
      catch (error) {
        result = {
          contractVersion: EXPERIMENT_FABRIC_VERSION, status: 'failed', summary: 'Realny silnik zwrócił błąd wykonania.',
          outputs: {}, units: {}, warnings: [], assumptions: [], visualization: [], route: routeForUnavailable(),
          validity: String(error instanceof Error ? error.message : error),
        };
      }
    }
  }
  const provenance = createExperimentProvenance({
    request, plan, result, knowledgeSources: intent.knowledgeSources,
    supplementalKnowledgeIds: intent.supplementalKnowledgeIds,
    deterministic: result.status === 'completed',
  });
  const run: ExperimentRun = {
    contractVersion: EXPERIMENT_FABRIC_VERSION,
    runId: provenance.runFingerprint,
    request,
    intent,
    plan,
    result,
    provenance,
  };
  if (liveWorld && result.status === 'completed') registerLiveExperimentWorld(run.runId, liveWorld);
  return run;
}
