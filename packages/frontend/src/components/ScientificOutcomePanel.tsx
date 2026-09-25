import type { ReactNode } from 'react';
import type { OutcomeEvidenceStatus, ScientificOutcomeView } from '../core/product/scientificOutcome';

/**
 * ONE Evidence + Replay panel and ONE Next Experiment panel for every pillar (Laboratory, Chemistry,
 * Drug Discovery). It renders a ScientificOutcomeView — an adapter over each source's own record — and
 * never computes a result, a hash or a proposal itself. Test ids other surfaces already rely on are
 * passed in via `testIds`, so the shared panel keeps their contracts.
 */

const EVIDENCE_LABEL: Record<OutcomeEvidenceStatus, string> = {
  SEALED_SESSION: 'Zapieczętowana sesja',
  FINGERPRINTED: 'Deterministyczny odcisk',
  NOT_PERSISTED: 'Nie zapisano jako Evidence',
  NOT_EVIDENCE: 'Model edukacyjny — nie jest dowodem',
};

export interface ScientificOutcomeTestIds {
  readonly evidence?: string;
  readonly replay?: string;
  readonly replayStatus?: string;
}

export interface ScientificOutcomePanelProps {
  readonly outcome: ScientificOutcomeView;
  readonly onReplay?: () => void;
  readonly testIds?: ScientificOutcomeTestIds;
  /** Controls of the source that proposes / starts the next experiment (e.g. the curiosity cycle buttons). */
  readonly nextActions?: ReactNode;
  /** Show the outcome's title and summary (off where the host already shows the result). */
  readonly showSummary?: boolean;
}

export function ScientificOutcomePanel({ outcome, onReplay, testIds = {}, nextActions, showSummary = false }: ScientificOutcomePanelProps) {
  const { evidence, replay } = outcome;
  const replayVerdict = replay.status === 'MATCH' || replay.status === 'DRIFT' ? replay.status : null;
  return (
    <div className="so-panel" data-testid="outcome-panel" data-pillar={outcome.pillar}>
      {showSummary && (
        <div className="so-block so-result">
          <h4>Wynik</h4>
          <p className="so-title">{outcome.title}</p>
          {outcome.summary && <p className="so-dim">{outcome.summary}</p>}
          <p className="so-dim">{outcome.epistemicLabel}</p>
        </div>
      )}
      <div className="so-block so-evidence" data-testid="outcome-evidence" data-status={evidence.status}>
        <h4>Dowód</h4>
        <p data-testid={testIds.evidence}><strong>{EVIDENCE_LABEL[evidence.status]}:</strong> {evidence.reason}</p>
        {evidence.identifiers.length > 0 && (
          <dl className="so-ids">
            {evidence.identifiers.map((id, i) => (
              <div key={`${id.label}-${i}`} className="so-id">
                <dt>{id.label}</dt>
                <dd className="so-mono" data-testid={id.testId}>{id.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <div className="so-block so-replay" data-testid="outcome-replay" data-status={replay.status}>
        <h4>Replay</h4>
        {replay.available && onReplay
          ? <button type="button" className="chip-btn" onClick={onReplay} data-testid={testIds.replay}>Powtórz (to samo ziarno, ten sam runner)</button>
          : <p className="so-dim">{replay.message}</p>}
        {replayVerdict && (
          <p className={`so-verdict so-verdict-${replayVerdict.toLowerCase()}`} data-testid={testIds.replayStatus} data-status={replayVerdict}>
            REPLAY_{replayVerdict}: {replay.message}
          </p>
        )}
      </div>
      <NextExperimentPanel outcome={outcome} actions={nextActions} />
    </div>
  );
}

/** The one Next Experiment panel. Usable alone where there is no result yet (the lab before its first run). */
export function NextExperimentPanel({ outcome, actions }: { readonly outcome: Pick<ScientificOutcomeView, 'next' | 'nextUnavailableReason'>; readonly actions?: ReactNode }) {
  const { next } = outcome;
  return (
    <div className="so-block so-next" data-testid="outcome-next" data-source={next?.source ?? 'NONE'}>
      <h4>Następny eksperyment</h4>
      {next ? (
        <>
          <p className="so-title" data-testid="outcome-next-title">{next.title}</p>
          <p className="so-dim">{next.rationale}</p>
          {next.requires.length > 0 && <p className="so-dim">Wymaga: {next.requires.join('; ')}</p>}
        </>
      ) : (
        <p className="so-dim" data-testid="outcome-next-unavailable">{outcome.nextUnavailableReason}</p>
      )}
      {actions}
    </div>
  );
}
