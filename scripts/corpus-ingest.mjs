#!/usr/bin/env node
/**
 * The minimal CLI wrapper `ingestQuery` never had.
 *
 *   npm run corpus:ingest -- --query "cellular senescence AND SASP" --max 200
 *   npm run corpus:ingest -- --query "..." --min-year 2000 --max-year 2015 --db packages/backend/data/corpus.db
 *
 * WHAT THIS DOES NOT DO. It does not invent a result if the network is
 * unreachable. `pubmed.mjs` carries its own warning: the parser is written
 * against the documented PubMed DTD and has never been exercised against a
 * live response. `verifyAgainstLive()` exists for exactly one reason — so the
 * first environment with real network access checks the parser BEFORE trusting
 * anything it produces. This script runs that check first and refuses to
 * ingest if it fails, because a corpus built on a parser that silently
 * misreads the live XML shape would be worse than no corpus: it would look
 * populated and be wrong.
 *
 * REPORTS, NOT JUST RUNS. Every number below is something the caller can
 * recheck independently: total the query matched, how many were fetched, how
 * many parsed vs were skipped, how long it took, and the exact failure if any
 * step failed. Nothing here is a summary written after the fact — it is the
 * return value of the functions themselves.
 */
import { PubMedClient, ingestQuery, verifyAgainstLive } from '../packages/backend/src/lookingGlass/pubmed.mjs';
import * as store from '../packages/backend/src/lookingGlass/store.mjs';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1];
}

const query = arg('query');
const dbPath = arg('db', ':memory:');
const maxArticles = Number(arg('max', '200'));
const minYear = arg('min-year') ? Number(arg('min-year')) : null;
const maxYear = arg('max-year') ? Number(arg('max-year')) : null;
const apiKey = process.env.NCBI_API_KEY ?? null;
const email = process.env.NCBI_EMAIL ?? null;

if (!query) {
  console.error('Usage: npm run corpus:ingest -- --query "<PubMed search term>" [--max N] [--min-year Y] [--max-year Y] [--db path]');
  process.exit(2);
}

const report = { step: 'starting', query, maxArticles, minYear, maxYear, dbPath: dbPath === ':memory:' ? '(in-memory, not persisted)' : dbPath };

console.log(`=== Step 1/2: verifyAgainstLive() — is the parser actually correct against real NCBI output? ===`);
const t0 = Date.now();
let verify;
try {
  verify = await verifyAgainstLive({ apiKey, email });
} catch (err) {
  report.step = 'verifyAgainstLive threw';
  report.error = String(err?.message ?? err);
  console.log(JSON.stringify(report, null, 2));
  console.error('\nCould not even attempt the live check. This is a NETWORK/ENVIRONMENT result, not a verdict on the code.');
  process.exit(2);
}
report.verifyAgainstLiveMs = Date.now() - t0;
report.verifyAgainstLive = verify;

for (const c of verify.checks) console.log(`  [${c.ok ? ' ok ' : 'FAIL'}] ${c.name} — ${c.detail}`);

if (!verify.ok) {
  report.step = 'refused: verifyAgainstLive failed';
  console.log('\n' + JSON.stringify(report, null, 2));
  console.error('\nCAPABILITY_GAP: refusing to ingest. The parser did not pass its own live check.');
  console.error('If the failure is "network reachable: false", this is an environment/connectivity');
  console.error('problem, not evidence the parser is wrong — rerun from a host with real internet access.');
  console.error('If a specific check failed (e.g. "MeSH UIs look like descriptors"), the parser');
  console.error('has drifted from the live PubMed XML shape and must be fixed before ingesting.');
  process.exit(1);
}
console.log('  -> parser confirmed against live NCBI output. Proceeding to ingest.\n');

console.log(`=== Step 2/2: ingestQuery("${query}") ===`);
const db = store.openCorpus(dbPath);
const client = new PubMedClient({ apiKey, email, tool: 'genesis-looking-glass' });
const t1 = Date.now();
let result;
try {
  result = await ingestQuery(db, client, store, {
    query, maxArticles, minYear, maxYear,
    onProgress: (p) => console.log(`  fetched ${p.retrieved}/${p.target} (of ${p.total} matching), ${p.skipped} unparseable so far`),
  });
} catch (err) {
  report.step = 'ingestQuery threw mid-run';
  report.error = String(err?.message ?? err);
  report.rateLimited = err?.rateLimited ?? false;
  console.log('\n' + JSON.stringify(report, null, 2));
  process.exit(1);
}
report.ingestMs = Date.now() - t1;
report.result = result;
report.step = 'complete';

const stats = store.corpusStats(db);
report.corpusAfterIngest = stats;

console.log('\n' + JSON.stringify(report, null, 2));
console.log(`\n${result.retrieved} articles ingested, ${result.skipped} skipped as unparseable, out of ${result.total} matching "${query}".`);
console.log(`Provenance: every row is source='pubmed' (see lg_articles.source) — the only value this schema permits to be shown as a real citation.`);
