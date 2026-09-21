/* Proprietary / All Rights Reserved - Genesis OS */
/**
 * Entry point bundled by `npm run compute:bundle:manifold` into
 * packages/backend/src/compute/manifold-core.mjs — the 5D manifold engine, the
 * enterprise receipt layer and the real OS sampler the backend feeds it.
 */
export { Genesis5DManifoldEngine, tartariaSdf, MAX_MANIFOLD_POINTS } from './Genesis5DManifoldEngine.js';
export { GenesisEnterpriseCore, telemetryFromSample } from './GenesisEnterpriseCore.js';
export { osSampler, SystemResourceBridge } from '../native/SystemResourceBridge.js';
