import { canonicalHash } from '../provenance.mjs';

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,299}$/;
const AVAILABILITY = new Set(['AVAILABLE', 'BLOCKED_BY_RUNTIME', 'BLOCKED_BY_DATA', 'BLOCKED_BY_LICENSE', 'BLOCKED_BY_CONFIGURATION', 'UNKNOWN']);
const COST_CLASS = new Set(['TRIVIAL', 'LOW', 'MEDIUM', 'HIGH', 'UNKNOWN']);
const RISK = new Set(['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN']);
const UNCERTAINTY_STATUS = new Set(['MEASURED', 'ESTIMATED', 'NOT_APPLICABLE', 'UNKNOWN']);

function finiteNonNegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function createResourceProfile(input) {
  const errors = [];
  if (!ID.test(input?.capabilityId ?? '')) errors.push('capabilityId');
  if (!AVAILABILITY.has(input?.availability)) errors.push('availability');
  if (!COST_CLASS.has(input?.costClass)) errors.push('costClass');
  if (!RISK.has(input?.risk)) errors.push('risk');
  if (input?.expectedRuntimeMs !== null && !finiteNonNegative(input?.expectedRuntimeMs)) errors.push('expectedRuntimeMs');
  if (input?.cheaperPrerequisiteCapabilityId !== null && input?.cheaperPrerequisiteCapabilityId !== undefined && !ID.test(input.cheaperPrerequisiteCapabilityId)) errors.push('cheaperPrerequisiteCapabilityId');
  if (errors.length) return { ok: false, errors };
  const profile = {
    capabilityId: input.capabilityId,
    availability: input.availability,
    expectedRuntimeMs: input.expectedRuntimeMs,
    costClass: input.costClass,
    risk: input.risk,
    dataAvailable: input.dataAvailable === true,
    cheaperPrerequisiteCapabilityId: input.cheaperPrerequisiteCapabilityId ?? null,
    measuredAt: input.measuredAt ?? null,
    provenanceRef: input.provenanceRef ?? null,
  };
  return { ok: true, profile: Object.freeze({ ...profile, fingerprint: canonicalHash(profile) }) };
}

/**
 * A transparent ordering helper. It does not invent a scalar score: blocked
 * work is last, a declared cheaper prerequisite is first, then measured cost
 * and runtime. ResearchRun remains responsible for the scientific decision.
 */
export function orderResourceProfiles(profiles) {
  const costRank = { TRIVIAL: 0, LOW: 1, MEDIUM: 2, HIGH: 3, UNKNOWN: 4 };
  return [...profiles].sort((a, b) => {
    const available = Number(b.availability === 'AVAILABLE') - Number(a.availability === 'AVAILABLE');
    if (available) return available;
    const prerequisite = Number(Boolean(b.cheaperPrerequisiteCapabilityId)) - Number(Boolean(a.cheaperPrerequisiteCapabilityId));
    if (prerequisite) return prerequisite;
    const cost = costRank[a.costClass] - costRank[b.costClass];
    if (cost) return cost;
    const ar = a.expectedRuntimeMs ?? Number.POSITIVE_INFINITY;
    const br = b.expectedRuntimeMs ?? Number.POSITIVE_INFINITY;
    return ar - br || a.capabilityId.localeCompare(b.capabilityId);
  });
}

export function createAgreementRecord(input) {
  const errors = [];
  for (const field of ['methodA', 'methodB', 'protocolId', 'calibrationDataset']) if (!ID.test(input?.[field] ?? '')) errors.push(field);
  if (input?.methodA === input?.methodB) errors.push('methodsMustBeIndependent');
  if (!Number.isInteger(input?.n) || input.n < 1) errors.push('n');
  if (!finiteNonNegative(input?.measuredReliability) || input.measuredReliability > 1) errors.push('measuredReliability');
  if (!['AGREES', 'DISAGREES', 'INCOMPARABLE', 'UNKNOWN'].includes(input?.agreement)) errors.push('agreement');
  if (!['LOW', 'MEDIUM', 'HIGH', 'UNKNOWN'].includes(input?.confidenceCategory)) errors.push('confidenceCategory');
  if (errors.length) return { ok: false, errors };
  const record = {
    methodA: input.methodA,
    methodB: input.methodB,
    outputA: input.outputA ?? null,
    outputB: input.outputB ?? null,
    agreement: input.agreement,
    calibrationDataset: input.calibrationDataset,
    n: input.n,
    measuredReliability: input.measuredReliability,
    protocolId: input.protocolId,
    scope: input.scope ?? null,
    date: input.date ?? null,
    confidenceCategory: input.confidenceCategory,
  };
  return { ok: true, record: Object.freeze({ ...record, fingerprint: canonicalHash(record) }) };
}

const UNCERTAINTY_DIMENSIONS = Object.freeze(['data', 'model', 'measurement', 'engineDisagreement', 'extrapolation', 'missingEvidence', 'runtime', 'literatureCompleteness']);

export function createUncertaintyBreakdown(input = {}) {
  const dimensions = {};
  const errors = [];
  for (const name of UNCERTAINTY_DIMENSIONS) {
    const value = input[name];
    if (!value || !UNCERTAINTY_STATUS.has(value.status)) {
      errors.push(name + '.status');
      continue;
    }
    if (value.value !== null && value.value !== undefined && !finiteNonNegative(value.value)) errors.push(name + '.value');
    dimensions[name] = Object.freeze({
      status: value.status,
      value: value.value ?? null,
      unit: value.unit ?? null,
      method: value.method ?? null,
      evidenceRefs: Object.freeze([...(value.evidenceRefs ?? [])]),
      limitation: value.limitation ?? null,
    });
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, breakdown: Object.freeze({ dimensions: Object.freeze(dimensions), aggregate: null, fingerprint: canonicalHash(dimensions) }) };
}

/** Proposes checks only; existing ResearchRun/falsification executes them. */
export function selfFalsificationChecks({ parameterIds = [], alternativeEngineIds = [], hasApplicabilityDomain = false, datasetIdentity = null, replaySupported = false, contradictorySourceIds = [] } = {}) {
  const checks = [];
  if (parameterIds.length) checks.push({ kind: 'PARAMETER_SENSITIVITY', inputs: [...parameterIds] });
  if (alternativeEngineIds.length) checks.push({ kind: 'ALTERNATIVE_ENGINE_COMPARISON', inputs: [...alternativeEngineIds] });
  if (hasApplicabilityDomain) checks.push({ kind: 'OUT_OF_DOMAIN_CHECK', inputs: [] });
  if (datasetIdentity) checks.push({ kind: 'DATA_SHIFT_CHECK', inputs: [datasetIdentity] });
  if (contradictorySourceIds.length) checks.push({ kind: 'CONTRADICTORY_SOURCE_REVIEW', inputs: [...contradictorySourceIds] });
  if (replaySupported) checks.push({ kind: 'REPLAY_DRIFT_CHECK', inputs: [] });
  return Object.freeze(checks.map((check) => Object.freeze(check)));
}
