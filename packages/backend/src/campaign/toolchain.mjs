/**
 * Rejestr Toolchain (P6/P7) — ponad Manifestem Zdolności. Każdy silnik naukowy
 * deklaruje realne metadane i przechodzi WALIDACJĘ referencyjną. Silnik jest
 * AVAILABLE tylko wtedy, gdy przechodzi realny przypadek referencyjny — samo
 * istnienie kodu/pakietu nie wystarcza (kontrakt zweryfikowanego adaptera).
 *
 * Ciężkie silniki zewnętrzne (dokowanie, MD, chemia kwantowa, ingestia białek,
 * ADMET, toksyczność) są tu rejestrowane obok RDKit. Dopóki żaden walidowany,
 * wykonywalny model nie istnieje dla danej zdolności — CAPABILITY_GAP. NIGDY
 * nie wypełniamy luki LLM-em ani heurystyką udającą walidowany model.
 */
import { detect as rdkitDetect, descriptors, transform } from '../compute/rdkitAdapter.mjs';
import * as qm from '../compute/qmAdapter.mjs';
import * as md from '../compute/mdAdapter.mjs';
import * as docking from '../compute/dockingAdapter.mjs';
import * as protein from '../compute/proteinAdapter.mjs';
import * as admet from '../compute/admetAdapter.mjs';
import * as meep from '../compute/meepAdapter.mjs';

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
 * Statyczne metadane narzędzi. Status jest USTALANY W RUNTIME przez walidację
 * (realny przypadek referencyjny). `validate` zwraca { status, version, evidence }.
 */
const TOOLS = [
  {
    toolId: 'rdkit',
    capabilityId: 'molecular-descriptors',
    domain: 'DRUG_DISCOVERY',
    engineName: 'RDKit',
    license: 'BSD-3-Clause',
    modelDomain: 'Cheminformatyka 2D (deskryptory, kanonizacja, transformacje reakcyjne, 3D embed).',
    assumptions: 'Wzory 2D + osadzenie 3D polami siłowymi; brak dokowania/dynamiki/QM.',
    evidenceClass: 'MODEL_ESTIMATE',
    validate: validateRdkit,
  },
  {
    toolId: 'pyscf',
    capabilityId: 'quantum-chemistry',
    domain: 'QUANTUM_CHEMISTRY',
    engineName: 'PySCF',
    license: 'Apache-2.0',
    modelDomain: 'Ab initio / DFT: energia single-point, HOMO/LUMO, dipol (małe cząsteczki).',
    assumptions: 'Wyniki małobazowe/semiempiryczne NIE są równoważne wysokopoziomowym ab initio; metoda+baza raportowane.',
    evidenceClass: 'MODEL_ESTIMATE',
    validate: validateQm,
  },
  {
    toolId: 'openmm',
    capabilityId: 'molecular-dynamics',
    domain: 'MOLECULAR_DYNAMICS',
    engineName: 'OpenMM',
    license: 'MIT/LGPL',
    modelDomain: 'Dynamika molekularna (pola AMBER/TIP3P), minimalizacja, NVT/NPT.',
    assumptions: 'Krótka trajektoria walidacyjna NIE mówi o stabilności biologicznej.',
    evidenceClass: 'MODEL_ESTIMATE',
    validate: validateMd,
  },
  {
    toolId: 'vina',
    capabilityId: 'molecular-docking',
    domain: 'MOLECULAR_DOCKING',
    engineName: 'AutoDock Vina + Meeko',
    license: 'Apache-2.0 / LGPL',
    modelDomain: 'Dokowanie sztywny receptor–elastyczny ligand; empiryczna funkcja oceny (kcal/mol).',
    assumptions: 'Score to MODEL_ESTIMATE, nigdy powinowactwo eksperymentalne ani deklaracja terapeutyczna. Kanoniczny benchmark białko-ligand wymaga struktury z RCSB (może być zablokowana przez egress).',
    evidenceClass: 'MODEL_ESTIMATE',
    validate: validateDocking,
  },
  {
    toolId: 'biopython',
    capabilityId: 'protein-structure-ingestion',
    domain: 'PROTEIN_STRUCTURE',
    engineName: 'Biopython',
    license: 'BSD',
    modelDomain: 'Ingestia i walidacja struktur PDB (łańcuchy, reszty, hetero, wody, altloc, brakujące atomy).',
    assumptions: 'Nigdy nie modyfikuje struktury po cichu; materialne decyzje przygotowawcze wymagają zatwierdzenia.',
    evidenceClass: 'DETERMINISTIC',
    validate: validateProtein,
  },
  {
    toolId: 'pymeep',
    capabilityId: 'maxwell-fdtd',
    domain: 'ELECTRODYNAMICS',
    engineName: 'PyMeep',
    license: 'GPL-2.0-or-later',
    modelDomain: 'Maxwell FDTD: normalne padanie w 1D na płaską, bezstratną granicę dielektryczną.',
    assumptions: 'Bieżący adapter obsługuje wyłącznie jawnie zadany interfejs n₁/n₂, 1D, polaryzację Ex i materiały bezstratne/niedyspersyjne. Nie jest ogólną elektromagnetyką 2D/3D ani modelem legendy Filadelfii.',
    evidenceClass: 'MODEL_ESTIMATE',
    validate: validateMeep,
  },
  {
    toolId: 'admet',
    capabilityId: 'admet-estimation',
    domain: 'ADMET',
    engineName: 'ADMET-AI (Chemprop D-MPNN ensembles)',
    license: 'MIT',
    modelDomain: 'ADMET ENDPOINT-SPECYFICZNE: absorption/distribution/metabolism/excretion (42 endpointy: HIA, Bioavailability, Caco2, PAMPA, Pgp, BBB, PPBR, VDss, CYP450×8, klirens, half-life…) + 11 deskryptorów fizykochemicznych. Wytrenowane i benchmarkowane na TDC ADMET Benchmark Group (Huang i in. 2021); Swanson i in. 2024, Bioinformatics.',
    assumptions: 'Zero „uniwersalnego ADMET score" — każdy endpoint ma własną opublikowaną metrykę TDC (AUROC/R²). Predykcje to MODEL_ESTIMATE probabilistyczne, nie dowód eksperymentalny. Wagi dołączone w pakiecie (bez sieci przy inferencji).',
    evidenceClass: 'MODEL_ESTIMATE',
    validate: validateAdmet,
  },
  {
    toolId: 'toxicity',
    capabilityId: 'toxicity-risk-estimation',
    domain: 'TOXICITY',
    engineName: 'ADMET-AI (Chemprop D-MPNN ensembles)',
    license: 'MIT',
    modelDomain: 'Toksyczność ENDPOINT-SPECYFICZNA (10 endpointów TDC: hERG, AMES, DILI, ClinTox, Carcinogens_Lagunin, LD50_Zhu, Skin_Reaction) + panel Tox21 (12 endpointów: NR/SR nuclear-receptor i stress-response).',
    assumptions: 'Nigdy SAFE/NON-TOXIC/CLINICALLY SAFE — tylko MODEL_ESTIMATE + RISK_SIGNAL z opublikowaną metryką TDC per endpoint. Ten sam silnik co ADMET (jeden zespół, wiele głów zadań), rozdzielony tu wyłącznie po kategorii endpointu.',
    evidenceClass: 'MODEL_ESTIMATE',
    validate: validateToxicity,
  },
];

