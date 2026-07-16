/**
 * Grounding Layer (see docs/GROUNDING_LAYER_DESIGN.md) — a POST-generation output
 * guardrail that makes molecular hallucination architecturally impossible in AI
 * Chat: no numeric molecular claim reaches the user unless it is backed by a REAL
 * RDKit computation performed in the same conversation.
 *
 * Design decisions (rationale in the doc, summarised here so the code is self-explaining):
 *  • WHERE (§1): after the model generates, before the user sees it — the only point
 *    where claims exist AND can still be filtered.
 *  • REGISTRY (§2): session facts keyed by CANONICAL SMILES → property → {value,source}.
 *    Populated passively (prior real computations) and actively (compute-on-demand, cached).
 *  • DETECTION (§3): structured `genesis-claims` block is PRIMARY (deterministic 1:1
 *    verification); a prose text-scan is the SECONDARY safety net for numbers that leak
 *    into free text without a declared claim. Defense-in-depth.
 *  • POLICY (§4): fail-closed `redact` by default (strip the unverifiable value, keep the
 *    rest, mark the gap) — never shows an unverified/known-wrong number; `block` opt-in.
 *  • PERF (§5): O(1) lookups, regex over short text; the only cost is compute-on-demand,
 *    which is one descriptors call per NEW molecule (grounds all scalars at once), cached
 *    and capped. Flag-gated → inert pass-through when disabled / when AI is unavailable.
 *
 * This EXTENDS the honesty contract (computed_by / BLOCKED_BY_RUNTIME / "AI unavailable"),
 * it does not replace it. Injectable `compute` keeps the module unit-testable with no subprocess.
 */
import * as rdkit from '../compute/rdkitAdapter.mjs';

export const GROUNDING_VERSION = 'genesis-grounding/1';

/** RDKit-groundable properties: PL+EN aliases, comparison tolerance, kind. */
const PROPERTIES = {
  molWt: { aliases: ['mw', 'molecular weight', 'masa molowa', 'masa cząsteczkowa', 'masa molekularna', 'molar mass', 'weight'], tol: { abs: 0.5 }, kind: 'number' },
  crippenLogP: { aliases: ['logp', 'clogp', 'log p', 'lipofilowość'], tol: { abs: 0.2 }, kind: 'number' },
  tpsa: { aliases: ['tpsa', 'polar surface area', 'powierzchnia polarna'], tol: { abs: 1.0 }, kind: 'number' },
  hbd: { aliases: ['hbd', 'donory wodoru', 'donory wiązań wodorowych', 'hydrogen bond donors', 'h-bond donors', 'donory'], tol: { int: true }, kind: 'number' },
  hba: { aliases: ['hba', 'akceptory wodoru', 'akceptory wiązań wodorowych', 'hydrogen bond acceptors', 'h-bond acceptors', 'akceptory'], tol: { int: true }, kind: 'number' },
  rotatableBonds: { aliases: ['rotatable bonds', 'wiązania rotacyjne'], tol: { int: true }, kind: 'number' },
  aromaticRings: { aliases: ['aromatic rings', 'pierścienie aromatyczne'], tol: { int: true }, kind: 'number' },
  lipinskiViolations: { aliases: ['lipinski violations', 'naruszenia lipinskiego', 'naruszenia reguły lipinskiego'], tol: { int: true }, kind: 'number' },
  inchiKey: { aliases: ['inchikey', 'inchi key', 'klucz inchi'], kind: 'string' },
  molecularFormula: { aliases: ['molecular formula', 'wzór sumaryczny', 'formula'], kind: 'string' },
};
/** Properties RDKit CANNOT compute — a number near these is unverifiable-by-RDKit → fail-closed. */
const NON_GROUNDABLE = ['toxicity', 'toksyczność', 'toksyczny', 'reactivity', 'reaktywność', 'solubility', 'rozpuszczalność', 'binding affinity', 'powinowactwo', 'ic50', 'ki', 'ld50', 'herg'];

