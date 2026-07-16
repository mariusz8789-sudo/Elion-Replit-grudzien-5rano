/**
 * MyAnalysesScreen (Stage 4) — the user's analysis history. Each row: date, name,
 * SMILES, status; reopen loads the saved report in the Assistant. Local per-user
 * store (assistantHistory) — no backend, no new endpoint.
 */
import { useEffect, useState } from 'react';
import { ProductChrome } from './ProductChrome';
import { Panel, StatusPill } from '../discovery/DiscoveryShell';
import { Icon } from '../Icon';
import { AccountPanel } from '../AccountPanel';
import { useSession } from '../../core/backend/session';
import { listAnalyses, deleteAnalysis, type SavedAnalysis, type AnalysisStatus } from '../../core/assistantHistory';

const REOPEN_KEY = 'genesis-assistant-reopen';
const STATUS: Record<AnalysisStatus, { kind: 'ok' | 'warn' | 'blocked'; label: string }> = {
  VERIFIED: { kind: 'ok', label: 'Zweryfikowana' },
  INVALID: { kind: 'warn', label: 'Błędny SMILES' },
  BLOCKED: { kind: 'blocked', label: 'RDKit niedostępny' },
};

export function MyAnalysesScreen() {
  const session = useSession();
  const [items, setItems] = useState<SavedAnalysis[]>([]);
  const refresh = () => { if (session) setItems(listAnalyses(session.user.id)); };
  useEffect(refresh, [session]);

  if (!session) {
    return <ProductChrome active="#/analyses"><Panel title="Zaloguj się" icon="lock"><AccountPanel /></Panel></ProductChrome>;
  }

  const reopen = (a: SavedAnalysis) => {
    if (a.status !== 'VERIFIED' || !a.report) { window.location.hash = '#/assistant'; return; }
    window.sessionStorage.setItem(REOPEN_KEY, a.id);
    window.location.hash = '#/assistant';
  };
  const remove = (a: SavedAnalysis) => { deleteAnalysis(session.user.id, a.id); refresh(); };

  return (
    <ProductChrome active="#/analyses">
      <Panel title="Moje analizy" icon="book" right={<StatusPill kind="info">{items.length} zapisanych</StatusPill>}>
        {items.length === 0 ? (
          <div className="ds-empty"><Icon name="flask" size={26} className="ds-empty-icon" /><h4>Brak analiz</h4><p>Przejdź do Asystenta i przeanalizuj pierwszą cząsteczkę.</p><a className="ds-btn ds-btn-primary" href="#/assistant">Nowa analiza</a></div>
        ) : (
          <div className="ds-table-wrap">
            <table className="ds-table">
              <thead><tr><th>Data</th><th>Nazwa</th><th>SMILES</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {items.map((a) => (
                  <tr key={a.id}>
                    <td className="ds-dim">{new Date(a.date).toLocaleDateString('pl-PL')}</td>
                    <td className="ds-strong">{a.name}</td>
                    <td className="ds-mono" style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.smiles}>{a.smiles}</td>
                    <td><StatusPill kind={STATUS[a.status].kind}>{STATUS[a.status].label}</StatusPill></td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="ds-chip" onClick={() => reopen(a)} disabled={a.status !== 'VERIFIED'}><Icon name="book" size={13} /> Otwórz</button>
                      <button className="ds-chip" onClick={() => remove(a)} style={{ marginLeft: 6 }}><Icon name="block" size={13} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </ProductChrome>
  );
}
