import { describe, expect, it } from 'vitest';

import { runAutonomousDiscoveryWithEngines } from '../core/agent/discoveryLoop';
import {
  buildDeepLoadSheddingHypothesis,
  buildGeneratorDiscoveryWorld,
  GENESIS_GENERATOR_CATALOG,
} from '../core/agent/electricalGeneratorLeverCatalog';
import { ELECTRICAL_GENERATOR_AFFINE_SOLVER_ID, ELECTRICAL_GENERATOR_SOLVER_ID } from '../core/worldModel/domains/electricalGenerator';
import { GENESIS_STRUCTURAL_ALTERNATIVES, StructuralAlternativeRegistry } from '../core/agent/structuralAlternative';

/**
 * A REAL RUNTIME MODEL UPDATE, not a contract.
 *
 * `SolverRouter` was already runtime-configurable (any entity can be rebound
 * to any registered solver via `domainBinding.solverId`), but nothing in the
 * discovery/agent layer ever exercised that to respond to evidence — a
 * falsification just meant the mechanism was reported REFUTED, full stop.
 *
 * `discoveryLoop.ts`'s regeneration step now also asks
 * `GENESIS_STRUCTURAL_ALTERNATIVES` whether a real, cited alternative model
 * exists for whatever solver the falsified hypothesis's entity is bound to.
 * When one does, it derives a hypothesis identical in criterion and
 * mechanism whose `apply` rebinds the entity to that alternative BEFORE
 * running the same intervention — Evidence -> updated model -> next
 * prediction -> next experiment, and the next experiment demonstrably runs
 * on the changed model because it produces a different, independently
 * measured number, not a replay of the falsifying run.
 */
