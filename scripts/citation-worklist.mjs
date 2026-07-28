#!/usr/bin/env node
/**
 * Print the uncited claim edges, as a worklist someone can actually work through.
 *
 *   npm run citations:worklist
 *   npm run citations:worklist -- --search    include a ready PubMed query per edge
 *
 * The debt is a number in one place (UNCITED_CLAIM_EDGES) so a test can pin it.
 * A number is not a task list, so this turns it back into one: which edge, what
 * it currently asserts, which file to edit, and — with --search — a query to
 * paste into PubMed.
 *
 * Offline by design. It reads the graph and formats it; it contacts nothing.
 */
import { GRAPH_EDGES, auditCitations, getNode, UNCITED_CLAIM_EDGES } from '../packages/reasoning/src/knowledgeGraph.ts';

const withSearch = process.argv.includes('--search');
const audit = auditCitations();

/** Where the author edits this edge. Mechanistic edges are declared elsewhere. */
const fileFor = (kind) => (kind === 'mechanistic'
  ? 'packages/reasoning/src/hallmarks.ts  (MECHANISTIC_EDGES)'
  : `packages/reasoning/src/knowledgeGraph.ts  (${kind === 'measures' ? 'BIOMARKER_EDGES_SOURCE' : 'ONCOGENIC_EDGES_SOURCE'})`);

const label = (id) => getNode(id)?.label ?? id;

console.log(`Uncited claim edges: ${audit.uncited.length}  (pinned at ${UNCITED_CLAIM_EDGES} by __tests__/citations.test.ts)`);
console.log(`Cited: ${audit.cited.length}   Exempt (targets, record intent not findings): ${audit.exempt.length}   Total edges: ${GRAPH_EDGES.length}\n`);

const byKind = new Map();
for (const e of audit.uncited) {
  if (!byKind.has(e.kind)) byKind.set(e.kind, []);
  byKind.get(e.kind).push(e);
}

for (const [kind, edges] of byKind) {
  console.log(`\n${'='.repeat(76)}\n${kind.toUpperCase()}  (${edges.length})  —  edit ${fileFor(kind)}\n${'='.repeat(76)}`);
  for (const e of edges) {
    console.log(`\n  ${label(e.from)}  ──${e.effect}──▶  ${label(e.to)}`);
    console.log(`    asserts: ${e.mechanism}`);
    console.log(`    honesty: ${e.honesty}   (says what KIND of claim this is — NOT that anyone verified it)`);
    if (withSearch) {
      // A starting point, not an answer. The curator judges whether a hit
      // actually supports THIS directed claim; a paper about both endpoints is
      // not automatically evidence that one drives the other.
      const terms = `${label(e.from)} ${label(e.to)}`.replace(/\s+/g, ' ').trim();
      console.log(`    pubmed:  https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(terms)}`);
    }
  }
}

console.log(`\n${'-'.repeat(76)}`);
console.log('To cite one:  add  citations: [{ pmid: \'…\', label: \'Author Year\' }]  to the edge,');
console.log('then lower UNCITED_CLAIM_EDGES in knowledgeGraph.ts by the number you fixed.');
console.log('Verify what you added actually resolves:  npm run citations:verify');
