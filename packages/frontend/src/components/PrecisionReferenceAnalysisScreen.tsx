import { useState } from 'react';
import {
  buildPrecisionEvidencePack,
  buildSavedPrecisionAnalysisRun,
  replaySavedPrecisionAnalysisRun,
  type SavedPrecisionAnalysisRun,
} from '../core/discovery/molecular/precisionEvidencePack';
import {
  runPrecisionReferenceAnalysis,
  type PrecisionCompoundRequest,
  type PrecisionReferenceAnalysisResult,
} from '../core/discovery/molecular/precisionReferenceAnalysis';
import { unavailableLookupTransport } from '../core/discovery/molecular/compoundResolver';
import { unavailableRdkitTransport } from '../core/discovery/molecular/rdkitTransport';

/**
 * §11 MINIMUM ENTRY POINT — #/molecular-reference-analysis.
 *
 * This is a SCIENTIFIC REFERENCE ANALYSIS screen for two known compounds. It
 * computes and displays no synthesis route, quantity, temperature, timing, or
 * production procedure — the engine behind it has none to give.
 *
 * RDKit currently has no HTTP transport wired into the browser build (only a
 * Node child-process transport exists, used by tests and scripts — see
 * rdkitTransport.node.ts). This screen therefore runs the SAME real
 * orchestrator with the browser-safe `unavailableRdkitTransport` /
 * `unavailableLookupTransport`, and shows the TRUE resulting statuses
 * (BLOCKED_BY_RUNTIME / NOT_AVAILABLE) rather than a fabricated computed
 * result. That is the honest state of this build today, not a placeholder.
 */
const cardStyle: React.CSSProperties = { border: '1px solid #333', borderRadius: 8, padding: 16, marginBottom: 16, background: '#141414', color: '#e6e6e6' };
const labelStyle: React.CSSProperties = { fontSize: 12, opacity: 0.65, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 };
const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0', borderBottom: '1px solid #262626', fontSize: 13 };

function statusColor(status: string): string {
  const s = status.toUpperCase();
  if (s === 'AVAILABLE' || s === 'COMPUTED' || s === 'CONFIRMED' || s === 'MATCH' || s === 'VERIFIED') return '#4caf50';
  if (s === 'DRIFT' || s.startsWith('REJECTED')) return '#e57373';
  if (s === 'INFERRED' || s === 'PARTIAL') return '#ffb74d';
  return '#888'; // NOT_AVAILABLE / BLOCKED_BY_RUNTIME / UNKNOWN / REQUIRES_EXPERIMENT / BLOCKED
}

function StatusBadge({ status }: { status: string }) {
  return <span style={{ color: statusColor(status), fontWeight: 600, fontSize: 12 }}>{status}</span>;
}

const THREE_MMC: PrecisionCompoundRequest = { name: '3-MMC', fallbackSmiles: 'CNC(C)C(=O)c1cccc(C)c1', fallbackFormula: 'C11H15NO' };
const FOUR_CMC: PrecisionCompoundRequest = { name: '4-CMC', fallbackSmiles: 'CNC(C)C(=O)c1ccc(Cl)cc1', fallbackFormula: 'C10H12ClNO' };