/* ---------------- Walidatory (realne przypadki referencyjne) ---------------- */

function validateRdkit() {
  const d = rdkitDetect();
  if (!d.available) return { status: TOOL_STATUS.BLOCKED_BY_RUNTIME, reason: d.reason };
  const cases = [];
  const aspirin = descriptors('CC(=O)Oc1ccccc1C(=O)O');
  cases.push({ id: 'aspirin-logp', pass: aspirin.ok && Math.abs(aspirin.data.crippenLogP - 1.31) <= 0.1, expected: 1.31, actual: aspirin.ok ? aspirin.data.crippenLogP : null });
  const benz = transform('c1ccccc1', 'add-methyl');
  cases.push({ id: 'benzene-methylation', pass: benz.ok && benz.products.includes('Cc1ccccc1'), expectProduct: 'Cc1ccccc1' });
  const pass = cases.every((c) => c.pass);
  return { status: pass ? TOOL_STATUS.AVAILABLE : TOOL_STATUS.VALIDATION_FAILED, version: d.version, engine: `RDKit ${d.version}`, evidence: cases };
}

function validateQm() {
  const d = qm.detect();
  if (!d.available) return { status: TOOL_STATUS.BLOCKED_BY_RUNTIME, reason: d.reason };
  const r = qm.referenceCase();
  if (!r.ok) return { status: TOOL_STATUS.BLOCKED_BY_RUNTIME, reason: r.reason ?? r.error };
  const evidence = [{ id: r.case, pass: r.pass, expected: r.expected, actual: r.energyHartree, unit: 'Hartree' }];
  return { status: r.pass ? TOOL_STATUS.AVAILABLE : TOOL_STATUS.VALIDATION_FAILED, version: r.version, engine: `PySCF ${r.version}`, evidence };
}

function validateMd() {
  const d = md.detect();
  if (!d.available) return { status: TOOL_STATUS.BLOCKED_BY_RUNTIME, reason: d.reason };
  const r = md.referenceCase({ steps: 300 });
  if (!r.ok) return { status: TOOL_STATUS.BLOCKED_BY_RUNTIME, reason: r.reason ?? r.error };
  const evidence = [{ id: r.case, pass: r.pass, temperatureK: r.data.temperatureK, eInitial: r.data.potentialEnergyInitialKjmol, eMin: r.data.potentialEnergyMinimizedKjmol, platform: r.platform }];
  return { status: r.pass ? TOOL_STATUS.AVAILABLE : TOOL_STATUS.VALIDATION_FAILED, version: r.version, engine: `OpenMM ${r.version}`, evidence };
}

