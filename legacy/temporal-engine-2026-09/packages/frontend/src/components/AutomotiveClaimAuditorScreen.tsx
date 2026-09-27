import { useMemo, useState } from 'react';
import { buildAutomotiveAuditResult } from '../core/automotive/auditResult';
import { buildDemoAutomotiveAssessment } from '../core/automotive/demoFixture';
import { buildAutomotiveEvidencePack } from '../core/automotive/evidence';
import { proposeNextAutomotiveDataRequests } from '../core/automotive/nextStep';
import { buildSavedAutomotiveAssessment, replaySavedAutomotiveAssessment, type SavedAutomotiveAssessment } from '../core/automotive/replay';
import { verifyEvidencePackRoCrateRoundTrip } from '../core/experimentFabric/evidencePackRoCrate';
import type { AutomotiveAssessment, AutomotiveAuditResult } from '../core/automotive/types';

/**
 * MINIMUM DEMO SURFACE (§19) — a functional proof, not a designed product
 * screen. No vision/VIN/pricing upload exists, so this loads the one
 * TEST_FIXTURE assessment and runs it through the real pipeline:
 * cost calculation → gap analysis → Evidence Pack → RO-Crate → replay.
 */
const cardStyle: React.CSSProperties = { border: '1px solid #333', borderRadius: 8, padding: 16, marginBottom: 16, background: '#141414', color: '#e6e6e6' };
const labelStyle: React.CSSProperties = { fontSize: 12, opacity: 0.65, textTransform: 'uppercase', letterSpacing: 0.5 };
const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #262626' };

function StatusBadge({ status }: { status: string }) {
  const color = status === 'CONFIRMED' || status === 'MATCH' || status === 'NO_MEASURED_GAP' ? '#4caf50'
    : status === 'NOT_AVAILABLE' || status === 'BLOCKED' ? '#888'
      : status === 'POTENTIAL_UNDERESTIMATION' || status === 'DRIFT' || status === 'CONFIGURATION_MISMATCH' ? '#e57373'
        : '#ffb74d';
  return <span style={{ color, fontWeight: 600 }}>{status}</span>;
}

export function AutomotiveClaimAuditorScreen() {
  const [assessment, setAssessment] = useState<AutomotiveAssessment | null>(null);
  const [result, setResult] = useState<AutomotiveAuditResult | null>(null);
  const [saved, setSaved] = useState<SavedAutomotiveAssessment | null>(null);
  const [replayStatus, setReplayStatus] = useState<string | null>(null);
  const [roCrateStatus, setRoCrateStatus] = useState<string | null>(null);

  const nextDataRequests = useMemo(() => (result ? proposeNextAutomotiveDataRequests(result) : []), [result]);

  function loadDemo() {
    const demo = buildDemoAutomotiveAssessment();
    setAssessment(demo);
    setResult(buildAutomotiveAuditResult(demo));
    setSaved(null);
    setReplayStatus(null);
    setRoCrateStatus(null);
  }

  function runReplayCheck() {
    if (!assessment) return;
    const savedNow = buildSavedAutomotiveAssessment(assessment);
    setSaved(savedNow);
    setReplayStatus(replaySavedAutomotiveAssessment(savedNow).status);
  }

  function runRoCrateCheck() {
    if (!result) return;
    const pack = buildAutomotiveEvidencePack(result);
    setRoCrateStatus(verifyEvidencePackRoCrateRoundTrip(pack).status);
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 20 }}>Automotive Claim Auditor — spike</h1>
      <p style={{ opacity: 0.7, fontSize: 13 }}>
        Vertical proof-of-concept only. No real vision, VIN, OEM/aftermarket catalog, pricing, or
        labor-rate provider is connected — every such field below is honestly TEST_FIXTURE or
        NOT_AVAILABLE, never a fabricated result.
      </p>

      <div style={cardStyle}>
        <div style={labelStyle}>Input</div>
        <button onClick={loadDemo}>Load TEST_FIXTURE assessment</button>
        {assessment && <p style={{ fontSize: 13 }}>Loaded: {assessment.assessmentId} ({assessment.photos.length} photo refs, {assessment.findings.length} findings)</p>}
      </div>

      {result && (
        <>
          <div style={cardStyle}>
            <div style={labelStyle}>Vehicle</div>
            <div>{result.vehicle.make.value} {result.vehicle.model.value} ({result.vehicle.modelYear.value}) — <StatusBadge status={result.vehicleStatus} /></div>
          </div>

          <div style={cardStyle}>
            <div style={labelStyle}>Findings</div>
            {result.findings.map((f) => (
              <div key={f.findingId} style={rowStyle}>
                <span>{f.partId} ({f.severity})</span>
                <StatusBadge status={f.status} />
              </div>
            ))}
          </div>

          <div style={cardStyle}>
            <div style={labelStyle}>Cost — reference vs insurer</div>
            <div style={rowStyle}><span>Reference total</span><StatusBadge status={result.referenceTotal.value !== null ? String(result.referenceTotal.value) : result.referenceTotal.status} /></div>
            <div style={rowStyle}><span>Insurer total</span><StatusBadge status={result.insurerTotal.value !== null ? String(result.insurerTotal.value) : result.insurerTotal.status} /></div>
            <div style={rowStyle}><span>Cost status</span><StatusBadge status={result.costStatus} /></div>
          </div>

          <div style={cardStyle}>
            <div style={labelStyle}>Gaps ({result.gaps.length})</div>
            {result.gaps.map((g) => (
              <div key={g.gapId} style={rowStyle}>
                <span>{g.detail}</span>
                <StatusBadge status={g.label} />
              </div>
            ))}
          </div>

          <div style={cardStyle}>
            <div style={labelStyle}>Overall</div>
            <StatusBadge status={result.overall} />
          </div>

          <div style={cardStyle}>
            <div style={labelStyle}>Evidence / Replay</div>
            <button onClick={runRoCrateCheck}>Build Evidence Pack → RO-Crate → verify</button>{' '}
            {roCrateStatus && <StatusBadge status={roCrateStatus} />}
            <br /><br />
            <button onClick={runReplayCheck}>Save → replay</button>{' '}
            {replayStatus && <StatusBadge status={replayStatus} />}
            {saved && <p style={{ fontSize: 11, opacity: 0.6 }}>resultFingerprint: {saved.resultFingerprint}</p>}
          </div>

          {nextDataRequests.length > 0 && (
            <div style={cardStyle}>
              <div style={labelStyle}>Missing data — next requests</div>
              {nextDataRequests.map((r, i) => <div key={i} style={rowStyle}><span>{r.reason}</span><StatusBadge status={r.target} /></div>)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
