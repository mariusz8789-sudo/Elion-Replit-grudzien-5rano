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
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import {
  sanitizeFlat,
  createRateLimiter,
  clientIp,
  corsHeaders,
  createMetrics,
  systemMetrics,
  mimeFor,
  isHashedAsset,
  resolveStaticPath,
  SECURITY_HEADERS,
  buildKnowledgeIndex,
  knowledgeExcerptFor,
  AI_UNAVAILABLE_MESSAGE,
} from './lib.mjs';
import { openDatabase, purgeExpiredSessions, backupDatabase, getUserByToken } from './store.mjs';
import { backupName, rotateBackups, ensureDir } from './backup.mjs';
import { createComputePool } from './compute/computePool.mjs';
import { handleApi } from './api.mjs';
import { groundChatAnswer, groundingEnabled } from './aiGrounding.mjs';
import { handleCheckout, handleWebhook, billingConfig } from './billing/handler.mjs';

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

// Stage 8, PART 4: honoruj X-Forwarded-For TYLKO za zaufanym proxy (opt-in).
const TRUST_PROXY = process.env.GENESIS_TRUST_PROXY === 'true';
const ipOf = (req) => clientIp(req.headers, req.socket.remoteAddress, TRUST_PROXY);

// Genesis 2.0 (M4): CORS dla publicznego /api/v1 — domyślnie wyłączone (pusty allowlist).
const CORS_ORIGINS = (process.env.GENESIS_CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

// Genesis 2.0 (M3): jedno źródło prefiksów tras trafiających do handleApi (persist API).
// Musi pozostać zgodne z routingiem seg[0] w api.mjs — patrz test serverRouting.test.mjs.
const PERSIST_API_PREFIXES = ['/api/auth/', '/api/projects', '/api/compute', '/api/science', '/api/account/', '/api/campaigns', '/api/portfolio'];

// Genesis 2.1 (Part 1): asynchroniczny worker pool dla RDKit — ZA FLAGĄ, domyślnie OFF.
// OFF → nietknięty, synchroniczny tor (execFileSync). ON → nieblokujący pool wątków.
const ASYNC_EXECUTION = process.env.ASYNC_EXECUTION === 'true';
const computePool = ASYNC_EXECUTION
  ? createComputePool(process.env.GENESIS_WORKER_POOL_SIZE ? { size: Number(process.env.GENESIS_WORKER_POOL_SIZE) } : {})
  : null;
const ASYNC_COMPUTE_ROUTES = new Set(['/api/science/laboratory-readiness', '/api/science/molecule/render', '/api/compute/admet/predict', '/api/science/molecule/parse-file']);

/**
 * Nieblokujący tor obliczeń (flaga ON). Auth + rate-limit + walidacja w wątku głównym;
 * ciężki RDKit leci do puli wątków. Kształt odpowiedzi IDENTYCZNY jak tor synchroniczny.
 */
function handleAsyncCompute(req, res, pathname) {
  if (!db) return json(res, 503, { error: 'persistence_unavailable' });
  if (!persistLimiter.allow(ipOf(req))) return json(res, 429, { error: 'rate_limited', message: 'Za dużo żądań — odczekaj chwilę.' });
  const auth = req.headers['authorization'] ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  let raw = '', size = 0, overflow = false;
  req.on('data', (chunk) => { size += chunk.length; if (size > 65_536) { overflow = true; req.destroy(); return; } raw += chunk; });
  req.on('end', async () => {
    if (overflow) return;
    let body = {};
    if (raw) { try { body = JSON.parse(raw); } catch { return json(res, 400, { error: 'bad_json' }); } }
    if (!getUserByToken(db, token)) return json(res, 401, { error: 'unauthorized', message: 'Zaloguj się, aby uruchomić obliczenia.' });
    try {
      if (pathname === '/api/science/molecule/render') {
        const smiles = String(body?.smiles ?? '');
        if (!smiles) return json(res, 400, { error: 'invalid_input', message: 'SMILES required' });
        return json(res, 200, await computePool.run('molecule-render', { smiles, mode: body?.mode, width: body?.width, height: body?.height }));
      }
      if (pathname === '/api/compute/admet/predict') {
        const list = Array.isArray(body?.smiles) ? body.smiles.filter((s) => typeof s === 'string' && s) : [];
        if (!list.length) return json(res, 400, { error: 'invalid_input', message: 'smiles[] wymagane (co najmniej jeden SMILES).' });
        const r = await computePool.run('admet-predict', { smiles: list });
        if (r.ok) return json(res, 200, { predictions: r.predictions, version: r.version });
        return json(res, r.error === 'invalid_input' ? 400 : 503, { error: r.error ?? 'BLOCKED_BY_RUNTIME', message: r.reason });
      }
      if (pathname === '/api/science/molecule/parse-file') {
        const kind = String(body?.kind ?? '');
        if (kind === 'mol') {
          const molblock = String(body?.content ?? '');
          if (!molblock.trim()) return json(res, 400, { error: 'invalid_input', message: 'Plik MOL jest pusty.' });
          const r = await computePool.run('molecule-parse-mol', { molblock });
          if (r.ok) return json(res, 200, { molecules: [{ smiles: r.smiles, name: r.name }] });
          return json(res, r.error === 'invalid_molfile' || r.error === 'invalid_input' ? 400 : 503, { error: r.error, message: r.reason });
        }
        if (kind === 'sdf') {
          const sdf = String(body?.content ?? '');
          if (!sdf.trim()) return json(res, 400, { error: 'invalid_input', message: 'Plik SDF jest pusty.' });
          const r = await computePool.run('molecule-parse-sdf', { sdf });
          if (r.ok) return json(res, 200, { molecules: r.molecules, parsed: r.parsed, errors: r.errors, total: r.total });
          return json(res, r.error === 'invalid_input' ? 400 : 503, { error: r.error, message: r.reason });
        }
        return json(res, 400, { error: 'invalid_input', message: 'kind musi być "mol" lub "sdf".' });
      }
      return json(res, 200, await computePool.run('laboratory-readiness', { candidate: body?.candidate ?? {}, scientificQuestion: body?.scientificQuestion ?? null }));
    } catch (err) {
      log('error', 'async_compute_failed', { reqId: req.reqId, path: pathname, message: String(err?.message).slice(0, 200) });
      return json(res, 503, { error: 'compute_unavailable', message: 'Silnik obliczeniowy chwilowo niedostępny — spróbuj ponownie.' });
    }
  });
}

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

// Genesis 2.1 (Part 3): automatyczne backupy — WŁĄCZANE przez GENESIS_BACKUP_DIR.
// VACUUM INTO tworzy spójną kopię bez blokowania; rotacja trzyma ostatnie N.
const BACKUP_DIR = process.env.GENESIS_BACKUP_DIR ?? null;
const BACKUP_INTERVAL_MS = Math.max(60_000, Number(process.env.GENESIS_BACKUP_INTERVAL_MS ?? 21_600_000)); // domyślnie 6 h
const BACKUP_KEEP = Number(process.env.GENESIS_BACKUP_KEEP ?? 7);
if (db && BACKUP_DIR && DB_PATH !== ':memory:') {
  try { ensureDir(BACKUP_DIR); } catch { /* ignore */ }
  setInterval(() => {
    try {
      const dest = path.join(BACKUP_DIR, backupName());
      backupDatabase(db, dest);
      const removed = rotateBackups(BACKUP_DIR, BACKUP_KEEP);
      log('info', 'backup', { dest, rotatedOut: removed });
    } catch (err) {
      log('error', 'backup_failed', { message: String(err?.message).slice(0, 200) });
    }
  }, BACKUP_INTERVAL_MS).unref();
}

// Wczytane raz przy starcie — pliki knowledge/*.md rzadko się zmieniają,
// a to grounding dla KAŻDEGO zapytania do /api/ask (patrz handleAsk niżej).
const knowledgeIndex = buildKnowledgeIndex(KNOWLEDGE_DIR, (p) => readFileSync(p, 'utf8'));

const log = (level, msg, extra = {}) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra }));

