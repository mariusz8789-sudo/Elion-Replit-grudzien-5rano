/**
 * Genesis Knowledge Ingestion — walidacja pliku, ekstrakcja tekstu i provenance.
 *
 * Ten moduł nie uruchamia modeli, nie interpretuje materiału jako instrukcji i
 * nie zmienia capability. Zwraca wyłącznie źródłowy artefakt + indeks tekstowy,
 * który API zapisuje w istniejącym magazynie projektu.
 */

import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const KNOWLEDGE_INGESTION_VERSION = '1.0.0';
export const MAX_KNOWLEDGE_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_EXTRACTED_TEXT_CHARS = 200_000;
export const MAX_TOPICS = 12;

const SUPPORTED_MIME = new Map([
  ['text/plain', 'TXT'],
  ['text/markdown', 'MD'],
  ['application/pdf', 'PDF'],
  ['application/json', 'JSON'],
]);

const ALLOWED_EXTENSION_BY_MIME = new Map([
  ['text/plain', new Set(['.txt'])],
  ['text/markdown', new Set(['.md', '.markdown'])],
  ['application/pdf', new Set(['.pdf'])],
  ['application/json', new Set(['.json'])],
]);

export function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function normalizeFilename(value) {
  const name = path.basename(String(value ?? '').replaceAll('\\', '/')).trim();
  if (!name || name === '.' || name === '..' || name.length > 180) return null;
  return name;
}

function normalizeTitle(value, fileName) {
  const title = String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, 180);
  if (title) return title;
  return fileName.replace(/\.[^.]+$/, '').slice(0, 180) || 'Materiał użytkownika';
}

export function stableMaterialKey(title) {
  return String(title)
    .toLocaleLowerCase('pl-PL')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'material-uzytkownika';
}

function normalizeTopics(value) {
  if (!Array.isArray(value)) return [];
  const topics = [];
  for (const raw of value) {
    const topic = String(raw ?? '').trim().replace(/\s+/g, ' ').slice(0, 64);
    if (topic && !topics.includes(topic)) topics.push(topic);
    if (topics.length >= MAX_TOPICS) break;
  }
  return topics;
}

function decodeBase64(value) {
  const encoded = String(value ?? '').trim();
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) return null;
  const bytes = Buffer.from(encoded, 'base64');
  // Buffer.from jest celowo pobłażliwy; round-trip zapobiega cichej zmianie artefaktu.
  if (bytes.toString('base64') !== encoded) return null;
  return bytes;
}

function sanitizeExtractedText(value) {
  return String(value ?? '')
    .replaceAll('\u0000', '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .slice(0, MAX_EXTRACTED_TEXT_CHARS);
}

function extractPdfText(bytes) {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'genesis-knowledge-'));
  const inputPath = path.join(tempDir, 'source.pdf');
  try {
    writeFileSync(inputPath, bytes, { flag: 'wx', mode: 0o600 });
    const child = spawnSync('pdftotext', ['-enc', 'UTF-8', inputPath, '-'], {
      encoding: 'utf8',
      timeout: 10_000,
      maxBuffer: MAX_EXTRACTED_TEXT_CHARS * 4,
      windowsHide: true,
    });
    if (child.error || child.status !== 0) {
      return { text: '', status: child.error?.code === 'ENOENT' ? 'EXTRACTION_UNAVAILABLE' : 'EXTRACTION_FAILED' };
    }
    const text = sanitizeExtractedText(child.stdout);
    return text ? { text, status: 'EXTRACTED' } : { text: '', status: 'NO_EXTRACTABLE_TEXT' };
  } finally {
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 2 });
  }
}

function extractText(mimeType, bytes) {
  if (mimeType === 'application/pdf') return extractPdfText(bytes);
  const text = sanitizeExtractedText(bytes.toString('utf8'));
  return text ? { text, status: 'EXTRACTED' } : { text: '', status: 'NO_EXTRACTABLE_TEXT' };
}

/**
 * Waliduje transport JSON/base64. Materiał użytkownika jest domyślnie
 * `USER_PROVIDED_UNREVIEWED`; klient nie może przez upload sam ogłosić faktu.
 */
export function prepareKnowledgeUpload(payload) {
  const fileName = normalizeFilename(payload?.fileName);
  const mimeType = String(payload?.mimeType ?? '').trim().toLowerCase();
  if (!fileName) return { ok: false, error: 'invalid_file_name', message: 'Nazwa pliku jest nieprawidłowa.' };
  if (!SUPPORTED_MIME.has(mimeType)) return { ok: false, error: 'unsupported_media_type', message: 'Obsługiwane są wyłącznie PDF, TXT, MD i JSON.' };
  const extension = path.extname(fileName).toLowerCase();
  if (!ALLOWED_EXTENSION_BY_MIME.get(mimeType)?.has(extension)) {
    return { ok: false, error: 'extension_mismatch', message: 'Rozszerzenie pliku nie zgadza się z deklarowanym typem.' };
  }
  const bytes = decodeBase64(payload?.contentBase64);
  if (!bytes || bytes.length === 0) return { ok: false, error: 'invalid_file_content', message: 'Plik nie zawiera poprawnej treści base64.' };
  if (bytes.length > MAX_KNOWLEDGE_FILE_BYTES) return { ok: false, error: 'file_too_large', message: 'Maksymalny rozmiar materiału to 5 MB.' };
  if (mimeType === 'application/pdf' && !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    return { ok: false, error: 'invalid_pdf_signature', message: 'Plik nie ma prawidłowej sygnatury PDF.' };
  }

  const title = normalizeTitle(payload?.title, fileName);
  const extraction = extractText(mimeType, bytes);
  const sourceUrl = typeof payload?.sourceUrl === 'string' && /^https?:\/\//i.test(payload.sourceUrl.trim())
    ? payload.sourceUrl.trim().slice(0, 2000)
    : null;
  const now = new Date().toISOString();
  const contentSha256 = sha256Hex(bytes);
  return {
    ok: true,
    value: {
      fileName,
      title,
      stableKey: stableMaterialKey(title),
      mimeType,
      bytes,
      byteSize: bytes.length,
      contentSha256,
      topics: normalizeTopics(payload?.topics),
      sourceUrl,
      extractedText: extraction.text,
      extractionStatus: extraction.status,
      epistemicStatus: 'USER_PROVIDED_UNREVIEWED',
      provenance: {
        kind: 'USER_UPLOAD',
        ingestionVersion: KNOWLEDGE_INGESTION_VERSION,
        uploadedAt: now,
        sourceUrl,
        contentSha256,
        extraction: { status: extraction.status, extractor: mimeType === 'application/pdf' ? 'pdftotext' : 'utf8' },
        solverEffect: 'NONE',
      },
    },
  };
}

export function tokenizeKnowledgeQuery(query) {
  return [...new Set(String(query ?? '')
    .toLocaleLowerCase('pl-PL')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((part) => part.length >= 2)
    .slice(0, 12))];
}
