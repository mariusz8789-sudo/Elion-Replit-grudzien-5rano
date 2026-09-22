import { lorentzGamma } from '../../physics';
import {
  gravityWellPotentialField,
  wormholeEmbeddingGeometry,
  wormholeScientificClaim,
} from '../../spacetime/spacetimeVisualization';
import { addChemistryLab, addChemistrySubstance } from '../domains/chemistryKinetics';
import { addTunnelJunction } from '../domains/quantumTunneling';
import { entityId, type EntityId, type WorldModelEntity } from '../ecs/types';
import type { WorldGraph } from '../ecs/worldGraph';
import type { WorldBlueprintNode } from '../generation/worldBlueprint';
import type { TemplateResult } from './templates';
import type { WorldSpecification } from './worldSpecification';

const EMPTY_TEMPLATE_TAIL: Pick<TemplateResult, 'relationships' | 'postGenerate'> = { relationships: [], postGenerate: [] };

/**
 * SPACETIME WORLD TEMPLATES (Genesis Spacetime product-binding integration, Claude's
 * non-render/non-film scope). Same `WorldTemplate` contract as `templates.ts`'s five base
 * templates — a composable blueprint fragment plus, where one already exists, a REAL solver
 * binding attached post-generation. Nothing here creates a second `WorldGraph`, a second
 * `WorldGenerator`, or a second physics solver: `QUANTUM` reuses the existing
 * `quantumTunneling.ts::addTunnelJunction` verbatim; `TIME_DILATION_LAB` and
 * `COSMOLOGY_SPACETIME` call the existing `lorentzGamma`/`spacetimeVisualization.ts` pure
 * functions (plus `schwarzschildTimeDilationFactor` below, the same real formula
 * `SpacetimeCurvatureEngine.ts` already computes, inlined for browser-bundle reasons — see
 * its own comment) and record their REAL computed output, never a fabricated number.
 *
 * Grounding follows the ECS's own `GroundingLevel` scale (`ecs/types.ts`), the same one every
 * other template already uses — MODEL_ESTIMATE for a real-but-simplified model,
 * UNGROUNDED_APPROXIMATION for a structural placeholder or an explicitly hypothetical
 * visualization with no validated model behind it at all.
 */

const G_EARTH_KG = 5.972e24;
const R_EARTH_M = 6.371e6;

// Schwarzschild static-observer time dilation — the EXACT same real formula
// `@genesis/core/supreme/SpacetimeCurvatureEngine.ts::timeDilationFactor` already computes,
// inlined here rather than imported: that file also imports `node:crypto` at module scope
// for its own `sha256hex` helper, which is fine for a Node/core-only consumer but poisons this
// browser-bundled frontend module (Vite cannot bundle `node:crypto` for the browser). Same
// physics, no second implementation of the model itself, just avoiding a cross-package
// server/browser boundary violation.
const G_SI = 6.674e-11;
const C_SI = 299_792_458;
function schwarzschildTimeDilationFactor(massKg: number, radiusM: number): number {
  const rs = (2 * G_SI * massKg) / (C_SI * C_SI);
  return Math.sqrt(Math.max(0, 1 - rs / Math.max(radiusM, rs + 1e-9)));
}

function buildingNode(ref: { kind: string; id: string }, label: string, position: { x: number; y: number; z: number }, children?: WorldBlueprintNode[]): WorldBlueprintNode {
  return { ref, label, scaleLevel: 'BUILDING', spatial: { position }, ...(children ? { children } : {}) };
}

// --- COSMOLOGY_SPACETIME: real Newtonian gravity-well field summary -------------------------