// Genesis 2.1 (Part 4): metryki ruchu/błędów/czasu odpowiedzi (w pamięci procesu).
const metrics = createMetrics();

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
// Sprzątanie wygasłych wpisów — pamięć nie rośnie z liczbą adresów IP.
setInterval(() => limiter.cleanup(), 300_000).unref();

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
  const ip = ipOf(req);
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
      // Grounding Layer — OFF by default (GROUNDING_ENABLED != 'true') → identical
      // pass-through. When enabled, only the answer TEXT is grounded; response
      // shape (answer + model) is unchanged. Fail-open: a grounding error must
      // never break a working AI reply.
      let answer = text;
      try {
        answer = groundChatAnswer(text).text;
      } catch (gErr) {
        log('error', 'grounding_failed', { message: String(gErr?.message).slice(0, 160) });
      }
      return json(res, 200, { answer, model: response.model });
    } catch (err) {
      log('error', 'ask_failed', { status: err?.status, message: err?.message, ms: Date.now() - t0 });
      return json(res, 502, { error: 'upstream', message: 'Serwis AI chwilowo niedostępny — spróbuj ponownie.' });
    }
  });
}

/* ---------------- Billing (Stripe): checkout + webhook (raw body) ---------------- */
function handleBilling(req, res, kind) {
  if (!db) return json(res, 503, { error: 'persistence_unavailable' });
  let raw = ''; let size = 0; let overflow = false;
  req.on('data', (chunk) => { size += chunk.length; if (size > 65_536) { overflow = true; req.destroy(); return; } raw += chunk; });
  req.on('end', async () => {
    if (overflow) return;
    try {
      if (kind === 'webhook') {
        const result = handleWebhook(db, { rawBody: raw, sigHeader: req.headers['stripe-signature'], config: billingConfig() });
        return json(res, result.status, result.body);
      }
      // checkout — authenticated JSON request; verify the token like the persist API.
      const auth = req.headers['authorization'] ?? '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
      let body = {};
      if (raw) { try { body = JSON.parse(raw); } catch { return json(res, 400, { error: 'bad_json' }); } }
      const result = await handleCheckout(db, { token, body, config: billingConfig() });
      return json(res, result.status, result.body);
    } catch (err) {
      log('error', 'billing_failed', { kind, message: String(err?.message).slice(0, 160) });
      return json(res, 500, { error: 'internal' });
    }
  });
}

