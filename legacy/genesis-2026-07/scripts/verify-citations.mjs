#!/usr/bin/env node
/**
 * Resolve every edge citation against the real literature.
 *
 *   npm run citations:verify          check the shipped graph
 *   npm run citations:verify -- --json  machine-readable report
 *
 * WHY THIS EXISTS. `validateCitation` in knowledgeGraph.ts checks that an
 * identifier is well-FORMED. Well-formed is not the same as real: "10.1038/
 * nature99999" passes every regex and points at nothing. The gap between those
 * two ideas is exactly where a curated knowledge base rots, because a wrong
 * identifier is invisible until a reader clicks it — by which time the claim has
 * been repeated in every answer the platform gave.
 *
 * So this script resolves each citation against Europe PMC and reports what came
 * back. It runs on a networked machine, NOT in CI: the development sandbox this
 * repository was built in cannot reach NCBI, EBI, Crossref or any publisher (the
 * egress proxy answers 403 to CONNECT), which is why the graph shipped uncited in
 * the first place. Making it a CI step would make the build depend on a third
 * party's uptime, so it stays a deliberate command someone runs.
 *
 * NO API KEY REQUIRED. Europe PMC's REST search is open, returns PMID and DOI in
 * one record, and is polite to unauthenticated callers. Requests are serialised
 * with a delay because the courteous thing to do with a free public service is
 * not to hammer it.
 *
 * EXIT CODES
 *   0  every citation resolved and matched
 *   1  at least one citation did not resolve, or resolved to a different paper
 *   2  the script could not reach Europe PMC at all (network, not data)
 */
import { GRAPH_EDGES, auditCitations, isClaimEdge } from '../packages/reasoning/src/knowledgeGraph.ts';

const ENDPOINT = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';
const DELAY_MS = 350;
const TIMEOUT_MS = 20_000;

const asJson = process.argv.includes('--json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * The surname out of a label like "von Zglinicki 2002" or "García-Prat 2016" —
 * everything before the trailing year. Compound and particled surnames are the
 * normal case in this field, so anything cleverer than "strip the year" would
 * break on d'Adda di Fagagna.
 */
function labelSurname(label) {
  const m = /^(.*?)\s+(?:19|20)\d{2}\s*$/.exec(String(label ?? '').trim());
  return m ? m[1].trim() : null;
}

/** Fold accents and case, so "Coppé" matches "Coppe JP" in a plain-ASCII author string. */
function normalise(s) {
  return String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/** Europe PMC query for one citation. An id search is exact; there is no fuzzy fallback on purpose. */
function queryFor({ pmid, doi }) {
  if (pmid) return `EXT_ID:${pmid} AND SRC:MED`;
  if (doi) return `DOI:"${doi}"`;
  return null;
}

async function resolve(citation) {
  const query = queryFor(citation);
  if (!query) return { status: 'NO_IDENTIFIER' };

  const url = `${ENDPOINT}?query=${encodeURIComponent(query)}&format=json&pageSize=2`;
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: 'application/json' } });
  } catch (err) {
    // A network failure is NOT evidence about the citation. Say so, and let the
    // caller exit 2 rather than reporting a good citation as bad.
    return { status: 'UNREACHABLE', detail: String(err?.message ?? err).slice(0, 120) };
  }
  if (!res.ok) return { status: 'UNREACHABLE', detail: `HTTP ${res.status}` };

  const body = await res.json();
  const hits = body?.resultList?.result ?? [];
  if (hits.length === 0) return { status: 'NOT_FOUND' };

  const hit = hits[0];
  const found = { pmid: hit.pmid ?? null, doi: (hit.doi ?? null)?.toLowerCase() ?? null, title: hit.title ?? '', year: hit.pubYear ?? '', authors: hit.authorString ?? '' };

  // If the citation carries both identifiers, they must agree with each other.
  // A PMID and a DOI that resolve to different papers is the most dangerous
  // shape of all: whichever one the reader follows, the other is a lie.
  const mismatch = [];
  if (citation.pmid && found.pmid && citation.pmid !== found.pmid) mismatch.push(`PMID ${citation.pmid} → record says ${found.pmid}`);
  if (citation.doi && found.doi && citation.doi.toLowerCase() !== found.doi) mismatch.push(`DOI ${citation.doi} → record says ${found.doi}`);

  // AND THE AUTHOR MUST MATCH. An identifier that resolves proves only that
  // SOMETHING is there; it does not prove the something is what the label says.
  //
  // This check exists because a verification pass returned "OK" for three
  // identifiers whose titles belonged to entirely different papers — it had
  // confirmed the numbers resolve and never compared them to the labels. The
  // label is the only part a human scans, so it is the part worth checking
  // hardest.
  const surname = labelSurname(citation.label);
  if (surname && found.authors && !normalise(found.authors).includes(normalise(surname))) {
    mismatch.push(`label says "${citation.label}" but the record's authors are: ${found.authors.slice(0, 90)}`);
  }

  return { status: mismatch.length ? 'MISMATCH' : 'OK', found, mismatch };
}

