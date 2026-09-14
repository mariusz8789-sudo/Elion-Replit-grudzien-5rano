import { useState } from 'react';
import type React from 'react';
import { runScientificDiscovery } from '../core/orchestrator/orchestrator';
import { parseProblem } from '../core/orchestrator/nl';
import { toyAdapters } from '../core/orchestrator/toyAdapters';
import type { ExecutionBlockedResult } from '../core/orchestrator/govLowerHarmDiscovery';
import { GENESIS_DOMAINS, runGenesisDomainDiscovery, type GenesisDomainId } from '../core/orchestrator/genesisDomainRegistry';
import type { EvidenceCustodyResult } from '../core/orchestrator/evidenceCustody';
import type { DiscoveryRun } from '../core/orchestrator/contracts';
import { VerdictBanner } from './genesis-ui/VerdictBanner';
import { FingerprintChip } from './genesis-ui/FingerprintChip';
import { EvidenceSourceStatusPanel } from './genesis-ui/EvidenceSourceStatusPanel';
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

export function GenesisConsole(): React.ReactElement {
  const [nl, setNl] = useState(DEFAULT_NL);
  const [source, setSource] = useState<Source>('SANDBOX');
  const [domainId, setDomainId] = useState<GenesisDomainId>('LOWER_HARM');
  const [vagueProblem, setVagueProblem] = useState(false);
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<DiscoveryRun | null>(null);
  const [ranDomainId, setRanDomainId] = useState<GenesisDomainId | null>(null);
  const [blocked, setBlocked] = useState<ExecutionBlockedResult | null>(null);
  const [custody, setCustody] = useState<EvidenceCustodyResult | null>(null);

  const start = async (): Promise<void> => {
    setBlocked(null);
    setCustody(null);
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
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-view">
      <section className="settings-section">
        <h2>Genesis Research Console</h2>
        <textarea
          value={nl}
          onChange={(e) => setNl(e.target.value)}
          rows={3}
          style={{ width: '100%', marginTop: 10 }}
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
          <section className="settings-section">
            <h3 className="section-label">Stages</h3>
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
          </section>

          <section className="settings-section">
            <VerdictBanner label={run.verdict} />
            <p className="gu-hint">
              {run.recipeFingerprint !== undefined
                ? <>RESEARCH RECIPE: READY — fp {run.recipeFingerprint.slice(0, 12)}…</>
                : <>RESEARCH RECIPE: LOCKED — NO_RECIPE_WITHOUT_WINNER</>}
            </p>
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
        </>
      )}

      <MindPanel />
      <ChallengePanel />
      <GovServicesPanel />
      <EvidenceSourceStatusPanel />
    </div>
  );
}
