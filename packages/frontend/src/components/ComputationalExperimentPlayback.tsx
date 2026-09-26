import type {
  VirtualExperimentPlan,
  VirtualExperimentReplay,
  VirtualExperimentResult,
  ScientificExecutionEvent,
} from '../core/backend/client';

export type ExperimentPresentationLevel = 'SCHOOL' | 'UNIVERSITY' | 'RESEARCH';

interface Props {
  readonly plan: VirtualExperimentPlan | null;
  readonly result: VirtualExperimentResult | null;
  readonly replay: VirtualExperimentReplay | null;
  readonly evidenceProposalCount: number;
  readonly executing: boolean;
  readonly events?: readonly ScientificExecutionEvent[];
  readonly level?: ExperimentPresentationLevel;
}

type StageState = 'WAITING' | 'RUNNING' | 'RECORDED' | 'BLOCKED';

interface PlaybackStage {
  readonly id: string;
  readonly label: string;
  readonly state: StageState;
  readonly detail: string;
}

function outputFacts(output: Record<string, unknown> | null): readonly [string, string][] {
  if (!output) return [];
  return Object.entries(output)
    .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value) || value === null)
    .slice(0, 12)
    .map(([key, value]) => [key, value === null ? 'null' : String(value)] as const);
}

function recordedDetail(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return 'No additional detail recorded';
  try { return JSON.stringify(value); } catch { return String(value); }
}

const OUTPUT_LABELS: Readonly<Record<string, string>> = {
  molecularWeight: 'Masa cząsteczkowa',
  crippenLogP: 'logP (Crippen)',
  hBondDonors: 'Donory wiązań H',
  hBondAcceptors: 'Akceptory wiązań H',
  rotatableBonds: 'Wiązania obrotowe',
  ringCount: 'Pierścienie',
  tpsa: 'TPSA',
  fractionCsp3: 'Frakcja Csp3',
  lipinskiViolations: 'Naruszenia Lipińskiego',
  atoms: 'Atomy',
};

function outputLabel(key: string): string {
  return OUTPUT_LABELS[key] ?? key.replaceAll('_', ' ');
}

export function experimentPlaybackStages(input: Props): readonly PlaybackStage[] {
  const { plan, result, replay, evidenceProposalCount, executing } = input;
  const showResearchIdentifiers = input.level === 'RESEARCH';
  const executed = result?.status === 'EXECUTED_COMPUTATIONAL_EXPERIMENT';
  const blocked = Boolean(result && !executed);
  return [
    {
      id: 'input', label: '1 · Input locked', state: plan ? 'RECORDED' : 'WAITING',
      detail: plan
        ? `${plan.requestedCapability}${showResearchIdentifiers ? ` · ${plan.inputFingerprint}` : ''}`
        : 'No governed plan yet',
    },
    {
      id: 'engine', label: '2 · Registered engine', state: executing ? 'RUNNING' : blocked ? 'BLOCKED' : result ? 'RECORDED' : 'WAITING',
      detail: executing
        ? 'Backend engine call is running. Internal substeps are shown only when the engine exposes real telemetry.'
        : result?.selectedEngine ? `${result.selectedEngine.engineName} · ${result.selectedEngine.engineVersion ?? 'version unavailable'}`
        : result?.reason ?? 'Waiting for execution',
    },
    {
      id: 'result', label: '3 · Computational result', state: blocked ? 'BLOCKED' : executed ? 'RECORDED' : 'WAITING',
      detail: executed
        ? `${result.epistemicClassification}${showResearchIdentifiers ? ` · ${result.outputFingerprint ?? 'fingerprint unavailable'}` : ''}`
        : result?.reason ?? 'No result recorded',
    },
    {
      id: 'evidence', label: '4 · Evidence proposal', state: evidenceProposalCount > 0 ? 'RECORDED' : executed ? 'WAITING' : blocked ? 'BLOCKED' : 'WAITING',
      detail: evidenceProposalCount > 0 ? `${evidenceProposalCount} pending human publication` : 'No canonical proposal recorded',
    },
    {
      id: 'replay', label: '5 · Deterministic replay', state: replay ? (replay.replayStatus === 'REPLAY_MATCH' ? 'RECORDED' : 'BLOCKED') : 'WAITING',
      detail: replay ? `${replay.replayStatus} · ${recordedDetail(replay.detail)}` : 'Replay not executed',
    },
  ];
}