/* ---------------- API trwałości (/api/auth, /api/projects) ---------------- */
// Limit podniesiony 60 → 180/min (pilot-readiness audit): jedna aktywna sesja Scientific
// Version Control (panel odświeża 4 zasoby po każdej automatycznej migawce) + kilka realnych
// analiz RDKit/ADMET w Compare potrafiły w normalnym, szybkim pokazie produktu realnie
// przekroczyć 60/min i dostać fałszywe 429 — odtworzone na żywo podczas tego audytu.
const persistLimiter = createRateLimiter({ limit: 180, windowMs: 60_000 });
setInterval(() => persistLimiter.cleanup(), 300_000).unref();

/** Odczytuje ciało JSON (limit 64 kB — próby to małe wektory liczb), token z nagłówka i woła router. */
function handlePersistApi(req, res, url) {
  if (!db) return json(res, 503, { error: 'persistence_unavailable', message: 'Trwały magazyn nie jest dostępny w tym wdrożeniu.' });
  const ip = ipOf(req);
  if (!persistLimiter.allow(ip)) {
    return json(res, 429, { error: 'rate_limited', message: 'Za dużo żądań — odczekaj chwilę.' });
  }
  const auth = req.headers['authorization'] ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
  const query = Object.fromEntries(url.searchParams.entries());

  // Kampanie (2.1) mogą mieć do ~2000 cząsteczek z deskryptorami → większy limit ciała.
  const maxBody = url.pathname.startsWith('/api/campaigns') ? 4 * 1024 * 1024 : 65_536;
  let raw = '';
  let size = 0;
  let overflow = false;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > maxBody) { overflow = true; req.destroy(); return; }
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

  // Genesis 2.1 (Part 4): request-id + pomiar czasu + metryki. Jeden identyfikator
  // na żądanie (nagłówek + logi) ułatwia korelację błędów; log przy 'finish'.
  const reqId = (typeof req.headers['x-request-id'] === 'string' && req.headers['x-request-id'].slice(0, 64)) || randomUUID();
  res.setHeader('x-request-id', reqId);
  req.reqId = reqId;
  const t0 = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - t0;
    metrics.record(res.statusCode, ms);
    if (req.url?.startsWith('/api/') && req.url !== '/api/health' && req.url !== '/api/metrics') {
      log(res.statusCode >= 500 ? 'error' : 'info', 'req', { reqId, method: req.method, path: (req.url || '').split('?')[0], status: res.statusCode, ms });
    }
  });

  if (req.method === 'GET' && req.url === '/api/health') {
    const sys = systemMetrics(metrics.snapshot(), { startedAt });
    return json(res, 200, {
      ok: true,
      version: VERSION,
      uptimeSec: sys.uptimeSec,
      ai: hasKey ? 'ready' : 'no-key',
      model: hasKey ? MODEL : null,
      static: staticAvailable,
      knowledgeLabs: knowledgeIndex.size,
      persistence: db ? 'ready' : 'unavailable',
      asyncExecution: ASYNC_EXECUTION,
      cpu: sys.cpu,
      memory: sys.memory,
    });
  }
  // Genesis 2.1 (Part 4): pełne metryki operacyjne (CPU/RAM/ruch/błędy/czas odpowiedzi).
  if (req.method === 'GET' && req.url === '/api/metrics') {
    return json(res, 200, { version: VERSION, ...systemMetrics(metrics.snapshot(), { startedAt }) });
  }
  if (req.method === 'POST' && req.url === '/api/ask') return handleAsk(req, res);
  // Billing (Stripe). The webhook MUST verify the signature over the RAW body, so
  // both billing routes read the raw payload themselves (not the JSON router).
  if (req.method === 'POST' && req.url === '/api/billing/webhook') return handleBilling(req, res, 'webhook');
  if (req.method === 'POST' && req.url === '/api/billing/checkout') return handleBilling(req, res, 'checkout');
  // Public, versioned external API (v1) — independent of persistence (RDKit only).
  if (req.url?.startsWith('/api/v1/')) {
    // M4: CORS dla publicznego API (config-gated). Bez allowlisty → brak nagłówków.
    for (const [name, value] of Object.entries(corsHeaders(req.headers.origin, CORS_ORIGINS))) res.setHeader(name, value);
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); } // preflight
    return handlePersistApi(req, res, new URL(req.url, 'http://x'));
  }
  // Genesis 2.1 (Part 1): nieblokujący tor dla ciężkich obliczeń — TYLKO gdy flaga ON.
  // Gdy OFF, żądania spadają do zwykłego, synchronicznego handlePersistApi poniżej.
  if (computePool && req.method === 'POST' && ASYNC_COMPUTE_ROUTES.has((req.url || '').split('?')[0])) {
    return handleAsyncCompute(req, res, (req.url || '').split('?')[0]);
  }
  if (PERSIST_API_PREFIXES.some((p) => req.url?.startsWith(p))) {
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
    grounding: groundingEnabled() ? 'on' : 'off',
    asyncExecution: computePool ? `pool(${computePool.stats().size})` : 'off',
    backups: BACKUP_DIR ? BACKUP_DIR : 'off',
    static: staticAvailable ? STATIC_DIR : 'none',
    persistence: db ? DB_PATH : 'none',
  });
});

