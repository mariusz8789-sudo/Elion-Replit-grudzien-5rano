import type { AuditedEvidenceRecord } from '../agent/genesisAdjudicationProtocol';
import { execute, freeze, preRegister } from '../agent/genesisAdjudicationProtocol';
import type { ExperimentDefinition, ExperimentRecord } from './contracts';
import { fingerprintOf } from './core';
import { replay, runExperiment, runExperimentSafe } from './experiment';

export { replay, runExperiment, runExperimentSafe };

/**
 * DEMO5 — a physics hypothesis test wired through the EXISTING Genesis
 * Adjudication Protocol (D-047, `core/agent/genesisAdjudicationProtocol.ts`),
 * per item 2 of the integration mandate: "przepięcie demo5 na istniejący
 * D-047 — bez drugiego adjudication engine".
 *
 * The source bundle's own `demo5GenesisLoop` decided WINNER/NO_WINNER with a
 * bespoke one-line comparison (`ratio >= lo && ratio <= hi`) — exactly the
 * kind of ad-hoc, unaudited decision path this whole session has been
 * removing everywhere else (evidenceProvenance.ts, the LOWER-HARM funnel,
 * D-047 itself). This file does the SAME comparison, but only inside
 * `execute()`'s `runResult` callback — meaning it now gets, for free, the
 * two guarantees `execute()` provides that the bundle's version did not:
 * (1) the HARK guard — the threshold rule is frozen with `freeze()` BEFORE
 * the ratio is computed, and `execute()` refuses to run if the rule supplied
 * differs from what was frozen; (2) the reproducibility guard — `execute()`
 * calls the decision function twice and refuses to proceed if the two
 * results disagree.
 *
 * SCOPE DECISION: this is a first-time decision (there is no prior,
 * historical verdict for "does dE/dx scale as z^2 in this toy model" to
 * compare against), so only `preRegister -> freeze -> execute` are used.
 * `readjudicate -> compare -> audit` exist specifically for comparing a
 * NEW adjudication against a HISTORICAL one (see D-047's own module header
 * and `a2Surpass2ReAdjudication.ts`, D-046) — invoking them here with no
 * real history to compare against would mean faking a self-vs-self
 * "re-adjudication", which is worse than simply not using phases that do
 * not apply. If a genuine re-run of this same physics hypothesis is ever
 * needed later (e.g. after a model version bump), that IS the re-adjudication
 * case, and `readjudicate`/`compare`/`audit` apply directly at that point.
 *
 * Both hypotheses are evaluated and neither is favoured by default: WINNER
 * requires exactly one hypothesis's frozen range to hold and the other's not
 * to — both holding or neither holding is NO_WINNER, never forced.
 */

export interface PhysicsHypothesis {
  readonly id: string;
  readonly claim: string;
  readonly falsifier: string;
  readonly lowerBound: number;
  readonly upperBound: number;
}

export const H1_Z_SQUARED: PhysicsHypothesis = {
  id: 'H1',
  claim: 'dE/dx is proportional to z^2 (Bethe-like)',
  falsifier: 'ratio deposited(z=2)/deposited(z=1) outside [3.5,4.5]',
  lowerBound: 3.5,
  upperBound: 4.5,
};

export const H2_Z_LINEAR: PhysicsHypothesis = {
  id: 'H2',
  claim: 'dE/dx is proportional to z',
  falsifier: 'ratio deposited(z=2)/deposited(z=1) outside [1.5,2.5]',
  lowerBound: 1.5,
  upperBound: 2.5,
};

const TRANSPORT_MODEL_ID = 'M-TRANSPORT-001';

export function makeSweepDefs(problemId: string, hypId: string, modelId: string, zs: readonly number[], seedBase: number): readonly ExperimentDefinition[] {
  return zs.map((z, i) => ({
    experimentId: `${problemId}-${hypId}-z${z}`,
    problemId,
    hypothesisId: hypId,
    modelId,
    seed: seedBase + i,
    observable: 'deposited energy',
    toyAccepted: true,
    provenance: [{ source: 'genesis-physics-world:internal', retrievedAt: '1970-01-01T00:00:00Z' }],
    parameters: [
      { name: 'z', value: z, unit: 'e', min: 1, max: 10, required: true },
      { name: 'E0_MeV', value: 200, unit: 'MeV', min: 10, max: 500, required: true },
      { name: 'mat_Z', value: 13, unit: '-', min: 1, max: 92, required: true },
      { name: 'mat_A', value: 27, unit: '-', min: 1, max: 250, required: true },
      { name: 'rho_g_cm3', value: 2.7, unit: 'g/cm3', min: 0.1, max: 25, required: true },
      { name: 'thickness_cm', value: 0.5, unit: 'cm', min: 0.01, max: 10, required: true },
    ],
    // The real, frozen decision rule (with the actual hypothesis-specific
    // threshold bounds) lives in the D-047 `PreRegistration`/`FrozenProtocol`
    // built by `evaluateHypothesis` below — not duplicated here as a string.
  }));
}

interface PhysicsSweepRule {
  readonly hypothesisId: string;
  readonly claim: string;
  readonly metric: string;
  readonly lowerBound: number;
  readonly upperBound: number;
  readonly modelId: string;
  readonly experimentIdZ1: string;
  readonly experimentIdZ2: string;
}

interface PhysicsSweepVerdict {
  readonly hypothesisId: string;
  readonly held: boolean;
  readonly ratio: number;
}

