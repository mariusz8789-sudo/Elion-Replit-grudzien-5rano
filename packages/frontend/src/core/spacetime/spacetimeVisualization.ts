import type { EpistemicLabel } from '../scientificWorlds/humanLab/epistemic';

/**
 * SPACETIME VISUALIZATION (genesis-spacetime-multiverse-cinematic-e2e-v1 reference-package
 * integration — the three capabilities that audit confirmed genuinely do not exist anywhere
 * in this repo, after checking the rest against real, stronger, already-wired equivalents):
 *
 *  - Special-relativity time dilation: EXISTS-REAL (`modelGraph/specialRelativityGraph.ts::lorentzGamma`).
 *  - Schwarzschild static-observer time dilation: EXISTS-REAL, twice
 *    (`core/supreme/SpacetimeCurvatureEngine.ts`, `modelGraph/specialRelativityGraph.ts`).
 *  - Dark-matter galaxy rotation curve: EXISTS-REAL and STRONGER
 *    (`labs/experiments/universe-rotationcurve.ts`, contrasts real CDM-halo vs MOND physics
 *    with citations, not this reference package's simpler toy formula).
 *  - Quantum tunneling: EXISTS-REAL and STRONGER (`worldModel/domains/quantumTunneling.ts`,
 *    wraps a real split-step-Fourier TDSE solver, not a closed-form pedagogical approximation).
 *  - Timeline-branch/counterfactual model: EXISTS-REAL and heavily production-wired
 *    (`worldModel/discovery/worldCounterfactual.ts`, `simulation/temporalMultiverse.ts`).
 *  - Cinematic shot planning: EXISTS-REAL (`temporalCinematic/cinematicShotDirector.ts`).
 *  None of the above are reimplemented here — doing so would violate the "exactly one
 *  canonical X" rule this integration pass operates under.
 *
 *  What genuinely does NOT exist anywhere in the repo (confirmed by grep across all of
 *  `packages/`) and is added below: a sampled gravity-well potential FIELD (as opposed to a
 *  single-point calculation), a wormhole/Einstein-Rosen-bridge throat embedding geometry, a
 *  causality-graph backward-edge validator, a canned paradox-type explainer, and a
 *  chronology-protection/closed-timelike-curve label. All four reuse the repo's ONE existing
 *  epistemic-label taxonomy (`scientificWorlds/humanLab/epistemic.ts::EpistemicLabel`) rather
 *  than inventing a fifth one (this reference package's own `EpistemicLabel` is a different,
 *  unrelated union and is not imported here).
 */
export const SPACETIME_VISUALIZATION_VERSION = '1.0.0';

// --- Gravity-well potential field (Newtonian point-mass potential, sampled over a grid) ------

const G_SI = 6.674e-11;

export interface GravityWellFieldInput {
  readonly massKg: number;
  readonly gridHalfExtentM: number;
  readonly gridSamples: number;
  /** Softening length to avoid a singularity at r=0; must be > 0. */
  readonly softeningM: number;
}

export interface GravityWellPoint {
  readonly x: number;
  readonly z: number;
  readonly potential: number;
  /** 0..1, normalized within this field's own min/max — a visualization aid, not a physical unit. */
  readonly normalizedDepth: number;
}

export interface GravityWellField {
  readonly points: readonly GravityWellPoint[];
  readonly label: EpistemicLabel;
}

/**
 * Real Newtonian point-mass potential (phi = -GM/r), sampled over a square grid. This is exact
 * classical mechanics, not a relativistic curvature tensor — the repo's real GR machinery
 * (`SpacetimeCurvatureEngine.ts`) already covers Schwarzschild geometry; this function fills the
 * narrower, genuinely-missing gap of a full 2D FIELD (for a "gravity well" visualization) rather
 * than a single-point value.
 */
export function gravityWellPotentialField(input: GravityWellFieldInput): GravityWellField {
  if (!(input.massKg > 0)) throw new Error('gravityWellPotentialField: massKg must be > 0');
  if (!(input.gridHalfExtentM > 0)) throw new Error('gravityWellPotentialField: gridHalfExtentM must be > 0');
  if (!(input.softeningM > 0)) throw new Error('gravityWellPotentialField: softeningM must be > 0');
  const n = Math.max(3, Math.floor(input.gridSamples));
  const raw: Array<{ x: number; z: number; potential: number }> = [];
  let min = Infinity;
  let max = -Infinity;
  for (let ix = 0; ix < n; ix += 1) {
    for (let iz = 0; iz < n; iz += 1) {
      const x = -input.gridHalfExtentM + (2 * input.gridHalfExtentM * ix) / (n - 1);
      const z = -input.gridHalfExtentM + (2 * input.gridHalfExtentM * iz) / (n - 1);
      const r = Math.sqrt(x * x + z * z + input.softeningM * input.softeningM);
      const potential = (-G_SI * input.massKg) / r;
      min = Math.min(min, potential);
      max = Math.max(max, potential);
      raw.push({ x, z, potential });
    }
  }
  const span = Math.max(1e-30, max - min);
  const points: GravityWellPoint[] = raw.map((p) => ({ ...p, normalizedDepth: (max - p.potential) / span }));
  return { points, label: 'MODEL' };
}

// --- Wormhole / Einstein-Rosen-bridge throat embedding (visualization only) ------------------

export interface WormholeEmbeddingInput {
  readonly throatRadius: number;
  readonly radialExtent: number;
  readonly radialSamples: number;
  readonly angularSamples: number;
}

