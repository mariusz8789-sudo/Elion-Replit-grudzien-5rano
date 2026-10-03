import { canonicalHash } from '../provenance.mjs';

export const PROMOTION_STAGE = Object.freeze({
  DEVELOPMENT: 'DEVELOPMENT',
  FROZEN: 'FROZEN',
  UNSEEN_EVALUATION: 'UNSEEN_EVALUATION',
  PROMOTION_DECISION: 'PROMOTION_DECISION',
});

const HASH = /^[a-f0-9]{64}$/;

export function createDevelopmentRecord({ modelIdentity, developmentDataset, limitations = [] } = {}) {
  if (!modelIdentity || !developmentDataset) return { ok: false, error: 'IDENTITY_REQUIRED' };
  const body = { stage: PROMOTION_STAGE.DEVELOPMENT, modelIdentity, developmentDataset, limitations: [...limitations], productApproved: false };
  return { ok: true, record: Object.freeze({ ...body, fingerprint: canonicalHash(body) }) };
}

export function freezePromotionProtocol(developmentRecord, { preregHash, metrics, passCriteria } = {}) {
  if (developmentRecord?.stage !== PROMOTION_STAGE.DEVELOPMENT) return { ok: false, error: 'DEVELOPMENT_RECORD_REQUIRED' };
  if (!HASH.test(preregHash ?? '')) return { ok: false, error: 'PREREG_HASH_REQUIRED' };
  if (!Array.isArray(metrics) || metrics.length === 0 || !passCriteria || typeof passCriteria !== 'object') return { ok: false, error: 'FROZEN_PROTOCOL_INCOMPLETE' };
  const body = { ...developmentRecord, stage: PROMOTION_STAGE.FROZEN, preregHash, metrics: [...metrics], passCriteria, productApproved: false };
  return { ok: true, record: Object.freeze({ ...body, fingerprint: canonicalHash(body) }) };
}

export function recordUnseenEvaluation(frozenRecord, { unseenDataset, metricResults, evaluatedAt = null } = {}) {
  if (frozenRecord?.stage !== PROMOTION_STAGE.FROZEN) return { ok: false, error: 'FROZEN_PROTOCOL_REQUIRED' };
  if (!unseenDataset || canonicalHash(unseenDataset) === canonicalHash(frozenRecord.developmentDataset)) return { ok: false, error: 'INDEPENDENT_UNSEEN_DATASET_REQUIRED' };
  if (!metricResults || typeof metricResults !== 'object') return { ok: false, error: 'METRIC_RESULTS_REQUIRED' };
  const expected = new Set(frozenRecord.metrics);
  if ([...expected].some((metric) => !Object.hasOwn(metricResults, metric))) return { ok: false, error: 'METRIC_RESULTS_INCOMPLETE' };
  const criteriaPass = Object.entries(frozenRecord.passCriteria).every(([metric, criterion]) => {
    const value = metricResults[metric];
    if (typeof value !== 'number' || !Number.isFinite(value)) return false;
    if (typeof criterion?.min === 'number' && value < criterion.min) return false;
    if (typeof criterion?.max === 'number' && value > criterion.max) return false;
    return true;
  });
  const body = { ...frozenRecord, stage: PROMOTION_STAGE.UNSEEN_EVALUATION, unseenDataset, metricResults, evaluatedAt, criteriaPass, productApproved: false };
  return { ok: true, record: Object.freeze({ ...body, fingerprint: canonicalHash(body) }) };
}

export function decidePromotion(evaluationRecord, { decision, decidedAt = null, reviewer = null, limitations = [] } = {}) {
  if (evaluationRecord?.stage !== PROMOTION_STAGE.UNSEEN_EVALUATION) return { ok: false, error: 'UNSEEN_EVALUATION_REQUIRED' };
  if (!['APPROVE', 'REJECT'].includes(decision)) return { ok: false, error: 'DECISION_INVALID' };
  if (decision === 'APPROVE' && evaluationRecord.criteriaPass !== true) return { ok: false, error: 'PASS_CRITERIA_NOT_MET' };
  const body = {
    ...evaluationRecord,
    stage: PROMOTION_STAGE.PROMOTION_DECISION,
    decision,
    decidedAt,
    reviewer,
    decisionLimitations: [...limitations],
    productApproved: decision === 'APPROVE',
  };
  return { ok: true, record: Object.freeze({ ...body, fingerprint: canonicalHash(body) }) };
}
