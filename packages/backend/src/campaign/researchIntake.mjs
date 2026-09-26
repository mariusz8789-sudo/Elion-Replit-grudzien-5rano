/**
 * GENESIS — Research Intake (governed intake between a user's research question and the
 * EXISTING candidate/campaign engines).
 *
 * This file adds NO second Drug Discovery engine, NO second campaign orchestrator, NO second
 * identity/PubChem/ChEMBL client, NO second Evidence source of truth. Every real computation is
 * delegated to what already exists:
 *   - identity/structure: `campaign/drugAdapter.mjs::canonicalize/describe` (RDKit-backed)
 *   - external source lookups: `biotechProxy.mjs::fetchBiotechSource` (the ONE allowlisted
 *     PubChem/ChEMBL egress path in this repo — no generic URL fetching, no scraping)
 *   - candidate identity pre-check: `campaign/scientificIntegration.mjs::candidateIdentityGuard`
 *   - bundled, hash-verified disease/target activity data: `campaign/glp1rDataset.mjs`,
 *     `campaign/giprQsar.mjs` (the ONLY two targets genuinely covered by bundled ChEMBL pins in
 *     this repo — CHEMBL1784/GLP-1R and CHEMBL4383/GIPR, both human-only, sha256-verified)
 *   - compute stages: `campaign/multiFidelity.mjs` (CHEAP/docking/QM/ADMET, fail-closed via
 *     `toolchain.mjs::capabilityAvailable`), `campaign/scientificIntegration.mjs::researchGateVerdict`
 *   - campaign persistence: `campaign/persistence.mjs::createCampaign/addCandidate` (the ONE
 *     campaign engine — this file never writes its own campaign/candidate table)
 *
 * What this file adds, and ONLY this: a governed intake layer that classifies a raw research
 * question, resolves its identity/target grounding HONESTLY (never inventing a structure, a
 * target, a mechanism, or an efficacy claim), classifies every candidate's origin, and produces
 * one canonical ResearchIntakeResult a caller can hand to the existing campaign engine.
 */
import { canonicalize as rdkitCanonicalize, describe as rdkitDescribe } from './drugAdapter.mjs';
import { candidateIdentityGuard } from './scientificIntegration.mjs';
import { loadGlp1rPin } from './glp1rDataset.mjs';
import { loadGiprPin } from './giprQsar.mjs';
import { capabilityAvailable } from './toolchain.mjs';
import { fetchBiotechSource } from '../biotechProxy.mjs';
import { sha256Hex16 } from '../provenance.mjs';
import { fingerprint as rdkitFingerprint } from '../compute/rdkitAdapter.mjs';

export const RESEARCH_INTAKE_CONTRACT_VERSION = '1.0.0';

export const INPUT_KINDS = Object.freeze([
  'DISEASE_OR_CONDITION',
  'BIOLOGICAL_TARGET',
  'COMPOUND_NAME',
  'CAS_NUMBER',
  'PUBCHEM_CID',
  'CHEMBL_ID',
  'MOLECULAR_FORMULA',
  'SMILES',
  'VACCINE_OR_BIOLOGIC_REQUEST',
]);

export const INTAKE_STATUS = Object.freeze([
  'RESOLVED',
  'PARTIALLY_RESOLVED',
  'BLOCKED_IDENTITY',
  'BLOCKED_TARGET',
  'BLOCKED_SOURCE',
  'BLOCKED_MODALITY',
  'CONFLICTING_IDENTITY',
  'UNSUPPORTED',
]);

export const CANDIDATE_ORIGIN = Object.freeze([
  'SOURCE_BACKED_KNOWN_COMPOUND',
  'USER_SUPPLIED_COMPOUND',
  'GENERATED_HYPOTHESIS',
  'UNRESOLVED',
]);

export const SYNTHESIS_READINESS = Object.freeze([
  'SOURCE_BACKED_SYNTHESIS_REFERENCE',
  'RETROSYNTHESIS_HYPOTHESIS',
  'SOURCE_REQUIRED',
  'SAFETY_REVIEW_REQUIRED',
  'BLOCKED',
]);

/* ============================================================================
 * BUNDLED TARGET REGISTRY — the ONLY disease/target groundings this intake layer may claim are
 * source-backed. Anything not listed here honestly returns BLOCKED_TARGET rather than a
 * fabricated grounding. See docs/GENESIS_RESEARCH_INTAKE_CONTRACT.md for the audit trail.
 * ============================================================================
 */
export const BUNDLED_TARGETS = Object.freeze({
  GLP1R: {
    key: 'GLP1R',
    targetChemblId: 'CHEMBL1784',
    label: 'GLP-1 receptor',
    organism: 'Homo sapiens',
    aliases: ['glp1r', 'glp-1r', 'glp-1 receptor', 'glucagon-like peptide-1 receptor', 'glp1 receptor'],
    loadPin: loadGlp1rPin,
  },
  GIPR: {
    key: 'GIPR',
    targetChemblId: 'CHEMBL4383',
    label: 'GIP receptor',
    organism: 'Homo sapiens',
    aliases: ['gipr', 'gip-r', 'gip receptor', 'glucose-dependent insulinotropic polypeptide receptor'],
    loadPin: loadGiprPin,
  },
});

/**
 * Explicit, narrow disease/condition -> bundled target keyword mapping. Every entry here is
 * backed by the SAME pharmacology this repo's own bundled tirzepatide/GLP-1R/GIPR comparator
 * dataset already documents (`campaign/tirzepatideBaseline.mjs`) — never invented for this file.
 * A disease/condition that does not match anything here honestly returns BLOCKED_TARGET.
 */
const DISEASE_TO_TARGET_KEYWORDS = Object.freeze([
  { pattern: /type\s*2\s*diabetes|t2dm|type\s*ii\s*diabetes/i, targets: ['GLP1R'] },
  { pattern: /\bobesity\b|weight\s*loss|weight\s*management/i, targets: ['GLP1R', 'GIPR'] },
]);

