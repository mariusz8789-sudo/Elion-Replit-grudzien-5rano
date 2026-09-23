import type {
  VirtualExperimentPlan,
  VirtualExperimentReplay,
  VirtualExperimentResult,
} from '../core/backend/client';

interface Props {
  readonly plan: VirtualExperimentPlan | null;
  readonly result: VirtualExperimentResult | null;
  readonly replay: VirtualExperimentReplay | null;
  readonly evidenceProposalCount: number;
  readonly executing: boolean;
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

export function experimentPlaybackStages(input: Props): readonly PlaybackStage[] {
  const { plan, result, replay, evidenceProposalCount, executing } = input;
  const executed = result?.status === 'EXECUTED_COMPUTATIONAL_EXPERIMENT';
  const blocked = Boolean(result && !executed);
  return [
    {
      id: 'input', label: '1 · Input locked', state: plan ? 'RECORDED' : 'WAITING',
      detail: plan ? `${plan.requestedCapability} · ${plan.inputFingerprint}` : 'No governed plan yet',
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
      detail: executed ? `${result.epistemicClassification} · ${result.outputFingerprint ?? 'fingerprint unavailable'}` : result?.reason ?? 'No result recorded',
    },
    {
      id: 'evidence', label: '4 · Evidence proposal', state: evidenceProposalCount > 0 ? 'RECORDED' : executed ? 'WAITING' : blocked ? 'BLOCKED' : 'WAITING',
      detail: evidenceProposalCount > 0 ? `${evidenceProposalCount} pending human publication` : 'No canonical proposal recorded',
    },
    {
      id: 'replay', label: '5 · Deterministic replay', state: replay ? (replay.replayStatus === 'REPLAY_MATCH' ? 'RECORDED' : 'BLOCKED') : 'WAITING',
      detail: replay ? `${replay.replayStatus} · ${replay.detail}` : 'Replay not executed',
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
  return (
    <section className="experiment-playback" data-testid="computational-experiment-playback" aria-label="Computational experiment playback">
      <header>
        <strong>LIVE STATUS / AUDIT PLAYBACK</strong>
        <span className="pill pill-warn">COMPUTATIONAL · NOT WET-LAB TELEMETRY</span>
      </header>
      <ol className="experiment-playback-stages">
        {stages.map((stage) => (
          <li key={stage.id} data-state={stage.state} data-testid={`experiment-stage-${stage.id}`}>
            <span>{stage.label}</span><strong>{stage.state}</strong><small>{stage.detail}</small>
          </li>
        ))}
      </ol>
      {facts.length > 0 && (
        <dl className="experiment-output-facts" data-testid="experiment-output-facts">
          {facts.map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}
        </dl>
      )}
      <small>
        The sequence replays canonical plan/result/evidence/replay records. Domain-specific motion is driven by solver output only where that adapter supplies a time series or event geometry.
      </small>
    </section>
  );
}
