/**
 * Genesis OS — backend (Etap 2/3).
 *
 * Dwie role:
 *  1. Serwer produkcyjny: serwuje statyczny build PWA (packages/frontend/dist)
 *     z poprawnymi typami MIME, cache'owaniem i fallbackiem SPA.
 *  2. Proxy AI: POST /api/ask → API Anthropic. Klucz nigdy nie opuszcza serwera.
 *
 * Zasady bezpieczeństwa:
 *  - limit wielkości żądania (16 kB) i długości pytania (500 znaków),
 *  - walidacja typów pól kontekstu (tylko płaskie wartości, ograniczone klucze),
 *  - rate limit per IP (10 pytań/min) ze sprzątaniem pamięci,
 *  - ścieżki plików kanonizowane z granicą katalogu (zero path traversal),
 *  - nagłówki bezpieczeństwa (CSP, X-Frame-Options, Permissions-Policy, ...)
 *    na KAŻDEJ odpowiedzi — patrz lib.mjs → SECURITY_HEADERS,
 *  - graceful shutdown (SIGTERM/SIGINT) — bezpieczne dla autoscale.
 *
 * Czysta logika (bez portów/gniazd) żyje w lib.mjs — testowana przez
 * `node --test` bez uruchamiania serwera.
 */

import http from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import {
  sanitizeFlat,
  createRateLimiter,
  mimeFor,
  isHashedAsset,
  resolveStaticPath,
  SECURITY_HEADERS,
  buildKnowledgeIndex,
  knowledgeExcerptFor,
  AI_UNAVAILABLE_MESSAGE,
} from './lib.mjs';
import { openDatabase, purgeExpiredSessions } from './store.mjs';
import { handleApi } from './api.mjs';
import { listToolchain } from './campaign/toolchain.mjs';
import { fetchBiotechSource } from './biotechProxy.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8080);
const MODEL = process.env.GENESIS_AI_MODEL ?? 'claude-opus-4-8';
const STATIC_DIR = path.resolve(
  process.env.GENESIS_STATIC_DIR ?? path.join(__dirname, '../../frontend/dist'),
);
const KNOWLEDGE_DIR = path.resolve(
  process.env.GENESIS_KNOWLEDGE_DIR ?? path.join(__dirname, '../../../knowledge'),
);
const VERSION = process.env.npm_package_version ?? '1.0.0';
const startedAt = Date.now();

const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
const client = hasKey ? new Anthropic() : null;

// Trwały magazyn (Milestone 1: Backend Persistence). Domyślnie plik obok
// serwera; :memory: dla testów/efemerycznych wdrożeń bez woluminu. node:sqlite
// jest wbudowany — zero zewnętrznych zależności, schemat przenośny do Postgresa.
const DB_PATH = process.env.GENESIS_DB_PATH ?? path.join(__dirname, '../data/genesis.db');
let db = null;
try {
  if (DB_PATH !== ':memory:') {
    const dir = path.dirname(DB_PATH);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
  db = openDatabase(DB_PATH);
} catch (err) {
  // Bez trwałości aplikacja nadal działa (local-first frontend) — logujemy i lecimy dalej.
  console.log(JSON.stringify({ t: new Date().toISOString(), level: 'error', msg: 'db_open_failed', message: String(err?.message) }));
}
// Okresowe sprzątanie wygasłych sesji — pamięć/plik nie puchną.
if (db) setInterval(() => { try { purgeExpiredSessions(db); } catch { /* ignore */ } }, 3_600_000).unref();

// Wczytane raz przy starcie — pliki knowledge/*.md rzadko się zmieniają,
// a to grounding dla KAŻDEGO zapytania do /api/ask (patrz handleAsk niżej).
const knowledgeIndex = buildKnowledgeIndex(KNOWLEDGE_DIR, (p) => readFileSync(p, 'utf8'));

const log = (level, msg, extra = {}) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra }));

