/**
 * Genesis OS — backend: czyste, testowalne funkcje wydzielone z server.mjs.
 *
 * Rozdział celowy: server.mjs łączy je z http.createServer (efekty
 * uboczne, gniazda sieciowe), a ten plik zawiera wyłącznie logikę, którą
 * da się przetestować bez uruchamiania serwera (node --test, zero portów).
 */

import path from 'node:path';

/* ---------------- Grounding: baza wiedzy Genesis ---------------- */

/**
 * Mapowanie id laboratorium → plik w knowledge/ — dokładnie ta sama tabela,
 * co w knowledge/README.md „Katalogi" (jedno miejsce prawdy, dwa formaty:
 * ludzki markdown i to mapowanie kodowe).
 */
export const LAB_KNOWLEDGE_FILES = {
  universe: 'universe.md',
  spacetime: 'spacetime-einstein.md',
  einstein: 'spacetime-einstein.md',
  quantum: 'quantum.md',
  atom: 'atom.md',
  nuclear: 'nuclear.md',
  particle: 'particle.md',
  chemistry: 'chemistry.md',
  multiverse: 'multiverse.md',
  civilization: 'civilization.md',
  discovery: 'ai-discovery.md',
  'discovery-timeline': 'discovery-timeline.md',
  'quantum-decision-explorer': 'quantum-decision-explorer.md',
};

/**
 * Wczytuje wszystkie pliki bazy wiedzy do pamięci RAZ (przy starcie serwera).
 * `readFileFn` jest wstrzykiwane, żeby dało się to przetestować bez
 * dotykania prawdziwego systemu plików. Brakujący plik nie wywala reszty —
 * grounding po prostu nie zadziała dla TEGO jednego laboratorium (patrz
 * server.mjs: pytanie dostanie wtedy tylko stan symulacji, tak jak dotąd).
 */
export function buildKnowledgeIndex(knowledgeDir, readFileFn) {
  const index = new Map();
  for (const [labId, filename] of Object.entries(LAB_KNOWLEDGE_FILES)) {
    try {
      index.set(labId, readFileFn(path.join(knowledgeDir, filename)));
    } catch {
      // plik nieobecny w tym środowisku (np. Docker bez COPY knowledge/) — pomijamy
    }
  }
  return index;
}

/** Wycinek bazy wiedzy do wstrzyknięcia w prompt — przycięty, żeby nie zdmuchnąć budżetu tokenów. */
export function knowledgeExcerptFor(knowledgeIndex, labId, maxChars = 4000) {
  const content = knowledgeIndex.get(labId);
  if (!content) return null;
  return content.length > maxChars ? content.slice(0, maxChars) + '\n…(przycięte)' : content;
}

/* ---------------- Walidacja wejścia ---------------- */

/** Płaski obiekt: max maxKeys kluczy, wartości proste, stringi przycięte. */
export function sanitizeFlat(obj, maxKeys = 24) {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return {};
  const out = {};
  for (const [k, v] of Object.entries(obj).slice(0, maxKeys)) {
    const key = String(k).slice(0, 60);
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
    else if (typeof v === 'boolean') out[key] = v;
    else if (typeof v === 'string') out[key] = v.slice(0, 200);
  }
  return out;
}

/* ---------------- Rate limiting ---------------- */

/** Fabryka limitera — osobna instancja na test, bez współdzielonego stanu modułu. */
export function createRateLimiter({ limit = 10, windowMs = 60_000 } = {}) {
  const buckets = new Map();

  function allow(ip) {
    const now = Date.now();
    const b = buckets.get(ip) ?? { count: 0, reset: now + windowMs };
    if (now > b.reset) {
      b.count = 0;
      b.reset = now + windowMs;
    }
    b.count++;
    buckets.set(ip, b);
    return b.count <= limit;
  }

  function cleanup(now = Date.now()) {
    for (const [ip, b] of buckets) if (now > b.reset) buckets.delete(ip);
  }

  return { allow, cleanup, size: () => buckets.size };
}

/* ---------------- Statyczny frontend ---------------- */

export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

export function mimeFor(filePath) {
  return MIME[path.extname(filePath)] ?? 'application/octet-stream';
}

/** Hashowane assety Vite (np. index-A1b2C3d4.js) — bezpieczne do cache'owania na rok. */
export function isHashedAsset(filePath) {
  return /-[A-Za-z0-9_-]{8,}\./.test(path.basename(filePath));
}

/**
 * Kanonizuje żądaną ścieżkę URL do pliku wewnątrz staticDir.
 * Zwraca { ok: false } przy próbie path traversal (np. "/../", "..%2f").
 *
 * Sama normalizacja + startsWith nie wystarcza: dla staticDir="/app/dist"
 * ścieżka "/app/dist-evil/x" też zaczyna się od "/app/dist" bez separatora
 * na granicy katalogu — stąd jawne porównanie do staticDir + path.sep.
 */
export function resolveStaticPath(staticDir, urlPath) {
  const decoded = decodeURIComponent(urlPath);
  const resolved = path.normalize(path.join(staticDir, decoded));
  if (resolved !== staticDir && !resolved.startsWith(staticDir + path.sep)) {
    return { ok: false };
  }
  return { ok: true, filePath: resolved };
}

/* ---------------- Nagłówki bezpieczeństwa ---------------- */

/**
 * Wysyłane na KAŻDĄ odpowiedź (API i statyczne pliki). Brak zewnętrznych
 * zasobów w buildzie (fonty/skrypty systemowe, zero CDN) pozwala na ścisłe
 * default-src 'self' bez 'unsafe-inline' — React ustawia style przez
 * CSSStyleDeclaration (nie <style>/style="", więc style-src 'self' starczy).
 */
export const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  'content-security-policy':
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
    "font-src 'self'; connect-src 'self'; manifest-src 'self'; base-uri 'none'; " +
    "form-action 'none'; frame-ancestors 'none'; object-src 'none'",
  // Nieszkodliwy na czystym HTTP (przeglądarki ignorują HSTS bez TLS) —
  // aktywny, gdy wdrożenie stoi za reverse proxy terminującym TLS.
  'strict-transport-security': 'max-age=63072000; includeSubDomains',
};