function validateDocking() {
  const d = docking.detect();
  if (!d.available) return { status: TOOL_STATUS.BLOCKED_BY_RUNTIME, reason: d.reason };
  const r = docking.referenceCase();
  if (!r.ok) return { status: TOOL_STATUS.BLOCKED_BY_RUNTIME, reason: r.reason ?? r.error };
  const evidence = [{ id: r.case, pass: r.pass, bestAffinityKcalMol: r.bestAffinityKcalMol, nPoses: r.nPoses, receptorKind: r.receptorKind, inputHash: r.inputHash }];
  return { status: r.pass ? TOOL_STATUS.AVAILABLE : TOOL_STATUS.VALIDATION_FAILED, version: `${r.vinaVersion}/${r.meekoVersion}`, engine: `AutoDock Vina ${r.vinaVersion} + Meeko ${r.meekoVersion}`, evidence };
}

function validateProtein() {
  const d = protein.detect();
  if (!d.available) return { status: TOOL_STATUS.BLOCKED_BY_RUNTIME, reason: d.reason };
  const r = protein.referenceCase();
  if (!r.ok) return { status: TOOL_STATUS.BLOCKED_BY_RUNTIME, reason: r.reason ?? r.error };
  const evidence = [{ id: r.case, pass: r.pass, chains: r.report.chains, aminoAcids: r.report.aminoAcids }];
  return { status: r.pass ? TOOL_STATUS.AVAILABLE : TOOL_STATUS.VALIDATION_FAILED, version: r.version, engine: `Biopython ${r.version}`, evidence };
}

// ADMET i toksyczność to JEDEN silnik (wiele głów zadań); dzielą ten sam realny
// przypadek referencyjny, więc nie uruchamiamy go dwukrotnie (~9 s ładowania modelu).
let admetReferenceCache = null;
function admetReferenceOnce() {
  if (!admetReferenceCache) admetReferenceCache = admet.referenceCase();
  return admetReferenceCache;
}

function validateMeep() {
  const d = meep.detect();
  if (!d.available) return { status: TOOL_STATUS.BLOCKED_BY_RUNTIME, reason: d.reason };
  const r = meep.referenceCase();
  if (!r.ok) return { status: TOOL_STATUS.BLOCKED_BY_RUNTIME, reason: r.reason ?? r.error };
  const evidence = [{
    id: r.case,
    pass: r.pass,
    expectedTransmittance: r.expectedTransmittance,
    actualTransmittance: r.actualTransmittance,
    tolerance: r.tolerance,
    energyClosure: r.data?.energyClosure ?? null,
  }];
  return { status: r.pass ? TOOL_STATUS.AVAILABLE : TOOL_STATUS.VALIDATION_FAILED, version: r.version, engine: `PyMeep ${r.version}`, evidence };
}

function validateAdmet() {
  const d = admet.detect();
  if (!d.available) return { status: TOOL_STATUS.BLOCKED_BY_RUNTIME, reason: d.reason };
  const r = admetReferenceOnce();
  if (!r.ok) return { status: TOOL_STATUS.BLOCKED_BY_RUNTIME, reason: r.reason ?? r.error };
  const evidence = [{ id: r.case, pass: r.pass, checks: r.checks, nEndpoints: r.nEndpoints }];
  return { status: r.pass ? TOOL_STATUS.AVAILABLE : TOOL_STATUS.VALIDATION_FAILED, version: r.version, engine: `ADMET-AI ${r.version}`, evidence };
}

function validateToxicity() {
  return validateAdmet();
}

/* ---------------- Cache walidacji (walidacja bywa kosztowna: MD/docking ~kilka s) ---------------- */

const validationCache = new Map();

function runValidation(tool) {
  if (validationCache.has(tool.toolId)) return validationCache.get(tool.toolId);
  let v;
  try {
    v = tool.validate();
  } catch (err) {
    v = { status: TOOL_STATUS.VALIDATION_FAILED, reason: String(err?.message ?? err).slice(0, 160) };
  }
  validationCache.set(tool.toolId, v);
  return v;
}

/** Do testów / odświeżenia: czyści cache walidacji. */
export function _resetValidation() { validationCache.clear(); admetReferenceCache = null; }

function present(tool) {
  const v = runValidation(tool);
  return {
    toolId: tool.toolId, capabilityId: tool.capabilityId, domain: tool.domain,
    engineName: tool.engineName, license: tool.license, modelDomain: tool.modelDomain,
    assumptions: tool.assumptions, evidenceClass: tool.evidenceClass,
    status: v.status, version: v.version ?? null, engine: v.engine ?? null,
    validation: v.evidence ?? null, reason: v.reason ?? null,
  };
}

export function listToolchain() {
  return TOOLS.map(present);
}

export function getTool(toolId) {
  const t = TOOLS.find((x) => x.toolId === toolId);
  return t ? present(t) : null;
}

/** Skrót: czy zdolność (po capabilityId) jest AVAILABLE (do decyzji orchestratora). */
export function capabilityAvailable(capabilityId) {
  const t = TOOLS.find((x) => x.capabilityId === capabilityId);
  return !!t && present(t).status === TOOL_STATUS.AVAILABLE;
}
