import type { ExperimentSession, ReplayVerdict } from '../scientificWorlds/experimentSession';
import type { CycleResult } from '../scientificWorlds/curiosityCycle';
import type { ChemistryRun } from '../chemistryEducation';
import type { ResearchIntakeResult } from '../backend/client';
import type { LiveDrugRunState } from '../liveExperiment/drugRunState';
import type { DrugHypothesis, DrugHypothesisResult } from '../liveExperiment/drugHypothesis';

/**
 * ONE PUBLIC OUTCOME CONTRACT — result → Evidence → Replay → Next Experiment.
 *
 * Genesis records outcomes in several existing formats (the canonical ExperimentSession + ReplayVerdict
 * of the Laboratory and the chemistry lessons, the backend ResearchIntakeResult of Drug Discovery…).
 * This module does not replace any of them and computes nothing: each adapter only re-states what its
 * source already recorded, in one shape, so the product shows Evidence, Replay and the next experiment
 * the same way everywhere (components/ScientificOutcomePanel). A field the source does not carry is
 * reported as absent, never filled in.
 */

export type OutcomePillar = 'LABORATORY' | 'CHEMISTRY' | 'DRUG_DISCOVERY';

/** What stands behind the result as evidence. */
export type OutcomeEvidenceStatus =
  /** A canonical ExperimentSession with a content hash and EvidenceLedger entries. */
  | 'SEALED_SESSION'
  /** A deterministic fingerprint of a backend result (re-derivable, not a ledger entry). */
  | 'FINGERPRINTED'
  /** Computed and sealed locally, but explicitly not persisted as project Evidence. */
  | 'NOT_PERSISTED'
  /** An educational model: explicitly not evidence. */
  | 'NOT_EVIDENCE';

export type OutcomeReplayStatus = 'MATCH' | 'DRIFT' | 'NOT_RUN' | 'NOT_AVAILABLE';

export interface OutcomeIdentifier {
  readonly label: string;
  readonly value: string;
  /** Stable test id for identifiers other surfaces already depend on. */
  readonly testId?: string;
}

/** The one public Next Experiment contract. */
export interface NextExperimentView {
  readonly title: string;
  readonly rationale: string;
  /** What must exist before it can run (data, capability, human approval). */
  readonly requires: readonly string[];
  /** Who proposed it — always an existing producer, never this module. */
  readonly source: 'CURIOSITY_CYCLE' | 'RESEARCH_INTAKE' | 'LIVE_RUN';
  /** The UI action that starts it, if the source offers one. */
  readonly action: 'APPROVE_AND_RUN' | null;
}

export interface ScientificOutcomeView {
  readonly pillar: OutcomePillar;
  readonly title: string;
  readonly epistemicLabel: string;
  readonly summary: string;
  readonly evidence: {
    readonly status: OutcomeEvidenceStatus;
    readonly reason: string;
    readonly identifiers: readonly OutcomeIdentifier[];
  };
  readonly replay: {
    readonly status: OutcomeReplayStatus;
    readonly message: string;
    /** True when the source can re-execute the same runner now. */
    readonly available: boolean;
  };
  readonly next: NextExperimentView | null;
  /** Why there is no next experiment, when `next` is null. */
  readonly nextUnavailableReason: string | null;
}

function replayView(replay: ReplayVerdict | null, available: boolean, unavailableMessage: string): ScientificOutcomeView['replay'] {
  if (!available) return { status: 'NOT_AVAILABLE', message: unavailableMessage, available: false };
  if (!replay) return { status: 'NOT_RUN', message: 'Replay ponownie wykonuje ten sam runner z tym samym ziarnem i porównuje odcisk wyniku.', available: true };
  return { status: replay.status, message: replay.message, available: true };
}

