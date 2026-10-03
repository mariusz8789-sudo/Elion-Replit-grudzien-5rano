/**
 * Scientific Knowledge Loop — RECALL. A derived, in-memory index over documents that already exist
 * in canonical state (BYT projection rows, knowledge registry rows, sealed campaign artifacts,
 * decision log entries). Nothing is persisted and no model is called: deleting this module loses no
 * scientific state. Ranking is BM25 over stemmed words blended with cosine similarity of hashed
 * character-trigram vectors, so "kandydata" finds "kandydat" and "agonist" finds "agonism".
 * It is NOT a learned embedding and is labelled as such.
 */
import { fnv1a } from './determinism.mjs';

export const RECALL_MODE = 'LEXICAL_HASHED_VECTOR_NO_LEARNED_EMBEDDINGS';
const VECTOR_DIMS = 512;
const STOPWORDS = new Set(['the', 'a', 'an', 'of', 'and', 'or', 'to', 'in', 'is', 'are', 'was', 'for', 'on', 'we', 'what', 'why', 'do', 'does', 'have',
  'co', 'juz', 'nie', 'jest', 'sa', 'dlaczego', 'i', 'w', 'na', 'z', 'do', 'to', 'sie', 'o', 'jak', 'czy', 'jeszcze', 'mamy', 'wiemy', 'ma']);

export function normalizeText(text) {
  return String(text ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, ' ').trim();
}

const stem = (token) => (token.length > 6 ? token.slice(0, 6) : token);

export function tokenize(text) {
  return normalizeText(text).split(' ').filter((t) => t.length > 1 && !STOPWORDS.has(t)).map(stem);
}

function hashedVector(tokens) {
  const vector = new Float64Array(VECTOR_DIMS);
  for (const token of tokens) {
    const padded = `^${token}$`;
    for (let i = 0; i + 3 <= padded.length; i += 1) vector[parseInt(fnv1a(padded.slice(i, i + 3)).slice(0, 8), 16) % VECTOR_DIMS] += 1;
  }
  let norm = 0;
  for (const v of vector) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  return vector.map((v) => v / norm);
}

export function cosine(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
  return sum;
}

/** documents: [{ docId, kind, text, ref, epistemicStatus, ... }]. Returns an immutable in-memory index. */
export function buildRecallIndex(documents) {
  const docs = documents.map((doc) => {
    const tokens = tokenize(doc.text);
    const termFrequency = new Map();
    for (const t of tokens) termFrequency.set(t, (termFrequency.get(t) ?? 0) + 1);
    return { doc, tokens, termFrequency, vector: hashedVector(tokens), textFingerprint: fnv1a(normalizeText(doc.text)) };
  });
  const documentFrequency = new Map();
  for (const entry of docs) for (const t of entry.termFrequency.keys()) documentFrequency.set(t, (documentFrequency.get(t) ?? 0) + 1);
  const averageLength = docs.length ? docs.reduce((s, d) => s + d.tokens.length, 0) / docs.length : 0;
  return Object.freeze({ docs, documentFrequency, averageLength, size: docs.length });
}

const K1 = 1.5;
const B = 0.75;

export function searchRecallIndex(index, query, { limit = 10, minScore = 0.05 } = {}) {
  const queryTokens = [...new Set(tokenize(query))];
  if (!queryTokens.length || !index.size) return [];
  const queryVector = hashedVector(queryTokens);
  const scored = index.docs.map((entry) => {
    let bm25 = 0;
    const matched = [];
    for (const t of queryTokens) {
      const tf = entry.termFrequency.get(t) ?? 0;
      if (!tf) continue;
      matched.push(t);
      const df = index.documentFrequency.get(t) ?? 0;
      const idf = Math.log(1 + (index.size - df + 0.5) / (df + 0.5));
      bm25 += idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (entry.tokens.length / (index.averageLength || 1)))));
    }
    return { entry, bm25, matched, cosine: cosine(queryVector, entry.vector) };
  });
  const maxBm25 = Math.max(...scored.map((s) => s.bm25)) || 1;
  return scored
    .map((s) => ({ ...s, score: 0.6 * (s.bm25 / maxBm25) + 0.4 * s.cosine }))
    .filter((s) => s.score >= minScore && (s.matched.length > 0 || s.cosine >= 0.3))
    .sort((a, b) => b.score - a.score || a.entry.doc.docId.localeCompare(b.entry.doc.docId))
    .slice(0, limit)
    .map((s) => ({ doc: s.entry.doc, score: Number(s.score.toFixed(4)), matchedTerms: s.matched, textFingerprint: s.entry.textFingerprint, vector: s.entry.vector }));
}
