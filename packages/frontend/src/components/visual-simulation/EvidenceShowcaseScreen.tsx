import { useMemo, useState } from 'react';
import { getExperiment, type SavedExperiment } from '../../core/scienceMemory';
import type { VerificationResult } from '../../core/integrity';
import { ProvenanceBadge } from './provenance';
import {
  buildCaseStudy, buildSignedEvidenceDownload, listCaseStudyCandidates, replayCaseStudy, verifyEvidenceFile,
  type CaseStudy, type CaseStudyReplay,
} from './evidenceShowcase';
import { EXTERNAL_ANCHORS, runExternalAnchor, type ExternalAnchor } from '../../core/biotechData/externalAnchor';

/**
 * EVIDENCE & REPLAY SHOWCASE (C2, "Evidence & Replay as a product" directive).
 *
 * A standalone, one-page, print/export-friendly screen for an external audience (a pharma R&D
 * auditor, a regulator, an investor): ONE complete, real Evidence Bundle Genesis already produced,
 * shown as Question -> Hypothesis -> Falsification Criterion -> Data -> Verdict -> Provenance ->
 * Replay. This screen computes NOTHING scientific and duplicates no architecture — every field comes
 * from `evidenceShowcase.ts`, which itself reads only what `scienceMemory.ts`/`evidencePackStore.ts`
 * already persisted and calls only the replay functions that already exist. Deliberately NOT a
 * modification of `CellLabScreen.tsx` or `RealExperimentPipeline.tsx` — a new, independent view over
 * the same Scientific Memory those screens already write to, so it cannot collide with C1's work on
 * either file (see `docs/MASTER_PRIORITY_GENESIS.md`'s "UPDATE — 2026-09-09" section for the real
 * edit collision on `RealExperimentPipeline.tsx` this screen's own existence is designed to avoid).
 *
 * Replay runs live, in the browser, right before rendering, for the two investigation shapes whose own
 * replay functions genuinely re-execute; the older `evidencePackId` shape can only disclose the
 * verdict its own store computed at save time (`CaseStudyReplay.computedLive` says which happened, and
 * the caption under the verdict always says so in plain words). A DRIFT, BLOCKED, or NOT_REPRODUCIBLE
 * verdict is shown exactly as returned, with the same markup and the same visual weight as MATCH, never
 * hidden or reworded into something more flattering.
 */

function useLiveCaseStudy(experimentId: string | null): { saved: SavedExperiment | null; caseStudy: CaseStudy | null; replay: CaseStudyReplay | null } {
  return useMemo(() => {
    if (experimentId === null) return { saved: null, caseStudy: null, replay: null };
    const saved = getExperiment(experimentId) ?? null;
    if (saved === null) return { saved: null, caseStudy: null, replay: null };
    const caseStudy = buildCaseStudy(saved);
    if (caseStudy === null) return { saved, caseStudy: null, replay: null };
    return { saved, caseStudy, replay: replayCaseStudy(saved) };
  }, [experimentId]);
}

function ReplayVerdictBlock({ replay }: { replay: CaseStudyReplay }) {
  return (
    <p className={`ecs-replay-line wd-replay-${replay.status}`} data-testid="ecs-replay-verdict">
      <b>{replay.status}</b>
      {' — '}{replay.reason}
    </p>
  );
}

/**
 * KOTWICA ZEWNĘTRZNA (P2.3) — jedyna rzecz na tym ekranie, która NIE zależy od
 * tego, czy ktokolwiek cokolwiek wcześniej zapisał.
 *
 * Reszta ekranu pokazuje Evidence Bundle z Pamięci Naukowej, więc na świeżej
 * przeglądarce jest pusta. Kotwica jest przypięta w repo, więc recenzent
 * otwierający `#/evidence` widzi ją ZAWSZE — i widzi cały łańcuch: predykcję
 * policzoną przez Genesis, obserwację odczytaną z opublikowanego, sumowanego
 * zbioru zewnętrznego, prerejestrowane kryterium, werdykt falsyfikacyjny,
 * odcisk i werdykt replayu.
 *
 * Blok pokazuje też — z tą samą wagą wizualną — co ta kotwica POZOSTAWIA
 * nieprzetestowane. Bez tego zdania kotwica sugerowałaby pomiar przyrody,
 * którym nie jest.
 *
 * Renderuje JEDNĄ kotwicę, przekazaną jako prop — `ExternalAnchorsSection`
 * poniżej mapuje to na WSZYSTKIE wpisy `EXTERNAL_ANCHORS`, więc dodanie
 * drugiej kotwicy do rejestru wystarcza, żeby wyrenderowała się tutaj bez
 * dalszych zmian w tym ekranie.
 */