const VACCINE_KEYWORDS =
  /\b(vaccine|antibody|antibodies|monoclonal|mAb|biologic|biologics|peptide therapeutic|protein therapeutic|mRNA|siRNA|antigen|epitope|gene therapy|cell therapy|immunogen|nucleic[- ]acid therapeutic)\b/i;

const CHEMBL_ID_RE = /^CHEMBL\d+$/i;
const CAS_SHAPE_RE = /^(\d{2,7})-(\d{2})-(\d)$/;
const BARE_INTEGER_RE = /^\d{1,9}$/;
const FORMULA_RE = /^(?:[A-Z][a-z]?\d*){2,}$/;
const ELEMENT_SYMBOLS = new Set([
  'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar',
  'K', 'Ca', 'Br', 'I', 'Fe', 'Zn', 'Cu', 'Mn', 'Se', 'Sn',
]);

const CLINICAL_LANGUAGE_PATTERNS = [
  /\bdos(e|ing|age)\b/i,
  /\bmg\/kg\b/i,
  /\btitrat/i,
  /\bprescri(be|ption)\b/i,
  /\btreatment recommendation\b/i,
  /\bguaranteed (synthesis|yield)\b/i,
  /\bclinical(ly)? effective\b/i,
  /\bcures?\b/i,
  /\bsafe for human use\b/i,
  /\bproven (drug|cure)\b/i,
];

/** Throws if any forbidden clinical/dosing/efficacy-guarantee language appears — a real, enforced boundary, not a comment. */
export function assertNoClinicalLanguage(text) {
  const s = String(text ?? '');
  for (const pattern of CLINICAL_LANGUAGE_PATTERNS) {
    if (pattern.test(s)) {
      throw new Error(`RESEARCH_INTAKE_REJECTED: forbidden clinical/dosing/efficacy language (${pattern.source}): "${s}"`);
    }
  }
}

/** Real CAS Registry Number check-digit validation — a CAS-shaped string with a WRONG checksum is not a CAS number, regardless of regex shape. */
export function isValidCasChecksum(value) {
  const m = CAS_SHAPE_RE.exec(String(value ?? '').trim());
  if (!m) return false;
  const digits = (m[1] + m[2]).split('').map(Number);
  const checkDigit = Number(m[3]);
  let sum = 0;
  for (let i = 0; i < digits.length; i++) sum += digits[digits.length - 1 - i] * (i + 1);
  return sum % 10 === checkDigit;
}

function isPlausibleFormula(value) {
  const s = String(value ?? '').trim();
  if (!FORMULA_RE.test(s)) return false;
  const matches = [...s.matchAll(/([A-Z][a-z]?)(\d*)/g)].filter((m) => m[1]);
  if (matches.length < 2) return false;
  return matches.every((m) => ELEMENT_SYMBOLS.has(m[1]));
}

function matchBundledTargetLabel(value) {
  const s = String(value ?? '').trim().toLowerCase();
  if (s.length === 0) return null;
  for (const target of Object.values(BUNDLED_TARGETS)) {
    if (target.aliases.some((alias) => alias === s)) return target.key;
  }
  return null;
}

/**
 * Deterministic, non-LLM input-kind classification. `declaredInputKind` (if not 'AUTO') is
 * trusted as the caller's own declaration and never silently overridden — "never silently
 * reinterpret one modality as another."
 */
export function classifyResearchInput(originalQuery, declaredInputKind = 'AUTO') {
  const q = String(originalQuery ?? '').trim();
  if (declaredInputKind && declaredInputKind !== 'AUTO') {
    if (!INPUT_KINDS.includes(declaredInputKind)) {
      return { ok: false, reason: `Unknown declared input kind: ${declaredInputKind}` };
    }
    return { ok: true, inputKind: declaredInputKind, autoDetected: false, value: q };
  }
  if (q.length === 0) return { ok: false, reason: 'Empty research query.' };
  if (VACCINE_KEYWORDS.test(q)) return { ok: true, inputKind: 'VACCINE_OR_BIOLOGIC_REQUEST', autoDetected: true, value: q };
  if (CHEMBL_ID_RE.test(q)) return { ok: true, inputKind: 'CHEMBL_ID', autoDetected: true, value: q.toUpperCase() };
  if (CAS_SHAPE_RE.test(q)) return { ok: true, inputKind: 'CAS_NUMBER', autoDetected: true, value: q };
  if (BARE_INTEGER_RE.test(q)) return { ok: true, inputKind: 'PUBCHEM_CID', autoDetected: true, value: q };
  const smilesCheck = rdkitCanonicalize(q);
  if (smilesCheck.ok) return { ok: true, inputKind: 'SMILES', autoDetected: true, value: q };
  if (isPlausibleFormula(q)) return { ok: true, inputKind: 'MOLECULAR_FORMULA', autoDetected: true, value: q };
  if (matchBundledTargetLabel(q)) return { ok: true, inputKind: 'BIOLOGICAL_TARGET', autoDetected: true, value: q };
  if (DISEASE_TO_TARGET_KEYWORDS.some((e) => e.pattern.test(q))) {
    return { ok: true, inputKind: 'DISEASE_OR_CONDITION', autoDetected: true, value: q };
  }
  return { ok: true, inputKind: 'COMPOUND_NAME', autoDetected: true, value: q };
}

/* ============================================================================
 * IDENTITY RESOLUTION
 * ============================================================================
 */

function identityRecord(overrides) {
  return {
    canonicalIdentityId: null,
    originalInput: null,
    normalizedStructure: null,
    sourceUrl: null,
    sourceIdentifier: null,
    retrievedAt: null,
    checksum: null,
    aliases: [],
    status: 'BLOCKED_IDENTITY',
    reason: '',
    conflicts: [],
    ...overrides,
  };
}

