/**
 * CampaignReport (Stage 7) — one report for a whole campaign, and the surface that
 * "Export scientific PDF" prints (root `.print-report`). Sections: Executive Summary ·
 * Top Candidates · Rejected · Decision Trace · Scientific Comparison (reuses the Stage 6
 * ComparisonReport, embedded) · Grounding Summary · Provenance Summary · Statistics ·
 * Scientific Limitations · Experimental Validation Required.
 *
 * Never states biological activity; never predicts experimental success. Reuses the
 * Stage 6 engine + ComparisonReport + Stage 5 decision trace — no parallel logic.
 */
import { Panel, StatusPill } from '../discovery/DiscoveryShell';
import { StatCard } from '../charts/Charts';
import { Icon } from '../Icon';
import { ComparisonReport } from './ComparisonReport';
import { DecisionTraceView } from './DecisionTraceView';
import { decisionTrace, VERDICT_META, type RankedCandidate } from '../../core/moleculeComparison';
import type { Campaign } from '../../core/campaigns';
import type { CampaignSummary } from '../../core/campaignStats';

const f = (n: number, d = 1) => (Number.isFinite(n) ? Number(n.toFixed(d)) : n);

export function CampaignReport({ campaign, ranked, summary, referenceId, rdkitVersion, generatedAt }: {
  campaign: Campaign; ranked: RankedCandidate[]; summary: CampaignSummary; referenceId: string | null; rdkitVersion: string; generatedAt: number;
}) {
  return (
    <div className="print-report">
      <div className="report-print-title" aria-hidden="true">Raport kampanii badawczej — {campaign.name}</div>

      {/* Executive Summary */}
      <Panel title="Podsumowanie wykonawcze" icon="book" right={<StatusPill kind="info">{campaign.status}</StatusPill>}>
        <dl className="ds-defs">
          <div style={{ gridColumn: '1 / -1' }}><dt>Kampania</dt><dd className="ds-strong">{campaign.name}</dd></div>
          <div style={{ gridColumn: '1 / -1' }}><dt>Cel naukowy</dt><dd>{campaign.goal || '—'}</dd></div>
          {campaign.description ? <div style={{ gridColumn: '1 / -1' }}><dt>Opis</dt><dd>{campaign.description}</dd></div> : null}
          <div><dt>Właściciel</dt><dd>{campaign.owner}</dd></div>
          <div><dt>Utworzono</dt><dd>{new Date(campaign.createdAt).toLocaleDateString('pl-PL')}</dd></div>
        </dl>
        <div className="ds-grid ds-grid-4 ds-mt">
          <StatCard label="Cząsteczki" value={summary.total} sub="łącznie" accent="var(--cyan)" />
          <StatCard label="Przeanalizowane" value={summary.analysed} sub="RDKit" accent="var(--green)" />
          <StatCard label="Nieprawidłowe" value={summary.invalid} sub="Invalid SMILES" accent="var(--red)" />
          <StatCard label="Kontynuuj" value={summary.verdictCounts.CONTINUE} sub="priorytet" accent="var(--gold)" />
        </div>
        <p className="ds-note ds-mt">Raport zawiera wyłącznie obliczone deskryptory i ugruntowane interpretacje. <strong>Bez</strong> predykcji aktywności biologicznej, skuteczności czy toksyczności. Każdy kierunek wymaga walidacji eksperymentalnej.</p>
      </Panel>

      {/* Top Candidates */}
      <Panel title="Najlepsi kandydaci" icon="check" className="ds-mt" right={<StatusPill kind="ok">{summary.topCandidates.length}</StatusPill>}>
        {summary.topCandidates.length ? (
          <ol className="report-top-list">
            {summary.topCandidates.map((c) => (
              <li key={c.id}><span className="ds-strong">#{c.rank} {c.name}</span> <span className="ds-dim">score {c.scored.score}</span> <span className="ds-mono rank-smiles">{c.smiles}</span></li>
            ))}
          </ol>
        ) : <p className="ds-dim">Żaden kandydat nie uzyskał rekomendacji „Kontynuuj" na podstawie samych deskryptorów.</p>}
      </Panel>

      {/* Rejected */}
      <Panel title="Kandydaci odrzuceni" icon="block" className="ds-mt" right={<StatusPill kind="blocked">{summary.rejected.length}</StatusPill>}>
        {summary.rejected.length ? (
          <ul className="report-top-list">
            {summary.rejected.map((c) => <li key={c.id}><span className="ds-strong">{c.name}</span> <span className="ds-dim">{c.decision.reasons[0]}</span></li>)}
          </ul>
        ) : <p className="ds-dim">Brak odrzuconych na podstawie twardych liabilności fizykochemicznych.</p>}
      </Panel>

      {/* Decision Trace (reuses the single source of truth) */}
      <Panel title="Ślad decyzyjny" icon="graph" className="ds-mt" right={<StatusPill kind="info">jedno źródło prawdy</StatusPill>}>
        {ranked.map((c) => (
          <div key={c.id} className="report-trace-block">
            <h6 className="diff-h">{c.name}</h6>
            <DecisionTraceView trace={decisionTrace(c)} />
          </div>
        ))}
      </Panel>

      {/* Scientific Comparison — reuse Stage 6 ComparisonReport (embedded) */}
      <Panel title="Porównanie naukowe" icon="chart" className="ds-mt" right={<StatusPill kind="info">silnik Stage 6</StatusPill>}>
        <ComparisonReport ranked={ranked} referenceId={referenceId} embedded />
      </Panel>

      {/* Grounding + Provenance Summary */}
      <Panel title="Podsumowanie Grounding i proweniencji" icon="shield" className="ds-mt">
        <dl className="ds-defs">
          <div><dt>Cząsteczki z alertami</dt><dd>{summary.grounding.withAlerts}</dd></div>
          <div><dt>Wersja Grounding</dt><dd className="ds-mono">{summary.grounding.groundingVersion}</dd></div>
          <div><dt>Silnik</dt><dd className="ds-mono">RDKit {rdkitVersion}</dd></div>
          <div><dt>Wygenerowano</dt><dd className="ds-mono">{new Date(generatedAt).toISOString()}</dd></div>
        </dl>
        <p className="ds-note ds-mt">{summary.grounding.note}</p>
      </Panel>

      {/* Campaign Statistics */}
      {summary.averages ? (
        <Panel title="Statystyki kampanii" icon="chart" className="ds-mt" right={<StatusPill kind="info">średnie deskryptorów</StatusPill>}>
          <div className="ds-grid ds-grid-4">
            <StatCard label="Śr. MW" value={f(summary.averages.molWt)} sub="g/mol" accent="var(--cyan)" />
            <StatCard label="Śr. LogP" value={f(summary.averages.logP, 2)} sub="Crippen" accent="var(--violet)" />
            <StatCard label="Śr. TPSA" value={f(summary.averages.tpsa)} sub="Å²" accent="var(--gold)" />
            <StatCard label="Śr. HBD/HBA" value={`${f(summary.averages.hbd, 1)}/${f(summary.averages.hba, 1)}`} sub="wiązania H" accent="var(--cyan)" />
          </div>
          <div className="ds-grid ds-grid-4 ds-mt">
            {(['CONTINUE', 'NEEDS_EXPERIMENTS', 'HIGH_UNCERTAINTY', 'REJECT'] as const).map((v) => (
              <StatCard key={v} label={VERDICT_META[v].label} value={summary.verdictCounts[v]} sub="kandydaci" accent="var(--cyan)" />
            ))}
          </div>
        </Panel>
      ) : null}

      {/* Limitations + Validation */}
      <Panel title="Ograniczenia naukowe i walidacja" icon="alert" className="ds-mt">
        <ul className="decision-removed">
          <li>Wszystkie wartości to deskryptory obliczeniowe RDKit — bez danych eksperymentalnych.</li>
          <li>Score i werdykty to triage rozwojowy, nie ocena aktywności biologicznej, skuteczności ani toksyczności.</li>
          <li>LogP to oszacowanie modelu (~±0.5) — nie wartość zmierzona.</li>
        </ul>
        <div className="ds-callout ds-mt"><Icon name="flask" size={15} /> <strong>Wymagana walidacja eksperymentalna</strong> dla każdego kandydata przed decyzją rozwojową (rozpuszczalność, permeacja, ADMET in vitro, assay).</div>
      </Panel>
    </div>
  );
}
