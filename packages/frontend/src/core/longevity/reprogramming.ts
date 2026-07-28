import type { HonestyLevel } from '../types';
import type { CellState } from './cellStates';

/**
 * Partial Reprogramming Engine.
 *
 * Full reprogramming is established, Nobel-recognised, and useless as therapy: a
 * cell taken to pluripotency has lost the identity that made it worth keeping, and
 * sustained OSKM expression in vivo produces teratomas. The therapeutic proposition
 * is therefore not reprogramming but STOPPING PART OF THE WAY — resetting
 * age-associated marks while the cell still knows what it is.
 *
 * That makes the whole field a question about a WINDOW, and this module models the
 * trajectory as phases so the window can be reasoned about explicitly rather than
 * assumed.
 *
 * THE CENTRAL HONEST STATEMENT, WHICH THE MODULE REFUSES TO SOFTEN: it is not
 * established that a usable window exists. It is not established that rejuvenation
 * and dedifferentiation are separable processes rather than two descriptions of the
 * same one. Every phase boundary here is a modelling device for reasoning, NOT a
 * measured threshold — no assay currently localises a cell on this trajectory in
 * vivo, which is itself the field's most consequential missing measurement.
 *
 * A second trap is modelled directly. The usual endpoint for "did it work" is an
 * epigenetic clock, and clocks are built from the same methylation marks
 * reprogramming acts on. A falling clock reading is therefore partly guaranteed by
 * the mechanism, independent of whether anything is functionally younger. Any phase
 * whose only evidence is a clock is flagged for exactly this.
 */

export type ReprogrammingPhase =
  | 'baseline'
  | 'early-reset'
  | 'identity-destabilisation'
  | 'commitment'
  | 'pluripotent';

export interface PhaseModel {
  phase: ReprogrammingPhase;
  label: string;
  /** Ordinal position on the trajectory, 0–1. A COORDINATE, not a measured quantity. */
  position: number;
  description: string;
  /** What is reset by this point. */
  resets: string[];
  /** What is put at risk by this point. */
  risks: string[];
  /** Can the cell return to its original identity from here? */
  reversible: 'yes' | 'uncertain' | 'no';
  /** Which cell state the cell most resembles here. */
  resemblesState: CellState;
  /** Whether a validated in-vivo readout exists to know a cell is here. */
  hasReadout: boolean;
  honesty: HonestyLevel;
  /** What including this phase does NOT claim. */
  caveat: string;
}

