export type Genesis9DProductDecision = 'INTEGRATE_NOW' | 'KEEP_PROTOTYPE' | 'NOT_USEFUL';

export interface Genesis9DModuleAudit {
  id: string;
  decision: Genesis9DProductDecision;
  reason: string;
  publicRuntime: false;
}

/**
 * Product admission decisions for the seven existing deterministic 9D modules.
 * This is registry metadata only: it does not create a second runtime or
 * promote synthetic output to scientific Evidence.
 */
export const GENESIS_9D_PRODUCT_AUDIT: readonly Genesis9DModuleAudit[] = [
  { id: 'ice-wall-beyond', decision: 'NOT_USEFUL', reason: 'Synthetic unsubstantiated premise; unsuitable for the scientific product.', publicRuntime: false },
  { id: 'pyramid-interior', decision: 'KEEP_PROTOTYPE', reason: 'Synthetic reconstruction without governed archaeological observations.', publicRuntime: false },
  { id: 'chronos-scale', decision: 'KEEP_PROTOTYPE', reason: 'Hash-generated chronology profile; no measured or source-backed timeline output.', publicRuntime: false },
  { id: 'math-time-machine', decision: 'KEEP_PROTOTYPE', reason: 'Theoretical equation demonstrator overlaps the canonical Spacetime route.', publicRuntime: false },
  { id: 'platform-ux', decision: 'NOT_USEFUL', reason: 'Internal UX/session helper, not a scientific capability.', publicRuntime: false },
  { id: 'interactive-entity', decision: 'KEEP_PROTOTYPE', reason: 'Synthetic canned dialogue without source-grounded historical reconstruction.', publicRuntime: false },
  { id: 'genealogical-tree', decision: 'KEEP_PROTOTYPE', reason: 'Procedural DAG without governed genetic or archival data.', publicRuntime: false },
] as const;

export function getGenesis9DProductDecision(id: string): Genesis9DModuleAudit | undefined {
  return GENESIS_9D_PRODUCT_AUDIT.find((entry) => entry.id === id);
}
