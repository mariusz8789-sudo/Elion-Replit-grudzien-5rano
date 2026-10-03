import { canonicalJson } from '../events/hash';
import { compareCounterfactual, type CounterfactualComparison } from './counterfactualCompare';
import type { ExperimentArm, ScientificEvidenceChain } from './scientificDiscovery';

/**
 * A/B OVER THE PROTOCOL'S OWN ARMS (ported from claude/ab-counterfactual 9b4ca0a4).
 *
 * An executed protocol already holds several arms of the SAME registered model
 * that differ only in the preregistered swept parameter — exactly the controlled
 * pair `compareCounterfactual` expects. This module only picks two of those arms
 * and hands their stored requests to the existing comparison. It adds no metric
 * maths, no second provenance path and no variant authoring.
 *
 * One extra honesty check: the comparison re-runs both requests, so its run
 * fingerprints are compared with the fingerprints the protocol itself recorded
 * for those arms. A mismatch is reported, never hidden.
 */

export interface ProtocolArmOption {
  armId: string;
  label: string;
  kind: ExperimentArm['kind'];
  index: number;
}

export interface ProtocolArmComparison {
  comparison: CounterfactualComparison;
  baselineArmId: string;
  variantArmId: string;
  /** null when the comparison did not run both requests (blocked / invalid). */
  fingerprintsMatchProtocol: boolean | null;
}

/** Arms that the protocol designed AND executed; order follows the design. */
export function comparableProtocolArms(chain: ScientificEvidenceChain): readonly ProtocolArmOption[] {
  const executed = new Set(chain.arms.map((arm) => arm.armId));
  return chain.design.arms
    .map((arm, index) => ({ armId: arm.armId, label: arm.label, kind: arm.kind, index }))
    .filter((arm) => executed.has(arm.armId));
}

/**
 * Default pair: the first arm vs the first arm whose parameters actually differ.
 * A Δ 0 self-comparison would teach nothing and invite the misreading that the
 * model is insensitive to the swept parameter. Returns null below two arms.
 */
export function defaultProtocolArmPair(chain: ScientificEvidenceChain): { baselineArmId: string; variantArmId: string } | null {
  const options = comparableProtocolArms(chain);
  if (options.length < 2) return null;
  const first = chain.design.arms[options[0]!.index]!;
  const firstParams = canonicalJson(first.request.parameters);
  const different = options.slice(1).find((option) => canonicalJson(chain.design.arms[option.index]!.request.parameters) !== firstParams);
  return { baselineArmId: first.armId, variantArmId: (different ?? options[1]!).armId };
}

export function compareProtocolArms(chain: ScientificEvidenceChain, baselineArmId: string, variantArmId: string): ProtocolArmComparison | null {
  if (baselineArmId === variantArmId) return null;
  const baselineArm = chain.design.arms.find((arm) => arm.armId === baselineArmId);
  const variantArm = chain.design.arms.find((arm) => arm.armId === variantArmId);
  const baselineEvidence = chain.arms.find((arm) => arm.armId === baselineArmId);
  const variantEvidence = chain.arms.find((arm) => arm.armId === variantArmId);
  if (!baselineArm || !variantArm || !baselineEvidence || !variantEvidence) return null;

  const comparison = compareCounterfactual({
    baseline: baselineArm.request,
    variant: variantArm.request,
    labels: { baseline: baselineArm.label, variant: variantArm.label },
  });
  const evidence = comparison.evidence;
  const fingerprintsMatchProtocol = evidence
    ? baselineEvidence.runFingerprints.includes(evidence.baselineRunFingerprint) && variantEvidence.runFingerprints.includes(evidence.variantRunFingerprint)
    : null;
  return { comparison, baselineArmId, variantArmId, fingerprintsMatchProtocol };
}