/**
 * Read-only playback of persisted experiment facts. It never pretends to be
 * microscope/instrument telemetry when an adapter exposes only a bounded call.
 */
export function ComputationalExperimentPlayback(props: Props): JSX.Element {
  const stages = experimentPlaybackStages(props);
  const facts = outputFacts(props.result?.derivedOutput ?? null);
  const level = props.level ?? 'UNIVERSITY';
  const visibleFacts = level === 'SCHOOL' ? facts.slice(0, 3) : facts;
  return (
    <section className="experiment-playback" data-testid="computational-experiment-playback" data-level={level} aria-label="Computational experiment playback">
      <header>
        <strong>LIVE COMPUTATIONAL EXPERIMENT</strong>
        <span className="pill pill-warn">REAL ENGINE · NOT WET-LAB TELEMETRY</span>
      </header>
      <ol className="experiment-playback-stages">
        {stages.map((stage) => (
          <li key={stage.id} data-state={stage.state} data-testid={`experiment-stage-${stage.id}`}>
            <span>{stage.label}</span><strong>{stage.state}</strong><small>{stage.detail}</small>
          </li>
        ))}
      </ol>
      {props.events && props.events.length > 0 && (
        <ol className="experiment-execution-events" data-testid="scientific-execution-events" aria-label="Recorded scientific execution events">
          {props.events.map((event) => (
            <li key={event.id} data-event-type={event.type} data-state={event.status}>
              <strong>{event.type.replaceAll('_', ' ')}</strong>
              <span>{level === 'SCHOOL' ? schoolExplanation(event.type) : event.detail}</span>
              {level === 'RESEARCH' && <small>source {event.sourceEventType} · {event.sourceEventId} · {new Date(event.occurredAt).toISOString()}</small>}
            </li>
          ))}
        </ol>
      )}
      {visibleFacts.length > 0 && (
        <section className="experiment-live-output" data-testid="experiment-live-output" aria-label="Real engine output">
          <div className="experiment-live-output-head"><span>REAL ENGINE OUTPUT</span><small>{props.result?.selectedEngine ? `${props.result.selectedEngine.engineName} ${props.result.selectedEngine.engineVersion ?? ''}`.trim() : 'registered engine'}</small></div>
          <dl className="experiment-output-facts" data-testid="experiment-output-facts">
            {visibleFacts.map(([key, value]) => <div key={key}><dt>{outputLabel(key)}</dt><dd>{value}</dd></div>)}
          </dl>
        </section>
      )}
      {level === 'RESEARCH' && props.result && (
        <details data-testid="research-execution-details"><summary>Research provenance and limitations</summary>
          <p>Output fingerprint: {props.result.outputFingerprint ?? 'UNAVAILABLE'} · duration: {props.result.durationMs} ms</p>
          <p>{props.result.provenanceRefs.join(' · ') || 'No provenance references recorded'}</p>
          <ul>{props.result.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
        </details>
      )}
      <small>
        The sequence replays canonical plan/result/evidence/replay records. Domain-specific motion is driven by solver output only where that adapter supplies a time series or event geometry.
      </small>
    </section>
  );
}

function schoolExplanation(type: ScientificExecutionEvent['type']): string {
  const explanations: Record<ScientificExecutionEvent['type'], string> = {
    INPUT_VALIDATED: 'Genesis checked that the experiment input is complete and allowed.',
    EXPERIMENT_PLANNED: 'The question was turned into a bounded computer experiment.',
    ENGINE_SELECTED: 'Genesis selected the scientific program that performs this calculation.',
    ENGINE_OUTPUT_AVAILABLE: 'The scientific program returned a computer result.',
    RESULT_CREATED: 'Genesis saved and classified the result.',
    EVIDENCE_PROPOSED: 'The result was proposed for human review; it is not published evidence yet.',
    REPLAY_MATCH: 'Repeating the calculation produced the same recorded result.',
    REPLAY_DRIFT: 'Repeating the calculation produced a different result.',
    REPLAY_BLOCKED: 'Genesis could not honestly repeat this calculation in the current environment.',
    EXECUTION_BLOCKED: 'The experiment could not start because a required input or tool is unavailable.',
    EXECUTION_FAILED: 'The scientific program started but did not produce a valid result.',
    EXECUTION_COMPLETED: 'The bounded computer experiment finished.',
  };
  return explanations[type];
}
