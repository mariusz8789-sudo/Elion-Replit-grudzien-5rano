/**
 * Load an NLM MeSH descriptor release into a Looking Glass corpus.
 *
 * This has to be run from a machine with egress to nlmpubs.nlm.nih.gov — the
 * development environment Looking Glass was built in cannot reach it, so neither
 * this script nor the loader beneath it has ever contacted the real server. Run
 * `--verify` first; it reads only the first chunk of each candidate URL and
 * reports whether the file still identifies itself the way the parser expects.
 *
 * Usage:
 *   node scripts/load-mesh-release.mjs --year 2015 --db data/looking-glass.db
 *   node scripts/load-mesh-release.mjs --year 2015 --file ./desc2015.xml --db …
 *   node scripts/load-mesh-release.mjs --year 2015 --verify
 *
 * The release is ~300 MB. `--file` exists because NLM also distributes over FTP,
 * and downloading by hand then loading from disk is a perfectly good answer when
 * the HTTPS mirror is unavailable.
 */
import { createReadStream } from 'node:fs';
import { openCorpus } from '../src/lookingGlass/store.mjs';
import {
  downloadRelease, loadReleaseFromStream, verifyAgainstLive, releaseSuitability, releaseUrls,
} from '../src/lookingGlass/descriptorRelease.mjs';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) { args[key] = true; } else { args[key] = next; i += 1; }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const year = Number(args.year);

if (!Number.isInteger(year)) {
  console.error('--year is required, e.g. --year 2015');
  process.exit(2);
}

if (args.verify) {
  const result = await verifyAgainstLive(year);
  for (const check of result.checked) {
    console.log(`${check.ok ? 'ok  ' : 'FAIL'}  ${check.url}\n      ${check.detail}`);
  }
  console.log(result.verified
    ? `\nThe ${year} release is reachable and self-identifies as expected. The loader may be trusted for this year.`
    : `\nThe ${year} release could not be verified. Do NOT describe a corpus loaded this way as historical.`);
  process.exit(result.verified ? 0 : 1);
}

if (!args.db) {
  console.error('--db is required, e.g. --db data/looking-glass.db');
  process.exit(2);
}

const db = openCorpus(String(args.db));
let last = 0;
const onProgress = ({ seen, loaded, skipped }) => {
  // A 300 MB load is long enough that silence reads as a hang.
  if (seen - last < 5000) return;
  last = seen;
  console.log(`  ${seen} records read, ${loaded} loaded, ${skipped} skipped`);
};

try {
  const release = args.file
    ? await loadReleaseFromStream(db, createReadStream(String(args.file)), {
      expectYear: year, url: `file://${args.file}`, onProgress,
    })
    : await downloadRelease(db, year, { onProgress });

  console.log(`\nLoaded MeSH ${release.year}: ${release.loaded} descriptors (${release.skipped} skipped) from ${release.url}`);
  console.log(`sha256 ${release.sha256}`);
  console.log('\nRecord that checksum alongside any published benchmark. Without it the run is not reproducible.');
} catch (err) {
  console.error(`\nLoad failed: ${err.message}`);
  console.error(`\nCandidate URLs for ${year}:\n  ${releaseUrls(year).join('\n  ')}`);
  console.error('\nThe corpus vocabulary is now marked incomplete and will refuse to certify a benchmark until a load succeeds.');
  process.exit(1);
}

const cutoff = args.cutoff ? Number(args.cutoff) : year;
console.log(`\nSuitability for a ${cutoff} cut-off: ${releaseSuitability(db, cutoff).statement}`);