function ExternalAnchorCard({ anchor }: { anchor: ExternalAnchor }) {
  const result = useMemo(() => runExternalAnchor(anchor.id), [anchor.id]);

  return (
    <section className="ecs-section" data-testid={`ecs-external-anchor-${anchor.id}`}>
      <span className="dl-label">External anchor — an observation Genesis did not produce</span>
      {!result.ok ? (
        <p className="ecs-replay-line wd-replay-BLOCKED" data-testid={`ecs-anchor-blocked-${anchor.id}`}>
          <b>BLOCKED</b>{' — '}{result.reason}
        </p>
      ) : (
        <>
          <p data-testid={`ecs-anchor-verdict-${anchor.id}`}>
            <b>{result.verification.assessment}</b>{' — '}
            Genesis predicted {result.verification.predictedValue} {anchor.unit} for {anchor.metric};
            the externally published value is {result.verification.observedValue} {anchor.unit}.
            Preregistered band ±{anchor.tolerance.toFixed(3)} {anchor.unit}.
          </p>
          <dl className="pilot-provenance" data-testid={`ecs-anchor-provenance-${anchor.id}`}>
            <div><dt>observation origin</dt><dd><ProvenanceBadge provenance={result.observationOrigin} /></dd></div>
            <div><dt>source</dt><dd className="mono">{anchor.sourceUrl}</dd></div>
            <div><dt>version / retrieved</dt><dd className="mono">{anchor.sourceVersion} · {anchor.retrievedAt}</dd></div>
            <div><dt>licence</dt><dd className="mono">{anchor.license}</dd></div>
            <div><dt>pinned payload digest</dt><dd className="mono">{anchor.payloadDigest}</dd></div>
            <div><dt>verdict fingerprint</dt><dd className="mono">{result.verificationFingerprint}</dd></div>
          </dl>
          <p className="gsc-caption" data-testid={`ecs-anchor-tautology-${anchor.id}`}>
            <b>Tautology Gate: {result.tautologyAssessment.classification}</b>{' — '}
            {result.tautologyAssessment.classification === 'EMPIRICAL_TEST'
              ? 'the observation is registered as an independent channel, separate from whatever produced the prediction — agreement or disagreement here carries real information.'
              : result.tautologyAssessment.reasons[0]}
          </p>
          <p data-testid={`ecs-anchor-belief-${anchor.id}`}>
            <b>Belief revision</b>{' — '}
            confidence that this model correctly predicts this real observation moved from{' '}
            {result.belief.before.toFixed(3)} to {result.belief.after.toFixed(3)} ({result.belief.status}).
          </p>
          <p className={`ecs-replay-line wd-replay-${result.replay}`} data-testid={`ecs-anchor-replay-${anchor.id}`}>
            <b>{result.replay}</b>{' — '}
            the comparison was re-executed just now, in this browser, from the pinned payload; the two
            verdict fingerprints were then compared. A changed payload refuses outright rather than
            reporting a different number.
          </p>
          <p className="gsc-caption" data-testid={`ecs-anchor-untested-${anchor.id}`}>
            <b>What this does NOT establish:</b> {result.whatRemainsUntested}
          </p>
          <p className="gsc-caption" data-testid={`ecs-anchor-next-question-${anchor.id}`}>
            <b>Next question:</b> {result.nextQuestion}
          </p>
        </>
      )}
    </section>
  );
}

/** Itera po CAŁYM rejestrze `EXTERNAL_ANCHORS` — żadna kotwica nie jest hardkodowana po ID. */
function ExternalAnchorsSection() {
  return (
    <>
      {EXTERNAL_ANCHORS.map((anchor) => (
        <ExternalAnchorCard key={anchor.id} anchor={anchor} />
      ))}
    </>
  );
}

