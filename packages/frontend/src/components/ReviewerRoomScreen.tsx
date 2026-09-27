import { useState } from 'react';
import type React from 'react';
import { codeCommitHash } from '../core/build/commitHash';
import { realClaimCounts, runTamperChallenge, SURPASS2_PINNED_SHA256, type TamperChallengeOutcome, type TamperRun } from '../core/reviewer/tamperChallenge';
import { D063_CLAIM_TEXT } from '../core/govServices/govServiceRuns';
import { DOCKING_SOURCE, RETRO_EVIDENCE, verifyDockingInputs, type FileCheck } from '../core/reviewer/drugEvidence';
import './reviewerRoom.css';

/**
 * #/reviewer — REVIEWER ROOM. One screen for a grant or investor reviewer
 * who has no reason to believe anything we write.
 *
 * Every verdict on this page is computed in the reviewer's browser, on
 * click, by the same engines the rest of Genesis runs (see
 * `core/reviewer/*`). The page computes nothing itself: it only shows what
 * those functions returned. English on purpose: it is the working language
 * of the reviewers it is built for.
 */

const short = (h: string): string => `${h.slice(0, 12)}…${h.slice(-6)}`;

function Verdict({ run }: { run: TamperRun }): React.ReactElement {
  if (run.result.kind === 'EXECUTION_BLOCKED') {
    return (
      <div className="rv-verdict rv-bad">
        <strong>FAIL CLOSED · {run.result.code}</strong>
        <span>No certificate. {run.result.error.replace(/^FAIL_CLOSED\[[A-Z_]+\]: /, '')}</span>
      </div>
    );
  }
  const ok = run.result.verdict === 'SUBSTANTIATED';
  return (
    <div className={`rv-verdict ${ok ? 'rv-warn' : 'rv-good'}`}>
      <strong>{run.result.verdict}</strong>
      <span>{run.result.certificate ? `Certificate ${run.result.certificate.certificateId} issued.` : 'No certificate issued.'}</span>
      {run.result.evidence.map((e) => <code key={e.ref}>{e.supports.toUpperCase()} · {e.evidenceClass} · {e.ref}</code>)}
    </div>
  );
}

function HashLine({ run }: { run: TamperRun }): React.ReactElement {
  return (
    <p className="rv-hash">
      SHA-256 of the data it read: <code>{short(run.sha256)}</code>{' '}
      {run.matchesAnchor ? <span className="rv-tag rv-tag-good">matches the published anchor</span> : <span className="rv-tag rv-tag-bad">does NOT match the published anchor</span>}
    </p>
  );
}