const INCHIKEY_RE = /\b[A-Z]{14}-[A-Z]{10}-[A-Z]\b/g;
const NUM = '[-+]?\\d+(?:[.,]\\d+)?';
const CONNECT = '(?:\\s*(?:to|wynosi|równa się|=|:|≈|~|about|około|ok\\.?|is|of|around)?\\s*(?:~|≈)?\\s*)';

const parseNum = (s) => Number(String(s).replace(',', '.'));

/* ---------------- Session fact registry (§2) ---------------- */

export function createRegistry() {
  const bySmiles = new Map();  // canonicalSmiles -> { properties: Map<key,{value,source,at}>, recordedAt }
  const aliases = new Map();   // rawSmiles -> canonicalSmiles (avoids recomputing canonicalisation)
  return {
    /** Passive population: record real computed properties for a molecule. */
    record(canonicalSmiles, properties = {}, source = 'RDKit', at = 0) {
      const entry = bySmiles.get(canonicalSmiles) ?? { properties: new Map(), recordedAt: at };
      for (const [k, v] of Object.entries(properties)) {
        if (v === null || v === undefined) continue;
        entry.properties.set(k, { value: v, source, at });
      }
      bySmiles.set(canonicalSmiles, entry);
      aliases.set(canonicalSmiles, canonicalSmiles);
      return entry;
    },
    alias(rawSmiles, canonicalSmiles) { aliases.set(rawSmiles, canonicalSmiles); },
    canonicalOf(rawSmiles) { return aliases.get(rawSmiles) ?? null; },
    lookupCanonical(canonicalSmiles) { return bySmiles.get(canonicalSmiles) ?? null; },
    getFact(canonicalSmiles, property) { return bySmiles.get(canonicalSmiles)?.properties.get(property) ?? null; },
    size() { return bySmiles.size; },
  };
}

/** Default compute-on-demand: one descriptors + one inchi call → all scalar facts. */
export function defaultCompute(smiles) {
  const d = rdkit.descriptors(smiles);
  if (!d.ok) return { ok: false, error: d.error };
  const ik = rdkit.inchi(smiles);
  return { ok: true, canonicalSmiles: d.data.canonicalSmiles, properties: { ...d.data, inchiKey: ik.ok ? ik.inchiKey : null } };
}

/* ---------------- Verification core ---------------- */

function valuesMatch(property, stated, computed) {
  const spec = PROPERTIES[property];
  if (!spec) return false;
  if (spec.kind === 'string') return String(stated).trim().toUpperCase() === String(computed).trim().toUpperCase();
  const s = typeof stated === 'number' ? stated : parseNum(stated);
  const c = typeof computed === 'number' ? computed : parseNum(computed);
  if (!Number.isFinite(s) || !Number.isFinite(c)) return false;
  if (spec.tol.int) return Math.round(s) === Math.round(c);
  return Math.abs(s - c) <= spec.tol.abs;
}

/**
 * Resolve a molecule's facts, computing on demand (once) if needed and budget allows.
 * Returns { canonical, fact } for the requested property, or nulls when unavailable.
 */
function resolveFact(registry, rawSmiles, property, ctx) {
  let canonical = registry.canonicalOf(rawSmiles);
  if (canonical) {
    const fact = registry.getFact(canonical, property);
    if (fact) return { canonical, fact };
  }
  // Not known → compute on demand (once per molecule), if allowed and within budget.
  if (ctx.compute && ctx.budget.n < ctx.maxOnDemand) {
    ctx.budget.n += 1;
    const r = ctx.compute(rawSmiles);
    if (r && r.ok) {
      canonical = r.canonicalSmiles;
      registry.record(canonical, r.properties, 'RDKit(on-demand)', ctx.at);
      registry.alias(rawSmiles, canonical);
      return { canonical, fact: registry.getFact(canonical, property) };
    }
    return { canonical: null, fact: null, computeError: r?.error ?? 'compute_failed' };
  }
  return { canonical, fact: null };
}

