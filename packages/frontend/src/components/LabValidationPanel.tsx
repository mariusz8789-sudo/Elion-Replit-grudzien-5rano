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
  const [plannedAbsoluteTolerance, setPlannedAbsoluteTolerance] = useState('');

  const [labId, setLabId] = useState('');
  const [externalObservationId, setExternalObservationId] = useState('');
  const [sourceUri, setSourceUri] = useState('');
  const [methodReference, setMethodReference] = useState('');
  const [observedAt, setObservedAt] = useState('');
  const [observedValue, setObservedValue] = useState('');
  const [observedUnit, setObservedUnit] = useState('');
  const [confidence, setConfidence] = useState('0.8');
  const [qualityStatus, setQualityStatus] = useState<'QC_PASSED' | 'QC_FAILED' | 'QC_UNKNOWN'>('QC_UNKNOWN');
  const [rawPayloadSha256, setRawPayloadSha256] = useState('');

  const candidateRuns = useMemo(
    () => scienceRuns.filter((run) => run.candidateId === candidateId),
    [scienceRuns, candidateId],
  );
  const journey = useMemo(() => {
    const reviewed = dossier?.observations.some((entry) => entry.latestReview !== null) ?? false;
    return [
      { label: 'Kandydat', detail: 'wybrany do sprawdzenia', done: Boolean(candidateId) },
      { label: 'Obliczenia', detail: 'wyniki in silico', done: candidateRuns.length > 0 },
      { label: 'Plan', detail: 'zamrożone kryteria', done: (dossier?.requests.length ?? 0) > 0 },
      { label: 'Laboratorium', detail: 'realna obserwacja', done: (dossier?.observations.length ?? 0) > 0 },
      { label: 'Weryfikacja', detail: 'niezależny przegląd', done: reviewed },
      { label: 'Porównanie', detail: 'model kontra pomiar', done: (dossier?.comparisons.length ?? 0) > 0 },
    ];
  }, [candidateId, candidateRuns.length, dossier]);
  const [scienceRunId, setScienceRunId] = useState('');

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
    } else {
      setMessage(result.message);
    }
  }

  useEffect(() => { void refresh(); }, [projectId, campaignId, candidateId]);

  async function createRequest() {
    const token = getToken();
    const plannedTolerance = Number(plannedAbsoluteTolerance);
    if (!token || !candidateId || !endpointId.trim() || !expectedUnit.trim()
      || !comparisonOutputKey.trim() || !Number.isFinite(plannedTolerance) || plannedTolerance < 0) return;
    const result = await createCampaignLabValidationRequest(token, projectId, campaignId, {
      candidateId,
      objective,
      endpointPlan: [{
        endpointId: endpointId.trim(),
        expectedUnit: expectedUnit.trim() || undefined,
        comparisonOutputKey: comparisonOutputKey.trim() || undefined,
        tolerance: { absolute: plannedTolerance },
      }],
      governedManualRequest: {
        reason: 'Project editor explicitly authorized this external validation request; no preclinical protocol artifact was selected.',
      },
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
        rawArtifactSha256: rawPayloadSha256.trim(),
        source: {
          labId: labId.trim(),
          providerType: 'OTHER_EXTERNAL',
          externalObservationId: externalObservationId.trim(),
          sourceUri: sourceUri.trim(),
        },
        quality: {
          status: qualityStatus,
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
    const request = dossier?.requests.find((entry) => entry.payload.requestId === latest?.event.payload.requestId);
    const endpoint = request?.payload.endpointPlan.find((entry) => entry.endpointId === latest?.event.payload.endpointId);
    if (!token || !candidateId || !latest || !scienceRunId || !endpoint?.comparisonOutputKey || !endpoint.tolerance) return;

    const result = await compareCampaignLabObservation(token, projectId, campaignId, {
      candidateId,
      observationId: latest.event.payload.observationId,
      scienceRunId,
    });
    setMessage(result.ok ? `Comparison: ${result.data.verdict}` : result.message);
    if (result.ok) {
      await refresh();
      onChanged?.();
    }
  }

  return (
    <section className="settings-section lab-journey" aria-label="Droga kandydata przez laboratorium" data-testid="lab-validation-panel">
      <div className="lab-journey-heading">
        <div>
          <span className="gx-eyebrow">GENESIS · JEDNO LABORATORIUM</span>
          <h3>Kandydat przechodzi od obliczeń do realnej walidacji</h3>
        </div>
        <span className="lab-journey-boundary">POMIAR FIZYCZNY WYMAGA LABORATORIUM</span>
      </div>
      <p className="settings-hint">
        Genesis najpierw ogranicza liczbę kandydatów obliczeniowo, a potem przygotowuje najmniejszy potrzebny eksperyment,
        zamraża kryteria i przyjmuje wynik z rzeczywistego laboratorium. Nie udaje telemetrii urządzeń ani skuteczności klinicznej.
      </p>

      <ol className="lab-journey-steps" aria-label="Etapy drogi kandydata">
        {journey.map((step, index) => (
          <li key={step.label} className={step.done ? 'is-done' : ''} aria-current={!step.done && journey.slice(0, index).every((item) => item.done) ? 'step' : undefined}>
            <span className="lab-journey-index">{step.done ? '✓' : index + 1}</span>
            <span><strong>{step.label}</strong><small>{step.detail}</small></span>
          </li>
        ))}
      </ol>

      <label className="account-field">
        <span>Kandydat kierowany do laboratorium</span>
        <select value={candidateId} onChange={(event) => setCandidateId(event.target.value)} data-testid="lab-validation-candidate">
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>{candidate.canonicalSmiles} · {candidate.id}</option>
          ))}
        </select>
      </label>

      {dossier && (
        <div className="cde-results">
          <div className="cde-result">
            <span className="cde-result-label">Brama badawcza</span>
            <span className="cde-result-actual">{dossier.researchGate.verdict} · {dossier.researchGate.reason}</span>
            <span className="cde-result-bound">następny krok: {dossier.nextResearchAction.action}</span>
          </div>
          <div className="cde-result">
            <span className="cde-result-label">Stan drogi kandydata</span>
            <span className="cde-result-actual" data-testid="lab-validation-counts">
              planów: {dossier.requests.length} · obserwacji: {dossier.observations.length} · porównań: {dossier.comparisons.length}
            </span>
            <span className="cde-result-bound">fingerprint: {dossier.dossierFingerprint}</span>
          </div>
        </div>
      )}

      <div className="account-form">
        <h4>1 · Przygotuj eksperyment dla realnego laboratorium</h4>
        <label className="account-field"><span>Cel walidacji</span><input value={objective} onChange={(e) => setObjective(e.target.value)} /></label>
        <label className="account-field"><span>Mierzony parametr</span><input value={endpointId} onChange={(e) => setEndpointId(e.target.value)} placeholder="np. target-binding-score" /></label>
        <label className="account-field"><span>Oczekiwana jednostka</span><input value={expectedUnit} onChange={(e) => setExpectedUnit(e.target.value)} /></label>
        <label className="account-field"><span>Wynik modelu do porównania</span><input value={comparisonOutputKey} onChange={(e) => setComparisonOutputKey(e.target.value)} /></label>
        <label className="account-field"><span>Dopuszczalna różnica (ustalana przed pomiarem)</span><input value={plannedAbsoluteTolerance} onChange={(e) => setPlannedAbsoluteTolerance(e.target.value)} /></label>
        <button className="chip-btn" onClick={() => { void createRequest(); }} disabled={!candidateId || !endpointId.trim() || !expectedUnit.trim() || !comparisonOutputKey.trim() || !plannedAbsoluteTolerance.trim()} data-testid="lab-validation-create-request">Przygotuj zlecenie laboratoryjne</button>
      </div>

      <div className="account-form">
        <h4>2 · Przyjmij wynik wykonany poza Genesis</h4>
        <label className="account-field"><span>Lab/provider ID</span><input value={labId} onChange={(e) => setLabId(e.target.value)} /></label>
        <label className="account-field"><span>External observation ID</span><input value={externalObservationId} onChange={(e) => setExternalObservationId(e.target.value)} /></label>
        <label className="account-field"><span>Source URI</span><input value={sourceUri} onChange={(e) => setSourceUri(e.target.value)} /></label>
        <label className="account-field"><span>Method reference</span><input value={methodReference} onChange={(e) => setMethodReference(e.target.value)} /></label>
        <label className="account-field"><span>Observed at (ISO time)</span><input value={observedAt} onChange={(e) => setObservedAt(e.target.value)} /></label>
        <label className="account-field"><span>Observed value</span><input value={observedValue} onChange={(e) => setObservedValue(e.target.value)} /></label>
        <label className="account-field"><span>Observed unit</span><input value={observedUnit} onChange={(e) => setObservedUnit(e.target.value)} /></label>
        <label className="account-field"><span>Raw artifact SHA-256</span><input value={rawPayloadSha256} onChange={(e) => setRawPayloadSha256(e.target.value)} placeholder="64 hexadecimal characters" /></label>
        <label className="account-field"><span>Quality control</span><select value={qualityStatus} onChange={(e) => setQualityStatus(e.target.value as typeof qualityStatus)}><option value="QC_UNKNOWN">QC unknown</option><option value="QC_PASSED">QC passed</option><option value="QC_FAILED">QC failed</option></select></label>
        <label className="account-field"><span>Observation confidence (0–1)</span><input value={confidence} onChange={(e) => setConfidence(e.target.value)} /></label>
        <button className="chip-btn" onClick={() => { void ingestObservation(); }} data-testid="lab-validation-ingest">Przyjmij realną obserwację</button>
        <button className="chip-btn" onClick={() => { void acceptLatestObservation(); }} disabled={!dossier?.observations.length} data-testid="lab-validation-accept">Niezależny przegląd: zaakceptuj obserwację</button>
      </div>

      <div className="account-form">
        <h4>3 · Porównaj przewidywanie z pomiarem</h4>
        <label className="account-field">
          <span>Wynik obliczeniowy</span>
          <select value={scienceRunId} onChange={(event) => setScienceRunId(event.target.value)}>
            <option value="">Wybierz wykonanie</option>
            {candidateRuns.map((run) => <option key={run.id} value={run.id}>{run.capability} · {run.id}</option>)}
          </select>
        </label>
        <p className="settings-hint">Porównanie używa parametru, jednostki i tolerancji zamrożonych przed otrzymaniem wyniku.</p>
        <button className="chip-btn" onClick={() => { void compareLatest(); }} data-testid="lab-validation-compare">Porównaj model z pomiarem</button>
      </div>

      {message && <p className="settings-hint" role="status">{message}</p>}
      <p className="dossier-boundary">
        Obserwacja laboratoryjna ≠ skuteczność kliniczna. Zgodność w tolerancji oznacza wyłącznie zgodność modelu z tym pomiarem.
      </p>
    </section>
  );
}