function provenanceExplanation(caseStudy: Pick<CaseStudy, 'kind' | 'recordProvenance'>): string {
  switch (caseStudy.kind) {
    case 'RESEARCH_CHAIN':
      return ' Every step above, including which question came next, is SIMULATED — no external measurement exists for this record. What makes this case study different is not its provenance but its shape: the STEPS themselves were chosen by Genesis, one at a time, from what the previous step left open.';
    case 'REAL_VERIFICATION': {
      const sourceLabel = caseStudy.recordProvenance === 'REFERENCE'
        ? 'REFERENCE (a cited, published figure — not a fresh physical reading)'
        : 'REAL_EXPERIMENTAL (a real, physical reading someone entered)';
      return ` The prediction it was checked against is SIMULATED (a WorldGraph forecast); the measurement it was checked against is ${sourceLabel} — both are shown above under Data, exactly as recorded, never blended into one number.`;
    }
    case 'SIMULATED_DISCOVERY':
      return ' Every number in this case study, including the Data step above, is SIMULATED — no external measurement exists for this record. A real or cited measurement, once entered against a prediction, produces a REAL_EXPERIMENTAL or REFERENCE case study like the other kind this screen can show.';
    case 'LEGACY_EVIDENCE_PACK':
      return " This is a real-engine-executed run from Genesis's earlier Fabric-router investigation flow (the same Evidence Pack `ExperimentPilotScreen.tsx` uses) — genuinely executed, but SIMULATED: no external measurement exists for this record.";
    default:
      return '';
  }
}

/**
 * Wraps the download in a `SignedIntegrityEnvelope` (`core/integrity`) — a
 * SHA-256 hash over a canonicalized copy of the payload, plus a real ECDSA
 * P-256 signature over that hash (`buildSignedEvidenceDownload`, in
 * `evidenceShowcase.ts`), so a recipient can verify BOTH that the file was
 * not altered after Genesis produced it AND that it was produced by whoever
 * held the (ephemeral, per-download) private key — never institutional
 * non-repudiation, exactly as `SignedIntegrityEnvelope`'s own doc comment
 * states, and exactly as the caption under the Download button below says.
 */
