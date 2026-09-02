import { useMemo, useState } from 'react';
import { buildDemoDiscoveryQuestion, buildDemoGenerationSpec } from '../core/discovery/molecular/demoFixture';
import { runMolecularDiscovery } from '../core/discovery/molecular/discoveryRun';
import { buildDiscoveryEvidencePack } from '../core/discovery/molecular/evidence';
import { explainDiscoveryEvidence, proposeNextDiscoverySteps } from '../core/discovery/molecular/nextStep';
import { buildSavedDiscoveryRun, replaySavedDiscoveryRun } from '../core/discovery/molecular/replay';
import { verifyEvidencePackRoCrateRoundTrip } from '../core/experimentFabric/evidencePackRoCrate';
import type { DiscoveryResult, PropertyStatus } from '../core/discovery/molecular/types';

/**
 * MINIMUM DEMO SURFACE (§20) — a functional proof of the discovery loop, not a
 * designed product screen.
 *
 * Every number shown here carries the status of the thing that produced it.
 * COMPUTED values come from the repository's real formula chemistry;
 * REQUIRES_EXTERNAL_ENGINE / REQUIRES_EXPERIMENT fields are rendered as the
 * absence they are and are NEVER given a placeholder number, a "good" label, or
 * a safety judgement. Nothing on this screen is a discovery claim.
 */
const cardStyle: React.CSSProperties = { border: '1px solid #333', borderRadius: 8, padding: 16, marginBottom: 16, background: '#141414', color: '#e6e6e6' };
const labelStyle: React.CSSProperties = { fontSize: 12, opacity: 0.65, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 };
const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0', borderBottom: '1px solid #262626', fontSize: 13 };
const monoStyle: React.CSSProperties = { fontFamily: 'ui-monospace, monospace' };

function statusColor(status: string): string {
  if (status === 'COMPUTED' || status === 'ACTUAL_SOURCE' || status === 'MATCH' || status === 'PASS' || status === 'RETAINED' || status === 'SUPPORTED_WITHIN_PROTOCOL') return '#4caf50';
  if (status === 'FAIL' || status === 'REJECTED' || status === 'DRIFT' || status === 'FALSIFIED_WITHIN_PROTOCOL') return '#e57373';
  if (status === 'TEST_FIXTURE' || status === 'USER_SUPPLIED' || status === 'MODEL_PREDICTION') return '#ffb74d';
  return '#888'; // NOT_AVAILABLE / REQUIRES_* / BLOCKED / NOT_RESOLVED
}

function StatusBadge({ status }: { status: string }) {
  return <span style={{ color: statusColor(status), fontWeight: 600, fontSize: 12 }}>{status}</span>;
}

/** A value is shown only when its status says a real value exists. */
function ValueCell({ value, unit, status }: { value: number | null; unit: string; status: PropertyStatus }) {
  if (value === null) return <StatusBadge status={status} />;
  return (
    <span>
      <span style={monoStyle}>{Number.isInteger(value) ? value : value.toFixed(3)}</span>
      {unit ? ` ${unit}` : ''} <StatusBadge status={status} />
    </span>
  );
}

