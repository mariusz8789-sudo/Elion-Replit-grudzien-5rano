/**
 * B1 (ULEZ->NO2 adjudication) — Phase 3 freeze: fetches ONE DEFRA AURN
 * site-year's real hourly CSV and extracts ONLY the columns this
 * experiment's preregistration actually uses (Date, time, Nitrogen dioxide
 * + its status flag, Sulphur dioxide + its status flag).
 *
 * WHY EXTRACTION, NOT THE VERBATIM RAW FILE (unlike every prior anchor in
 * this repo — Kepler/NIST/CMS/QE4 all pin the byte-identical original).
 * DEFRA's own site-data CSV is "all pollutants measured at this site" in
 * wide format — for a site like MY1 (Marylebone Road) that includes dozens
 * of VOC species nobody in this experiment ever reads, at roughly 800-900
 * bytes/row x 8766 hourly rows/year =~ 7-8MB per site-year. Printing that
 * whole file into a single GitHub Actions job log would hit the SAME
 * silent-truncation ceiling `docs/DECISIONS.md` D-023 already found for CMS
 * Zmumu.csv (~630KB/job) may times over -- infeasible without dozens of
 * shards per site-year. Extracting only NO2/SO2 (this analysis' primary and
 * negative-control pollutants) brings one site-year down to ~350KB, small
 * enough to freeze in ONE job log with no sharding.
 *
 * This is a disclosed, deterministic, TESTED reduction, not a silent one:
 * the per-site-year `<SITE>_<YEAR>.meta.json` records the ORIGINAL full
 * CSV's own SHA-256 (computed at fetch time, from the complete
 * un-truncated response body) alongside the extracted narrow file's
 * SHA-256, and the ongoing CI verify job re-fetches the full file, re-runs
 * the IDENTICAL extraction function, and compares the extracted result to
 * the committed copy -- catching drift in the columns this experiment
 * actually reads, exactly as the byte-identical comparisons do for the
 * other anchors' full files.
 *
 * Usage: SITE=<code> YEAR=<year> node scripts/fetch-b1-defra-aurn-fixture.mjs
 * Writes `<SITE>_<YEAR>.csv` (narrow extraction) and `<SITE>_<YEAR>.meta.json`
 * (hashes/provenance) under $GENESIS_B1_FIXTURE_DIR (default
 * artifacts/b1-defra-aurn/<SITE>_<YEAR>) and prints one short summary line —
 * NOT the full CSV, because GitHub's job-log read-back API silently caps
 * returned content under one site-year's row count (discovered empirically),
 * which would corrupt the frozen data. The written files travel back via
 * actions/upload-artifact, like every other pinned fixture in this repo.
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Quote-aware CSV line split (handles a compound VOC name like
 * `"1,2,3-trimethylbenzene"` that contains a LITERAL comma inside quotes —
 * DEFRA's own header row has several of these later in the pollutant list,
 * and a naive `line.split(',')` would silently shift every column index
 * after the first one). Good enough for this file's shape: no escaped
 * quotes inside a quoted field appear in DEFRA's AURN exports.
 */
function splitCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (const char of line) {
    if (char === '"') { inQuotes = !inQuotes; continue; }
    if (char === ',' && !inQuotes) { cells.push(current); current = ''; continue; }
    current += char;
  }
  cells.push(current);
  return cells;
}

/**
 * Parses DEFRA's wide site-data CSV format (see recon-b1-defra-aurn.mjs's
 * own sample output): 3 metadata lines, a blank-ish site-name line, then a
 * header row of repeating (pollutant name, "status", "unit") triplets
 * starting at column index 2 (columns 0-1 are Date, time), then a blank
 * separator line, then data rows.
 *
 * Returns rows of {date, time, no2, no2Status, so2, so2Status} — `null` for
 * a pollutant this site-year does not report (never fabricated as 0/absent).
 */
