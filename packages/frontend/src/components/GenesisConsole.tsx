import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { runScientificDiscovery } from '../core/orchestrator/orchestrator';
import { parseProblem } from '../core/orchestrator/nl';
import { toyAdapters } from '../core/orchestrator/toyAdapters';
import type { ExecutionBlockedResult, RunResult } from '../core/orchestrator/govLowerHarmDiscovery';
import { GENESIS_DOMAINS, runGenesisDomainDiscovery, replayGenesisDomainDiscovery, type GenesisDomainId, type GenesisDomainReplayResult } from '../core/orchestrator/genesisDomainRegistry';
import type { EvidenceCustodyResult } from '../core/orchestrator/evidenceCustody';
import type { DiscoveryRun } from '../core/orchestrator/contracts';
import { VerdictBanner } from './genesis-ui/VerdictBanner';
import { FingerprintChip } from './genesis-ui/FingerprintChip';
import { EvidenceSourceStatusPanel } from './genesis-ui/EvidenceSourceStatusPanel';
import { WinnerGatePanel } from './genesis-ui/WinnerGatePanel';
import { ResearchRecipePanel } from './genesis-ui/ResearchRecipePanel';
import { CandidateSpacePanel } from './genesis-ui/CandidateSpacePanel';
import { PipelineTimeline } from './genesis-ui/PipelineTimeline';
import { ProvenanceDag, type CustodyView } from './genesis-ui/ProvenanceDag';
import { ReplayTwinPanel } from './genesis-ui/ReplayTwinPanel';
import { RunVerdictHero, type AuditLedgerView } from './genesis-ui/RunVerdictHero';
import type { AuditSeal } from '../core/audit/cryptoAudit';
import { appendToLedger, verifyLedger } from '../core/audit/auditLedger';
import { GuidedDiscovery } from './guide/GuidedDiscovery';
import { CANONICAL_QUESTION } from '../core/guide/narrationModel';
import type { GuideMode } from '../core/guide/guideMachine';
import { MindPanel } from '../core/mind/ui/MindPanel';
import { ChallengePanel } from '../core/discoveryChallenge/ui/ChallengePanel';
import { GovServicesPanel } from '../core/govServices/ui/GovServicesPanel';

/**
 * GENESIS RESEARCH CONSOLE — a read-only projection of one discovery-run
 * pass. This component computes NOTHING: every stage, verdict, and recipe
 * fingerprint shown below is exactly what the real functions it calls
 * returned — it never fabricates a `WinnerRecord`, a `Recipe`, or evidence.
 *
 * SANDBOX + TWO REAL DOMAINS, ONE RENDERER (docs/DECISIONS.md D-058/D-059,
 * mandate item 18 / C2 gap 1c — minimal UI, not a new engine):
 *  - SANDBOX: `toyAdapters` — SYNTHETIC_TEST_ONLY fixtures, no real Genesis
 *    module underneath (D-055).
 *  - REAL (production data): the selected `GENESIS_DOMAINS` domain
 *    (`genesisDomainRegistry.ts`, D-059's real adapter factory) run via
 *    `runGenesisDomainDiscovery(domainId, {mode:'PRODUCTION'})` — the real
 *    pinned ChEMBL/ClinicalTrials.gov pipeline for that domain. LOWER-HARM's
 *    honest result is NO_WINNER (D-058); E2E-01's matches its own
 *    historical `npm run e2e:gov-drug` finding (also NO_WINNER, D-032).
 *    This console does not hide or dress either result up.
 *  - REAL (synthetic winner demo): the same real domain pipeline fed
 *    `SYNTHETIC_TEST_ONLY` evidence — for LOWER-HARM, the engineered
 *    fixture where a WINNER genuinely emerges (D-058); E2E-01 has no
 *    separate engineered fixture (its own real data is reused, custody
 *    gate skipped) — see `govE2E01Discovery.ts`'s header.
 * All sources render through the exact same stage list below; only the
 * domain/adapters (and the resulting `mode` chip) differ. An
 * `EXECUTION_BLOCKED` result (a real adapter or the D-059 custody gate
 * refusing to proceed) is rendered explicitly, never silently dropped.
 */

type Source = 'SANDBOX' | 'REAL_PRODUCTION' | 'REAL_SYNTHETIC_WINNER_DEMO';

const DEFAULT_NL = 'Find a strategy that preserves efficacy but has a better benefit-risk profile.';

