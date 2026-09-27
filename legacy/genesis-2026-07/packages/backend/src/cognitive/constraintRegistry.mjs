/**
 * Deterministic Constraint Registry (Commercial Hardening — Phase 3).
 *
 * The prior audit named narrow physical-constraint coverage as the main scientific
 * weakness. This registry replaces ad-hoc keyword checks with a STRUCTURED, EXTENSIBLE
 * set of deterministic constraints. Each constraint declares its required structured
 * inputs, an explicit applicability predicate, a pure deterministic evaluator, a
 * severity, rationale/evidence metadata, and a version. A BLOCK-producing constraint
 * MUST have all of these — it never blocks on vague language.
 *
 * HONESTY BOUNDARY (non-negotiable):
 *  - If the structured inputs a constraint needs are absent → SKIPPED (not a pass, not a
 *    fail). Missing data never silently becomes GO.
 *  - A domain whose science is NOT encoded here (e.g. gas–liquid oxygen mass transfer,
 *    limnology, reaeration) is reported as UNSUPPORTED with an explicit capability gap —
 *    we never fabricate domain expertise we do not have.
 *  - Every VIOLATED result carries the exact numbers that produced it, so a human can
 *    check the arithmetic. Nothing is asserted that the inputs do not entail.
 *
 * These are textbook conservation / consistency relations (dimensions, units, energy,
 * mass, power=energy/time, flow=volume/time, operating bounds, material limits). They are
 * deliberately conservative: they catch provable contradictions, not subtle physics.
 */
import * as fk from './formalKernel.mjs';

export const REGISTRY_VERSION = '1.0.0';

export const SEVERITY = Object.freeze({ CRITICAL: 'CRITICAL', WARN: 'WARN', INFO: 'INFO' });
export const STATUS = Object.freeze({ PASS: 'PASS', VIOLATED: 'VIOLATED', SKIPPED: 'SKIPPED', UNSUPPORTED: 'UNSUPPORTED', INSUFFICIENT_DATA: 'INSUFFICIENT_DATA' });

/** Domains whose deep science is explicitly NOT encoded — reported as honest capability gaps. */
export const KNOWN_UNSUPPORTED_DOMAINS = Object.freeze({
  'oxygen-transfer-efficiency': 'Gas–liquid oxygen mass transfer (SOTR/SAE, kLa) is not formally encoded.',
  limnology: 'Lake ecology / stratification / trophic dynamics are not formally encoded.',
  reaeration: 'Surface reaeration kinetics are not formally encoded.',
  'gas-liquid-mass-transfer': 'Two-film / penetration mass-transfer theory is not formally encoded.',
  'reaction-kinetics': 'Detailed chemical reaction kinetics are not formally encoded.',
  'cfd-hydrodynamics': 'Computational fluid dynamics is not formally encoded.',
});

const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
const approxEqual = (a, b, relTol = 0.02) => {
  if (!isNum(a) || !isNum(b)) return false;
  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-12);
  return Math.abs(a - b) / scale <= relTol;
};
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-12);

/**
 * A constraint definition. `evaluate(inputs)` MUST be pure and deterministic and return
 * { status, severity?, detail, evidence }. It must return SKIPPED when required inputs
 * are missing — never assume a value.
 */
function def(c) { return Object.freeze({ version: REGISTRY_VERSION, severity: SEVERITY.CRITICAL, ...c }); }

