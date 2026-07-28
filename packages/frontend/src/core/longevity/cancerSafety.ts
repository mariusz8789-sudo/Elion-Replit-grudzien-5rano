import {
  INTERVENTIONS, getIntervention, modulationOf,
  type Intervention, type InterventionId, type MechanisticTension, type ModulationDirection,
} from './interventions';
import { CANCER_NODES, ONCOGENIC_EDGES, getNode, type CancerNodeId, type GraphEdge } from './knowledgeGraph';
import type { HallmarkId } from './hallmarks';

/**
 * Longevity Discovery Platform — Cancer Safety Engine.
 *
 * WHY THIS EXISTS. Ageing and cancer are not neighbouring problems; they are the
 * same machinery read in two directions. The programmes that stop a damaged cell
 * dividing (p53, RB, p16-enforced senescence) are the programmes that suppress
 * tumours. The property that lets a cell divide without limit (telomerase) is the
 * property tumours must acquire. MYC is simultaneously a Yamanaka factor and one
 * of the most frequently activated human oncogenes.
 *
 * It follows that ANY intervention which relieves age-associated arrest is acting
 * on tumour-suppressive machinery by construction — not as a side effect to be
 * checked later, but as a direct consequence of the mechanism it was chosen for.
 * So this engine does not wait to be asked. Every strategy is analysed against
 * six oncogenic axes automatically.
 *
 * HOW IT WORKS — sign composition, no scoring model:
 *
 *   intervention pushes mechanism H  (increase / decrease)   [TARGET_DIRECTIONS]
 *   mechanism H is coupled to axis C (promotes / counteracts) [ONCOGENIC_EDGES]
 *   ⇒ net effect on C = compose(push, coupling)
 *
 *   increase + promotes    → raises activity on that axis
 *   increase + counteracts → lowers it
 *   decrease + promotes    → lowers it
 *   decrease + counteracts → raises it
 *
 * Whether "raises" is good or bad depends on the axis, and that is stated per
 * axis rather than assumed: raising immune surveillance is protective, raising
 * oncogene activation is not. Nothing here is a probability of cancer — no such
 * number is derivable from a mechanism graph, and inventing one would be exactly
 * the fabrication this platform exists to refuse.
 */

/** Is more activity on this axis protective or dangerous? Stated, never inferred. */
const AXIS_POLARITY: Record<CancerNodeId, { moreIs: 'protective' | 'dangerous'; because: string }> = {
  'tp53-axis': { moreIs: 'protective', because: 'p53 activity enforces arrest, senescence or apoptosis in damaged cells — it is the barrier, not the threat.' },
  'rb-axis': { moreIs: 'protective', because: 'RB restraint of E2F blocks unscheduled S-phase entry; p16–RB signalling maintains the arrest that suppresses transformation.' },
  'oncogene-activation': { moreIs: 'dangerous', because: 'Activated oncogenes drive proliferation independently of normal growth control.' },
  'tumour-suppressor-loss': { moreIs: 'dangerous', because: 'Loss of suppressors removes the brakes on proliferation and genome maintenance.' },
  'genomic-instability': { moreIs: 'dangerous', because: 'A higher mutation and rearrangement rate raises the probability of acquiring a transforming combination.' },
  'immune-surveillance': { moreIs: 'protective', because: 'Cytotoxic clearance removes transformed and senescent cells before they expand.' },
};

export type AxisDirection = 'raises' | 'lowers';
export type RiskDirection = 'increases-risk' | 'reduces-risk';

export interface AxisFinding {
  axis: CancerNodeId;
  axisLabel: string;
  /** Which mechanism carried the effect to this axis. */
  viaHallmark: HallmarkId;
  viaHallmarkLabel: string;
  /** How the intervention pushes that mechanism. */
  modulation: ModulationDirection;
  /** The documented coupling edge that was composed with it. */
  edge: GraphEdge;
  /** Net movement of activity on the axis. */
  axisDirection: AxisDirection;
  /** What that movement means for cancer risk, given the axis polarity. */
  risk: RiskDirection;
  /** Weakest honesty level in the two composed statements. */
  confidence: 'exact' | 'simplified' | 'theoretical';
  /** The full reasoning chain, in order, for display and audit. */
  reasoning: string[];
}

export type SafetyVerdict =
  /** At least one documented route raises cancer risk. */
  | 'risk-identified'
  /** Routes disagree — some raise, some lower. The honest answer is "both, here they are". */
  | 'mixed'
  /** Only risk-reducing routes are documented. */
  | 'protective-only'
  /** No oncogenic coupling could be computed. Absence of analysis, NOT evidence of safety. */
  | 'not-assessable';

