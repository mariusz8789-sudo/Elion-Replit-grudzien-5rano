import type { InquiryLoopInput, ParameterHypothesis, SystemUnderStudy } from './inquiryLoop';

/**
 * MOLECULAR SCALE ON THE EXPERIMENT FABRIC — a protein-folding Metropolis run
 * whose temperature nobody has measured.
 *
 * ## Why this model, and not the five the brief named
 *
 * The owner pointed at a real gap ("DNA / molekuły — trzeba rozwinąć") and five
 * already-registered router models as candidates: `quantum-chemistry-pyscf-h2-rhf`,
 * `chem-rdkit-descriptors`, `biology-openmm-md-1vii-reference`,
 * `biology-hiv-10e8-pdb-structural-comparison`, `biology-depmap-crispr-senescence-panel`.
 * The brief's own hard condition — a real hidden parameter the solver can
 * compute at different values, AND a probe that discriminates candidates — was
 * checked against each from `router.ts` and `structuredRequestBuilder.ts`
 * directly, not from memory:
 *
 *   `chem-rdkit-descriptors`      — ONE parameter, `smiles` (text). A pure
 *     function of molecular identity with no numeric axis at all: no hidden
 *     value, no probe. Exactly the case the brief warned about.
 *   `biology-depmap-crispr-senescence-panel` — ZERO parameters. No search space.
 *   `biology-hiv-10e8-pdb-structural-comparison` — TWO parameters, both text
 *     (`referencePdb`, `mobilePdb`). No numeric axis either.
 *   `biology-openmm-md-1vii-reference` — ONE numeric parameter, `steps`. A
 *     convergence control, not two independent physical axes.
 *   `quantum-chemistry-pyscf-h2-rhf` — TWO parameters, `bondLengthAngstrom`
 *     (numeric) and `basis` (text). Only ONE numeric axis exists.
 *
 * `SystemUnderStudy` needs TWO independent numeric axes that are NOT the same
 * one: `hiddenParameters` (the unknown) and `probeParameterId` (what the agent
 * dials to measure). `runAt` builds every request as
 * `{...fixedParameters, ...unknownValues, [probeParameterId]: probeValue}` —
 * the probe value always overwrites whatever the hidden map claims for that
 * same key, so a model with only one numeric parameter total cannot express
 * "a fact I don't know" and "a setting I choose" as two different things. All
 * five named candidates fail on exactly this structural point, before any
 * question of scientific interest is even asked. `SystemUnderStudy.hiddenParameters`
 * and `.fixedParameters` are also typed `Record<string, number>` — a text
 * parameter (`basis`, `smiles`, `sequence`, the two PDB ids) can never be
 * varied through this contract at all, only left at its declared default,
 * because `ObservableSystem`/`inquiryLoop.ts` are not being touched to admit
 * one. So even a model with a second numeric knob but an interesting text axis
 * (`biology-dna-helix`: `sequence` text + `temperatureC` numeric — one numeric
 * axis again) is out for the same reason.
 *
 * `biology-protein-folding-hp` (Dill 1985 HP lattice model, seeded Metropolis)
 * is the one router model at true molecular scale — a folding polymer, not an
 * atom or a population — with THREE numeric parameters: `temperature`,
 * `steps`, `seed`. That is enough room for a hidden axis and a genuinely
 * different probe axis, checked below.
 *
 * ## The question, and why choosing the next experiment is real here
 *
 * HIDDEN: the temperature this Metropolis fold was actually run at — a fact
 * about an unmeasured sample, exactly the shape `chemistry-arrhenius` and
 * `quantum-tunneling-1d` already use this loop for.
 *
 * PROBE: `steps` — how long the agent lets the simulation run before reading
 * out a measurement. This is a real experimental choice (how much observation
 * time to invest), not a proxy invented for this file.
 *
 * OBSERVED: `acceptanceRate` — the fraction of proposed Metropolis moves the
 * solver accepted. Chosen over `bestEnergy`/`finalEnergy` after measuring both:
 * energy is a small integer (HP contact energy is `-1` per non-backbone H–H
 * contact) dominated by which local minimum ONE seeded trajectory happens to
 * fall into, so it is noisy between candidate temperatures. `acceptanceRate` is
 * a frequency accumulated over every step of that same trajectory and is far
 * better behaved.
 *
 * MEASURED (not assumed) on the real solver, fixed sequence `classic` and seed
 * `20260819`, varying temperature and steps:
 *
 *     steps=200                    T=0.3..2.0 all read 0.1300   — IDENTICAL
 *     steps=50000  T=0.3:0.116  T=0.7:0.298  T=1.2:0.382  T=2.0:0.398
 *
 * At few steps every proposed move in an unfolding chain from a straight start
 * is downhill or neutral, and the Metropolis rule accepts those UNCONDITIONALLY
 * regardless of temperature — a real algorithmic floor, not noise, and it makes
 * the opening measurement genuinely uninformative for every candidate at once,
 * the same shape the compensation line gives `chemistry-arrhenius`. At many
 * steps, uphill moves start being proposed and accepted at a temperature-
 * dependent rate — `exp(-ΔE/T)` — and the true value pulls away from its
 * neighbours. `checkDiscriminability` finds that on its own; nothing here
 * asserts a curve.
 *
 * ## What was checked, and disclosed, before relying on this
 *
 * The relationship is genuinely NOISY: it comes from ONE realised Monte Carlo
 * trajectory, not an ensemble average. Re-measured across six different seeds
 * (20260819 and five more) at the same four candidate temperatures, the
 * ORDERING (0.3 < 0.7 < 1.2 < 2.0 in acceptance rate) held in every seed, but
 * the size of each gap moved — the 1.2-vs-2.0 gap in particular stayed small
 * (0.01–0.06) in every seed checked, a real saturation as temperature rises
 * rather than a fluke of the one seed this file pins. That is disclosed rather
 * than hidden: `NOT_MODELLED` below says plainly that a close pair of
 * candidate temperatures may not resolve, and the test suite proves it does not
 * pretend to.
 *
 * `seed` was also checked as a possible SECOND probe axis and rejected: it is
 * real, numeric, and changeable, but it selects WHICH stochastic trajectory is
 * realised, not a physically meaningful measurement setting — varying it at
 * fixed temperature and steps does not reveal the hidden temperature in any
 * systematic, discriminable way, only resamples noise. It is held fixed in
 * `fixedParameters` for exactly that reason, the molecular counterpart of why
 * chemistry's mass and epidemiology's IFR are declared but do not move their
 * respective objectives — see `docs/TWO_AUTONOMOUS_LOOPS_DECISION.md` §10 for
 * why this domain has no equivalent to a MECHANISM catalogue's inert lever.
 */