export const REPROGRAMMING_PHASES: PhaseModel[] = [
  {
    phase: 'baseline', label: 'Baseline (aged somatic cell)', position: 0,
    description: 'A differentiated cell carrying age-associated methylation, transcriptional and functional changes. Identity is stable and lineage markers are fully expressed.',
    resets: [], risks: [],
    reversible: 'yes', resemblesState: 'aging', hasReadout: true, honesty: 'exact',
    caveat: 'The starting point is well characterised. Everything downstream of it is less so.',
  },
  {
    phase: 'early-reset', label: 'Early epigenetic reset', position: 0.25,
    description: 'Transient factor expression begins remodelling DNA methylation. Age-associated marks start to shift while lineage-identity genes remain expressed and the cell continues its function.',
    resets: [
      'A subset of age-associated CpG methylation marks.',
      'Some age-associated transcriptional drift.',
    ],
    risks: [
      'Effects measured only by an epigenetic clock cannot be distinguished from the intervention acting directly on the clock’s own substrate.',
    ],
    reversible: 'yes', resemblesState: 'aging', hasReadout: false, honesty: 'simplified',
    caveat: 'THE THERAPEUTIC PROPOSITION LIVES HERE. Whether functional rejuvenation actually occurs at this phase — rather than only a clock reading moving — is the open question, not a settled result.',
  },
  {
    phase: 'identity-destabilisation', label: 'Identity destabilisation', position: 0.5,
    description: 'Lineage-identity genes begin to be silenced and pluripotency-associated loci begin to open. The cell is no longer reliably performing its differentiated function but has not committed to pluripotency.',
    resets: [
      'A larger fraction of age-associated marks.',
      'Lineage-restricted chromatin configuration begins to open.',
    ],
    risks: [
      'Loss of differentiated function while the cell is still in the tissue.',
      'A destabilised cell that re-differentiates may adopt a DIFFERENT lineage than it started as.',
      'Proliferative capacity rises before differentiation control is re-established.',
    ],
    reversible: 'uncertain', resemblesState: 'stem-like', hasReadout: false, honesty: 'theoretical',
    caveat: 'The boundary between "reset" and "destabilised" is the single most important quantity in this field and there is no assay that locates it in vivo. Its position here is a modelling coordinate, not a measurement.',
  },
  {
    phase: 'commitment', label: 'Commitment to dedifferentiation', position: 0.75,
    description: 'Pluripotency network activity becomes self-sustaining and no longer depends on continued factor expression. The cell will not return to its original identity by withdrawal of the stimulus alone.',
    resets: ['Most age-associated marks, together with differentiation state.'],
    risks: [
      'Teratoma formation is documented in vivo from cells that reach this point.',
      'Withdrawal of the reprogramming stimulus no longer restores the original identity.',
    ],
    reversible: 'no', resemblesState: 'stem-like', hasReadout: true, honesty: 'exact',
    caveat: 'This is the documented failure mode of in-vivo reprogramming, not a speculative risk.',
  },
  {
    phase: 'pluripotent', label: 'Pluripotency (iPSC)', position: 1,
    description: 'A fully reprogrammed induced pluripotent stem cell. Epigenetic age is reset essentially completely; somatic identity is gone.',
    resets: ['Essentially the full age-associated epigenetic signature.'],
    risks: [
      'No somatic function retained.',
      'Teratoma formation is the standard assay for this state — its tumourigenicity is a defining property, not a side effect.',
    ],
    reversible: 'no', resemblesState: 'stem-like', hasReadout: true, honesty: 'exact',
    caveat: 'Established and Nobel-recognised. Also the state that a THERAPEUTIC protocol must specifically avoid reaching.',
  },
];

export interface WindowAnalysis {
  /** Phases where age marks reset AND identity is not yet committed. */
  windowPhases: PhaseModel[];
  /** Position at which reversibility stops being assured. */
  reversibilityBoundary: number;
  /** Position at which teratoma risk is documented. */
  irreversibilityBoundary: number;
  /** Whether any phase in the window has a validated in-vivo readout. */
  windowIsObservable: boolean;
  /** The blocking problem, stated plainly. */
  criticalGap: string;
  reasoning: string[];
}

/**
 * Analyse the therapeutic window. The result is deliberately uncomfortable: the
 * window is bounded by two positions that are not measurable in vivo, so a protocol
 * cannot currently be steered by observation and must instead be dosed open-loop by
 * time or exposure. That is the actual state of the art, and stating it plainly is
 * more useful than a diagram implying a controllable process.
 */
export function analyseWindow(): WindowAnalysis {
  const windowPhases = REPROGRAMMING_PHASES.filter(
    (p) => p.resets.length > 0 && p.reversible !== 'no',
  );
  const firstIrreversible = REPROGRAMMING_PHASES.find((p) => p.reversible === 'no');
  const firstUncertain = REPROGRAMMING_PHASES.find((p) => p.reversible === 'uncertain');
  const windowIsObservable = windowPhases.some((p) => p.hasReadout);

  return {
    windowPhases,
    reversibilityBoundary: firstUncertain?.position ?? 1,
    irreversibilityBoundary: firstIrreversible?.position ?? 1,
    windowIsObservable,
    criticalGap: windowIsObservable
      ? 'A validated in-vivo readout exists somewhere in the window.'
      : 'NO phase inside the therapeutic window has a validated in-vivo readout. A protocol therefore cannot be steered by measurement and must be dosed open-loop by exposure or time, with the boundary detected only after it has been crossed. Developing an assay that localises a cell on this trajectory in vivo is the prerequisite for everything else here.',
    reasoning: [
      `${windowPhases.length} phase(s) reset age-associated marks while identity remains recoverable.`,
      `Reversibility becomes uncertain at position ${firstUncertain?.position ?? 1} (${firstUncertain?.label ?? 'n/a'}).`,
      `Identity loss becomes documented and irreversible at position ${firstIrreversible?.position ?? 1} (${firstIrreversible?.label ?? 'n/a'}).`,
      'Both boundaries are modelling coordinates inferred from published behaviour, NOT measured thresholds. No assay currently places a cell on this axis in a living animal.',
      'A protocol aiming at the window is therefore operating without feedback — the strongest argument for developing the readout before scaling any intervention.',
    ],
  };
}

