import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildExperimentGraph,
  type ExperimentGraphInput,
} from '../core/experimentFabric/experimentGraph';
import {
  executePreregisteredHypotheses,
  generateCompetingHypotheses,
  preregisterHypotheses,
  selectNextHypothesisExperiment,
  HYPOTHESIS_PROBLEMS,
} from '../core/experimentFabric/hypothesisLoop';
import {
  CAMPAIGN_SELECTOR_ID,
  EXPERIMENT_GRAPH_SELECTOR_ID,
  experimentGraphNextAction,
  hypothesisLoopNextAction,
  HYPOTHESIS_LOOP_SELECTOR_ID,
  makeCampaignNextAction,
  NEXT_ACTION_CONTRACT_VERSION,
  NEXT_ACTION_SELECTORS,
  PARAMETER_INQUIRY_SELECTOR_ID,
  parameterInquiryNextAction,
  WORLD_CALIBRATION_SELECTOR_ID,
  worldCalibrationNextAction,
  WORLD_COUNTERFACTUAL_SELECTOR_ID,
  worldCounterfactualNextAction,
  type NextAction,
} from '../core/agent/nextAction';
import { runAutonomousInquiry } from '../core/agent/inquiryLoop';
import {
  epidemicInfectiousDaysCalibration,
  epidemicInfectiousDaysSystem,
} from '../core/agent/epidemicInfectiousDaysCalibration';
import { runAutonomousWorldCalibration } from '../core/agent/worldParameterCalibration';
import { compareBranches } from '../core/worldModel/bridge/worldFrameState';
import {
  assessWorldCounterfactual,
  diffWorldBranches,
  preregisterWorldCounterfactual,
  selectNextWorldExperiment,
  verifyControlledDifference,
} from '../core/worldModel/discovery/worldCounterfactual';
import {
  buildGenesisScientificCity3,
  GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID,
} from '../core/worldModel/domains/genesisScientificCity3';
import {
  precisionAnalysisNextAction,
  PRECISION_ANALYSIS_SELECTOR_ID,
} from '../core/agent/nextAction';
import { proposeNextPrecisionExperiment } from '../core/discovery/molecular/precisionEvidencePack';
import {
  runPrecisionReferenceAnalysis,
  type PrecisionCompoundRequest,
} from '../core/discovery/molecular/precisionReferenceAnalysis';
import { createNodeRdkitTransport } from '../core/discovery/molecular/rdkitTransport.node';
import { TemporalBranchRegistry, TemporalEngine } from '../core/worldModel/temporal/temporalEngine';

/**
 * ONE INTERFACE OVER FIVE REAL SELECTORS.
 *
 * The whole point of this layer is that it changes nothing. So the central
 * assertion, repeated for every adapter, is that the adapter's `native` field
 * deep-equals what calling the wrapped selector directly returns — if an
 * adapter ever starts deciding something itself, that assertion fails.
 */

const TICKS = 12;

