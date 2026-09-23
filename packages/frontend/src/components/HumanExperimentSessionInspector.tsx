import type { ExperimentSession } from '../core/scientificWorlds/experimentSession';

/** Read-only projection of the canonical sealed ExperimentSession. */
export function HumanExperimentSessionInspector({ session }: { readonly session: ExperimentSession | null }): JSX.Element {
  if (!session) {
    return (
      <section className="sw-ex-session" data-testid="sw-explorer-session-empty">
        <strong>Scientific result</strong>
        <p className="sw-faint">No executed experiment is attached to the current view.</p>
      </section>
    );
  }
  return (
    <section className="sw-ex-session" data-testid="sw-explorer-session" data-epistemic={session.epistemicStatus}>
      <strong>Scientific result · {session.experimentId}</strong>
      <dl className="sw-ex-card">
        <dt>Status</dt><dd>{session.epistemicStatus}</dd>
        <dt>Engine</dt><dd>{session.engineLabel}</dd>
        <dt>Session</dt><dd className="cw-mono">{session.sessionId}</dd>
        <dt>Content fingerprint</dt><dd className="cw-mono">{session.contentHash}</dd>
        <dt>Replay identity</dt><dd className="cw-mono">{session.replayFingerprint}</dd>
        <dt>Evidence refs</dt><dd className="cw-mono">{session.evidenceHashes.length ? session.evidenceHashes.join(' · ') : 'NONE'}</dd>
      </dl>
      <p className="sw-faint" data-testid="sw-explorer-session-boundary">
        The fingerprint proves record identity and reproducibility input identity; it does not upgrade a model or simulation to an observation.
      </p>
    </section>
  );
}

