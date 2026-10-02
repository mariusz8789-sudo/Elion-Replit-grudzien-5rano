import type { ChatAction, EpistemicTag } from './resolveCommand';
import type {
  ApiResult, ResearchRunExperiment, ResearchRunReplay, ResearchRunVerdict, ResearchRunView,
} from '../backend/client';
import {
  executeResearchExperiment, getResearchRun, proposeResearchPlan, replayResearchExperiment, startResearchRun,
} from '../backend/client';

/**
 * RESEARCH RUN (R1-c) — the chat-side half of `/badanie`, `/eksperyment` and `/powtórz`. The backend
 * ResearchRun owns every step (plan, frozen prediction, engine, falsification, evidence proposal, replay,
 * next experiment); this module only calls it in order and words the answer for a person. Pure apart
 * from the injected client, so it is tested without a DOM like `quantumTurn.ts`; `ScienceChat.tsx` wires it.
 *
 * A verdict is shown only as what it is: about one frozen hypothesis under one protocol, never as truth.
 * BLOCKED is shown as BLOCKED, and nothing is substituted for an engine that is not there.
 */

export type ResearchRunAction = Extract<ChatAction, { type: 'researchRun' }>;

export interface ResearchRunClient {
  startResearchRun: typeof startResearchRun;
  getResearchRun: typeof getResearchRun;
  proposeResearchPlan: typeof proposeResearchPlan;
  executeResearchExperiment: typeof executeResearchExperiment;
  replayResearchExperiment: typeof replayResearchExperiment;
}

const DEFAULT_CLIENT: ResearchRunClient = { startResearchRun, getResearchRun, proposeResearchPlan, executeResearchExperiment, replayResearchExperiment };

export interface ResearchRunTurn {
  readonly text: string;
  readonly tag: EpistemicTag;
  /** The run this chat continues with `/eksperyment` and `/powtórz`; unchanged when the step failed. */
  readonly researchRunId: string | null;
}

export const VERDICT_LABEL: Record<ResearchRunVerdict, string> = {
  SUPPORTED_WITHIN_PROTOCOL: 'PODTRZYMANA w tym protokole',
  FALSIFIED_WITHIN_PROTOCOL: 'OBALONA w tym protokole',
  INCONCLUSIVE: 'NIEROZSTRZYGNIĘTA',
};

const REPLAY_LABEL: Record<string, string> = {
  MATCH: 'ZGODNE — ten sam silnik dał identyczny wynik',
  DRIFT: 'NIEZGODNE — powtórzenie dało inny wynik; przebieg czeka na człowieka',
  ENGINE_VERSION_CHANGED: 'INNA WERSJA SILNIKA — wyniku nie da się porównać wprost',
  BLOCKED_BY_RUNTIME: 'BLOCKED — silnik niedostępny w tej chwili',
  REPLAY_UNSUPPORTED: 'NIEOBSŁUGIWANE dla tego silnika',
  NOT_APPLICABLE: 'NIE DOTYCZY — silnik odrzucił dane wejściowe, nie ma wyniku do powtórzenia',
};

const SCOPE_LINE = 'Werdykt dotyczy tylko tej zamrożonej hipotezy w tym protokole (silnik, dane, kryteria). To nie jest prawda naukowa.';

const short = (hash: string | null | undefined) => (hash ? hash.slice(0, 12) : '—');