export interface PhaseRisk {
  phase: ReprogrammingPhase;
  label: string;
  position: number;
  /** 0–100. Counts documented risks, weighted by how established the phase model is. */
  riskScore: number;
  risks: string[];
  /** True when the phase's only plausible endpoint shares a substrate with the intervention. */
  circularEndpointRisk: boolean;
  reasoning: string[];
}

const HONESTY_WEIGHT: Record<HonestyLevel, number> = {
  exact: 1.0, simplified: 0.75, educational: 0.5, theoretical: 0.5, cinematic: 0.2,
};

/** Risk profile along the trajectory. Rises with position, which is the whole problem. */
export function phaseRisks(): PhaseRisk[] {
  return REPROGRAMMING_PHASES.map((p) => {
    const circular = p.risks.some((r) => r.toLowerCase().includes('clock'));
    const raw = p.risks.length * 22 * HONESTY_WEIGHT[p.honesty] + (p.reversible === 'no' ? 35 : p.reversible === 'uncertain' ? 18 : 0);
    return {
      phase: p.phase, label: p.label, position: p.position,
      riskScore: Math.min(100, Math.round(raw)),
      risks: p.risks,
      circularEndpointRisk: circular,
      reasoning: [
        `${p.risks.length} documented risk(s) at this phase; reversibility is "${p.reversible}".`,
        p.hasReadout
          ? 'A validated readout exists for this phase, so a protocol could in principle detect arrival.'
          : 'NO validated in-vivo readout for this phase — arrival cannot currently be detected.',
        circular
          ? 'The natural endpoint here shares its measurement substrate with the intervention, so a positive reading is partly guaranteed by the mechanism.'
          : 'No circular-endpoint problem identified at this phase.',
        p.caveat,
      ],
    };
  });
}

/** The experiments that would make the trajectory steerable, in dependency order. */
export function windowRequirements(): { requirement: string; why: string; blocks: string }[] {
  return [
    {
      requirement: 'An in-vivo readout that localises a cell on the reprogramming trajectory.',
      why: 'Without it a protocol cannot know which phase a cell has reached, and the boundary is detected only by observing the failure.',
      blocks: 'Every dose-finding, safety and efficacy question downstream.',
    },
    {
      requirement: 'A functional rejuvenation endpoint that shares no measurement substrate with methylation.',
      why: 'Epigenetic clocks are built from the marks reprogramming acts on, so a falling clock cannot distinguish rejuvenation from the intervention measuring itself.',
      blocks: 'Any claim that early reset produces functional benefit rather than a moved marker.',
    },
    {
      requirement: 'Evidence that identity recovery is complete rather than approximate.',
      why: 'A destabilised cell that redifferentiates into a related but different lineage would score as recovered on lineage-marker panels while the tissue is quietly remodelled.',
      blocks: 'Long-term safety, since the consequence would appear only after years.',
    },
    {
      requirement: 'Demonstration that rejuvenation and dedifferentiation are separable at all.',
      why: 'If the marks that carry age are the same marks that carry identity, no window exists and the entire strategy is misconceived — a negative result here would be the single most valuable outcome in the field.',
      blocks: 'The premise of partial reprogramming as a therapeutic strategy.',
    },
  ];
}
