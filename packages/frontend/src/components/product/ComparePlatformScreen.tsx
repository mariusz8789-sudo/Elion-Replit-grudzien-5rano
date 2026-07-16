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
import { buildLabReadiness, type LabReadiness } from '../../core/backend/client';
import type { MoleculeProps } from '../../core/moleculeInterpretation';
import { rankCandidates, type Candidate, type RankedCandidate } from '../../core/moleculeComparison';

const MAX = 50;
const EXAMPLE = `Aspiryna = CC(=O)Oc1ccccc1C(=O)O
Ibuprofen = CC(C)Cc1ccc(C(C)C(=O)O)cc1
Paracetamol = CC(=O)Nc1ccc(O)cc1
Kofeina = Cn1cnc2c1c(=O)n(C)c(=O)n2C
Atorwastatyna = CC(C)c1c(C(=O)Nc2ccccc2)c(-c2ccccc2)c(-c2ccc(F)cc2)n1CCC(O)CC(O)CC(=O)O`;

interface ParsedEntry { name: string; smiles: string }
interface FailedEntry { name: string; smiles: string; reason: string }

function parseInput(raw: string): ParsedEntry[] {
  return raw.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
    const m = line.match(/^(.*?)\s*[=|]\s*(.+)$/);
    if (m) return { name: m[1].trim() || m[2].trim(), smiles: m[2].trim() };
    return { name: line, smiles: line };
  }).slice(0, MAX);
}

function propsFromDossier(d: NonNullable<LabReadiness['dossier']>): MoleculeProps {
  const pr = d.properties;
  return {
    molWt: Number(d.mass.averageMolWt), logP: Number(pr.logP), tpsa: Number(pr.tpsa),
    hbd: Number(pr.hbd), hba: Number(pr.hba),
    lipinskiViolations: Number(pr.lipinskiViolations), lipinskiPass: Boolean(pr.lipinskiPass),
  };
}

/** Limited-concurrency map so 50 molecules don't fire 50 subprocess calls at once. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
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
    const entries = parseInput(raw);
    if (entries.length < 2) { setError('Podaj co najmniej 2 cząsteczki (po jednej w wierszu).'); return; }
    setBusy(true); setError(null); setCandidates([]); setFailed([]); setReferenceId(null);
    setProgress({ done: 0, total: entries.length });
    let done = 0;
    const results = await mapLimit(entries, 4, async (e) => {
      const r = await buildLabReadiness(e.smiles);
      done += 1; setProgress({ done, total: entries.length });
      if (!r.ok) return { ok: false as const, entry: e, reason: r.message };
      const rd = r.data;
      if (rd.status !== 'COMPLETED' || !rd.dossier) {
        return { ok: false as const, entry: e, reason: rd.status === 'BLOCKED_BY_RUNTIME' ? 'Silnik RDKit niedostępny (BLOCKED_BY_RUNTIME)' : 'Nie udało się sparsować SMILES' };
      }
      const d = rd.dossier;
      const c: Candidate = { id: `c${done}-${e.smiles}`, name: e.name, smiles: d.identity.smiles, props: propsFromDossier(d), alerts: (d.structuralAlerts ?? []).map((a) => a.name).filter(Boolean) };
      return { ok: true as const, candidate: c };
    });
    const ok = results.filter((r) => r.ok).map((r) => (r as { candidate: Candidate }).candidate);
    const bad = results.filter((r) => !r.ok).map((r) => { const x = r as { entry: ParsedEntry; reason: string }; return { name: x.entry.name, smiles: x.entry.smiles, reason: x.reason }; });
    setCandidates(ok); setFailed(bad);
    if (ok.length) setReferenceId(ok[0].id);
    setBusy(false); setProgress(null);
  };

  const count = parseInput(raw).length;

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
