/**
 * Rejestr Toolchain (P6) — ponad Manifestem Zdolności. Każdy silnik naukowy
 * deklaruje realne metadane i przechodzi WALIDACJĘ referencyjną. Silnik jest
 * AVAILABLE tylko wtedy, gdy przechodzi realny przypadek referencyjny — samo
 * istnienie kodu nie wystarcza (kontrakt P8).
 */
import { detect, descriptors, transform } from '../compute/rdkitAdapter.mjs';

export const TOOL_STATUS = {
  AVAILABLE: 'AVAILABLE',
  UNVALIDATED: 'UNVALIDATED',
  CAPABILITY_GAP: 'CAPABILITY_GAP',
  BLOCKED_BY_RUNTIME: 'BLOCKED_BY_RUNTIME',
  BLOCKED_BY_LICENSE: 'BLOCKED_BY_LICENSE',
  BLOCKED_BY_RESOURCES: 'BLOCKED_BY_RESOURCES',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
};

/**
 * Statyczne metadane narzędzi. Status jest USTALANY W RUNTIME przez walidację.
 * Zaawansowane silniki (docking/MD/QM/ADMET…) to jawne luki (CAPABILITY_GAP) z
 * kontraktem adaptera — nigdy nie zwracają zmyślonych liczb.
 */
const TOOLS = [
  {
    toolId: 'rdkit',
    capabilityId: 'molecular-descriptors',
    domain: 'DRUG_DISCOVERY',
    engineName: 'RDKit',
    executable: 'python3 rdkit_worker.py',
    license: 'BSD-3-Clause',
    supportedInputs: ['SMILES'],
    supportedOutputs: ['crippenLogP', 'molWt', 'tpsa', 'hbd', 'hba', 'rotatableBonds', 'canonicalSmiles', 'SMARTS-reaction-transform', 'MorganTanimotoDiversity'],
    modelDomain: 'Cheminformatyka 2D (deskryptory, kanonizacja, transformacje reakcyjne).',
    assumptions: 'Wzory 2D; brak konformacji 3D, dokowania, dynamiki.',
    runtimeRequirements: 'python3 + rdkit (pip install rdkit)',
    resourceRequirements: 'CPU; krótki proces (<10 s/wywołanie).',
    referenceCases: [
      { id: 'aspirin-logp', input: 'CC(=O)Oc1ccccc1C(=O)O', property: 'crippenLogP', expected: 1.31, tol: 0.1 },
      { id: 'benzene-methylation', input: 'c1ccccc1', transformation: 'add-methyl', expectProduct: 'Cc1ccccc1' },
    ],
  },
];

/** Waliduje narzędzie realnym przypadkiem referencyjnym; zwraca status + dowody. */
function validateTool(tool) {
  if (tool.toolId !== 'rdkit') return { status: TOOL_STATUS.CAPABILITY_GAP, evidence: null };
  const d = detect();
  if (!d.available) return { status: TOOL_STATUS.BLOCKED_BY_RUNTIME, reason: d.reason, evidence: null };

  const results = [];
  for (const rc of tool.referenceCases) {
    if (rc.property) {
      const r = descriptors(rc.input);
      const val = r.ok ? r.data[rc.property] : null;
      const pass = val !== null && Math.abs(val - rc.expected) <= rc.tol;
      results.push({ id: rc.id, pass, expected: rc.expected, actual: val });
    } else if (rc.transformation) {
      const r = transform(rc.input, rc.transformation);
      const pass = r.ok && r.products.includes(rc.expectProduct);
      results.push({ id: rc.id, pass, expectProduct: rc.expectProduct, products: r.ok ? r.products : null });
    }
  }
  const allPass = results.length > 0 && results.every((x) => x.pass);
  return {
    status: allPass ? TOOL_STATUS.AVAILABLE : TOOL_STATUS.VALIDATION_FAILED,
    version: d.version, engine: `RDKit ${d.version}`, evidence: results,
  };
}

export function listToolchain() {
  return TOOLS.map((t) => {
    const v = validateTool(t);
    return { ...t, status: v.status, version: v.version ?? null, engine: v.engine ?? null, validation: v.evidence ?? null, reason: v.reason ?? null };
  });
}

export function getTool(toolId) {
  return listToolchain().find((t) => t.toolId === toolId) ?? null;
}
