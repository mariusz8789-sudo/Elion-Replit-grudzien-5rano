import { useEffect, useMemo, useState } from 'react';
import { getToken } from '../core/backend/session';
import type { ActiveKnowledgeProject } from '../core/backend/knowledgeProjectContext';
import {
  continueDrugResearchJourney,
  draftDrugResearchJourney,
  executeDrugResearchJourney,
  liveLabHash,
  type DraftedDrugJourney,
  type CandidateExperimentOutcome,
  type DrugDiscoveryChatRequest,
  type PreparedDrugJourney,
} from '../core/scienceChat/unifiedResearchJourney';
import type { VirtualExperimentPlan, VirtualExperimentResult } from '../core/backend/client';
import { ComputationalExperimentPlayback } from './ComputationalExperimentPlayback';
import { buildDrugHypothesis, registerDrugHypothesis } from '../core/liveExperiment/drugHypothesis';

interface Props {
  request: DrugDiscoveryChatRequest;
  project: ActiveKnowledgeProject;
  onActivateLaboratory: () => void;
  /** Opens the drug bench of the one laboratory, which runs the drafted campaign live. */
  onOpenLiveLab?: (hash: string) => void;
}

type JourneyPhase = 'DISCOVERING' | 'PLANNED' | 'PREPARING' | 'READY' | 'EXECUTING' | 'COMPLETE' | 'BLOCKED';

function shortCandidate(smiles: string): string {
  return smiles.length > 32 ? `${smiles.slice(0, 29)}…` : smiles;
}