/**
 * SMILES identity is resolved ENTIRELY offline. `candidateIdentityGuard` (the SAME reusable
 * pre-check every generated candidate already goes through before persistence) is the primary
 * guard; `rdkitDescribe` only layers on the additional formula/InChI fields this identity record
 * needs, on top of the already-guarded canonical SMILES.
 */
function resolveSmilesIdentity(smiles) {
  const guard = candidateIdentityGuard({ smiles });
  if (!guard.ok) {
    return identityRecord({
      originalInput: smiles,
      status: 'BLOCKED_IDENTITY',
      reason: `SMILES does not canonicalize: ${guard.message}`,
    });
  }
  const desc = rdkitDescribe(guard.canonicalSmiles);
  const normalizedStructure = desc.ok
    ? { smiles: guard.canonicalSmiles, formula: desc.data.molecularFormula, inchi: desc.data.inchi, inchiKey: desc.data.inchiKey }
    : { smiles: guard.canonicalSmiles, formula: null, inchi: null, inchiKey: null };
  return identityRecord({
    canonicalIdentityId: `rdkit:${guard.canonicalSmiles}`,
    originalInput: smiles,
    normalizedStructure,
    sourceUrl: null,
    sourceIdentifier: null,
    retrievedAt: null,
    checksum: null,
    status: 'RESOLVED',
    reason: 'Canonicalized and described by the local RDKit engine (via the existing candidateIdentityGuard pre-check) — no external source required for a caller-supplied structure.',
  });
}

/**
 * Formula alone is never a unique chemical identity — always the distinct 'PARTIAL' identity
 * status (never 'RESOLVED', and deliberately NOT 'BLOCKED_IDENTITY' either — a formula is real,
 * honest, partial information, not a failure to identify anything).
 */
function resolveFormulaIdentity(formula) {
  return identityRecord({
    originalInput: formula,
    normalizedStructure: { smiles: null, formula, inchi: null, inchiKey: null },
    status: 'PARTIAL',
    reason: 'A molecular formula alone does not uniquely identify a chemical structure (isomers share a formula). Provide a SMILES, CAS, PubChem CID, or ChEMBL ID for a unique identity.',
  });
}

function pubchemPropertyUrl(pathSegment) {
  return `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/${pathSegment}/property/CanonicalSMILES,MolecularFormula,InChI,InChIKey/JSON`;
}

function parsePubchemPropertyBody(body) {
  const row = body?.PropertyTable?.Properties?.[0];
  if (!row) return null;
  return {
    cid: row.CID ?? null,
    smiles: row.CanonicalSMILES ?? null,
    formula: row.MolecularFormula ?? null,
    inchi: row.InChI ?? null,
    inchiKey: row.InChIKey ?? null,
  };
}

/** Real, allowlisted PubChem lookup — never invents a structure when the source is unreachable or the compound is unknown. */
async function resolvePubchemIdentity(originalInput, pathSegment, sourceLabel) {
  const url = pubchemPropertyUrl(pathSegment);
  let result;
  try {
    result = await fetchBiotechSource(url);
  } catch (err) {
    return identityRecord({
      originalInput,
      sourceUrl: url,
      status: 'BLOCKED_SOURCE',
      reason: `PubChem lookup threw: ${String(err?.message ?? err).slice(0, 200)}`,
    });
  }
  if (result.status < 200 || result.status >= 300) {
    return identityRecord({
      originalInput,
      sourceUrl: url,
      status: 'BLOCKED_SOURCE',
      reason: `PubChem (${sourceLabel}) unreachable or compound not found — status ${result.status}, error ${result.body?.error ?? 'unknown'}.`,
    });
  }
  const parsed = parsePubchemPropertyBody(result.body);
  if (!parsed || !parsed.smiles) {
    return identityRecord({
      originalInput,
      sourceUrl: url,
      status: 'BLOCKED_SOURCE',
      reason: `PubChem (${sourceLabel}) returned no usable property record for "${originalInput}".`,
    });
  }
  return identityRecord({
    canonicalIdentityId: `pubchem:${parsed.cid}`,
    originalInput,
    normalizedStructure: { smiles: parsed.smiles, formula: parsed.formula, inchi: parsed.inchi, inchiKey: parsed.inchiKey },
    sourceUrl: url,
    sourceIdentifier: parsed.cid !== null ? String(parsed.cid) : null,
    retrievedAt: new Date().toISOString(),
    checksum: sha256Hex16(result.body),
    status: 'RESOLVED',
    reason: `Resolved from PubChem PUG-REST (${sourceLabel}).`,
  });
}

function resolveCompoundNameIdentity(name) {
  return resolvePubchemIdentity(name, `name/${encodeURIComponent(name)}`, 'name lookup');
}
function resolveCidIdentity(cid) {
  return resolvePubchemIdentity(cid, `cid/${encodeURIComponent(String(cid).replace(/^CID\s*:?\s*/i, ''))}`, 'CID lookup');
}
function resolveCasIdentity(cas) {
  if (!isValidCasChecksum(cas)) {
    return Promise.resolve(identityRecord({
      originalInput: cas,
      status: 'BLOCKED_IDENTITY',
      reason: 'CAS-shaped text failed its own check-digit validation — matching the regex shape alone is never accepted as a verified identity.',
    }));
  }
  return resolvePubchemIdentity(cas, `xref/RegistryID/${encodeURIComponent(cas)}`, 'CAS xref lookup');
}

