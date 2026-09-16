import type React from 'react';
import type { CandidateSpaceEntry } from '../../core/orchestrator/winnerRecord';
import { CandidateSpaceMap } from './CandidateSpaceMap';

/**
 * CandidateSpacePanel — every candidate the real ranking scored this run,
 * qualifying and eliminated alike, each with its own real reason. Nothing is
 * hidden: a vetoed or below-floor candidate stays visible with the veto/floor
 * text `rankForLowerHarm` produced. Sorted by the ranking's own order.
 */
export function CandidateSpacePanel({ candidates }: { readonly candidates: readonly CandidateSpaceEntry[] }): React.ReactElement {
  const qualifying = candidates.filter((c) => c.qualifies).length;
  return (
    <div className="gu-cspace" data-testid="candidate-space">
      <h3 className="section-label">Candidate space — {candidates.length} candidates, {qualifying} clear the floor and the veto</h3>
      {candidates.length > 0 && <CandidateSpaceMap candidates={candidates} />}
      <ul className="gu-cspace-list">
        {candidates.map((c) => (
          <li key={c.candidateId} className={`gu-cspace-row ${c.qualifies ? 'gu-cspace-qualifies' : 'gu-cspace-eliminated'} ${c.inTop2 ? 'gu-cspace-top2' : ''}`}>
            <div className="gu-cspace-main">
              <span className="gu-cspace-name">{c.candidateName} <code>{c.candidateId}</code>{c.inTop2 && <span className="gu-cspace-tag">TOP2</span>}</span>
              <span className="gu-cspace-score">{c.lowerHarmScore === null ? 'eliminated' : c.lowerHarmScore.toFixed(3)}</span>
            </div>
            <div className="gu-cspace-meta">
              floor {c.efficacyFloor.status}{c.efficacyFloor.fraction !== null ? ` (${(c.efficacyFloor.fraction * 100).toFixed(1)}%)` : ''} · safety {c.safetyScore.toFixed(2)} · efficacy {c.efficacyScore.toFixed(2)} · {c.observationCount} obs
            </div>
            {c.eliminationReason !== null && <div className="gu-cspace-reason">{c.eliminationReason}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