export function extractNo2So2(rawCsv) {
  const lines = rawCsv.split(/\r?\n/);
  const headerLineIndex = lines.findIndex((line) => line.startsWith('Date,time,'));
  if (headerLineIndex === -1) throw new Error('fetch-b1-defra-aurn-fixture: could not find the header row ("Date,time,...") in the fetched CSV.');
  const header = splitCsvLine(lines[headerLineIndex]);

  const findPollutantValueColumn = (label) => {
    const index = header.findIndex((cell) => cell.trim() === label);
    return index === -1 ? null : index;
  };
  const no2Col = findPollutantValueColumn('Nitrogen dioxide');
  const so2Col = findPollutantValueColumn('Sulphur dioxide');

  const dataLines = lines.slice(headerLineIndex + 2).filter((line) => line.trim().length > 0 && line.includes(','));
  const rows = dataLines.map((line) => {
    const cells = splitCsvLine(line);
    const date = cells[0];
    const time = cells[1];
    const no2 = no2Col === null ? null : cells[no2Col];
    const no2Status = no2Col === null ? null : cells[no2Col + 1];
    const so2 = so2Col === null ? null : cells[so2Col];
    const so2Status = so2Col === null ? null : cells[so2Col + 1];
    return { date, time, no2, no2Status, so2, so2Status };
  });
  return { rows, hasNo2: no2Col !== null, hasSo2: so2Col !== null };
}

export function rowsToNarrowCsv(rows) {
  const header = 'date,time,no2,no2Status,so2,so2Status';
  const body = rows.map((r) => [r.date, r.time, r.no2 ?? '', r.no2Status ?? '', r.so2 ?? '', r.so2Status ?? ''].join(','));
  return [header, ...body].join('\n');
}

async function main() {
  const SITE = process.env.SITE;
  const YEAR = process.env.YEAR;
  if (!SITE || !YEAR) {
    console.error('SITE and YEAR environment variables are required.');
    process.exit(1);
  }
  const url = `https://uk-air.defra.gov.uk/datastore/data_files/site_data/${SITE}_${YEAR}.csv?v=1`;

  const res = await fetch(url);
  if (res.status !== 200) {
    console.error(`FETCH-ERROR ${SITE} ${YEAR} status=${res.status}`);
    process.exit(1);
  }
  const rawCsv = await res.text();
  const originalSha256 = sha256(rawCsv);
  const { rows, hasNo2, hasSo2 } = extractNo2So2(rawCsv);
  const narrowCsv = rowsToNarrowCsv(rows);
  const narrowSha256 = sha256(narrowCsv);

  // The full narrow CSV (~300-400KB) is written to disk and uploaded as a
  // build artifact rather than dumped to the job log: GitHub's job-log
  // read-back API silently caps returned content well under one site-year's
  // worth of rows (discovered empirically -- a Kepler/CMS-style stdout dump
  // got truncated to its last ~5000 lines), which would corrupt exactly the
  // data this experiment depends on. Only small, fully-reliable summary
  // lines go to stdout; the real payload travels through the artifact
  // upload path every other pinned fixture in this repo already uses.
  const outDir = process.env.GENESIS_B1_FIXTURE_DIR ?? `artifacts/b1-defra-aurn/${SITE}_${YEAR}`;
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, `${SITE}_${YEAR}.csv`), narrowCsv, 'utf8');
  await writeFile(
    join(outDir, `${SITE}_${YEAR}.meta.json`),
    JSON.stringify(
      {
        site: SITE,
        year: Number(YEAR),
        url,
        originalSha256,
        originalBytes: Buffer.byteLength(rawCsv, 'utf8'),
        hasNo2,
        hasSo2,
        rowCount: rows.length,
        narrowSha256,
        narrowBytes: Buffer.byteLength(narrowCsv, 'utf8'),
        retrievedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    'utf8',
  );

  console.log(`B1-FETCH SUMMARY ${SITE}_${YEAR} url=${url} originalSha256=${originalSha256} narrowSha256=${narrowSha256} rowCount=${rows.length} hasNo2=${hasNo2} hasSo2=${hasSo2}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