// Stage 8, PART 7: globalna siatka bezpieczeństwa. Bez tych handlerów wyjątek,
// który wymknie się ze ścieżki asynchronicznej (np. zadania w tle), ubija cały
// proces bez śladu. Logujemy zawsze. `unhandledRejection` traktujemy jako błąd
// do naprawy, ale NIE ubijamy procesu (jedno zgubione `await` nie może położyć
// serwera). `uncaughtException` jest poważniejszy — logujemy i pozwalamy procesowi
// zakończyć się kontrolowanie (menedżer/kontener zrestartuje) zamiast działać w
// nieokreślonym stanie.
process.on('unhandledRejection', (reason) => {
  log('error', 'unhandled_rejection', { message: String(reason?.message ?? reason).slice(0, 300) });
});
process.on('uncaughtException', (err) => {
  log('error', 'uncaught_exception', { message: String(err?.message ?? err).slice(0, 300), stack: String(err?.stack ?? '').slice(0, 500) });
  try { server.close(() => { try { db?.close(); } catch { /* ignore */ } process.exit(1); }); } catch { process.exit(1); }
  setTimeout(() => process.exit(1), 3000).unref();
});

// Graceful shutdown — autoscale/kontenery wysyłają SIGTERM przy skalowaniu.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    log('info', 'shutdown', { signal: sig });
    server.close(() => {
      try { computePool?.close(); } catch { /* ignore */ }
      try { db?.close(); } catch { /* ignore */ }
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