function TamperChallenge(): React.ReactElement {
  const counts = realClaimCounts();
  const [forged, setForged] = useState(30);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<TamperChallengeOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      setOut(await runTamperChallenge(forged));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const pct = (a: number, n: number): string => `${((100 * a) / n).toFixed(1)}%`;

  return (
    <section className="rv-card" aria-labelledby="rv-c1">
      <p className="rv-kicker">Challenge 1 · claim audit on a real clinical trial</p>
      <h2 id="rv-c1">Try to fake the data. See if Genesis certifies it.</h2>
      <p>
        A sponsor submits this claim, judged on the published results of SURPASS-2 (NCT03987919), a randomised trial of four treatment arms:
      </p>
      <blockquote className="rv-claim">&ldquo;{D063_CLAIM_TEXT}&rdquo;</blockquote>
      <table className="rv-table">
        <thead><tr><th>Arm</th><th>Diarrhoea (real)</th><th>Rate</th></tr></thead>
        <tbody>
          <tr><td>{counts.exposed.arm}</td><td>{counts.exposed.affected} / {counts.exposed.atRisk}</td><td>{pct(counts.exposed.affected, counts.exposed.atRisk)}</td></tr>
          <tr><td>{counts.reference.arm}</td><td>{counts.reference.affected} / {counts.reference.atRisk}</td><td>{pct(counts.reference.affected, counts.reference.atRisk)}</td></tr>
        </tbody>
      </table>
      <p>
        The real numbers go against the claim. Now play the dishonest sponsor: rewrite one number, the diarrhoea cases in the
        tirzepatide arm, to something lower than {counts.reference.affected}, and run the audit.
      </p>
      <div className="rv-controls">
        <label>
          Forged cases in {counts.exposed.arm}
          <input type="number" min={0} max={counts.exposed.atRisk} value={forged} onChange={(e) => setForged(Math.max(0, Math.floor(Number(e.target.value) || 0)))} />
        </label>
        <button type="button" className="rv-btn" disabled={busy} onClick={() => void run()}>{busy ? 'Running…' : 'Run the audit'}</button>
      </div>
      {error && <p className="rv-verdict rv-bad">{error}</p>}
      {out && (
        <div className="rv-grid3">
          <div className="rv-step">
            <h3>A · Real data</h3>
            <HashLine run={out.real} />
            <Verdict run={out.real} />
            <p className="rv-note">The claim is refused on the real counts. No certificate.</p>
          </div>
          <div className="rv-step">
            <h3>B · Your forged number, same custody chain</h3>
            <HashLine run={out.forged} />
            <Verdict run={out.forged} />
            <p className="rv-note">The evidence was frozen before you edited it. The change is detected and the audit stops.</p>
          </div>
          <div className="rv-step">
            <h3>C · Forged data with no anchor (shown on purpose)</h3>
            <HashLine run={out.unanchored} />
            <Verdict run={out.unanchored} />
            <p className="rv-note">
              Arithmetic alone cannot tell forged numbers from real ones. What exposes them is the hash: it no longer matches the anchor
              published in the repository. That is why every Genesis run pins its data before it computes.
            </p>
          </div>
        </div>
      )}
      <p className="rv-foot">Published anchor for the pinned SURPASS-2 record: <code>{SURPASS2_PINNED_SHA256}</code></p>
    </section>
  );
}

