/**
 * B1 (ULEZ->NO2 adjudication) — Phase 0 RECON, run on a GitHub Actions
 * runner (ordinary internet access; the local sandbox's egress to
 * uk-air.defra.gov.uk is confirmed blocked — same 403 CONNECT pattern as
 * zenodo.org/nist.gov/CMS Open Data before it).
 *
 * Round 2: the flat_files index pages (round 1) revealed the exact, stable
 * download URL pattern DEFRA actually serves:
 *   https://uk-air.defra.gov.uk/datastore/data_files/site_data/<CODE>_<YEAR>.csv?v=1
 * This round HEADs the exact files the real freeze plan needs (byte sizes,
 * for sharding), and GETs one sample file's first lines (to learn the real
 * column layout before writing a parser against it) — still freezing
 * nothing.
 */

const SITES = ['MY1', 'MAN3', 'LED6', 'SHBR'];
const YEARS = [2022, 2023, 2024];

async function headSize(url) {
  const res = await fetch(url, { method: 'HEAD' });
  return { status: res.status, length: res.headers.get('content-length') };
}

console.log('=== B1-RECON2 SIZES BEGIN ===');
let totalBytes = 0;
for (const site of SITES) {
  for (const year of YEARS) {
    const url = `https://uk-air.defra.gov.uk/datastore/data_files/site_data/${site}_${year}.csv?v=1`;
    try {
      const { status, length } = await headSize(url);
      console.log(`B1-RECON2 SIZE ${site} ${year} status=${status} bytes=${length ?? 'unknown'}`);
      if (length) totalBytes += Number(length);
    } catch (error) {
      console.log(`B1-RECON2 SIZE-ERROR ${site} ${year} ${String(error)}`);
    }
  }
}
console.log(`B1-RECON2 TOTAL-BYTES-ESTIMATE ${totalBytes}`);
console.log('=== B1-RECON2 SIZES END ===');

console.log('\n=== B1-RECON2 SAMPLE BEGIN (MY1 2023 header + first 15 lines) ===');
try {
  const res = await fetch('https://uk-air.defra.gov.uk/datastore/data_files/site_data/MY1_2023.csv?v=1');
  const text = await res.text();
  const lines = text.split(/\r?\n/).slice(0, 15);
  for (const line of lines) console.log(`B1-RECON2 SAMPLE-LINE ${line}`);
  console.log(`B1-RECON2 SAMPLE-TOTAL-LINES ${text.split(/\r?\n/).length}`);
} catch (error) {
  console.log(`B1-RECON2 SAMPLE-ERROR ${String(error)}`);
}
console.log('=== B1-RECON2 SAMPLE END ===');
