import type { Objective, ProblemRecord } from './contracts';

/**
 * NL -> ProblemRecord. Fail-closed, zero fabrication: an NL description
 * alone is never treated as a metric, a threshold, or an evidence-minimum
 * rule. Anything the caller did not explicitly supply is listed in
 * `missingInputs` and the record's `status` is `NEEDS_INPUT` — the
 * orchestrator refuses to proceed past stage 1 for such a record (see
 * `orchestrator.ts`).
 */

export interface NLInput {
  readonly text: string;
  readonly objectives?: readonly Objective[];
  readonly constraints?: readonly string[];
  readonly population?: string;
  readonly harmAxes?: readonly string[];
  readonly evidenceMinimum?: string;
}

export function parseProblem(id: string, input: NLInput, hash: (value: unknown) => string): ProblemRecord {
  const missing: string[] = [];
  const objectives = input.objectives ?? [];
  if (objectives.length === 0) missing.push('objectives with explicit metric+direction (NL alone is not a metric)');
  for (const o of objectives) {
    if (!o.metric || !o.direction) missing.push(`objective '${o.metric ?? '?'}' lacks metric/direction`);
  }
  if (!input.evidenceMinimum) missing.push("evidenceMinimum (e.g. '>=1 DIRECT_RCT or registered head-to-head')");

  const base = {
    problemId: id,
    nlInput: input.text,
    objectives,
    constraints: input.constraints ?? [],
    population: input.population,
    harmAxes: input.harmAxes ?? [],
    evidenceMinimum: input.evidenceMinimum ?? '',
    missingInputs: missing,
    status: (missing.length > 0 ? 'NEEDS_INPUT' : 'FORMALIZED') as ProblemRecord['status'],
    llmAssisted: true,
  };
  const rec: ProblemRecord = { ...base, fingerprint: hash(base) };
  return Object.freeze(rec);
}
