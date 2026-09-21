/**
 * D-081 — Node-side facade over `mounjaroResearchRecipe.ts`, bundled by
 * esbuild for `scripts/genesis-mounjaro-e2e.mjs`. Same pattern and same
 * reason as `core/repro/reproEntry.node.ts`: the promotion rule lives in
 * TypeScript because the CANONICAL Winner Gate does, and a node script cannot
 * import TypeScript directly. This file computes nothing of its own — it
 * re-exports the real builder so the E2E runs the same code the app would.
 */

export { buildMounjaroResearchRecipe, evidenceInventoryFor, NON_CLINICAL_DISCLAIMER } from './mounjaroResearchRecipe';
export type { MolecularDiscoveryArtifact, MounjaroRecipeOutcome, MounjaroResearchRecipe } from './mounjaroResearchRecipe';
