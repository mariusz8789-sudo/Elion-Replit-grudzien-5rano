/**
 * Genesis OS — backend AI (Etap 2).
 *
 * Jedyna rola: bezpieczne proxy do API Anthropic dla pytań użytkownika
 * o bieżącą symulację. Klucz API nigdy nie opuszcza serwera.
 *
 * Zasady bezpieczeństwa:
 *  - limit wielkości żądania (16 kB) i długości pytania (500 znaków),
 *  - prosty rate limit per IP (10 pytań/min),
 *  - model dostaje stan symulacji policzony przez warstwę deterministyczną
 *    i ma zakaz wymyślania wartości liczbowych oraz ogłaszania "odkryć",
 *  - brak CORS poza dev proxy (Vite przekierowuje /api na ten port).
 */

import http from 'node:http';
import Anthropic from '@anthropic-ai/sdk';

const PORT = Number(process.env.PORT ?? 8080);
const MODEL = process.env.GENESIS_AI_MODEL ?? 'claude-opus-4-8';
const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
const client = hasKey ? new Anthropic() : null;

const SYSTEM_PROMPT = `Jesteś Narratorem AI platformy edukacyjnej Genesis OS — naukowym przewodnikiem po interaktywnych symulacjach fizycznych.

Twarde zasady (nie wolno ich łamać):
1. Odpowiadasz WYŁĄCZNIE w kontekście przekazanej symulacji i fizyki. Pytania spoza nauki grzecznie zawracasz do tematu.
2. Wszystkie wartości liczbowe pochodzą z przekazanego stanu symulacji — NIE obliczasz własnych wyników symulacji ani ich nie zgadujesz. Wolno Ci przytaczać znane stałe i wyniki fizyki (np. masę elektronu, rok odkrycia).
3. Hipotezy (multiwersum, rój Dysona, metryka Alcubierre'a) zawsze oznaczasz jako hipotezy. Nigdy nie ogłaszasz "odkryć".
4. Szanujesz etykietę uczciwości modelu — jeśli symulacja jest uproszczona, mówisz o tym, gdy to istotne.
5. Odpowiadasz po polsku, zwięźle (maksymalnie ~120 słów), poprawnie fizycznie, na poziomie zaciekawionego licealisty — chyba że pytanie sugeruje wyższy poziom.`;

// Rate limit: 10 żądań na minutę per IP
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

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/api/health') {
    return json(res, 200, { ok: true, ai: hasKey ? 'ready' : 'no-key', model: hasKey ? MODEL : null });
  }
  if (req.method !== 'POST' || req.url !== '/api/ask') {
    return json(res, 404, { error: 'not_found' });
  }
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
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > 16_384) {
      req.destroy();
      return;
    }
    raw += chunk;
  });
  req.on('end', async () => {
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json(res, 400, { error: 'bad_json' });
    }
    const question = String(body.question ?? '').slice(0, 500).trim();
    if (!question) return json(res, 400, { error: 'empty_question' });

    // Kontekst z frontendu: wyłącznie dane, które użytkownik i tak widzi.
    const ctx = {
      lab: String(body.lab ?? '').slice(0, 80),
      experiment: String(body.experiment ?? '').slice(0, 80),
      honesty: String(body.honesty ?? '').slice(0, 40),
      honestyNote: String(body.honestyNote ?? '').slice(0, 500),
      params: body.params ?? {},
      stats: body.stats ?? {},
      narration: Array.isArray(body.narration) ? body.narration.slice(0, 4) : [],
    };

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
      if (response.stop_reason === 'refusal' || !text) {
        return json(res, 200, { answer: 'Nie mogę odpowiedzieć na to pytanie — wróćmy do fizyki symulacji.' });
      }
      return json(res, 200, { answer: text, model: response.model });
    } catch (err) {
      const status = err?.status ?? 500;
      console.error('ask error:', status, err?.message);
      return json(res, 502, { error: 'upstream', message: 'Serwis AI chwilowo niedostępny — spróbuj ponownie.' });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Genesis OS backend: http://localhost:${PORT} · AI: ${hasKey ? MODEL : 'BRAK KLUCZA (ustaw ANTHROPIC_API_KEY)'}`);
});