describe('Every adapter delegates, and none of them decides anything itself', () => {
  it('the hypothesis-loop adapter returns exactly what the real selector returns', () => {
    const problem = HYPOTHESIS_PROBLEMS[0];
    const result = executePreregisteredHypotheses(preregisterHypotheses(generateCompetingHypotheses(problem), { priorRunFingerprints: [] }));
    const direct = selectNextHypothesisExperiment(result);
    const wrapped = hypothesisLoopNextAction(result);

    expect(wrapped.native).toEqual(direct);
    expect(wrapped.selectorId).toBe(HYPOTHESIS_LOOP_SELECTOR_ID);
    expect(wrapped.status).toBe(direct.status);
    expect(wrapped.resolves).toBe(direct.resolves);
    expect(wrapped.rule).toBe(direct.rule);
    expect(wrapped.request).toEqual(direct.request);
    expect(wrapped.about).toEqual(direct.aboutHypothesisIds);
    expect(wrapped.domain).toBe(problem.domainId);
  });

  it('the world-counterfactual adapter returns exactly what the real selector returns', () => {
    const registry = new TemporalBranchRegistry();
    const run = (options: { rainfallAtTick?: number }) => {
      const city = buildGenesisScientificCity3(options);
      const engine = new TemporalEngine(city.graph, { registry });
      for (let i = 0; i < TICKS; i++) engine.advance(1, city.updater);
      return engine;
    };
    const baseline = run({});
    const storm = run({ rainfallAtTick: 2 });
    const diff = diffWorldBranches(compareBranches(registry, baseline.branchId, storm.branchId, TICKS));
    const assessment = assessWorldCounterfactual({
      preregistration: preregisterWorldCounterfactual({
        questionId: 'wcf:flood-depth',
        question: 'Does the storm deepen the floodplain?',
        worldId: 'genesis-scientific-city-3',
        entityId: GENESIS_SCIENTIFIC_CITY_FLOODPLAIN_ID,
        interventionDescription: 'Extreme rainfall at tick 2',
        criterion: { metric: 'maxDepthM', relation: 'greater-than', rationale: 'Rain raises depth.' },
        declaredAssumptions: ['Synthetic terrain'],
      }),
      diff,
      controlledDifference: verifyControlledDifference(registry, baseline.branchId, storm.branchId, 0),
      replayVerdict: 'MATCH',
    });

    const direct = selectNextWorldExperiment(assessment, diff);
    const wrapped = worldCounterfactualNextAction({ assessment, diff, domain: 'flood-hydrology' });

    expect(wrapped.native).toEqual(direct);
    expect(wrapped.selectorId).toBe(WORLD_COUNTERFACTUAL_SELECTOR_ID);
    expect(wrapped.status).toBe(direct.status);
    expect(wrapped.action).toBe(direct.action);
    expect(wrapped.why).toBe(direct.why);
    expect(wrapped.rule).toBe(direct.rule);
    // This selector proposes a change to a world run, so there is no router
    // request to hand back — reported as null rather than invented.
    expect(wrapped.request).toBeNull();
  });

  it('the experiment-graph adapter returns exactly what the real selector returns', () => {
    const input: ExperimentGraphInput = { question: 'What drives the outcome?', runs: [] };
    const direct = buildExperimentGraph(input).nextExperiment;
    const wrapped = experimentGraphNextAction(input);
    expect(wrapped.native).toEqual(direct);
    expect(wrapped.selectorId).toBe(EXPERIMENT_GRAPH_SELECTOR_ID);
    if (direct === null) {
      // No uncertainty found: reported as RESOLVED with the reason, not as an empty proposal.
      expect(wrapped.status).toBe('RESOLVED');
      expect(wrapped.action).toMatch(/No next experiment proposed/);
    } else {
      expect(wrapped.status).toBe(direct.status);
      expect(wrapped.action).toBe(direct.action);
      expect(wrapped.about).toEqual([direct.uncertaintyId]);
    }
  });

  it('the precision-analysis adapter returns exactly what the real selector returns', () => {
    const rdkit = createNodeRdkitTransport();
    const threeMmc: PrecisionCompoundRequest = { name: '3-MMC', fallbackSmiles: 'CNC(C)C(=O)c1cccc(C)c1', fallbackFormula: 'C11H15NO' };
    const fourCmc: PrecisionCompoundRequest = { name: '4-CMC', fallbackSmiles: 'CNC(C)C(=O)c1ccc(Cl)cc1', fallbackFormula: 'C10H12ClNO' };
    const result = runPrecisionReferenceAnalysis(threeMmc, fourCmc, { rdkit });

    const direct = proposeNextPrecisionExperiment(result);
    const wrapped = precisionAnalysisNextAction(result);

    expect(wrapped.native).toBe(direct);
    expect(wrapped.action).toBe(direct);
    expect(wrapped.selectorId).toBe(PRECISION_ANALYSIS_SELECTOR_ID);
    // This is the one selector that returns prose with no status. Deciding from
    // its wording whether it means READY_TO_RUN or RESOLVED would be the adapter
    // inventing a verdict the analysis never gave.
    expect(wrapped.status).toBe('UNSPECIFIED');
    expect(wrapped.resolves).toBeNull();
    expect(wrapped.rule).toBeNull();
  });

  it('the campaign adapter delegates to the injected backend selector', () => {
    // The real backend function is injected rather than imported, so this package
    // never pulls backend code into the browser bundle. Here a faithful stand-in
    // proves the delegation; the real function is exercised in the backend's own tests.
    const decisions: unknown[] = [];
    const analyzeAndDecide = (state: unknown) => {
      decisions.push(state);
      return { decision: 'INCREASE_DIVERSITY', params: { k: 4 }, newStrategy: { parentSelection: 'diverse' }, purpose: 'Front stalled.' };
    };
    const selector = makeCampaignNextAction({ analyzeAndDecide, isStop: (d) => d.startsWith('STOP_') });
    const state = { generation: 2 };
    const wrapped = selector(state);

    expect(decisions).toEqual([state]); // it really called through
    expect(wrapped.native).toEqual(analyzeAndDecide(state));
    expect(wrapped.selectorId).toBe(CAMPAIGN_SELECTOR_ID);
    expect(wrapped.status).toBe('READY_TO_RUN');
    expect(wrapped.action).toBe('INCREASE_DIVERSITY');
    expect(wrapped.why).toBe('Front stalled.');
  });

  it('the campaign adapter reports a stop decision as STOP, using the injected rule', () => {
    const selector = makeCampaignNextAction({
      analyzeAndDecide: () => ({ decision: 'STOP_OBJECTIVE_REACHED', params: {}, newStrategy: {}, purpose: 'Threshold reached.' }),
      // Whether a decision ends the campaign is the backend's own rule, injected
      // rather than re-derived here from the decision's spelling.
      isStop: (d) => d === 'STOP_OBJECTIVE_REACHED',
    });
    expect(selector({}).status).toBe('STOP');
  });
});