async function resolveChemblIdentity(chemblId) {
  const url = `https://www.ebi.ac.uk/chembl/api/data/molecule/${encodeURIComponent(chemblId)}.json`;
  let result;
  try {
    result = await fetchBiotechSource(url);
  } catch (err) {
    return identityRecord({
      originalInput: chemblId,
      sourceUrl: url,
      status: 'BLOCKED_SOURCE',
      reason: `ChEMBL lookup threw: ${String(err?.message ?? err).slice(0, 200)}`,
    });
  }
  if (result.status < 200 || result.status >= 300) {
    return identityRecord({
      originalInput: chemblId,
      sourceUrl: url,
      status: 'BLOCKED_SOURCE',
      reason: `ChEMBL unreachable or molecule not found — status ${result.status}, error ${result.body?.error ?? 'unknown'}.`,
    });
  }
  const smiles = result.body?.molecule_structures?.canonical_smiles ?? null;
  if (!smiles) {
    return identityRecord({
      originalInput: chemblId,
      sourceUrl: url,
      status: 'BLOCKED_SOURCE',
      reason: `ChEMBL record for ${chemblId} carries no canonical SMILES.`,
    });
  }
  return identityRecord({
    canonicalIdentityId: `chembl:${chemblId}`,
    originalInput: chemblId,
    normalizedStructure: { smiles, formula: result.body?.molecule_properties?.full_molformula ?? null, inchi: null, inchiKey: result.body?.molecule_structures?.standard_inchi_key ?? null },
    sourceUrl: url,
    sourceIdentifier: chemblId,
    retrievedAt: new Date().toISOString(),
    checksum: sha256Hex16(result.body),
    status: 'RESOLVED',
    reason: 'Resolved from ChEMBL REST API.',
  });
}

/**
 * Resolves the identity of a classified, non-target/non-disease/non-vaccine input. Never invents
 * a structure: every non-SMILES path either produces a real, source-backed identity or an honest
 * BLOCKED_SOURCE/BLOCKED_IDENTITY status.
 */
export async function resolveIdentity(inputKind, value) {
  switch (inputKind) {
    case 'SMILES':
      return resolveSmilesIdentity(value);
    case 'MOLECULAR_FORMULA':
      return resolveFormulaIdentity(value);
    case 'CAS_NUMBER':
      return resolveCasIdentity(value);
    case 'PUBCHEM_CID':
      return resolveCidIdentity(value);
    case 'CHEMBL_ID':
      return resolveChemblIdentity(value);
    case 'COMPOUND_NAME':
      return resolveCompoundNameIdentity(value);
    default:
      return identityRecord({ originalInput: value, status: 'BLOCKED_IDENTITY', reason: `resolveIdentity does not handle input kind ${inputKind}.` });
  }
}

/**
 * Detects a genuine conflict between two independently resolved identities for the SAME
 * candidate (e.g. a user-supplied SMILES whose RDKit-computed formula disagrees with a
 * separately user-supplied formula). Both identities must themselves be resolved (not blocked)
 * for a conflict to be meaningful — an unresolved identity cannot "conflict."
 */
export function detectIdentityConflict(a, b) {
  if (!a || !b || a.status !== 'RESOLVED' || b.status !== 'RESOLVED') return null;
  const fa = a.normalizedStructure?.formula;
  const fb = b.normalizedStructure?.formula;
  if (fa && fb && fa !== fb) {
    return { field: 'formula', valueA: fa, valueB: fb, reason: `Declared identities disagree on molecular formula: ${fa} vs ${fb}.` };
  }
  const ka = a.normalizedStructure?.inchiKey;
  const kb = b.normalizedStructure?.inchiKey;
  if (ka && kb && ka !== kb) {
    return { field: 'inchiKey', valueA: ka, valueB: kb, reason: `Declared identities disagree on InChIKey: ${ka} vs ${kb}.` };
  }
  return null;
}

/* ============================================================================
 * DISEASE / TARGET GROUNDING
 * ============================================================================
 */

/**
 * Grounds a BIOLOGICAL_TARGET or DISEASE_OR_CONDITION input against the bundled target registry.
 * Returns `{ ok:false, reason }` (BLOCKED_TARGET territory) when nothing genuinely bundled
 * covers the input — this function never fabricates a target, mechanism, or binding claim.
 */
export function groundDiseaseOrTarget(inputKind, value) {
  const s = String(value ?? '').trim();
  if (inputKind === 'BIOLOGICAL_TARGET') {
    const key = matchBundledTargetLabel(s);
    if (!key) {
      return { ok: false, reason: `No bundled, source-backed activity data covers target "${s}". Only ${Object.keys(BUNDLED_TARGETS).join(', ')} are genuinely bundled in this repo.` };
    }
    return { ok: true, targetKeys: [key], sourceBacked: true, directTargetMatch: true, reason: `"${s}" matches the bundled ${BUNDLED_TARGETS[key].label} (${BUNDLED_TARGETS[key].targetChemblId}) activity pin.` };
  }
  if (inputKind === 'DISEASE_OR_CONDITION') {
    const entry = DISEASE_TO_TARGET_KEYWORDS.find((e) => e.pattern.test(s));
    if (!entry) {
      return { ok: false, reason: `No verified disease→target source in this repo covers "${s}". Genesis will not invent a disease mechanism or target for an uncovered condition.` };
    }
    return { ok: true, targetKeys: entry.targets, sourceBacked: true, directTargetMatch: false, reason: `"${s}" is mapped, via this repo's own bundled tirzepatide/GLP-1R/GIPR pharmacology comparator dataset, to ${entry.targets.map((k) => BUNDLED_TARGETS[k].label).join(' and ')}. This is a disease→target inference, not a direct target declaration.` };
  }
  return { ok: false, reason: `groundDiseaseOrTarget does not apply to input kind ${inputKind}.` };
}

/* ============================================================================
 * CANDIDATE DISCOVERY
 * ============================================================================
 */

/**
 * Candidate IDs are derived ENTIRELY from content, never a mutable counter — a global sequence
 * would make two independent runs over the same input produce different IDs (and therefore
 * different deterministic fingerprints) purely from call order, which is exactly the kind of
 * non-determinism `resolveResearchIntake`'s replay guarantee must not have.
 */
