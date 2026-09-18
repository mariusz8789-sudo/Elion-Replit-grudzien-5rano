/* Proprietary / All Rights Reserved - Genesis OS */
/**
 * @genesis/core public barrel. Source-only package (no package.json of its own): the frontend
 * consumes it through the `@genesis/core` alias, the backend through esbuild bundles.
 * Keep this file minimal: one `export *` line per top-level module.
 */
export * from './knowledge/index.js';
export * from './engine/native/index.js';
export * from './engine/quantum/index.js';
