/**
 * Public, versioned REST API (v1) — a stable surface for EXTERNAL developers.
 *
 * Design principles:
 *   • Independent + versioned: everything lives under /api/v1/ and is namespaced
 *     here, so the internal app API can evolve without breaking public clients.
 *   • No duplicated science: every endpoint delegates to the existing, tested
 *     RDKit adapter (compute/rdkitAdapter.mjs) — the same engine the app uses.
 *   • Honest, predictable envelope: every response carries "status" ("ok"|"error")
 *     and "computed_by": "RDKit"; errors give a machine code + a clear message.
 *     Nothing is fabricated — an unavailable engine returns 503, a bad SMILES 422.
 *
 * Routes:
 *   POST /api/v1/analyze     { smiles } -> molecular properties (+ InChIKey)
 *   POST /api/v1/render/2d   { smiles } -> 2D depiction SVG
 *   POST /api/v1/render/3d   { smiles } -> 3D atom coordinates + bonds
 */
import { timingSafeEqual } from 'node:crypto';
import * as rdkit from './compute/rdkitAdapter.mjs';
import { getApiKey, incrementApiKeyUsage, resetApiKeyUsage, createApiKey, API_TIERS } from './store.mjs';

export const API_V1_VERSION = 'genesis-public-api/1';
const COMPUTED_BY = 'RDKit';

const ok = (body) => ({ status: 200, body: { status: 'ok', computed_by: COMPUTED_BY, ...body } });
const fail = (httpStatus, error, message) => ({ status: httpStatus, body: { status: 'error', computed_by: COMPUTED_BY, error, message } });

/** Constant-time string comparison (admin secret). */
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a), bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** Validate the shared `{ smiles }` input. Returns a string or an error response. */
function requireSmiles(body) {
  const smiles = body?.smiles;
  if (typeof smiles !== 'string' || smiles.trim() === '') {
    return { error: fail(400, 'missing_smiles', 'Pole "smiles" jest wymagane i musi być niepustym tekstem.') };
  }
  return { smiles: smiles.trim() };
}

/** Map an adapter error to the right public HTTP status + message. */
function engineError(error, reason) {
  if (error === 'BLOCKED_BY_RUNTIME') return fail(503, 'engine_unavailable', reason ?? 'Silnik RDKit jest niedostępny w tym środowisku.');
  if (error === 'invalid_smiles' || error === 'INVALID_STRUCTURE') return fail(422, 'invalid_smiles', 'Nie udało się sparsować podanego SMILES — sprawdź jego poprawność.');
  return fail(422, 'invalid_smiles', `Nie udało się przetworzyć SMILES (${error ?? 'unknown'}).`);
}

/** POST /api/v1/analyze — molecular properties + InChIKey. */
function analyze(body) {
  const v = requireSmiles(body);
  if (v.error) return v.error;
  const d = rdkit.descriptors(v.smiles);
  if (!d.ok) return engineError(d.error, d.reason);
  const p = d.data;
  const ik = rdkit.inchi(v.smiles); // reuse existing InChIKey logic
  return ok({
    smiles: v.smiles,
    canonical_smiles: p.canonicalSmiles,
    engine: d.engine,
    properties: {
      molecular_weight: p.molWt,
      molecular_formula: p.molecularFormula,
      logp: p.crippenLogP,
      tpsa: p.tpsa,
      hbd: p.hbd,
      hba: p.hba,
      lipinski_violations: p.lipinskiViolations,
      lipinski_pass: p.lipinskiPass,
      inchikey: ik.ok ? ik.inchiKey : null,
    },
  });
}

/** POST /api/v1/render/2d — 2D depiction SVG. */
function render2d(body) {
  const v = requireSmiles(body);
  if (v.error) return v.error;
  const r = rdkit.depict2d(v.smiles);
  if (!r.ok) return engineError(r.error, r.reason);
  return ok({ smiles: v.smiles, canonical_smiles: r.canonicalSmiles, molecular_formula: r.molecularFormula, format: 'svg', width: r.width, height: r.height, svg: r.svg });
}

/** POST /api/v1/render/3d — 3D atom coordinates (Å) + bonds. */
function render3d(body) {
  const v = requireSmiles(body);
  if (v.error) return v.error;
  const r = rdkit.embed3d(v.smiles);
  if (!r.ok) return engineError(r.error, r.reason);
  return ok({
    smiles: v.smiles,
    canonical_smiles: r.canonicalSmiles,
    force_field: r.forceField,
    formal_charge: r.charge,
    atom_count: r.nAtoms,
    units: 'angstrom',
    note: 'Geometria OBLICZONA (ETKDG + MMFF/UFF), nie zmierzona eksperymentalnie.',
    atoms: r.atoms,
    bonds: r.bonds,
  });
}