export const COSMOLOGY_SPACETIME_TEMPLATE = (_spec: WorldSpecification): TemplateResult => {
  const observatoryId: EntityId = 'building:cosmology-observatory';
  const wellId: EntityId = 'gravity-well:cosmology-well-1';
  const child = buildingNode({ kind: 'building', id: 'cosmology-observatory' }, 'Cosmology Observatory', { x: 0, y: 0, z: 40 });
  const postGenerate = (graph: WorldGraph): void => {
    const massKg = 1.989e30; // one solar mass — a real, declared demo mass, not fitted to any spec field.
    const field = gravityWellPotentialField({ massKg, gridHalfExtentM: 2e9, gridSamples: 9, softeningM: 1e7 });
    const depths = field.points.map((p) => p.normalizedDepth);
    const entity: WorldModelEntity = {
      id: entityId({ kind: 'gravity-well', id: 'cosmology-well-1' }),
      ref: { kind: 'gravity-well', id: 'cosmology-well-1' },
      label: 'Gravity Well (Newtonian potential field)',
      scale: { level: 'MESO_LAB', parentEntityId: observatoryId },
      spatial: { position: { x: 0, y: 0, z: 39 } },
      domainState: {
        massKg,
        gridSamples: field.points.length,
        maxNormalizedDepth: Math.max(...depths),
        minNormalizedDepth: Math.min(...depths),
      },
      // No live per-tick solver exists for this — it is a snapshot field, honestly declared as such.
      domainBinding: { solverId: null, domainId: 'spacetime-gravity-well' },
      grounding: 'MODEL_ESTIMATE',
      statusLabel: `Real Newtonian potential field, ${field.points.length} samples (epistemic label: ${field.label})`,
      updatedAtTick: 0,
    };
    graph.addEntity(entity);
  };
  return { children: [child], relationships: [], postGenerate: [postGenerate], ids: { observatoryId, wellId } };
};

// --- EINSTEIN_ROSEN_BRIDGE: hypothetical wormhole throat embedding, explicitly disclaimed ----

export const EINSTEIN_ROSEN_BRIDGE_TEMPLATE = (_spec: WorldSpecification): TemplateResult => {
  const chamberId: EntityId = 'building:wormhole-chamber';
  const throatId: EntityId = 'wormhole-throat:bridge-1';
  const child = buildingNode({ kind: 'building', id: 'wormhole-chamber' }, 'Wormhole Observation Chamber', { x: 0, y: 0, z: 60 });
  const postGenerate = (graph: WorldGraph): void => {
    const spec2 = { throatRadius: 2, radialExtent: 12, radialSamples: 16, angularSamples: 24 };
    const points = wormholeEmbeddingGeometry(spec2);
    const claim = wormholeScientificClaim();
    const entity: WorldModelEntity = {
      id: entityId({ kind: 'wormhole-throat', id: 'bridge-1' }),
      ref: { kind: 'wormhole-throat', id: 'bridge-1' },
      label: 'Einstein-Rosen Bridge (embedding visualization)',
      scale: { level: 'MESO_LAB', parentEntityId: chamberId },
      spatial: { position: { x: 0, y: 0, z: 59 } },
      domainState: { throatRadius: spec2.throatRadius, radialExtent: spec2.radialExtent, geometryPointCount: points.length },
      domainBinding: { solverId: null, domainId: 'spacetime-wormhole-visualization' },
      // Explicitly the weakest grounding tier: a hypothetical geometry visualization, not a
      // validated model of anything physically real — never GROUNDED_EXACT or MODEL_ESTIMATE.
      grounding: 'UNGROUNDED_APPROXIMATION',
      statusLabel: claim.statement,
      updatedAtTick: 0,
    };
    graph.addEntity(entity);
  };
  return { children: [child], relationships: [], postGenerate: [postGenerate], ids: { chamberId, throatId } };
};

// --- TIME_DILATION_LAB: real special-relativity + Schwarzschild time dilation ----------------

