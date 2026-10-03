import { ADMET_USE_PURPOSE } from './admetResearchRunExecutor.mjs';
import { RETROSYNTHESIS_USE_PURPOSE } from './retrosynthesisAdmission.mjs';

// Engines whose model/template/stock licences are unreviewed may run for technical validation
// (MODEL_ESTIMATE, never released to a customer). COMMERCIAL_PRODUCT stays blocked until the
// licences are reviewed, and is only selected when the operator sets it explicitly.
export function resolveEngineUsePurpose(env = process.env) {
  return env.GENESIS_ENGINE_USE_PURPOSE === 'COMMERCIAL_PRODUCT'
    ? { admet: ADMET_USE_PURPOSE.COMMERCIAL_PRODUCT, retrosynthesis: RETROSYNTHESIS_USE_PURPOSE.COMMERCIAL_PRODUCT }
    : { admet: ADMET_USE_PURPOSE.TECHNICAL_VALIDATION, retrosynthesis: RETROSYNTHESIS_USE_PURPOSE.TECHNICAL_VALIDATION };
}
