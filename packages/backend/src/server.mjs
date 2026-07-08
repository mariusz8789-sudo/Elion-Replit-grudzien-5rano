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
 *  - ścieżki plików kanonizowane (zero path traversal),
 *  - graceful shutdown (SIGTERM/SIGINT) — bezpieczne dla autoscale.
 */

import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8080);
const MODEL = process.env.GENESIS_AI_MODEL ?? 'claude-opus-4-8';
const STATIC_DIR = path.resolve(
  process.env.GENESIS_STATIC_DIR ?? path.join(__dirname, '../../frontend/dist'),
);
const VERSION = process.env.npm_package_version ?? '0.2.0';
const startedAt = Date.now();

const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
const client = hasKey ? new Anthropic() : null;

const log = (level, msg, extra = {}) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra }));

const SYSTEM_PROMPT = `Jesteś Narratorem AI platformy edukacyjnej Genesis OS — naukowym przewodnikiem po interaktywnych symulacjach fizycznych.

Twarde zasady (nie wolno ich łamać):
1. Odpowiadasz WYŁĄCZNIE w kontekście przekazanej symulacji i fizyki. Pytania spoza nauki grzecznie zawracasz do tematu.
2. Wszystkie wartości liczbowe pochodzą z przekazanego stanu symulacji — NIE obliczasz własnych wyników symulacji ani ich nie zgadujesz. Wolno Ci przytaczać znane stałe i wyniki fizyki (np. masę elektronu, rok odkrycia).
3. Hipotezy (multiwersum, rój Dysona, metryka Alcubierre'a) zawsze oznaczasz jako hipotezy. Nigdy nie ogłaszasz "odkryć".
4. Szanujesz etykietę uczciwości modelu — jeśli symulacja jest uproszczona, mówisz o tym, gdy to istotne.
5. Odpowiadasz po polsku, zwięźle (maksymalnie ~120 słów), poprawnie fizycznie, na poziomie zaciekawionego licealisty — chyba że pytanie sugeruje wyższy poziom.`;

/* ---------------- Rate limiting ---------------- */
const buckets = new Map();
function allow(ip) {
  const now = Date.now();
  const b = buckets.get(ip) ?? { count: 0, reset: now + 60_000 };
  if (now > b.reset) {
    b.count = 0;
    b.reset = now + 60_000;
  }
  b.count++;
  buckets.set(ip, b);
  return b.count <= 10;
}
// Sprzątanie wygasłych wpisów — pamięć nie rośnie z liczbą adresów IP.
setInterval(() => {
  const now = Date.now();
  for (const [ip, b] of buckets) if (now > b.reset) buckets.delete(ip);
}, 300_000).unref();

/* ---------------- Walidacja wejścia ---------------- */
/** Płaski obiekt: max 24 klucze, wartości proste, stringi przycięte. */
function sanitizeFlat(obj, maxKeys = 24) {
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
    return json(res, 503, {
      error: 'ai_unavailable',
      message: 'Backend działa, ale ANTHROPIC_API_KEY nie jest ustawiony.',
    });
  }
  const ip = req.socket.remoteAddress ?? 'unknown';
  if (!allow(ip)) {
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

    const t0 = Date.now();
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 600,
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        messages: [
          {
            role: 'user',
            content: `Stan symulacji (JSON):\n${JSON.stringify(ctx, null, 1).slice(0, 6000)}\n\nPytanie użytkownika: ${question}`,
          },
        ],
      });
      const text = response.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('\n');
      log('info', 'ask', { lab: ctx.lab, ms: Date.now() - t0, stop: response.stop_reason });
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

/* ---------------- Statyczny frontend (produkcja) ---------------- */
const MIME = {
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

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  // Kanonizacja — żądanie nigdy nie wyjdzie poza STATIC_DIR.
  let filePath = path.normalize(path.join(STATIC_DIR, urlPath));
  if (!filePath.startsWith(STATIC_DIR)) {
    return json(res, 403, { error: 'forbidden' });
  }
  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = path.join(STATIC_DIR, 'index.html'); // fallback SPA
  }
  const ext = path.extname(filePath);
  const hashed = /-[A-Za-z0-9_-]{8,}\./.test(path.basename(filePath));
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    // Hashowane assety Vite: cache na rok; index/manifest/sw: zawsze świeże.
    'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
    'x-content-type-options': 'nosniff',
  });
  createReadStream(filePath).pipe(res);
}

/* ---------------- Serwer ---------------- */
const staticAvailable = existsSync(path.join(STATIC_DIR, 'index.html'));

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/api/health') {
    return json(res, 200, {
      ok: true,
      version: VERSION,
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      ai: hasKey ? 'ready' : 'no-key',
      model: hasKey ? MODEL : null,
      static: staticAvailable,
    });
  }
  if (req.method === 'POST' && req.url === '/api/ask') return handleAsk(req, res);
  if (req.url?.startsWith('/api/')) return json(res, 404, { error: 'not_found' });
  if (req.method === 'GET' && staticAvailable) return serveStatic(req, res);
  return json(res, 404, { error: 'not_found', hint: 'Brak buildu frontendu — uruchom npm run build.' });
});

server.listen(PORT, () => {
  log('info', 'started', {
    port: PORT,
    version: VERSION,
    ai: hasKey ? MODEL : 'no-key',
    static: staticAvailable ? STATIC_DIR : 'none',
  });
});

// Graceful shutdown — autoscale/kontenery wysyłają SIGTERM przy skalowaniu.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    log('info', 'shutdown', { signal: sig });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
