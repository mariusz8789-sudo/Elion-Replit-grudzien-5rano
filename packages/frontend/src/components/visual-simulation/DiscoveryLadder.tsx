import type { ReactNode } from 'react';
import type { NarrativeConclusion } from './discoveryNarrative';
import { ProvenanceBadge, type DataProvenance } from './provenance';
import type { WorldDiscoveryEvidenceSummary } from '../../core/agent/worldDiscoverySession';
import type { SavedWorldDiscoveryReplay } from '../../core/scienceMemory';

/**
 * REUSABLE DISCOVERY LADDER — a plain, domain-agnostic list shell for the QUESTION -> HYPOTHESIS ->
 * EXPERIMENT -> OBSERVATION -> DIFFERENCE -> CONCLUSION -> NEXT EXPERIMENT -> EVIDENCE -> REPLAY
 * narrative the C2 scientific-proof-and-product-UX directive asks every flagship screen to tell.
 * This component renders whatever `steps` it is given and computes nothing; the caller supplies
 * real content per step (built from its own live solver state and its own `WorldDiscoveryPanel`
 * result). Reused as-is by `CellLabScreen.tsx` today; a future domain screen embeds the same
 * component unchanged.
 */

export interface LadderStep {
  readonly key: string;
  readonly label: string;
  readonly content: ReactNode;
  /** Optional per-step label color (e.g. a CONTROL/TREATMENT arm's own chart color). */
  readonly color?: string;
}

export function DiscoveryLadder({ steps, testId }: { steps: readonly LadderStep[]; testId?: string }) {
  return (
    <ol className="discovery-ladder" data-testid={testId}>
      {steps.map((step) => (
        <li key={step.key} className="dl-step" data-testid={`ladder-${step.key}`}>
          <span className="dl-label" style={step.color ? { color: step.color } : undefined}>{step.label}</span>
          <div className="dl-content">{step.content}</div>
        </li>
      ))}
    </ol>
  );
}

/**
 * Shared CONCLUSION rendering: a real SUPPORTED/FALSIFIED verdict verbatim, or the honest "no
 * conclusion yet" state — one visual convention for this fact across every domain's ladder, rather
 * than each screen re-deciding how to word "nothing has run yet."
 */
export function ConclusionContent({ conclusion, pendingText }: { conclusion: NarrativeConclusion | null; pendingText: string }) {
  if (!conclusion) return <p className="gsc-caption">{pendingText}</p>;
  return (
    <p>
      <b className={conclusion.verdict === 'SUPPORTED' ? 'dl-supported' : 'dl-falsified'}>{conclusion.verdict}</b>
      {' — '}{conclusion.text}
    </p>
  );
}

/**
 * Shared EVIDENCE rendering: the real Evidence Bundle a completed Discovery run already produced
 * (`runWorldDiscoveryAndRemember` builds and persists this — never computed a second time here),
 * tagged with the same `ProvenanceBadge` every other screen uses, or the honest "not yet" state.
 */
export function EvidenceContent({
  evidence,
  provenance,
  pendingText,
}: {
  evidence: WorldDiscoveryEvidenceSummary | null;
  provenance: DataProvenance;
  pendingText: string;
}) {
  if (!evidence) return <p className="gsc-caption">{pendingText}</p>;
  return (
    <p>
      Evidence Bundle <code>{evidence.bundleId}</code> <ProvenanceBadge provenance={provenance} /> — own replay{' '}
      <b className={`wd-replay-${evidence.replayVerdict}`}>{evidence.replayVerdict}</b>.
    </p>
  );
}

/**
 * Shared REPLAY rendering: the real re-execution verdict a completed Discovery run already
 * computed against its own recorded inputs (`MATCH`/`DRIFT`/`BLOCKED`/`NOT_REPRODUCIBLE`), reusing
 * the exact `.wd-replay-*` styling `WorldDiscoveryPanel.tsx` already gives this same verdict —
 * one visual convention for "was this result reproduced," not a second one invented here.
 */
export function ReplayContent({ replay, pendingText }: { replay: SavedWorldDiscoveryReplay | null; pendingText: string }) {
  if (!replay) return <p className="gsc-caption">{pendingText}</p>;
  return (
    <p>
      <b className={`wd-replay-${replay.status}`}>{replay.status}</b>
      {' — '}{replay.reason}
    </p>
  );
}
