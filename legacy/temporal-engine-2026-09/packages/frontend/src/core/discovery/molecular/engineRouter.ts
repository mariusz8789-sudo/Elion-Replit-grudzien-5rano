import type { DiscoveryQuestion, MoleculeCandidate, PropertyStatus } from './types';

/**
 * ETAP 5 — CAPABILITY-AWARE ENGINE ROUTING.
 *
 * Genesis has several real scientific engines behind
 * `packages/backend/src/compute/*Adapter.mjs`. The point of this module is to
 * decide WHICH of them it is actually meaningful to run for a given property
 * and a given candidate — and to say precisely why, when the answer is none.
 *
 * Three refusals are kept apart because they mean different things and imply
 * different fixes:
 *
 *  - ENGINE_ABSENT           the engine is not installed in this runtime.
 *                            Fix: install/configure it.
 *  - PRECONDITION_MISSING    the engine exists but a required input does not
 *                            (no 3D target structure, no declared geometry).
 *                            Fix: supply the input.
 *  - NOT_VALID_FOR_DOMAIN    the engine exists and would produce a number, but
 *                            that number would not mean what the property
 *                            claims for this molecule. Fix: none — do not run it.
 *
 * The third is the one that matters most scientifically: an engine returning a
 * value is not the same as that value being valid, and routing that ignores
 * applicability is how fabricated-looking results get produced by real
 * software. Running every engine for every molecule is explicitly not the
 * design.
 */
export const ENGINE_ROUTER_VERSION = '1.0.0';

export type EngineId = 'rdkit' | 'admet-ai' | 'autodock-vina' | 'pyscf' | 'openmm' | 'biopython';

export type RouteDecision =
  | { run: true; engine: EngineId; rationale: string }
  | { run: false; engine: EngineId; refusal: 'ENGINE_ABSENT' | 'PRECONDITION_MISSING' | 'NOT_VALID_FOR_DOMAIN'; reason: string; resultStatus: Extract<PropertyStatus, 'NOT_AVAILABLE' | 'REQUIRES_EXTERNAL_ENGINE' | 'REQUIRES_EXPERIMENT'> };

/** Live availability of each engine, as reported by its own real detector. */
export interface EngineAvailability {
  engine: EngineId;
  available: boolean;
  /** Real reason from the adapter's detect(), never a placeholder. */
  reason: string;
  version: string | null;
}

export type EngineAvailabilityMap = Readonly<Partial<Record<EngineId, EngineAvailability>>>;

/**
 * Which engine owns which discovery property, and what that engine needs
 * before its answer would mean anything.
 */
export interface PropertyRoute {
  propertyId: string;
  engine: EngineId;
  /** What must be true of the candidate/question for this engine to be meaningful. */
  precondition: (candidate: MoleculeCandidate, question: DiscoveryQuestion) => { ok: true } | { ok: false; refusal: 'PRECONDITION_MISSING' | 'NOT_VALID_FOR_DOMAIN'; reason: string };
  /** Status a blocked property carries — distinguishes "engine" from "experiment". */
  blockedStatus: Extract<PropertyStatus, 'REQUIRES_EXTERNAL_ENGINE' | 'REQUIRES_EXPERIMENT'>;
  rationale: string;
}

const hasStructure = (candidate: MoleculeCandidate) =>
  typeof candidate.structure.canonicalSmiles === 'string' && candidate.structure.canonicalSmiles.length > 0;

const requiresStructure = (what: string) => (candidate: MoleculeCandidate) =>
  hasStructure(candidate)
    ? { ok: true as const }
    : { ok: false as const, refusal: 'PRECONDITION_MISSING' as const, reason: `${what} needs a resolved structure; this candidate has only a molecular formula.` };

/**
 * The routing table. Every entry names a REAL adapter in this repository.
 * Nothing routes to an engine that does not exist.
 */