function contentCandidateId(prefix, content) {
  return `${prefix}-${sha256Hex16(content)}`;
}

function candidateDossier(overrides) {
  return {
    candidateId: null,
    origin: 'UNRESOLVED',
    identity: null,
    provenance: null,
    supportingEvidenceIds: [],
    conflictingEvidenceIds: [],
    missingInformation: [],
    safetyStatus: 'NOT_ASSESSED',
    computeStageStatus: { docking: 'NOT_REQUESTED', quantum: 'NOT_REQUESTED', admet: 'NOT_REQUESTED' },
    falsificationStatus: 'NOT_RUN',
    researchGateStatus: null,
    synthesisReadiness: null,
    computationalDossier: null,
    efficacyStatus: 'UNKNOWN',
    ...overrides,
  };
}

/** One source-backed computational dossier over the already-canonical molecule identity. */
export function buildComputationalCandidateDossier(identity, precomputedDescriptors = null) {
  const smiles = identity?.normalizedStructure?.smiles;
  if (!smiles) return { status: 'BLOCKED_IDENTITY', evidenceClass: 'UNKNOWN', limitations: ['A normalized structure is required before cheminformatics can execute.'] };
  const descriptors = precomputedDescriptors ?? rdkitDescribe(smiles);
  const fingerprint = rdkitFingerprint(smiles);
  if (!descriptors.ok || !fingerprint.ok) {
    return {
      status: 'BLOCKED_BY_RUNTIME', evidenceClass: 'UNKNOWN',
      limitations: [descriptors.reason ?? descriptors.error ?? fingerprint.reason ?? fingerprint.error ?? 'RDKit unavailable.'],
    };
  }
  const basis = {
    canonicalMoleculeId: identity.canonicalIdentityId,
    canonicalSmiles: fingerprint.canonicalSmiles,
    source: { sourceUrl: identity.sourceUrl, sourceIdentifier: identity.sourceIdentifier, checksum: identity.checksum },
    identityFingerprint: fingerprint.fingerprint,
    descriptors: descriptors.data,
    computationVersion: descriptors.engine,
  };
  return {
    status: 'COMPUTED',
    ...basis,
    rawOutputs: { morganRadius: 2, morganBits: fingerprint.nBits, bitVector: fingerprint.bits },
    derivedOutputs: descriptors.data,
    uncertainty: { kind: 'NOT_APPLICABLE_EXACT_ALGORITHM', note: 'Descriptors and fingerprint are deterministic calculations for the supplied structure.' },
    evidenceClass: 'COMPUTATIONAL',
    limitations: ['Cheminformatics identity and descriptors are not biological activity, safety, efficacy, or clinical evidence.'],
    replayIdentity: sha256Hex16(basis),
  };
}

/**
 * Pulls real, source-backed candidates from the bundled activity pin for each grounded target,
 * capped at `maxCandidates`. Every candidate's provenance is the pin row's OWN recorded source —
 * never re-derived or invented. Origin is always SOURCE_BACKED_KNOWN_COMPOUND.
 */
export function discoverBundledCandidates(targetKeys, maxCandidates) {
  const candidates = [];
  for (const key of targetKeys) {
    if (candidates.length >= maxCandidates) break;
    const target = BUNDLED_TARGETS[key];
    if (!target) continue;
    const pin = target.loadPin();
    if (!pin.ok) {
      candidates.push(candidateDossier({
        candidateId: contentCandidateId('unresolved', { target: key, code: pin.code }),
        origin: 'UNRESOLVED',
        missingInformation: [`Bundled activity pin for ${target.label} is unavailable: ${pin.code} — ${pin.reason}`],
      }));
      continue;
    }
    const remaining = maxCandidates - candidates.length;
    for (const row of pin.rows.slice(0, remaining)) {
      const desc = rdkitDescribe(row.canonicalSmiles);
      const identity = identityRecord({
        canonicalIdentityId: `chembl:${row.moleculeId}`,
        originalInput: row.moleculeId,
        normalizedStructure: {
          smiles: row.canonicalSmiles,
          formula: desc.ok ? desc.data.molecularFormula : null,
          inchi: desc.ok ? desc.data.inchi : null,
          inchiKey: desc.ok ? desc.data.inchiKey : null,
        },
        sourceUrl: row.sourceUrl ?? null,
        sourceIdentifier: row.moleculeId,
        retrievedAt: row.fetchedAt ?? null,
        checksum: pin.contentSha256,
        status: 'RESOLVED',
        reason: `Bundled, hash-verified ChEMBL activity row for ${target.label} (${target.targetChemblId}, ${target.organism}).`,
      });
      const computationalDossier = buildComputationalCandidateDossier(identity, desc);
      candidates.push(candidateDossier({
        candidateId: `known-${row.moleculeId}`,
        origin: 'SOURCE_BACKED_KNOWN_COMPOUND',
        identity,
        provenance: { sourceUrl: row.sourceUrl ?? null, sourceId: row.sourceId ?? row.moleculeId, retrievedAt: row.fetchedAt ?? null, targetChemblId: row.targetId ?? target.targetChemblId, pActivity: row.pActivity ?? null },
        computationalDossier,
        efficacyStatus: computationalDossier.status === 'COMPUTED' ? 'COMPUTATIONAL_HYPOTHESIS' : 'UNKNOWN',
      }));
    }
  }
  return candidates;
}