export interface WormholeEmbeddingPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly r: number;
  readonly theta: number;
}

export interface WormholeScientificClaim {
  readonly id: string;
  readonly statement: string;
  readonly label: EpistemicLabel;
  readonly limitations: readonly string[];
}

/**
 * A Flamm-paraboloid-style embedding diagram — the standard textbook way to VISUALIZE wormhole
 * throat geometry. This is a geometric shape generator, never a claim that a real traversable
 * wormhole exists or could be built; `wormholeScientificClaim()` below is the mandatory,
 * explicit disclaimer every caller should attach alongside these points.
 */
export function wormholeEmbeddingGeometry(input: WormholeEmbeddingInput): readonly WormholeEmbeddingPoint[] {
  if (!(input.throatRadius > 0)) throw new Error('wormholeEmbeddingGeometry: throatRadius must be > 0');
  if (!(input.radialExtent > input.throatRadius)) throw new Error('wormholeEmbeddingGeometry: radialExtent must exceed throatRadius');
  const radialSamples = Math.max(2, Math.floor(input.radialSamples));
  const angularSamples = Math.max(8, Math.floor(input.angularSamples));
  const points: WormholeEmbeddingPoint[] = [];
  for (const side of [-1, 1] as const) {
    for (let ri = 0; ri < radialSamples; ri += 1) {
      const t = ri / (radialSamples - 1);
      const r = input.throatRadius + t * (input.radialExtent - input.throatRadius);
      const z = side * 2 * Math.sqrt(Math.max(0, input.throatRadius * (r - input.throatRadius)));
      for (let ai = 0; ai < angularSamples; ai += 1) {
        const theta = (2 * Math.PI * ai) / angularSamples;
        points.push({ x: r * Math.cos(theta), y: z, z: r * Math.sin(theta), r, theta });
      }
    }
  }
  return points;
}

export function wormholeScientificClaim(): WormholeScientificClaim {
  return {
    id: 'spacetime-wormhole-visualization',
    statement: 'This is a hypothetical embedding-diagram visualization, not experimental evidence of a real, traversable wormhole.',
    label: 'HYPOTHESIS',
    limitations: ['No experimental traversable-wormhole evidence exists', 'This geometry is a visualization aid, not an engineering design'],
  };
}

// --- Causality graph validation, paradox explainer, chronology protection --------------------

export interface CausalityNode {
  readonly id: string;
  readonly time: number;
  readonly label: string;
}

export type CausalityRelation = 'CAUSES' | 'CONSTRAINS' | 'CORRELATES';

export interface CausalityEdge {
  readonly from: string;
  readonly to: string;
  readonly relation: CausalityRelation;
}

export interface CausalityGraph {
  readonly nodes: readonly CausalityNode[];
  readonly edges: readonly CausalityEdge[];
}

export interface CausalityValidation {
  readonly valid: boolean;
  readonly issues: readonly string[];
}

/** Detects malformed edges (missing endpoints) and backward-in-time CAUSES edges — never silently accepts either. */
export function validateCausalityGraph(graph: CausalityGraph): CausalityValidation {
  const issues: string[] = [];
  const byId = new Map(graph.nodes.map((n) => [n.id, n] as const));
  for (const edge of graph.edges) {
    const a = byId.get(edge.from);
    const b = byId.get(edge.to);
    if (!a || !b) { issues.push(`missing node in edge ${edge.from} -> ${edge.to}`); continue; }
    if (edge.relation === 'CAUSES' && a.time > b.time) {
      issues.push(`backward causal edge ${edge.from} -> ${edge.to} (${a.time} > ${b.time})`);
    }
  }
  return { valid: issues.length === 0, issues };
}

export type ParadoxKind = 'GRANDFATHER' | 'BOOTSTRAP' | 'INFORMATION_LOOP' | 'CONSISTENCY';

export interface ParadoxExplanation {
  readonly kind: ParadoxKind;
  readonly explanation: string;
  readonly label: EpistemicLabel;
}

const PARADOX_EXPLANATIONS: Readonly<Record<ParadoxKind, string>> = {
  GRANDFATHER: 'A causal inconsistency arises if an action prevents the preconditions for that same action.',
  BOOTSTRAP: 'Information or an object appears in a causal loop without an external origin in the modeled timeline.',
  INFORMATION_LOOP: 'Information is recursively propagated through a closed causal structure.',
  CONSISTENCY: 'The model enforces self-consistent events, avoiding contradictory histories.',
};

/** A canned, deterministic explanation of a named paradox TYPE — never a claim that this repo resolves real time-travel paradoxes. */
export function explainParadoxType(kind: ParadoxKind): ParadoxExplanation {
  return { kind, explanation: PARADOX_EXPLANATIONS[kind], label: 'HYPOTHESIS' };
}

export interface ChronologyProtectionAssessment {
  readonly status: 'HYPOTHETICAL_CHRONOLOGY_RISK' | 'NO_CTC_IN_MODEL';
  readonly label: EpistemicLabel;
  readonly note: string;
}

/** Real, deterministic branch on the caller-declared presence of a closed timelike curve — never inferred, never fabricated. */
export function chronologyProtectionLabel(hasClosedTimelikeCurve: boolean): ChronologyProtectionAssessment {
  return {
    status: hasClosedTimelikeCurve ? 'HYPOTHETICAL_CHRONOLOGY_RISK' : 'NO_CTC_IN_MODEL',
    label: 'HYPOTHESIS',
    note: 'Chronology-protection behavior is theoretical physics; this software does not prove or enable real time travel.',
  };
}