function refusal(prefix: string, r: Extract<ApiResult<unknown>, { ok: false }>, researchRunId: string | null): ResearchRunTurn {
  const body = (r.responseBody ?? {}) as { error?: string; reason?: string | null; engineId?: string | null; skipped?: Array<{ reason: string }> | null };
  const code = body.error ?? r.error;
  if (code === 'BLOCKED') {
    return { text: `${prefix}: BLOCKED — silnik ${body.engineId ?? 'wymagany przez eksperyment'} jest teraz niedostępny (${body.reason ?? r.message}). Nic nie zapisano i niczego nie podmieniono.`, tag: 'SYSTEM', researchRunId };
  }
  if (code === 'NO_EXECUTABLE_EXPERIMENT') {
    const reasons = [...new Set((body.skipped ?? []).map((s) => s.reason))].join(', ');
    return { text: `${prefix}: w planie nie ma eksperymentu, który Genesis może wykonać samo${reasons ? ` (${reasons})` : ''}. Następny krok należy do człowieka.`, tag: 'SYSTEM', researchRunId };
  }
  if (code === 'BLOCKED_BY_PROVIDER_CONFIGURATION') {
    return { text: `${prefix}: BLOCKED — model, który proponuje hipotezy, nie jest skonfigurowany na serwerze. Przebieg zapisano; plan powstanie, gdy model będzie dostępny.`, tag: 'SYSTEM', researchRunId };
  }
  return { text: `${prefix}: ${code}${body.reason ? ` (${body.reason})` : ''}. ${r.message}`, tag: 'SYSTEM', researchRunId };
}

function replayLine(replay: ResearchRunReplay | null | undefined): string {
  if (!replay) return 'Powtórzenie: brak.';
  const label = REPLAY_LABEL[replay.verdict] ?? replay.verdict;
  const hashes = replay.originalOutputHash ? ` (wynik ${short(replay.originalOutputHash)} → powtórzenie ${short(replay.replayOutputHash)})` : '';
  return `Powtórzenie: ${label}${hashes}.`;
}

/** One executed experiment in words a person can act on. */
export function formatExperiment(run: ResearchRunView, x: ResearchRunExperiment): string {
  const lines = [`Pytanie: ${run.question}`];
  if (x.frozen) lines.push(`Hipoteza (zamrożona przed uruchomieniem): ${x.frozen.claim}`);
  if (x.execution) {
    const engine = x.execution.engine;
    lines.push(`Silnik: ${engine.engineLabel ?? engine.engineId}${engine.version ? ` ${engine.version}` : ''} · status ${x.execution.status} · dane ${short(x.execution.inputHash)} → wynik ${short(x.execution.outputHash)}`);
  }
  if (x.falsification) {
    lines.push(`Werdykt: ${VERDICT_LABEL[x.falsification.verdict] ?? x.falsification.verdict}.`);
    lines.push(SCOPE_LINE);
  }
  if (x.evidence) lines.push('Evidence: PROPOZYCJA — czeka na zatwierdzenie przez człowieka; nic nie zostało opublikowane.');
  if (x.next) {
    lines.push(replayLine(x.next.replay));
    const p = x.next.proposal;
    const hypothesis = p.hypothesisId ? run.plan?.hypotheses.find((h) => h.hypothesisId === p.hypothesisId) : undefined;
    lines.push(p.action === 'EXECUTE_NEXT_HYPOTHESIS'
      ? `Następny eksperyment (propozycja): ${hypothesis?.claim ?? p.hypothesisId}. Napisz \`/eksperyment\`, aby go uruchomić.`
      : `Następny krok: przegląd przez człowieka (${p.reason}).`);
  }
  return lines.join('\n');
}

function tagOf(x: ResearchRunExperiment | undefined): EpistemicTag {
  return x?.execution?.status === 'EXECUTED' ? 'WYNIK' : 'SYSTEM';
}

async function executeNext(token: string, projectId: string, run: ResearchRunView, client: ResearchRunClient, prefix: string): Promise<ResearchRunTurn> {
  const executed = await client.executeResearchExperiment(token, projectId, run.researchRunId);
  if (!executed.ok) return refusal(prefix, executed, run.researchRunId);
  const x = executed.data.experiment ?? executed.data.researchRun.experiments.at(-1);
  if (!x) return { text: `${prefix}: brak eksperymentu w odpowiedzi serwera.`, tag: 'SYSTEM', researchRunId: run.researchRunId };
  return { text: formatExperiment(executed.data.researchRun, x), tag: tagOf(x), researchRunId: run.researchRunId };
}