/** Wraps a single, directly resolved identity (SMILES/CID/CAS/ChEMBL/name) as one candidate. Origin depends on whether the caller supplied the structure directly or it came back from a real source lookup. */
export function candidateFromResolvedIdentity(identity, { userSuppliedStructure }) {
  const origin = identity.status !== 'RESOLVED' ? 'UNRESOLVED' : userSuppliedStructure ? 'USER_SUPPLIED_COMPOUND' : 'SOURCE_BACKED_KNOWN_COMPOUND';
  const missing = identity.status === 'RESOLVED' ? [] : [identity.reason];
  const computationalDossier = identity.status === 'RESOLVED' ? buildComputationalCandidateDossier(identity) : null;
  return candidateDossier({
    candidateId: contentCandidateId('direct', { id: identity.canonicalIdentityId, input: identity.originalInput, status: identity.status }),
    origin,
    identity,
    provenance: identity.sourceUrl ? { sourceUrl: identity.sourceUrl, sourceId: identity.sourceIdentifier, retrievedAt: identity.retrievedAt } : null,
    missingInformation: missing,
    computationalDossier,
    efficacyStatus: computationalDossier?.status === 'COMPUTED' ? 'COMPUTATIONAL_HYPOTHESIS' : 'UNKNOWN',
  });
}

/* ============================================================================
 * SYNTHESIS-READINESS BOUNDARY
 * ============================================================================
 */

/**
 * Classifies synthesis readiness WITHOUT ever generating an invented operational recipe.
 * `hasSourceBackedRoute`/`hasRetrosynthesisHypothesis` must be supplied by the caller from real,
 * disclosed information (e.g. a literature reference actually on hand) — this function never
 * infers either from a bare structure.
 */
export function classifySynthesisReadiness(candidate, { hasSourceBackedRoute = false, sourceReferenceUrl = null, hasRetrosynthesisHypothesis = false, safetyReviewRequired = true } = {}) {
  if (candidate.origin === 'UNRESOLVED') {
    return { classification: 'BLOCKED', reasons: ['Candidate identity is unresolved — no synthesis-readiness claim can be made.'] };
  }
  if (hasSourceBackedRoute) {
    if (!sourceReferenceUrl) {
      return { classification: 'SOURCE_REQUIRED', reasons: ['A source-backed route was claimed but no reference URL was supplied.'] };
    }
    return {
      classification: 'SOURCE_BACKED_SYNTHESIS_REFERENCE',
      reasons: [`Literature/reference route on file: ${sourceReferenceUrl}.`, safetyReviewRequired ? 'Safety and legal review is still required before any synthesis attempt.' : 'Safety/legal review already recorded.'],
    };
  }
  if (hasRetrosynthesisHypothesis) {
    return {
      classification: 'RETROSYNTHESIS_HYPOTHESIS',
      reasons: ['A high-level retrosynthesis hypothesis exists — not a guaranteed or validated route.', 'Requires independent validation before any real synthesis attempt.', 'No yield, dosing, or clinical-use claim is made.'],
    };
  }
  return { classification: 'SOURCE_REQUIRED', reasons: ['No source-backed route or retrosynthesis hypothesis is on file for this candidate.'] };
}

/* ============================================================================
 * VACCINE / BIOLOGIC MODALITY SEPARATION
 * ============================================================================
 */

export function buildModalityBlockedResult(request, classification) {
  return {
    contractVersion: RESEARCH_INTAKE_CONTRACT_VERSION,
    normalizedResearchQuestion: request.originalQuery,
    status: 'BLOCKED_MODALITY',
    inputKind: classification.inputKind,
    resolvedIdentity: null,
    resolvedGrounding: null,
    candidateMatrix: [],
    stageResults: {},
    provenance: [],
    evidenceReferences: [],
    conflictingEvidence: [],
    safetyVetoes: [],
    falsificationOutcomes: [],
    blockedCapabilities: ['SMALL_MOLECULE_PIPELINE_NOT_APPLICABLE'],
    selectedResearchPriorityCandidate: null,
    selectionExplanation: 'No small-molecule candidate pipeline applies to a vaccine/antibody/protein/peptide/nucleic-acid/biologic request.',
    nextExperiment: {
      requiredNextData: ['Antigen/target sequence from a verified source', 'Modality-appropriate specialist capability (immunogenicity/protein-structure engine) — not present in this repo today'],
      requiredSpecialistCapability: 'VACCINE_OR_BIOLOGIC_DESIGN_ENGINE (not implemented)',
      researchPlanPlaceholder: 'This request requires a biologic/vaccine-design capability this repo does not implement. Route to a specialist pipeline once one exists; do not run it through the small-molecule engine.',
    },
    synthesisReadiness: { classification: 'BLOCKED', reasons: ['Not applicable — this is a biologic/vaccine modality request, not a small-molecule synthesis question.'] },
    limitations: ['Genesis has no vaccine/antibody/protein/peptide/nucleic-acid design or immunogenicity-prediction engine.'],
    deterministicFingerprint: sha256Hex16({ v: RESEARCH_INTAKE_CONTRACT_VERSION, q: request.originalQuery, inputKind: classification.inputKind, status: 'BLOCKED_MODALITY' }),
    replayInputs: { originalQuery: request.originalQuery, declaredInputKind: request.declaredInputKind ?? 'AUTO' },
  };
}

/* ============================================================================
 * MAIN ORCHESTRATION — resolveResearchIntake
 * ============================================================================
 */

/**
 * Resolves one research question through the full governed intake pipeline. `db` is passed
 * through only for candidate-matrix/research-gate reads against an ALREADY-prepared campaign
 * (see `prepareCampaignDraft`); this function itself never writes to campaign persistence.
 */
