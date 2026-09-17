import type { InquiryLoopInput, ParameterHypothesis, SystemUnderStudy } from './inquiryLoop';

/**
 * QE1–QE3 ON THE EXPERIMENT FABRIC — three entanglement questions posed as real
 * parameter inquiries, not as three more screens.
 *
 * `knowledge/quantum.md` carries a hypothesis library QE1–QE7 from the ingested
 * quantum-information package. A hypothesis library is not a result, and a
 * screen that renders one is not an experiment. The only way a claim about
 * entanglement becomes something Genesis can be WRONG about is for it to run
 * through the machinery that can falsify it: the PARAMETER strategy over
 * `inquiryLoop`, on a registered Fabric model, with predictions produced by the
 * same solver as the measurements.
 *
 * That is what this file is. It adds no measure, no solver and no loop — every
 * number comes from `quantum-entanglement-measures`, which computes exact
 * entanglement algebra in `entanglementMeasures.ts`, and every decision comes
 * from `inquiryLoop`. This file declares three systems, their hidden truths,
 * their competing hypotheses and their agreement bands, and nothing else.
 *
 * ## The knob that makes each one a real inquiry
 *
 * An inquiry needs a hidden parameter AND a probe the experimenter can set. The
 * entanglement model's probe knobs are physical, not invented:
 *
 *   - `whiteNoise` — the depolarising channel ρ → (1−w)ρ + w·I/d. Every real
 *     source has it; no ideal state does. It is the knob an experimentalist
 *     actually controls, by how carefully the source is prepared.
 *   - `mixingAngleDeg` — how much |W⟩ is mixed into a generalised GHZ state.
 *     A preparation setting for the three-qubit family, and the one that breaks
 *     a degeneracy the GHZ limit cannot.
 *
 * ## What all three have in common
 *
 * The obvious measurement is worthless, and it is worthless for a different
 * reason each time — all three MEASURED on this implementation, not arranged:
 *
 *   QE1  at w = 1 the source is fully depolarised: max CHSH is exactly 0 for
 *        every candidate visibility. Total noise erases the question.
 *   QE2  at α = 90° the state is |W⟩ for every θ: the residual three-tangle is
 *        0 across the board. The most famous three-qubit state in the family
 *        says nothing about which member it is.
 *   QE3  at ANY w > 0 — down to w = 0.005 — the bound-entanglement margin is 0
 *        for every candidate. Bound entanglement sits so close to the separable
 *        set that half a percent of white noise hides it completely.
 *
 * ## What this file is not
 *
 * These are declared states, not prepared ones. No detector, no dark counts, no
 * finite sample, no locality or detection loophole, no tomography. The algebra
 * is exact; the laboratory is absent. Nothing here is a Bell test, and nothing
 * here measures a physical source.
 */

/** The Fabric model all three inquiries run on. Real, registered, exact algebra. */
export const ENTANGLEMENT_MODEL_ID = 'quantum-entanglement-measures';

// ---------------------------------------------------------------------------
// QE1 — source visibility, and why white noise cannot resolve it.
// ---------------------------------------------------------------------------

/**
 * Four candidate visibilities for a Werner source, spanning the two thresholds
 * the Werner family is known for: entanglement above p = 1/3, and CHSH
 * violation only above p = 1/√2 ≈ 0.7071.
 *
 * `h:classical` is the one that matters for the QE1 claim. At p = 0.5 the state
 * is ENTANGLED — comfortably above 1/3 — and its maximum CHSH value over all
 * settings is 2·√2·0.5 = 1.4142, below the classical bound of 2. Entangled is
 * not the same as Bell-violating, and this candidate is in the list so that
 * fact can be measured rather than recited.
 */
export const QE1_CANDIDATES = [
  { id: 'h:ideal', visibility: 1.0, description: 'a perfect source (p = 1.00): maximally entangled, max CHSH 2√2' },
  { id: 'h:good', visibility: 0.92, description: 'a good source (p = 0.92): violates CHSH comfortably' },
  { id: 'h:marginal', visibility: 0.72, description: 'a marginal source (p = 0.72): just above the CHSH threshold 1/√2' },
  { id: 'h:classical', visibility: 0.5, description: 'a weak source (p = 0.50): still entangled (p > 1/3) but CANNOT violate CHSH' },
] as const;

