/**
 * ComparePlatformScreen (Stage 6) — Genesis as a molecule SELECTION platform.
 *
 * Paste 2–50 molecules (one per line, optional "Name = SMILES"), Genesis runs the
 * EXISTING RDKit lab-readiness for each, then ranks, compares to a reference, buckets a
 * portfolio, renders a decision dashboard + scientific matrix, and exports one batch
 * PDF. No new engine/endpoint/model, no biology, no efficacy — reuses buildLabReadiness
 * and the deterministic comparison engine.
 */
import { useMemo, useState } from 'react';
import { ProductChrome } from './ProductChrome';
import { ComparisonReport } from './ComparisonReport';
import { Panel, StatusPill } from '../discovery/DiscoveryShell';
import { Icon } from '../Icon';
import { AccountPanel } from '../AccountPanel';
import { useSession } from '../../core/backend/session';
import { runBatch } from '../../core/batchRunner';
import { rankCandidates, type Candidate, type RankedCandidate } from '../../core/moleculeComparison';

const MAX = 50;
const EXAMPLE = `Aspiryna = CC(=O)Oc1ccccc1C(=O)O
Ibuprofen = CC(C)Cc1ccc(C(C)C(=O)O)cc1
Paracetamol = CC(=O)Nc1ccc(O)cc1
Kofeina = Cn1cnc2c1c(=O)n(C)c(=O)n2C
Atorwastatyna = CC(C)c1c(C(=O)Nc2ccccc2)c(-c2ccccc2)c(-c2ccc(F)cc2)n1CCC(O)CC(O)CC(=O)O`;

interface ParsedEntry { name: string; smiles: string }
interface FailedEntry { name: string; smiles: string; reason: string }

/** Shared with Campaigns via parseMoleculeLines — one parser, one pipeline. */
export function parseMoleculeLines(raw: string, max = MAX): ParsedEntry[] {
  return raw.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const m = line.match(/^(.*?)\s*[=|]\s*(.+)$/);
    if (m) return { name: m[1].trim() || m[2].trim(), smiles: m[2].trim() };
    return { name: line, smiles: line };
  }).slice(0, max);
}

export function ComparePlatformScreen() {
  const session = useSession();
  const [raw, setRaw] = useState(EXAMPLE);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [failed, setFailed] = useState<FailedEntry[]>([]);
  const [referenceId, setReferenceId] = useState<string | null>(null);

  const ranked: RankedCandidate[] = useMemo(() => rankCandidates(candidates), [candidates]);

  if (!session) {
    return (
      <ProductChrome active="#/compare">
        <div className="product-hero">
          <h1>Porównaj i wybierz najlepszą cząsteczkę</h1>
          <p className="product-lede">Genesis rankinguje kandydatów wyłącznie na zweryfikowanych deskryptorach RDKit — bez zmyślania biologii.</p>
        </div>
        <Panel title="Zaloguj się, aby zacząć" icon="lock"><AccountPanel /></Panel>
      </ProductChrome>
    );
  }

  const run = async () => {
    const entries = parseMoleculeLines(raw);
    if (entries.length < 2) { setError('Podaj co najmniej 2 cząsteczki (po jednej w wierszu).'); return; }
    setBusy(true); setError(null); setCandidates([]); setFailed([]); setReferenceId(null);
    setProgress({ done: 0, total: entries.length });
    const { candidates: ok, failed: bad } = await runBatch(
      entries.map((e, i) => ({ id: `c${i}-${e.smiles}`, name: e.name, smiles: e.smiles })),
      { concurrency: 4, onProgress: (p) => setProgress({ done: p.done, total: p.total }) },
    );
    setCandidates(ok); setFailed(bad.map((b) => ({ name: b.name, smiles: b.smiles, reason: b.reason })));
    if (ok.length) setReferenceId(ok[0].id);
    setBusy(false); setProgress(null);
  };

  const count = parseMoleculeLines(raw).length;

  return (
    <ProductChrome active="#/compare">
      <Panel title="Porównaj cząsteczki" icon="graph" right={<StatusPill kind="info">{count}/{MAX} cząsteczek</StatusPill>}>
        <p className="ds-note" style={{ marginTop: 0 }}>Jedna cząsteczka na wiersz. Opcjonalnie <code>Nazwa = SMILES</code>. Obsługa 2–50 kandydatów, licząc realnym RDKit.</p>
        <textarea className="compare-input ds-mono" value={raw} onChange={(e) => setRaw(e.target.value)} spellCheck={false} rows={7} placeholder={'Aspiryna = CC(=O)Oc1ccccc1C(=O)O\nIbuprofen = CC(C)Cc1ccc(C(C)C(=O)O)cc1'} />
        <div className="ds-input-row ds-mt">
          <button className="ds-btn ds-btn-primary" onClick={run} disabled={busy}>{busy ? (progress ? `Liczę… ${progress.done}/${progress.total}` : 'Liczę…') : 'Porównaj i uszereguj'}</button>
          <button className="ds-btn" onClick={() => setRaw(EXAMPLE)} disabled={busy}>Przykład</button>
          {ranked.length ? <button className="ds-btn" onClick={() => window.print()}>Eksportuj PDF (batch)</button> : null}
        </div>
        {ranked.length >= 1 ? (
          <div className="ds-input-row ds-mt" style={{ maxWidth: 420, alignItems: 'center' }}>
            <label className="ds-dim" style={{ whiteSpace: 'nowrap' }}>Referencja:</label>
            <select value={referenceId ?? ''} onChange={(e) => setReferenceId(e.target.value || null)} className="compare-select">
              <option value="">— brak —</option>
              {ranked.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        ) : null}
      </Panel>

      {error ? <div className="ds-empty ds-mt"><Icon name="alert" size={22} className="ds-empty-icon" /><h4>Sprawdź dane wejściowe</h4><p>{error}</p></div> : null}
      {busy ? <div className="skeleton ds-mt" style={{ height: 200 }} /> : null}
      {failed.length ? (
        <div className="ds-callout ds-mt"><Icon name="alert" size={15} /> Pominięto {failed.length} pozycji: {failed.map((x) => `${x.name} (${x.reason})`).join('; ')}. Genesis liczy tylko poprawne — nie zmyśla brakujących.</div>
      ) : null}

      {ranked.length ? <div className="ds-mt"><ComparisonReport ranked={ranked} referenceId={referenceId} /></div> : null}
    </ProductChrome>
  );
}
