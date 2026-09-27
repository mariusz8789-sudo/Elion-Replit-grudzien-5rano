import { canonicalJson, fnv1a } from '../events/hash';
import { ALL_SELF_FALSIFICATION_PROBES, type SelfFalsificationProbeName, type SelfFalsificationProbeResult } from '../agent/discoveryContracts';
import { multipleTestingProbe, probe, structuralProbe } from '../agent/selfFalsificationBattery';
import { buildDrugHypothesis, evaluateDrugHypothesis, getDrugHypothesis, nextDrugExperiment } from './drugHypothesis';
import { zoneOf } from './drugBenchLayout';
import { targetAnatomy } from './targetAnatomy';
import type { LiveDrugRun } from './liveDrugRun';

/**
 * GENESIS TRIES TO OVERTURN ITS OWN FINALIST (D-148).
 *
 * A candidate reaching the finalists' stand is NOT a success announcement. The moment it does, the
 * bench runs the 13 self-falsification probes of Phase F (`selfFalsificationBattery.ts`, the same
 * names, verdicts and rules the #/discovery-track screen shows) over what THIS run genuinely
 * declares, lists what is still unknown, and names the next experiment from the existing
 * next-experiment logic (`drugHypothesis.ts::nextDrugExperiment`).
 *
 * What the run declares is read from persisted records only:
 *   - HIDDEN_PREREG: the server's preregistration record (written before the first engine ran —
 *     the server refuses one for an executed campaign) and its own check of the sealed session.
 *   - MULTIPLE_TESTING: how many candidates were docked (each a test of "this analog binds") and
 *     the fact that no correction is declared anywhere in the run — the battery's own rule decides.
 *   - PREPROCESSING_ARTIFACT: the receptor/source/pose checksums and the Meeko version the
 *     RECEPTOR_PREPARED record and the Science Run carry.
 * Every other probe needs something the run does not hold (a fitted model, points, a rival model,
 * a replication dataset, a caller's structural declaration) and is reported UNRESOLVED with the
 * battery's own reason — never assumed clean. The 13 probes always all appear, never a subset.
 */

export type FinalistProbeVerdict = SelfFalsificationProbeResult['result'];

export interface FinalistProbe {
  readonly id: SelfFalsificationProbeName;
  readonly labelPl: string;
  readonly method: SelfFalsificationProbeResult['method'];
  readonly verdict: FinalistProbeVerdict;
  /** The battery's own detail text, or the run-specific reason for a declared probe. */
  readonly reason: string;
  /** Which persisted record the declaration was read from; null when the probe is undeclared. */
  readonly declaredFrom: string | null;
}

export interface FinalistUnknown {
  readonly id: string;
  readonly labelPl: string;
  readonly detail: string;
  readonly kind: 'PROBE_UNRESOLVED' | 'CRITERION_UNRESOLVED' | 'NOT_VALIDATED';
}

export interface FinalistNextExperiment {
  /** The probe this experiment would resolve, or 'HYPOTHESIS' for the run's own next step. */
  readonly probeId: SelfFalsificationProbeName | 'HYPOTHESIS';
  readonly labelPl: string;
  readonly whatItWouldResolve: string;
  readonly source: 'drugHypothesis.ts::nextDrugExperiment' | 'selfFalsificationBattery.ts declaration field';
}

export interface ResolvedFinalistFalsification {
  readonly status: 'RESOLVED';
  readonly candidateId: string;
  readonly smiles: string;
  readonly dockingScore: number | null;
  readonly probes: readonly FinalistProbe[];
  readonly counts: Readonly<Record<FinalistProbeVerdict, number>>;
  readonly unknowns: readonly FinalistUnknown[];
  readonly nextExperiments: readonly FinalistNextExperiment[];
  /** The verdict the frozen criteria give, from drugHypothesis.ts — shown, never promoted to "success". */
  readonly hypothesisVerdict: string;
  readonly hypothesisSource: 'REGISTERED' | 'DEFAULT_CRITERIA';
  readonly sealed: { readonly recordId: string | null; readonly chainHash: string | null; readonly check: string | null } | null;
  readonly stateHash: string;
  /** fnv1a over the probe verdicts + unknown ids + next-experiment ids: the same input gives the same panel. */
  readonly reportFingerprint: string;
}

export type NotApplicableReason = 'NO_RUN' | 'NO_CANDIDATE' | 'CANDIDATE_NOT_FINALIST';

export interface NotApplicableFinalistFalsification {
  readonly status: 'NOT_APPLICABLE';
  readonly reason: NotApplicableReason;
  readonly candidateId: string | null;
}

export type FinalistFalsification = ResolvedFinalistFalsification | NotApplicableFinalistFalsification;

