import { useState } from 'react';
import type React from 'react';
import { runD062Discovery } from '../../orchestrator/d062Discovery';
import type { ChallengeBlocked, ChallengeResult } from '../contracts';
import { FingerprintChip } from '../../../components/genesis-ui/FingerprintChip';

/**
 * D-062 DISCOVERY CHALLENGE PANEL — read-only projection (docs/DECISIONS.md
 * D-062).
 *
 * This panel computes NOTHING. Every field shown is exactly what
 * `runD062Discovery` returned — the same real, custody-verified,
 * dose-stratified LOWER-HARM/A2 challenge `scripts/genesis-d062-discovery-
 * challenge.mjs` runs, through the same real, unmodified D-057 Winner
 * Promotion Gate every other domain in this console uses.
 */

export function ChallengePanel(): React.ReactElement {
  const [result, setResult] = useState<ChallengeResult | ChallengeBlocked | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (): Promise<void> => {
    setBusy(true);
    try {
      setResult(await runD062Discovery({ mode: 'PRODUCTION', maxRounds: 3 }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-section">
      <h3 className="section-label">D-062 — Dose-Stratified Discovery Challenge</h3>
      <p className="gu-hint">
        Among real dose strata of the pinned SURPASS-2 trial — genuinely absent from the fixed A2 candidate space, which only ever
        reads the trial&apos;s highest dose — does any clear the frozen better-than-baseline rule and the real D-057 gate?
      </p>
      <button type="button" className="chip-btn primary" disabled={busy} onClick={() => void run()}>
        {busy ? 'Running…' : 'Run Discovery Challenge (PRODUCTION)'}
      </button>

      {result === null && <p className="empty-state">Nothing is computed until you click.</p>}

      {result !== null && result.kind === 'EXECUTION_BLOCKED' && (
        <p className="gu-hint">EXECUTION_BLOCKED [{result.code}]: {result.error}</p>
      )}

      {result !== null && result.kind === 'RUN' && (
        <>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
            <FingerprintChip label="mode" value={result.mode} />
            <FingerprintChip label="verdict" value={result.verdict} />
            <FingerprintChip label="rounds" value={String(result.rounds.length)} />
            <FingerprintChip label="D-057" value={result.d057.outcome} />
            <FingerprintChip label="recipe" value={result.recipeFingerprint ?? 'LOCKED'} />
            <FingerprintChip label="novelty" value={`L${result.noveltyLevel}`} />
            <FingerprintChip label="audit" value={result.auditFingerprint.slice(0, 10)} />
          </div>

          <p className="gu-hint">
            <strong>WHAT DID GENESIS INVENT?</strong>{' '}
            {result.wasAbsentFromFixedSet && result.bestCandidate !== null
              ? `${result.bestCandidate.label} (lineage ${result.bestCandidate.lineage})`
              : 'NOT A TRUE DISCOVERY RUN — best candidate is the baseline or a member of the fixed retrieval set.'}
          </p>
          <p className="gu-hint">
            <strong>WHY IS IT BETTER THAN BASELINE?</strong>{' '}
            {result.verdict === 'WINNER' ? 'It cleared every frozen conjunct — see the Research Recipe.' : `IT IS NOT — ${result.blockers.join(' | ')}`}
          </p>
          <p className="gu-hint">NEXT EXPERIMENT: {result.nextExperiment}</p>

          <ul className="gu-conjunct-list">
            {result.rounds.map((r) => (
              <li key={r.round} className="gu-conjunct-item">
                <span className="gu-conjunct-name">round {r.round} — {r.experimentLabels.join(' vs ')}</span>
                <div className="gu-conjunct-detail">{r.nextDirection}</div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
