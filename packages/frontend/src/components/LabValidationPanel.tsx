import { useEffect, useMemo, useState } from 'react';
import { getToken } from '../core/backend/session';
import {
  compareCampaignLabObservation,
  createCampaignLabValidationRequest,
  getCampaignLabValidationDossier,
  ingestCampaignLabObservation,
  reviewCampaignLabObservation,
  type CampaignCandidate,
  type LabValidationDossier,
  type ScienceRun,
} from '../core/backend/client';

interface Props {
  projectId: string;
  campaignId: string;
  candidates: CampaignCandidate[];
  scienceRuns: ScienceRun[];
  onChanged?: () => void;
}

/**
 * Thin UI over the canonical campaign lab-validation API
 * (packages/backend/src/campaign/labClosedLoop.mjs).
 *
 * No wet-lab execution happens in the browser. The screen only:
 * request -> ingest externally produced observation -> human review
 * -> Evidence proposal -> compare persisted model output to observation.
 */
export function LabValidationPanel({ projectId, campaignId, candidates, scienceRuns, onChanged }: Props) {
  const retained = useMemo(() => candidates.filter((candidate) => candidate.status === 'retained'), [candidates]);
  const [candidateId, setCandidateId] = useState(retained[0]?.id ?? candidates[0]?.id ?? '');
  const [dossier, setDossier] = useState<LabValidationDossier | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const [objective, setObjective] = useState('Independent external validation of one predeclared candidate endpoint.');
  const [endpointId, setEndpointId] = useState('');
  const [expectedUnit, setExpectedUnit] = useState('');
  const [comparisonOutputKey, setComparisonOutputKey] = useState('');

  const [labId, setLabId] = useState('');
  const [externalObservationId, setExternalObservationId] = useState('');
  const [sourceUri, setSourceUri] = useState('');
  const [methodReference, setMethodReference] = useState('');
  const [observedAt, setObservedAt] = useState('');
  const [observedValue, setObservedValue] = useState('');
  const [observedUnit, setObservedUnit] = useState('');
  const [confidence, setConfidence] = useState('0.8');

  const candidateRuns = useMemo(
    () => scienceRuns.filter((run) => run.candidateId === candidateId),
    [scienceRuns, candidateId],
  );
  const [scienceRunId, setScienceRunId] = useState('');
  const [absoluteTolerance, setAbsoluteTolerance] = useState('');

  useEffect(() => {
    if (!candidateId && candidates[0]) setCandidateId(candidates[0].id);
  }, [candidateId, candidates]);

  useEffect(() => {
    if (!scienceRunId && candidateRuns[0]) setScienceRunId(candidateRuns[0].id);
  }, [candidateRuns, scienceRunId]);

  async function refresh() {
    const token = getToken();
    if (!token || !candidateId) return;
    const result = await getCampaignLabValidationDossier(token, projectId, campaignId, candidateId);
    if (result.ok) {
      setDossier(result.data);
      setMessage(null);
    } else {
      setMessage(result.message);
    }
  }

  useEffect(() => { void refresh(); }, [projectId, campaignId, candidateId]);

  async function createRequest() {
    const token = getToken();
    if (!token || !candidateId || !endpointId.trim()) return;
    const result = await createCampaignLabValidationRequest(token, projectId, campaignId, {
      candidateId,
      objective,
      endpointPlan: [{
        endpointId: endpointId.trim(),
        expectedUnit: expectedUnit.trim() || undefined,
        comparisonOutputKey: comparisonOutputKey.trim() || undefined,
      }],
    });
    setMessage(result.ok ? `Validation request: ${result.data.requestId}` : result.message);
    if (result.ok) {
      await refresh();
      onChanged?.();
    }
  }

  async function ingestObservation() {
    const token = getToken();
    const requestId = dossier?.requests.at(-1)?.payload?.requestId;
    const numericValue = Number(observedValue);
    if (!token || !candidateId || !requestId || !Number.isFinite(numericValue)) return;

    const result = await ingestCampaignLabObservation(token, projectId, campaignId, {
      candidateId,
      requestId,
      observation: {
        endpointId: endpointId.trim(),
        value: numericValue,
        unit: observedUnit.trim() || expectedUnit.trim(),
        observedAt: observedAt.trim(),
        methodReference: methodReference.trim(),
        source: {
          labId: labId.trim(),
          providerType: 'OTHER_EXTERNAL',
          externalObservationId: externalObservationId.trim(),
          sourceUri: sourceUri.trim(),
        },
        quality: {
          status: 'QC_UNKNOWN',
          confidence: Number(confidence),
        },
      },
    });
    setMessage(result.ok ? `Observation ingested: ${result.data.observationId}` : result.message);
    if (result.ok) {
      await refresh();
      onChanged?.();
    }
  }

  async function acceptLatestObservation() {
    const token = getToken();
    const latest = dossier?.observations.at(-1);
    if (!token || !candidateId || !latest) return;
    const result = await reviewCampaignLabObservation(
      token,
      projectId,
      campaignId,
      latest.event.payload.observationId,
      {
        candidateId,
        verdict: 'ACCEPTED_AS_OBSERVATION',
        note: 'Accepted as an external observation artifact for research comparison. No clinical efficacy claim.',
      },
    );
    setMessage(result.ok
      ? `Observation accepted; Evidence proposal: ${result.data.evidenceProposalId ?? 'not created'}`
      : result.message);
    if (result.ok) {
      await refresh();
      onChanged?.();
    }
  }

  async function compareLatest() {
    const token = getToken();
    const latest = dossier?.observations.at(-1);
    const tol = Number(absoluteTolerance);
    if (!token || !candidateId || !latest || !scienceRunId || !comparisonOutputKey.trim() || !Number.isFinite(tol)) return;

    const result = await compareCampaignLabObservation(token, projectId, campaignId, {
      candidateId,
      observationId: latest.event.payload.observationId,
      scienceRunId,
      outputKey: comparisonOutputKey.trim(),
      tolerance: { absolute: tol },
    });
    setMessage(result.ok ? `Comparison: ${result.data.verdict}` : result.message);
    if (result.ok) {
      await refresh();
      onChanged?.();
    }
  }

  return (
    <section className="settings-section" aria-label="Laboratory validation closed loop" data-testid="lab-validation-panel">
      <h3>Laboratory Validation Loop</h3>
      <p className="settings-hint">
        Candidate → external validation request → real external observation → human review → Evidence proposal → model-vs-observation.
        Genesis does not execute a wet-lab protocol here and does not convert a model estimate into clinical efficacy.
      </p>

      <label className="account-field">
        <span>Candidate</span>
        <select value={candidateId} onChange={(event) => setCandidateId(event.target.value)} data-testid="lab-validation-candidate">
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>{candidate.canonicalSmiles} · {candidate.id}</option>
          ))}
        </select>
      </label>

      {dossier && (
        <div className="cde-results">
          <div className="cde-result">
            <span className="cde-result-label">Research gate</span>
            <span className="cde-result-actual">{dossier.researchGate.verdict} · {dossier.researchGate.reason}</span>
            <span className="cde-result-bound">next: {dossier.nextResearchAction.action}</span>
          </div>
          <div className="cde-result">
            <span className="cde-result-label">Closed-loop state</span>
            <span className="cde-result-actual" data-testid="lab-validation-counts">
              {dossier.requests.length} request(s) · {dossier.observations.length} observation(s) · {dossier.comparisons.length} comparison(s)
            </span>
            <span className="cde-result-bound">fingerprint: {dossier.dossierFingerprint}</span>
          </div>
        </div>
      )}

      <div className="account-form">
        <label className="account-field"><span>Validation objective</span><input value={objective} onChange={(e) => setObjective(e.target.value)} /></label>
        <label className="account-field"><span>Endpoint ID</span><input value={endpointId} onChange={(e) => setEndpointId(e.target.value)} placeholder="e.g. target-binding-score" /></label>
        <label className="account-field"><span>Expected unit</span><input value={expectedUnit} onChange={(e) => setExpectedUnit(e.target.value)} /></label>
        <label className="account-field"><span>Model output key to compare</span><input value={comparisonOutputKey} onChange={(e) => setComparisonOutputKey(e.target.value)} /></label>
        <button className="chip-btn" onClick={() => { void createRequest(); }} disabled={!candidateId || !endpointId.trim()} data-testid="lab-validation-create-request">Create validation request</button>
      </div>

      <div className="account-form">
        <h4>Ingest externally produced observation</h4>
        <label className="account-field"><span>Lab/provider ID</span><input value={labId} onChange={(e) => setLabId(e.target.value)} /></label>
        <label className="account-field"><span>External observation ID</span><input value={externalObservationId} onChange={(e) => setExternalObservationId(e.target.value)} /></label>
        <label className="account-field"><span>Source URI</span><input value={sourceUri} onChange={(e) => setSourceUri(e.target.value)} /></label>
        <label className="account-field"><span>Method reference</span><input value={methodReference} onChange={(e) => setMethodReference(e.target.value)} /></label>
        <label className="account-field"><span>Observed at (ISO time)</span><input value={observedAt} onChange={(e) => setObservedAt(e.target.value)} /></label>
        <label className="account-field"><span>Observed value</span><input value={observedValue} onChange={(e) => setObservedValue(e.target.value)} /></label>
        <label className="account-field"><span>Observed unit</span><input value={observedUnit} onChange={(e) => setObservedUnit(e.target.value)} /></label>
        <label className="account-field"><span>Observation confidence (0–1)</span><input value={confidence} onChange={(e) => setConfidence(e.target.value)} /></label>
        <button className="chip-btn" onClick={() => { void ingestObservation(); }} data-testid="lab-validation-ingest">Ingest observation</button>
        <button className="chip-btn" onClick={() => { void acceptLatestObservation(); }} disabled={!dossier?.observations.length} data-testid="lab-validation-accept">Human-accept latest observation</button>
      </div>

      <div className="account-form">
        <h4>Compare model to accepted observation</h4>
        <label className="account-field">
          <span>Scientific run</span>
          <select value={scienceRunId} onChange={(event) => setScienceRunId(event.target.value)}>
            <option value="">Select run</option>
            {candidateRuns.map((run) => <option key={run.id} value={run.id}>{run.capability} · {run.id}</option>)}
          </select>
        </label>
        <label className="account-field"><span>Absolute tolerance</span><input value={absoluteTolerance} onChange={(e) => setAbsoluteTolerance(e.target.value)} /></label>
        <button className="chip-btn" onClick={() => { void compareLatest(); }} data-testid="lab-validation-compare">Compare</button>
      </div>

      {message && <p className="settings-hint" role="status">{message}</p>}
      <p className="dossier-boundary">
        External observation ≠ clinical efficacy. Agreement within tolerance is a model/observation comparison only.
      </p>
    </section>
  );
}