export function PrecisionReferenceAnalysisScreen() {
  const [result, setResult] = useState<PrecisionReferenceAnalysisResult | null>(null);
  const [savedRun, setSavedRun] = useState<SavedPrecisionAnalysisRun | null>(null);
  const [replayStatus, setReplayStatus] = useState<string | null>(null);

  const engines = { rdkit: unavailableRdkitTransport, compoundLookup: unavailableLookupTransport };

  function runAnalysis() {
    const analysis = runPrecisionReferenceAnalysis(THREE_MMC, FOUR_CMC, engines);
    setResult(analysis);
    setSavedRun(buildSavedPrecisionAnalysisRun(THREE_MMC, FOUR_CMC, engines));
    setReplayStatus(null);
  }

  function runReplay() {
    if (savedRun === null) return;
    setReplayStatus(replaySavedPrecisionAnalysisRun(savedRun, engines).status);
  }

  const pack = result === null ? null : buildPrecisionEvidencePack(THREE_MMC, FOUR_CMC, result, unavailableRdkitTransport.detect().available ? 'RDKit' : 'none');

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 20, marginBottom: 4 }}>Precision Reference Analysis — 3-MMC vs 4-CMC</h1>
      <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 16 }}>
        Scientific reference comparison only. No synthesis route, quantity, temperature, or production procedure is computed here.
      </p>
      <button onClick={runAnalysis} style={{ padding: '8px 16px', marginBottom: 16 }}>Run analysis</button>

      {result !== null && (
        <>
          <section style={cardStyle}>
            <div style={labelStyle}>Structure</div>
            {[result.compoundAIdentity, result.compoundBIdentity].map((identity) => (
              <div key={identity.name}>
                <div style={rowStyle}><span>{identity.name} — formula</span><span>{identity.formula ?? 'NOT_AVAILABLE'} <StatusBadge status={identity.identitySource} /></span></div>
                <div style={rowStyle}><span>{identity.name} — InChIKey</span><span>{identity.inchiKey ?? <StatusBadge status="NOT_AVAILABLE" />}</span></div>
              </div>
            ))}
            <div style={rowStyle}><span>Structural similarity (Tanimoto)</span><span>{result.similarity.available ? `${(result.similarity.tanimoto! * 100).toFixed(1)}% (${result.similarity.band})` : <StatusBadge status="NOT_AVAILABLE" />}</span></div>
          </section>

          <section style={cardStyle}>
            <div style={labelStyle}>Targets / Mechanism</div>
            {[...result.transporterEvidenceA, ...result.transporterEvidenceB].map((record, i) => (
              <div key={i} style={rowStyle}>
                <span>{record.compoundName} — {record.transporter}</span>
                <StatusBadge status={record.status} />
              </div>
            ))}
          </section>

          <section style={cardStyle}>
            <div style={labelStyle}>Evidence (claims)</div>
            {result.claims.map((claim) => (
              <div key={claim.claimId} style={rowStyle}>
                <span>{claim.strength}</span>
                <span>{claim.confidenceStatement.split(':')[0]}</span>
              </div>
            ))}
          </section>

          <section style={cardStyle}>
            <div style={labelStyle}>Comparison</div>
            {result.comparisonTable.map((row) => (
              <div key={row.property} style={rowStyle}>
                <span>{row.property}</span>
                <span>{row.compoundA} / {row.compoundB} <StatusBadge status={row.evidenceStatus} /></span>
              </div>
            ))}
          </section>

          <section style={cardStyle}>
            <div style={labelStyle}>Falsification</div>
            {result.falsification.checks.map((check) => (
              <div key={check.checkId} style={rowStyle}>
                <span>{check.question}</span>
                <StatusBadge status={check.concernFound ? 'CONCERN_FOUND' : 'NO_CONCERN'} />
              </div>
            ))}
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>Max supportable claim: <StatusBadge status={result.falsification.maxSupportableClaim} /></div>
          </section>

          <section style={cardStyle}>
            <div style={labelStyle}>Uncertainty</div>
            {result.limitations.map((limitation, i) => (
              <div key={i} style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>{limitation}</div>
            ))}
            {pack !== null && <div style={{ fontSize: 12, opacity: 0.9, marginTop: 8 }}><strong>Next experiment:</strong> {pack.nextExperiment}</div>}
          </section>

          <section style={cardStyle}>
            <div style={labelStyle}>Replay</div>
            <button onClick={runReplay} style={{ padding: '6px 12px' }}>Check replay</button>
            <div style={rowStyle}><span>Replay status</span>{replayStatus === null ? <span style={{ opacity: 0.5, fontSize: 13 }}>not run</span> : <StatusBadge status={replayStatus} />}</div>
          </section>
        </>
      )}
    </div>
  );
}