/** One compact surface over the canonical intake, campaign, Virtual Lab, Evidence and replay APIs. */
export function UnifiedResearchJourney({ request, project, onActivateLaboratory, onOpenLiveLab }: Props): JSX.Element {
  const [phase, setPhase] = useState<JourneyPhase>('DISCOVERING');
  const [detail, setDetail] = useState('STARTED · grounding the question and discovering source-backed candidates');
  const [prepared, setPrepared] = useState<PreparedDrugJourney | null>(null);
  const [draft, setDraft] = useState<DraftedDrugJourney | null>(null);
  const hypothesis = useMemo(() => buildDrugHypothesis(request.researchQuery), [request.researchQuery]);
  const [outcomes, setOutcomes] = useState<CandidateExperimentOutcome[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [livePlan, setLivePlan] = useState<VirtualExperimentPlan | null>(null);
  const [liveResult, setLiveResult] = useState<VirtualExperimentResult | null>(null);

  useEffect(() => {
    let current = true;
    const token = getToken();
    setPhase('DISCOVERING');
    setDetail('STARTED · grounding the question and discovering source-backed candidates');
    setPrepared(null);
    setDraft(null);
    setOutcomes([]);
    setSelectedIndex(0);
    setLivePlan(null);
    setLiveResult(null);
    if (!token) {
      setPhase('BLOCKED');
      setDetail('BLOCKED · sign in to run the governed project workflow');
      return () => { current = false; };
    }
    void draftDrugResearchJourney({
      token,
      project,
      request,
      onEvent: (event) => {
        if (!current) return;
        if (event.type === 'CANDIDATES_FOUND') setDetail(`FINISHED · intake found ${event.count} source-backed candidate option(s); campaign prepared, not started`);
      },
    }).then((next) => {
      if (!current) return;
      setDraft(next);
      setPhase('PLANNED');
      setDetail('PLAN · hypothesis frozen before any engine runs — confirm to run it live in the laboratory');
    }).catch((error: unknown) => {
      if (!current) return;
      setPhase('BLOCKED');
      setDetail(`BLOCKED · ${error instanceof Error ? error.message : String(error)}`);
    });
    return () => { current = false; };
  }, [project, request]);

  function openLiveLab(): void {
    if (!draft) return;
    registerDrugHypothesis(draft.campaignId, hypothesis);
    const hash = liveLabHash(draft);
    if (onOpenLiveLab) onOpenLiveLab(hash); else window.location.hash = hash;
  }

  async function prepareInChat(): Promise<void> {
    const token = getToken();
    if (!token || !draft) return;
    setPhase('PREPARING');
    setDetail('STARTED · canonical candidate campaign is running');
    try {
      const next = await continueDrugResearchJourney({
        token,
        draft,
        onEvent: (event) => { if (event.type === 'CAMPAIGN_FINISHED') setDetail(`FINISHED · ${event.count} candidates are ready for laboratory testing`); },
      });
      setPrepared(next);
      setPhase('READY');
      setDetail(`FINISHED · ${next.candidates.length} candidates selected for a bounded RDKit test`);
    } catch (error) {
      setPhase('BLOCKED');
      setDetail(`BLOCKED · ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function execute(): Promise<void> {
    const token = getToken();
    if (!token || !prepared || phase === 'EXECUTING') return;
    onActivateLaboratory();
    setPhase('EXECUTING');
    setDetail('STARTED · requesting the registered RDKit engine');
    setLiveResult(null);
    try {
      const completed = await executeDrugResearchJourney({
        token,
        prepared,
        onEvent: (event) => {
          if (event.type === 'EXPERIMENT_STARTED') {
            setLivePlan(event.plan);
            setLiveResult(null);
            setDetail(`STARTED · RDKit candidate ${event.candidateIndex + 1} of ${event.candidateCount}`);
          } else if (event.type === 'EXPERIMENT_FINISHED') {
            setLiveResult(event.result);
            setDetail(`FINISHED · candidate ${event.candidateIndex + 1} of ${event.candidateCount}: ${event.result.status}`);
          }
        },
      });
      setOutcomes(completed);
      setSelectedIndex(0);
      setPhase('COMPLETE');
      const replayStates = completed.map((item) => item.replay?.replayStatus ?? 'NOT_REPLAYED').join(' · ');
      setDetail(`FINISHED · canonical result, Evidence proposal and replay recorded: ${replayStates}`);
    } catch (error) {
      setPhase('BLOCKED');
      setDetail(`BLOCKED · ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const selected = outcomes[selectedIndex] ?? null;
  const evidenceCount = selected?.dossier.evidenceLinks.length ?? 0;
  const candidateCards = useMemo(() => prepared?.candidates ?? [], [prepared]);

  return (
    <section className="unified-research-journey" aria-label="Drug Discovery laboratory journey" data-phase={phase}>
      <header><div><small>DRUG DISCOVERY · ONE LAB SESSION</small><strong>{request.researchQuery}</strong></div><span className={`journey-state journey-${phase.toLowerCase()}`}>{phase}</span></header>
      <p className="journey-live-status" role="status">{detail}</p>

      {candidateCards.length > 0 && (
        <div className="journey-candidates" aria-label="Selected candidates">
          {candidateCards.map((candidate, index) => (
            <button key={candidate.id} type="button" className={selectedIndex === index ? 'active' : ''} onClick={() => setSelectedIndex(index)} disabled={outcomes.length === 0}>
              <span>Candidate {index + 1}</span><strong>{shortCandidate(candidate.canonicalSmiles)}</strong>
            </button>
          ))}
        </div>
      )}

      {phase === 'PLANNED' && (
        <div className="journey-hypothesis" data-testid="drug-hypothesis" data-fingerprint={hypothesis.fingerprint}>
          <span>HIPOTEZA · zamrożona przed uruchomieniem</span>
          <p>{hypothesis.statement}</p>
          <p className="journey-target">Cel: {hypothesis.target.protein} · PDB {hypothesis.target.pdbId}, łańcuch {hypothesis.target.chain}</p>
          <ol aria-label="Kryteria falsyfikacji">{hypothesis.criteria.map((c) => (
            <li key={c.id}>{c.label} <em>{c.critical ? '[krytyczne — falsyfikator]' : '[niekrytyczne]'} · {c.evidence === 'REAL_ENGINE_OUTPUT' ? 'wynik silnika' : 'estymata modelu'}</em></li>
          ))}</ol>
          <span>PLAN · istniejące silniki</span>
          <ol aria-label="Plan eksperymentu">{hypothesis.plan.map((p) => <li key={p.stage}><strong>{p.engine}</strong> — {p.label} <em>{p.evidence}</em></li>)}</ol>
          <small>
            Odcisk hipotezy: <code>{hypothesis.fingerprint}</code>. Werdykt liczą reguły, nie model językowy: niespełnione kryterium krytyczne to FALSIFIED.
            Wyniki są obliczeniowe — docking to estymata funkcji oceniającej, nie zmierzone powinowactwo; przekształcenia cząsteczek to COMPUTATIONAL TRANSFORMATION, nie synteza.
          </small>
          <div className="journey-actions">
            <button className="primary-btn journey-start" type="button" onClick={openLiveLab} data-testid="drug-open-live-lab">Uruchom na żywo w laboratorium</button>
            <button className="chip-btn" type="button" onClick={() => { void prepareInChat(); }}>Szybki test RDKit w czacie</button>
          </div>
        </div>
      )}

      {phase === 'READY' && (
        <button className="primary-btn journey-start" type="button" onClick={() => { void execute(); }}>
          Enter Laboratory · start live RDKit experiment
        </button>
      )}

      {(phase === 'EXECUTING' || selected) && (
        <ComputationalExperimentPlayback
          plan={selected?.plan ?? livePlan}
          result={selected?.result ?? liveResult}
          replay={selected?.replay ?? null}
          evidenceProposalCount={evidenceCount}
          executing={phase === 'EXECUTING' && liveResult === null}
          events={selected?.dossier.executionTimeline ?? []}
          level="SCHOOL"
        />
      )}

      {selected && (
        <div className="journey-result" aria-label="Experiment result and next experiment">
          <div><span>RESULT</span><strong>{selected.result.epistemicClassification}</strong><small>{selected.result.selectedEngine?.engineName ?? selected.result.reason ?? selected.result.status}</small></div>
          <div><span>EVIDENCE</span><strong>{evidenceCount > 0 ? 'PROPOSED' : 'NOT PROPOSED'}</strong><small>{evidenceCount > 0 ? 'Pending human publication' : 'No canonical proposal recorded'}</small></div>
          <div><span>REPLAY</span><strong>{selected.replay?.replayStatus ?? 'NOT REPLAYED'}</strong><small>Canonical verification result</small></div>
          <div><span>NEXT EXPERIMENT</span><strong>{selected.dossier.nextAction.action}</strong><small>{selected.dossier.nextAction.reason}</small></div>
        </div>
      )}

      <details className="journey-research-details">
        <summary>Research details</summary>
        <p>{prepared?.intake.result.selectionExplanation ?? 'Waiting for governed intake.'}</p>
        {selected?.result.derivedOutput && <pre>{JSON.stringify(selected.result.derivedOutput, null, 2)}</pre>}
      </details>
      <small className="journey-boundary">Live computational experiment. No wet-lab telemetry or clinical efficacy claim.</small>
    </section>
  );
}