const SYSTEM_PROMPT = `Jesteś Narratorem AI platformy edukacyjnej Genesis OS — naukowym przewodnikiem po interaktywnych symulacjach fizycznych.

Twarde zasady (nie wolno ich łamać):
1. Odpowiadasz WYŁĄCZNIE w kontekście przekazanej symulacji i fizyki. Pytania spoza nauki grzecznie zawracasz do tematu.
2. Wszystkie wartości liczbowe pochodzą z przekazanego stanu symulacji — NIE obliczasz własnych wyników symulacji ani ich nie zgadujesz. Wolno Ci przytaczać znane stałe i wyniki fizyki (np. masę elektronu, rok odkrycia).
3. Hipotezy (multiwersum, rój Dysona, metryka Alcubierre'a) zawsze oznaczasz jako hipotezy. Nigdy nie ogłaszasz "odkryć".
4. Szanujesz etykietę uczciwości modelu — jeśli symulacja jest uproszczona, mówisz o tym, gdy to istotne.
5. Odpowiadasz po polsku, zwięźle (maksymalnie ~120 słów), poprawnie fizycznie, na poziomie zaciekawionego licealisty — chyba że pytanie sugeruje wyższy poziom.
6. Gdy w wiadomości otrzymasz sekcję "Baza wiedzy Genesis OS" — to Twoje JEDYNE dozwolone źródło dla twierdzeń wykraczających poza sam stan symulacji (definicje, historia, spory naukowe). Jeśli baza nie zawiera odpowiedzi na pytanie, powiedz to wprost zamiast zgadywać z ogólnej wiedzy.
7. Każde twierdzenie wykraczające poza odczyt bieżącej symulacji oznacz jednym z poziomów: ★★★★★ potwierdzona eksperymentalnie / ★★★★ silny konsensus / ★★★ częściowo potwierdzona / ★★ hipoteza / ★ spekulacja / ☆ science fiction — dokładnie tą samą skalą, którą baza wiedzy już stosuje. Nie musisz oznaczać każdego zdania osobno — jedno oznaczenie na twierdzenie wystarczy.`;

/* ---------------- Rate limiting ---------------- */
const limiter = createRateLimiter({ limit: 10, windowMs: 60_000 });
const biotechSourceLimiter = createRateLimiter({ limit: 30, windowMs: 60_000 });
// Sprzątanie wygasłych wpisów — pamięć nie rośnie z liczbą adresów IP.
setInterval(() => {
  limiter.cleanup();
  biotechSourceLimiter.cleanup();
}, 300_000).unref();

function json(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

/* ---------------- API: /api/ask ---------------- */
async function handleAsk(req, res) {
  if (!hasKey) {
    return json(res, 503, { error: 'ai_unavailable', message: AI_UNAVAILABLE_MESSAGE });
  }
  const ip = req.socket.remoteAddress ?? 'unknown';
  if (!limiter.allow(ip)) {
    return json(res, 429, { error: 'rate_limited', message: 'Limit 10 pytań na minutę — odczekaj chwilę.' });
  }

  let raw = '';
  let size = 0;
  let overflow = false;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > 16_384) {
      overflow = true;
      req.destroy();
      return;
    }
    raw += chunk;
  });
  req.on('end', async () => {
    if (overflow) return;
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json(res, 400, { error: 'bad_json' });
    }
    const question = String(body.question ?? '').slice(0, 500).trim();
    if (!question) return json(res, 400, { error: 'empty_question' });

    // Kontekst: wyłącznie dane, które użytkownik i tak widzi — po walidacji.
    const labId = String(body.labId ?? '').slice(0, 40);
    const ctx = {
      lab: String(body.lab ?? '').slice(0, 80),
      experiment: String(body.experiment ?? '').slice(0, 80),
      honesty: String(body.honesty ?? '').slice(0, 40),
      honestyNote: String(body.honestyNote ?? '').slice(0, 500),
      params: sanitizeFlat(body.params),
      stats: sanitizeFlat(body.stats),
      narration: Array.isArray(body.narration)
        ? body.narration.slice(0, 4).map((n) => ({
            title: String(n?.title ?? '').slice(0, 160),
            body: String(n?.body ?? '').slice(0, 800),
          }))
        : [],
    };
    const knowledge = knowledgeExcerptFor(knowledgeIndex, labId);

    const t0 = Date.now();
    try {
      const promptParts = [`Stan symulacji (JSON):\n${JSON.stringify(ctx, null, 1).slice(0, 6000)}`];
      if (knowledge) {
        promptParts.push(`Baza wiedzy Genesis OS dla tego laboratorium (jedyne dozwolone źródło poza stanem symulacji):\n${knowledge}`);
      }
      promptParts.push(`Pytanie użytkownika: ${question}`);

      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 600,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: promptParts.join('\n\n') }],
      });
      const text = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      log('info', 'ask', { lab: ctx.lab, labId, grounded: Boolean(knowledge), ms: Date.now() - t0, stop: response.stop_reason });
      if (response.stop_reason === 'refusal' || !text) {
        return json(res, 200, { answer: 'Nie mogę odpowiedzieć na to pytanie — wróćmy do fizyki symulacji.' });
      }
      return json(res, 200, { answer: text, model: response.model });
    } catch (err) {
      log('error', 'ask_failed', { status: err?.status, message: err?.message, ms: Date.now() - t0 });
      return json(res, 502, { error: 'upstream', message: 'Serwis AI chwilowo niedostępny — spróbuj ponownie.' });
    }
  });
}

