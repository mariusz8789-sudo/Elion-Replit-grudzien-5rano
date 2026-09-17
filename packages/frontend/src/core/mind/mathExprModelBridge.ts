import { compileUnary, nodeToString, parseExpression, simplify } from '../mathExpr';
import { canonicalJson, fnv1a } from '../events/hash';
import type { ModelSpec } from '../agent/modelSpace';
import type { SymbolicModelCandidate } from './contracts';

/**
 * SYMBOLIC ↔ MODEL-SPACE BRIDGE (docs/DECISIONS.md D-060) — the only route to
 * a model form outside `modelSpace.ts`'s fixed `ModelBasis` vocabulary.
 *
 * WHY NEW. `core/mathExpr.ts` already holds a full symbolic layer (parse,
 * simplify, differentiate, evaluate, compile) and `core/agent/modelSpace.ts`
 * already holds real model-form generation and mutation — but the two have
 * never been connected: a `ModelSpec` is a TERM LIST, a `mathExpr` `Node` is
 * an AST. Both are reused unmodified here; only the joining is new.
 *
 * WHAT IT DOES NOT CLAIM. A generated expression is a `MODEL_CANDIDATE`, full
 * stop — never "true", never "discovered", never evidence. It earns nothing
 * until it is fitted, falsified and adjudicated by the existing pipeline like
 * any other candidate. `tryExpress` is supplied by the caller so that a form
 * the term-list vocabulary CAN represent goes back through the real
 * `ModelSpec` path rather than bypassing it — the symbolic route is the
 * fallback, not the default.
 */
export interface SymbolicBridgeResult {
  readonly kind: 'EXPRESSIBLE_AS_MODEL_SPEC' | 'SYMBOLIC_CANDIDATE_ONLY';
  readonly modelSpec: ModelSpec | null;
  readonly symbolic: SymbolicModelCandidate | null;
  readonly predictor: (x: number) => number;
  readonly rendered: string;
}

export function bridgeSymbolicToModelSpace(
  source: string,
  parentFingerprint: string | null,
  tryExpress: (rendered: string) => ModelSpec | null,
): SymbolicBridgeResult {
  const rendered = nodeToString(simplify(parseExpression(source)));
  const predictor = compileUnary(rendered, 'x');
  const modelSpec = tryExpress(rendered);
  if (modelSpec !== null) {
    return { kind: 'EXPRESSIBLE_AS_MODEL_SPEC', modelSpec, symbolic: null, predictor, rendered };
  }
  const symbolic: SymbolicModelCandidate = Object.freeze({
    astSource: rendered,
    lineageParentFingerprint: parentFingerprint,
    status: 'MODEL_CANDIDATE' as const,
    fingerprint: fnv1a(canonicalJson({ rendered, parent: parentFingerprint })),
  });
  return { kind: 'SYMBOLIC_CANDIDATE_ONLY', modelSpec: null, symbolic, predictor, rendered };
}