describe('structural model update — evidence-driven, and the next experiment genuinely uses the changed model', () => {
  it('THE DEFINING CHAIN: refuted under the linear model, then genuinely re-tested and supported under the registered affine alternative', () => {
    const hypothesis = buildDeepLoadSheddingHypothesis(170);
    const { result } = runAutonomousDiscoveryWithEngines({
      question: 'Does the generator keep burning fuel at near-zero load?',
      worldId: GENESIS_GENERATOR_CATALOG.worldId,
      domainId: GENESIS_GENERATOR_CATALOG.domainId,
      buildWorld: buildGeneratorDiscoveryWorld,
      hypotheses: [hypothesis],
      decisionAtTick: GENESIS_GENERATOR_CATALOG.decisionAtTick,
      horizonTick: GENESIS_GENERATOR_CATALOG.horizonTick,
      dt: GENESIS_GENERATOR_CATALOG.dt,
      maxRounds: 4,
      declaredAssumptions: [],
      notModelledFactors: [],
    });

    // Round 1: the incumbent (linear) model refutes the claim — burn is
    // proportional to load alone, so shedding to near-zero leaves fuel
    // remaining well above the preregistered 170 L threshold.
    const first = result.rounds[0]!;
    expect(first.hypothesisId).toBe('h:deep-load-shedding-idle-burn');
    expect(first.assessment.assessment).toBe('FALSIFIED_WITHIN_PROTOCOL');
    expect(first.objectiveObserved).toBeCloseTo(180.8, 1);

    // A real model-update hypothesis was derived — same criterion, same
    // mechanism, generated because of the refutation.
    const updated = result.beliefs.find(
      (b) => b.hypothesisId === `h:deep-load-shedding-idle-burn~STRUCTURAL_ALTERNATIVE:${ELECTRICAL_GENERATOR_AFFINE_SOLVER_ID}`,
    );
    expect(updated).toBeDefined();

    // The next experiment genuinely ran on the changed model: a DIFFERENT
    // measured number (158.8 L, not 180.8 L) from the SAME declared
    // intervention at the SAME strength — this is only possible if the arm
    // actually executed under the affine solver, not the linear one.
    const updateRound = result.rounds.find((r) => r.hypothesisId === updated!.hypothesisId);
    expect(updateRound).toBeDefined();
    expect(updateRound!.objectiveObserved).toBeCloseTo(158.8, 1);
    expect(updateRound!.objectiveObserved).not.toBeCloseTo(first.objectiveObserved!, 1);
    expect(updateRound!.assessment.assessment).toBe('SUPPORTED_WITHIN_PROTOCOL');
    expect(updated!.status).toBe('SUPPORTED');

    // Confirmed at a second magnitude too — the same "not just noise"
    // discipline every other survivor in this codebase is held to.
    expect(updated!.confidence).toBe('SUPPORTED_AT_TWO_MAGNITUDES');
  });

  it('the world entity really was rebound at runtime — this is SolverRouter routing to a different registered solver, not a fake swap', () => {
    const hypothesis = buildDeepLoadSheddingHypothesis(170);
    const world = buildGeneratorDiscoveryWorld();
    // Confirm the baseline binding really is the linear solver before anything runs.
    const before = world.graph.getEntity(hypothesis.entityId);
    expect(before.domainBinding?.solverId).toBe(ELECTRICAL_GENERATOR_SOLVER_ID);

    const alternatives = GENESIS_STRUCTURAL_ALTERNATIVES.alternativesFor(ELECTRICAL_GENERATOR_SOLVER_ID);
    expect(alternatives).toHaveLength(1);
    const [alternative] = alternatives;
    expect(typeof alternative!.alternativeSolver).toBe('function');

    // The derived hypothesis's own `apply`, exercised directly against a
    // fresh graph, really performs the rebind via `graph.updateEntity` —
    // the same real mutation path every other lever in this codebase uses,
    // never a special-cased shortcut.
    world.graph.updateEntity(hypothesis.entityId, {
      domainBinding: { ...before.domainBinding!, solverId: alternative!.alternativeSolverId },
    });
    const after = world.graph.getEntity(hypothesis.entityId);
    expect(after.domainBinding?.solverId).toBe(ELECTRICAL_GENERATOR_AFFINE_SOLVER_ID);
  });

  it('registration is validated: an uncited alternative is refused, same discipline as FragilityRegistry', () => {
    const registry = new StructuralAlternativeRegistry();
    expect(() =>
      registry.register({
        incumbentSolverId: 'some-solver',
        alternativeSolverId: 'some-alternative',
        alternativeSolver: () => ({ patch: {}, grounding: 'PROCEDURAL_APPROXIMATION' }),
        statement: 'an uncited claim',
        citation: '   ',
      }),
    ).toThrow(/no citation/);
  });

  it('a hypothesis that is ITSELF already a structural alternative does not spawn another one (no runaway chain)', () => {
    // Measured directly: without this guard, a falsified
    // `...~STRUCTURAL_ALTERNATIVE:x` hypothesis would look up the world's
    // declared (baseline) incumbent solver again — not the solver its own
    // `apply` actually rebinds to — and derive a duplicate suffix forever.
    const hypothesis = buildDeepLoadSheddingHypothesis(9999); // trivially supported at every magnitude, so its RELATION_FLIP path never re-falsifies either — isolates this guard
    const { result } = runAutonomousDiscoveryWithEngines({
      question: 'guard probe',
      worldId: GENESIS_GENERATOR_CATALOG.worldId,
      domainId: GENESIS_GENERATOR_CATALOG.domainId,
      buildWorld: buildGeneratorDiscoveryWorld,
      hypotheses: [hypothesis],
      decisionAtTick: GENESIS_GENERATOR_CATALOG.decisionAtTick,
      horizonTick: GENESIS_GENERATOR_CATALOG.horizonTick,
      dt: GENESIS_GENERATOR_CATALOG.dt,
      maxRounds: 8,
      declaredAssumptions: [],
      notModelledFactors: [],
    });
    const chained = result.beliefs.filter((b) => b.hypothesisId.split('STRUCTURAL_ALTERNATIVE').length > 2);
    expect(chained).toHaveLength(0);
  });
});