/* ---------------- API: allowlisted live biotech sources ---------------- */
async function handleBiotechSource(req, res, url) {
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
  const ip = req.socket.remoteAddress ?? 'unknown';
  if (!biotechSourceLimiter.allow(ip)) return json(res, 429, { error: 'rate_limited', message: 'Za dużo odczytów źródeł — odczekaj chwilę.' });
  const result = await fetchBiotechSource(url.searchParams.get('url'));
  return json(res, result.status, result.body);
}

/* ---------------- API trwałości (/api/auth, /api/projects) ---------------- */
const persistLimiter = createRateLimiter({ limit: 60, windowMs: 60_000 });
// Uploady źródłowe mogą zawierać duże, poprawne artefakty; nie dzielą jednak
// budżetu, aby spam GIS nie blokował Knowledge Ingestion.
const knowledgeUploadLimiter = createRateLimiter({ limit: 6, windowMs: 60_000 });
const spatialUploadLimiter = createRateLimiter({ limit: 6, windowMs: 60_000 });
setInterval(() => {
  persistLimiter.cleanup();
  knowledgeUploadLimiter.cleanup();
  spatialUploadLimiter.cleanup();
}, 300_000).unref();

/** Odczytuje ciało JSON (limit 64 kB — próby to małe wektory liczb), token z nagłówka i woła router. */
function handlePersistApi(req, res, url) {
  if (!db) return json(res, 503, { error: 'persistence_unavailable', message: 'Trwały magazyn nie jest dostępny w tym wdrożeniu.' });
  const ip = req.socket.remoteAddress ?? 'unknown';
  if (!persistLimiter.allow(ip)) {
    return json(res, 429, { error: 'rate_limited', message: 'Za dużo żądań — odczekaj chwilę.' });
  }
  const isKnowledgeUpload = req.method === 'POST' && /^\/api\/projects\/[^/]+\/knowledge-materials\/?$/.test(url.pathname);
  const isSpatialUpload = req.method === 'POST' && /^\/api\/projects\/[^/]+\/spatial-datasets\/?$/.test(url.pathname);
  if (isKnowledgeUpload && !knowledgeUploadLimiter.allow(ip)) {
    return json(res, 429, { error: 'knowledge_upload_rate_limited', message: 'Limit uploadu materiałów: 6 na minutę.' });
  }
  if (isSpatialUpload && !spatialUploadLimiter.allow(ip)) {
    return json(res, 429, { error: 'spatial_upload_rate_limited', message: 'Limit uploadu artefaktów GIS: 6 na minutę.' });
  }
  const maxBodyBytes = (isKnowledgeUpload || isSpatialUpload) ? 7 * 1024 * 1024 : 65_536;
  const declaredLength = Number(req.headers['content-length'] ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
    return json(res, 413, { error: 'payload_too_large', message: 'Przesłany materiał przekracza limit transportu.' });
  }
  const auth = req.headers['authorization'] ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  const query = Object.fromEntries(url.searchParams.entries());

  let raw = '';
  let size = 0;
  let overflow = false;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > maxBodyBytes) { overflow = true; req.destroy(); return; }
    raw += chunk;
  });
  req.on('end', () => {
    if (overflow) return;
    let body = {};
    if (raw) {
      try { body = JSON.parse(raw); } catch { return json(res, 400, { error: 'bad_json' }); }
    }
    try {
      const result = handleApi(db, { method: req.method, pathname: url.pathname, token, body, query });
      return json(res, result.status, result.body);
    } catch (err) {
      log('error', 'persist_api_failed', { path: url.pathname, message: String(err?.message) });
      return json(res, 500, { error: 'internal' });
    }
  });
}

