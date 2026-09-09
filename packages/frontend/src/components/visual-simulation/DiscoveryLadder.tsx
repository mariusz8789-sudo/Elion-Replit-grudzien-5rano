import type { ReactNode } from 'react';
import type { NarrativeConclusion } from './discoveryNarrative';

/**
 * REUSABLE DISCOVERY LADDER — a plain, domain-agnostic list shell for the GOAL -> HYPOTHESIS ->
 * EXPERIMENT -> OBSERVATION -> DIFFERENCE -> CONCLUSION -> NEXT EXPERIMENT narrative the C2
 * scientific-proof-and-product-UX directive asks every flagship screen to tell. This component
 * renders whatever `steps` it is given and computes nothing; the caller supplies real content per
 * step (built from its own live solver state and its own `WorldDiscoveryPanel` result). Reused
 * as-is by `CellLabScreen.tsx` today; a future domain screen embeds the same component unchanged.
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