function DrugPipeline(): React.ReactElement {
  const [checks, setChecks] = useState<readonly FileCheck[] | null>(null);
  const [busy, setBusy] = useState(false);
  const route = RETRO_EVIDENCE.synthesis.topRoute;

  const verify = async (): Promise<void> => {
    setBusy(true);
    try {
      setChecks(await verifyDockingInputs());
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rv-card" aria-labelledby="rv-c2">
      <p className="rv-kicker">Challenge 2 · the drug pipeline on a known answer</p>
      <h2 id="rv-c2">Check that the inputs are the published ones.</h2>
      <p>
        Benchmark: {DOCKING_SOURCE.referenceLigand.name} against {DOCKING_SOURCE.protein} (PDB {DOCKING_SOURCE.pdbId}). The answer is known
        from the crystal structure, so the pipeline can be checked against it. Docking with AutoDock Vina must put the ligand back within
        2 Å of its crystal pose (test <code>proteinDocking.test.mjs</code>).
      </p>
      <button type="button" className="rv-btn" disabled={busy} onClick={() => void verify()}>{busy ? 'Hashing…' : 'Re-hash the docking inputs in my browser'}</button>
      {checks && (
        <table className="rv-table">
          <thead><tr><th>File</th><th>Manifest SHA-256</th><th>Your browser</th><th /></tr></thead>
          <tbody>
            {checks.map((c) => (
              <tr key={c.file}>
                <td><a href={c.upstreamUrl} target="_blank" rel="noreferrer">{c.file}</a><br /><small>{c.bytes.toLocaleString('en')} bytes</small></td>
                <td><code>{short(c.expected)}</code></td>
                <td><code>{short(c.computed)}</code></td>
                <td>{c.match ? <span className="rv-tag rv-tag-good">match</span> : <span className="rv-tag rv-tag-bad">MISMATCH</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="rv-note">The file names link to the upstream AutoDock Vina repository. Download one and run <code>sha256sum</code>: you get the same value.</p>

      <h3>Retrosynthesis: how would a chemist make it?</h3>
      <p>
        {RETRO_EVIDENCE.synthesis.engine}, run {RETRO_EVIDENCE.finishedAt.slice(0, 10)}. Replay on the same models:{' '}
        <span className={`rv-tag ${RETRO_EVIDENCE.replayVerdict === 'MATCH' ? 'rv-tag-good' : 'rv-tag-bad'}`}>{RETRO_EVIDENCE.replayVerdict}</span>.
        Control case {RETRO_EVIDENCE.reference.case}: {RETRO_EVIDENCE.reference.pass ? 'passed' : 'failed'}.
      </p>
      <ol className="rv-route">
        {route.reactionsForward.map((s) => (
          <li key={s.step}><code>{s.reactionSmiles}</code> <small>{s.policy} policy, p = {s.policyProbability.toFixed(3)}</small></li>
        ))}
      </ol>
      <p>
        {route.startingMaterials.length} starting materials, {route.allStartingMaterialsInStock ? 'all in the ZINC purchasable stock' : 'not all in stock'}.
        Run hashes: input <code>{short(RETRO_EVIDENCE.run.inputHash)}</code>, output <code>{short(RETRO_EVIDENCE.run.outputHash)}</code>,
        environment <code>{short(RETRO_EVIDENCE.run.environmentHash)}</code>.
      </p>
      <p className="rv-note">
        Evidence class: {RETRO_EVIDENCE.synthesis.evidenceClass}. This is a model&apos;s proposal for a known drug, not a compound made in a
        laboratory. Full record: <code>docs/evidence/imatinib-retrosynthesis-2026-09-27.json</code>.
      </p>
    </section>
  );
}

function Boundaries(): React.ReactElement {
  return (
    <section className="rv-card" aria-labelledby="rv-c3">
      <p className="rv-kicker">What Genesis does not claim</p>
      <h2 id="rv-c3">Negative and unfinished results, stated first.</h2>
      <ul className="rv-list">
        <li><strong>No new drug has been discovered.</strong> The one candidate ranked a winner so far, liraglutide, is already an approved medicine.</li>
        <li><strong>The GLP-1 receptor model fails its own gate</strong> (error 1.17 against a limit of 1.0). It is not used to rank anything; the reason is documented in decision D-077a.</li>
        <li><strong>No laboratory has tested a Genesis prediction yet.</strong> Every result here is computational, and labelled so.</li>
        <li>The cyber-security module has only been shown on a fictional test application. Medical-imaging readers have not yet been run on a real scan.</li>
      </ul>
    </section>
  );
}

function Reproduce(): React.ReactElement {
  return (
    <section className="rv-card" aria-labelledby="rv-c4">
      <p className="rv-kicker">Re-run it without us</p>
      <h2 id="rv-c4">Three commands on your own machine.</h2>
      <pre className="rv-pre">{`git clone https://github.com/mariusz8789-sudo/Elion-Replit-grudzien-5rano
cd Elion-Replit-grudzien-5rano && npm ci
npm run e2e:gov-wow          # 22 properties of the claim audit, on SURPASS-2
npx vitest run --root packages/frontend reviewer   # this page's engines`}</pre>
      <p className="rv-foot">This build: <code>{codeCommitHash()}</code></p>
    </section>
  );
}

export function ReviewerRoomScreen(): React.ReactElement {
  return (
    <main className="rv-room" id="main-content" tabIndex={-1} lang="en" dir="ltr">
      <header className="rv-hero">
        <p className="rv-kicker">Genesis · Reviewer Room</p>
        <h1>Don&apos;t take our word for it.</h1>
        <p>
          Genesis runs computational experiments and checks them: every result carries its data, its hashes and a replay. On this page the
          checks run in your browser, when you click, on data committed to a public repository.
        </p>
      </header>
      <TamperChallenge />
      <DrugPipeline />
      <Boundaries />
      <Reproduce />
    </main>
  );
}