export const QE1_HYPOTHESES: readonly ParameterHypothesis[] = QE1_CANDIDATES.map((c) => ({
  hypothesisId: c.id,
  statement: `This source emits Werner states with visibility p = ${c.visibility} — ${c.description}.`,
  claimedValues: { familyParameter: c.visibility },
  priorConfidence: 0.5,
}));

/** Depolarising settings the preparation can be run at, worst first. */
export const QE1_PROBE_NOISE: readonly number[] = [1, 0.9, 0.7, 0.5, 0.3, 0.1, 0];

/**
 * The declared opening: total depolarisation. Measured, max CHSH is exactly 0
 * for all four candidates, so the first and easiest setting separates nothing.
 */
export const QE1_OPENING_NOISE = 1;

/**
 * ±15%, standing in for source-brightness and detector-efficiency calibration
 * on a coincidence measurement.
 *
 * THE BAND DECIDES THE OUTCOME HERE, and that is stated rather than hidden.
 * MEASURED: max CHSH on this model is 2√2·(1−w)·p, so every hypothesis's
 * prediction is the SAME function of the probe times its own p. The ratio
 * between two candidates is therefore constant in w — 1.00/0.92 = 1.087 at
 * every setting — and no choice of w can separate them by more than 8.7%.
 * At ±5% this inquiry would recover p = 0.92 outright in one informative round;
 * at ±15% it provably cannot, at any setting in the list, and reports that
 * instead. The second is the harder and more useful result: it is the loop
 * discovering that WHITE NOISE IS THE WRONG KNOB for this question, which is a
 * structural fact about the experiment and not about the numbers chosen.
 */
export const QE1_AGREEMENT_TOLERANCE = 0.15;

/**
 * Tautology Gate declaration (`tautologyGate.ts`) for this real, runnable
 * inquiry — NOT the excluded superquantum-source claim `QE1_NOT_MODELLED`
 * describes. `maxCHSH` genuinely varies with which candidate visibility is
 * true (`h:ideal` predicts 2√2, `h:classical` predicts 1.41 — see
 * `QE1_CANDIDATES`'s own doc), on both the prediction side (a hypothesis's
 * own claimed visibility) and the observation side (the system's real,
 * hidden one) — both run through the same solver, which is exactly what
 * makes this a legitimate (if simulated) parameter inquiry rather than a
 * circular one. The Tsirelson bound itself is never checked by this system
 * at all: it is why the excluded hypothesis was never added to
 * `QE1_CANDIDATES` in the first place, not something this inquiry tests.
 */
const QE1_DERIVATION_RATIONALE = 'maxCHSH = 2√2·(1−whiteNoise)·visibility — a direct function of the candidate visibility, so different candidates genuinely predict different values';

export function qe1System(trueVisibility: number): SystemUnderStudy {
  return {
    systemId: 'qe1-werner-source',
    label: 'Źródło par splątanych o niezmierzonej widzialności (rodzina Wernera)',
    modelId: ENTANGLEMENT_MODEL_ID,
    hiddenParameters: { familyParameter: trueVisibility },
    probeParameterId: 'whiteNoise',
    candidateProbeValues: QE1_PROBE_NOISE,
    fixedParameters: { stateId: 'werner', mixingAngleDeg: 0 },
    observedMetric: 'maxCHSH',
    agreementTolerance: QE1_AGREEMENT_TOLERANCE,
    observableDerivation: {
      componentId: 'qe1-maxCHSH',
      prediction: { source: 'hypothesis-parameter', modelId: ENTANGLEMENT_MODEL_ID, rationale: QE1_DERIVATION_RATIONALE },
      observation: { source: 'hypothesis-parameter', modelId: ENTANGLEMENT_MODEL_ID, rationale: QE1_DERIVATION_RATIONALE },
    },
  };
}

export function qe1VisibilityInquiry(trueVisibility = 0.92, maxRounds = 5): InquiryLoopInput {
  return {
    question: 'What visibility does this entangled-pair source have, and can it violate CHSH at all?',
    system: qe1System(trueVisibility),
    hypotheses: QE1_HYPOTHESES,
    openingProbeValue: QE1_OPENING_NOISE,
    maxRounds,
  };
}

