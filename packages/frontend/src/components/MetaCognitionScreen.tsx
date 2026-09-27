import { useMemo, useState } from 'react';
import { kernelRegistry } from '@genesis/core/mythos/KernelProviderRegistry.js';
import { kernelLedger } from '../core/agent/cyberReasoningKernel';
import { listExperiments } from '../core/scienceMemory';
import { runMetaCognitionAudit, type MetaEpistemicState } from '../core/metaCognition/metaCognitionRuntime';
import { runScientificIntegrationCampaign, type ScientificCampaignResult } from '../core/experimentFabric/scientificIntegration';
import { createLedgerSink } from '../core/scientificWorlds/biologyRunners';

const STATES: readonly MetaEpistemicState[] = ['KNOWN', 'SUPPORTED', 'INFERRED', 'SIMULATED', 'ASSUMED', 'UNKNOWN', 'CONTRADICTED', 'UNVERIFIED'];

export function MetaCognitionScreen(): JSX.Element {
  const [revision, setRevision] = useState(0);
  const [campaign, setCampaign] = useState<ScientificCampaignResult | null>(null);
  const [campaignState, setCampaignState] = useState<'IDLE' | 'RUNNING' | 'ERROR'>('IDLE');
  const snapshot = useMemo(() => runMetaCognitionAudit({ ledger: kernelLedger, registry: kernelRegistry }), [revision]);
  const runAudit = (): void => {
    runMetaCognitionAudit({ ledger: kernelLedger, registry: kernelRegistry, persistEvents: true });
    setRevision((value) => value + 1);
  };
  const runCampaign = async (): Promise<void> => {
    setCampaignState('RUNNING');
    try {
      const sink = createLedgerSink(kernelLedger, 'meta-cognition-scientific-campaign');
      const result = await runScientificIntegrationCampaign('problem:intervention-timing', sink, { maxCycles: 2 });
      setCampaign(result);
      setCampaignState('IDLE');
      setRevision((value) => value + 1);
    } catch {
      setCampaignState('ERROR');
    }
  };
  const worldDirectorRecords = snapshot.records.filter((record) => record.claim.includes('World Director generated canonical model world'));

  return (
    <main className="meta-cognition" id="main-content" data-testid="meta-cognition">
      <header className="meta-cognition-head">
        <span className="gx-eyebrow">D-141 · canonical Evidence + Memory</span>
        <h1>Meta‑Cognition / Self‑Audit</h1>
        <p>Widok pochodny z jednego <code>kernelLedger</code>, Scientific Memory i rejestru providerów. Nie posiada własnej trwałej pamięci.</p>
        <button className="chip-btn pilot-primary" type="button" onClick={runAudit} data-testid="meta-run-audit">Uruchom self‑audit i zapisz zdarzenia Evidence</button>
        <button className="chip-btn" type="button" onClick={() => void runCampaign()} disabled={campaignState === 'RUNNING'} data-testid="meta-run-campaign">
          {campaignState === 'RUNNING' ? 'Badanie trwa…' : 'Uruchom ograniczoną kampanię naukową'}
        </button>
      </header>
      <section className="meta-state-grid" aria-label="Epistemic states">
        {STATES.map((state) => <article key={state} className={`meta-state meta-state-${state.toLowerCase()}`} data-testid={`meta-state-${state.toLowerCase()}`}><strong>{snapshot.states[state]}</strong><span>{state}</span></article>)}
      </section>
      <section className="meta-grid">
        <article className="gx-panel">
          <h2>Self‑audit</h2>
          <dl className="pilot-provenance">
            <div><dt>Evidence chain</dt><dd>{snapshot.selfAudit.ledgerValid ? 'VALID' : 'INVALID'}</dd></div>
            <div><dt>Evidence records</dt><dd>{snapshot.records.length}</dd></div>
            <div><dt>Scientific Memory</dt><dd>{listExperiments().length} zapisów UX</dd></div>
            <div><dt>World Director</dt><dd>{worldDirectorRecords.length} dowodów wykonania</dd></div>
            <div><dt>Goals</dt><dd>PARTIAL · propozycje, bez osobnego registry</dd></div>
          </dl>
        </article>
        <article className="gx-panel" data-testid="meta-contradictions">
          <h2>Sprzeczności · {snapshot.contradictions.contradictions.length}</h2>
          {snapshot.contradictions.contradictions.length ? <ul>{snapshot.contradictions.contradictions.slice(0, 6).map((item) => <li key={item.contradictionId}><b>CONTRADICTED</b> · {item.reason}</li>)}</ul> : <p>Brak wykrytych sprzeczności w aktywnych rekordach.</p>}
        </article>
        <article className="gx-panel" data-testid="meta-gaps">
          <h2>Luki / następny eksperyment · {snapshot.gaps.length}</h2>
          {snapshot.gaps.length ? <ol>{snapshot.gaps.slice(0, 6).map((gap) => <li key={gap.questionId}>{gap.text}</li>)}</ol> : <p>Brak pytania wyprowadzonego z obecnego Evidence.</p>}
        </article>
        <article className="gx-panel" data-testid="meta-capabilities">
          <h2>Capabilities · {snapshot.capabilities.length} providerów</h2>
          <ul>{snapshot.capabilities.map((provider) => <li key={provider.providerId}><b>{provider.providerId}</b><span>{provider.capabilities.join(', ')}</span></li>)}</ul>
        </article>
        <article className="gx-panel meta-events" data-testid="meta-events">
          <h2>Meta events · {snapshot.events.length}</h2>
          <ul>{snapshot.events.slice(0, 12).map((item) => <li key={item.eventId}><b>{item.type}</b><span>{item.summary}</span></li>)}</ul>
        </article>
        <article className="gx-panel" data-testid="meta-campaign-result">
          <h2>Kampania naukowa</h2>
          {campaignState === 'ERROR' ? <p>FAILED · wykonanie nie zakończyło się poprawnie.</p> : campaign ? (
            <dl className="pilot-provenance">
              <div><dt>Status</dt><dd>{campaign.status}</dd></div>
              <div><dt>Cykle</dt><dd>{campaign.cycles.length}</dd></div>
              <div><dt>DecisionTrace</dt><dd>{campaign.cycles.at(-1)?.decisionTrace.traceFingerprint ?? 'UNAVAILABLE'}</dd></div>
              <div><dt>Evidence</dt><dd>{campaign.cycles.reduce((sum, cycle) => sum + cycle.evidenceRefs.length, 0)} rekordów</dd></div>
            </dl>
          ) : <p>Nie uruchomiono. Kampania działa przez istniejący ResearchCampaign i canonical Evidence.</p>}
        </article>
      </section>
    </main>
  );
}

export default MetaCognitionScreen;