/* ---------------- Statyczny frontend (produkcja) ---------------- */
function serveStatic(req, res) {
  const urlPath = new URL(req.url, 'http://x').pathname;
  const resolved = resolveStaticPath(STATIC_DIR, urlPath);
  if (!resolved.ok) {
    return json(res, 403, { error: 'forbidden' });
  }
  let filePath = resolved.filePath;
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = path.join(STATIC_DIR, 'index.html'); // fallback SPA
  }
  res.writeHead(200, {
    'content-type': mimeFor(filePath),
    // Hashowane assety Vite: cache na rok; index/manifest/sw: zawsze świeże.
    'cache-control': isHashedAsset(filePath) ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(filePath).pipe(res);
}

/* ---------------- Serwer ---------------- */
const staticAvailable = existsSync(path.join(STATIC_DIR, 'index.html'));

const server = http.createServer((req, res) => {
  // Ustawione na starcie przez setHeader — writeHead() w dalszym kodzie
  // dopisuje nagłówki specyficzne dla trasy bez usuwania tych globalnych.
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);

  if (req.method === 'GET' && req.url === '/api/health') {
    return json(res, 200, {
      ok: true,
      version: VERSION,
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      ai: hasKey ? 'ready' : 'no-key',
      model: hasKey ? MODEL : null,
      static: staticAvailable,
      knowledgeLabs: knowledgeIndex.size,
      persistence: db ? 'ready' : 'unavailable',
      toolchain: listToolchain().map((tool) => ({ id: tool.id ?? tool.name ?? 'unknown', status: tool.status, version: tool.version ?? null })),
    });
  }
  if (req.method === 'POST' && req.url === '/api/ask') return handleAsk(req, res);
  const requestUrl = req.url ? new URL(req.url, 'http://x') : null;
  if (requestUrl?.pathname === '/api/biotech/source') return handleBiotechSource(req, res, requestUrl);
  if (req.url?.startsWith('/api/auth/') || req.url?.startsWith('/api/projects') || req.url?.startsWith('/api/compute')) {
    return handlePersistApi(req, res, new URL(req.url, 'http://x'));
  }
  if (req.url?.startsWith('/api/')) return json(res, 404, { error: 'not_found' });
  if (req.method === 'GET' && staticAvailable) return serveStatic(req, res);
  return json(res, 404, { error: 'not_found', hint: 'Brak buildu frontendu — uruchom npm run build.' });
});

server.listen(PORT, () => {
  log('info', 'started', {
    port: server.address()?.port ?? PORT, // rzeczywisty port (PORT=0 → efemeryczny, przydatne w testach)
    version: VERSION,
    ai: hasKey ? MODEL : 'no-key',
    static: staticAvailable ? STATIC_DIR : 'none',
    persistence: db ? DB_PATH : 'none',
  });
});

// Graceful shutdown — autoscale/kontenery wysyłają SIGTERM przy skalowaniu.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    log('info', 'shutdown', { signal: sig });
    server.close(() => {
      try { db?.close(); } catch { /* ignore */ }
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
