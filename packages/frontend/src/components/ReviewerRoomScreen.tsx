import { useEffect, useState } from 'react';
import type React from 'react';
import { codeCommitHash } from '../core/build/commitHash';
import { realClaimCounts, runTamperChallenge, SURPASS2_PINNED_SHA256, type TamperChallengeOutcome, type TamperRun } from '../core/reviewer/tamperChallenge';
import { D063_CLAIM_TEXT } from '../core/govServices/govServiceRuns';
import { DOCKING_SOURCE, RETRO_EVIDENCE, verifyDockingInputs, type FileCheck } from '../core/reviewer/drugEvidence';
import { ASTEX_PREREG, ASTEX_RUNS, imatinibKitCase, type BenchmarkRun } from '../core/reviewer/dockingBenchmark';
import {
  COMMITTED_CERTIFICATE, GENESIS_KEY_FILE, REDOCK_CERTIFICATE_PATH, REDOCK_EVIDENCE_PATH, REDOCK_RECORD, REDOCK_RECORD_TEXT,
  forgeCertificate, recordedBestScoreText, relabelled, verifyEvidence, withEditedBestScore,
  type EvidenceVerification,
} from '../core/reviewer/signedEvidence';
import { ScientificIngestionPanel } from './ScientificIngestionPanel';
import { VerifyResultLink } from './verify/VerifyResultLink';
import { latestResult } from '../core/verifyTarget';
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

const SIGNER_TEXT: Record<EvidenceVerification['signer'], string> = {
  SIGNED_BY_GENESIS_KEY: 'Signed by the published Genesis key',
  SIGNED_UNTRUSTED: 'SIGNED_UNTRUSTED · valid signature, but NOT by the Genesis key',
  UNSIGNED: 'Not signed yet · the Genesis key has not been generated',
  NOT_CHECKED: 'Not checked · the evidence already failed',
};

function VerificationBox({ title, v }: { title: string; v: EvidenceVerification }): React.ReactElement {
  const good = v.unaltered && v.signer !== 'SIGNED_UNTRUSTED';
  return (
    <div className="rv-step">
      <h3>{title}</h3>
      <div className={`rv-verdict ${good ? 'rv-good' : 'rv-bad'}`}>
        <strong>
          {!v.unaltered ? 'VERIFICATION FAILED · evidence or certificate changed'
            : v.signer === 'SIGNED_UNTRUSTED' ? 'NOT TRUSTED · hashes consistent, but signed by a key that is not Genesis\'s'
              : 'Evidence unaltered'}
        </strong>
        <span>1 · Classification: {v.epistemicStatus ?? 'none'} {v.unaltered ? '(bound by the certificate, unchanged by verification)' : '(as this certificate claims it; not accepted)'}</span>
        <span>2 · Unaltered: {v.unaltered ? 'yes' : 'no'} (certificate audit {v.auditVerdict}; file {v.fileMatches ? 'matches' : 'does NOT match'} the certified SHA-256)</span>
        <span>3 · Signer: {SIGNER_TEXT[v.signer]}</span>
      </div>
      <p className="rv-hash">
        Certified file SHA-256 <code>{short(v.certifiedFileSha256)}</code><br />
        Presented file SHA-256 <code>{short(v.presentedFileSha256)}</code><br />
        Signer key id <code>{v.signerKeyId ? short(v.signerKeyId) : 'none'}</code>
      </p>
    </div>
  );
}