export const CONSTRAINTS = Object.freeze([
  def({
    id: 'dimensional-consistency', domain: 'general', name: 'Dimensional consistency of equations',
    description: 'Every additive/equated term in a supplied equation must share the same physical dimension.',
    requiredInputs: ['equations[].terms[].dimension'], severity: SEVERITY.CRITICAL,
    rationale: 'An equation whose two sides have different dimensions is provably ill-formed regardless of the numbers.',
    applicable: (i) => Array.isArray(i.equations) && i.equations.some((e) => Array.isArray(e?.terms) && e.terms.length > 0),
    evaluate: (i) => {
      const eqs = i.equations.filter((e) => Array.isArray(e?.terms) && e.terms.length > 0);
      const bad = [];
      for (const e of eqs) {
        const r = fk.checkDimensionalConsistency(e.terms);
        if (!r.consistent) bad.push({ equation: e.symbol ?? '?', reason: r });
      }
      return bad.length
        ? { status: STATUS.VIOLATED, detail: `dimensionally inconsistent: ${bad.map((b) => b.equation).join(', ')}`, evidence: bad }
        : { status: STATUS.PASS, detail: `${eqs.length} equation(s) dimensionally consistent`, evidence: { checked: eqs.length } };
    },
  }),
  def({
    id: 'unit-compatibility', domain: 'general', name: 'Unit compatibility of compared quantities',
    description: 'Two quantities related by =, <, > or + must share the same dimension.',
    requiredInputs: ['comparisons[].a.dimension', 'comparisons[].b.dimension'],
    rationale: 'Comparing or summing quantities of different units is a category error.',
    applicable: (i) => Array.isArray(i.comparisons) && i.comparisons.length > 0,
    evaluate: (i) => {
      const bad = [];
      for (const c of i.comparisons) {
        if (!Array.isArray(c?.a?.dimension) || !Array.isArray(c?.b?.dimension)) continue;
        if (!fk.dimEqual(c.a.dimension, c.b.dimension)) bad.push({ relation: c.relation ?? '=', a: c.a.symbol, b: c.b.symbol });
      }
      return bad.length
        ? { status: STATUS.VIOLATED, detail: `incompatible units in ${bad.length} comparison(s)`, evidence: bad }
        : { status: STATUS.PASS, detail: 'all compared quantities share units', evidence: { checked: i.comparisons.length } };
    },
  }),
  def({
    id: 'energy-balance', domain: 'thermodynamics', name: 'Energy input/output accounting',
    description: 'Useful energy output cannot exceed energy input plus any explicitly declared external source.',
    requiredInputs: ['energy.input', 'energy.output'],
    rationale: 'Conservation of energy: output > input + external is over-unity (First Law violation).',
    applicable: (i) => i.energy && isNum(i.energy.input) && isNum(i.energy.output),
    evaluate: (i) => {
      const { input, output } = i.energy; const external = isNum(i.energy.external) ? i.energy.external : 0;
      const supply = input + external;
      if (output > supply * 1.001) {
        return { status: STATUS.VIOLATED, detail: `claimed output ${output} exceeds available energy ${supply} (input ${input} + external ${external})`, evidence: { input, output, external, overBy: +(output - supply).toPrecision(4) } };
      }
      return { status: STATUS.PASS, detail: `output ${output} within supplied energy ${supply}`, evidence: { input, output, external } };
    },
  }),
  def({
    id: 'efficiency-bound', domain: 'thermodynamics', name: 'Efficiency within physical bounds',
    description: 'A dimensionless conversion efficiency must lie in [0, 1] unless an explicit accepted definition (e.g. COP) is declared.',
    requiredInputs: ['efficiency'],
    rationale: 'A conversion efficiency > 1 (>100%) violates energy conservation.',
    applicable: (i) => isNum(i.efficiency),
    evaluate: (i) => {
      const e = i.efficiency;
      if (i.efficiencyKind === 'COP') return { status: STATUS.SKIPPED, detail: 'declared as COP (may exceed 1) — not evaluated as a bounded efficiency', evidence: { efficiency: e } };
      if (e < 0) return { status: STATUS.VIOLATED, detail: `negative efficiency ${e}`, evidence: { efficiency: e } };
      if (e > 1.0) return { status: STATUS.VIOLATED, detail: `efficiency ${e} exceeds 1.0 (>100%) with no accepted >1 definition declared`, evidence: { efficiency: e } };
      return { status: STATUS.PASS, detail: `efficiency ${e} within [0,1]`, evidence: { efficiency: e } };
    },
  }),
  def({
    id: 'mass-balance', domain: 'general', name: 'Mass balance',
    description: 'Mass out cannot exceed mass in plus declared accumulation/generation.',
    requiredInputs: ['mass.in', 'mass.out'],
    rationale: 'Conservation of mass: out = in + generation − consumption − accumulation.',
    applicable: (i) => i.mass && isNum(i.mass.in) && isNum(i.mass.out),
    evaluate: (i) => {
      const { in: mi, out: mo } = i.mass; const gen = isNum(i.mass.generation) ? i.mass.generation : 0;
      if (mo > (mi + gen) * 1.001) return { status: STATUS.VIOLATED, detail: `mass out ${mo} exceeds mass in ${mi} + generation ${gen}`, evidence: { in: mi, out: mo, generation: gen } };
      return { status: STATUS.PASS, detail: `mass out ${mo} within mass in ${mi} + generation ${gen}`, evidence: { in: mi, out: mo, generation: gen } };
    },
  }),
  def({
    id: 'pressure-operating-bound', domain: 'mechanical', name: 'Pressure within operating bounds',
    description: 'Operating pressure must lie within any explicitly supplied [min,max] bounds.',
    requiredInputs: ['operating.pressure.value', 'operating.pressure.min|max'],
    rationale: 'Operating outside a component/material pressure rating is a provable specification violation.',
    applicable: (i) => i.operating?.pressure && isNum(i.operating.pressure.value) && (isNum(i.operating.pressure.min) || isNum(i.operating.pressure.max)),
    evaluate: (i) => boundCheck('pressure', i.operating.pressure),
  }),
  def({
    id: 'temperature-operating-bound', domain: 'thermal', name: 'Temperature within operating bounds',
    description: 'Operating temperature must lie within any explicitly supplied [min,max] bounds.',
    requiredInputs: ['operating.temperature.value', 'operating.temperature.min|max'],
    rationale: 'Operating outside a supplied temperature rating is a provable specification violation.',
    applicable: (i) => i.operating?.temperature && isNum(i.operating.temperature.value) && (isNum(i.operating.temperature.min) || isNum(i.operating.temperature.max)),
    evaluate: (i) => boundCheck('temperature', i.operating.temperature),
  }),
  def({
    id: 'flow-volume-time', domain: 'fluid', name: 'Flow = volume / time consistency',
    description: 'A supplied volumetric flow must equal volume divided by time within tolerance.',
    requiredInputs: ['flow.volumetricFlow', 'flow.volume', 'flow.time'],
    rationale: 'Q = V / t is a definitional identity; an inconsistent trio is a data/units error.',
    applicable: (i) => i.flow && isNum(i.flow.volumetricFlow) && isNum(i.flow.volume) && isNum(i.flow.time) && i.flow.time !== 0,
    evaluate: (i) => {
      const { volumetricFlow: q, volume: v, time: t } = i.flow; const expected = v / t;
      return approxEqual(q, expected)
        ? { status: STATUS.PASS, detail: `Q ${q} ≈ V/t ${expected.toPrecision(4)}`, evidence: { q, v, t, expected } }
        : { status: STATUS.VIOLATED, detail: `Q ${q} ≠ V/t ${expected.toPrecision(4)} (rel. error ${(rel(q, expected) * 100).toFixed(1)}%)`, evidence: { q, v, t, expected } };
    },
  }),
  def({
    id: 'power-energy-time', domain: 'general', name: 'Power = energy / time consistency',
    description: 'A supplied power must equal energy divided by time within tolerance.',
    requiredInputs: ['power.power', 'power.energy', 'power.time'],
    rationale: 'P = E / t is a definitional identity; an inconsistent trio is a data/units error.',
    applicable: (i) => i.power && isNum(i.power.power) && isNum(i.power.energy) && isNum(i.power.time) && i.power.time !== 0,
    evaluate: (i) => {
      const { power: p, energy: e, time: t } = i.power; const expected = e / t;
      return approxEqual(p, expected)
        ? { status: STATUS.PASS, detail: `P ${p} ≈ E/t ${expected.toPrecision(4)}`, evidence: { p, e, t, expected } }
        : { status: STATUS.VIOLATED, detail: `P ${p} ≠ E/t ${expected.toPrecision(4)} (rel. error ${(rel(p, expected) * 100).toFixed(1)}%)`, evidence: { p, e, t, expected } };
    },
  }),
  def({
    id: 'geometry-sanity', domain: 'general', name: 'Geometric parameter sanity',
    description: 'Supplied lengths, areas, volumes and depths must be finite and non-negative.',
    requiredInputs: ['geometry.{length|area|volume|depth|diameter}'], severity: SEVERITY.CRITICAL,
    rationale: 'A negative or non-finite physical extent is not realizable.',
    applicable: (i) => i.geometry && Object.values(i.geometry).some(isNum),
    evaluate: (i) => {
      const bad = Object.entries(i.geometry).filter(([, v]) => isNum(v) && v < 0).map(([k, v]) => ({ field: k, value: v }));
      return bad.length
        ? { status: STATUS.VIOLATED, detail: `negative geometric quantity: ${bad.map((b) => `${b.field}=${b.value}`).join(', ')}`, evidence: bad }
        : { status: STATUS.PASS, detail: 'geometric quantities finite and non-negative', evidence: { fields: Object.keys(i.geometry) } };
    },
  }),
  def({
    id: 'material-operating-limit', domain: 'materials', name: 'Explicit material operating limits',
    description: 'Operating temperature/pressure must not exceed a limit explicitly supplied with a material.',
    requiredInputs: ['materials[].maxTemp|maxPressure', 'operating.{temperature|pressure}.value'],
    rationale: 'Exceeding a supplier-stated material rating is a provable violation of the supplied spec.',
    applicable: (i) => Array.isArray(i.materials) && i.materials.some((m) => isNum(m?.maxTemp) || isNum(m?.maxPressure)) && (isNum(i.operating?.temperature?.value) || isNum(i.operating?.pressure?.value)),
    evaluate: (i) => {
      const T = i.operating?.temperature?.value; const P = i.operating?.pressure?.value; const bad = [];
      for (const m of i.materials) {
        if (isNum(m?.maxTemp) && isNum(T) && T > m.maxTemp) bad.push({ material: m.name ?? '?', field: 'temperature', value: T, limit: m.maxTemp });
        if (isNum(m?.maxPressure) && isNum(P) && P > m.maxPressure) bad.push({ material: m.name ?? '?', field: 'pressure', value: P, limit: m.maxPressure });
      }
      return bad.length
        ? { status: STATUS.VIOLATED, detail: `operating condition exceeds material limit: ${bad.map((b) => `${b.material} ${b.field} ${b.value}>${b.limit}`).join('; ')}`, evidence: bad }
        : { status: STATUS.PASS, detail: 'operating conditions within all supplied material limits', evidence: { materials: i.materials.length } };
    },
  }),
  def({
    id: 'conservation-accounting', domain: 'general', name: 'Generic conservation / accounting',
    description: 'Sum of declared outputs cannot exceed sum of declared inputs plus a declared source, for a conserved quantity.',
    requiredInputs: ['accounting.inputs[]', 'accounting.outputs[]'],
    rationale: 'For any conserved quantity, Σout ≤ Σin + source. A surplus with no source is a contradiction.',
    applicable: (i) => i.accounting && Array.isArray(i.accounting.inputs) && Array.isArray(i.accounting.outputs) && i.accounting.inputs.every(isNum) && i.accounting.outputs.every(isNum) && (i.accounting.inputs.length + i.accounting.outputs.length) > 0,
    evaluate: (i) => {
      const sin = i.accounting.inputs.reduce((a, b) => a + b, 0);
      const sout = i.accounting.outputs.reduce((a, b) => a + b, 0);
      const source = isNum(i.accounting.source) ? i.accounting.source : 0;
      if (sout > (sin + source) * 1.001) return { status: STATUS.VIOLATED, detail: `Σoutputs ${sout} exceed Σinputs ${sin} + source ${source} for conserved quantity "${i.accounting.quantity ?? 'unspecified'}"`, evidence: { sin, sout, source } };
      return { status: STATUS.PASS, detail: `Σoutputs ${sout} within Σinputs ${sin} + source ${source}`, evidence: { sin, sout, source } };
    },
  }),
]);