export interface CancerSafetyProfile {
  interventionId: InterventionId;
  interventionLabel: string;
  verdict: SafetyVerdict;
  findings: AxisFinding[];
  /** Findings that raise risk, worst-established-first. */
  risks: AxisFinding[];
  /** Findings that lower risk. */
  protective: AxisFinding[];
  /** Axes with no documented coupling for this intervention — the unknown surface. */
  unassessedAxes: { axis: CancerNodeId; axisLabel: string }[];
  /** Documented tensions carried over from the intervention registry. */
  tensions: MechanisticTension[];
  /** What must be measured for this strategy, derived from the findings and tensions. */
  requiredMonitoring: string[];
  /** One-paragraph plain statement of the safety position. Never says "safe". */
  summary: string;
}

const CONFIDENCE_RANK: Record<string, number> = { exact: 0, simplified: 1, theoretical: 2 };

function composeConfidence(intervention: Intervention, edge: GraphEdge): AxisFinding['confidence'] {
  const worst = CONFIDENCE_RANK[intervention.honesty] >= CONFIDENCE_RANK[edge.honesty] ? intervention.honesty : edge.honesty;
  return worst === 'exact' ? 'exact' : worst === 'simplified' ? 'simplified' : 'theoretical';
}

/**
 * Full oncogenic analysis of one strategy. Deterministic and total: every
 * intervention gets a profile, and axes that cannot be analysed are reported as
 * unassessed rather than silently omitted.
 */
export function analyseCancerSafety(interventionId: InterventionId): CancerSafetyProfile | null {
  const intervention = getIntervention(interventionId);
  if (!intervention) return null;

  const findings: AxisFinding[] = [];

  for (const target of intervention.targets) {
    const modulation = modulationOf(interventionId, target);
    // No declared direction → no sign to compose. Refuse rather than guess.
    if (!modulation) continue;

    for (const edge of ONCOGENIC_EDGES.filter((e) => e.from === target)) {
      const axis = edge.to as CancerNodeId;
      const polarity = AXIS_POLARITY[axis];
      if (!polarity) continue;

      const raises = (modulation === 'increase') === (edge.effect === 'promotes');
      const axisDirection: AxisDirection = raises ? 'raises' : 'lowers';
      const risk: RiskDirection = (polarity.moreIs === 'dangerous') === raises ? 'increases-risk' : 'reduces-risk';

      const hallmarkLabel = getNode(target)?.label ?? target;
      const axisLabel = getNode(axis)?.label ?? axis;

      findings.push({
        axis, axisLabel, viaHallmark: target, viaHallmarkLabel: hallmarkLabel,
        modulation, edge, axisDirection, risk,
        confidence: composeConfidence(intervention, edge),
        reasoning: [
          `${intervention.label} is intended to ${modulation} ${hallmarkLabel}.`,
          `${hallmarkLabel} ${edge.effect === 'promotes' ? 'promotes' : 'counteracts'} ${axisLabel} — ${edge.mechanism}`,
          `Composing the two: activity on ${axisLabel} ${axisDirection}.`,
          `More ${axisLabel} is ${polarity.moreIs}: ${polarity.because}`,
          `Therefore this route ${risk === 'increases-risk' ? 'INCREASES' : 'reduces'} cancer risk.`,
        ],
      });
    }
  }

  const risks = findings.filter((f) => f.risk === 'increases-risk')
    .sort((a, b) => CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence]);
  const protective = findings.filter((f) => f.risk === 'reduces-risk')
    .sort((a, b) => CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence]);

  const touchedAxes = new Set(findings.map((f) => f.axis));
  const unassessedAxes = CANCER_NODES
    .filter((n) => !touchedAxes.has(n.id as CancerNodeId))
    .map((n) => ({ axis: n.id as CancerNodeId, axisLabel: n.label }));

  let verdict: SafetyVerdict;
  if (findings.length === 0) verdict = 'not-assessable';
  else if (risks.length > 0 && protective.length > 0) verdict = 'mixed';
  else if (risks.length > 0) verdict = 'risk-identified';
  else verdict = 'protective-only';

  const requiredMonitoring = [
    ...new Set([
      ...intervention.tensions.map((t) => t.monitoredBy),
      ...risks.map((f) => `${f.axisLabel}: track whether activity moves as predicted via ${f.viaHallmarkLabel}.`),
    ]),
  ];

  const summary = buildSummary(intervention, verdict, risks, protective, unassessedAxes.length);

  return {
    interventionId, interventionLabel: intervention.label, verdict,
    findings, risks, protective, unassessedAxes,
    tensions: intervention.tensions, requiredMonitoring, summary,
  };
}