export const TIME_DILATION_LAB_TEMPLATE = (_spec: WorldSpecification): TemplateResult => {
  const labId: EntityId = 'building:relativity-lab';
  const demoId: EntityId = 'relativity-demo:dilation-1';
  const child = buildingNode({ kind: 'building', id: 'relativity-lab' }, 'Time Dilation Laboratory', { x: 0, y: 0, z: 80 });
  const postGenerate = (graph: WorldGraph): void => {
    const beta = 0.8; // a real, declared demo velocity fraction (0.8c) — not fitted to any spec field.
    const gamma = lorentzGamma(beta);
    const gravitationalFactor = schwarzschildTimeDilationFactor(G_EARTH_KG, R_EARTH_M);
    const entity: WorldModelEntity = {
      id: entityId({ kind: 'relativity-demo', id: 'dilation-1' }),
      ref: { kind: 'relativity-demo', id: 'dilation-1' },
      label: 'Relativity Demonstration (special + Schwarzschild)',
      scale: { level: 'MESO_LAB', parentEntityId: labId },
      spatial: { position: { x: 0, y: 0, z: 79 } },
      domainState: { velocityFractionBeta: beta, lorentzGammaFactor: gamma, earthSurfaceTimeDilationFactor: gravitationalFactor },
      domainBinding: { solverId: null, domainId: 'spacetime-relativity' },
      // Exact within special/general relativity's own model — same tier `hydraulicsPumpPipe.ts`
      // uses for an exactly-evaluated-but-still-a-model real physics computation.
      grounding: 'MODEL_ESTIMATE',
      statusLabel: `gamma=${gamma.toFixed(4)} at beta=${beta}; Earth-surface GR factor=${gravitationalFactor.toFixed(9)}`,
      updatedAtTick: 0,
    };
    graph.addEntity(entity);
  };
  return { children: [child], relationships: [], postGenerate: [postGenerate], ids: { labId, demoId } };
};

// --- QUANTUM: reuses the existing, stronger quantum-tunneling solver verbatim ----------------

export const QUANTUM_TEMPLATE = (_spec: WorldSpecification): TemplateResult => {
  const labId: EntityId = 'building:quantum-lab';
  const junctionId: EntityId = 'tunnel-junction:quantum-1';
  const child = buildingNode({ kind: 'building', id: 'quantum-lab' }, 'Quantum Tunneling Laboratory', { x: 0, y: 0, z: 100 });
  const postGenerate = (graph: WorldGraph): void => {
    addTunnelJunction(graph, { junctionId: 'quantum-1', parentEntityId: labId, label: 'STM Tunnel Junction (Quantum World)' });
  };
  return { children: [child], relationships: [], postGenerate: [postGenerate], ids: { labId, junctionId } };
};

// --- MULTIVERSE_BRANCH: structural timeline-branch hub -----------------------------------------
//
// This template deliberately does NOT compute any branch divergence itself: a single
// `compileSpecification` call produces exactly one `WorldGraph`, and real counterfactual
// comparison (`worldModel/discovery/worldCounterfactual.ts::diffWorldBranches`/
// `findFirstDivergenceTick`) is inherently a TWO-world operation. What this template provides
// is the honest STRUCTURAL shape of a "multiverse branch hub" — N sibling branch-hub nodes,
// clearly labeled SIMULATION, with no fabricated divergence data. A caller wanting real branch
// comparison generates two (or more) worlds with differing `initialConditions`/`interventions`
// and compares them with the existing `worldCounterfactual.ts` machinery — not duplicated here.

export const MULTIVERSE_BRANCH_TEMPLATE = (spec: WorldSpecification, rng: () => number): TemplateResult => {
  const hubId: EntityId = 'building:multiverse-hub';
  const branchCount = Math.max(2, Math.min(6, Math.round(spec.population?.count ?? 3)));
  const branchIds: EntityId[] = [];
  const branches: WorldBlueprintNode[] = [];
  for (let i = 0; i < branchCount; i += 1) {
    const branchId: EntityId = `timeline-branch:branch-${i}`;
    branchIds.push(branchId);
    branches.push({
      ref: { kind: 'timeline-branch', id: `branch-${i}` },
      label: `Timeline Branch ${String.fromCharCode(65 + i)}`,
      scaleLevel: 'ROOM',
      spatial: { position: { x: (rng() * 2 - 1) * 20, y: 0, z: 120 + i * 3 } },
      domainState: { branchIndex: i },
      // Honest: this node represents a POSSIBLE branch, not a computed counterfactual outcome.
      domainBinding: { solverId: null, domainId: 'spacetime-multiverse-branch-hub' },
      grounding: 'UNGROUNDED_APPROXIMATION',
      statusLabel: 'COUNTERFACTUAL_SIMULATION: structural placeholder — real divergence requires comparing two generated worlds via worldCounterfactual.ts',
    });
  }
  const child = buildingNode({ kind: 'building', id: 'multiverse-hub' }, 'Multiverse Timeline Hub', { x: 0, y: 0, z: 120 }, branches);
  return { children: [child], ...EMPTY_TEMPLATE_TAIL, ids: { hubId, branchIds } };
};