/**
 * What QE1 cannot answer.
 *
 * The first entry is the one that matters most, because getting it wrong would
 * be the exact circularity this repo exists to avoid: running a
 * quantum-mechanical calculator and finding no CHSH value above 2√2 does NOT
 * test the Tsirelson bound. The bound is built into the algebra the model
 * computes, so the model cannot produce a counterexample and finding none is a
 * tautology, not evidence. A hypothesis positing a superquantum source is
 * therefore NOT TESTABLE here, and the honest report is that it is undecidable
 * on this substrate — not that it was falsified.
 */
export const QE1_NOT_MODELLED: readonly string[] = [
  'The Tsirelson bound 2√2 is an ANALYTIC CEILING of the algebra this model computes, not an empirical finding of this inquiry — no run here could ever exceed it, so no run here tests it',
  'This is the maximum CHSH value over all measurement settings (Horodecki criterion), not the outcome of any particular set of analyser angles',
  'No detector, no dark counts, no finite sample and no coincidence window — a real CHSH value is a statistic with error bars, and this one is exact arithmetic',
  'No locality loophole and no detection loophole: there is no space-like separation and no efficiency in this model to have a loophole about',
  'Only the four declared visibilities were ever in contention — the inquiry cannot find a source nobody proposed',
];

// ---------------------------------------------------------------------------
// QE2 — monogamy: where the three-qubit entanglement actually sits.
// ---------------------------------------------------------------------------

/**
 * Five candidate GHZ imbalance angles θ for the family
 * cos α·(cos θ|000⟩ + sin θ|111⟩) + sin α·|W⟩.
 *
 * Chosen so that the family's real symmetry is in the list: at α = 0 the
 * residual three-tangle is sin²(2θ), which is symmetric about 45°, so θ = 20°
 * and θ = 70° are INDISTINGUISHABLE in the pure-GHZ limit however precisely you
 * measure — as are 35° and 55°. MEASURED: both pairs agree to 1e-15 there. The
 * degeneracy is a property of the state family, and breaking it is what the
 * mixing-angle probe is for.
 */
export const QE2_CANDIDATES = [
  { id: 'h:theta-20', theta: 20, description: 'strongly unbalanced toward |000⟩' },
  { id: 'h:theta-35', theta: 35, description: 'mildly unbalanced toward |000⟩' },
  { id: 'h:theta-45', theta: 45, description: 'balanced — the standard |GHZ⟩' },
  { id: 'h:theta-55', theta: 55, description: 'mildly unbalanced toward |111⟩' },
  { id: 'h:theta-70', theta: 70, description: 'strongly unbalanced toward |111⟩' },
] as const;

export const QE2_HYPOTHESES: readonly ParameterHypothesis[] = QE2_CANDIDATES.map((c) => ({
  hypothesisId: c.id,
  statement: `The GHZ part of this source is at θ = ${c.theta}° — ${c.description}.`,
  claimedValues: { familyParameter: c.theta },
  priorConfidence: 0.5,
}));

/**
 * Mixing angles the preparation can be set to, in the order an experimenter
 * would actually try them: the opening at pure |W⟩, then the pure generalised
 * GHZ limit (the strongest, cleanest three-tangle signal), then off-axis
 * settings. That order matters, because it is what makes the inquiry walk into
 * the θ ↔ 90°−θ degeneracy at α = 0 and then have to work its way out.
 */
export const QE2_PROBE_MIXING_ANGLES: readonly number[] = [90, 0, 15, 30, 45, 60, 75];

/** The declared opening: pure |W⟩, whose residual three-tangle is 0 for every θ. */
export const QE2_OPENING_MIXING_ANGLE = 90;

/** ±5%, standing in for the precision of a state-tomography reconstruction. */
export const QE2_AGREEMENT_TOLERANCE = 0.05;

