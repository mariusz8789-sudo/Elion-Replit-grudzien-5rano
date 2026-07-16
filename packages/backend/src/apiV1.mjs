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
import * as rdkit from './compute/rdkitAdapter.mjs';

export const API_V1_VERSION = 'genesis-public-api/1';
const COMPUTED_BY = 'RDKit';

const ok = (body) => ({ status: 200, body: { status: 'ok', computed_by: COMPUTED_BY, ...body } });
const fail = (httpStatus, error, message) => ({ status: httpStatus, body: { status: 'error', computed_by: COMPUTED_BY, error, message } });

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
 * Route a request under /api/v1/. `seg` is the path split after `/api/`
 * (e.g. ['v1','render','2d']). Self-contained; needs no db/auth.
 */
export function handleV1(seg, method, body) {
  if (method !== 'POST') return fail(405, 'method_not_allowed', 'Endpointy v1 przyjmują metodę POST.');
  if (seg[1] === 'analyze' && seg.length === 2) return analyze(body);
  if (seg[1] === 'render' && seg[2] === '2d' && seg.length === 3) return render2d(body);
  if (seg[1] === 'render' && seg[2] === '3d' && seg.length === 3) return render3d(body);
  return fail(404, 'not_found', 'Nieznany endpoint API v1.');
}