function buildSummary(
  intervention: Intervention, verdict: SafetyVerdict,
  risks: AxisFinding[], protective: AxisFinding[], unassessedCount: number,
): string {
  const parts: string[] = [];
  if (verdict === 'not-assessable') {
    parts.push(`No oncogenic coupling could be computed for ${intervention.label} from the declared mechanism directions. This is an ABSENCE OF ANALYSIS, not a finding of safety.`);
  } else {
    if (risks.length) {
      const axes = [...new Set(risks.map((r) => r.axisLabel))].join(', ');
      parts.push(`${risks.length} documented route${risks.length > 1 ? 's' : ''} by which ${intervention.label} would increase cancer risk (${axes}).`);
    }
    if (protective.length) {
      const axes = [...new Set(protective.map((r) => r.axisLabel))].join(', ');
      parts.push(`${protective.length} route${protective.length > 1 ? 's' : ''} by which it would reduce risk (${axes}).`);
    }
    if (verdict === 'mixed') {
      parts.push('These routes act in opposite directions simultaneously. The net effect is not derivable from mechanism alone and must be measured.');
    }
  }
  if (unassessedCount > 0) {
    parts.push(`${unassessedCount} of the six oncogenic axes have no documented coupling for this strategy and are therefore unassessed.`);
  }
  parts.push('This analysis states mechanistic couplings only. It is not a probability of cancer, not a safety clearance, and not clinical guidance.');
  return parts.join(' ');
}

/** Safety profiles for every registered strategy. */
export function analyseAll(): CancerSafetyProfile[] {
  return INTERVENTIONS
    .map((i) => analyseCancerSafety(i.id))
    .filter((p): p is CancerSafetyProfile => p !== null);
}

export interface OncogenicLoad {
  interventionId: InterventionId;
  label: string;
  /** Count of documented risk-increasing routes weighted by how established each is. */
  load: number;
  riskRoutes: number;
  protectiveRoutes: number;
  unassessedAxes: number;
  verdict: SafetyVerdict;
}

/**
 * Comparative oncogenic load across strategies, for ranking. The weight reflects
 * how well-established each risk route is (exact routes count fully, theoretical
 * ones count least) — it is a summary of the documented routes, not a hazard ratio.
 */
export function oncogenicLoadRanking(): OncogenicLoad[] {
  const weight: Record<AxisFinding['confidence'], number> = { exact: 1.0, simplified: 0.6, theoretical: 0.3 };
  return analyseAll()
    .map((p) => ({
      interventionId: p.interventionId,
      label: p.interventionLabel,
      load: p.risks.reduce((s, f) => s + weight[f.confidence], 0),
      riskRoutes: p.risks.length,
      protectiveRoutes: p.protective.length,
      unassessedAxes: p.unassessedAxes.length,
      verdict: p.verdict,
    }))
    .sort((a, b) => b.load - a.load);
}

/**
 * Strategies whose oncogenic profiles are complementary: one raises risk on an
 * axis the other lowers. This is a structurally motivated place to look for
 * combinations that offset each other's liability — a hypothesis to test, never
 * a recommendation to combine anything.
 */
export function offsettingPairs(): {
  a: InterventionId; b: InterventionId;
  offsetAxes: { axis: CancerNodeId; raisedBy: InterventionId; loweredBy: InterventionId }[];
}[] {
  const profiles = analyseAll();
  const out: { a: InterventionId; b: InterventionId; offsetAxes: { axis: CancerNodeId; raisedBy: InterventionId; loweredBy: InterventionId }[] }[] = [];

  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      const p = profiles[i];
      const q = profiles[j];
      const offsetAxes: { axis: CancerNodeId; raisedBy: InterventionId; loweredBy: InterventionId }[] = [];

      for (const risk of p.risks) {
        if (q.protective.some((f) => f.axis === risk.axis)) {
          offsetAxes.push({ axis: risk.axis, raisedBy: p.interventionId, loweredBy: q.interventionId });
        }
      }
      for (const risk of q.risks) {
        if (p.protective.some((f) => f.axis === risk.axis)) {
          offsetAxes.push({ axis: risk.axis, raisedBy: q.interventionId, loweredBy: p.interventionId });
        }
      }
      if (offsetAxes.length) out.push({ a: p.interventionId, b: q.interventionId, offsetAxes });
    }
  }
  return out.sort((x, y) => y.offsetAxes.length - x.offsetAxes.length);
}