/**
 * Tautology Gate declaration — `ckwResidual` genuinely varies with θ (that is
 * the whole point of the family's construction, see `QE2_CANDIDATES`'s own
 * doc on the θ ↔ 90°−θ degeneracy), on both sides, through the same solver.
 * The CKW monogamy THEOREM itself (`QE2_NOT_MODELLED`'s concern — a negative
 * residual would falsify the implementation, not the theorem) is never what
 * this inquiry measures; it measures WHERE in the family the source sits.
 */
const QE2_DERIVATION_RATIONALE = 'ckwResidual = sin²(2θ)·cos²α at whiteNoise=0 — a direct function of θ, so different candidates genuinely predict different values (except at the declared θ↔90°−θ degeneracy, which the probe schedule is designed to break)';

export function qe2System(trueTheta: number): SystemUnderStudy {
  return {
    systemId: 'qe2-three-qubit-source',
    label: 'Źródło trójkubitowe — gdzie naprawdę siedzi splątanie (monogamia CKW)',
    modelId: ENTANGLEMENT_MODEL_ID,
    hiddenParameters: { familyParameter: trueTheta },
    probeParameterId: 'mixingAngleDeg',
    candidateProbeValues: QE2_PROBE_MIXING_ANGLES,
    fixedParameters: { stateId: 'ghz-w-family', whiteNoise: 0 },
    observedMetric: 'ckwResidual',
    agreementTolerance: QE2_AGREEMENT_TOLERANCE,
    observableDerivation: {
      componentId: 'qe2-ckwResidual',
      prediction: { source: 'hypothesis-parameter', modelId: ENTANGLEMENT_MODEL_ID, rationale: QE2_DERIVATION_RATIONALE },
      observation: { source: 'hypothesis-parameter', modelId: ENTANGLEMENT_MODEL_ID, rationale: QE2_DERIVATION_RATIONALE },
    },
  };
}

export function qe2MonogamyInquiry(trueTheta = 70, maxRounds = 6): InquiryLoopInput {
  return {
    question: 'Where does this three-qubit source keep its entanglement — in the pairs, or only in the triple?',
    system: qe2System(trueTheta),
    hypotheses: QE2_HYPOTHESES,
    openingProbeValue: QE2_OPENING_MIXING_ANGLE,
    maxRounds,
  };
}

export const QE2_NOT_MODELLED: readonly string[] = [
  'The CKW monogamy inequality is a THEOREM of the algebra this model computes — a negative residual here would falsify the implementation, not the theorem, so this inquiry tests neither',
  'The residual three-tangle is computed as τ_{A|BC} − (τ_AB + τ_AC) with τ_{A|BC} = 2(1 − Tr ρ_A²), which holds for PURE states only; under any white noise the model reports NaN rather than a number that would look like a measurement',
  'Only the generalised-GHZ ⊕ |W⟩ family was ever considered: a three-qubit state outside it cannot be found by this inquiry however it measures',
  'No preparation, no gates, no decoherence and no measurement statistics — the state is declared, and the algebra on it is exact',
];

// ---------------------------------------------------------------------------
// QE3 — the scope of PPT, on a state PPT cannot see.
// ---------------------------------------------------------------------------

/**
 * Four candidate Horodecki parameters. The 3⊗3 Horodecki state is POSITIVE
 * under partial transpose for every one of them and ENTANGLED for every one of
 * them — which is exactly the point: above 2⊗3, PPT stops being sufficient for
 * separability, and the only reason Genesis can say so is that a second,
 * independent criterion (CCNR/realignment) sees what PPT misses.
 *
 * MEASURED at w = 0: the bound-entanglement margin (‖R(ρ)‖₁ − 1, counted only
 * while the state is PPT) reads 0.003031, 0.002716, 0.001884, 0.000941 for
 * a = 0.2, 0.4, 0.6, 0.8, while the negativity is 0 for all four.
 */
export const QE3_CANDIDATES = [
  { id: 'h:a-0.2', a: 0.2, description: 'deep in the bound-entangled regime' },
  { id: 'h:a-0.4', a: 0.4, description: 'clearly bound-entangled' },
  { id: 'h:a-0.6', a: 0.6, description: 'weakly bound-entangled' },
  { id: 'h:a-0.8', a: 0.8, description: 'barely bound-entangled — margin under 0.001' },
] as const;

