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
  WORLD_PROPOSAL_TOOL,
  parseWorldProposalToolResponse,
} from './lib.mjs';
import { openDatabase, purgeExpiredSessions } from './store.mjs';
import { classifyDbPath } from './dbDurability.mjs';
import { resolveBuildInfo, checkDatabaseState } from './buildInfo.mjs';
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
// Tożsamość wydania (P0.3). Liczona raz na start: na produkcji pochodzi z
// build-arga obrazu, lokalnie z .git, a gdy nie ma ani jednego — mówi
// 'unknown' zamiast zmyślać.
const BUILD = resolveBuildInfo({ env: process.env, repoDir: path.resolve(__dirname, '../../..') });
const startedAt = Date.now();

const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
const client = hasKey ? new Anthropic() : null;

// Trwały magazyn (Milestone 1: Backend Persistence). Domyślnie plik obok
// serwera; :memory: dla testów/efemerycznych wdrożeń bez woluminu. node:sqlite
// jest wbudowany — zero zewnętrznych zależności, schemat przenośny do Postgresa.
const DB_PATH = process.env.GENESIS_DB_PATH ?? path.join(__dirname, '../data/genesis.db');
// Czy te dane przeżyją redeploy (P0.2). Liczone raz, raportowane i w logu
// startowym, i w /api/health — operator nie musi zgadywać, a komisja nie musi
// wierzyć na słowo. Sama diagnoza NIE blokuje startu: wdrożenie świadomie
// efemeryczne (demo, :memory:) jest legalne, o ile jest NAZWANE.
const DB_DURABILITY = classifyDbPath({ dbPath: DB_PATH, appDir: path.resolve(__dirname, '..') });
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
const worldProposalLimiter = createRateLimiter({ limit: 10, windowMs: 60_000 });
// Sprzątanie wygasłych wpisów — pamięć nie rośnie z liczbą adresów IP.
setInterval(() => {
  limiter.cleanup();
  biotechSourceLimiter.cleanup();
  worldProposalLimiter.cleanup();
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

/* ---------------- API: Genesis C3 World Proposal (real LLM adapter) ---------------- */

const WORLD_PROPOSAL_SYSTEM_PROMPT = `You propose the STRUCTURE of a scientific world for Genesis, a deterministic simulation engine. You do not compute science yourself and you do not invent entities — you only choose which of Genesis's EXISTING world templates and scientific domains best answer the user's request, by calling the propose_world tool exactly once.

Hard rules:
1. Only use the enum values the propose_world tool schema defines. Never invent a template, scale, or domain name.
2. Never claim a scientific capability Genesis does not have. If the request implies something outside chemistry/epidemiology/hydraulics/kinematics, omit it from scientificDomains rather than inventing a domain for it.
3. Refuse (call the tool with an empty-as-possible, honest structure and explain why in rationale) rather than help design a weapon or a harmful biological agent. Risk, resilience, epidemic-consequence modeling, evacuation, and infrastructure-failure simulation are all legitimate and encouraged.
4. rationale must say what you inferred and, if the request asked for something Genesis cannot model, say so plainly.`;

async function handleWorldProposal(req, res) {
  if (!hasKey) {
    return json(res, 503, { error: 'ai_unavailable', message: AI_UNAVAILABLE_MESSAGE });
  }
  const ip = req.socket.remoteAddress ?? 'unknown';
  if (!worldProposalLimiter.allow(ip)) {
    return json(res, 429, { error: 'rate_limited', message: 'Limit 10 propozycji świata na minutę — odczekaj chwilę.' });
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
    const prompt = String(body.prompt ?? '').slice(0, 1000).trim();
    if (!prompt) return json(res, 400, { error: 'empty_prompt' });

    const t0 = Date.now();
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        system: [{ type: 'text', text: WORLD_PROPOSAL_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        tools: [WORLD_PROPOSAL_TOOL],
        tool_choice: { type: 'tool', name: 'propose_world' },
        messages: [{ role: 'user', content: prompt }],
      });
      const parsed = parseWorldProposalToolResponse(response);
      log('info', 'world_proposal', { ms: Date.now() - t0, ok: parsed.ok, stop: response.stop_reason });
      if (!parsed.ok) {
        return json(res, 502, { error: 'malformed_proposal', message: parsed.message });
      }
      return json(res, 200, { proposal: parsed.input, model: response.model });
    } catch (err) {
      log('error', 'world_proposal_failed', { status: err?.status, message: err?.message, ms: Date.now() - t0 });
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
  // A saved world's keyframe entity/relationship snapshot can legitimately exceed the default
  // request-body budget (large scale-tests aside, even a modest reference city's entity list is
  // bigger than a typical trial/run's small parameter vectors) — same size class as the other two
  // upload routes above, not the default 64 kB meant for small JSON payloads.
  const isWorldUpload = (req.method === 'POST' || req.method === 'PUT') && /^\/api\/worlds(\/[^/]+)?\/?$/.test(url.pathname);
  if (isKnowledgeUpload && !knowledgeUploadLimiter.allow(ip)) {
    return json(res, 429, { error: 'knowledge_upload_rate_limited', message: 'Limit uploadu materiałów: 6 na minutę.' });
  }
  if (isSpatialUpload && !spatialUploadLimiter.allow(ip)) {
    return json(res, 429, { error: 'spatial_upload_rate_limited', message: 'Limit uploadu artefaktów GIS: 6 na minutę.' });
  }
  const maxBodyBytes = (isKnowledgeUpload || isSpatialUpload || isWorldUpload) ? 7 * 1024 * 1024 : 65_536;
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
    // Stan bazy z WYKONANEGO zapytania kontrolnego — `db ? 'ready' : ...` nie
    // widziało przypadku, w którym obiekt istnieje, a baza nie odpowiada.
    const dbState = checkDatabaseState(db);
    return json(res, 200, {
      ok: true,
      version: VERSION,
      commit: BUILD.commit,
      commitShort: BUILD.commitShort,
      commitSource: BUILD.commitSource,
      builtAt: BUILD.builtAt,
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      ai: hasKey ? 'ready' : 'no-key',
      model: hasKey ? MODEL : null,
      static: staticAvailable,
      knowledgeLabs: knowledgeIndex.size,
      // CELOWO bez absolutnej ścieżki pliku: /api/health jest nieuwierzytelniony,
      // a układ katalogów hosta nie jest informacją, którą trzeba tam ujawniać.
      // Operator i tak dostaje ścieżkę w logu startowym.
      db: { state: dbState.state, ok: dbState.ok, durability: DB_DURABILITY.durability, persistent: DB_DURABILITY.persistent },
      persistence: dbState.state,
      // `toolId` is the field these records actually carry (see campaign/toolchain.mjs
      // and /api/compute/toolchain, which reads t.toolId). Reading `id`/`name` here
      // meant EVERY entry fell through to the literal 'unknown', so the health
      // endpoint reported eight anonymous tools: you could see one AVAILABLE and
      // seven BLOCKED_BY_RUNTIME, but not which engine was which — the capability
      // disclosure anonymised at exactly the surface an operator inspects.
      toolchain: listToolchain().map((tool) => ({ id: tool.toolId ?? tool.id ?? tool.name ?? 'unknown', status: tool.status, version: tool.version ?? null })),
    });
  }
  if (req.method === 'POST' && req.url === '/api/ask') return handleAsk(req, res);
  if (req.method === 'POST' && req.url === '/api/world-proposal') return handleWorldProposal(req, res);
  const requestUrl = req.url ? new URL(req.url, 'http://x') : null;
  if (requestUrl?.pathname === '/api/biotech/source') return handleBiotechSource(req, res, requestUrl);
  if (req.url?.startsWith('/api/auth/') || req.url?.startsWith('/api/projects') || req.url?.startsWith('/api/compute') || req.url?.startsWith('/api/worlds') || req.url?.startsWith('/api/security')) {
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
    commit: BUILD.commitShort,
    commitSource: BUILD.commitSource,
    ai: hasKey ? MODEL : 'no-key',
    static: staticAvailable ? STATIC_DIR : 'none',
    persistence: db ? DB_PATH : 'none',
    durability: DB_DURABILITY.durability,
  });
  if (db && !DB_DURABILITY.persistent) log('warn', 'db_not_durable', { durability: DB_DURABILITY.durability, why: DB_DURABILITY.why });
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
