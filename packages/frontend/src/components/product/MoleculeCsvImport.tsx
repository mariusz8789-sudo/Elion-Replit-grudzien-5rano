/**
 * MoleculeFileImport (Genesis 2.1, Part 4 — pilot readiness) — ONE shared file-import
 * button, used identically by Compare and Campaigns. CSV is parsed client-side; SDF/MOL
 * is parsed server-side by the real RDKit worker (MolFromMolBlock — never a text/regex
 * hack). Either way the result becomes `Name = SMILES` lines — the exact format the
 * existing textarea pipeline already accepts. No parallel ingestion/analysis logic.
 */
import { useRef, useState } from 'react';
import { Icon } from '../Icon';
import { parseMoleculeCsv, entriesToLines, detectImportKind, type ImportedEntry } from '../../core/moleculeImport';
import { parseMoleculeFile } from '../../core/backend/client';
import { useI18n } from '../../core/i18n';

export function MoleculeCsvImport({ onImport, disabled }: { onImport: (lines: string) => void; disabled?: boolean }) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);
    const kind = detectImportKind(file.name);
    if (!kind) {
      setError(t('mci.formats'));
      return;
    }
    if (kind === 'csv') {
      const entries = parseMoleculeCsv(await file.text());
      if (!entries.length) { setError(t('mci.noRows')); return; }
      onImport(entriesToLines(entries));
      return;
    }
    setBusy(true);
    const r = await parseMoleculeFile(kind, await file.text());
    setBusy(false);
    if (!r.ok) { setError(r.message || t('mci.importFail', { kind: kind.toUpperCase() })); return; }
    const entries: ImportedEntry[] = r.data.molecules.map((m) => ({ name: m.name || m.smiles, smiles: m.smiles }));
    if (!entries.length) { setError(t('mci.noStructure')); return; }
    onImport(entriesToLines(entries));
    if (kind === 'sdf' && r.data.errors) setError(t('mci.partial', { parsed: r.data.parsed ?? 0, total: r.data.total ?? 0, errors: r.data.errors }));
  };

  return (
    <>
      <input
        ref={inputRef} type="file" accept=".csv,.mol,.sdf,.sd,text/csv" style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
      />
      <button type="button" className="ds-btn" disabled={disabled || busy} onClick={() => inputRef.current?.click()}>
        <Icon name="upload" size={14} /> {busy ? t('mci.importing') : t('mci.import')}
      </button>
      {error ? <span className="ds-dim" style={{ marginLeft: '0.5rem' }}>{error}</span> : null}
    </>
  );
}