export const PROPERTY_ROUTES: readonly PropertyRoute[] = [
  {
    propertyId: 'logP',
    engine: 'rdkit',
    precondition: requiresStructure('Crippen logP'),
    blockedStatus: 'REQUIRES_EXTERNAL_ENGINE',
    rationale: 'RDKit computes Crippen logP from a 2D structure — cheap and valid for any parsable molecule.',
  },
  {
    propertyId: 'tpsa',
    engine: 'rdkit',
    precondition: requiresStructure('TPSA'),
    blockedStatus: 'REQUIRES_EXTERNAL_ENGINE',
    rationale: 'RDKit topological polar surface area, defined for any parsable molecule.',
  },
  {
    propertyId: 'admetAbsorption',
    engine: 'admet-ai',
    precondition: (candidate) => {
      if (!hasStructure(candidate)) {
        return { ok: false, refusal: 'PRECONDITION_MISSING', reason: 'ADMET prediction needs a structure, not a formula.' };
      }
      // ADMET models are trained on drug-like small molecules. Outside that
      // range the model still emits a number, and that number is meaningless.
      const heavy = candidate.properties.find((p) => p.propertyId === 'heavyAtomCount')?.value;
      if (typeof heavy === 'number' && (heavy < 5 || heavy > 70)) {
        return {
          ok: false,
          refusal: 'NOT_VALID_FOR_DOMAIN',
          reason: `Candidate has ${heavy} heavy atoms, outside the drug-like range these ADMET models were trained on; the model would still return a number, and it would not mean anything.`,
        };
      }
      return { ok: true };
    },
    blockedStatus: 'REQUIRES_EXTERNAL_ENGINE',
    rationale: 'ADMET-AI predicts absorption endpoints for drug-like small molecules within its applicability domain.',
  },
  {
    propertyId: 'toxicity',
    engine: 'admet-ai',
    precondition: (candidate) =>
      hasStructure(candidate)
        ? { ok: true }
        : { ok: false, refusal: 'PRECONDITION_MISSING', reason: 'Toxicity prediction needs a structure.' },
    blockedStatus: 'REQUIRES_EXTERNAL_ENGINE',
    rationale: 'ADMET-AI toxicity endpoints. A prediction is never an observation and is never a safety claim.',
  },
  {
    propertyId: 'targetAffinity',
    engine: 'autodock-vina',
    precondition: (candidate, question) => {
      if (!hasStructure(candidate)) {
        return { ok: false, refusal: 'PRECONDITION_MISSING', reason: 'Docking needs a ligand structure.' };
      }
      // Docking without a real 3D receptor is not a weaker result — it is not
      // a result at all. A declared target LABEL is not a structure.
      if (question.target.source === 'NOT_AVAILABLE') {
        return {
          ok: false,
          refusal: 'PRECONDITION_MISSING',
          reason: 'No target structure is declared for this question. Docking requires a real 3D receptor; a target name is not one.',
        };
      }
      return { ok: true };
    },
    blockedStatus: 'REQUIRES_EXTERNAL_ENGINE',
    rationale: 'AutoDock Vina scores a ligand pose against a real 3D receptor.',
  },
  {
    propertyId: 'safety',
    engine: 'admet-ai',
    precondition: () => ({
      ok: false,
      refusal: 'NOT_VALID_FOR_DOMAIN',
      reason: 'Safety is not a computable property. No in-silico engine establishes that a compound is safe; this requires experimental and clinical evidence.',
    }),
    blockedStatus: 'REQUIRES_EXPERIMENT',
    rationale: 'Deliberately unroutable: there is no engine whose output would justify a safety claim.',
  },
];

/**
 * Decides whether to run an engine for one property on one candidate.
 * Availability is checked LAST, so a scientifically invalid route is reported
 * as invalid even in a runtime where the engine happens to be installed —
 * installing an engine must never turn a meaningless computation into a
 * meaningful one.
 */
export function routeProperty(
  propertyId: string,
  candidate: MoleculeCandidate,
  question: DiscoveryQuestion,
  availability: EngineAvailabilityMap,
): RouteDecision | null {
  const route = PROPERTY_ROUTES.find((r) => r.propertyId === propertyId);
  if (route === undefined) return null;

  const precondition = route.precondition(candidate, question);
  if (!precondition.ok) {
    return {
      run: false,
      engine: route.engine,
      refusal: precondition.refusal,
      reason: precondition.reason,
      resultStatus: precondition.refusal === 'NOT_VALID_FOR_DOMAIN' && route.blockedStatus === 'REQUIRES_EXPERIMENT'
        ? 'REQUIRES_EXPERIMENT'
        : route.blockedStatus,
    };
  }

  const engineState = availability[route.engine];
  if (engineState === undefined || !engineState.available) {
    return {
      run: false,
      engine: route.engine,
      refusal: 'ENGINE_ABSENT',
      reason: engineState?.reason ?? `${route.engine} is not configured in this runtime.`,
      resultStatus: route.blockedStatus,
    };
  }

  return { run: true, engine: route.engine, rationale: route.rationale };
}

export interface RoutingPlan {
  /** Engine calls that are worth making, grouped by engine. */
  toRun: readonly { propertyId: string; engine: EngineId; candidateIds: readonly string[] }[];
  /** Everything refused, with which of the three refusals applied and why. */
  refused: readonly { propertyId: string; engine: EngineId; refusal: string; reason: string; candidateCount: number }[];
  /** Engines this plan would touch at all. */
  enginesUsed: readonly EngineId[];
}

/**
 * Builds one routing plan for a whole batch. This is what keeps the loop from
 * "running every engine for every molecule": a property is only scheduled for
 * the candidates it is actually meaningful and possible for.
 */
export function planEngineRouting(
  candidates: readonly MoleculeCandidate[],
  question: DiscoveryQuestion,
  availability: EngineAvailabilityMap,
): RoutingPlan {
  const toRun: { propertyId: string; engine: EngineId; candidateIds: string[] }[] = [];
  const refusedIndex = new Map<string, { propertyId: string; engine: EngineId; refusal: string; reason: string; candidateCount: number }>();

  for (const route of PROPERTY_ROUTES) {
    const runnable: string[] = [];
    for (const candidate of candidates) {
      const decision = routeProperty(route.propertyId, candidate, question, availability);
      if (decision === null) continue;
      if (decision.run) {
        runnable.push(candidate.candidateId);
        continue;
      }
      const key = `${route.propertyId}:${decision.refusal}:${decision.reason}`;
      const existing = refusedIndex.get(key);
      if (existing === undefined) {
        refusedIndex.set(key, { propertyId: route.propertyId, engine: decision.engine, refusal: decision.refusal, reason: decision.reason, candidateCount: 1 });
      } else {
        existing.candidateCount += 1;
      }
    }
    if (runnable.length > 0) toRun.push({ propertyId: route.propertyId, engine: route.engine, candidateIds: runnable });
  }

  return {
    toRun,
    refused: [...refusedIndex.values()],
    enginesUsed: [...new Set(toRun.map((r) => r.engine))],
  };
}