export async function resolveResearchIntake(request) {
  if (!request || typeof request.originalQuery !== 'string' || request.originalQuery.trim() === '') {
    return unsupportedResult(request, 'originalQuery is required and must be non-empty.');
  }
  const maxCandidateBudget = clampBudget(request.maxCandidateBudget);

  const classification = classifyResearchInput(request.originalQuery, request.declaredInputKind ?? 'AUTO');
  if (!classification.ok) return unsupportedResult(request, classification.reason);

  if (classification.inputKind === 'VACCINE_OR_BIOLOGIC_REQUEST') {
    return buildModalityBlockedResult(request, classification);
  }

  if (classification.inputKind === 'BIOLOGICAL_TARGET' || classification.inputKind === 'DISEASE_OR_CONDITION') {
    const grounding = groundDiseaseOrTarget(classification.inputKind, classification.value);
    if (!grounding.ok) {
      return terminalResult(request, classification, 'BLOCKED_TARGET', null, grounding, [], grounding.reason);
    }
    const candidateMatrix = discoverBundledCandidates(grounding.targetKeys, maxCandidateBudget);
    for (const c of candidateMatrix) {
      c.synthesisReadiness = classifySynthesisReadiness(c, {});
    }
    const status = grounding.directTargetMatch ? 'RESOLVED' : 'PARTIALLY_RESOLVED';
    return terminalResult(request, classification, status, null, grounding, candidateMatrix, grounding.reason);
  }

  // Compound-identity paths: SMILES / MOLECULAR_FORMULA / CAS_NUMBER / PUBCHEM_CID / CHEMBL_ID / COMPOUND_NAME
  const identity = await resolveIdentity(classification.inputKind, classification.value);

  if (request.secondaryIdentifier && typeof request.secondaryIdentifier.inputKind === 'string') {
    const secondClassification = classifyResearchInput(request.secondaryIdentifier.value, request.secondaryIdentifier.inputKind);
    if (secondClassification.ok) {
      const secondIdentity = await resolveIdentity(secondClassification.inputKind, secondClassification.value);
      const conflict = detectIdentityConflict(identity, secondIdentity);
      if (conflict) {
        return terminalResult(request, classification, 'CONFLICTING_IDENTITY', identity, null, [], conflict.reason, [conflict]);
      }
    }
  }

  if (identity.status === 'PARTIAL') {
    // A molecular formula alone: real, honest, partial information — never RESOLVED, never a
    // silent BLOCKED either. The "candidate" it produces carries no structure and is UNRESOLVED
    // origin (see candidateFromResolvedIdentity), with the non-uniqueness reason surfaced as
    // missing information for the next-experiment summarizer.
    const candidate = candidateFromResolvedIdentity(identity, { userSuppliedStructure: false });
    candidate.synthesisReadiness = classifySynthesisReadiness(candidate, {});
    return terminalResult(request, classification, 'PARTIALLY_RESOLVED', identity, null, [candidate], identity.reason);
  }

  if (identity.status !== 'RESOLVED') {
    const status = identity.status === 'BLOCKED_SOURCE' ? 'BLOCKED_SOURCE' : 'BLOCKED_IDENTITY';
    return terminalResult(request, classification, status, identity, null, [], identity.reason);
  }

  const userSuppliedStructure = classification.inputKind === 'SMILES';
  const candidate = candidateFromResolvedIdentity(identity, { userSuppliedStructure });
  candidate.synthesisReadiness = classifySynthesisReadiness(candidate, {});
  return terminalResult(request, classification, 'RESOLVED', identity, null, [candidate], identity.reason);
}

function clampBudget(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 5;
  return Math.max(1, Math.min(50, Math.floor(n)));
}

function unsupportedResult(request, reason) {
  const originalQuery = request?.originalQuery ?? '';
  return {
    contractVersion: RESEARCH_INTAKE_CONTRACT_VERSION,
    normalizedResearchQuestion: originalQuery,
    status: 'UNSUPPORTED',
    inputKind: null,
    resolvedIdentity: null,
    resolvedGrounding: null,
    candidateMatrix: [],
    stageResults: {},
    provenance: [],
    evidenceReferences: [],
    conflictingEvidence: [],
    safetyVetoes: [],
    falsificationOutcomes: [],
    blockedCapabilities: [],
    selectedResearchPriorityCandidate: null,
    selectionExplanation: reason,
    nextExperiment: { requiredNextData: ['A well-formed research question or an explicit declaredInputKind.'], requiredSpecialistCapability: null, researchPlanPlaceholder: null },
    synthesisReadiness: { classification: 'BLOCKED', reasons: [reason] },
    limitations: [reason],
    deterministicFingerprint: sha256Hex16({ v: RESEARCH_INTAKE_CONTRACT_VERSION, q: originalQuery, status: 'UNSUPPORTED' }),
    replayInputs: { originalQuery, declaredInputKind: request?.declaredInputKind ?? 'AUTO' },
  };
}

function selectResearchPriorityCandidate(candidateMatrix) {
  const eligible = candidateMatrix.filter((c) => c.researchGateStatus?.verdict === 'RESEARCH_PRIORITY_ELIGIBLE');
  if (eligible.length === 0) return { winner: null, explanation: 'No candidate has passed the research gate (ELIGIBLE) yet — either compute stages were not run, or none currently qualify.' };
  return { winner: eligible[0].candidateId, explanation: `${eligible[0].candidateId} is the first RESEARCH_PRIORITY_ELIGIBLE candidate in matrix order (safety-assessed, no unresolved conflict, no ADMET rejection). This is a research-priority ranking only — never an efficacy or safety claim.` };
}

function deriveNextExperiment(status, candidateMatrix, groundingReason) {
  if (status === 'BLOCKED_TARGET' || status === 'BLOCKED_IDENTITY' || status === 'BLOCKED_SOURCE') {
    return { requiredNextData: [groundingReason], requiredSpecialistCapability: null, researchPlanPlaceholder: `Resolve the blocking issue above before candidate discovery can proceed: ${groundingReason}` };
  }
  const missing = candidateMatrix.flatMap((c) => c.missingInformation ?? []);
  if (missing.length > 0) {
    return { requiredNextData: [...new Set(missing)], requiredSpecialistCapability: null, researchPlanPlaceholder: 'Resolve the missing information for one or more candidates, then re-run compute stages.' };
  }
  const unassessed = candidateMatrix.filter((c) => c.researchGateStatus === null);
  if (unassessed.length > 0) {
    return { requiredNextData: [], requiredSpecialistCapability: null, researchPlanPlaceholder: `Run the compute pipeline (docking/QM/ADMET) for ${unassessed.length} candidate(s) not yet assessed, then re-check the research gate.` };
  }
  return { requiredNextData: [], requiredSpecialistCapability: null, researchPlanPlaceholder: 'All discovered candidates have been assessed. Consider expanding candidate discovery or requesting a broader target/disease grounding.' };
}