export const FINALIST_FALSIFICATION_CAVEAT_PL = 'Genesis nie ogłasza sukcesu. To, co poniżej, to próba obalenia własnego wyniku.';
export const FINALIST_FALSIFICATION_TITLE_PL = 'Genesis próbuje obalić własny wynik';
export const DRUG_EFFECT_NOT_COMPUTED_PL = 'Efekt leku w tym narządzie: nie policzony';

export const FINALIST_PROBE_LABEL_PL: Readonly<Record<SelfFalsificationProbeName, string>> = {
  LEAKAGE: 'Wyciek danych',
  SELECTION_BIAS: 'Błąd selekcji',
  MULTIPLE_TESTING: 'Wielokrotne testowanie',
  OVERFITTING: 'Przeuczenie',
  HIDDEN_PREREG: 'Ukryta prerejestracja',
  DATASET_CONTAMINATION: 'Kontaminacja zbiorów',
  TAUTOLOGY: 'Tautologia',
  CONFOUNDING: 'Zmienne zakłócające',
  ALTERNATIVE_MODEL: 'Model alternatywny',
  MEASUREMENT_ARTIFACT: 'Artefakt pomiarowy',
  NUMERICAL_ARTIFACT: 'Artefakt numeryczny',
  PREPROCESSING_ARTIFACT: 'Artefakt przetwarzania wstępnego',
  TEMPORAL_LEAKAGE: 'Wyciek czasowy',
};

/**
 * For every probe, the input the battery would need to move it off UNRESOLVED — read from the
 * battery's own `SelfFalsificationInput`/`StructuralDeclaration` field names, so the "next
 * experiment" for a probe is the missing input, not invented prose.
 */
const PROBE_RESOLVER_PL: Readonly<Record<SelfFalsificationProbeName, string>> = {
  LEAKAGE: 'deklaracja `leakageChecked`: sprawdzenie wycieku między zbiorem odkrycia a zbiorem replikacji (tu: między generacją analogów a ich oceną)',
  SELECTION_BIAS: 'deklaracja `representativeSampling`: czy zbiór analogów RDKit reprezentuje przestrzeń chemiczną, z której wybrano finalistę',
  MULTIPLE_TESTING: 'więcej niż jeden zadokowany kandydat wymaga zadeklarowanej korekty (`multipleTestingCorrectionApplied`)',
  OVERFITTING: 'zbiór punktów i model (`points`, `hypothesisSpec`) — niezależne pomiary powinowactwa dla serii analogów, aby był możliwy podział hold-out',
  HIDDEN_PREREG: 'rekord prerejestracji na serwerze (`freeze`) i sprawdzenie zapieczętowanej sesji wobec niego',
  DATASET_CONTAMINATION: 'rozłączny zbiór replikacji (`replicationDataset`): docking tego samego finalisty w niezależnym przebiegu / innej strukturze celu',
  TAUTOLOGY: 'komponenty dla `tautologyGate`: przewidywanie i obserwacja z zadeklarowanym pochodzeniem (pomiar niezależny od funkcji oceniającej Vina)',
  CONFOUNDING: 'deklaracja `knownUncontrolledConfounders`: lista znanych, niekontrolowanych czynników (np. sztywny receptor, jedna konformacja)',
  ALTERNATIVE_MODEL: 'model rywalizujący (`rivalSpec`): np. wynik dokowania losowego analogu / dekoju wobec tego samego receptora',
  MEASUREMENT_ARTIFACT: 'deklaracja `measurementInstrumentValidated`: walidacja funkcji oceniającej wobec niezależnego odniesienia (zmierzone powinowactwo)',
  NUMERICAL_ARTIFACT: 'deklaracja `numericalPrecisionChecked`: sprawdzenie stabilności wyniku Vina (ziarno, exhaustiveness) dla tej wielkości efektu',
  PREPROCESSING_ARTIFACT: 'sumy kontrolne receptora, źródła i pozy oraz wersja Meeko w rekordzie RECEPTOR_PREPARED / Science Run',
  TEMPORAL_LEAKAGE: 'deklaracja `temporalOrderingRespected`: żadna informacja z oceny nie wpłynęła na wcześniejszy krok generacji',
};

const notApplicable = (reason: NotApplicableReason, candidateId: string | null): NotApplicableFinalistFalsification => ({ status: 'NOT_APPLICABLE', reason, candidateId });

