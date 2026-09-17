import { useState } from 'react';
import type React from 'react';
import { REGISTRY } from '../../core/evidenceConnectors/registry';
import { sharedEvidenceConnectorStore } from '../../core/evidenceConnectors/sharedStore';
import { httpConnectorPort } from '../../core/evidenceConnectors/httpConnectorPort';
import type { DriftReport } from '../../core/evidenceConnectors/contracts';

/**
 * EVIDENCE SOURCE STATUS — a read-only projection of
 * `EvidenceConnectorStore.driftReport()` for every registered source
 * (docs/DECISIONS.md D-057). Shown on `/gov-campaign` and
 * `/research-console` as the mandate requires; it does not gate, weight,
 * or otherwise feed anything shown here into scientific ranking — it is
 * status only.
 *
 * "Check now" performs a REAL fetch via `httpConnectorPort` (the same real
 * `fetch()` this repo's `scripts/fetch-real-data.mjs` uses) — never a
 * fabricated success. This sandbox's own network policy blocks most
 * external hosts (documented at that script's own header), so a
 * `FETCH_FAILED` result here is the expected, honest outcome in this
 * environment, not a bug in this panel.
 */
export function EvidenceSourceStatusPanel(): React.ReactElement {
  const [reports, setReports] = useState<Readonly<Record<string, DriftReport>>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const checkOne = async (sourceId: string): Promise<void> => {
    setBusy(sourceId);
    const source = REGISTRY.find((s) => s.sourceId === sourceId);
    if (source === undefined) { setBusy(null); return; }
    await sharedEvidenceConnectorStore.ingest(source, httpConnectorPort);
    const report = await sharedEvidenceConnectorStore.driftReport(sourceId);
    setReports((prev) => ({ ...prev, [sourceId]: report }));
    setBusy(null);
  };

  return (
    <div className="settings-section">
      <h3 className="section-label">Evidence source status</h3>
      <p className="settings-hint">
        Real ingest history per external source (FROZEN / drift / fetch-failed counts) — status only, never an input
        to ranking or adjudication. Empty until "Check now" is pressed; this sandbox's network policy may block the
        real fetch, in which case the honest result is FETCH_FAILED, not a fabricated success.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {REGISTRY.map((source) => {
          const report = reports[source.sourceId];
          return (
            <div key={source.sourceId} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="gu-hint" style={{ minWidth: 160, margin: 0 }}>{source.name}</span>
              <span className="gu-hint" style={{ margin: 0 }}>
                {report ? `FROZEN ${report.frozenCount} / drift ${report.driftCount} / fetch-failed ${report.fetchFailedCount}` : 'not checked yet'}
              </span>
              <button type="button" className="chip-btn" disabled={busy === source.sourceId} onClick={() => void checkOne(source.sourceId)}>
                {busy === source.sourceId ? 'checking…' : 'Check now'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