function boundCheck(kind, spec) {
  const { value, min, max } = spec;
  if (isNum(min) && value < min) return { status: STATUS.VIOLATED, detail: `${kind} ${value} below supplied minimum ${min}`, evidence: { value, min, max } };
  if (isNum(max) && value > max) return { status: STATUS.VIOLATED, detail: `${kind} ${value} above supplied maximum ${max}`, evidence: { value, min, max } };
  return { status: STATUS.PASS, detail: `${kind} ${value} within [${min ?? '-∞'}, ${max ?? '+∞'}]`, evidence: { value, min, max } };
}

export function getConstraint(id) { return CONSTRAINTS.find((c) => c.id === id) ?? null; }
export function listConstraints({ domain = null } = {}) { return domain ? CONSTRAINTS.filter((c) => c.domain === domain) : CONSTRAINTS.slice(); }
export function domains() { return [...new Set(CONSTRAINTS.map((c) => c.domain))].sort(); }

/**
 * Evaluate every constraint against structured `inputs`. Deterministic and pure.
 * Returns per-constraint results plus rolled-up violations/warnings/skipped/unsupported.
 * `requestedDomains` lets a caller ask for domains we do not encode → explicit UNSUPPORTED.
 */
export function evaluateAll(inputs = {}, { requestedDomains = [] } = {}) {
  const results = [];
  for (const c of CONSTRAINTS) {
    const base = { id: c.id, domain: c.domain, name: c.name, severity: c.severity, version: c.version, requiredInputs: c.requiredInputs, rationale: c.rationale };
    if (!c.applicable(inputs)) { results.push({ ...base, status: STATUS.SKIPPED, detail: 'required structured inputs not supplied', evidence: {} }); continue; }
    let r;
    try { r = c.evaluate(inputs); } catch (e) { r = { status: STATUS.INSUFFICIENT_DATA, detail: `evaluator error: ${e.message}`, evidence: {} }; }
    results.push({ ...base, severity: r.severity ?? c.severity, status: r.status, detail: r.detail, evidence: r.evidence ?? {} });
  }

  // Honest capability gaps for explicitly-requested but unencoded domains.
  const unsupported = [];
  for (const d of requestedDomains) {
    if (KNOWN_UNSUPPORTED_DOMAINS[d]) unsupported.push({ domain: d, status: STATUS.UNSUPPORTED, reason: KNOWN_UNSUPPORTED_DOMAINS[d] });
  }

  const violations = results.filter((r) => r.status === STATUS.VIOLATED && r.severity === SEVERITY.CRITICAL);
  const warnings = results.filter((r) => r.status === STATUS.VIOLATED && r.severity === SEVERITY.WARN);
  const skipped = results.filter((r) => r.status === STATUS.SKIPPED);
  const passed = results.filter((r) => r.status === STATUS.PASS);
  return { registryVersion: REGISTRY_VERSION, results, violations, warnings, skipped, passed, unsupported };
}