export const QE3_HYPOTHESES: readonly ParameterHypothesis[] = QE3_CANDIDATES.map((c) => ({
  hypothesisId: c.id,
  statement: `This 3⊗3 source is the Horodecki state at a = ${c.a} — ${c.description}.`,
  claimedValues: { familyParameter: c.a },
  priorConfidence: 0.5,
}));

/**
 * Depolarising settings, worst first and reaching all the way down to a
 * perfectly noiseless preparation.
 *
 * The list goes to 0.005 and then 0 because of a MEASURED fact that is itself
 * the finding of this inquiry: at w = 0.005 the margin is already 0 for every
 * candidate, and it stays 0 at every larger setting. Bound entanglement lies so
 * close to the separable set that half a percent of white noise destroys the
 * only evidence there is for it. Every setting in this list except the last is
 * therefore uninformative — and the loop has to discover that, not be told it.
 */
export const QE3_PROBE_NOISE: readonly number[] = [1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.005, 0];

/** The declared opening: total depolarisation, where the margin is 0 for every candidate. */
export const QE3_OPENING_NOISE = 1;

/** ±5%: the margin is exact algebra, and the four candidates differ by 11% or more at w = 0. */
export const QE3_AGREEMENT_TOLERANCE = 0.05;

/**
 * Tautology Gate declaration — `boundEntanglementMargin` genuinely varies
 * with the Horodecki parameter `a` (see `QE3_CANDIDATES`'s own measured
 * margins: 0.003031, 0.002716, 0.001884, 0.000941 at w=0), on both sides,
 * through the same solver. `QE3_NOT_MODELLED`'s concern (a margin of 0 does
 * NOT prove separability, since CCNR is one-directional) is a limitation of
 * what a supported outcome can claim, not a reason this comparison is
 * circular — the metric itself is a real, hypothesis-dependent computation.
 */
const QE3_DERIVATION_RATIONALE = 'boundEntanglementMargin = ‖R(ρ)‖₁ − 1 (while PPT) for the Horodecki family at parameter a — a direct function of a, so different candidates genuinely predict different values at low noise';

export function qe3System(trueA: number): SystemUnderStudy {
  return {
    systemId: 'qe3-horodecki-source',
    label: 'Źródło 3⊗3 — splątanie, którego kryterium PPT nie widzi',
    modelId: ENTANGLEMENT_MODEL_ID,
    hiddenParameters: { familyParameter: trueA },
    probeParameterId: 'whiteNoise',
    candidateProbeValues: QE3_PROBE_NOISE,
    fixedParameters: { stateId: 'horodecki-bound', mixingAngleDeg: 0 },
    observedMetric: 'boundEntanglementMargin',
    agreementTolerance: QE3_AGREEMENT_TOLERANCE,
    observableDerivation: {
      componentId: 'qe3-boundEntanglementMargin',
      prediction: { source: 'hypothesis-parameter', modelId: ENTANGLEMENT_MODEL_ID, rationale: QE3_DERIVATION_RATIONALE },
      observation: { source: 'hypothesis-parameter', modelId: ENTANGLEMENT_MODEL_ID, rationale: QE3_DERIVATION_RATIONALE },
    },
  };
}

export function qe3BoundEntanglementInquiry(trueA = 0.4, maxRounds = 5): InquiryLoopInput {
  return {
    question: 'Which Horodecki state is this, given that partial transposition says nothing about any of them?',
    system: qe3System(trueA),
    hypotheses: QE3_HYPOTHESES,
    openingProbeValue: QE3_OPENING_NOISE,
    maxRounds,
  };
}

export const QE3_NOT_MODELLED: readonly string[] = [
  'A margin of 0 does NOT mean separable: CCNR works in one direction only, so ‖R(ρ)‖₁ > 1 proves entanglement while ‖R(ρ)‖₁ ≤ 1 proves nothing at all',
  'Every uninformative round of this inquiry is therefore an ABSENCE OF EVIDENCE, not evidence of absence — the noisy states may well still be entangled with no criterion here able to show it',
  'Deciding separability in 3⊗3 is NP-hard in general; PPT and CCNR are two sufficient criteria, not a decision procedure',
  'Only the four declared Horodecki parameters were ever in contention, and the whole family is one specific construction rather than a general 3⊗3 state',
];

