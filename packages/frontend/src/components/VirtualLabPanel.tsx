import { useEffect, useMemo, useState } from 'react';
import {
  executeVirtualLabExperiment,
  getVirtualLabDossier,
  planVirtualLabExperiment,
  replayVirtualLabExperiment,
  type CampaignCandidate,
  type VirtualLabCapability,
  type VirtualLabDossier,
} from '../core/backend/client';
import { getToken } from '../core/backend/session';
import { ComputationalExperimentPlayback, type ExperimentPresentationLevel } from './ComputationalExperimentPlayback';

interface Props {
  projectId: string;
  campaignId: string;
  candidates: CampaignCandidate[];
  onChanged?: () => void;
}

const CAPABILITIES: readonly { id: VirtualLabCapability; label: string }[] = [
  { id: 'molecular-descriptors', label: 'RDKit descriptors' },
  { id: 'admet-estimation', label: 'ADMET estimation' },
  { id: 'toxicity-risk-estimation', label: 'Toxicity risk estimation' },
  { id: 'molecular-docking', label: 'Docking (Vina/Meeko)' },
  { id: 'quantum-chemistry', label: 'Quantum chemistry (PySCF)' },
  { id: 'molecular-dynamics', label: 'Molecular dynamics (OpenMM bounded reference)' },
  { id: 'protein-structure-ingestion', label: 'Protein structure ingestion (Biopython)' },
];

