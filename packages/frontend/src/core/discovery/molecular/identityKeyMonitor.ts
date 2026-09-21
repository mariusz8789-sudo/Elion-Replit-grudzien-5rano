/**
 * D-108 — monitors the replicate-grouping identity key. Monitor-only.
 *
 * ==================== WHAT THIS DOES NOT DO ================================
 *
 * `replicateGroups()` (packages/backend/src/campaign/replicateGrouping.mjs,
 * D-091) keys replicate groups on the `canonicalSmiles` STRING. This module
 * never changes that key, never calls `replicateGroups`, and has no branch
 * that could feed InChIKey (or anything else) into a measurement. It exists
 * to answer one question a human needs answered before sealing a different
 * key: "on the data we actually have, does keying on the SMILES string ever
 * produce a different grouping than keying on chemical identity would?"
 *
 * ======================= WHY THIS EXISTS =====================================
 *
 * D-107 found `CHEMBL3616718` delivered with two byte-identical-length but
 * different canonical SMILES strings across two transmission attempts —
 * `Cc1c[nH]cn1` vs `Cc1cnc[nH]1`, the histidine imidazole tautomer written
 * two ways — sharing one InChIKey. Keying on the SMILES string could in
 * principle SPLIT a true replicate pair into two singleton groups, which is
 * the same downward bias that disqualified `molecule_chembl_id` as identity
 * (D-102/D-103): it would make the noise floor look artificially LOW by
 * hiding real disagreement inside groups that never form. D-107 measured
 * zero such collisions across the 306 usable structures at the time and
 * deliberately did NOT switch the key — switching would itself be a
 * methodology change made to move a number, the exact thing forbidden
 * throughout this campaign. This module makes that check repeatable as new
 * structures are added, instead of a one-off manual count.
 */

export interface IdentifiedStructure {
  readonly moleculeId: string;
  readonly canonicalSmiles: string;
  readonly inchiKey: string;
}

export interface TautomerCollision {
  readonly inchiKey: string;
  readonly canonicalSmilesVariants: readonly string[];
  readonly moleculeIds: readonly string[];
}

export interface IdentityKeyReport {
  readonly structureCount: number;
  readonly distinctCanonicalSmiles: number;
  readonly distinctInchiKeys: number;
  /** distinctCanonicalSmiles - distinctInchiKeys. Zero means the SMILES-keyed grouping cannot split any pair InChIKey would have merged. */
  readonly potentialGroupSplits: number;
  readonly collisions: readonly TautomerCollision[];
  readonly currentIdentityKey: 'canonicalSmiles';
  readonly recommendation: string;
}

/**
 * Reports whether canonicalSmiles and InChIKey disagree on identity across
 * the given structures. Pure function — no I/O, no mutation, safe to call on
 * every measurement without side effects.
 */
export function identityKeyCollisionReport(structures: readonly IdentifiedStructure[]): IdentityKeyReport {
  const byInchiKey = new Map<string, { smiles: Set<string>; ids: string[] }>();
  const distinctSmiles = new Set<string>();

  for (const s of structures) {
    distinctSmiles.add(s.canonicalSmiles);
    if (!byInchiKey.has(s.inchiKey)) byInchiKey.set(s.inchiKey, { smiles: new Set(), ids: [] });
    const entry = byInchiKey.get(s.inchiKey)!;
    entry.smiles.add(s.canonicalSmiles);
    entry.ids.push(s.moleculeId);
  }

  const collisions: TautomerCollision[] = [];
  for (const [inchiKey, entry] of byInchiKey) {
    if (entry.smiles.size > 1) {
      collisions.push({ inchiKey, canonicalSmilesVariants: [...entry.smiles].sort(), moleculeIds: entry.ids.sort() });
    }
  }
  collisions.sort((a, b) => a.inchiKey.localeCompare(b.inchiKey));

  const potentialGroupSplits = distinctSmiles.size - byInchiKey.size;

  return {
    structureCount: structures.length,
    distinctCanonicalSmiles: distinctSmiles.size,
    distinctInchiKeys: byInchiKey.size,
    potentialGroupSplits,
    collisions,
    currentIdentityKey: 'canonicalSmiles',
    recommendation:
      collisions.length === 0
        ? 'No InChIKey spans more than one canonicalSmiles in this data. The current SMILES-string identity key is not currently splitting any true replicate. No change is warranted by this evidence alone.'
        : `${collisions.length} InChIKey(s) span more than one canonicalSmiles — the current identity key may be splitting ${potentialGroupSplits} true replicate pair(s) into separate groups, which biases any noise floor computed on canonicalSmiles DOWNWARD (fewer, tighter groups than chemistry would form). This is evidence for a human seal to consider a key change (e.g. to InChIKey) in a NEW preregistration — this monitor does not make that change itself.`,
  };
}