function terminalResult(request, classification, status, identity, grounding, candidateMatrix, explanation, conflicts = []) {
  for (const c of candidateMatrix) assertNoClinicalLanguage(JSON.stringify(c));
  const selection = status === 'RESOLVED' || status === 'PARTIALLY_RESOLVED' ? selectResearchPriorityCandidate(candidateMatrix) : { winner: null, explanation };
  const nextExperiment = deriveNextExperiment(status, candidateMatrix, explanation);
  const provenance = candidateMatrix.filter((c) => c.provenance).map((c) => ({ candidateId: c.candidateId, ...c.provenance }));
  const replayInputs = {
    originalQuery: request.originalQuery,
    declaredInputKind: request.declaredInputKind ?? 'AUTO',
    maxCandidateBudget: clampBudget(request.maxCandidateBudget),
  };
  const fingerprintBasis = {
    v: RESEARCH_INTAKE_CONTRACT_VERSION,
    q: request.originalQuery,
    inputKind: classification.inputKind,
    status,
    candidateIds: candidateMatrix.map((c) => c.candidateId).sort(),
    candidateSmiles: candidateMatrix.map((c) => c.identity?.normalizedStructure?.smiles ?? null).sort(),
    groundingTargets: grounding?.targetKeys ?? [],
  };
  return {
    contractVersion: RESEARCH_INTAKE_CONTRACT_VERSION,
    normalizedResearchQuestion: request.originalQuery,
    status,
    inputKind: classification.inputKind,
    resolvedIdentity: identity,
    resolvedGrounding: grounding,
    candidateMatrix,
    stageResults: {},
    provenance,
    evidenceReferences: candidateMatrix.flatMap((c) => c.supportingEvidenceIds),
    conflictingEvidence: conflicts,
    safetyVetoes: candidateMatrix.filter((c) => c.safetyStatus === 'VETOED').map((c) => c.candidateId),
    falsificationOutcomes: candidateMatrix.map((c) => ({ candidateId: c.candidateId, status: c.falsificationStatus })),
    blockedCapabilities: [],
    selectedResearchPriorityCandidate: selection.winner,
    selectionExplanation: selection.explanation,
    nextExperiment,
    synthesisReadiness: candidateMatrix[0]?.synthesisReadiness ?? { classification: 'BLOCKED', reasons: [explanation] },
    limitations: status.startsWith('BLOCKED') || status === 'CONFLICTING_IDENTITY' ? [explanation] : [],
    deterministicFingerprint: sha256Hex16(fingerprintBasis),
    replayInputs,
  };
}

/* ============================================================================
 * COMPUTE-STAGE WIRING (existing engines only — see multiFidelity.mjs)
 * ============================================================================
 */

/**
 * Bounded, single, cached capability check for each requested compute stage. Never installs,
 * builds, or probes an engine beyond one `capabilityAvailable` call — PySCF absence is fail-closed
 * and reported without blocking any other stage.
 */
export function checkRequestedComputeCapabilities(requestedComputeStages = {}) {
  const status = {};
  if (requestedComputeStages.docking) status.docking = capabilityAvailable('molecular-docking') ? 'AVAILABLE' : 'BLOCKED';
  if (requestedComputeStages.quantum) status.quantum = capabilityAvailable('quantum-chemistry') ? 'AVAILABLE' : 'BLOCKED';
  if (requestedComputeStages.admet) status.admet = capabilityAvailable('admet-estimation') ? 'AVAILABLE' : 'BLOCKED';
  return status;
}

/**
 * Prepares (creates) an existing-campaign-compatible draft for a RESOLVED/PARTIALLY_RESOLVED
 * research-intake result with at least one candidate. Delegates ENTIRELY to
 * `campaign/persistence.mjs::createCampaign`/`addCandidate` — no second campaign persistence
 * model. Does not run the campaign; running remains an explicit, separate, existing action
 * (`orchestrator.runCampaign` / the existing `POST .../campaigns/:id/start` route).
 */
export function prepareCampaignDraft(db, campaignStore, projectId, intakeResult, { createdBy = null } = {}) {
  if (intakeResult.status !== 'RESOLVED' && intakeResult.status !== 'PARTIALLY_RESOLVED') {
    return { ok: false, reason: `Cannot prepare a campaign draft from status ${intakeResult.status}.` };
  }
  const smilesCandidates = intakeResult.candidateMatrix.filter((c) => c.identity?.normalizedStructure?.smiles);
  if (smilesCandidates.length === 0) {
    return { ok: false, reason: 'No candidate in this intake result carries a resolved SMILES structure — nothing to seed a campaign with.' };
  }
  const startingSmiles = smilesCandidates.map((c) => c.identity.normalizedStructure.smiles).slice(0, 32);
  const campaign = campaignStore.createCampaign(db, {
    projectId,
    objective: `Research intake: ${intakeResult.normalizedResearchQuestion}`,
    domain: 'DRUG_DISCOVERY',
    objectiveVector: [],
    constraints: [],
    budget: { maxGenerations: 4, maxGeneratedCandidates: Math.max(startingSmiles.length, 8) },
    stopping: { patience: 3, minImprovement: 1e-4, diversityFloor: 0.05 },
    strategy: { startingSmiles, transformationWeights: {}, parentSelection: 'pareto' },
    createdBy,
  });
  return { ok: true, campaign, seededCandidateIds: smilesCandidates.map((c) => c.candidateId) };
}
