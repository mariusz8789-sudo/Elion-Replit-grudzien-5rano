/**
 * ETAP 14 — "GIVE GENESIS A NAME OR A FORMULA".
 *
 * Turns what a person actually types — a drug name, a molecular formula, or a
 * SMILES string — into structures the discovery loop can start from.
 *
 * The three inputs are NOT equivalent, and treating them as if they were is
 * the main way this layer could lie:
 *
 *   SMILES   determines exactly one structure. No lookup needed.
 *   NAME     may resolve to one structure via a real public register
 *            (PubChem). Genesis has no internal drug dictionary and never
 *            guesses a structure from a name.
 *   FORMULA  DOES NOT determine a structure. C9H8O4 is aspirin, but it is also
 *            many other compounds. A formula therefore resolves to a SET of
 *            candidates or to nothing — never to a single molecule chosen by
 *            this module.
 *
 * Network access is reached through the repository's EXISTING allowlisted
 * proxy contract (`packages/backend/src/biotechProxy.mjs`, which permits only
 * PubChem PUG REST and ChEMBL). No new external surface is introduced here,
 * and where the network is unreachable the resolver reports NOT_AVAILABLE with
 * the real reason instead of falling back to a built-in table of answers.
 */
export const COMPOUND_RESOLVER_VERSION = '1.0.0';

export type CompoundInputKind = 'smiles' | 'name' | 'formula';

export interface CompoundInput {
  kind: CompoundInputKind;
  value: string;
}

export type ResolutionStatus =
  | 'RESOLVED_SINGLE'
  | 'RESOLVED_AMBIGUOUS'
  | 'NOT_FOUND'
  | 'NOT_AVAILABLE'
  | 'INVALID_INPUT';

export interface ResolvedStructure {
  canonicalSmiles: string;
  molecularFormula: string | null;
  /** Public identifier, when the register supplied one. */
  registryId: string | null;
  /** Where this came from — never blank. */
  source: 'USER_SUPPLIED' | 'PUBCHEM';
}

export interface CompoundResolution {
  status: ResolutionStatus;
  input: CompoundInput;
  structures: readonly ResolvedStructure[];
  /** Present for every non-RESOLVED_SINGLE outcome. */
  reason: string;
  /** Stated whenever the input cannot pin down one molecule. */
  ambiguityNote: string | null;
  /** Exact upstream URL used, for provenance. Null when no call was made. */
  sourceUrl: string | null;
}

/** PubChem PUG REST base — matches the allowlisted prefix in biotechProxy.mjs. */
const PUBCHEM_BASE = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound';
const PUBCHEM_PROPERTIES = 'SMILES,MolecularFormula';

export function pubchemNameUrl(name: string): string {
  return `${PUBCHEM_BASE}/name/${encodeURIComponent(name)}/property/${PUBCHEM_PROPERTIES}/JSON`;
}

/**
 * Formula search. `fastformula` returns EVERY compound with that formula,
 * which is the honest answer to a formula query — a list, not a molecule.
 */
export function pubchemFormulaUrl(formula: string, maxRecords: number): string {
  return `${PUBCHEM_BASE}/fastformula/${encodeURIComponent(formula)}/property/${PUBCHEM_PROPERTIES}/JSON?MaxRecords=${maxRecords}`;
}

/** Minimal transport so the resolver stays testable and network-agnostic. */
export interface CompoundLookupTransport {
  transportId: string;
  available(): { available: boolean; reason: string };
  fetchJson(url: string): { ok: true; body: unknown } | { ok: false; reason: string };
}

export const unavailableLookupTransport: CompoundLookupTransport = {
  transportId: 'none',
  available: () => ({ available: false, reason: 'No compound-lookup transport is configured; Genesis has no internal drug dictionary.' }),
  fetchJson: () => ({ ok: false, reason: 'no transport' }),
};

/**
 * Reads a PubChem PUG REST property table. Only entries carrying a usable
 * SMILES survive; anything else is dropped rather than repaired, so a partial
 * upstream response yields fewer real structures, never an invented one.
 */
