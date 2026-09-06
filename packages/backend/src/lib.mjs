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
  biology: 'biology.md',
  mathematics: 'mathematics.md',
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

/* ---------------- Narrator AI: konfiguracja produkcyjna ---------------- */

/**
 * Komunikat zwracany, gdy backend nie ma skonfigurowanego klucza API (brak
 * ANTHROPIC_API_KEY w środowisku). Trafia do KAŻDEGO klienta HTTP, nie
 * tylko operatora wdrożenia — celowo NIE wymienia nazwy zmiennej
 * środowiskowej ani żadnych innych szczegółów konfiguracji serwera.
 * Dokładny wymagany klucz jest udokumentowany dla operatorów w
 * `.env.example` i `README.md`, nie w odpowiedzi API.
 */
export const AI_UNAVAILABLE_MESSAGE =
  'Funkcja „Zapytaj AI" nie jest skonfigurowana w tym wdrożeniu. Deterministyczny Narrator (opis symulacji powyżej) działa bez zmian, w pełni offline.';

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

/* ---------------- Genesis C3: World Proposal (real LLM adapter) ---------------- */

/**
 * Genesis C3 — GENERATIVE SCIENTIFIC WORLD MODEL 3.0: the LLM's ONLY job is
 * to propose the STRUCTURE of a world (which templates, roughly what scale/
 * population/domains) — never to invent entities, run solvers, or touch a
 * WorldGraph directly. This tool's `input_schema` is the enforced contract:
 * Anthropic's tool-use forces the model to return JSON matching this shape
 * (or the API surfaces a usable error), so the frontend's Scientific
 * Validation Gate (core/worldModel/specification/validation.ts) always has
 * well-typed input to actually validate — this schema is a syntax fence,
 * not a substitute for that real validation.
 */
export const WORLD_PROPOSAL_TOOL = {
  name: 'propose_world',
  description:
    "Propose a structured scientific world specification for Genesis, composed from Genesis's existing world templates (CITY, LABORATORY, WATER_SYSTEM, EPIDEMIOLOGY, INDUSTRIAL_SITE). Never invent a template, scale, or scientific domain outside the given enums.",
  input_schema: {
    type: 'object',
    properties: {
      worldType: {
        type: 'array',
        items: { type: 'string', enum: ['CITY', 'LABORATORY', 'WATER_SYSTEM', 'EPIDEMIOLOGY', 'INDUSTRIAL_SITE'] },
        minItems: 1,
      },
      scale: {
        type: 'string',
        enum: ['PLANET', 'REGION', 'MACRO_CITY', 'BUILDING', 'ROOM', 'MESO_LAB', 'MICRO_MOLECULAR', 'NANO_ATOMIC'],
      },
      geography: {
        type: 'object',
        properties: {
          hasRiver: { type: 'boolean' },
          coastal: { type: 'boolean' },
          regionCount: { type: 'integer', minimum: 0 },
          districtCount: { type: 'integer', minimum: 0 },
          buildingsPerDistrict: { type: 'integer', minimum: 0 },
        },
      },
      population: {
        type: 'object',
        properties: { count: { type: 'integer', minimum: 0 } },
      },
      scientificDomains: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            domain: { type: 'string', enum: ['chemistry', 'epidemiology', 'hydraulics', 'kinematics'] },
            required: { type: 'boolean' },
          },
          required: ['domain', 'required'],
        },
      },
      levelOfDetail: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
      rationale: { type: 'string', description: 'One or two sentences explaining why this structure answers the user request.' },
    },
    required: ['worldType', 'rationale'],
  },
};

const KNOWN_WORLD_TEMPLATES = new Set(['CITY', 'LABORATORY', 'WATER_SYSTEM', 'EPIDEMIOLOGY', 'INDUSTRIAL_SITE']);

/**
 * Pure, network-free extraction + shape validation of the tool_use block an
 * Anthropic `messages.create` response carries when `propose_world` was
 * invoked. Never trusts the model: re-checks the shape independently of
 * whatever the API itself enforced, and REJECTS (never silently repairs) a
 * malformed or missing tool call.
 */
export function parseWorldProposalToolResponse(response) {
  const block = Array.isArray(response?.content) ? response.content.find((b) => b?.type === 'tool_use' && b?.name === 'propose_world') : null;
  if (!block || typeof block.input !== 'object' || block.input === null) {
    return { ok: false, reason: 'malformed', message: 'Model did not return a propose_world tool call.' };
  }
  const input = block.input;
  if (!Array.isArray(input.worldType) || input.worldType.length === 0 || !input.worldType.every((t) => KNOWN_WORLD_TEMPLATES.has(t))) {
    return { ok: false, reason: 'malformed', message: 'worldType must be a non-empty array of known template names.' };
  }
  if (typeof input.rationale !== 'string' || input.rationale.trim().length === 0) {
    return { ok: false, reason: 'malformed', message: 'rationale must be a non-empty string.' };
  }
  return { ok: true, input };
}
