import { canonicalJson, fnv1a } from '../events/hash';
import { ALL_SELF_FALSIFICATION_PROBES, type SelfFalsificationProbeName, type SelfFalsificationProbeResult } from '../agent/discoveryContracts';
import { multipleTestingProbe, probe, structuralProbe } from '../agent/selfFalsificationBattery';
import { assessTautology } from '../agent/tautologyGate';
import { falsificationEvidence, type EvidenceIdentity } from './falsificationEvidence';
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
  /** Polish, one sentence: why this verdict, in the numbers the evidence carries (D-150). */
  readonly reasonPl: string;
  /** Which record/run the verdict was read from — a repo path, a module or a server record id. */
  readonly evidenceSource: string | null;
  /** The identity that pins it: `sha256:…`, `fnv1a:…`, a Science Run id or a memory record id. */
  readonly evidenceId: string | null;
  /** UNRESOLVED only: exactly what is missing, in Polish. Null for PASS/FAIL. */
  readonly blockerPl: string | null;
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
  /** Every evidence record the report actually used, so the panel can list the provenance once. */
  readonly evidenceUsed: readonly EvidenceIdentity[];
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

/** One probe's resolution: the battery's own result plus the provenance the panel must show. */
interface Resolution {
  readonly result: SelfFalsificationProbeResult;
  readonly reasonPl: string;
  readonly evidence: EvidenceIdentity | null;
  readonly blockerPl: string | null;
  readonly from: string | null;
}

