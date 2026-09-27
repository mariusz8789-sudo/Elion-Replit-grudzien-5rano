/**
 * moleculeImport (Genesis 2.1, Part 4 — pilot readiness) — file-based molecule import for
 * Compare and Campaigns. Parses CSV/SDF/MOL text into the SAME `Name = SMILES` line format
 * the existing textarea pipeline already accepts (parseMoleculeLines in ComparePlatformScreen)
 * — so this is a pre-processor, not a parallel ingestion pipeline. Zero new analysis logic.
 */

export interface ImportedEntry { name: string; smiles: string }

/** RFC4180-ish CSV field splitter: handles quoted fields containing commas/quotes. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * Parses CSV text into molecule entries. Looks for `name`/`nazwa` and `smiles` header columns
 * (case-insensitive, any order); falls back to "first column = name, second = SMILES" when no
 * `smiles` header is found (so a headerless two-column CSV still imports).
 */
export function parseMoleculeCsv(text: string, max = 2000): ImportedEntry[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const smilesIdx = header.findIndex((h) => h === 'smiles');
  let nameIdx = header.findIndex((h) => h === 'name' || h === 'nazwa');
  let dataLines = lines.slice(1);
  let effectiveSmilesIdx = smilesIdx;
  if (smilesIdx === -1) {
    // No recognizable header: treat every line as data, column 0 = name, column 1 = SMILES.
    effectiveSmilesIdx = 1;
    nameIdx = 0;
    dataLines = lines;
  }
  const out: ImportedEntry[] = [];
  for (const line of dataLines) {
    const cols = splitCsvLine(line);
    const smiles = (cols[effectiveSmilesIdx] ?? '').trim();
    if (!smiles) continue;
    const name = (nameIdx >= 0 ? cols[nameIdx] : '')?.trim() || smiles;
    out.push({ name, smiles });
  }
  return out.slice(0, max);
}

/** Renders parsed entries back into the shared `Name = SMILES` textarea format. */
export function entriesToLines(entries: ImportedEntry[]): string {
  return entries.map((e) => `${e.name} = ${e.smiles}`).join('\n');
}

export type ImportKind = 'csv' | 'mol' | 'sdf';

/** Sniffs a file's import kind from its extension. Returns null for unsupported types. */
export function detectImportKind(filename: string): ImportKind | null {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  if (ext === 'csv') return 'csv';
  if (ext === 'mol') return 'mol';
  if (ext === 'sdf' || ext === 'sd') return 'sdf';
  return null;
}