/** Product UI over the canonical backend Virtual Lab loop. It never computes scientific values in the browser. */
export function VirtualLabPanel({ projectId, campaignId, candidates, onChanged }: Props): JSX.Element {
  const retained = useMemo(() => candidates.filter((candidate) => candidate.status === 'retained'), [candidates]);
  const [candidateId, setCandidateId] = useState(retained[0]?.id ?? candidates[0]?.id ?? '');
  const [hypothesis, setHypothesis] = useState('The candidate has a computational descriptor profile suitable for further research prioritization.');
  const [capability, setCapability] = useState<VirtualLabCapability>('molecular-descriptors');
  const [outputKey, setOutputKey] = useState('crippenLogP');
  const [threshold, setThreshold] = useState('2.5');
  const [pdbText, setPdbText] = useState('');
  const [dossier, setDossier] = useState<VirtualLabDossier | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [presentationLevel, setPresentationLevel] = useState<ExperimentPresentationLevel>('UNIVERSITY');

  async function refresh(nextCandidateId = candidateId) {
    const token = getToken();
    if (!token || !nextCandidateId) return;
    const response = await getVirtualLabDossier(token, projectId, campaignId, nextCandidateId);
    if (response.ok) {
      setDossier(response.data);
    } else {
      setDossier(null);
      setMessage(response.message);
    }
  }

  useEffect(() => {
    const next = retained[0]?.id ?? candidates[0]?.id ?? '';
    if (!candidateId && next) setCandidateId(next);
  }, [candidateId, candidates, retained]);

  useEffect(() => { void refresh(); }, [projectId, campaignId, candidateId]);

  async function plan() {
    const token = getToken();
    if (!token || !candidateId || !hypothesis.trim()) return;
    const numericThreshold = Number(threshold);
    const expectation = capability === 'molecular-descriptors' && outputKey.trim() && Number.isFinite(numericThreshold)
      ? { outputKey: outputKey.trim(), comparator: 'LTE' as const, threshold: numericThreshold }
      : null;
    const params = capability === 'protein-structure-ingestion'
      ? { pdbText }
      : capability === 'molecular-dynamics' ? { steps: 300 } : {};
    setBusy(true);
    const response = await planVirtualLabExperiment(token, projectId, campaignId, {
      candidateId,
      hypothesis: hypothesis.trim(),
      requestedCapability: capability,
      params,
      expectation,
    });
    setBusy(false);
    setMessage(response.ok ? `Plan ready: ${response.data.executionId}` : response.message);
    if (response.ok) await refresh();
  }

  async function execute() {
    const token = getToken();
    const executionId = dossier?.plans.at(-1)?.payload.executionId;
    if (!token || !candidateId || !executionId) return;
    setBusy(true);
    const response = await executeVirtualLabExperiment(token, projectId, campaignId, candidateId, executionId);
    setBusy(false);
    setMessage(response.ok
      ? `${response.data.result.status}; Evidence proposal: ${response.data.evidenceProposalId ?? 'not created (blocked/non-executed)'}`
      : response.message);
    if (response.ok) {
      await refresh();
      onChanged?.();
    }
  }

  async function replay() {
    const token = getToken();
    const result = dossier?.results.at(-1)?.payload;
    if (!token || !candidateId || !result || result.status !== 'EXECUTED_COMPUTATIONAL_EXPERIMENT') return;
    setBusy(true);
    const response = await replayVirtualLabExperiment(token, projectId, campaignId, candidateId, result.executionId);
    setBusy(false);
    setMessage(response.ok ? `Replay: ${response.data.replayStatus}` : response.message);
    if (response.ok) await refresh();
  }

  const latestResult = dossier?.results.at(-1)?.payload ?? null;
  const latestReplay = dossier?.replays.at(-1)?.payload ?? null;

  return (
    <section className="settings-section" aria-label="Virtual computational laboratory" data-testid="virtual-lab-panel">
      <h3>Virtual Lab — computational closed loop</h3>
      <p className="settings-hint">
        Candidate → hypothesis → real registered engine → computational result → pending Evidence proposal → replay → next action.
        In-silico support is not a laboratory measurement or clinical efficacy.
      </p>
      <div className="account-form">
        <label className="account-field"><span>Candidate</span><select value={candidateId} onChange={(event) => setCandidateId(event.target.value)} data-testid="virtual-lab-candidate">{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.canonicalSmiles} · {candidate.id}</option>)}</select></label>
        <label className="account-field"><span>Hypothesis</span><textarea value={hypothesis} onChange={(event) => setHypothesis(event.target.value)} data-testid="virtual-lab-hypothesis" /></label>
        <label className="account-field"><span>Engine capability</span><select value={capability} onChange={(event) => setCapability(event.target.value as VirtualLabCapability)} data-testid="virtual-lab-capability">{CAPABILITIES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select></label>
        <label className="account-field"><span>Expected numeric output key (optional)</span><input value={outputKey} onChange={(event) => setOutputKey(event.target.value)} /></label>
        <label className="account-field"><span>Expected maximum (optional)</span><input value={threshold} onChange={(event) => setThreshold(event.target.value)} /></label>
        {capability === 'protein-structure-ingestion' && (
          <label className="account-field"><span>Caller-supplied PDB text</span><textarea value={pdbText} onChange={(event) => setPdbText(event.target.value)} placeholder="Paste a provenance-controlled PDB structure; Genesis will not invent or fetch one." /></label>
        )}
        <div className="pilot-actions">
          <button className="chip-btn" disabled={busy || !candidateId || !hypothesis.trim()} onClick={() => { void plan(); }} data-testid="virtual-lab-plan">Plan experiment</button>
          <button className="chip-btn" disabled={busy || !dossier?.plans.length} onClick={() => { void execute(); }} data-testid="virtual-lab-execute">Execute with registered engine</button>
          <button className="chip-btn" disabled={busy || latestResult?.status !== 'EXECUTED_COMPUTATIONAL_EXPERIMENT'} onClick={() => { void replay(); }} data-testid="virtual-lab-replay">Replay result</button>
        </div>
      </div>
      {dossier && (
        <div className="cde-results" data-testid="virtual-lab-dossier">
          <div className="cde-result"><span className="cde-result-label">State</span><span className="cde-result-actual">{latestResult?.status ?? 'PLANNED/NOT_STARTED'}</span><span className="cde-result-bound">{latestResult?.epistemicClassification ?? 'UNKNOWN'}</span></div>
          <div className="cde-result"><span className="cde-result-label">Engine / result</span><span className="cde-result-actual">{latestResult?.selectedEngine?.engineName ?? latestResult?.reason ?? 'No execution result'}</span><span className="cde-result-bound">output: {latestResult?.outputFingerprint ?? 'UNAVAILABLE'}</span></div>
          <div className="cde-result"><span className="cde-result-label">Evidence / replay</span><span className="cde-result-actual">{dossier.evidenceLinks.length} pending proposal(s) · {latestReplay?.replayStatus ?? 'NOT_YET_REPLAYED'}</span><span className="cde-result-bound">dossier: {dossier.dossierFingerprint}</span></div>
          <div className="cde-result"><span className="cde-result-label">Next action</span><span className="cde-result-actual">{dossier.nextAction.action}</span><span className="cde-result-bound">{dossier.nextAction.reason}</span></div>
        </div>
      )}
      <ComputationalExperimentPlayback
        plan={dossier?.plans.at(-1)?.payload ?? null}
        result={latestResult}
        replay={latestReplay}
        evidenceProposalCount={dossier?.evidenceLinks.length ?? 0}
        executing={busy}
        events={dossier?.executionTimeline ?? []}
        level={presentationLevel}
      />
      <label className="account-field experiment-detail-level"><span>Explanation depth</span>
        <select value={presentationLevel} onChange={(event) => setPresentationLevel(event.target.value as ExperimentPresentationLevel)} data-testid="experiment-presentation-level">
          <option value="SCHOOL">School</option><option value="UNIVERSITY">University</option><option value="RESEARCH">Research</option>
        </select>
      </label>
      {latestResult?.derivedOutput && <details><summary>Computational output</summary><pre className="evidence">{JSON.stringify(latestResult.derivedOutput, null, 2)}</pre></details>}
      {message && <p className="settings-hint" role="status">{message}</p>}
      <p className="dossier-boundary">Clinical efficacy: UNKNOWN. The browser displays persisted backend state and performs no scientific derivation.</p>
    </section>
  );
}