function toEvidenceRecord(rec: ExperimentRecord): AuditedEvidenceRecord {
  return {
    source: rec.provenance[0]?.source ?? 'genesis-physics-world:internal',
    sourceId: rec.experimentId,
    hash: rec.reproducibilityFingerprint,
    custodyStatus: 'PINNED_VERIFIED',
    evidenceClass: 'SYNTHETIC_TOY_MODEL_INTERNAL',
    classificationMethod: 'ModelCard.toy=true self-declaration; reproducibilityFingerprint verified by the double-run check inside runExperiment/execute()',
    rankingFingerprint: fingerprintOf({ modelId: rec.modelId, modelVersion: rec.modelVersion, evidenceClass: 'SYNTHETIC_TOY_MODEL_INTERNAL' }),
  };
}

function evaluateHypothesis(
  hyp: PhysicsHypothesis,
  defs: readonly ExperimentDefinition[],
  recordsById: ReadonlyMap<string, ExperimentRecord>,
): { readonly verdict: PhysicsSweepVerdict; readonly ruleFingerprint: string; readonly inputFingerprint: string } {
  const [z1Def, z2Def] = defs;
  const z1 = recordsById.get(z1Def.experimentId);
  const z2 = recordsById.get(z2Def.experimentId);
  if (!z1 || !z2) throw new Error(`evaluateHypothesis: missing experiment record(s) for hypothesis ${hyp.id}.`);

  const rule: PhysicsSweepRule = {
    hypothesisId: hyp.id,
    claim: hyp.claim,
    metric: 'deposited energy ratio z=2/z=1',
    lowerBound: hyp.lowerBound,
    upperBound: hyp.upperBound,
    modelId: TRANSPORT_MODEL_ID,
    experimentIdZ1: z1.experimentId,
    experimentIdZ2: z2.experimentId,
  };

  const pre = preRegister({
    protocolId: `PHYSICS-DEMO5-${hyp.id}`,
    subjectId: 'transport-z-scaling-of-deposited-energy',
    question: `Does deposited energy in the toy transport model scale as: ${hyp.claim}?`,
    rule,
    declaredAt: '1970-01-01T00:00:00Z',
  });
  const frozen = freeze(pre, '1970-01-01T00:00:00Z');

  const executed = execute(frozen, {
    rule,
    evidenceUsed: [toEvidenceRecord(z1), toEvidenceRecord(z2)],
    runResult: (r): PhysicsSweepVerdict => {
      const a = recordsById.get(r.experimentIdZ1);
      const b = recordsById.get(r.experimentIdZ2);
      if (!a || !b) throw new Error(`runResult: missing experiment record(s) for ${r.hypothesisId}.`);
      const ratio = b.result.summary.deposited / a.result.summary.deposited;
      return { hypothesisId: r.hypothesisId, held: ratio >= r.lowerBound && ratio <= r.upperBound, ratio };
    },
  });

  return { verdict: executed.result, ruleFingerprint: frozen.ruleFingerprint, inputFingerprint: executed.inputFingerprint };
}

export interface Demo5HypothesisOutcome {
  readonly hypothesisId: string;
  readonly claim: string;
  readonly held: boolean;
  readonly ratio: number;
  readonly ruleFingerprint: string;
  readonly inputFingerprint: string;
}

export interface Demo5Result {
  readonly verdict: 'WINNER' | 'NO_WINNER';
  readonly winner: string | null;
  readonly hypotheses: readonly Demo5HypothesisOutcome[];
  readonly records: readonly ExperimentRecord[];
  readonly note: string;
}

export function demo5GenesisLoop(): Demo5Result {
  const h1Defs = makeSweepDefs('P-DEMO5', H1_Z_SQUARED.id, TRANSPORT_MODEL_ID, [1, 2], 101);
  const h2Defs = makeSweepDefs('P-DEMO5', H2_Z_LINEAR.id, TRANSPORT_MODEL_ID, [1, 2], 201);
  const records = [...h1Defs, ...h2Defs].map((d) => runExperiment(d));
  const recordsById = new Map(records.map((r) => [r.experimentId, r]));

  const h1 = evaluateHypothesis(H1_Z_SQUARED, h1Defs, recordsById);
  const h2 = evaluateHypothesis(H2_Z_LINEAR, h2Defs, recordsById);

  const h1Holds = h1.verdict.held;
  const h2Holds = h2.verdict.held;
  const verdict: 'WINNER' | 'NO_WINNER' = h1Holds !== h2Holds ? 'WINNER' : 'NO_WINNER';
  const winner = h1Holds && !h2Holds ? H1_Z_SQUARED.id : !h1Holds && h2Holds ? H2_Z_LINEAR.id : null;

  return {
    verdict,
    winner,
    hypotheses: [
      { hypothesisId: H1_Z_SQUARED.id, claim: H1_Z_SQUARED.claim, held: h1Holds, ratio: h1.verdict.ratio, ruleFingerprint: h1.ruleFingerprint, inputFingerprint: h1.inputFingerprint },
      { hypothesisId: H2_Z_LINEAR.id, claim: H2_Z_LINEAR.claim, held: h2Holds, ratio: h2.verdict.ratio, ruleFingerprint: h2.ruleFingerprint, inputFingerprint: h2.inputFingerprint },
    ],
    records,
    note: 'SYNTHETIC pipeline validation inside a toy model — NOT a physical discovery. Decided via D-047 (Genesis Adjudication Protocol): each hypothesis threshold rule was frozen BEFORE the ratio was computed, and execute() re-checked reproducibility by running the decision twice.',
  };
}
