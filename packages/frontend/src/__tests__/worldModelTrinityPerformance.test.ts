import { describe, expect, it } from 'vitest';
import { toGraphicsWorldFrame } from '../core/worldModel/bridge/graphicsWorldFrameAdapter';
import { WORLD_MODEL_PROPOSAL_SCHEMA_VERSION, validateProposal, validateProposalShape, type WorldModelProposal } from '../core/worldModel/generation/worldModelProposal';
import { createScientificWorld } from '../core/worldModel/orchestration/createScientificWorld';
import type { WorldSpecification } from '../core/worldModel/specification/worldSpecification';

/**
 * TRINITY PIPELINE PERFORMANCE, UP TO 100K WHERE FEASIBLE (Genesis Scientific
 * World Model 3.0, section 18). Distinct from (and additional to)
 * worldModelSpecificationPerformance.test.ts (which already measures
 * validation/compile/generation/tick/query/branch/replay/WorldFrame cost at
 * 1k-50k): this measures the TRINITY layer specifically — proposal shape
 * validation, proposal (specification) validation, and the full
 * createScientificWorld composition — up through 100k entities, plus the C2
 * graphics-projection step neither prior benchmark exercised.
 *
 * HONESTY: single-sample, this run/machine, JIT/GC variance included — not a
 * benchmark suite, no performance target, no GPU/rendering claim (no GPU is
 * attached to this environment, and GPU throughput is C2's concern, not
 * C3's, regardless).
 */
function makeProposal(buildingCount: number, seed: number): WorldModelProposal {
  const districtCount = 10;
  const specification: WorldSpecification = {
    worldId: `perf-trinity-${buildingCount}`,
    seed,
    worldType: ['CITY'],
    geography: { districtCount, buildingsPerDistrict: Math.ceil(buildingCount / districtCount) },
  };
  return {
    schemaVersion: WORLD_MODEL_PROPOSAL_SCHEMA_VERSION,
    proposalId: `proposal:perf-trinity-${buildingCount}:${seed}`,
    source: 'SCRIPT',
    specification,
    confidence: 1,
    rationale: 'Synthetic performance-benchmark proposal — a large flat CITY structure, not a scientifically meaningful scenario.',
    provenance: { createdAt: new Date().toISOString(), notes: 'Performance benchmark fixture.' },
  };
}

describe('Trinity pipeline performance at scale (up to 100k where feasible)', () => {
  it.each([1000, 5000, 10000, 25000, 50000, 100000])('measures proposal-shape/validation/createScientificWorld/tick/branch/replay/WorldFrame/graphics cost for ~%i entities', (buildingCount) => {
    const proposal = makeProposal(buildingCount, 1);
    const TICKS = 2;

    const shapeStart = performance.now();
    const shapeResult = validateProposalShape(proposal);
    const shapeMs = performance.now() - shapeStart;
    expect(shapeResult.ok).toBe(true);

    const proposalValidateStart = performance.now();
    const proposalValidation = validateProposal(proposal);
    const proposalValidateMs = performance.now() - proposalValidateStart;
    expect(proposalValidation.validation.ok).toBe(true);

    const createStart = performance.now();
    const created = createScientificWorld({ kind: 'proposal', proposal });
    const createMs = performance.now() - createStart; // validate proposal (again, at the Trinity gate) + compile + generate + postGenerate + invariants + engine + initial WorldFrame
    expect(created.specified.graph.listEntities().length).toBeGreaterThanOrEqual(buildingCount);

    const tickStart = performance.now();
    for (let i = 0; i < TICKS; i++) created.engine.advance(1, () => undefined); // generic bookkeeping only — no real solver bound to a plain CITY structure, already measured elsewhere
    const tickMs = performance.now() - tickStart;

    const worldFrame = created.worldFrame; // the initial (tick 0) frame — projection cost is dominated by entity count, not tick count

    const graphicsStart = performance.now();
    const graphicsFrame = toGraphicsWorldFrame(worldFrame);
    const graphicsMs = performance.now() - graphicsStart;
    expect(graphicsFrame.entities.length).toBe(worldFrame.entities.length);

    const branchStart = performance.now();
    const fork = created.engine.forkBranch(1, 'perf-fork', () => {});
    const branchMs = performance.now() - branchStart;
    expect(fork.graph.listEntities().length).toBe(created.specified.graph.listEntities().length);

    const replayStart = performance.now();
    created.engine.scrubTo(1);
    const replayMs = performance.now() - replayStart;

    console.warn(
      `[C3 Trinity pipeline perf — measured this run/machine, single sample, not a benchmark] ~${buildingCount} entities:\n` +
        `  validateProposalShape: ${shapeMs.toFixed(3)}ms\n` +
        `  validateProposal (specification gate): ${proposalValidateMs.toFixed(3)}ms\n` +
        `  createScientificWorld (validate+compile+generate+invariants+engine+initial WorldFrame): ${createMs.toFixed(2)}ms\n` +
        `  ${TICKS} ticks (generic bookkeeping, no real solver): ${tickMs.toFixed(2)}ms total\n` +
        `  toGraphicsWorldFrame (C2 projection): ${graphicsMs.toFixed(3)}ms\n` +
        `  forkBranch: ${branchMs.toFixed(3)}ms; scrubTo replay: ${replayMs.toFixed(3)}ms\n` +
        `  GPU / rendering throughput: NOT VERIFIED ON HARDWARE (no GPU attached to this environment; out of C3's scope regardless)`,
    );

    // Generous sanity ceilings only — catch a pathological blowup, never asserted as a target.
    expect(shapeMs).toBeLessThan(1_000);
    expect(createMs).toBeLessThan(60_000);
    expect(tickMs).toBeLessThan(20_000);
    expect(graphicsMs).toBeLessThan(10_000);
    expect(branchMs).toBeLessThan(15_000);
    expect(replayMs).toBeLessThan(15_000);
  }, 120_000); // 100k entities can legitimately take real time under shared-machine load — well below the sanity ceilings above, past vitest's 5s default.
});