export function readPubchemProperties(body: unknown): ResolvedStructure[] {
  if (typeof body !== 'object' || body === null) return [];
  const table = (body as { PropertyTable?: { Properties?: unknown } }).PropertyTable;
  const properties = table?.Properties;
  if (!Array.isArray(properties)) return [];

  const structures: ResolvedStructure[] = [];
  for (const entry of properties) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    // PubChem has used both `SMILES` and `CanonicalSMILES` over time.
    const smiles = typeof record.SMILES === 'string' ? record.SMILES
      : typeof record.CanonicalSMILES === 'string' ? record.CanonicalSMILES
        : null;
    if (smiles === null || smiles.length === 0) continue;
    structures.push({
      canonicalSmiles: smiles,
      molecularFormula: typeof record.MolecularFormula === 'string' ? record.MolecularFormula : null,
      registryId: typeof record.CID === 'number' ? `CID:${record.CID}` : null,
      source: 'PUBCHEM',
    });
  }
  return structures;
}

export interface ResolveOptions {
  /** Ceiling on structures returned for an ambiguous query (bounded work). */
  maxStructures?: number;
}

/**
 * Resolves one input to structures.
 *
 * A SMILES input never touches the network: it already is a structure, and is
 * marked USER_SUPPLIED because Genesis did not verify it against any register.
 */
export function resolveCompound(
  input: CompoundInput,
  transport: CompoundLookupTransport = unavailableLookupTransport,
  options: ResolveOptions = {},
): CompoundResolution {
  const maxStructures = options.maxStructures ?? 10;
  const value = input.value.trim();

  if (value.length === 0) {
    return { status: 'INVALID_INPUT', input, structures: [], reason: 'Empty input.', ambiguityNote: null, sourceUrl: null };
  }

  if (input.kind === 'smiles') {
    return {
      status: 'RESOLVED_SINGLE',
      input,
      structures: [{ canonicalSmiles: value, molecularFormula: null, registryId: null, source: 'USER_SUPPLIED' }],
      reason: '',
      ambiguityNote: 'Supplied directly by the caller and not checked against any register; validity is established later by the chemistry engine.',
      sourceUrl: null,
    };
  }

  const availability = transport.available();
  if (!availability.available) {
    return {
      status: 'NOT_AVAILABLE',
      input,
      structures: [],
      reason: `${input.kind === 'name' ? 'Name' : 'Formula'} lookup requires a public compound register: ${availability.reason}`,
      ambiguityNote: input.kind === 'formula'
        ? 'A molecular formula does not determine a structure in any case; a register would return a list of candidates, not one molecule.'
        : 'Genesis has no internal drug dictionary and will not guess a structure from a name.',
      sourceUrl: null,
    };
  }

  const url = input.kind === 'name' ? pubchemNameUrl(value) : pubchemFormulaUrl(value, maxStructures);
  const response = transport.fetchJson(url);
  if (!response.ok) {
    return { status: 'NOT_AVAILABLE', input, structures: [], reason: `Lookup failed: ${response.reason}`, ambiguityNote: null, sourceUrl: url };
  }

  const structures = readPubchemProperties(response.body).slice(0, maxStructures);
  if (structures.length === 0) {
    return { status: 'NOT_FOUND', input, structures: [], reason: `The register returned no usable structure for "${value}".`, ambiguityNote: null, sourceUrl: url };
  }

  // A formula query is ambiguous BY CONSTRUCTION, even when one hit comes back:
  // the register was asked for compounds with that composition, and the number
  // returned is a property of the register's coverage, not of chemistry.
  if (input.kind === 'formula') {
    return {
      status: 'RESOLVED_AMBIGUOUS',
      input,
      structures,
      reason: '',
      ambiguityNote: `A molecular formula does not determine a structure. ${structures.length} candidate structure(s) with this composition were returned; choosing among them requires evidence this lookup does not provide.`,
      sourceUrl: url,
    };
  }

  return {
    status: structures.length === 1 ? 'RESOLVED_SINGLE' : 'RESOLVED_AMBIGUOUS',
    input,
    structures,
    reason: '',
    ambiguityNote: structures.length === 1
      ? null
      : `The name "${value}" matched ${structures.length} records; a name can cover several salts, isomers or formulations.`,
    sourceUrl: url,
  };
}

/**
 * Seeds for a discovery run, taken from a resolution. Returns an empty list
 * rather than a guess when nothing resolved, so a failed lookup cannot silently
 * become an unseeded run that looks like it explored nothing.
 */
export function seedsFromResolution(resolution: CompoundResolution): readonly string[] {
  return resolution.structures.map((s) => s.canonicalSmiles);
}