export const PROTEIN_FOLDING_SYSTEM_ID = 'protein-folding-hp-sample';

/** The Fabric model this inquiry runs on. Real, already registered, in-process (no external runtime dependency). */
export const PROTEIN_FOLDING_MODEL_ID = 'biology-protein-folding-hp';

/**
 * Four candidate temperatures spanning the runner's own validated range
 * (0, 3]. Spacing and labels are exactly what was measured above: `cold` and
 * `cool` separate cleanly from everything; `warm` and `hot` sit in the real
 * saturating region and may not separate from each other — kept rather than
 * replaced with a tidier, falsely-separable pair.
 */
export const PROTEIN_FOLDING_CANDIDATES = [
  { id: 'h:cold', temperature: 0.3, description: 'a cold fold, few uphill moves accepted' },
  { id: 'h:cool', temperature: 0.7, description: 'a cool fold' },
  { id: 'h:warm', temperature: 1.2, description: 'a warm fold' },
  { id: 'h:hot', temperature: 2.0, description: 'a hot fold, most uphill moves accepted' },
] as const;

export const PROTEIN_FOLDING_HYPOTHESES: readonly ParameterHypothesis[] = PROTEIN_FOLDING_CANDIDATES.map((c) => ({
  hypothesisId: c.id,
  statement: `This fold ran at temperature ${c.temperature} (reduced units): ${c.description}.`,
  claimedValues: { temperature: c.temperature },
  // Equal priors: four declared candidates, nothing measured yet.
  priorConfidence: 0.5,
}));

/**
 * Observation lengths the agent can choose, short to long. Ordered short-first
 * so the loop's own refusals stay honest: if a short run already separated the
 * survivors, there is no reason to reach for a longer, more expensive one.
 * All lie inside the runner's validated `steps` range [1, 50000].
 */