/** Verify one structured claim against the registry (+ compute-on-demand). */
function verifyClaim(registry, claim, ctx) {
  const property = claim.property;
  const spec = PROPERTIES[property];
  const base = { property, smiles: claim.smiles, stated: claim.value };
  if (!spec) return { ...base, verdict: 'unverified', reason: 'property_not_groundable' };
  if (typeof claim.smiles !== 'string' || !claim.smiles) return { ...base, verdict: 'unverified', reason: 'no_smiles' };
  const { canonical, fact } = resolveFact(registry, claim.smiles, property, ctx);
  if (!fact) return { ...base, smiles: canonical ?? claim.smiles, verdict: 'unverified', reason: 'not_computed' };
  const verdict = valuesMatch(property, claim.value, fact.value) ? 'verified' : 'contradicted';
  return { ...base, smiles: canonical, computed: fact.value, verdict };
}

/* ---------------- Detection: structured claims (primary) ---------------- */

const CLAIMS_FENCE = /```genesis-claims\s*([\s\S]*?)```/i;
export function extractClaims(text) {
  const m = text.match(CLAIMS_FENCE);
  if (!m) return { claims: [], cleanText: text };
  let claims = [];
  try {
    const parsed = JSON.parse(m[1].trim());
    if (Array.isArray(parsed)) claims = parsed.filter((c) => c && typeof c === 'object');
  } catch { /* malformed block → no structured claims; text-scan still guards */ }
  const cleanText = text.replace(CLAIMS_FENCE, '').replace(/\n{3,}/g, '\n\n').trim();
  return { claims, cleanText };
}

/* ---------------- Detection: prose text-scan (safety net) ---------------- */

/**
 * Find prose numbers tied to a groundable property keyword ("MW is 180.16",
 * "LogP wynosi 1.31", "TPSA: 63.6") and InChIKey-shaped tokens. Returns hits with
 * the string span so the policy step can redact precisely.
 */