function SignedEvidenceChallenge(): React.ReactElement {
  const recorded = recordedBestScoreText();
  const [value, setValue] = useState(recorded);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ original: EvidenceVerification; edited: EvidenceVerification; promoted: EvidenceVerification; forged: EvidenceVerification } | null>(null);
  const key = GENESIS_KEY_FILE;

  const run = async (): Promise<void> => {
    setBusy(true);
    try {
      const editedText = withEditedBestScore(value.trim() === '' ? recorded : value.trim());
      setResults({
        original: await verifyEvidence(REDOCK_RECORD_TEXT),
        edited: await verifyEvidence(editedText),
        promoted: await verifyEvidence(REDOCK_RECORD_TEXT, relabelled(COMMITTED_CERTIFICATE, 'REAL_MEASUREMENT')),
        forged: await verifyEvidence(editedText, await forgeCertificate(editedText)),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rv-card" aria-labelledby="rv-c7">
      <p className="rv-kicker">Challenge 3 · signed evidence</p>
      <h2 id="rv-c7">Change one number in the evidence. Watch the certificate check fail.</h2>
      <p>
        The record is a real docking run: imatinib redocked into the ABL1 kinase (PDB {REDOCK_RECORD.protocol.pdbId}) with AutoDock Vina{' '}
        {REDOCK_RECORD.engines.vina} and Meeko {REDOCK_RECORD.engines.meeko}, several seeds, positive and negative controls, the
        protocol fixed before the run. Its certificate is committed next to it and checked here, in your browser, with the CSRN
        certificate layer (ECDSA P-256 over SHA-256). The claim, its classification, the evidence identity and the chain
        protocol → run → committed file all enter the certified payload. Your browser verifies; it never signs on Genesis's behalf.
      </p>
      <p className="rv-hash">
        Genesis key id{' '}
        {key.status === 'ACTIVE' && key.keyId ? <code>{key.keyId}</code> : <strong>not generated yet (status {key.status})</strong>}
        <br />Published at <code>/.well-known/genesis-csrn-key.json</code> and <code>docs/keys/genesis-csrn-signing-key.json</code>. Key id = {key.keyIdMethod}
        <br />Certificate <code>{COMMITTED_CERTIFICATE.certId}</code> · certified payload <code>{short(COMMITTED_CERTIFICATE.integrity.signedPayloadFingerprint)}</code>
      </p>
      <div className="rv-controls">
        <label>
          Best Vina score in the file (recorded {recorded} kcal/mol)
          <input type="text" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <button type="button" className="rv-btn" disabled={busy} onClick={() => void run()}>{busy ? 'Verifying…' : 'Verify'}</button>
      </div>
      {results && (
        <div className="rv-grid3">
          <VerificationBox title="A · The committed file" v={results.original} />
          <VerificationBox title={`B · The file with your value (${value.trim() || recorded})`} v={results.edited} />
          <VerificationBox title="C · Same file, label changed to REAL_MEASUREMENT" v={results.promoted} />
          <VerificationBox title="D · Your file, re-certified and signed by someone else's key" v={results.forged} />
        </div>
      )}
      <p className="rv-note">
        What the check means: the evidence was not changed after it was certified, and, once the Genesis key exists, that the holder
        of that key certified it. What it does not mean: that the score was measured or validated in a laboratory. A certified
        MODEL_ESTIMATE is still a MODEL_ESTIMATE, and in C the attempt to call it a measurement breaks the certificate instead of
        upgrading it. In D the forger rebuilt every hash and signed correctly, but with a key that is not Genesis&apos;s, so it stays
        SIGNED_UNTRUSTED. This is a technical integrity signature, not a qualified or legal electronic signature.
      </p>
      <p className="rv-foot">Record: <code>{REDOCK_EVIDENCE_PATH}</code> (run body SHA-256 <code>{short(REDOCK_RECORD.bodySha256)}</code>, protocol <code>{short(REDOCK_RECORD.protocolFingerprint)}</code>). Certificate: <code>{REDOCK_CERTIFICATE_PATH}</code>. Engines: <code>packages/csrn</code>, <code>core/reviewer/redockCertificate.ts</code>.</p>
    </section>
  );
}

function RunSummary({ run, label }: { run: BenchmarkRun; label: string }): React.ReactElement {
  const s = run.summary;
  const kit = imatinibKitCase(run);
  return (
    <div className="rv-step">
      <h3>{label}</h3>
      <p className="rv-big">{s.successes}<span> / {s.cases}</span></p>
      <p className="rv-note">
        top pose within 2 Å of the crystal pose ({(100 * s.successRate).toFixed(1)}% of all 85). {s.docked} complexes docked,
        of which {s.successes} succeeded ({(100 * s.successRateAmongDocked).toFixed(0)}%). {s.preparationOrDockingFailures} failed
        before a pose existed and count as failures.
      </p>
      {kit && <p className="rv-note">Imatinib in c-KIT (1T46): {kit.rmsdA !== undefined ? `${kit.rmsdA.toFixed(2)} Å` : kit.status}.</p>}
      <p className="rv-hash">Protocol <code>{run.protocolFingerprint.slice(0, 12)}</code> · Vina {run.versions.vina} · Meeko {run.versions.meeko}</p>
    </div>
  );
}

function DockingBenchmark(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [run1, run2, run3] = ASTEX_RUNS;
  const by2 = new Map(run2.cases.map((c) => [c.pdbId, c]));
  const by3 = new Map(run3.cases.map((c) => [c.pdbId, c]));
  return (
    <section className="rv-card" aria-labelledby="rv-c5">
      <p className="rv-kicker">Challenge 4 · one example is an anecdote</p>
      <h2 id="rv-c5">85 known drug–protein complexes, including every failure.</h2>
      <p>
        The Astex Diverse Set (Hartshorn et al., J. Med. Chem. 2007) is a standard test: 85 crystal structures where the true position
        of the drug is known. Genesis removes each drug, docks it back with the same code used for imatinib above, and measures how
        far the top pose lands from the crystal. The protocol and case list were committed before the run; every change made after a
        trial run is recorded with its reason ({ASTEX_PREREG.amendments.length} amendments).
      </p>
      <div className="rv-grid3">
        <RunSummary run={run1} label="Run 1 · protocol as frozen" />
        <RunSummary run={run2} label="Run 2 · tolerant protein preparation (declared after run 1)" />
        <RunSummary run={run3} label="Run 3 · cofactors kept, preparation failures fixed (declared after run 2)" />
      </div>
      <p className="rv-note">
        Each run was added after seeing the previous one fail, and each is shown beside the others, never instead of them. Run 2
        tolerated incomplete side chains. Run 3 keeps cofactors near the site, drops ions Meeko cannot type, and takes ligand
        elements from the chemical dictionary rather than the file; it is the first run in which all 85 complexes produced a pose.
        Keeping cofactors did not by itself flip any case: the five new successes all came from the preparation fixes. Protein
        preparation stays automatic, with nothing curated by hand. Results on this set depend strongly on preparation; these
        numbers are what this pipeline does unattended.
      </p>
      <button type="button" className="rv-btn rv-btn-quiet" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? 'Hide the 85 cases' : 'Show all 85 cases'}
      </button>
      {open && (
        <div className="rv-table">
          <table>
            <thead><tr><th>PDB</th><th>Ligand</th><th>Run 1</th><th>Run 2</th><th>Run 3</th></tr></thead>
            <tbody>
              {run1.cases.map((c) => {
                const c2 = by2.get(c.pdbId);
                const c3 = by3.get(c.pdbId);
                const cell = (x: typeof c | undefined): React.ReactNode =>
                  x === undefined ? '—' : x.rmsdA !== undefined
                    ? <span className={`rv-tag ${x.success ? 'rv-tag-good' : 'rv-tag-bad'}`}>{x.rmsdA.toFixed(2)} Å</span>
                    : <span className="rv-tag rv-tag-bad" title={x.error}>{x.status === 'DOCKING_FAILED' ? 'prep failed' : x.status.toLowerCase()}</span>;
                return <tr key={c.pdbId}><td>{c.pdbId}</td><td>{c.ligandResidue ?? '—'}</td><td>{cell(c)}</td><td>{cell(c2)}</td><td>{cell(c3)}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="rv-foot">Records: <code>docs/evidence/astex-redock-prereg.json</code>, <code>astex-redock-benchmark-2026-09-27-run1.json</code>, <code>-run2.json</code>, <code>-run3.json</code>. Re-run: <code>python3 scripts/astex-redock-benchmark.py --data p2rank-datasets/joined/astex</code></p>
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
        <li><strong>The GLP-1 receptor model fails its own gate.</strong> Its best error is 1.0118 on 638 measured compounds against a limit of 1.0 (decision D-144; 1.17 on the first 287, D-077a). It is not used to rank anything.</li>
        <li><strong>Docking scores are model estimates, not measured binding.</strong> A replay MATCH shows a computation reproduced; a valid signature shows the evidence was not altered. Neither is a laboratory result, and Genesis refuses to relabel a model estimate as a measurement on either basis.</li>
        <li><strong>No laboratory has tested a Genesis prediction yet.</strong> Every result here is computational, and labelled so.</li>
        <li>The cyber-security module has only been shown on a fictional test application. Medical-imaging readers have not yet been run on a real scan.</li>
      </ul>
    </section>
  );
}

/**
 * The challenges above check committed evidence. This card turns to the reviewer's own result: the
 * latest executed experiment shown in this visit (a research run in the chat or Flight Control) goes
 * to Genesis Verify already picked. Without one, Verify opens on its own picker; nothing is guessed.
 */
function VerifyYourResult(): React.ReactElement {
  const target = latestResult();
  return (
    <section className="rv-card" aria-labelledby="rv-c5" data-testid="rv-verify">
      <p className="rv-kicker">Your own result</p>
      <h2 id="rv-c5">Verify a result of your own research run.</h2>
      <p>
        Genesis Verify takes the record of one executed experiment, compares its fingerprints with the Genesis ledger and replays the
        computation. You get one verdict and an HTML report you can send on.
      </p>
      {target
        ? <VerifyResultLink target={target} locale="en" testId="rv-verify-this-result" />
        : (
          <>
            <p className="rv-note" data-testid="rv-verify-none">No executed experiment in this visit yet. Pick a research run and an experiment in Genesis Verify.</p>
            <a className="verify-result-link" href="#/verify" data-testid="rv-open-verify">Open Genesis Verify</a>
          </>
        )}
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
  // `#/reviewer?focus=<section heading id>` (linked from Start) opens the page at that challenge.
  useEffect(() => {
    const focus = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('focus');
    if (focus) document.getElementById(focus)?.scrollIntoView({ block: 'start' });
  }, []);
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
      <SignedEvidenceChallenge />
      <DockingBenchmark />
      <ScientificIngestionPanel />
      <VerifyYourResult />
      <Boundaries />
      <Reproduce />
    </main>
  );
}
