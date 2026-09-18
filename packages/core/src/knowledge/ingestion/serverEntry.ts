/* Proprietary / All Rights Reserved - Genesis OS */
/**
 * Entry point bundled by `npm run compute:bundle:knowledge` into
 * packages/backend/src/compute/knowledge-core.mjs — everything the backend's knowledge API needs,
 * nothing else. The backend supplies the real transport, sleeper, clock and environment.
 */
export { EvidenceLedger } from '../EvidenceLedger.js';
export { ProposeOnlyLearner } from '../ProposeOnlyLearner.js';
export { classifyClaim, statusLabelPl } from '../classifyClaim.js';
export { KNOWLEDGE_DISCLAIMER } from '../evidenceTypes.js';
export { OmniIngestionController } from './OmniIngestionController.js';
export { SourcePolicyRegistry, DEFAULT_POLICIES } from './SourcePolicyRegistry.js';
export { YouTubeOfficialApiAdapter } from './YouTubeOfficialApiAdapter.js';
export { PublicWebAdapter } from './PublicWebAdapter.js';
export { SocialOfficialApiAdapter } from './SocialOfficialApiAdapter.js';
export { envKeyProvider, KEY_ENV_NAMES } from './EnvKeyProvider.js';
export { realSleeper, originOf } from './netUtils.js';