describe('The campaign adapter matches the REAL backend selector, not just a stand-in', () => {
  // The backend module is loaded dynamically so this package never statically
  // imports backend code (which would pull it into the browser bundle). Node can
  // load it, so the parity claim is checked against the real function rather than
  // asserted across a package boundary.
  // Resolved from the working directory rather than written as a bundler-visible
  // relative specifier: the point is that this path is never part of the build graph.
  const BACKEND_SELECTOR = pathToFileURL(
    path.resolve(process.cwd(), '../backend/src/campaign/nextExperiment.mjs'),
  ).href;

  it('returns exactly what analyzeAndDecide returns, and honours its own isStop', async () => {
    const backend = (await import(/* @vite-ignore */ BACKEND_SELECTOR)) as {
      analyzeAndDecide: (state: unknown) => { decision: string; params: Record<string, unknown>; newStrategy: unknown; purpose: string };
      isStop: (decision: string) => boolean;
    };
    const state = {
      generation: 1,
      strategy: { transformationWeights: { 'add-methyl': 1, 'add-fluoro': 1 }, parentSelection: 'pareto' },
      metrics: {
        hypervolume: 1, bestScalar: 0.5, paretoSize: 2, diversity: 0.4, retainedCount: 5,
        transformationStats: { 'add-methyl': { attempts: 2, successes: 2, paretoContrib: 1 }, 'add-fluoro': { attempts: 2, successes: 0, paretoContrib: 0 } },
        rejections: {}, generated: 4,
      },
      history: [{ hypervolume: 0.9, bestScalar: 0.6 }, { hypervolume: 1, bestScalar: 0.5 }],
      budget: { maxGenerations: 6, maxGeneratedCandidates: 100 },
      stopping: { patience: 2, minImprovement: 1e-3, diversityFloor: 0.15 },
    };

    const direct = backend.analyzeAndDecide(state);
    const wrapped = makeCampaignNextAction(backend)(state);

    expect(wrapped.native).toEqual(direct);
    expect(wrapped.action).toBe(direct.decision);
    expect(wrapped.why).toBe(direct.purpose);
    expect(wrapped.status).toBe(backend.isStop(direct.decision) ? 'STOP' : 'READY_TO_RUN');
  });
});

