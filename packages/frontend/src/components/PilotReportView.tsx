/**
 * Pilot-ready, printable analysis report (Verification Mandate Mission 4).
 * Rendered ENTIRELY from the backend PilotReport (real stored analysis output). Print via
 * the browser (window.print) — no PDF dependency. Professional enough to send to an R&D
 * director; it states its scientific limitation explicitly and claims no validation.
 */
import type { PilotReport, KillSwitchDecision } from '../core/backend/client';

const DECISION_CLASS: Record<KillSwitchDecision, string> = {
  GO: 'pill-ok', WARN: 'pill-warn', BLOCK: 'pill-danger', INSUFFICIENT_DATA: 'pill-neutral',
};

function fmtDate(ms: number | null): string {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
}

function Block({ title, items }: { title: string; items: string[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="report-block">
      <h3>{title}</h3>
      <ul>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  );
}

export function PilotReportView({ report }: { report: PilotReport }) {
  const r = report;
  return (
    <article className="pilot-report">
      <header className="pilot-report-header">
        <h1>ZEFIR — Pre-Flight R&amp;D Kill-Switch — Raport analizy</h1>
        <div className="pilot-report-meta">
          <div><span>Projekt (najemca)</span><code>{r.projectId ?? '—'}</code></div>
          <div><span>ID analizy</span><code>{r.analysisId ?? '—'}</code></div>
          <div><span>Data</span><code>{fmtDate(r.analysisDate)}</code></div>
          <div><span>Hash decyzji</span><code>{r.decisionHash ?? '—'}</code></div>
          <div><span>Hash propozycji</span><code>{r.proposalHash ?? '—'}</code></div>
          <div><span>Certyfikat</span><code>{r.certificate.schema} · truthEngine {r.certificate.engineVersions.truthEngine ?? '?'}</code></div>
        </div>
      </header>

      <div className="pilot-report-decision">
        <span className={`pill ${DECISION_CLASS[r.finalDecision]}`}>{r.finalDecision}</span>
        <span className="report-strength">Siła decyzji: {r.decisionStrength ?? '—'}</span>
      </div>

      <Block title="Krytyczne przesłanki (powody zabicia)" items={r.criticalFailures} />
      <Block title="Naruszenia ograniczeń deterministycznych" items={r.constraintFindings.map((c) => `${c.id}: ${c.detail}`)} />
      <Block title="Niespójności wymiarowe" items={r.dimensionalFindings} />
      <Block title="Naruszenia ograniczeń fizycznych" items={r.physicalConstraintViolations} />
      <Block title="Brakujące informacje" items={r.missingInformation} />
      <Block title="Nierozstrzygnięte założenia" items={r.unresolvedAssumptions} />
      <Block title="Luki zdolności (nieocenione)" items={r.capabilityGaps} />
      <Block title="Domeny bez zakodowanej wiedzy" items={r.unsupportedDomains.map((u) => `${u.domain}: ${u.reason}`)} />

      <div className="report-block">
        <h3>Wpływ pamięci porażek (Necropolis)</h3>
        <p>{r.necropolisInfluence.influenced
          ? `TAK — dopasowano do wcześniej zarejestrowanego martwego końca (${r.necropolisInfluence.findings.join(', ')}).`
          : 'Nie — propozycja nie leży blisko żadnego zarejestrowanego martwego końca tego najemcy.'}</p>
      </div>

      {r.cheapestFalsification && (
        <div className="report-block">
          <h3>Najtańszy test falsyfikujący (najwyższa informacja / najniższy koszt)</h3>
          <p>Cel: <strong>{r.cheapestFalsification.targetAssumption}</strong></p>
          <p>Test: {r.cheapestFalsification.recommendedTestType} ({r.cheapestFalsification.relativeCostClass})</p>
          <p>Wymagane wejście: {r.cheapestFalsification.requiredInput}</p>
          <p className="report-muted">{r.cheapestFalsification.priorityReason}</p>
        </div>
      )}

      <Block title="Powody, by NIE zabijać projektu" items={r.reasonsNotToKill} />

      <div className="report-block">
        <h3>Silniki: wykonane / pominięte</h3>
        <p><strong>Wykonane:</strong> {r.enginesExecuted.join(', ') || '—'}</p>
        <p><strong>Pominięte:</strong> {r.enginesSkipped.map((s) => `${s.stage} (${s.reason})`).join('; ') || '—'}</p>
      </div>

      <footer className="pilot-report-footer">
        <h3>Ograniczenie interpretacyjne</h3>
        <p>{r.limitationStatement}</p>
      </footer>
    </article>
  );
}
