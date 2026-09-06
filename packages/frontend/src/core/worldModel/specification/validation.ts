import type { WorldSpecification } from './worldSpecification';

/**
 * SCIENTIFIC VALIDATION GATE.
 *
 * Sits between a `WorldSpecification` and `compileSpecification` — nothing
 * compiles a specification this gate has not first accepted. Checks
 * required parameters, scale/domain compatibility, REAL solver
 * availability, value ranges, and grounding expectations. Never silently
 * substitutes an unsupported scientific model for a requested one: an
 * unmet `required: true` domain request, or any other genuine problem,
 * is a validation ERROR, not a quiet downgrade.
 *
 * This is the one place that knows which scientific domains Genesis can
 * actually execute — `KNOWN_SCIENTIFIC_DOMAINS` below — so a future
 * generative proposal (see generation/worldModelProposal.ts) can never
 * reach the compiler claiming a domain that doesn't exist.
 */
export const KNOWN_SCIENTIFIC_DOMAINS = ['chemistry', 'epidemiology', 'hydraulics', 'kinematics'] as const;
export type KnownScientificDomain = (typeof KNOWN_SCIENTIFIC_DOMAINS)[number];

const KNOWN_TEMPLATE_IDS = ['CITY', 'LABORATORY', 'WATER_SYSTEM', 'EPIDEMIOLOGY', 'INDUSTRIAL_SITE'] as const;
const KNOWN_SCALE_LEVELS = ['PLANET', 'REGION', 'MACRO_CITY', 'BUILDING', 'ROOM', 'MESO_LAB', 'MICRO_MOLECULAR', 'NANO_ATOMIC'] as const;

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface SpecificationValidationResult {
  ok: boolean;
  errors: readonly ValidationIssue[];
  /** Non-fatal notices — e.g. a `required: false` domain request Genesis has no solver for, which will be honestly marked NOT_MODELED rather than blocking generation. */
  warnings: readonly ValidationIssue[];
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Validates a `WorldSpecification` BEFORE it may be compiled. Treats the
 * input as data from a potentially untrusted source (a future generative
 * proposal, not just hand-authored TypeScript) — every check re-verifies
 * shape and range at runtime rather than trusting the static type alone.
 */
export function validateSpecification(spec: WorldSpecification): SpecificationValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const err = (path: string, message: string) => errors.push({ path, message });
  const warn = (path: string, message: string) => warnings.push({ path, message });

  if (!spec.worldId || typeof spec.worldId !== 'string') err('worldId', 'worldId must be a non-empty string');
  if (!isFiniteNumber(spec.seed)) err('seed', 'seed must be a finite number');

  if (!Array.isArray(spec.worldType) || spec.worldType.length === 0) {
    err('worldType', 'worldType must declare at least one template');
  } else {
    for (const [i, template] of spec.worldType.entries()) {
      if (!(KNOWN_TEMPLATE_IDS as readonly string[]).includes(template)) {
        err(`worldType[${i}]`, `Unknown world template "${template}" — known templates: ${KNOWN_TEMPLATE_IDS.join(', ')}`);
      }
    }
  }

  if (spec.scale !== undefined && !(KNOWN_SCALE_LEVELS as readonly string[]).includes(spec.scale)) {
    err('scale', `Unknown scale level "${spec.scale}" — known levels: ${KNOWN_SCALE_LEVELS.join(', ')}`);
  }

  if (spec.population) {
    if (!isFiniteNumber(spec.population.count) || spec.population.count <= 0) {
      err('population.count', 'population.count must be a positive finite number');
    }
    if (spec.worldType && !spec.worldType.includes('EPIDEMIOLOGY') && !spec.worldType.includes('CITY')) {
      warn('population', 'population is declared but no CITY or EPIDEMIOLOGY template will consume it');
    }
  }

  const strict = spec.groundingExpectations === 'STRICT';
  for (const [i, request] of (spec.scientificDomains ?? []).entries()) {
    const path = `scientificDomains[${i}]`;
    if (!(KNOWN_SCIENTIFIC_DOMAINS as readonly string[]).includes(request.domain)) {
      const message = `Unknown scientific domain "${request.domain}" — Genesis has no real solver for it. Known domains: ${KNOWN_SCIENTIFIC_DOMAINS.join(', ')}`;
      if (request.required || strict) err(path, message);
      else warn(path, `${message} (not required — will be honestly marked NOT_MODELED)`);
    }
  }

  for (const [i, condition] of (spec.initialConditions ?? []).entries()) {
    const path = `initialConditions[${i}]`;
    if (!condition.target?.kind || condition.target.id === undefined) err(`${path}.target`, 'target must be a valid EntityRef {kind, id}');
    if (!condition.path || typeof condition.path !== 'string') err(`${path}.path`, 'path must be a non-empty dotted string');
    if (!isFiniteNumber(condition.value)) err(`${path}.value`, 'value must be a finite number');
  }

  for (const [i, intervention] of (spec.interventions ?? []).entries()) {
    const path = `interventions[${i}]`;
    if (!isFiniteNumber(intervention.atTick) || intervention.atTick < 0) err(`${path}.atTick`, 'atTick must be a non-negative finite number');
    if (!intervention.target?.kind || intervention.target.id === undefined) err(`${path}.target`, 'target must be a valid EntityRef {kind, id}');
    if (!intervention.parameters || typeof intervention.parameters !== 'object' || Object.keys(intervention.parameters).length === 0) {
      err(`${path}.parameters`, 'parameters must be a non-empty object');
    } else {
      for (const [key, value] of Object.entries(intervention.parameters)) {
        if (!isFiniteNumber(value)) err(`${path}.parameters.${key}`, 'every intervention parameter value must be a finite number');
      }
    }
  }

  if (spec.geography) {
    for (const key of ['regionCount', 'districtCount', 'buildingsPerDistrict'] as const) {
      const value = spec.geography[key];
      if (value !== undefined && (!isFiniteNumber(value) || value < 0)) err(`geography.${key}`, `${key} must be a non-negative finite number`);
    }
  }

  for (const [i, relationship] of (spec.relationships ?? []).entries()) {
    const path = `relationships[${i}]`;
    if (!relationship.from?.kind || relationship.from.id === undefined) err(`${path}.from`, 'from must be a valid EntityRef {kind, id}');
    if (!relationship.to?.kind || relationship.to.id === undefined) err(`${path}.to`, 'to must be a valid EntityRef {kind, id}');
    if (!relationship.kind || typeof relationship.kind !== 'string') err(`${path}.kind`, 'kind must be a non-empty string');
  }

  return { ok: errors.length === 0, errors, warnings };
}