describe('The shared shape is honest about what each selector does not report', () => {
  const problem = HYPOTHESIS_PROBLEMS[0];
  const result = executePreregisteredHypotheses(preregisterHypotheses(generateCompetingHypotheses(problem), { priorRunFingerprints: [] }));

  it('stamps every action with the contract version and its own selector id', () => {
    const actions: NextAction[] = [
      hypothesisLoopNextAction(result),
      experimentGraphNextAction({ question: 'q', runs: [] }),
    ];
    for (const action of actions) {
      expect(action.contractVersion).toBe(NEXT_ACTION_CONTRACT_VERSION);
      expect(action.selectorId).toBeTruthy();
      expect(action.action).toBeTruthy();
      expect(action.why).toBeTruthy();
    }
  });

  it('never fabricates an executable request for a selector that produces none', () => {
    // The campaign changes its own strategy; there is no standalone request to run.
    const selector = makeCampaignNextAction({
      analyzeAndDecide: () => ({ decision: 'EXPLOIT_PROMISING_REGION', params: {}, newStrategy: {}, purpose: 'p' }),
      isStop: () => false,
    });
    expect(selector({}).request).toBeNull();
  });

  it('registers all seven real selectors, each naming the state it needs', () => {
    expect(NEXT_ACTION_SELECTORS).toHaveLength(7);
    const ids = NEXT_ACTION_SELECTORS.map((s) => s.selectorId);
    expect(new Set(ids).size).toBe(7);
    for (const selector of NEXT_ACTION_SELECTORS) {
      expect(selector.answersFor).toBeTruthy();
      expect(selector.requiresState).toBeTruthy();
    }
  });
});

/**
 * The sixth selector, added when the autonomous parameter inquiry was built.
 * It is held to the same rule as the other five: it must DELEGATE, and it must
 * not decide anything the wrapped engine did not already decide.
 */
describe('The parameter-inquiry adapter delegates and does not re-decide', () => {
  const SYSTEM = {
    systemId: 'sample-Ea60',
    label: 'Unmeasured kinetic sample',
    modelId: 'chemistry-arrhenius',
    hiddenParameters: { activationEnergyKJ: 60, preExponentialLog10: 11.0 },
    probeParameterId: 'temperatureK',
    candidateProbeValues: [350, 400, 450, 500, 600, 800],
    fixedParameters: {},
    observedMetric: 'rateConstant',
    agreementTolerance: 0.25,
  } as const;

  const HYPOTHESES = [
    { hypothesisId: 'h:A-Ea60', statement: 'Ea 60', claimedValues: { activationEnergyKJ: 60, preExponentialLog10: 11.0 }, priorConfidence: 0.5 },
    { hypothesisId: 'h:C-Ea62', statement: 'Ea 62', claimedValues: { activationEnergyKJ: 62, preExponentialLog10: 11.2985 }, priorConfidence: 0.5 },
    { hypothesisId: 'h:B-Ea66', statement: 'Ea 66', claimedValues: { activationEnergyKJ: 66, preExponentialLog10: 11.8956 }, priorConfidence: 0.5 },
    { hypothesisId: 'h:D-Ea70', statement: 'Ea 70', claimedValues: { activationEnergyKJ: 70, preExponentialLog10: 12.4926 }, priorConfidence: 0.5 },
  ];

  function inquiry(maxRounds: number) {
    return runAutonomousInquiry({
      question: 'Which activation energy does this sample have?',
      system: SYSTEM,
      hypotheses: HYPOTHESES,
      openingProbeValue: 400,
      maxRounds,
    });
  }

  it('reports the loop\'s own proposal verbatim, and makes it executable', () => {
    const result = inquiry(1);
    const action = parameterInquiryNextAction({ result, system: SYSTEM });
    expect(action.selectorId).toBe(PARAMETER_INQUIRY_SELECTOR_ID);
    expect(action.domain).toBe('chemistry');
    expect(action.status).toBe('READY_TO_RUN');
    expect(action.native).toBe(result.nextExperiment);            // verbatim, not a copy
    expect(action.why).toBe(result.nextExperiment.why);
    expect(action.rule).toBe(result.nextExperiment.rule);
    expect(action.about).toEqual(result.nextExperiment.betweenHypothesisIds);
    // The request is the loop's own choice, runnable as-is.
    expect(action.request).not.toBeNull();
    expect(action.request!.parameters.temperatureK).toBe(result.nextExperiment.probeValue);
    expect(action.request!.modelId).toBe('chemistry-arrhenius');
  });

  it('produces no request when the loop proposed no experiment', () => {
    const result = inquiry(4);                                     // runs to a conclusion
    expect(result.nextExperiment.probeValue).toBeNull();
    const action = parameterInquiryNextAction({ result, system: SYSTEM });
    expect(action.status).toBe('RESOLVED');
    expect(action.request).toBeNull();
    expect(action.rule).toBe('NO_CONTENDERS_LEFT');
  });
});

