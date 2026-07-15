/* global AbortController, setTimeout, clearTimeout */
/**
 * Campaign #001 preflight (external execution package). Checks the runtime dependencies and
 * genuine network reachability of every required scientific source, with per-source diagnostics.
 * Exit 0 only if all MANDATORY sources (ChEMBL, PubChem, UniProt) are reachable AND RDKit +
 * ADMET-AI are runnable. Exit 2 otherwise (the one-command runner aborts — fail closed).
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PY = process.env.GENESIS_PYTHON ?? 'python3';
const CHECKS = [
  { service: 'UNIPROT', mandatory: true, url: 'https://rest.uniprot.org/uniprotkb/search?query=gene:BRAF+AND+organism_id:9606+AND+reviewed:true&format=json&size=1' },
  { service: 'CHEMBL', mandatory: true, url: 'https://www.ebi.ac.uk/chembl/api/data/target/search.json?q=BRAF&limit=1' },
  { service: 'PUBCHEM', mandatory: true, url: 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/vemurafenib/property/InChIKey/JSON' },
  { service: 'EUROPE_PMC', mandatory: false, url: 'https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=BRAF&format=json&pageSize=1' },
  { service: 'RCSB_PDB', mandatory: false, url: 'https://data.rcsb.org/rest/v1/core/entry/3OG7' },
];

function classify(status, err) {
  if (status && status >= 200 && status < 300) return 'OK';
  if (status === 403 || /CONNECT tunnel failed|403/.test(err ?? '')) return 'BLOCKED_BY_POLICY_OR_PROXY';
  if (/ENOTFOUND|EAI_AGAIN|dns/i.test(err ?? '')) return 'DNS_FAILURE';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'SERVER_ERROR';
  if (/aborted|timeout/i.test(err ?? '')) return 'TIMEOUT';
  return status ? `HTTP_${status}` : `NETWORK_ERROR:${(err ?? 'unknown').slice(0, 60)}`;
}

async function probe(url) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 15000);
  try { const r = await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json' } }); clearTimeout(to); return { status: r.status }; }
  catch (e) { clearTimeout(to); return { error: String(e?.message ?? e) }; }
}

function checkDep(name, cmd, args) {
  try { const out = execFileSync(cmd, args, { encoding: 'utf8', timeout: 40000, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); return { name, ok: true, detail: out.slice(0, 80) }; }
  catch (e) { return { name, ok: false, detail: String(e?.message ?? e).slice(0, 80) }; }
}

async function main() {
  console.log('=== Campaign #001 PREFLIGHT ===');
  const deps = [
    checkDep('node', 'node', ['--version']),
    checkDep('python3', PY, ['--version']),
    checkDep('rdkit', PY, ['-c', 'import importlib.util,sys; sys.exit(0 if importlib.util.find_spec("rdkit") else 1); ']),
    checkDep('admet_ai', PY, ['-c', 'import importlib.util,sys; sys.exit(0 if importlib.util.find_spec("admet_ai") else 1)']),
  ];
  for (const d of deps) console.log(`  dep ${d.name.padEnd(10)} ${d.ok ? 'OK' : 'MISSING'}  ${d.detail}`);

  const results = [];
  for (const c of CHECKS) {
    const r = await probe(c.url);
    const cls = classify(r.status, r.error);
    results.push({ ...c, status: r.status ?? null, class: cls });
    console.log(`  net ${c.service.padEnd(11)} ${cls}${c.mandatory ? ' (mandatory)' : ''}  ${c.url.slice(0, 48)}…`);
  }

  const depOk = deps.filter((d) => ['node', 'python3', 'rdkit', 'admet_ai'].includes(d.name)).every((d) => d.ok);
  const mandatoryNet = results.filter((r) => r.mandatory);
  const netOk = mandatoryNet.every((r) => r.class === 'OK');
  console.log('---');
  if (!depOk) console.log('DEPENDENCY GAP: install Node 22+, python3, rdkit, admet-ai (see OPERATOR_RUN.md).');
  if (!netOk) console.log(`NETWORK GAP: mandatory source(s) unreachable: ${mandatoryNet.filter((r) => r.class !== 'OK').map((r) => `${r.service}=${r.class}`).join(', ')}`);
  const ok = depOk && netOk;
  console.log(`PREFLIGHT: ${ok ? 'PASS — ready to acquire + execute' : 'FAIL — fix the gaps above before running Campaign #001 (fail closed)'}`);
  void __dirname;
  process.exit(ok ? 0 : 2);
}
main();