/**
 * API-key middleware. Validates `Authorization: Bearer <key>` against the
 * api_keys table (independent of app user sessions). Rolls the monthly counter
 * when the reset date has passed, and enforces the tier quota. `now` injectable.
 */
function authenticate(db, token, now = Date.now()) {
  if (!token) return { error: fail(401, 'missing_api_key', 'Wymagany nagłówek Authorization: Bearer <klucz API>.') };
  let key = getApiKey(db, token);
  if (!key) return { error: fail(401, 'invalid_api_key', 'Nieznany klucz API.') };
  // Stage 8: mutatory operują na PRZECHOWYWANEJ wartości (hash = key.key), nie na surowym tokenie.
  if (now >= key.resetDate) { resetApiKeyUsage(db, key.key, now); key = getApiKey(db, token); }
  if (key.usageCount >= key.monthlyLimit) {
    return { error: fail(429, 'rate_limit_exceeded', `Przekroczono miesięczny limit ${key.monthlyLimit} zapytań dla tieru "${key.tier}".`) };
  }
  return { key };
}

/** Admin key-management (separate ADMIN_SECRET, not an API key). */
function handleAdmin(seg, method, body, token, db) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return fail(503, 'admin_disabled', 'Zarządzanie kluczami jest wyłączone (nie ustawiono ADMIN_SECRET).');
  if (!safeEqual(token ?? '', secret)) return fail(401, 'forbidden_admin', 'Nieprawidłowy sekret administratora.');
  if (seg[2] === 'keys' && seg.length === 3 && method === 'POST') {
    if (!db) return fail(503, 'persistence_unavailable', 'Warstwa trwałości jest niedostępna.');
    const ownerEmail = body?.owner_email;
    if (typeof ownerEmail !== 'string' || !ownerEmail.includes('@')) return fail(400, 'invalid_owner_email', 'Pole "owner_email" jest wymagane (poprawny e-mail).');
    const tier = body?.tier ?? 'free';
    if (!(tier in API_TIERS)) return fail(400, 'invalid_tier', `Dozwolone tiery: ${Object.keys(API_TIERS).join(', ')}.`);
    const created = createApiKey(db, { ownerEmail, tier, monthlyLimit: body?.monthly_limit });
    return ok({ key: created.key, owner_email: created.ownerEmail, tier: created.tier, monthly_limit: created.monthlyLimit, usage_count: created.usageCount, reset_date: created.resetDate });
  }
  return fail(404, 'not_found', 'Nieznany endpoint administracyjny.');
}

/**
 * Route a request under /api/v1/. `seg` is the path split after `/api/`
 * (e.g. ['v1','render','2d']). `ctx` = { db, token } — token is the Bearer value.
 * Admin routes use ADMIN_SECRET; compute routes require a valid API key and
 * increment its usage on each successful (200) response.
 */
export function handleV1(seg, method, body, ctx = {}) {
  const { db = null, token = null } = ctx;

  // Admin key-management is gated by a separate secret, not an API key.
  if (seg[1] === 'admin') return handleAdmin(seg, method, body, token, db);

  if (method !== 'POST') return fail(405, 'method_not_allowed', 'Endpointy v1 przyjmują metodę POST.');
  if (!db) return fail(503, 'persistence_unavailable', 'Warstwa kluczy API jest niedostępna w tym wdrożeniu.');

  // Every compute endpoint requires a valid, in-quota API key.
  const auth = authenticate(db, token);
  if (auth.error) return auth.error;

  let res;
  if (seg[1] === 'analyze' && seg.length === 2) res = analyze(body);
  else if (seg[1] === 'render' && seg[2] === '2d' && seg.length === 3) res = render2d(body);
  else if (seg[1] === 'render' && seg[2] === '3d' && seg.length === 3) res = render3d(body);
  else return fail(404, 'not_found', 'Nieznany endpoint API v1.');

  // A successful response consumes one unit of the monthly quota.
  if (res.status === 200) {
    const used = incrementApiKeyUsage(db, auth.key.key);
    res.body.rate_limit = { tier: auth.key.tier, limit: auth.key.monthlyLimit, used, remaining: Math.max(0, auth.key.monthlyLimit - used) };
  }
  return res;
}