/**
 * Runs one chat command against the backend ResearchRun. `researchRunId` is the run this chat is on;
 * `/eksperyment` and `/powtórz` without one explain themselves instead of guessing a run.
 */
export async function runResearchRunAction(
  action: ResearchRunAction,
  ctx: { token: string | null; projectId: string | null; researchRunId: string | null },
  client: ResearchRunClient = DEFAULT_CLIENT,
): Promise<ResearchRunTurn> {
  const { token, projectId, researchRunId } = ctx;
  if (!token || !projectId) return { text: 'BLOCKED — zaloguj się i wybierz projekt, w którym możesz uruchamiać eksperymenty; przebieg badawczy zapisuje się w projekcie.', tag: 'SYSTEM', researchRunId };

  if (action.op === 'start') {
    const started = await client.startResearchRun(token, projectId, action.question ?? '');
    if (!started.ok) return refusal('Nie założono przebiegu', started, researchRunId);
    let run = started.data.researchRun;
    if (!run.plan) {
      const planned = await client.proposeResearchPlan(token, projectId, run.researchRunId);
      if (!planned.ok) return refusal('Przebieg założony, plan nie powstał', planned, run.researchRunId);
      run = planned.data.researchRun;
    }
    const hypotheses = (run.plan?.hypotheses ?? []).map((h, i) => `${i + 1}. ${h.claim}${h.experimentProposal?.engineId ? ` [${h.experimentProposal.engineId}]` : ''}`).join('\n');
    const header = `Plan (propozycja modelu, nie dowód):\n${hypotheses || '— brak hipotez —'}`;
    // The same question returns the same run; one that already waits for a person is shown, not re-run.
    if (run.nextStep === 'AWAITING_HUMAN_REVIEW') {
      const last = run.experiments.at(-1);
      return { text: `${header}\n\nTo pytanie ma już przebieg.\n${last ? formatExperiment(run, last) : ''}`.trim(), tag: tagOf(last), researchRunId: run.researchRunId };
    }
    const turn = await executeNext(token, projectId, run, client, 'Eksperyment nie został wykonany');
    return { ...turn, text: `${header}\n\n${turn.text}` };
  }

  if (!researchRunId) return { text: 'Najpierw zadaj pytanie: `/badanie <pytanie>`.', tag: 'SYSTEM', researchRunId };
  const current = await client.getResearchRun(token, projectId, researchRunId);
  if (!current.ok) return refusal('Nie odczytano przebiegu', current, researchRunId);
  const run = current.data.researchRun;

  if (action.op === 'next') return executeNext(token, projectId, run, client, 'Eksperyment nie został wykonany');

  const last = [...run.experiments].reverse().find((e) => e.execution);
  if (!last) return { text: 'Ten przebieg nie ma jeszcze wykonanego eksperymentu. Napisz `/eksperyment`.', tag: 'SYSTEM', researchRunId };
  const replayed = await client.replayResearchExperiment(token, projectId, researchRunId, last.experimentId);
  if (!replayed.ok) {
    const code = ((replayed.responseBody ?? {}) as { error?: string }).error ?? replayed.error;
    if (code === 'NOTHING_TO_REPLAY') return { text: `Nie ma czego powtórzyć: ${REPLAY_LABEL.NOT_APPLICABLE}.`, tag: 'SYSTEM', researchRunId };
    return refusal('Powtórzenie nie powiodło się', replayed, researchRunId);
  }
  const all = replayed.data.replays.map((r) => r.verdict);
  return {
    text: `${replayLine(replayed.data.verification)}\nWszystkie powtórzenia tego eksperymentu: ${all.join(', ')}. Każde jest zapisane; żadne nie zmienia werdyktu.`,
    tag: replayed.data.verification.verdict === 'MATCH' ? 'WYNIK' : 'SYSTEM',
    researchRunId,
  };
}