describe('The world-calibration adapter delegates and does not re-decide', () => {
  it('reports the composition\'s own proposal verbatim, request left null (no WorldGraph equivalent)', () => {
    const input = epidemicInfectiousDaysCalibration(6);
    const result = runAutonomousWorldCalibration(input);
    const action = worldCalibrationNextAction({ result, system: input.system });

    expect(action.selectorId).toBe(WORLD_CALIBRATION_SELECTOR_ID);
    expect(action.domain).toBe('epidemiology');
    expect(action.native).toBe(result.nextExperiment); // verbatim, not a copy
    expect(action.why).toBe(result.nextExperiment.why);
    expect(action.rule).toBe(result.nextExperiment.rule);
    expect(action.about).toEqual(result.nextExperiment.betweenHypothesisIds);
    // No `StructuredExperimentRequest` equivalent exists for "rebuild this
    // world and read a different tick" — same choice `worldCounterfactualNextAction`
    // already makes for its own WorldGraph substrate.
    expect(action.request).toBeNull();
  });

  it('is RESOLVED with no request when the composition reached a conclusion', () => {
    const input = epidemicInfectiousDaysCalibration(6); // resolves in exactly 2 rounds (measured)
    const result = runAutonomousWorldCalibration(input);
    expect(result.nextExperiment.probeTick).toBeNull();

    const action = worldCalibrationNextAction({ result, system: input.system });
    expect(action.status).toBe('RESOLVED');
    expect(action.request).toBeNull();
    expect(action.rule).toBe('NO_CONTENDERS_LEFT');
  });

  it('is RESOLVED with rule NO_DISCRIMINATING_PROBE on an honest tie, not silently treated as READY_TO_RUN', () => {
    const closeHypotheses = [
      { hypothesisId: 'h:a', statement: 'a', claimedValue: 6.9, priorConfidence: 0.5 },
      { hypothesisId: 'h:b', statement: 'b', claimedValue: 7.0, priorConfidence: 0.5 },
      { hypothesisId: 'h:c', statement: 'c', claimedValue: 7.1, priorConfidence: 0.5 },
    ];
    const input = {
      question: "What is this outbreak's real mean infectious period?",
      system: epidemicInfectiousDaysSystem(7.0, 'nextaction-tie-test'),
      hypotheses: closeHypotheses,
      openingProbeTick: 2,
      maxRounds: 6,
    };
    const result = runAutonomousWorldCalibration(input);
    expect(result.stopReason).toBe('NO_DISCRIMINATING_PROBE');

    const action = worldCalibrationNextAction({ result, system: input.system });
    expect(action.status).toBe('RESOLVED');
    expect(action.rule).toBe('NO_DISCRIMINATING_PROBE');
    expect(action.request).toBeNull();
  });
});