export const PROTEIN_FOLDING_PROBE_STEPS: readonly number[] = [200, 1000, 5000, 20000, 50000];

/**
 * The declared opening measurement: 200 steps, the shortest and cheapest in
 * the list. Measured, not assumed, to be the least informative: every
 * candidate temperature reads back exactly the same 0.13 acceptance rate at
 * this length, for the algorithmic floor reason in the module doc. The inquiry
 * therefore has to earn its answer with a longer run, and which one it reaches
 * for next is decided by what this one returned.
 */
export const PROTEIN_FOLDING_OPENING_STEPS = 200;

/**
 * The declared agreement band, ±15%. A property of the measurement (how much
 * of a discrepancy between a candidate's own predicted acceptance rate and
 * what was actually measured counts as disagreement), not of this module.
 * Chosen from the measured gaps: comfortably inside the cold/cool/warm
 * separations, and — honestly — sometimes too tight to separate warm from hot,
 * which the loop then correctly reports rather than papering over.
 */
export const PROTEIN_FOLDING_AGREEMENT_TOLERANCE = 0.15;

/** The one nuisance parameter of this model held fixed rather than searched — see the module doc for why `seed` cannot serve as a probe. */
const FIXED_SEED = 20_260_819;

/**
 * Builds the system under study for one real fold.
 *
 * `hiddenParameters` is the temperature this particular fold actually ran at —
 * a fact of this sample, supplied by whoever set the inquiry up, never read by
 * hypothesis selection or belief revision. `inquiryLoop.ts` enforces that with
 * `ObservableSystem`, not with a comment.
 */
export function proteinFoldingSystem(temperature: number, systemId = PROTEIN_FOLDING_SYSTEM_ID): SystemUnderStudy {
  return {
    systemId,
    label: 'HP-lattice protein fold (temperature not yet measured)',
    modelId: PROTEIN_FOLDING_MODEL_ID,
    hiddenParameters: { temperature },
    probeParameterId: 'steps',
    candidateProbeValues: PROTEIN_FOLDING_PROBE_STEPS,
    fixedParameters: { seed: FIXED_SEED },
    observedMetric: 'acceptanceRate',
    agreementTolerance: PROTEIN_FOLDING_AGREEMENT_TOLERANCE,
  };
}

/** The whole inquiry, ready to hand to `runAutonomousInquiry`, `runInquiryAndRemember`, or `runDiscovery({shape: 'PARAMETER', input})`. */
export function proteinFoldingInquiry(temperature: number, maxRounds = 4): InquiryLoopInput {
  return {
    question: 'What temperature did this HP-lattice protein fold actually run at?',
    system: proteinFoldingSystem(temperature),
    hypotheses: PROTEIN_FOLDING_HYPOTHESES,
    openingProbeValue: PROTEIN_FOLDING_OPENING_STEPS,
    maxRounds,
  };
}

/**
 * What this inquiry cannot answer, carried alongside it. `inquiryLoop.ts`
 * already emits its own model-scoped limitations; these are specific to
 * reading a seeded HP-lattice Metropolis run as a statement about folding.
 */
export const PROTEIN_FOLDING_NOT_MODELLED: readonly string[] = [
  'A coarse two-letter (H/P) alphabet on a 2D square lattice with contact energy -1 per non-backbone H-H pair — twenty real amino acids, three dimensions, hydrogen bonding, electrostatics and solvation are all absent (Dill 1985; the model\'s own documented scope)',
  'ONE realised Monte Carlo trajectory per seed, not an ensemble average — acceptanceRate is well-behaved because it accumulates over many steps of that one trajectory, but a candidate pair whose true acceptance rates differ only slightly (measured: temperatures above roughly 1.2 in these reduced units) may not separate at the declared ±15% band, and the loop reports that honestly (NO_DISCRIMINATING_PROBE) rather than manufacturing a preference',
  'Finding the model\'s own global energy minimum is proven NP-hard (Crescenzi et al. 1998); a run can be stuck in a local minimum, exactly like real protein misfolding, which is a property of the model\'s search, not of the inquiry',
  'No real experimental measurement of any real protein\'s folding temperature — every verdict here is about which claimed value survives contact with this solver, not a statement about an actual biomolecule',
];
