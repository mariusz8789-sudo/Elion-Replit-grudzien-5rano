import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';

const OUT = process.env.GENESIS_NIST_FIXTURE_DIR ?? 'artifacts/atom-bohr-nist';
const retrievedAt = new Date().toISOString();

const artifacts = [
  {
    id: 'A1-codata-fundamental-constants',
    url: 'https://physics.nist.gov/cuu/Constants/Table/allascii.txt',
    title: 'Fundamental Physical Constants — Complete Listing',
    dataset: 'CODATA 2022 adjustment',
    observable: 'Rydberg constant and electron/proton mass ratio for atom-bohr provenance',
    unit: 'source-defined SI/eV/Ry units',
    uncertainty: 'source-defined in raw table',
    termsUrl: 'https://www.nist.gov/open/copyright-fair-use-and-licensing-statements-srd-data-software-and-technical-series-publications',
    file: 'A1-codata-allascii.txt',
    mustContain: ['CODATA', 'Rydberg constant'],
  },
  {
    id: 'A2-asd-hydrogen-vacuum-lines',
    url: 'https://physics.nist.gov/cgi-bin/ASD/lines1.pl?spectra=H+I&output_type=0&low_w=650&upp_w=660&unit=1&de=0&plot_out=0&I_scale_type=1&format=1&line_out=0&en_unit=0&output=0&bibrefs=1&page_size=15&show_obs_wl=1&show_calc_wl=1&unc_out=1&order_out=0&max_low_enrg=&show_av=3&max_upp_enrg=&tsb_value=0&min_str=&A_out=0&intens_out=on&max_str=&allowed_out=1&forbid_out=1&min_accur=&min_intens=&conf_out=on&term_out=on&enrg_out=on&J_out=on',
    title: 'NIST Atomic Spectra Database — H I lines, vacuum wavelength',
    dataset: 'NIST ASD SRD 78, version 5.12 (source-reported)',
    observable: 'Hydrogen I transition wavelength in the 650–660 nm interval, vacuum mode',
    unit: 'nm in query; source output retained verbatim',
    uncertainty: 'ASD uncertainty column retained verbatim when present',
    termsUrl: 'https://www.nist.gov/open/copyright-fair-use-and-licensing-statements-srd-data-software-and-technical-series-publications',
    file: 'A2-asd-hydrogen-vacuum-lines.txt',
    mustContain: ['H I'],
  },
  {
    id: 'A3-hydrogen-ionization-energy',
    url: 'https://webbook.nist.gov/cgi/cbook.cgi?ID=C1333740&Mask=65',
    title: 'NIST Chemistry WebBook — Hydrogen atom ionization energy',
    dataset: 'NIST Chemistry WebBook page, source/evaluation metadata retained',
    observable: 'Hydrogen atomic ionization energy',
    unit: 'eV as reported by source',
    uncertainty: 'source-reported when present; no value inferred',
    termsUrl: 'https://www.nist.gov/open/copyright-fair-use-and-licensing-statements-srd-data-software-and-technical-series-publications',
    file: 'A3-hydrogen-ionization-energy.html',
    mustContain: ['Ionization Energy'],
  },
  {
    id: 'A4-nist-srd-terms',
    url: 'https://www.nist.gov/open/copyright-fair-use-and-licensing-statements-srd-data-software-and-technical-series-publications',
    title: 'NIST Copyright, Fair Use, and Licensing Statements for SRD, Data, Software and Technical Series Publications',
    dataset: 'NIST official terms page',
    observable: 'Terms/provenance policy, not a scientific observable',
    unit: 'not applicable',
    uncertainty: 'not applicable',
    termsUrl: 'https://www.nist.gov/open/copyright-fair-use-and-licensing-statements-srd-data-software-and-technical-series-publications',
    file: 'A4-nist-srd-terms.html',
    mustContain: ['Standard Reference Data'],
  },
];

async function download(url) {
  const response = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Genesis-G3-pinned-fixture/1.0' } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

await mkdir(OUT, { recursive: true });
const manifest = {
  schemaVersion: 'genesis.atom-bohr.nist-fixture.v1',
  status: 'PINNED_CANDIDATE',
  retrievedAt,
  retrievalEnvironment: process.env.GITHUB_ACTIONS === 'true' ? 'github-actions-ubuntu-latest' : 'local',
  networkPolicy: 'download-once; replay must use committed raw payload and must not refetch',
  artifacts: [],
};

for (const item of artifacts) {
  console.log(`G3 FETCH ${item.id} ${item.url}`);
  const raw = await download(item.url);
  const text = raw.toString('utf8');
  for (const marker of item.mustContain) {
    if (!text.includes(marker)) throw new Error(`${item.id}: payload missing required marker ${marker}`);
  }
  const sha256 = createHash('sha256').update(raw).digest('hex');
  const target = join(OUT, item.file);
  await writeFile(target, raw);
  console.log(`G3 SHA256 ${item.id} ${sha256}`);
  manifest.artifacts.push({ ...item, sha256, bytes: raw.byteLength, retrievedAt });
}

await writeFile(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`G3 MANIFEST ${join(OUT, 'manifest.json')}`);