export function MolecularDiscoveryScreen() {
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [replayStatus, setReplayStatus] = useState<string | null>(null);
  const [roCrateStatus, setRoCrateStatus] = useState<string | null>(null);

  const nextSteps = useMemo(() => (result ? proposeNextDiscoverySteps(result) : []), [result]);
  const advice = useMemo(() => (result ? explainDiscoveryEvidence(result) : null), [result]);

  function runDiscovery() {
    setResult(runMolecularDiscovery(buildDemoDiscoveryQuestion(), buildDemoGenerationSpec()));
    setReplayStatus(null);
    setRoCrateStatus(null);
  }

  function runReplayCheck() {
    const saved = buildSavedDiscoveryRun(buildDemoDiscoveryQuestion(), buildDemoGenerationSpec());
    setReplayStatus(replaySavedDiscoveryRun(saved).status);
  }

  function runRoCrateCheck() {
    if (!result) return;
    setRoCrateStatus(verifyEvidencePackRoCrateRoundTrip(buildDiscoveryEvidencePack(result)).status);
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 20 }}>Molecular discovery — spike</h1>
      <p style={{ opacity: 0.7, fontSize: 13 }}>
        Candidate generation below is a <strong>deterministic composition enumerator</strong>, not a
        generative model. A molecular formula is not a structure, so no structural, binding, ADMET,
        toxicity or safety value is produced here — those fields read REQUIRES_EXTERNAL_ENGINE or
        REQUIRES_EXPERIMENT and stay empty. Nothing on this screen is a drug, a discovery, or a
        safety claim.
      </p>

      <div style={cardStyle}>
        <div style={labelStyle}>Run</div>
        <button onClick={runDiscovery}>Run demo discovery question</button>
      </div>

      {result && (
        <>
          <div style={cardStyle}>
            <div style={labelStyle}>Question &amp; target</div>
            <p style={{ fontSize: 14, margin: '0 0 8px' }}>{result.question.question}</p>
            <div style={rowStyle}><span>Target</span><span>{result.question.target.label} <StatusBadge status={result.question.target.source} /></span></div>
            <div style={rowStyle}><span>Target affinity capability</span><StatusBadge status={result.question.target.affinityCapability} /></div>
          </div>

          <div style={cardStyle}>
            <div style={labelStyle}>Constraints (pre-registered before the run)</div>
            <div style={rowStyle}><span>Allowed elements</span><span style={monoStyle}>{result.question.constraints.allowedElements.join(', ')}</span></div>
            <div style={rowStyle}><span>Max heavy atoms</span><span style={monoStyle}>{result.question.constraints.maxHeavyAtoms}</span></div>
            {result.question.constraints.criteria.map((c) => (
              <div key={c.criterionId} style={rowStyle}>
                <span>{c.criterionId} <span style={{ opacity: 0.5 }}>({c.required ? 'required' : 'optional'})</span></span>
                <span style={monoStyle}>{c.propertyId} {c.op} {c.value}{c.valueMax === undefined ? '' : `..${c.valueMax}`}</span>
              </div>
            ))}
          </div>

          <div style={cardStyle}>
            <div style={labelStyle}>Candidates — deterministic composition enumeration</div>
            <div style={rowStyle}><span>Seeds</span><span style={monoStyle}>{result.batch.seedFormulas.join(', ')}</span></div>
            <div style={rowStyle}><span>Transformations</span><span style={monoStyle}>{result.batch.transformations.join(', ')}</span></div>
            <div style={rowStyle}><span>Enumerated</span><span style={monoStyle}>{result.batch.candidates.length}</span></div>
            <div style={rowStyle}><span>Discarded before screening</span><span style={monoStyle}>{result.batch.discarded.length}</span></div>
            <div style={rowStyle}><span>Batch fingerprint</span><span style={monoStyle}>{result.batch.batchFingerprint}</span></div>
          </div>

          <div style={cardStyle}>
            <div style={labelStyle}>First candidate — every property with its real status</div>
            {result.batch.candidates[0] && (
              <>
                <div style={rowStyle}><span>Formula</span><span style={monoStyle}>{result.batch.candidates[0].formula}</span></div>
                <div style={rowStyle}><span>Structure (canonical SMILES)</span><StatusBadge status={result.batch.candidates[0].structure.status} /></div>
                {result.batch.candidates[0].properties.map((p) => (
                  <div key={p.propertyId} style={rowStyle}>
                    <span>{p.propertyId}</span>
                    <ValueCell value={p.value} unit={p.unit} status={p.status} />
                  </div>
                ))}
              </>
            )}
          </div>

          <div style={cardStyle}>
            <div style={labelStyle}>Screening result</div>
            <div style={rowStyle}><span>Verdict</span><StatusBadge status={result.decision.verdict} /></div>
            <p style={{ fontSize: 13, opacity: 0.8 }}>{result.decision.reason}</p>
            <div style={rowStyle}><span>Retained</span><span style={monoStyle}>{result.decision.retainedCount}</span></div>
            <div style={rowStyle}><span>Rejected on real computed values</span><span style={monoStyle}>{result.decision.rejectedCount}</span></div>
            <div style={rowStyle}><span>Not resolved (missing capability, NOT a failure)</span><span style={monoStyle}>{result.decision.notResolvedCount}</span></div>
          </div>

          <div style={cardStyle}>
            <div style={labelStyle}>Ranking — retained candidates only</div>
            {result.ranking.length === 0
              ? <p style={{ fontSize: 13, opacity: 0.7 }}>No candidate was retained. This is not evidence that the candidates are bad — see the capability gaps below.</p>
              : result.ranking.slice(0, 10).map((a, i) => (
                <div key={a.candidateId} style={rowStyle}>
                  <span>{i + 1}. <span style={monoStyle}>{a.formula}</span></span>
                  <span><span style={monoStyle}>{a.rankScore === null ? '—' : a.rankScore.toFixed(3)}</span> <StatusBadge status={a.verdict} /></span>
                </div>
              ))}
          </div>

          <div style={cardStyle}>
            <div style={labelStyle}>Capability gaps — what Genesis could not evaluate</div>
            {result.capabilityGaps.length === 0
              ? <p style={{ fontSize: 13, opacity: 0.7 }}>Every declared criterion was evaluable.</p>
              : result.capabilityGaps.map((g) => (
                <div key={g.propertyId} style={rowStyle}><span>{g.propertyId}</span><StatusBadge status={g.status} /></div>
              ))}
          </div>

          <div style={cardStyle}>
            <div style={labelStyle}>Evidence &amp; reproducibility</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <button onClick={runRoCrateCheck}>Verify RO-Crate round trip</button>
              <button onClick={runReplayCheck}>Replay saved run</button>
            </div>
            <div style={rowStyle}><span>Result fingerprint</span><span style={monoStyle}>{result.resultFingerprint}</span></div>
            <div style={rowStyle}><span>RO-Crate round trip</span>{roCrateStatus === null ? <span style={{ opacity: 0.5, fontSize: 13 }}>not run</span> : <StatusBadge status={roCrateStatus} />}</div>
            <div style={rowStyle}><span>Replay</span>{replayStatus === null ? <span style={{ opacity: 0.5, fontSize: 13 }}>not run</span> : <StatusBadge status={replayStatus} />}</div>
          </div>

          <div style={cardStyle}>
            <div style={labelStyle}>Next experiment</div>
            {advice && (
              <>
                <div style={rowStyle}><span>Assessment</span><StatusBadge status={advice.assessment} /></div>
                <p style={{ fontSize: 13, opacity: 0.8 }}>{advice.why}</p>
                <p style={{ fontSize: 12, opacity: 0.6 }}>
                  {advice.nextExperiment.action} — {advice.nextExperiment.rationale} (auto-run: {String(advice.nextExperiment.autoRun)})
                </p>
              </>
            )}
            {nextSteps.map((s, i) => (
              <div key={`${s.kind}:${s.resolves}:${i}`} style={{ padding: '8px 0', borderBottom: '1px solid #262626' }}>
                <div style={{ fontSize: 13 }}><StatusBadge status={s.kind} /> <span style={{ opacity: 0.5 }}>→ {s.resolves}</span></div>
                <div style={{ fontSize: 13 }}>{s.action}</div>
                <div style={{ fontSize: 12, opacity: 0.6 }}>{s.reason}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
