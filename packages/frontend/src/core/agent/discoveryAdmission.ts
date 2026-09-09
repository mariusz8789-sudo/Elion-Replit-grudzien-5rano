import { parseScenarioRequest, type ScenarioKind } from '../lookingGlass/scenarioRequest';
import {
  CAPABILITY_CODE,
  solverCapabilityFor,
  type SolverCapability,
} from '../worldModel/capability/solverCapability';
import { getRouterModel } from '../experimentFabric/router';
import type { Admission } from './discoveryStrategy';

/**
 * CAN GENESIS ANSWER THIS AT ALL — asked before anything is searched.
 *
 * Neither investigation loop checks this today. Both assume the question is
 * answerable because something routed it to them, so a question about a domain
 * Genesis has no solver for gets a search over whatever levers happen to exist
 * instead of the honest answer, which is that the model does not exist.
 *
 * ## This adds no new registry
 *
 * Genesis already has one honest capability registry per substrate, and this
 * module only reads them:
 *
 *   WorldGraph        `worldModel/capability/solverCapability.ts` — exhaustive
 *                     over `ScenarioKind` by construction (the compiler rejects
 *                     a new kind with no entry), MODELLED / PARTIALLY_MODELLED /
 *                     NOT_MODELLED with a named caveat or a named gap.
 *   Experiment Fabric `experimentFabric/router.ts` — the real registered models.
 *
 * Classification of a sentence into a `ScenarioKind` is likewise not reinvented:
 * `lookingGlass/scenarioRequest.ts` already does it deterministically, and is
 * the same classifier the Looking Glass chat path uses, so a question admitted
 * here and a question answered there cannot disagree about what was asked.
 *
 * Note the deliberate name: `experimentFabric/capabilityAdmission.ts` already
 * exists and is a DIFFERENT question — which router MODELS are admitted for use
 * (CONNECTED / MODEL_AVAILABLE / VERIFY_REQUIRED / PARKED). That is about a
 * model's standing; this is about whether a QUESTION can be answered.
 */

/** What a NOT_MODELLED admission needs to say, when the registry itself has nothing more specific. */
const UNCLASSIFIABLE_MISSING: readonly string[] = Object.freeze([
  'a recognisable scenario kind — the question did not match any scenario Genesis classifies',
  'either a rephrasing that names the hazard, process or system, or a new scenario kind with a real solver behind it',
]);

/**
 * Admits a free-text question against the WorldGraph capability registry.
 *
 * A sentence that classifies to no `ScenarioKind` is NOT_MODELLED rather than
 * BLOCKED: nothing failed at runtime, Genesis simply does not recognise the
 * question, and saying so names a real gap the user can act on.
 */
export function admitWorldQuestion(sourceText: string): Admission {
  const request = parseScenarioRequest(sourceText);
  if (request.kind === null) {
    return {
      status: 'NOT_MODELLED',
      why: 'This question does not classify as any scenario kind Genesis recognises, so no capability entry applies to it.',
      missing: UNCLASSIFIABLE_MISSING,
      caveat: null,
    };
  }
  return admissionFromCapability(request.kind, solverCapabilityFor(request.kind));
}

/**
 * Converts one `SolverCapability` registry entry into the shared `Admission`
 * vocabulary. Factored out of `admitWorldQuestion` so `admitWorldCalibration`
 * (below) consults the exact same registry the exact same way — a question
 * and a calibration about the same `ScenarioKind` cannot disagree about
 * whether Genesis can answer at all, because both call this one conversion.
 */
function admissionFromCapability(kind: ScenarioKind, capability: SolverCapability): Admission {
  switch (capability.capability) {
    case CAPABILITY_CODE.MODELLED:
      return {
        status: 'REAL',
        why: `${kind} is modelled by ${capability.solverId}.`,
        missing: [],
        caveat: null,
      };
    case CAPABILITY_CODE.PARTIALLY_MODELLED:
      return {
        status: 'APPROXIMATION',
        // The registry's own caveat, verbatim — a paraphrase here would be a
        // second, drifting statement of what the model does not cover.
        why: `${kind} is partially modelled${capability.solverId ? ` by ${capability.solverId}` : ''}.`,
        missing: [],
        caveat: capability.caveat ?? null,
      };
    default:
      return {
        status: 'NOT_MODELLED',
        why: `${kind} has no solver in Genesis.`,
        missing: capability.missing ?? [],
        caveat: null,
      };
  }
}

/**
 * Admits a parameter inquiry against the Experiment Fabric router.
 *
 * BLOCKED rather than NOT_MODELLED when the model id is unknown: an inquiry
 * names the model it intends to probe, so an id the router does not carry means
 * this runtime cannot execute a stated intention — a different fact from
 * "Genesis has no model for that", and one with a different fix.
 */
export function admitParameterInquiry(modelId: string): Admission {
  const model = getRouterModel(modelId);
  if (model === undefined) {
    return {
      status: 'BLOCKED',
      why: `The Experiment Fabric router carries no model with id "${modelId}", so the measurements and predictions this inquiry needs cannot be executed.`,
      missing: [`a registered router model with id "${modelId}"`],
      caveat: null,
    };
  }
  return {
    status: 'REAL',
    why: `${modelId} is a registered router model (${model.engine}), so measurements and predictions both execute against it.`,
    missing: [],
    // The model's own stated bounds, carried rather than restated.
    caveat: model.rationale,
  };
}

/**
 * Admits a world-parameter calibration against the SAME WorldGraph capability
 * registry `admitWorldQuestion` reads — no new registry, per this module's
 * own header.
 *
 * `system.scenarioKind` is declared by the domain (e.g. `epidemicInfectiousDaysCalibration.ts`
 * declares `'EPIDEMIC'`), never parsed from free text: a calibration's caller
 * already knows exactly which world it built, so classifying it the way
 * `admitWorldQuestion` classifies a sentence would be re-deriving a fact this
 * caller already has, the same reason `parameterStrategy.admit` reads
 * `input.system.modelId` directly instead of parsing a question about it.
 */
export function admitWorldCalibration(scenarioKind: ScenarioKind): Admission {
  return admissionFromCapability(scenarioKind, solverCapabilityFor(scenarioKind));
}