async function downloadJson(caseStudy: CaseStudy, saved: SavedExperiment): Promise<void> {
  const signed = await buildSignedEvidenceDownload(caseStudy, saved);
  const blob = new Blob([JSON.stringify(signed, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `genesis-evidence-${saved.id.replace(/[^A-Za-z0-9_.-]/g, '_')}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function EvidenceShowcaseScreen() {
  // A synchronous lazy initializer, not `useEffect`, so the very first render already reflects
  // Scientific Memory — the same discipline `App.tsx` uses for onboarding state, and what makes this
  // component's real data path exercisable by `renderToStaticMarkup` in tests, not just its empty state.
  const [{ candidates, selectedId }, setPicker] = useState<{ candidates: readonly SavedExperiment[]; selectedId: string | null }>(() => {
    const found = listCaseStudyCandidates();
    return { candidates: found, selectedId: found[0]?.id ?? null };
  });

  const { saved, caseStudy, replay } = useLiveCaseStudy(selectedId);
  const [verifyResult, setVerifyResult] = useState<VerificationResult | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);

  async function handleVerifyFile(file: File): Promise<void> {
    setVerifyBusy(true);
    try {
      const text = await file.text();
      const parsed: unknown = JSON.parse(text);
      setVerifyResult(await verifyEvidenceFile(parsed));
    } catch (error) {
      setVerifyResult({ valid: false, reason: `Could not read this file as JSON: ${error instanceof Error ? error.message : String(error)}`, status: 'STRUCTURALLY_INVALID' });
    } finally {
      setVerifyBusy(false);
    }
  }

  return (
    <div className="ecs-screen" data-testid="evidence-showcase-screen">
      <div className="ecs-controls">
        <button type="button" className="gsc-caption" onClick={() => { window.location.hash = '#/cell-lab'; }} data-testid="ecs-back">
          ← Back to Virtual Cell Lab
        </button>
        {candidates.length > 1 && (
          <select
            className="ecs-picker"
            value={selectedId ?? ''}
            onChange={(e) => setPicker((s) => ({ ...s, selectedId: e.target.value }))}
            data-testid="ecs-picker"
          >
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.experimentName} — {new Date(c.createdAt).toLocaleString()}
              </option>
            ))}
          </select>
        )}
        {caseStudy && (
          <>
            <button type="button" onClick={() => window.print()} data-testid="ecs-print">
              Print / Export
            </button>
            <button type="button" onClick={() => { if (saved) void downloadJson(caseStudy, saved); }} data-testid="ecs-download-json">
              Download JSON
            </button>
          </>
        )}
      </div>
      {caseStudy && (
        <p className="gsc-caption" data-testid="ecs-integrity-note">
          The downloaded file carries a SHA-256 integrity hash AND a real ECDSA P-256 signature over that hash, produced by a fresh key generated in this browser tab for this one download — this proves the file has not been altered since export and was produced by whoever holds that (ephemeral) key, but is NOT institutional non-repudiation. See the file's own <code>verificationInstructions</code> field.
        </p>
      )}

      <div className="ecs-verify" data-testid="ecs-verify-section">
        <label htmlFor="ecs-verify-input">Verify a downloaded Evidence file</label>
        <input
          id="ecs-verify-input"
          type="file"
          accept="application/json"
          data-testid="ecs-verify-input"
          disabled={verifyBusy}
          onChange={(e) => { const file = e.target.files?.[0]; if (file) void handleVerifyFile(file); }}
        />
        {verifyResult && (
          <p className={`gsc-caption ecs-verify-${verifyResult.status}`} data-testid="ecs-verify-result">
            <b>{verifyResult.status}</b>{' — '}{verifyResult.reason}
          </p>
        )}
      </div>

      {!caseStudy ? (
        <div className="ecs-empty" data-testid="ecs-empty-state">
          <h2>No Evidence Bundle yet</h2>
          <p className="gsc-caption">
            Genesis has not produced a complete, replayable Evidence Bundle in this browser yet. Run a
            Discovery search in Virtual Cell Lab, or enter a real measurement there once a prediction
            exists, then return here — this screen shows the one Genesis actually produced, never a
            placeholder.
          </p>
        </div>
      ) : (
        <article className="ecs-print" data-testid="ecs-case-study">
          <header className="ecs-header">
            <h1>{caseStudy.title}</h1>
            <p className="gsc-caption">
              Record <code>{caseStudy.experimentId}</code> · {new Date(caseStudy.createdAt).toLocaleString()}
            </p>
            <ProvenanceBadge provenance={caseStudy.recordProvenance} testId="ecs-record-provenance" />
          </header>

          <ol className="ecs-chain">
            {caseStudy.steps.map((step) => (
              <li key={step.key} className="ecs-step" data-testid={`ecs-step-${step.key}`}>
                <span className="dl-label">{step.label}</span>
                <div className="ecs-step-body">
                  {step.lines.map((line, index) => (
                    <p key={index}>{line}</p>
                  ))}
                </div>
              </li>
            ))}
          </ol>

          <section className="ecs-section" data-testid="ecs-provenance-section">
            <span className="dl-label">Provenance</span>
            <p>
              This record is tagged <ProvenanceBadge provenance={caseStudy.recordProvenance} />.
              {provenanceExplanation(caseStudy)}
            </p>
          </section>

          <section className="ecs-section" data-testid="ecs-replay-section">
            <span className="dl-label">Replay</span>
            {replay && <ReplayVerdictBlock replay={replay} />}
            <p className="gsc-caption">
              {replay?.computedLive
                ? 'Computed just now, in this browser, by re-executing the SIMULATED half of this record from its own stored inputs and comparing the result against itself — never by reading back a stored verdict. Any REAL_EXPERIMENTAL data in this record is never re-executed; a physical measurement cannot be replayed, only kept unchanged.'
                : "Not recomputed just now: this Evidence Pack's own store only ever discloses the verdict it computed when the pack was saved — a snapshot, not a fresh in-browser re-execution. The reason above states exactly what that stored verdict was."}
            </p>
          </section>

          <footer className="ecs-footer gsc-caption">{caseStudy.honestyNote}</footer>
        </article>
      )}

      {/* Zawsze widoczna, nawet bez żadnego zapisanego rekordu — patrz doc komponentu. */}
      <ExternalAnchorsSection />
    </div>
  );
}