/** `#/research-console?guide=1` opens the guided mode; `#/tour` (or `?tour=1`) the autonomous tour. */
function guideModeFromHash(hash: string): GuideMode | null {
  if (hash === '#/tour' || /[?&]tour=1/.test(hash)) return 'TOUR';
  if (/[?&]guide=1/.test(hash)) return 'GUIDED';
  return null;
}

export function GenesisConsole({ autoplay }: { readonly autoplay?: GuideMode | null } = {}): React.ReactElement {
  const initialGuide = autoplay !== undefined ? autoplay : (typeof window === 'undefined' ? null : guideModeFromHash(window.location.hash));
  const [guideMode, setGuideMode] = useState<GuideMode | null>(initialGuide);
  // `?guide=1` / `?tour=1` arriving by a hash change (Start's doors, the header buttons) starts the
  // guide on the already-mounted console; leaving the query does not stop a session the person is in.
  useEffect(() => {
    if (autoplay !== undefined) return;
    const onHash = (): void => { const m = guideModeFromHash(window.location.hash); if (m !== null) setGuideMode(m); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [autoplay]);
  const [nl, setNl] = useState(initialGuide !== null ? CANONICAL_QUESTION : DEFAULT_NL);
  const [source, setSource] = useState<Source>(initialGuide !== null ? 'REAL_PRODUCTION' : 'SANDBOX');
  const [domainId, setDomainId] = useState<GenesisDomainId>('LOWER_HARM');
  const [vagueProblem, setVagueProblem] = useState(false);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<DiscoveryRun | null>(null);
  // D-116: the LOWER-HARM entry point's read-only projection (candidate space, conjuncts,
  // gate decisions, recipe body, WinnerRecord/blocker). Undefined for SANDBOX and E2E01.
  const [detail, setDetail] = useState<RunResult['detail']>(undefined);
  const [winnerRecord, setWinnerRecord] = useState<RunResult['winnerRecord']>(undefined);
  const [auditSeal, setAuditSeal] = useState<AuditSeal | undefined>(undefined);
  const [ledger, setLedger] = useState<AuditLedgerView | undefined>(undefined);
  const [replay, setReplay] = useState<GenesisDomainReplayResult | null>(null);
  const [replayBusy, setReplayBusy] = useState(false);
  const [ranDomainId, setRanDomainId] = useState<GenesisDomainId | null>(null);
  const [blocked, setBlocked] = useState<ExecutionBlockedResult | null>(null);
  const [custody, setCustody] = useState<EvidenceCustodyResult | null>(null);

  const start = async (): Promise<void> => {
    setBlocked(null);
    setCustody(null);
    setDetail(undefined);
    setWinnerRecord(undefined);
    setAuditSeal(undefined);
    setLedger(undefined);
    setReplay(null);
    if (source === 'SANDBOX') {
      setRanDomainId(null);
      const problem = parseProblem(
        `P-${Date.now()}`,
        {
          text: nl,
          objectives: [
            { metric: 'efficacy_delta_pp', direction: 'maximize', floor: -0.1 },
            { metric: 'severe_ae_rr', direction: 'minimize' },
          ],
          constraints: ['legal', 'feasible'],
          harmAxes: ['safety', 'dependence'],
          evidenceMinimum: '>=1 DIRECT_RCT or registered head-to-head',
        },
        toyAdapters.hash,
      );
      setRun(runScientificDiscovery(problem, toyAdapters, 'SYNTHETIC_TEST_ONLY'));
      return;
    }
    setBusy(true);
    try {
      // vagueProblem exercises the real fail-closed NEEDS_INPUT path (D-059
      // gap 1a): submitting only free text, no objectives/evidenceMinimum,
      // so parseProblem's own real logic — never a UI-side shortcut —
      // decides this is underspecified. domainId is passed through
      // genesisDomainRegistry.ts (D-059 gap 1b) rather than calling either
      // domain's entry point directly.
      const result = await runGenesisDomainDiscovery(domainId, {
        mode: source === 'REAL_PRODUCTION' ? 'PRODUCTION' : 'SYNTHETIC_TEST_ONLY',
        nl,
        problemInput: vagueProblem ? { text: nl } : undefined,
      });
      setRanDomainId(domainId);
      setCustody(result.evidenceCustody);
      if (result.kind === 'EXECUTION_BLOCKED') {
        setRun(null);
        setBlocked(result);
      } else {
        setRun(result);
        setDetail('detail' in result ? result.detail : undefined);
        setWinnerRecord('winnerRecord' in result ? result.winnerRecord : undefined);
        // D-121: append this run's seal to the client ledger and verify the whole chain.
        const seal = 'auditSeal' in result ? result.auditSeal : undefined;
        setAuditSeal(seal);
        if (seal !== undefined) {
          const storage = ((): Storage | null => { try { return window.localStorage; } catch { return null; } })();
          const appended = await appendToLedger(storage, seal.snapshot);
          const check = await verifyLedger(storage);
          setLedger({ length: appended.length, ok: check.ok, reason: check.reason });
        } else {
          setLedger(undefined);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  // D-116: real re-run through the same domain entry point (a fresh adapter bundle each time,
  // exactly as any caller would) — the console never asserts MATCH, it shows what replay returned.
  const verifyReplay = async (): Promise<void> => {
    if (ranDomainId === null || source === 'SANDBOX') return;
    setReplayBusy(true);
    try {
      setReplay(await replayGenesisDomainDiscovery(ranDomainId, {
        mode: source === 'REAL_PRODUCTION' ? 'PRODUCTION' : 'SYNTHETIC_TEST_ONLY',
        nl,
        problemInput: vagueProblem ? { text: nl } : undefined,
      }));
    } finally {
      setReplayBusy(false);
    }
  };

  // D-119/D-121: the guide compares result IDENTITY to detect a new run. Rebuilding this object on
  // every render (replay starting, ledger updating) looked like a new run and threw the tour back to
  // CANDIDATES — so it is built only when one of its real inputs changes.
  const guideResult = useMemo<RunResult | ExecutionBlockedResult | null>(
    () => (blocked ?? run === null ? blocked : ({ kind: 'RUN', ...run, detail, winnerRecord, evidenceCustody: custody } as unknown as RunResult)),
    [blocked, run, detail, winnerRecord, custody],
  );

  // D-117: the custody node of the provenance graph — the real custody gate result when the
  // console has one, else the record's own custody block; null (drawn as "not recorded") otherwise.
  const custodyView: CustodyView | null = custody !== null && custody.record?.artifact !== null && custody.record?.artifact !== undefined
    ? { sourceId: custody.sourceId, hash: custody.record.artifact.hash, status: custody.ok ? 'FROZEN' : 'FAILED' }
    : winnerRecord?.kind === 'WINNER_RECORD' ? winnerRecord.evidenceCustody : null;

  const replayCol = (label: string, r: GenesisDomainReplayResult['first']): React.ReactElement => (
    <div className="gu-replay-col">
      <h5>{label}</h5>
      {r.kind === 'RUN' ? (
        <>
          <div>verdict <strong>{r.verdict}</strong>{r.winner !== undefined && <> · winner <code>{r.winner.winnerId}</code></>}</div>
          <div>audit <code>{r.auditFingerprint}</code></div>
          {r.recipeFingerprint !== undefined && <div>recipe <code>{r.recipeFingerprint}</code></div>}
          {'winnerRecord' in r && r.winnerRecord?.kind === 'WINNER_RECORD' && <div>record <code>{r.winnerRecord.recordFingerprint}</code></div>}
          <div>{r.stages.length} stages</div>
        </>
      ) : (
        <div>EXECUTION_BLOCKED <code>{r.fingerprint}</code></div>
      )}
    </div>
  );

  return (
    <main className="settings-view" id="main-content" tabIndex={-1}>
      <section className="settings-section">
        <h2>Genesis Research Console</h2>
        <textarea
          value={nl}
          onChange={(e) => setNl(e.target.value)}
          rows={3}
          style={{ width: '100%', marginTop: 10 }}
          data-guide="question"
          aria-label="Pytanie badawcze"
        />
        <div className="gu-locale-switch" style={{ margin: '8px 0', flexWrap: 'wrap' }}>
          {([
            ['SANDBOX', 'SANDBOX (toy adapters)'],
            ['REAL_PRODUCTION', 'REAL — LOWER-HARM (production data)'],
            ['REAL_SYNTHETIC_WINNER_DEMO', 'REAL — LOWER-HARM (synthetic winner demo)'],
          ] as const).map(([value, label]) => (
            <button key={value} type="button" className={source === value ? 'chip-btn primary' : 'chip-btn'} onClick={() => setSource(value)}>
              {label}
            </button>
          ))}
        </div>
        {source !== 'SANDBOX' && (
          <>
            <div className="gu-locale-switch" style={{ margin: '4px 0', flexWrap: 'wrap' }}>
              {/* This screen only ever constructs the LOWER_HARM/E2E01 shared options shape
                  (mode/nl/problemInput below) — MIND's RunResearchOptions (problem/maxRounds/
                  makeRoundOptions/shouldContinue) has no source here, so it is excluded from this
                  selector rather than offered and then failing closed on every click. MIND already
                  has its own real, working entry point: the MindPanel section rendered further
                  down this console. */}
              {GENESIS_DOMAINS.filter((d) => d.domainId !== 'MIND').map((d) => (
                <button key={d.domainId} type="button" className={domainId === d.domainId ? 'chip-btn primary' : 'chip-btn'} onClick={() => setDomainId(d.domainId)} title={d.label}>
                  {d.domainId}
                </button>
              ))}
            </div>
            <label className="gu-hint" style={{ display: 'block', margin: '4px 0' }}>
              <input type="checkbox" checked={vagueProblem} onChange={(e) => setVagueProblem(e.target.checked)} />
              {' '}Submit as a vague problem (text only, no objectives/evidenceMinimum) — tests the real fail-closed NEEDS_INPUT path
            </label>
          </>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0' }}>
          <button type="button" className="chip-btn primary" onClick={() => void start()} disabled={busy}>
            {busy ? 'Running…' : 'Run full scientific process'}
          </button>
          {guideMode === null && (
            <>
              <button type="button" className="chip-btn" onClick={() => setGuideMode('GUIDED')} data-testid="start-guide">✦ Zobacz, jak to działa</button>
              <button type="button" className="chip-btn" onClick={() => { window.location.hash = '#/tour'; }} data-testid="start-tour">▶ Genesis Tour</button>
            </>
          )}
          <FingerprintChip
            label="source"
            value={
              source === 'SANDBOX'
                ? 'SANDBOX: SYNTHETIC_TEST_ONLY adapters (no real module underneath)'
                : source === 'REAL_PRODUCTION'
                  ? 'REAL: real ChEMBL + ClinicalTrials.gov pinned data through the real pipeline'
                  : 'REAL PIPELINE, SYNTHETIC_TEST_ONLY evidence (engineered winner demo)'
            }
          />
        </div>
        {custody !== null && (
          <p className="gu-hint" style={{ color: custody.ok ? undefined : 'var(--gold)' }}>
            EVIDENCE CUSTODY: {custody.ok ? 'FROZEN + replay-verified' : `FAILED — ${custody.reason}`}
            {custody.record?.artifact !== null && custody.record?.artifact !== undefined && (
              <> (artifactId {custody.record.artifact.artifactId}, {custody.record.artifact.hashPolicy} {custody.record.artifact.hash.slice(0, 12)}…)</>
            )}
          </p>
        )}
      </section>

      {blocked !== null && (
        <section className="settings-section">
          <div className="gu-locked-panel">
            <div className="gu-locked-icon">⛔</div>
            <h3>EXECUTION_BLOCKED [{blocked.code}]</h3>
            <p>{blocked.error}</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {ranDomainId !== null && <FingerprintChip label="domain" value={ranDomainId} />}
              <FingerprintChip label="fp" value={blocked.fingerprint} />
            </div>
          </div>
        </section>
      )}

      {run === null && blocked === null && (
        <section className="settings-section">
          <p className="empty-state">Nothing is computed until you click. This screen never shows a result that did not run.</p>
        </section>
      )}

      {run !== null && run.verdict === 'ABORTED' && (
        <section className="settings-section">
          <div className="gu-locked-panel">
            <div className="gu-locked-icon">⛔</div>
            <h3>ABORT: {run.abortReason}</h3>
            <p>{run.stages[0]?.note}</p>
          </div>
        </section>
      )}

      {run !== null && run.verdict !== 'ABORTED' && (
        <>
          <RunVerdictHero run={run} detail={detail} record={winnerRecord} seal={auditSeal} ledger={ledger} />

          <section className="settings-section">
            <PipelineTimeline stages={run.stages} />
            <details className="gu-timeline-details">
            <summary>Stage records — full fingerprints and notes</summary>
            <ul className="gu-conjunct-list">
              {run.stages.map((s) => (
                <li key={s.stage} className={`gu-conjunct-item ${s.status === 'OK' ? 'gu-conjunct-held' : 'gu-conjunct-failed'}`}>
                  <span className="gu-conjunct-name">
                    {s.status} — {s.stage}
                  </span>
                  <div className="gu-conjunct-detail">
                    <FingerprintChip label="fp" value={s.fingerprint.slice(0, 10)} />
                    {s.note !== undefined && <span> {s.note}</span>}
                  </div>
                </li>
              ))}
            </ul>
            </details>
          </section>

          {detail !== undefined && (
            <section className="settings-section" id="candidate-space">
              <CandidateSpacePanel candidates={detail.candidates} />
            </section>
          )}

          {detail !== undefined && (
            <section className="settings-section" id="winner-gate">
              <WinnerGatePanel detail={detail} record={winnerRecord} />
            </section>
          )}

          {detail !== undefined && (
            <section className="settings-section">
              <h3 className="section-label">Evidence provenance — source → custody → observations → candidates → G2 → gate → outcome</h3>
              <ProvenanceDag detail={detail} record={winnerRecord} custody={custodyView} />
            </section>
          )}

          <section className="settings-section" id="winner-record">
            <VerdictBanner label={run.verdict} reason={detail?.verdictReason ?? undefined} />
            {winnerRecord?.kind === 'WINNER_RECORD' ? (
              <>
                <ResearchRecipePanel record={winnerRecord} />
                <p className="gu-hint" style={{ marginTop: 10 }}>
                  <a className="chip-btn" href="#/discovery-hall" data-testid="open-discovery-hall">Open Discovery Hall — the canonical LOWER-HARM run narrated in the 3D lab</a>
                </p>
              </>
            ) : (
              <p className="gu-hint">
                {run.recipeFingerprint !== undefined
                  ? <>RESEARCH RECIPE: READY — fp {run.recipeFingerprint.slice(0, 12)}…</>
                  : <>RESEARCH RECIPE: LOCKED — NO_RECIPE_WITHOUT_WINNER</>}
              </p>
            )}
            {run.nextExperiment !== undefined && <p className="gu-hint">NEXT EXPERIMENT: {run.nextExperiment}</p>}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {ranDomainId !== null && <FingerprintChip label="domain" value={ranDomainId} />}
              <FingerprintChip label="mode" value={run.mode} />
              <FingerprintChip label="run audit" value={run.auditFingerprint.slice(0, 12)} />
              {run.stages.find((s) => s.stage === '10_FREEZE_PREREG') !== undefined && (
                <FingerprintChip label="prereg fp" value={(run.stages.find((s) => s.stage === '10_FREEZE_PREREG')?.fingerprint ?? '').slice(0, 12)} />
              )}
            </div>
          </section>

          {source !== 'SANDBOX' && ranDomainId !== null && (
            <section className="settings-section gu-replay" data-testid="replay-section">
              <h3 className="section-label">Replay / determinism</h3>
              <p className="gu-hint">Runs the same domain entry point twice more, from scratch, and compares the audit fingerprints. The result below is whatever replay returned — MATCH is never assumed.</p>
              <div>
                <button type="button" className="chip-btn primary" onClick={() => void verifyReplay()} disabled={replayBusy}>
                  {replayBusy ? 'Replaying…' : 'Replay & verify'}
                </button>
              </div>
              {replay !== null && (
                <div className={replay.ok ? 'gu-replay-match' : 'gu-replay-drift'} data-testid="replay-result">
                  <div className="gu-replay-verdict">{replay.ok ? 'MATCH — both independent runs produced the identical audit fingerprint and verdict' : 'DRIFT — the two runs differ; this result cannot be trusted until the cause is known'}</div>
                  <div className="gu-replay-twin">
                    {replayCol('RUN A', replay.first)}
                    {replayCol('RUN B', replay.second)}
                  </div>
                  <ReplayTwinPanel replay={replay} />
                </div>
              )}
            </section>
          )}
        </>
      )}

      {/* D-118: the sandbox and service panels are still here, behind one disclosure, so the
          page ends where the run's answer ends instead of trailing into unrelated experiments. */}
      {guideMode !== null && (
        <GuidedDiscovery
          key={guideMode}
          autoplay={guideMode}
          result={guideResult}
          running={busy}
          replay={replay}
          replayBusy={replayBusy}
          onRun={() => { void start(); }}
          onReplay={() => { void verifyReplay(); }}
          onPrepareTour={() => { setSource('REAL_PRODUCTION'); setDomainId('LOWER_HARM'); setNl(CANONICAL_QUESTION); }}
          onExit={() => setGuideMode(null)}
        />
      )}

      <details className="gu-sandbox">
        <summary className="gu-sandbox-summary">Inne eksperymenty i usługi — Genesis Mind, Discovery Challenge, usługi rządowe, status źródeł dowodów</summary>
        <MindPanel />
        <ChallengePanel />
        <GovServicesPanel />
        <EvidenceSourceStatusPanel />
      </details>
    </main>
  );
}