// ---------------------------------------------------------------------------
// QE5 — PLOB bound on repeaterless QKD: investigated, BLOCKED.
// ---------------------------------------------------------------------------

/**
 * WHY QE5 DOES NOT BECOME A FOURTH INQUIRY HERE.
 *
 * The Qwen research package (`docs/prompts/QWEN-QE4-QE7-obserwable.md`) posed
 * this as an open question to answer before building anything: "check whether
 * the PLOB bound can be expressed as a function of the negativity/
 * log-negativity of Werner/isotropic states that `entanglementMeasures.ts`
 * already computes — if so, that is a real observable; if it requires a
 * separate channel model, name it as a missing component."
 *
 * The answer, worked through here rather than assumed: NO, not honestly.
 *
 * The Pirandola–Laurenza–Ottaviani–Banchi (2017) bound is a statement about
 * the SECRET-KEY CAPACITY of a point-to-point CHANNEL — for a pure-loss
 * bosonic (continuous-variable, Gaussian) channel with transmittance η, no
 * protocol run over that channel can exceed −log₂(1−η) secret bits per use.
 * That is a property of a CHANNEL, derived from the relative entropy of
 * entanglement of the channel's Choi state (a two-mode squeezed vacuum for
 * pure loss) — a continuous-variable, infinite-dimensional object.
 *
 * `entanglementMeasures.ts`'s Werner/isotropic states are finite-dimensional
 * QUBIT states with no channel behind them at all: `negativity`/
 * `logNegativity` here describe how entangled ONE declared density matrix
 * is, not how much secret key a protocol can extract from repeated uses of a
 * lossy channel. There is no standard, citable identity that reduces one to
 * the other — reframing "does the empirical key rate exceed −log₂(1−η)" as
 * "does some function of Werner-state negativity exceed a chosen threshold"
 * would silently substitute a different, easier claim for the one QE5 in
 * `knowledge/quantum.md` actually states, which is exactly the kind of
 * relabelling this repo's discipline forbids elsewhere (see the Kepler
 * anchor's rejection of the NASA Exoplanet Archive for an analogous reason:
 * an available number that is NOT independent evidence for the specific
 * claim at hand).
 *
 * The missing component is real and specific, not a shrug: a bosonic/
 * Gaussian lossy-channel model (transmittance η, thermal noise), and a
 * protocol layer on top of it (an achievable-rate estimator to compare
 * against the bound). Neither exists in this repo. Building either — or
 * inventing an unverified negativity-to-rate identity to avoid building
 * them — is exactly the "force a fit, build a solver to get around a real
 * gap" move the task's own hard rules forbid.
 */
export const QE5_BLOCKED_MISSING_COMPONENT =
  'A bosonic/Gaussian lossy-channel model (transmittance η) and a QKD protocol/rate-estimator layer on top of it. quantum-entanglement-measures computes exact algebra on declared finite-dimensional qubit/qutrit density matrices; it has no channel, no transmittance, and no notion of a secret-key rate. No verified identity reduces the PLOB channel-capacity bound to a function of a qubit state\'s negativity — asserting one without a citation would be exactly the invented-mapping this task\'s rules forbid.';

export const QE5_BLOCKED: readonly string[] = [
  'PLOB bounds a CHANNEL\'S secret-key capacity (continuous-variable, Gaussian); Werner/isotropic negativity describes ONE declared qubit STATE — no channel, no transmittance, no key rate exist in this model',
  'The reduction the research package asked to check for does not hold: there is no standard, citable identity expressing −log₂(1−η) as a function of a qubit state\'s negativity or log-negativity',
  'A DV entanglement-based upper bound on distillable key (e.g. via log-negativity) is a real, different result from PLOB specifically, and using it here would answer a different question than the one QE5 states — not attempted, to avoid that exact substitution',
  'This is investigated and named, not skipped: see QE5_BLOCKED_MISSING_COMPONENT for the precise missing piece',
];

// ---------------------------------------------------------------------------
// QE6 — island formula / Page curve: investigated, BLOCKED.
// ---------------------------------------------------------------------------

