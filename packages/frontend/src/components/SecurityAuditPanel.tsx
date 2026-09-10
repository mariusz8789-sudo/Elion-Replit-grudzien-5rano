import { useState } from 'react';
import { getDependencyAudit, type DependencyAuditFinding, type DependencyAuditResult } from '../core/backend/client';
import { useSession, getToken } from '../core/backend/session';

/**
 * Pierwsza uczciwa warstwa "Genesis Cyber" w UI: pokazuje realne wyniki
 * `npm audit` (security/dependencyAudit.mjs) na wdrożonym repo — nic tu nie
 * jest wymyślone ani przeanalizowane głębiej niż to zrobił sam npm. Każde
 * odkrycie zostaje na statusie SUSPECTED (npm dopasował realną wersję do
 * realnego advisory; to nie jest analiza dosięgalności/wykorzystywalności).
 * Wymaga zalogowania — patrz uzasadnienie przy trasie backendu.
 */
export function SecurityAuditPanel() {
  const session = useSession();
  const [result, setResult] = useState<DependencyAuditResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!session) {
    return (
      <p className="settings-hint">
        Audyt podatności zależności wymaga zalogowania (patrz sekcja „Konto (chmura)" powyżej) — ujawnia realne,
        podatne wersje bibliotek działającego serwera.
      </p>
    );
  }

  async function runAudit() {
    const token = getToken();
    if (!token) return;
    setBusy(true);
    setError(null);
    const r = await getDependencyAudit(token);
    setBusy(false);
    if (r.ok) setResult(r.data);
    else setError(r.message);
  }

  return (
    <div className="security-audit-panel">
      <p className="settings-hint">
        Realny <code>npm audit</code> na tym repo — każde odkrycie zaczyna (i zostaje, bez dalszej walidacji) na
        statusie SUSPECTED: to dopasowanie do realnej bazy advisory npm, nie analiza dosięgalności ani
        wykorzystywalności. Wyniki cache'owane 5 minut po stronie serwera.
      </p>
      <button className="chip-btn" onClick={runAudit} disabled={busy}>
        {busy ? 'Audytowanie…' : 'Uruchom audyt zależności'}
      </button>
      {error && <div className="account-error" role="alert">{error}</div>}
      {result && <DependencyAuditResultView result={result} />}
    </div>
  );
}

function DependencyAuditResultView({ result }: { result: DependencyAuditResult }) {
  if (result.findings.length === 0) {
    return <p className="settings-hint">Brak dopasowań w bazie advisory npm — zero odkryć SUSPECTED.</p>;
  }
  return (
    <div className="stat-list" data-testid="dependency-audit-findings">
      <div className="stat-row">
        <span>Łącznie odkryć</span>
        <span className="val">{result.summary.total}</span>
      </div>
      {Object.entries(result.summary.bySeverity).map(([severity, count]) => (
        <div className="stat-row" key={severity}>
          <span>Ważność: {severity}</span>
          <span className="val">{count}</span>
        </div>
      ))}
      <ul className="dependency-finding-list">
        {result.findings.map((finding) => <DependencyFindingRow key={finding.id} finding={finding} />)}
      </ul>
    </div>
  );
}

function DependencyFindingRow({ finding }: { finding: DependencyAuditFinding }) {
  return (
    <li className="dependency-finding-row">
      <strong>{finding.affectedComponent}</strong> — {finding.severity} ({finding.status})
      <div className="settings-hint">{finding.hypothesis}</div>
      <div className="settings-hint">{finding.remediation}</div>
    </li>
  );
}