function outputsSummary(session: ExperimentSession, limit = 4): string {
  const entries = Object.entries(session.outputs).filter(([, v]) => typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean').slice(0, limit);
  return entries.map(([k, v]) => `${k}=${typeof v === 'number' ? Number(v.toPrecision(6)) : String(v)}`).join(' · ');
}

/** The lab's next experiment is the curiosity cycle's own proposal (it waits for a human approval). */
export function nextFromCuriosity(curiosity: CycleResult | null): NextExperimentView | null {
  const it = curiosity?.iterations[0];
  if (!it || it.terminal !== 'AWAITING_HUMAN_APPROVAL' || !it.experiment) return null;
  return {
    title: `${it.experiment.experimentId} · ${it.experiment.station.label}`,
    rationale: it.discriminability?.why ? `${it.question.text} — ${it.discriminability.why}` : it.question.text,
    requires: ['zatwierdzenie przez człowieka'],
    source: 'CURIOSITY_CYCLE',
    action: 'APPROVE_AND_RUN',
  };
}

/** Laboratory: a sealed ExperimentSession, its replay verdict and the curiosity cycle's proposal. */
export function outcomeFromLabSession(session: ExperimentSession, replay: ReplayVerdict | null, curiosity: CycleResult | null, stationLabel?: string): ScientificOutcomeView {
  const next = nextFromCuriosity(curiosity);
  return {
    pillar: 'LABORATORY',
    title: stationLabel ? `${stationLabel} · ${session.experimentId}` : session.experimentId,
    epistemicLabel: `${session.epistemicStatus} · ${session.engineLabel}`,
    summary: outputsSummary(session),
    evidence: {
      status: 'SEALED_SESSION',
      reason: 'Sesja zapieczętowana: hash treści, odcisk replay i wpisy w EvidenceLedger.',
      identifiers: [
        ...session.evidenceHashes.map((h) => ({ label: 'EvidenceLedger', value: `contentHash ${h}`, testId: 'sw-ledger-hash' })),
        { label: 'Hash sesji', value: session.contentHash, testId: 'sw-content-hash' },
        { label: 'Odcisk replay', value: session.replayFingerprint },
      ],
    },
    replay: replayView(replay, true, ''),
    next,
    nextUnavailableReason: next ? null : 'Brak propozycji. „Zaproponuj następny eksperyment” uruchamia cykl ciekawości na lukach w dowodach.',
  };
}

/** Chemistry lesson or computational run: its sealed session (if any), evidence eligibility and replay. */
export function outcomeFromChemistryRun(run: ChemistryRun, replay: ReplayVerdict | null, summary: string): ScientificOutcomeView {
  const session = run.session;
  const status: OutcomeEvidenceStatus = run.evidence.eligible ? 'SEALED_SESSION'
    : run.evidence.code === 'EDUCATIONAL_MODEL_NOT_EVIDENCE' ? 'NOT_EVIDENCE' : 'NOT_PERSISTED';
  return {
    pillar: 'CHEMISTRY',
    title: run.plan.template?.title ?? run.plan.experimentId,
    epistemicLabel: run.liveKind,
    summary,
    evidence: {
      status,
      reason: `${run.evidence.code} — ${run.evidence.reason}`,
      identifiers: session ? [{ label: 'Hash sesji', value: session.contentHash }, { label: 'Odcisk replay', value: session.replayFingerprint }] : [],
    },
    replay: replayView(replay, session !== null, 'Brak zapieczętowanej sesji — wykonanie nie zakończyło się, więc nie ma czego powtórzyć.'),
    next: null,
    nextUnavailableReason: 'Lekcje chemii nie mają kanonicznego generatora następnego eksperymentu; wybierz kolejny eksperyment z katalogu.',
  };
}

/** Drug Discovery research intake: backend fingerprint, evidence references and its own next experiment. */
export function outcomeFromResearchIntake(result: ResearchIntakeResult): ScientificOutcomeView {
  const n = result.nextExperiment;
  const requires = [...n.requiredNextData, ...(n.requiredSpecialistCapability ? [n.requiredSpecialistCapability] : [])];
  return {
    pillar: 'DRUG_DISCOVERY',
    title: result.normalizedResearchQuestion,
    epistemicLabel: `${result.status} · ${result.inputKind}`,
    summary: result.selectionExplanation,
    evidence: {
      status: 'FINGERPRINTED',
      reason: result.evidenceReferences.length
        ? `${result.evidenceReferences.length} odwołań do źródeł; wynik ma deterministyczny odcisk backendu.`
        : 'Brak odwołań do źródeł; wynik ma deterministyczny odcisk backendu.',
      identifiers: [{ label: 'Odcisk', value: result.deterministicFingerprint }, ...result.evidenceReferences.slice(0, 5).map((ref) => ({ label: 'Źródło', value: ref }))],
    },
    replay: replayView(null, false, 'Replay intake to ponowne zapytanie backendu z tym samym pytaniem; porównaj odcisk.'),
    next: n.researchPlanPlaceholder
      ? { title: n.researchPlanPlaceholder, rationale: result.selectedResearchPriorityCandidate ? `Priorytet: ${result.selectedResearchPriorityCandidate}` : 'Priorytet nie został wybrany.', requires, source: 'RESEARCH_INTAKE', action: null }
      : null,
    nextUnavailableReason: n.researchPlanPlaceholder ? null : 'Backend nie zaproponował następnego eksperymentu.',
  };
}

/**
 * Live drug run at the lab bench: the sealed session, the frozen hypothesis and its verdict, the engine
 * runs that stand behind every measurement (their backend ids), and the next experiment the result implies.
 */
export function outcomeFromDrugLiveRun(input: {
  readonly session: ExperimentSession;
  readonly replay: ReplayVerdict | null;
  /** The backend's re-execution of the docking engine for this run (the strong replay). */
  readonly engineReplay?: { readonly runId: string; readonly verdict: string; readonly engine: string; readonly originalHash: string | null; readonly replayHash: string | null } | null;
  readonly state: LiveDrugRunState;
  readonly hypothesis: DrugHypothesis;
  readonly result: DrugHypothesisResult;
  readonly next: { readonly title: string; readonly rationale: string; readonly requires: readonly string[] };
}): ScientificOutcomeView {
  const { session, replay, state, hypothesis, result } = input;
  const runIds = [...new Set(state.candidates.flatMap((c) => Object.values(c.stages).map((m) => m?.runId).filter((id): id is string => Boolean(id))))];
  const focus = state.candidates.find((c) => c.pose) ?? null;
  const target = state.target;
  return {
    pillar: 'DRUG_DISCOVERY',
    title: `Hipoteza: ${result.verdict}`,
    epistemicLabel: `REAL_ENGINE_OUTPUT (RDKit, Vina) + MODEL_ESTIMATE (ADMET-AI) · ${session.engineLabel}`,
    summary: `${hypothesis.statement} — ${result.criteria.map((c) => `${c.id}: ${c.status} (${c.observed})`).join(' · ')} → ${result.verdict} (${result.rule}).`,
    evidence: {
      status: 'SEALED_SESSION',
      reason: 'Sesja stanowiska zapieczętowana ze stanu runu zapisanego przez backend; każdy pomiar ma swój ScienceRun, a docking — przygotowany receptor, ligand i pozę z sumami kontrolnymi.',
      identifiers: [
        { label: 'Hipoteza (zamrożona)', value: hypothesis.fingerprint, testId: 'drug-hypothesis-fingerprint' },
        { label: 'Stan runu', value: state.stateHash, testId: 'drug-state-hash' },
        ...(target ? [
          { label: 'Receptor', value: `${target.protein} · PDB ${target.pdbId}, łańcuch ${target.chain}, ${target.receptorAtoms} atomów`, testId: 'drug-receptor' },
          { label: 'Struktura źródłowa (sha256)', value: target.sourceSha256 },
          { label: 'Przygotowany receptor PDBQT (sha256)', value: target.receptorPdbqtSha256 },
          { label: 'Przygotowanie receptora', value: `Meeko ${target.meekoVersion} mk_prepare_receptor, deterministyczne` },
          { label: 'Kieszeń (pudełko dokowania)', value: `środek [${target.center.join(', ')}] Å, rozmiar [${target.boxSize.join(', ')}] Å` },
        ] : [{ label: 'Receptor', value: 'nieprzygotowany — kryterium dokowania nierozstrzygnięte', testId: 'drug-receptor' }]),
        ...(focus?.pose ? [
          { label: 'Ligand', value: focus.smiles },
          { label: 'Silnik dokowania', value: focus.pose.engine },
          { label: 'Poza (sha256)', value: focus.pose.poseSha256, testId: 'drug-pose-hash' },
          { label: 'Wynik dokowania', value: `${focus.stages.docking?.value?.toFixed(2) ?? '—'} kcal/mol (estymata funkcji oceniającej, nie pomiar)` },
          { label: 'Reszty kieszeni', value: focus.pose.pocketResidues.join(', ') },
        ] : []),
        ...(input.engineReplay ? [
          { label: 'Powtórka silnika (docking)', value: `${input.engineReplay.verdict}${input.engineReplay.runId ? ` · ScienceRun ${input.engineReplay.runId}` : ''}`, testId: 'drug-engine-replay' },
          ...(input.engineReplay.originalHash ? [{ label: 'Wynik pierwotny / powtórzony', value: `${input.engineReplay.originalHash} / ${input.engineReplay.replayHash ?? '—'}` }] : []),
        ] : []),
        ...(input.engineReplay ? [
          { label: 'Powtórka silnika (docking)', value: `${input.engineReplay.verdict}${input.engineReplay.runId ? ` · ScienceRun ${input.engineReplay.runId}` : ''}`, testId: 'drug-engine-replay' },
          ...(input.engineReplay.originalHash ? [{ label: 'Wynik pierwotny / powtórzony', value: `${input.engineReplay.originalHash} / ${input.engineReplay.replayHash ?? '—'}` }] : []),
        ] : []),
        ...session.evidenceHashes.map((h) => ({ label: 'EvidenceLedger', value: `contentHash ${h}`, testId: 'sw-ledger-hash' })),
        ...runIds.map((id) => ({ label: 'ScienceRun', value: id })),
        { label: 'Hash sesji', value: session.contentHash, testId: 'sw-content-hash' },
      ],
    },
    replay: (() => {
      const base = replayView(replay, true, '');
      // The session replay reproduces the read model; the engine replay reproduces the computation.
      // Say which one the message refers to, so MATCH is never read as more than it proves.
      const note = input.engineReplay
        ? ` Powtórka silnika (AutoDock Vina, ten sam receptor i ziarno): ${input.engineReplay.verdict}.`
        : ' Powtórka dotyczy odczytu stanu; powtórzenie samego silnika uruchamia backend osobno.';
      return { ...base, message: `${base.message}${note}` };
    })(),
    next: { title: input.next.title, rationale: input.next.rationale, requires: input.next.requires, source: 'LIVE_RUN', action: null },
    nextUnavailableReason: null,
  };
}