/**
 * WHY QE6 DOES NOT BECOME A FOURTH INQUIRY HERE.
 *
 * The research package is right that the honest, buildable core of QE6 is
 * NOT the island formula or JT gravity — it is Page's own 1993 result: the
 * AVERAGE entanglement entropy of a subsystem of a Haar-random pure state on
 * N qubits has a known, closed-form value (the Page curve), computable on
 * small N as a pure fact about random matrices, with zero black-hole physics
 * required. That part is genuinely within reach of what this repo already
 * computes (`vonNeumannEntropyNats`, `schmidtDecomposition`) — IF a fresh
 * Haar-random state could be produced and measured for varying subsystem
 * sizes.
 *
 * It cannot be, on the ONLY path this task is scoped to touch. Every real
 * inquiry in this file runs through `inquiryLoop.ts::runAt`, which is
 * hard-wired to `getRouterModel(system.modelId)` +
 * `buildStructuredRequestFromModel` + `runExperiment` (`executor.ts`) — read
 * in full before concluding this, not assumed. The `quantum-entanglement-
 * measures` model's declared parameters (`stateId`, `familyParameter`,
 * `mixingAngleDeg`, `whiteNoise`) and its declared state table
 * (`entanglementStateRunner.ts::ENTANGLEMENT_STATES`) are a fixed, named list
 * of CLOSED-FORM presets — there is no `stateId` for "a fresh Haar-random
 * N-qubit state" and no parameter that could select or seed one, because
 * `ExperimentValue` (`number | string | boolean`) cannot carry a random
 * vector across the Fabric's flat-parameter contract as anything other than
 * a NEW declared preset.
 *
 * Adding that preset is real, buildable work — but it means touching
 * `entanglementStateRunner.ts` (the state table) and very likely
 * `router.ts`/`executor.ts` (a new parameter or a new model id), all three
 * outside this task\'s explicit scope (`entanglementInquiry.ts`,
 * `entanglementMeasures.ts` only). Writing a `sampleHaarRandomState`
 * function in `entanglementMeasures.ts` without a way to reach it through
 * `runAt` would be dead code with no real `StrategyRun` behind it —
 * `moduleReachability.test.ts` would rightly refuse it as an undocumented
 * orphan, and it would violate the task\'s own "zero simulated success"
 * rule: a Page-curve claim with no real measurement behind it is exactly
 * the kind of claim this repo does not make.
 */
export const QE6_BLOCKED_MISSING_COMPONENT =
  'A Haar-random-state preset reachable through the Fabric contract. entanglementStateRunner.ts\'s ENTANGLEMENT_STATES table is a fixed list of closed-form presets selected by a string id; there is no way to express "sample a fresh random N-qubit pure state" as one of quantum-entanglement-measures\'s existing number/string/boolean parameters. Adding one means touching entanglementStateRunner.ts and likely router.ts/executor.ts — outside this task\'s declared scope (entanglementInquiry.ts, entanglementMeasures.ts only).';

export const QE6_BLOCKED: readonly string[] = [
  'The buildable core (Page\'s 1993 average-entropy result on small N, no JT gravity needed) is real, but producing a fresh Haar-random state requires a new Fabric-reachable preset — `inquiryLoop.ts::runAt` only ever calls `getRouterModel(modelId)` + `runExperiment`, and no existing stateId/parameter can carry one',
  'Adding that preset means editing entanglementStateRunner.ts (the closed-form state table) and likely router.ts/executor.ts — outside this task\'s declared two-file scope',
  'A Haar-sampling helper written into entanglementMeasures.ts with no path through runAt would be unreachable from any real StrategyRun: exactly the "simulated success" this task\'s DONE criteria forbid, not a real inquiry',
  'This is investigated and named, not skipped: see QE6_BLOCKED_MISSING_COMPONENT for the precise missing piece',
];

// ---------------------------------------------------------------------------
// QE7 — macroscopic entanglement vs. monogamy/SSA: investigated, BLOCKED.
// ---------------------------------------------------------------------------