const audit = auditCitations();
const jobs = [];

if (process.argv.includes('--candidates')) {
  // Verify the staging file instead of the graph. Candidates are proposals that
  // nobody has resolved yet — checking them BEFORE they reach the graph is the
  // entire reason the staging file exists.
  const { readFileSync } = await import('node:fs');
  const file = new URL('../citations/candidates.json', import.meta.url);
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  for (const c of doc.candidates ?? []) {
    const [from, to, kind] = c.edge.split('→');
    jobs.push({ edge: { from, to, kind }, citation: c.citation });
  }
  console.log(`Verifying ${jobs.length} CANDIDATE citations from citations/candidates.json.`);
  console.log('These are not in the graph. Resolving them proves the paper exists — never that it supports the claim.\n');
} else {
  for (const edge of GRAPH_EDGES) {
    if (!isClaimEdge(edge)) continue;
    for (const citation of edge.citations) jobs.push({ edge, citation });
  }
}

if (jobs.length === 0) {
  const msg = `No citations to verify. ${audit.uncited.length} claim edges are uncited — run npm run citations:worklist to see them.`;
  console.log(asJson ? JSON.stringify({ checked: 0, uncited: audit.uncited.length, results: [] }, null, 2) : msg);
  process.exit(0);
}

const results = [];
let unreachable = 0;
for (const [i, { edge, citation }] of jobs.entries()) {
  const outcome = await resolve(citation);
  if (outcome.status === 'UNREACHABLE') unreachable++;
  results.push({ edge: `${edge.from} → ${edge.to}`, kind: edge.kind, citation, ...outcome });
  if (!asJson) {
    const mark = { OK: '  ok  ', MISMATCH: ' MISM ', NOT_FOUND: 'NOFIND', NO_IDENTIFIER: ' NOID ', UNREACHABLE: ' NET  ' }[outcome.status];
    const id = citation.pmid ? `PMID ${citation.pmid}` : `DOI ${citation.doi}`;
    console.log(`[${mark}] ${edge.from} → ${edge.to}  (${id})`);
    for (const m of outcome.mismatch ?? []) console.log(`          ${m}`);
    if (outcome.status === 'OK') console.log(`          ${outcome.found.authors.split(',')[0]} ${outcome.found.year} — ${outcome.found.title.slice(0, 78)}`);
    if (outcome.detail) console.log(`          ${outcome.detail}`);
  }
  if (i < jobs.length - 1) await sleep(DELAY_MS);
}

const bad = results.filter((r) => r.status === 'MISMATCH' || r.status === 'NOT_FOUND' || r.status === 'NO_IDENTIFIER');

if (asJson) {
  console.log(JSON.stringify({ checked: results.length, uncited: audit.uncited.length, failed: bad.length, unreachable, results }, null, 2));
} else {
  console.log(`\n${results.length} citations checked · ${bad.length} failed · ${audit.uncited.length} claim edges still uncited`);
  if (unreachable) console.log(`${unreachable} could not be checked — Europe PMC was unreachable. That is a network result, not a verdict on the citation.`);
  if (bad.length) console.log('\nA citation that does not resolve is worse than no citation: it looks checked.');
}

// Unreachable is exit 2 and never exit 1 — the distinction between "this claim is
// wrong" and "I could not find out" is the entire discipline this platform sells.
if (unreachable === results.length && results.length > 0) process.exit(2);
process.exit(bad.length > 0 ? 1 : 0);