/** Pure: the run and the candidate id are the only inputs; the same run gives the same report. */
export function finalistFalsification(run: LiveDrugRun | null, candidateId: string): FinalistFalsification {
  if (!run) return notApplicable('NO_RUN', candidateId);
  const state = run.state;
  const candidate = state.candidates.find((c) => c.id === candidateId) ?? null;
  if (!candidate) return notApplicable('NO_CANDIDATE', candidateId);
  if (zoneOf(candidate) !== 'FINALIST') return notApplicable('CANDIDATE_NOT_FINALIST', candidateId);

  // --- Declarations read from the run's persisted records ------------------------------------------
  const prereg = run.preregistration;
  const sealed = run.sealed;
  let hiddenPrereg: SelfFalsificationProbeResult;
  let hiddenPreregFrom: string | null = null;
  if (prereg?.status === 'REFUSED') {
    hiddenPrereg = probe('HIDDEN_PREREG', 'DETERMINISTIC_PROBE', 'FAIL', `The server refused the preregistration (${prereg.error ?? 'no reason recorded'}) — no criteria were frozen before the engines ran.`);
    hiddenPreregFrom = 'preregistration record (REFUSED)';
  } else if (prereg?.recordId && sealed?.check === 'MATCH') {
    hiddenPrereg = probe('HIDDEN_PREREG', 'DETERMINISTIC_PROBE', 'PASS', `Preregistration ${prereg.recordId} was stored by the server before the first engine ran (the server refuses one for an executed campaign); the sealed session ${sealed.recordId ?? ''} was checked by the server against it: MATCH.`);
    hiddenPreregFrom = `preregistration ${prereg.recordId} + sealed session check`;
  } else if (prereg?.recordId && sealed?.check && sealed.check !== 'MATCH') {
    hiddenPrereg = probe('HIDDEN_PREREG', 'DETERMINISTIC_PROBE', 'FAIL', `Preregistration ${prereg.recordId} exists, but the server's check of the sealed session against it is ${sealed.check}, not MATCH.`);
    hiddenPreregFrom = `preregistration ${prereg.recordId} + sealed session check`;
  } else {
    hiddenPrereg = probe('HIDDEN_PREREG', 'DETERMINISTIC_PROBE', 'UNRESOLVED', prereg?.recordId
      ? `Preregistration ${prereg.recordId} exists, but the server has not yet checked a sealed session against it.`
      : 'No preregistration record in this run yet — the freeze cannot be verified.');
  }

  const docked = state.candidates.filter((c) => c.stages.docking && c.stages.docking.value !== null);
  // The run declares no multiple-comparisons correction anywhere; the battery's rule decides from the count.
  const multipleTesting = multipleTestingProbe(docked.length, false);
  const multipleTestingFrom = `${docked.length} docked candidate(s) in the run's STAGE_RESULT records; no correction declared`;

  const target = state.target;
  const pose = candidate.pose;
  const preprocessingDocumented = Boolean(target && target.receptorPdbqtSha256 && target.sourceSha256 && target.meekoVersion && pose?.poseSha256 && candidate.stages.docking?.runId);
  const preprocessing = structuralProbe(
    'PREPROCESSING_ARTIFACT',
    preprocessingDocumented ? true : null,
    `Receptor PDBQT sha256 ${target?.receptorPdbqtSha256.slice(0, 12)}…, source sha256 ${target?.sourceSha256.slice(0, 12)}…, Meeko ${target?.meekoVersion}, pose sha256 ${pose?.poseSha256.slice(0, 12)}… and Science Run ${candidate.stages.docking?.runId} are all on record.`,
    'Preprocessing steps declared NOT documented.',
  );
  const preprocessingFrom = preprocessingDocumented ? `RECEPTOR_PREPARED record + Science Run ${candidate.stages.docking?.runId}` : null;

  // --- Probes the run cannot declare: the battery's own reasons ------------------------------------
  const undeclared: Readonly<Record<string, SelfFalsificationProbeResult>> = {
    TAUTOLOGY: probe('TAUTOLOGY', 'DETERMINISTIC_PROBE', 'UNRESOLVED', 'No prediction/observation components with a declared derivation were supplied — tautologyGate.ts::assessTautology cannot classify a bare Vina score.'),
    OVERFITTING: probe('OVERFITTING', 'STATISTICAL_TEST', 'UNRESOLVED', `Too few points for an honest hold-out split — ${docked.length} docking measurement(s), no fitted model; cannot rule out overfitting from this sample.`),
    ALTERNATIVE_MODEL: probe('ALTERNATIVE_MODEL', 'STATISTICAL_TEST', 'UNRESOLVED', 'No rival model declared — nothing to compare the claimed binding against (e.g. a decoy docked to the same receptor).'),
    DATASET_CONTAMINATION: probe('DATASET_CONTAMINATION', 'DETERMINISTIC_PROBE', 'UNRESOLVED', 'No replication dataset supplied yet — contamination cannot be checked.'),
    SELECTION_BIAS: structuralProbe('SELECTION_BIAS', null, '', ''),
    LEAKAGE: structuralProbe('LEAKAGE', null, '', ''),
    CONFOUNDING: structuralProbe('CONFOUNDING', null, '', ''),
    MEASUREMENT_ARTIFACT: structuralProbe('MEASUREMENT_ARTIFACT', null, '', ''),
    NUMERICAL_ARTIFACT: structuralProbe('NUMERICAL_ARTIFACT', null, '', ''),
    TEMPORAL_LEAKAGE: structuralProbe('TEMPORAL_LEAKAGE', null, '', ''),
  };

  const declared: Readonly<Record<string, { readonly result: SelfFalsificationProbeResult; readonly from: string | null }>> = {
    HIDDEN_PREREG: { result: hiddenPrereg, from: hiddenPreregFrom },
    MULTIPLE_TESTING: { result: multipleTesting, from: multipleTestingFrom },
    PREPROCESSING_ARTIFACT: { result: preprocessing, from: preprocessingFrom },
  };

  const probes: FinalistProbe[] = ALL_SELF_FALSIFICATION_PROBES.map((id) => {
    const d = declared[id];
    const r = d ? d.result : undeclared[id]!;
    return { id, labelPl: FINALIST_PROBE_LABEL_PL[id], method: r.method, verdict: r.result, reason: r.detail, declaredFrom: d?.from ?? null };
  });
  const counts = { PASS: 0, FAIL: 0, UNRESOLVED: 0 } as Record<FinalistProbeVerdict, number>;
  for (const p of probes) counts[p.verdict] += 1;

  // --- The frozen criteria's own verdict and next step (existing logic, unmodified) ----------------
  const registered = getDrugHypothesis(run.campaignId);
  const hypothesis = registered ?? buildDrugHypothesis(candidate.smiles);
  const result = evaluateDrugHypothesis(hypothesis, state, candidate);
  const next = nextDrugExperiment(result, state);

  // --- What is still unknown ------------------------------------------------------------------------
  const unknowns: FinalistUnknown[] = [];
  for (const c of result.criteria) {
    if (c.status === 'UNRESOLVED') unknowns.push({ id: `criterion:${c.id}`, labelPl: `Kryterium „${c.id}”: nierozstrzygnięte`, detail: c.observed, kind: 'CRITERION_UNRESOLVED' });
  }
  for (const p of probes) {
    if (p.verdict === 'UNRESOLVED') unknowns.push({ id: `probe:${p.id}`, labelPl: `${p.labelPl} (${p.id}): nierozstrzygnięta`, detail: p.reason, kind: 'PROBE_UNRESOLVED' });
  }
  const anatomy = targetAnatomy(target?.targetId);
  if (anatomy) {
    unknowns.push({ id: 'drug-effect-in-tissue', labelPl: DRUG_EFFECT_NOT_COMPUTED_PL, detail: `${anatomy.sitePl} — Genesis nie twierdzi, że lek tu działa (atlas referencyjny, nie symulacja działania leku w tkance).`, kind: 'NOT_VALIDATED' });
  }

  const nextExperiments: FinalistNextExperiment[] = [
    { probeId: 'HYPOTHESIS', labelPl: next.title, whatItWouldResolve: `${next.rationale} Wymaga: ${next.requires.join(', ')}.`, source: 'drugHypothesis.ts::nextDrugExperiment' },
    ...probes.filter((p) => p.verdict === 'UNRESOLVED').map((p): FinalistNextExperiment => ({ probeId: p.id, labelPl: `Rozstrzygnąć: ${p.labelPl}`, whatItWouldResolve: PROBE_RESOLVER_PL[p.id], source: 'selfFalsificationBattery.ts declaration field' })),
  ];

  const sealedIdentity = sealed ? { recordId: sealed.recordId, chainHash: sealed.chainHash, check: sealed.check } : null;
  const reportFingerprint = fnv1a(canonicalJson({
    stateHash: state.stateHash,
    probes: probes.map((p) => ({ id: p.id, verdict: p.verdict })),
    unknowns: unknowns.map((u) => u.id),
    next: nextExperiments.map((n) => n.probeId),
  }));
  return {
    status: 'RESOLVED',
    candidateId: candidate.id,
    smiles: candidate.smiles,
    dockingScore: candidate.stages.docking?.value ?? null,
    probes,
    counts,
    unknowns,
    nextExperiments,
    hypothesisVerdict: result.verdict,
    hypothesisSource: registered ? 'REGISTERED' : 'DEFAULT_CRITERIA',
    sealed: sealedIdentity,
    stateHash: state.stateHash,
    reportFingerprint,
  };
}
