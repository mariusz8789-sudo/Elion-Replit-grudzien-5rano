import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

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
    mustContain: ['Fundamental Physical Constants', '2022 CODATA adjustment'],
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
    id: 'A3-asd-hydrogen-energy-levels',
    url: 'https://physics.nist.gov/cgi-bin/ASD/energy1.pl?de=0&spectrum=H+I&units=1&format=1&output=0&page_size=15&multiplet_ordered=0&conf_out=on&term_out=on&level_out=on&unc_out=1&j_out=on&lande_out=on&perc_out=on&biblio=on&temp=',
    title: 'NIST Atomic Spectra Database — H I energy levels',
    dataset: 'NIST ASD SRD 78, version 5.12 (source-reported)',
    observable: 'Hydrogen I evaluated energy levels in the ASD query; ionization-limit semantics must remain explicit',
    unit: 'eV in query; source output retained verbatim',
    uncertainty: 'ASD uncertainty column retained verbatim when present',
    termsUrl: 'https://www.nist.gov/open/copyright-fair-use-and-licensing-statements-srd-data-software-and-technical-series-publications',
    file: 'A3-asd-hydrogen-energy-levels.txt',
    mustContain: ['H I'],
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
  const transient = new Set([429, 500, 502, 503, 504]);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Genesis-G3-pinned-fixture/1.0' } });
      if (response.ok) return new Uint8Array(await response.arrayBuffer());
      if (!transient.has(response.status) || attempt === 3) {
        throw new Error(`${response.status} ${response.statusText} for ${url}`);
      }
      console.log(`G3 RETRY ${attempt}/2 ${response.status} ${url}`);
    } catch (error) {
      if (attempt === 3 || !String(error).match(/(?:502|503|504|429|fetch failed)/i)) throw error;
      console.log(`G3 RETRY ${attempt}/2 transient network error for ${url}`);
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, attempt * 2000));
  }
  throw new Error(`unreachable download state for ${url}`);
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
  const text = new globalThis.TextDecoder('utf-8', { fatal: false }).decode(raw);
  for (const marker of item.mustContain) {
    if (!text.includes(marker)) {
      const preview = text.slice(0, 240).replace(/\s+/g, ' ');
      throw new Error(`${item.id}: payload missing required marker ${marker}; bytes=${raw.byteLength}; preview=${preview}`);
    }
  }
  const sha256 = createHash('sha256').update(raw).digest('hex');
  const target = join(OUT, item.file);
  await writeFile(target, raw);
  console.log(`G3 SHA256 ${item.id} ${sha256}`);
  manifest.artifacts.push({ ...item, sha256, bytes: raw.byteLength, retrievedAt });
}

await writeFile(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`G3 MANIFEST ${join(OUT, 'manifest.json')}`);
