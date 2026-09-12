import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

/**
 * G3-style pinned fixture fetch for the SECOND external anchor (P2.3
 * follow-up): a real, independently-measured test of Kepler's third law,
 * using `core/modelGraph/orbitalGraph.ts::buildOrbitalModelGraph` — the same
 * model Universe Lab and the Reality Navigator already use, unchanged here.
 *
 * WHY SOLAR SYSTEM DATA, NOT THE NASA EXOPLANET ARCHIVE.
 *
 * The earlier attempt at this anchor (db98b1e, docs/RISKS.md R-005) targeted
 * exoplanetarchive.ipac.caltech.edu and was BLOCKED by this environment's
 * egress policy — confirmed again in this session (403 on every general
 * science-data host tested: NASA Exoplanet Archive, NIST, USGS, JPL SSD,
 * even Wikipedia; only package registries and Anthropic API hosts are
 * allowlisted). That block is real, but it is not why this fixture targets
 * Solar System data instead: GitHub Actions runners have no such
 * restriction (proven by the now-green `nist-g3-pinned-artifacts` job), so
 * the exoplanet archive WOULD be reachable from CI.
 *
 * The real reason is a genuine circularity risk this environment cannot
 * verify blind. For many NASA Exoplanet Archive entries — especially
 * transiting planets without direct astrometric distance — the published
 * semi-major axis (`pl_orbsmax`) is ITSELF derived from the measured
 * orbital period and stellar mass via Kepler's third law, the exact
 * formula this anchor's prediction would use. Predicting the period back
 * from that semi-major axis and comparing it to the archive's own period
 * would then be circular in the sense the mission's own rules forbid
 * ("do not use a quantity that was calculated from the same model as
 * independent evidence") — not a fabrication, but a values-must-match-by
 * construction identity dressed up as an empirical test. Verifying which
 * specific planet's archive entry avoids this would require inspecting
 * per-parameter provenance flags this environment cannot fetch to check.
 *
 * Solar System orbital elements avoid this ambiguity entirely, for a
 * textbook, historically documented reason: orbital PERIOD has been
 * measured by direct positional astronomy for millennia/centuries
 * (independent of distance), while semi-major axis/distance has been
 * measured by an entirely separate 20th-century technique — radar ranging
 * and spacecraft radiometric tracking (independent of timing). This is the
 * same two-independent-channel structure that historically let Kepler's
 * third law be discovered and tested in the first place, and it is
 * unambiguous rather than something this fixture has to hope is true of one
 * archive row it cannot inspect.
 *
 * This script only fetches and pins the raw payload — exactly like
 * `fetch-atom-bohr-nist-fixtures.mjs` — and verifies broad sanity markers.
 * It does NOT parse the specific numeric values used by the anchor; those
 * are read from the pinned artifact by `core/biotechData/externalAnchor.ts`
 * (`keplerSolarSystemAnchor`), written only after inspecting this fixture's
 * real, fetched content — the same discipline used for the NIST A4 guard.
 */

const OUT = process.env.GENESIS_KEPLER_FIXTURE_DIR ?? 'artifacts/kepler-solar-system';
const retrievedAt = new Date().toISOString();

const artifacts = [
  {
    id: 'B1-nasa-nssdc-planetary-factsheet',
    url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/',
    title: 'NASA NSSDCA Planetary Fact Sheet — all planets, metric units',
    dataset: 'NASA Goddard Space Flight Center, NSSDCA Planetary Fact Sheet',
    observable: 'Orbital period (days) and distance from Sun / semi-major axis (10^6 km) for Venus, Earth, Mars',
    unit: 'source-defined (days; 10^6 km)',
    uncertainty: 'source-defined in raw table',
    termsUrl: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
    file: 'B1-nssdc-planetary-factsheet.html',
    mustContain: ['Venus', 'Orbital Period'],
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
      console.log(`G3-kepler RETRY ${attempt}/2 ${response.status} ${url}`);
    } catch (error) {
      if (attempt === 3 || !String(error).match(/(?:502|503|504|429|fetch failed)/i)) throw error;
      console.log(`G3-kepler RETRY ${attempt}/2 transient network error for ${url}`);
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, attempt * 2000));
  }
  throw new Error(`unreachable download state for ${url}`);
}

await mkdir(OUT, { recursive: true });
const manifest = {
  schemaVersion: 'genesis.kepler-solar-system.fixture.v1',
  status: 'PINNED_CANDIDATE',
  retrievedAt,
  retrievalEnvironment: process.env.GITHUB_ACTIONS === 'true' ? 'github-actions-ubuntu-latest' : 'local',
  networkPolicy: 'download-once; replay must use committed raw payload and must not refetch',
  artifacts: [],
};

for (const item of artifacts) {
  console.log(`G3-kepler FETCH ${item.id} ${item.url}`);
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
  console.log(`G3-kepler SHA256 ${item.id} ${sha256}`);
  manifest.artifacts.push({ ...item, sha256, bytes: raw.byteLength, retrievedAt });
}

await writeFile(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`G3-kepler MANIFEST ${join(OUT, 'manifest.json')}`);
