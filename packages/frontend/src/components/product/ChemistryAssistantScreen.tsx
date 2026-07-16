/**
 * ChemistryAssistantScreen (Stage 4) — the product. One question: "how do I get a
 * trustworthy molecule analysis the AI can't fabricate, in under a minute?".
 *
 * Workflow (all existing parts, no new endpoint/engine/model):
 *   login → SMILES → RDKit (buildLabReadiness + renderMolecule via MoleculeReport)
 *   → grounded facts → rule-based interpretation → (AI via /api/ask, honest if
 *   unavailable) → verified report → saved to history → Export PDF (browser print).
 */
import { useEffect, useState } from 'react';
import { ProductChrome } from './ProductChrome';
import { MoleculeReport, type ReportData, type AiInterpretation, type ReportMeta } from './MoleculeReport';
import { Panel, StatusPill } from '../discovery/DiscoveryShell';
import { Icon } from '../Icon';
import { AccountPanel } from '../AccountPanel';
import { useSession } from '../../core/backend/session';
import { buildLabReadiness, fetchScienceCapabilities } from '../../core/backend/client';
import { propsFromDossier } from '../../core/dossierProps';
import { askDiscovery } from '../../core/aiChat';
import { interpretMolecule } from '../../core/moleculeInterpretation';
import { analysisHash, newReportId, GROUNDING_VERSION } from '../../core/provenance';
import { saveAnalysis, getAnalysis, type AnalysisStatus } from '../../core/assistantHistory';

const EXAMPLES = [
  { name: 'Aspiryna', smiles: 'CC(=O)Oc1ccccc1C(=O)O' },
  { name: 'Ibuprofen', smiles: 'CC(C)Cc1ccc(C(C)C(=O)O)cc1' },
  { name: 'Paracetamol', smiles: 'CC(=O)Nc1ccc(O)cc1' },
  { name: 'Kofeina', smiles: 'Cn1cnc2c1c(=O)n(C)c(=O)n2C' },
];
const REOPEN_KEY = 'genesis-assistant-reopen';