/** UNRESOLVED with the blocker named — the ONLY way this module reaches UNRESOLVED. */
function unresolvedFor(id: SelfFalsificationProbeName, method: SelfFalsificationProbeResult['method'], blockerPl: string): Resolution {
  return {
    result: probe(id, method, 'UNRESOLVED', `No evidence supplied for ${id} — reported as UNRESOLVED, never assumed clean. Missing: ${blockerPl}`),
    reasonPl: `Nierozstrzygnięta — brak dowodu. Brakuje: ${blockerPl}`,
    evidence: null, blockerPl, from: null,
  };
}

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

  // --- The evidence the rest of the battery is fed (D-150) -----------------------------------------
  // Assembled by `falsificationEvidence.ts` from records that already exist: the recorded multi-seed
  // redock + control run of THIS target, the Astex benchmark, and the run's own append-only log.
  const ev = falsificationEvidence(state);
  const resolutions: Partial<Record<SelfFalsificationProbeName, Resolution>> = {
    HIDDEN_PREREG: {
      result: hiddenPrereg,
      reasonPl: hiddenPrereg.result === 'PASS'
        ? `Kryteria zapisane na serwerze (${prereg?.recordId}) przed pierwszym silnikiem; sprawdzenie zapieczętowanej sesji przez serwer: MATCH.`
        : hiddenPrereg.result === 'FAIL'
          ? `Prerejestracja nie trzyma: ${prereg?.status === 'REFUSED' ? `serwer ją odrzucił (${prereg.error ?? 'bez podanej przyczyny'})` : `sprawdzenie sesji to ${sealed?.check}, nie MATCH`}.`
          : 'Brak zapieczętowanej sesji sprawdzonej wobec prerejestracji.',
      evidence: prereg?.recordId
        ? { source: 'server experiment-memory: PREREGISTRATION + SESSION records', labelPl: 'Pamięć naukowa serwera', identity: `${prereg.recordId}${sealed?.chainHash ? ` · chain ${sealed.chainHash.slice(0, 12)}…` : ''}` }
        : null,
      blockerPl: hiddenPrereg.result === 'UNRESOLVED' ? 'brak rekordu prerejestracji albo brak zapieczętowanej sesji sprawdzonej wobec niej przez serwer' : null,
      from: hiddenPreregFrom,
    },
    MULTIPLE_TESTING: {
      result: multipleTesting,
      reasonPl: docked.length <= 1
        ? `Zadokowano dokładnie ${docked.length} kandydata — korekta na wielokrotne testowanie nie jest potrzebna.`
        : `Zadokowano ${docked.length} kandydatów bez zadeklarowanej korekty — istotność każdego pojedynczego wyniku jest zawyżona.`,
      evidence: { source: 'liveExperiment/drugRunState.ts — STAGE_RESULT records of the run', labelPl: 'Liczba zadokowanych kandydatów w rekordach przebiegu', identity: `fnv1a:${fnv1a(canonicalJson({ docked: docked.map((c) => c.id), stateHash: state.stateHash }))}` },
      blockerPl: null,
      from: multipleTestingFrom,
    },
    PREPROCESSING_ARTIFACT: {
      result: preprocessing,
      reasonPl: preprocessingDocumented
        ? `Sumy kontrolne na rekordzie: receptor PDBQT ${target?.receptorPdbqtSha256.slice(0, 12)}…, źródło ${target?.sourceSha256.slice(0, 12)}…, poza ${pose?.poseSha256.slice(0, 12)}…, Meeko ${target?.meekoVersion}, Science Run ${candidate.stages.docking?.runId}.`
        : 'Brak pełnego zestawu sum kontrolnych przetwarzania wstępnego na rekordzie.',
      evidence: preprocessingDocumented && target
        ? { source: 'campaign event RECEPTOR_PREPARED + Science Run outputs', labelPl: 'Rekord przygotowania receptora i pozy', identity: `sha256:${target.receptorPdbqtSha256}` }
        : null,
      blockerPl: preprocessingDocumented ? null : 'brak receptorPdbqtSha256 / sourceSha256 / poseSha256 / wersji Meeko albo brak Science Run dokowania',
      from: preprocessingFrom,
    },
    NUMERICAL_ARTIFACT: ev.redock === null
      ? unresolvedFor('NUMERICAL_ARTIFACT', 'STRUCTURAL_REVIEW', `brak przebiegu stabilności numerycznej dla celu ${target?.targetId ?? '(brak celu)'}: potrzebny redock tego receptora przy kilku ziarnach i wartościach exhaustiveness (scripts/finalist-falsification-evidence.py)`) : (() => {
        const r = ev.redock!;
        const allDocked = r.configurationsDocked === r.configurations && r.configurations > 0;
        const spreadOk = r.scoreSpreadKcalMol !== null && r.scoreSpreadKcalMol <= r.thresholds.maxScoreSpreadKcalMol;
        const posesOk = r.rmsdARange !== null && r.rmsdARange[1] <= r.thresholds.redockSuccessRmsdA;
        const pass = allDocked && spreadOk && posesOk;
        return {
          result: probe('NUMERICAL_ARTIFACT', 'STATISTICAL_TEST', pass ? 'PASS' : 'FAIL', pass
            ? `Score spread across ${r.configurations} (seed, exhaustiveness) settings is ${r.scoreSpreadKcalMol} kcal/mol (bound ${r.thresholds.maxScoreSpreadKcalMol}) and every pose stays within ${r.thresholds.redockSuccessRmsdA} Å of the crystal pose.`
            : `The redock is not stable: ${r.configurationsDocked}/${r.configurations} configurations docked, score spread ${r.scoreSpreadKcalMol} kcal/mol (bound ${r.thresholds.maxScoreSpreadKcalMol}), worst pose RMSD ${r.rmsdARange?.[1]} Å.`),
          reasonPl: pass
            ? `${r.configurations} konfiguracji (ziarno, exhaustiveness) dało rozrzut wyniku ${r.scoreSpreadKcalMol} kcal/mol (próg ${r.thresholds.maxScoreSpreadKcalMol}); RMSD pozy ${r.rmsdARange?.[0]}–${r.rmsdARange?.[1]} Å — wynik nie zależy od ziarna.`
            : `Wynik zależy od ustawień: zadokowano ${r.configurationsDocked}/${r.configurations}, rozrzut ${r.scoreSpreadKcalMol} kcal/mol (próg ${r.thresholds.maxScoreSpreadKcalMol}), najgorsze RMSD ${r.rmsdARange?.[1]} Å.`,
          evidence: r.identity, blockerPl: null, from: r.identity.source,
        };
      })(),
    MEASUREMENT_ARTIFACT: ev.redock === null
      ? unresolvedFor('MEASUREMENT_ARTIFACT', 'STRUCTURAL_REVIEW', `brak walidacji przyrządu dla celu ${target?.targetId ?? '(brak celu)'}: potrzebne RMSD odtworzonej pozy wobec niezależnego odniesienia (współrzędne krystalograficzne) dla tego receptora`) : (() => {
        const r = ev.redock!;
        const pass = r.medianRmsdA !== null && r.medianRmsdA <= r.thresholds.redockSuccessRmsdA;
        return {
          result: probe('MEASUREMENT_ARTIFACT', 'STATISTICAL_TEST', pass ? 'PASS' : 'FAIL', pass
            ? `The docking pipeline reproduces the deposited X-ray pose of this receptor's own ligand to ${r.medianRmsdA} Å median heavy-atom RMSD (bound ${r.thresholds.redockSuccessRmsdA} Å) — validated against a channel that shares no code path with the Vina scoring function.`
            : `The pipeline does not reproduce the deposited X-ray pose: median heavy-atom RMSD ${r.medianRmsdA} Å against a bound of ${r.thresholds.redockSuccessRmsdA} Å.`),
          reasonPl: pass
            ? `Ten sam potok odtwarza zdeponowaną pozę krystaliczną ligandu tego receptora z medianą RMSD ${r.medianRmsdA} Å (próg ${r.thresholds.redockSuccessRmsdA} Å); odniesienie (współrzędne rentgenowskie) nie dzieli żadnej ścieżki kodu z funkcją oceniającą Vina.`
            : `Potok nie odtwarza zdeponowanej pozy: mediana RMSD ${r.medianRmsdA} Å przy progu ${r.thresholds.redockSuccessRmsdA} Å.`,
          evidence: r.identity, blockerPl: null, from: r.identity.source,
        };
      })(),
    ALTERNATIVE_MODEL: ev.redock === null || ev.redock.separationFromWeakestNegativeKcalMol === null
      ? unresolvedFor('ALTERNATIVE_MODEL', 'STATISTICAL_TEST', `brak zadokowanego zestawu kontrolnego wobec tego receptora: potrzebne wyniki niepowiązanych chemicznie leków (kontrola negatywna) przy tym samym przygotowanym receptorze`) : (() => {
        const r = ev.redock!;
        const sep = r.separationFromWeakestNegativeKcalMol!;
        const pass = sep >= r.thresholds.minControlSeparationKcalMol;
        return {
          result: probe('ALTERNATIVE_MODEL', 'STATISTICAL_TEST', pass ? 'PASS' : 'FAIL', pass
            ? `The claimed chemotype beats the weakest unrelated-drug control by ${sep} kcal/mol (bound ${r.thresholds.minControlSeparationKcalMol}); the positive control (a further type-II inhibitor) scores ${r.positiveControlBestAffinityKcalMol} kcal/mol. The number is not what any molecule in this box would get.`
            : `An unrelated approved drug scores within ${sep} kcal/mol of the claimed chemotype (bound ${r.thresholds.minControlSeparationKcalMol}) — the score is not evidence about this molecule in particular.`),
          reasonPl: pass
            ? `Najsłabsza kontrola negatywna: ${r.weakestNegativeControlBestAffinityKcalMol} kcal/mol, chemotyp: ${r.bestAffinityKcalMol} kcal/mol — separacja ${sep} kcal/mol (próg ${r.thresholds.minControlSeparationKcalMol}). Kontrola pozytywna (inny inhibitor typu II): ${r.positiveControlBestAffinityKcalMol} kcal/mol. UWAGA: kontrole to niepowiązane leki dopuszczone do obrotu, nie dekoje dopasowane właściwościami.`
            : `Niepowiązany lek uzyskuje wynik o ${sep} kcal/mol od chemotypu (próg ${r.thresholds.minControlSeparationKcalMol}) — wynik nie mówi nic o tej konkretnej cząsteczce.`,
          evidence: r.identity, blockerPl: null, from: r.identity.source,
        };
      })(),
    TAUTOLOGY: ev.redock === null
      ? unresolvedFor('TAUTOLOGY', 'DETERMINISTIC_PROBE', 'brak zadeklarowanej pary przewidywanie/obserwacja z niezależnym kanałem: sam wynik Vina bez niezależnego odniesienia nie daje się klasyfikować')
      : (() => {
        const r = ev.redock!;
        const assessment = assessTautology([{
          componentId: `docking:${r.targetId}`,
          prediction: { source: 'hypothesis-parameter', modelId: `AutoDock Vina ${r.engines.vina ?? '1.2.7'} empirical scoring function`, rationale: 'the affinity is computed by running the shared scoring function on this candidate\'s own pose and genuinely varies with which molecule is docked' },
          observation: { source: 'independent-measurement', modelId: `deposited crystal coordinates of ${r.targetId}`, rationale: 'the heavy-atom RMSD is measured against X-ray coordinates deposited in the PDB, a channel that shares no code path and no free parameter with the Vina scoring function' },
        }]);
        const tautological = assessment.classification === 'CONSISTENCY_CHECK' || assessment.classification === 'UNTESTABLE';
        return {
          result: probe('TAUTOLOGY', 'DETERMINISTIC_PROBE', tautological ? 'FAIL' : 'PASS', `tautologyGate.ts::assessTautology classified this as ${assessment.classification}.`),
          reasonPl: tautological
            ? `tautologyGate.ts::assessTautology: ${assessment.classification} — para przewidywanie/obserwacja nie nosi niezależnej informacji.`
            : `tautologyGate.ts::assessTautology: ${assessment.classification}. Przewidywanie (wynik Vina) i obserwacja (RMSD wobec zdeponowanych współrzędnych rentgenowskich) pochodzą z rozłącznych kanałów, więc zgodność niesie informację.`,
          evidence: r.identity, blockerPl: null, from: 'tautologyGate.ts::assessTautology over the recorded redock',
        };
      })(),
    DATASET_CONTAMINATION: ev.contamination === null
      ? unresolvedFor('DATASET_CONTAMINATION', 'DETERMINISTIC_PROBE', 'brak niezależnego zbioru porównawczego z kanonicznymi SMILES (benchmark Astex nie dostarczył SMILES ligandów)')
      : (() => {
        const c = ev.contamination!;
        const clean = c.overlapCount === 0;
        return {
          result: probe('DATASET_CONTAMINATION', 'DETERMINISTIC_PROBE', clean ? 'PASS' : 'FAIL', clean
            ? `Zero molecules shared between the ${c.benchmarkCases}-complex independent validation set (${c.benchmarkRun}) and the ${c.campaignCandidates} candidate(s) of this campaign.`
            : `${c.overlapCount} molecule(s) are in BOTH the independent validation set (${c.benchmarkRun}) and this campaign's candidates: ${c.overlappingSmiles.join('; ')} — the benchmark that validates the instrument contains what the campaign is testing.`),
          reasonPl: clean
            ? `Zero cząsteczek wspólnych między niezależnym zbiorem walidacyjnym (${c.benchmarkCases} kompleksów, ${c.benchmarkRun}) a ${c.campaignCandidates} kandydatami kampanii.`
            : `${c.overlapCount} cząsteczka(-i) występuje w OBU zbiorach — ${c.overlappingSmiles.join('; ')}. Benchmark, który waliduje przyrząd, zawiera to, co kampania testuje: wynik benchmarku nie jest dla tej cząsteczki niezależny.`,
          evidence: c.identity, blockerPl: null, from: c.identity.source,
        };
      })(),
    LEAKAGE: ev.contamination === null
      ? unresolvedFor('LEAKAGE', 'STRUCTURAL_REVIEW', 'nie wykonano sprawdzenia wycieku: brak zbioru walidacyjnego z SMILES do przecięcia z kandydatami kampanii')
      : {
        result: structuralProbe('LEAKAGE', true,
          `The discovery/validation leakage check was actually executed for this run: the campaign's ${ev.contamination.campaignCandidates} candidate SMILES were intersected with the ${ev.contamination.benchmarkCases}-complex validation set (result: ${ev.contamination.overlapCount} shared). Whether the result is clean is DATASET_CONTAMINATION's verdict, not this one.`, ''),
        reasonPl: `Sprawdzenie wycieku zostało wykonane: ${ev.contamination.campaignCandidates} kandydatów przecięto z ${ev.contamination.benchmarkCases} kompleksami zbioru walidacyjnego (${ev.contamination.overlapCount} wspólnych). Ta sonda potwierdza, że sprawdzenie się odbyło; co ono wykazało, orzeka DATASET_CONTAMINATION.`,
        evidence: ev.contamination.identity, blockerPl: null, from: ev.contamination.identity.source,
      },
    OVERFITTING: ev.generalization === null || ev.generalization.z === null
      ? unresolvedFor('OVERFITTING', 'STATISTICAL_TEST', 'brak zbioru, na którym potok dokowania został zmierzony na dostatecznie wielu przypadkach, aby podzielić go na dwie połowy (benchmark Astex niedostępny w tym build)')
      : (() => {
        const g = ev.generalization!;
        const pass = Math.abs(g.z!) < g.criticalZ;
        return {
          result: probe('OVERFITTING', 'STATISTICAL_TEST', pass ? 'PASS' : 'FAIL', pass
            ? `Two-proportion z-test over a deterministic split of the ${g.halfA.cases + g.halfB.cases} benchmark complexes: ${g.halfA.successes}/${g.halfA.cases} vs ${g.halfB.successes}/${g.halfB.cases} (z = ${g.z}, |z| < ${g.criticalZ}) — the measured success rate is a property of the protocol, not of which half you look at.`
            : `Two-proportion z-test over a deterministic split of the benchmark: ${g.halfA.successes}/${g.halfA.cases} vs ${g.halfB.successes}/${g.halfB.cases} (z = ${g.z}, |z| ≥ ${g.criticalZ}) — the protocol's success rate does not hold across halves it was not tuned on.`),
          reasonPl: pass
            ? `Test dwóch proporcji na deterministycznym podziale ${g.halfA.cases + g.halfB.cases} kompleksów: ${g.halfA.successes}/${g.halfA.cases} (${g.halfA.rate}) vs ${g.halfB.successes}/${g.halfB.cases} (${g.halfB.rate}), z = ${g.z} przy wartości krytycznej ${g.criticalZ} — skuteczność potoku nie jest artefaktem tej połowy, na której protokół dopracowano. To NIE jest hold-out dopasowanego modelu: żaden model nie jest tu dopasowywany.`
            : `Test dwóch proporcji: ${g.halfA.successes}/${g.halfA.cases} vs ${g.halfB.successes}/${g.halfB.cases}, z = ${g.z} ≥ ${g.criticalZ} — skuteczność protokołu nie utrzymuje się na połowie, na której go nie dopracowano.`,
          evidence: g.identity, blockerPl: null, from: g.identity.source,
        };
      })(),
    SELECTION_BIAS: (() => {
      const s = ev.sampling;
      // Representative only if every molecule the run produced was actually measured on the claim's
      // own instrument; a budget that docks a subset makes the finalist a selected, not a sampled, molecule.
      const representative = s.generated > 0 && s.dockingDone >= s.generated;
      return {
        result: structuralProbe('SELECTION_BIAS', representative,
          `All ${s.generated} generated candidate(s) were docked — the finalist is not a selected subset.`,
          `Only ${s.dockingDone} of ${s.generated} generated candidate(s) reached the docking instrument (planned ${s.dockingPlanned}); the finalist is a SELECTED molecule, not a representative sample of the generated space, so the chemical space this claim covers is not measured.`),
        reasonPl: representative
          ? `Wszystkie ${s.generated} wygenerowane cząsteczki przeszły przez przyrząd dokujący — finalista nie jest podzbiorem wybranym.`
          : `Zadokowano ${s.dockingDone} z ${s.generated} wygenerowanych kandydatów (planowano ${s.dockingPlanned}). Finalista jest cząsteczką WYBRANĄ, nie próbką reprezentatywną wygenerowanej przestrzeni — budżet etapu, nie chemia, zadecydował, co zmierzono.`,
        evidence: s.identity, blockerPl: null, from: s.identity.source,
      };
    })(),
    CONFOUNDING: {
      result: probe('CONFOUNDING', 'STRUCTURAL_REVIEW', ev.confounders.confounders.length === 0 ? 'PASS' : 'FAIL',
        ev.confounders.confounders.length === 0
          ? 'No known, uncontrolled confounders derivable from this run\'s records.'
          : `Known, uncontrolled confounder(s) derived from the run's own records: ${ev.confounders.confounders.join('; ')}.`),
      reasonPl: ev.confounders.confounders.length === 0
        ? 'Z rekordów przebiegu nie wynika żaden znany, niekontrolowany czynnik zakłócający.'
        : `Znane, niekontrolowane czynniki zakłócające, wyprowadzone z rekordów przebiegu: ${ev.confounders.confounders.join('; ')}.`,
      evidence: ev.confounders.identity, blockerPl: null, from: ev.confounders.identity.source,
    },
    TEMPORAL_LEAKAGE: (() => {
      const o = state.ordering;
      // Nothing to judge until the log holds both a generation phase and a scored docking result.
      if (o.firstDockingResultSeq === 0 || o.lastGenerationSeq === 0) {
        return unresolvedFor('TEMPORAL_LEAKAGE', 'STRUCTURAL_REVIEW', 'dziennik przebiegu nie zawiera jednocześnie zdarzeń generacji i zapisanego wyniku dokowania, więc nie ma czego porównać w kolejności');
      }
      const ok = o.violations.length === 0;
      return {
        result: structuralProbe('TEMPORAL_LEAKAGE', ok,
          `The server's append-only log respects the causal order: the last generation event is seq ${o.lastGenerationSeq}, the receptor was prepared at seq ${o.receptorPreparedSeq} and the scored docking result was written at seq ${o.firstDockingResultSeq} — no later step's information could have reached an earlier one.`,
          `Ordering breach(es) in the append-only log: ${o.violations.join('; ')}.`),
        reasonPl: ok
          ? `Dziennik tylko-dopisywalny zachowuje kolejność przyczynową: ostatnie zdarzenie generacji seq ${o.lastGenerationSeq}, przygotowanie receptora seq ${o.receptorPreparedSeq}, zapisany wynik dokowania seq ${o.firstDockingResultSeq} — informacja z późniejszego kroku nie mogła trafić do wcześniejszego.`
          : `Naruszenie kolejności w dzienniku: ${o.violations.join('; ')}.`,
        evidence: ev.ordering, blockerPl: null, from: ev.ordering.source,
      };
    })(),
  };

  const probes: FinalistProbe[] = ALL_SELF_FALSIFICATION_PROBES.map((id) => {
    const r = resolutions[id] ?? unresolvedFor(id, 'STRUCTURAL_REVIEW', PROBE_RESOLVER_PL[id]);
    return {
      id, labelPl: FINALIST_PROBE_LABEL_PL[id], method: r.result.method, verdict: r.result.result, reason: r.result.detail,
      reasonPl: r.reasonPl,
      evidenceSource: r.result.result === 'UNRESOLVED' ? null : (r.evidence?.source ?? null),
      evidenceId: r.result.result === 'UNRESOLVED' ? null : (r.evidence?.identity ?? null),
      blockerPl: r.result.result === 'UNRESOLVED' ? (r.blockerPl ?? PROBE_RESOLVER_PL[id]) : null,
      declaredFrom: r.result.result === 'UNRESOLVED' ? null : r.from,
    };
  });
  const evidenceUsed: EvidenceIdentity[] = [];
  for (const id of ALL_SELF_FALSIFICATION_PROBES) {
    const e = resolutions[id]?.evidence;
    if (e && probes.find((p) => p.id === id)?.verdict !== 'UNRESOLVED' && !evidenceUsed.some((u) => u.identity === e.identity)) evidenceUsed.push(e);
  }
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
    if (p.verdict === 'UNRESOLVED') unknowns.push({ id: `probe:${p.id}`, labelPl: `${p.labelPl} (${p.id}): nierozstrzygnięta`, detail: `Blokada: ${p.blockerPl}`, kind: 'PROBE_UNRESOLVED' });
  }
  const anatomy = targetAnatomy(target?.targetId);
  if (anatomy) {
    unknowns.push({ id: 'drug-effect-in-tissue', labelPl: DRUG_EFFECT_NOT_COMPUTED_PL, detail: `${anatomy.sitePl} — Genesis nie twierdzi, że lek tu działa (atlas referencyjny, nie symulacja działania leku w tkance).`, kind: 'NOT_VALIDATED' });
  }

  const nextExperiments: FinalistNextExperiment[] = [
    { probeId: 'HYPOTHESIS', labelPl: next.title, whatItWouldResolve: `${next.rationale} Wymaga: ${next.requires.join(', ')}.`, source: 'drugHypothesis.ts::nextDrugExperiment' },
    ...probes.filter((p) => p.verdict === 'UNRESOLVED').map((p): FinalistNextExperiment => ({ probeId: p.id, labelPl: `Rozstrzygnąć: ${p.labelPl}`, whatItWouldResolve: p.blockerPl ?? PROBE_RESOLVER_PL[p.id], source: 'selfFalsificationBattery.ts declaration field' })),
  ];

  const sealedIdentity = sealed ? { recordId: sealed.recordId, chainHash: sealed.chainHash, check: sealed.check } : null;
  const reportFingerprint = fnv1a(canonicalJson({
    stateHash: state.stateHash,
    probes: probes.map((p) => ({ id: p.id, verdict: p.verdict, evidenceId: p.evidenceId })),
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
    evidenceUsed,
    sealed: sealedIdentity,
    stateHash: state.stateHash,
    reportFingerprint,
  };
}
