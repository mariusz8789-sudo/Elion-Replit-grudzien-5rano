/**
 * Scientific Knowledge Loop — SOURCES. Read-only adapters that expose records which already exist in
 * the repository (sealed campaign artifacts and the decision log) as recall documents with a source
 * reference and the SHA-256 of the exact bytes read. They are not copied into any store.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAX_TEXT = 6000;
const sha256 = (data) => createHash('sha256').update(data).digest('hex');

function flatten(value, prefix = '', out = [], depth = 0) {
  if (out.join(' ').length > MAX_TEXT || depth > 6) return out;
  if (Array.isArray(value)) value.slice(0, 20).forEach((item, i) => flatten(item, `${prefix}[${i}]`, out, depth + 1));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out, depth + 1);
  else if (value !== null && value !== undefined) out.push(`${prefix}: ${String(value).slice(0, 200)}`);
  return out;
}

/** Sealed campaign artifacts (*.sealed.json): in-silico model measurements, hash of the file bytes as identity. */
export function sealedArtifactDocuments({ campaignDir = path.join(HERE, 'campaign') } = {}) {
  if (!existsSync(campaignDir)) return [];
  return readdirSync(campaignDir).filter((name) => name.endsWith('.sealed.json')).sort().flatMap((name) => {
    const bytes = readFileSync(path.join(campaignDir, name));
    let parsed;
    try { parsed = JSON.parse(bytes.toString('utf8')); } catch { return []; }
    return [{
      docId: `sealed:${name}`,
      kind: 'SEALED_ARTIFACT',
      ref: `repo:packages/backend/src/campaign/${name}`,
      sourceSha256: sha256(bytes),
      epistemicStatus: 'SIMULATED',
      title: parsed.decisionId ?? parsed.id ?? name,
      text: `${name.replace(/[-_.]/g, ' ')} ${flatten(parsed).join(' ; ')}`.slice(0, MAX_TEXT),
    }];
  });
}

/** The decision log, one document per `## D-nnn — title` entry. Prose is UNVERIFIED: it is not hash-chained. */
export function decisionLogDocuments({ decisionsPath = path.resolve(HERE, '../../../docs/DECISIONS.md') } = {}) {
  if (!existsSync(decisionsPath)) return [];
  const lines = readFileSync(decisionsPath, 'utf8').split('\n');
  const entries = [];
  let current = null;
  lines.forEach((line, index) => {
    const heading = /^## (D-\d+[a-z]?) — (.*)$/.exec(line);
    if (heading) {
      if (current) entries.push(current);
      current = { decisionId: heading[1], title: heading[2], line: index + 1, body: [] };
    } else if (current) current.body.push(line);
  });
  if (current) entries.push(current);
  return entries.map((entry) => {
    const body = entry.body.join('\n').slice(0, MAX_TEXT);
    return {
      docId: `decision:${entry.decisionId}`,
      kind: 'DECISION_LOG_ENTRY',
      ref: `repo:docs/DECISIONS.md#${entry.decisionId}`,
      sourceSha256: sha256(`${entry.title}\n${body}`),
      epistemicStatus: 'UNVERIFIED',
      title: `${entry.decisionId} — ${entry.title}`,
      line: entry.line,
      text: `${entry.title} ${entry.title} ${entry.title}\n${body}`,
    };
  });
}

export function loadKnowledgeSources(options = {}) {
  return [...sealedArtifactDocuments(options), ...decisionLogDocuments(options)];
}