export function ChemistryAssistantScreen() {
  const session = useSession();
  const [smiles, setSmiles] = useState(EXAMPLES[0].smiles);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ status: AnalysisStatus; text: string } | null>(null);
  const [report, setReport] = useState<ReportData | null>(null);
  const [ai, setAi] = useState<AiInterpretation>({ available: false });
  const [meta, setMeta] = useState<ReportMeta | null>(null);

  // Reopen from "My Analyses" (id passed via sessionStorage).
  useEffect(() => {
    if (!session) return;
    const rid = typeof window !== 'undefined' ? window.sessionStorage.getItem(REOPEN_KEY) : null;
    if (!rid) return;
    window.sessionStorage.removeItem(REOPEN_KEY);
    const saved = getAnalysis(session.user.id, rid);
    if (saved?.report) {
      setSmiles(saved.smiles); setName(saved.name);
      setReport({ name: saved.name, smiles: saved.smiles, inchiKey: saved.report.inchiKey, molecularFormula: saved.report.molecularFormula, props: saved.report.props, notes: saved.report.notes, alerts: saved.report.alerts ?? [] });
      setMeta(null); // reproducibility hash is per-run; a reopened report shows the decision layer without a fresh hash
      setAi({ available: false, unavailableReason: 'zapisana analiza' });
    }
  }, [session]);

  if (!session) {
    return (
      <ProductChrome active="#/assistant">
        <div className="product-hero">
          <h1>Wiarygodna analiza cząsteczki w &lt; minutę</h1>
          <p className="product-lede">Wpisz SMILES. RDKit liczy realnie, Grounding Layer weryfikuje każde twierdzenie — AI nie może niczego zmyślić.</p>
        </div>
        <Panel title="Zaloguj się, aby zacząć" icon="lock"><AccountPanel /></Panel>
      </ProductChrome>
    );
  }

  const analyze = async (s: string) => {
    const q = s.trim();
    if (!q || busy) return;
    setBusy(true); setError(null); setStatusMsg(null); setReport(null); setMeta(null);
    const r = await buildLabReadiness(q);
    if (!r.ok) { setBusy(false); setError(r.message); return; }
    const readiness = r.data;
    if (readiness.status !== 'COMPLETED' || !readiness.dossier) {
      const status: AnalysisStatus = readiness.status === 'BLOCKED_BY_RUNTIME' ? 'BLOCKED' : 'INVALID';
      setStatusMsg({ status, text: readiness.status === 'BLOCKED_BY_RUNTIME' ? 'Silnik RDKit jest niedostępny (BLOCKED_BY_RUNTIME) — nie liczymy i nie zmyślamy.' : 'Nie udało się sparsować SMILES — sprawdź poprawność.' });
      saveAnalysis({ ownerId: session.user.id, name: name || q.slice(0, 24), smiles: q, status, report: null });
      setBusy(false);
      return;
    }
    const d = readiness.dossier;
    const props = propsFromDossier(d);
    const notes = interpretMolecule(props);
    const alerts = (d.structuralAlerts ?? []).map((a) => a.name).filter(Boolean);
    const data: ReportData = {
      name: name || d.proposedStructure.molecularFormula, smiles: d.identity.smiles,
      inchiKey: d.identity.inchiKey, molecularFormula: d.proposedStructure.molecularFormula, props, notes, alerts,
    };
    setReport(data);
    // Reproducibility + provenance metadata (Stage 5): real RDKit version + deterministic hash.
    const caps = await fetchScienceCapabilities();
    const rdkitVersion = caps.ok ? (caps.data.engines.rdkit?.version ?? 'nieznana') : 'nieznana';
    const genesisVersion = caps.ok ? caps.data.version : 'nieznana';
    const generatedAt = Date.now();
    const hash = await analysisHash({
      canonicalSmiles: d.identity.smiles, inchiKey: d.identity.inchiKey,
      properties: { molWt: props.molWt, logP: props.logP, tpsa: props.tpsa, hbd: props.hbd, hba: props.hba, lipinskiViolations: props.lipinskiViolations, lipinskiPass: props.lipinskiPass },
      rdkitVersion,
    });
    setMeta({ rdkitVersion, repro: { reportId: newReportId(), analysisHash: hash, genesisVersion, rdkitVersion, groundingVersion: GROUNDING_VERSION, generatedAt } });
    // AI interpretation via the existing /api/ask (grounded server-side). Honest if unavailable.
    const aiReply = await askDiscovery(`Podaj krótką, praktyczną interpretację tej cząsteczki WYŁĄCZNIE na podstawie faktów: MW ${props.molWt}, LogP ${props.logP}, TPSA ${props.tpsa}, HBD ${props.hbd}, HBA ${props.hba}, Lipinski ${props.lipinskiPass ? 'pass' : props.lipinskiViolations + ' viol'}. SMILES ${d.identity.smiles}.`);
    setAi(aiReply.ok ? { available: true, text: aiReply.answer } : { available: false, unavailableReason: aiReply.message });
    saveAnalysis({ ownerId: session.user.id, name: data.name, smiles: data.smiles, status: 'VERIFIED', report: { inchiKey: data.inchiKey, molecularFormula: data.molecularFormula, props, notes, alerts } });
    setBusy(false);
  };

  return (
    <ProductChrome active="#/assistant">
      <Panel title="Analiza cząsteczki" icon="molecule" right={<StatusPill kind="info">RDKit + Grounding Layer</StatusPill>}>
        <div className="ds-input-row">
          <input value={smiles} onChange={(e) => setSmiles(e.target.value)} placeholder="SMILES, np. CC(=O)Oc1ccccc1C(=O)O"
            spellCheck={false} style={{ fontFamily: 'var(--font-mono)' }} onKeyDown={(e) => { if (e.key === 'Enter') analyze(smiles); }} />
          <button className="ds-btn ds-btn-primary" onClick={() => analyze(smiles)} disabled={busy}>{busy ? 'Liczę…' : 'Analizuj'}</button>
        </div>
        <div className="ds-input-row ds-mt" style={{ maxWidth: 360 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nazwa analizy (opcjonalnie)" maxLength={60} />
        </div>
        <div className="ds-chips ds-mt">
          {EXAMPLES.map((ex) => <button key={ex.name} className="ds-chip" onClick={() => { setSmiles(ex.smiles); setName(ex.name); analyze(ex.smiles); }}>{ex.name}</button>)}
        </div>
      </Panel>

      {error ? <div className="ds-empty ds-mt"><Icon name="alert" size={22} className="ds-empty-icon" /><h4>Backend niedostępny</h4><p>{error}</p></div> : null}
      {busy && !report ? <div className="skeleton ds-mt" style={{ height: 220 }} /> : null}
      {statusMsg ? (
        <div className="ds-empty ds-mt"><Icon name={statusMsg.status === 'BLOCKED' ? 'block' : 'alert'} size={24} className="ds-empty-icon" /><h4>{statusMsg.status}</h4><p>{statusMsg.text}</p></div>
      ) : null}

      {report ? <div className="ds-mt"><MoleculeReport data={report} ai={ai} meta={meta ?? undefined} onExport={() => window.print()} /></div> : null}
    </ProductChrome>
  );
}