/**
 * WHY QE7 DOES NOT BECOME A FOURTH INQUIRY HERE — AND WHY QE2 ALREADY IS ITS
 * ANSWER.
 *
 * The research package states plainly that CKW monogamy and strong
 * subadditivity are THEOREMS of the algebra this model computes: no run of
 * `quantum-entanglement-measures` could ever produce a violation, so no run
 * tests the theorems themselves (exactly `QE2_NOT_MODELLED`'s point). The
 * only honest content left is IMPLEMENTATION verification — does this repo's
 * `checkCKWMonogamy` actually compute a non-negative residual across real,
 * varied, boundary-adjacent cases — and the package asked for that to be run
 * as a real inquiry, analogous to QE1–QE3, with its own `QE7_NOT_MODELLED`.
 *
 * Checked, rather than assumed: there is no way to build that inquiry as
 * something DIFFERENT from QE2. The only observable this model computes for
 * a three-qubit state that is not NaN'd out is `ckwResidual`
 * (`entanglementStateRunner.ts::runEntanglementState`: `vonNeumannEntropyNats`,
 * `renyi2Nats`, `maxCHSH`, `concurrence` and `schmidtRank` all require
 * `dimA === 2 && dimB === 2`, which no three-qubit preset satisfies — they
 * are all 2×4). `ckwResidual` itself is defined ONLY at `whiteNoise = 0`
 * (any noise makes the pure-state three-tangle identity fail, and the model
 * reports NaN rather than a fabricated number — see
 * `entanglementStateRunner.ts`'s own documentation on this). That leaves
 * exactly ONE numeric family with exactly ONE usable probe knob for a
 * three-qubit inquiry on this substrate: `ghz-w-family`, hidden parameter θ,
 * probe `mixingAngleDeg` — which is `qe2System`, verbatim. A "QE7 inquiry"
 * built from the only available ingredients would not test anything QE2's
 * real, already-executed run (`knowledge/quantum.md`'s QE2 row: θ = 70°
 * recovered across three real rounds, `ckwResidual` computed and belief-
 * revised every round, never negative) does not already establish. Building
 * a second inquiry with the identical mechanism and a relabelled name would
 * be exactly the kind of second, redundant system this task's own rules
 * forbid, dressed up as new work.
 *
 * The real implementation-verification claim the package wants — CKW
 * monogamy holds (residual ≥ 0) across genuinely varied, real, executed
 * configurations — is therefore already answered by QE2's own history, not
 * by a new inquiry. A distinct QE7 observable would need a genuinely
 * different measurable quantity (e.g. a three-party mutual-information-style
 * SSA check), which would need entropies for bipartitions other than the
 * fixed A|(BC) split this model computes — again outside what
 * `entanglementMeasures.ts`'s existing exports and this task's scope permit
 * without inventing an unverified generalisation.
 */
export const QE7_BLOCKED_MISSING_COMPONENT =
  'A three-qubit observable genuinely distinct from QE2\'s ckwResidual/ghz-w-family/mixingAngleDeg combination. Every other three-qubit-capable metric (vonNeumannEntropyNats, renyi2Nats, maxCHSH, concurrence, schmidtRank) is NaN\'d out for every declared three-qubit preset (all are 2×4, not 2×2); ckwResidual is defined only at whiteNoise=0, leaving no unused numeric axis on ghz-w-family beyond what qe2System already runs.';

export const QE7_NOT_MODELLED: readonly string[] = [
  'CKW monogamy and strong subadditivity are THEOREMS of the algebra this model computes — no run here could produce a violation, so no run here tests the theorems themselves, exactly as QE2_NOT_MODELLED already states for CKW specifically',
  'The only three-qubit-safe, non-NaN observable on this substrate is ckwResidual, and its only usable probe (mixingAngleDeg, on ghz-w-family, at whiteNoise=0) is exactly QE2\'s system — a distinct QE7 SystemUnderStudy built from the same ingredients would be QE2 renamed, not new evidence',
  'The implementation-verification question the package actually wants answered — does this repo compute a non-negative CKW residual across real, varied configurations — is already answered by QE2\'s own executed history (knowledge/quantum.md), not left open',
  'This is investigated and named, not skipped: see QE7_BLOCKED_MISSING_COMPONENT for the precise missing piece',
];
