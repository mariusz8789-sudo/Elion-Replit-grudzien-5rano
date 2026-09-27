#!/usr/bin/env node
/**
 * Emit a paste-ready brief of every uncited claim edge.
 *
 *   npm run citations:brief > brief.md
 *
 * The worklist script is for someone working in the repo. This one is for
 * handing the job to someone — or something — outside it: a librarian, a
 * collaborator, a search assistant. It states, for each edge, the exact directed
 * claim that needs a source, and it states the rules that make an answer usable,
 * because the failure mode of asking a helper for citations is receiving
 * plausible ones.
 *
 * Offline. Reads the graph, formats it, contacts nothing.
 */
import { GRAPH_EDGES, auditCitations, getNode, UNCITED_CLAIM_EDGES } from '../packages/reasoning/src/knowledgeGraph.ts';
import { readFileSync } from 'node:fs';

const audit = auditCitations();
const label = (id) => getNode(id)?.label ?? id;

/** Edges already proposed in the staging file, so a helper is not asked twice. */
let staged = new Map();
try {
  const doc = JSON.parse(readFileSync(new URL('../citations/candidates.json', import.meta.url), 'utf8'));
  staged = new Map((doc.candidates ?? []).map((c) => [c.edge, c]));
} catch { /* no staging file yet — every edge is open */ }

const key = (e) => `${e.from}→${e.to}→${e.kind}`;
const open = audit.uncited.filter((e) => !staged.has(key(e)));
const proposed = audit.uncited.filter((e) => staged.has(key(e)));

console.log(`# Citation brief — Genesis mechanism graph

${audit.uncited.length} edges assert something about human biology with no source attached.
${proposed.length} already have a proposed citation awaiting verification; **${open.length} are open**.

## What I need for each edge

A primary paper that supports **the directed claim as written** — not a paper about
both endpoints, and not a review unless the edge is a summary of a field.

For each one, give me:

| field | rule |
|---|---|
| PMID | digits only, e.g. \`23746838\`. Not \`PMID:23746838\`, not a URL |
| DOI | bare, e.g. \`10.1016/j.cell.2013.05.039\`. Not \`doi:\`, not \`https://doi.org/\` |
| title + first author + year | so I can tell at a glance whether it is the right paper |
| one line on why it supports THIS claim | direction matters: A→B is not B→A |

**If you are not certain of an identifier, omit it and say so.** A DOI alone is
usable. A wrong PMID is worse than none: it looks checked. Every identifier is
machine-resolved against Europe PMC before it enters the graph
(\`npm run citations:verify\`), so a fabricated one will be caught — it will just
have wasted both our time.

---
`);

const sections = new Map();
for (const e of open) {
  if (!sections.has(e.kind)) sections.set(e.kind, []);
  sections.get(e.kind).push(e);
}

const intro = {
  mechanistic: 'A drives or opposes B mechanistically.',
  'oncogenic-coupling': 'An ageing mechanism is coupled to an oncogenic axis. These are the safety-critical claims — the ones asserting that a longevity intervention touches tumour biology.',
  measures: 'A biomarker reads out a mechanism. The claim is that the assay actually measures that mechanism, not that it correlates with age.',
};

for (const [kind, edges] of sections) {
  console.log(`\n## ${kind}  (${edges.length})\n\n${intro[kind] ?? ''}\n`);
  for (const e of edges) {
    console.log(`### ${label(e.from)} ──${e.effect}──▶ ${label(e.to)}\n`);
    console.log(`> ${e.mechanism}\n`);
    console.log(`\`${e.from}→${e.to}→${e.kind}\` · declared honesty: \`${e.honesty}\`\n`);
  }
}

if (proposed.length) {
  console.log(`\n---\n\n## Already proposed (do not re-search — verify instead)\n`);
  for (const e of proposed) {
    const c = staged.get(key(e));
    const id = c.citation.pmid ? `PMID ${c.citation.pmid}` : `DOI ${c.citation.doi}`;
    console.log(`- **${label(e.from)} → ${label(e.to)}** — ${c.citation.label}, ${id}${c.citation.pmid && c.citation.doi ? ` / ${c.citation.doi}` : ''}`);
    console.log(`  ${c.paper}`);
    if (c.noPmidBecause) console.log(`  _no PMID: ${c.noPmidBecause}_`);
    if (c.noDoiBecause) console.log(`  _no DOI: ${c.noDoiBecause}_`);
    if (c.curatorNote) console.log(`  ⚠ ${c.curatorNote}`);
  }
}

console.log(`\n---\n\nDebt pinned at ${UNCITED_CLAIM_EDGES} by \`packages/reasoning/src/__tests__/citations.test.ts\`.`);
console.log(`Total edges in graph: ${GRAPH_EDGES.length}. The other ${audit.exempt.length} record intent rather than findings and need no source.`);