function scanProse(text) {
  const hits = [];
  for (const [property, spec] of Object.entries(PROPERTIES)) {
    if (spec.kind !== 'number') continue;
    for (const alias of spec.aliases) {
      const re = new RegExp(`(${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})${CONNECT}(${NUM})`, 'gi');
      let m;
      while ((m = re.exec(text)) !== null) {
        hits.push({ kind: 'property', property, value: parseNum(m[2]), match: m[0], numStr: m[2], index: m.index });
      }
    }
  }
  // Non-groundable property words followed by a number → always unverifiable by RDKit.
  for (const word of NON_GROUNDABLE) {
    const re = new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})${CONNECT}(${NUM})`, 'gi');
    let m;
    while ((m = re.exec(text)) !== null) {
      hits.push({ kind: 'non_groundable', property: word, value: parseNum(m[2]), match: m[0], numStr: m[2], index: m.index });
    }
  }
  // InChIKey-shaped tokens.
  let mk;
  const ikRe = new RegExp(INCHIKEY_RE.source, 'g');
  while ((mk = ikRe.exec(text)) !== null) hits.push({ kind: 'inchikey', property: 'inchiKey', value: mk[0], match: mk[0], numStr: mk[0], index: mk.index });
  return hits;
}

/** Decide a prose hit's verdict against verified claims + the active molecule's facts. */
function verifyProseHit(hit, registry, verifiedByProp, ctx) {
  if (hit.kind === 'non_groundable') return { ...hit, verdict: 'unverified', reason: 'not_rdkit_computable' };
  // Covered by a verified structured claim for the same property (value within tolerance)?
  const verified = verifiedByProp.get(hit.property) ?? [];
  if (hit.kind === 'inchikey') {
    if (verified.some((v) => valuesMatch('inchiKey', hit.value, v))) return { ...hit, verdict: 'verified' };
  } else if (verified.some((v) => valuesMatch(hit.property, hit.value, v))) {
    return { ...hit, verdict: 'verified' };
  }
  // Otherwise try the active molecule's registry facts (+ compute-on-demand).
  if (ctx.activeSmiles) {
    const { fact } = resolveFact(registry, ctx.activeSmiles, hit.property, ctx);
    if (fact) return { ...hit, verdict: valuesMatch(hit.property, hit.value, fact.value) ? 'verified' : 'contradicted', computed: fact.value };
  }
  return { ...hit, verdict: 'unverified', reason: 'no_backing_computation' };
}

/* ---------------- Policy application (§4) ---------------- */

const MARK = { unverified: '⚠︎[niepotwierdzone]', contradicted: '⚠︎[BŁĄD: niezgodne z obliczeniem]' };

function applyRedactions(text, hits, policy) {
  // Redact from the end so earlier indices stay valid.
  const toEdit = hits.filter((h) => h.verdict === 'unverified' || h.verdict === 'contradicted')
    .sort((a, b) => b.index - a.index);
  let out = text;
  for (const h of toEdit) {
    const numAt = out.indexOf(h.numStr, h.index >= 0 ? Math.max(0, h.index) : 0);
    const at = numAt >= 0 ? numAt : out.indexOf(h.numStr);
    if (at < 0) continue;
    const replacement = policy === 'annotate' ? `${h.numStr} ${MARK[h.verdict]}` : MARK[h.verdict];
    out = out.slice(0, at) + replacement + out.slice(at + h.numStr.length);
  }
  return out;
}

/* ---------------- Public entry point ---------------- */

/**
 * Ground an AI answer. Returns the user-facing text plus an audit of every
 * verification. Fail-closed: anything not backed by a real computation is redacted
 * (default) or triggers a block (opt-in). Pure pass-through when disabled.
 */
export function groundAnswer(answerText, opts = {}) {
  const {
    registry = createRegistry(),
    claims: providedClaims = null,
    activeSmiles = null,
    compute = defaultCompute,
    policy = 'redact',
    maxOnDemand = 4,
    enabled = true,
    at = 0,
  } = opts;

  if (!enabled || typeof answerText !== 'string' || answerText.trim() === '') {
    return { version: GROUNDING_VERSION, status: 'disabled', text: answerText ?? '', verifications: [], redactions: [] };
  }

  const ctx = { compute, maxOnDemand, budget: { n: 0 }, activeSmiles, at };

  // 1) Structured claims (primary).
  const { claims: parsed, cleanText } = extractClaims(answerText);
  const claims = Array.isArray(providedClaims) ? providedClaims : parsed;
  const claimVerdicts = claims.map((c) => verifyClaim(registry, c, ctx));

  // Index verified computed values per property (so prose restating them passes).
  const verifiedByProp = new Map();
  for (const v of claimVerdicts) {
    if (v.verdict === 'verified' && v.computed !== undefined) {
      const arr = verifiedByProp.get(v.property) ?? [];
      arr.push(v.computed);
      verifiedByProp.set(v.property, arr);
    }
  }

  // 2) Prose text-scan (safety net).
  const proseHits = scanProse(cleanText).map((h) => verifyProseHit(h, registry, verifiedByProp, ctx));

  const badClaims = claimVerdicts.filter((v) => v.verdict === 'contradicted' || v.verdict === 'unverified');
  const badProse = proseHits.filter((h) => h.verdict === 'contradicted' || h.verdict === 'unverified');
  const verifications = [...claimVerdicts, ...proseHits.map((h) => ({ property: h.property, smiles: activeSmiles, stated: h.value, computed: h.computed, verdict: h.verdict, source: 'prose', reason: h.reason }))];

  // 3) Policy.
  if (badClaims.length === 0 && badProse.length === 0) {
    return { version: GROUNDING_VERSION, status: 'grounded', text: cleanText, verifications, redactions: [] };
  }
  if (policy === 'block') {
    const items = [...badClaims.map((c) => `${c.property} (${c.verdict})`), ...badProse.map((h) => `${h.property}=${h.numStr} (${h.verdict})`)];
    const text = `⚠︎ Nie mogę potwierdzić części tej odpowiedzi realnym obliczeniem RDKit, więc jej nie pokazuję. Niepotwierdzone/niezgodne: ${[...new Set(items)].join(', ')}. Poproś o policzenie tych właściwości, aby je ugruntować.`;
    return { version: GROUNDING_VERSION, status: 'blocked', text, verifications, redactions: [...badClaims, ...badProse] };
  }
  // redact (default) / annotate
  const text = applyRedactions(cleanText, proseHits, policy);
  return { version: GROUNDING_VERSION, status: 'redacted', text, verifications, redactions: [...badClaims, ...badProse.map((h) => ({ property: h.property, numStr: h.numStr, verdict: h.verdict }))] };
}