// --- HISTORICAL_RECONSTRUCTION, DESERT_ALIEN, MARS_RESEARCH: honest structural placeholders --
//
// No real historical-provenance database, alien-geology solver, or Mars-environment solver
// exists in Genesis. Each is an honest UNGROUNDED_APPROXIMATION structural container — exactly
// the same discipline `INDUSTRIAL_SITE_TEMPLATE` (templates.ts) already applies to its generic
// equipment node — never a fabricated historical fact or planetary measurement. A caller with a
// real citation supplies it via `WorldSpecification.provenanceNote`, unchanged by this template.

export const HISTORICAL_RECONSTRUCTION_TEMPLATE = (spec: WorldSpecification): TemplateResult => {
  const siteId: EntityId = 'building:historical-reconstruction-site';
  const child: WorldBlueprintNode = {
    ...buildingNode({ kind: 'building', id: 'historical-reconstruction-site' }, 'Historical Reconstruction Site', { x: 0, y: 0, z: -50 }),
    // 'PROCEDURAL_APPROXIMATION' when a provenance note is supplied (a real, if unverified,
    // historical claim behind it), 'UNGROUNDED_APPROXIMATION' with none at all — never claims
    // GROUNDED_EXACT/EVIDENCE_BACKED without real provenance.
    grounding: spec.provenanceNote ? 'PROCEDURAL_APPROXIMATION' : 'UNGROUNDED_APPROXIMATION',
    statusLabel: spec.provenanceNote ? `INFERRED reconstruction (provenance: ${spec.provenanceNote})` : 'INFERRED reconstruction — no provenance supplied',
  };
  return { children: [child], ...EMPTY_TEMPLATE_TAIL, ids: { siteId } };
};

export const DESERT_ALIEN_TEMPLATE = (_spec: WorldSpecification): TemplateResult => {
  const domeId: EntityId = 'building:desert-alien-dome';
  const child: WorldBlueprintNode = {
    ...buildingNode({ kind: 'building', id: 'desert-alien-dome' }, 'Desert Alien World Dome', { x: 0, y: 0, z: -70 }),
    grounding: 'UNGROUNDED_APPROXIMATION',
    statusLabel: 'SIMULATION: fictional alien-world setting, no real planetary data',
  };
  return { children: [child], ...EMPTY_TEMPLATE_TAIL, ids: { domeId } };
};

export const MARS_RESEARCH_TEMPLATE = (spec: WorldSpecification): TemplateResult => {
  const stationId: EntityId = 'building:mars-research-station';
  const chemistryRequest = spec.scientificDomains?.find((d) => d.domain === 'chemistry');
  const child = buildingNode({ kind: 'building', id: 'mars-research-station' }, 'Mars Research Station', { x: 0, y: 0, z: -90 });
  if (!chemistryRequest) {
    return { children: [child], ...EMPTY_TEMPLATE_TAIL, ids: { stationId } };
  }
  // Same real chemistry solver LABORATORY_TEMPLATE uses (templates.ts), namespaced apart so
  // both can be requested together.
  const labId: EntityId = 'lab:mars-research-lab';
  const postGenerate = (graph: WorldGraph): void => {
    const realLabId = addChemistryLab(graph, { labId: 'mars-research-lab', parentEntityId: stationId, position: { x: 0, y: 0, z: -91 } });
    addChemistrySubstance(graph, realLabId, { ...chemistryRequest.chemistryOptions, substanceId: 'mars-research-substance' });
  };
  return { children: [child], relationships: [], postGenerate: [postGenerate], ids: { stationId, labId } };
};
