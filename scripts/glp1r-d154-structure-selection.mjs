#!/usr/bin/env node
/**
 * D-154 — applies the FROZEN structure-selection rule to 7C2E and 7S15.
 *
 * The rule lives in packages/backend/src/campaign/glp1r-d154-structure-selection-prereg.json
 * and was committed alone (4252acf7) before this file existed. Nothing here chooses anything:
 * every threshold, every hard filter and the whole ranking order are transcribed from that file,
 * and the only thing this script does is read values out of the raw RCSB artefacts and compare.
 *
 * Every file it reads is sha256-checked against SOURCES.json first. A hash recorded by another
 * thread is a claim, not evidence, and a mismatch aborts.
 *
 * Usage:
 *   node scripts/glp1r-d154-structure-selection.mjs [--source-dir <dir>] [--source-ref <git ref>]
 *
 * --source-dir defaults to docs/evidence/source-data/glp1r-2026-10-03 in this repository.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { canonicalHash } from '../packages/backend/src/provenance.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const argOf = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const SRC = argOf('--source-dir', path.join(ROOT, 'docs/evidence/source-data/glp1r-2026-10-03'));
const SRC_REF = argOf('--source-ref', null);
/* Plumbing only (D-156): which decision this run seals, which candidates it reads, and where the
 * seal goes. No criterion is a flag — every threshold below stays a frozen constant read from
 * D-154's preregistration. The rule file itself is always D-154's. */
const DECISION_ID = argOf('--decision', 'D-154');
const CANDIDATE_PREREG_PATH = path.resolve(ROOT, argOf('--prereg', 'packages/backend/src/campaign/glp1r-d154-structure-selection-prereg.json'));
const PREREG_FROZEN_AT = argOf('--prereg-commit', '4252acf7');
const OUT_PATH = path.resolve(ROOT, argOf('--out', 'packages/backend/src/campaign/glp1r-d154-structure-selection.sealed.json'));
const PREREG_PATH = path.join(ROOT, 'packages/backend/src/campaign/glp1r-d154-structure-selection-prereg.json');

/* ------------------------------- frozen constants ------------------------------ */
const CANDIDATES = argOf('--candidates', '7C2E,7S15').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
const HUMAN_GLP1R_UNIPROT = 'P43220';   // E1
const MAX_RESOLUTION_A = 4.0;           // E2
const LIGAND_MIN_HEAVY_ATOMS = 10;      // R2
const LIGAND_MAX_HEAVY_ATOMS = 60;      // R2
/** The transmembrane region is taken from the structure's OWN Pfam annotation
 *  ("7 transmembrane receptor (Secretin family)"), not from any outside source, so E4 and E5
 *  are decided by the deposited record rather than by the author's reading of the literature. */
const TM_PFAM_NAME_FRAGMENT = '7 transmembrane receptor';

const fail = (code, reason) => {
  const out = { decisionId: DECISION_ID, outcome: 'BLOCKED_BY_SOURCE_DATA', code, reason };
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(out, null, 2)}\n`);
  console.error(`${code}: ${reason}`);
  process.exit(1);
};

const sha256File = (p) => createHash('sha256').update(fs.readFileSync(p)).digest('hex');

/* ------------------------- source integrity, before anything ------------------- */
const sourcesPath = path.join(SRC, 'SOURCES.json');
if (!fs.existsSync(sourcesPath)) fail('SOURCES_MANIFEST_MISSING', `no SOURCES.json under ${SRC}`);
const sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));
const declared = new Map((sources.files ?? []).map((f) => [f.path, f]));

const verifiedFiles = [];
function readVerified(relPath, { gzip = false } = {}) {
  const abs = path.join(SRC, relPath);
  if (!fs.existsSync(abs)) fail('SOURCE_FILE_MISSING', `${relPath} is not in the fetched source data`);
  const computed = sha256File(abs);
  const rec = declared.get(relPath);
  if (!rec) fail('SOURCE_NOT_IN_MANIFEST', `${relPath} exists but SOURCES.json does not declare it`);
  if (rec.sha256 !== computed) {
    fail('SOURCE_HASH_MISMATCH', `${relPath}: manifest says ${rec.sha256}, the bytes hash to ${computed}`);
  }
  verifiedFiles.push({
    path: relPath, sourceUrl: rec.sourceUrl, retrievedAt: rec.retrievedAt,
    httpStatus: rec.httpStatus ?? null, bytes: rec.bytes ?? null, sha256: computed,
  });
  const buf = fs.readFileSync(abs);
  return gzip ? zlib.gunzipSync(buf).toString('utf8') : buf.toString('utf8');
}

/* --------------------------------- extraction ---------------------------------- */
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Validation-report geometry, read from the wwPDB report itself rather than the entry summary. */
function validationMetrics(xml) {
  const attr = (name) => {
    const m = xml.match(new RegExp(`\\b${name}="([^"]*)"`));
    return m ? m[1] : null;
  };
  const f = (name) => {
    const v = attr(name);
    const n = v == null ? NaN : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    clashscore: f('clashscore'),
    percentRamachandranOutliers: f('percent-rama-outliers'),
    percentRotamerOutliers: f('percent-rota-outliers'),
    percentRSRZOutliers: f('percent-RSRZ-outliers'),
    reportSource: 'wwPDB validation report (XML), as fetched',
  };
}

/** Missing backbone residues: sequence positions of the GLP1R entity that no modelled residue
 *  covers, read from the mmCIF's own pdbx_poly_seq_scheme (PDB ins code '?' marks unmodelled). */
function missingResidues(cif, entityId) {
  const lines = cif.split('\n');
  const start = lines.findIndex((l) => l.trim() === '_pdbx_poly_seq_scheme.asym_id');
  if (start < 0) return null;
  // Collect the loop header in order, then the rows.
  let i = start;
  const cols = [];
  while (i < lines.length && lines[i].trim().startsWith('_pdbx_poly_seq_scheme.')) {
    cols.push(lines[i].trim().replace('_pdbx_poly_seq_scheme.', ''));
    i += 1;
  }
  const idxEntity = cols.indexOf('entity_id');
  const idxSeq = cols.indexOf('seq_id');
  const idxAuth = cols.indexOf('pdb_seq_num');
  if (idxEntity < 0 || idxSeq < 0 || idxAuth < 0) return null;
  const missing = [];
  const modelled = [];
  for (; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith('#') || line.trim() === '') break;
    const t = line.trim().split(/\s+/);
    if (t.length < cols.length) continue;
    if (t[idxEntity] !== String(entityId)) continue;
    const seq = Number(t[idxSeq]);
    if (!Number.isFinite(seq)) continue;
    if (t[idxAuth] === '?' || t[idxAuth] === '.') missing.push(seq);
    else modelled.push(seq);
  }
  return { missing, modelledCount: modelled.length, sequenceLength: missing.length + modelled.length };
}

/**
 * Heavy atoms of one non-polymer component, counted from the mmCIF's own atom_site loop:
 * the modelled atoms of that component in the first model, excluding hydrogen and deuterium.
 * The loop's column order is read from its header rather than assumed.
 */
function heavyAtomsOf(cif, compId) {
  const lines = cif.split('\n');
  const start = lines.findIndex((l) => l.trim() === '_atom_site.group_PDB');
  if (start < 0) return null;
  let i = start;
  const cols = [];
  while (i < lines.length && lines[i].trim().startsWith('_atom_site.')) {
    cols.push(lines[i].trim().replace('_atom_site.', ''));
    i += 1;
  }
  const iType = cols.indexOf('type_symbol');
  const iComp = cols.indexOf('label_comp_id');
  const iModel = cols.indexOf('pdbx_PDB_model_num');
  const iAlt = cols.indexOf('label_alt_id');
  if (iType < 0 || iComp < 0) return null;
  let firstModel = null;
  const seen = new Set();
  for (; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.startsWith('#')) break;
    if (line.trim() === '') continue;
    const t = line.trim().split(/\s+/);
    if (t.length < cols.length) continue;
    if (iModel >= 0) {
      if (firstModel == null) firstModel = t[iModel];
      if (t[iModel] !== firstModel) continue;
    }
    if (t[iComp] !== compId) continue;
    if (t[iType] === 'H' || t[iType] === 'D') continue;
    // One count per atom name, so an alternate conformation is not counted twice.
    const atomIdIdx = cols.indexOf('label_atom_id');
    const key = `${atomIdIdx >= 0 ? t[atomIdIdx] : t[1]}|${iAlt >= 0 ? '' : t[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
  }
  return seen.size > 0 ? seen.size : null;
}

function describe(pdbId) {
  const idLower = pdbId.toLowerCase();
  const entry = JSON.parse(readVerified(`rcsb/${pdbId}/entry.json`));
  const cif = readVerified(`rcsb/${pdbId}/${pdbId}.cif`);
  const report = validationMetrics(readVerified(`rcsb/${pdbId}/${idLower}_validation.xml.gz`, { gzip: true }));

  const info = entry.rcsb_entry_info ?? {};
  const resolutions = Array.isArray(info.resolution_combined) ? info.resolution_combined.filter((x) => num(x) != null) : [];
  const resolution = resolutions.length ? Math.min(...resolutions) : null;

  // Polymer entities: whichever files the fetch recorded for this entry.
  const polymerPaths = (sources.files ?? [])
    .filter((f) => f.path.startsWith(`rcsb/${pdbId}/polymer_entity_`))
    .map((f) => f.path).sort();
  const polymers = polymerPaths.map((p) => {
    const d = JSON.parse(readVerified(p));
    const align = d.rcsb_polymer_entity_align ?? [];
    const features = d.rcsb_polymer_entity_feature ?? [];
    const tm = features.find((x) => x.type === 'Pfam' && String(x.name ?? '').includes(TM_PFAM_NAME_FRAGMENT));
    const tmRange = tm?.feature_positions?.[0]
      ? { begSeqId: tm.feature_positions[0].beg_seq_id, endSeqId: tm.feature_positions[0].end_seq_id, annotation: tm.name }
      : null;
    const mutationPositions = features
      .filter((x) => x.type === 'mutation')
      .flatMap((x) => (x.feature_positions ?? []).map((fp) => fp.beg_seq_id))
      .filter((x) => Number.isFinite(x))
      .sort((a, b) => a - b);
    return {
      entityFile: p,
      entityId: d.rcsb_polymer_entity_container_identifiers?.entity_id ?? null,
      description: d.rcsb_polymer_entity?.pdbx_description ?? null,
      authChains: d.rcsb_polymer_entity_container_identifiers?.auth_asym_ids ?? null,
      sequenceLength: d.entity_poly?.rcsb_sample_sequence_length ?? null,
      uniprotAccessions: align.map((a) => a.reference_database_accession).filter(Boolean),
      sourceOrganisms: (d.rcsb_entity_source_organism ?? []).map((o) => o.scientific_name).filter(Boolean),
      mutationsText: d.rcsb_polymer_entity?.pdbx_mutation ?? null,
      mutationPositions,
      transmembraneRegion: tmRange,
    };
  });

  const nonpolymerPaths = (sources.files ?? [])
    .filter((f) => f.path.startsWith(`rcsb/${pdbId}/nonpolymer_entity_`))
    .map((f) => f.path).sort();
  const nonpolymers = nonpolymerPaths.map((p) => {
    const d = JSON.parse(readVerified(p));
    const compId = d.rcsb_nonpolymer_entity_container_identifiers?.nonpolymer_comp_id ?? null;
    const heavyAtoms = compId ? heavyAtomsOf(cif, compId) : null;
    return {
      entityFile: p,
      compId,
      description: d.rcsb_nonpolymer_entity?.pdbx_description ?? null,
      formulaWeightKDa: d.rcsb_nonpolymer_entity?.formula_weight ?? null,
      copies: d.rcsb_nonpolymer_entity?.pdbx_number_of_molecules ?? null,
      heavyAtomsFromCif: heavyAtoms,
    };
  });

  const glp1r = polymers.find((p) => p.uniprotAccessions.includes(HUMAN_GLP1R_UNIPROT)) ?? null;
  const gaps = glp1r?.entityId ? missingResidues(cif, glp1r.entityId) : null;
  const tm = glp1r?.transmembraneRegion ?? null;
  const inTm = (seq) => tm != null && seq >= tm.begSeqId && seq <= tm.endSeqId;

  return {
    pdbId,
    title: entry.struct?.title ?? null,
    experimentalMethod: (entry.exptl ?? []).map((e) => e.method),
    emReconstructionMethod: (entry.em_3d_reconstruction ?? []).map((e) => e.method).filter(Boolean),
    resolutionAngstrom: resolution,
    resolutionsReported: resolutions,
    initialReleaseDate: entry.rcsb_accession_info?.initial_release_date ?? null,
    latestRevisionDate: entry.rcsb_accession_info?.revision_date ?? null,
    revisionCount: (entry.pdbx_audit_revision_history ?? []).length,
    polymerEntityCount: info.polymer_entity_count ?? null,
    nonpolymerEntityCount: info.nonpolymer_entity_count ?? null,
    polymers,
    nonpolymers,
    validationReport: report,
    glp1rEntity: glp1r
      ? {
        entityId: glp1r.entityId, authChains: glp1r.authChains, sequenceLength: glp1r.sequenceLength,
        sourceOrganisms: glp1r.sourceOrganisms, mutationsText: glp1r.mutationsText,
        mutationPositions: glp1r.mutationPositions,
        mutationPositionsInTransmembrane: glp1r.mutationPositions.filter(inTm),
        transmembraneRegion: tm,
        missingBackboneResidues: gaps ? gaps.missing : null,
        missingBackboneResidueCount: gaps ? gaps.missing.length : null,
        missingBackboneResiduesInTransmembrane: gaps ? gaps.missing.filter(inTm) : null,
        modelledResidueCount: gaps ? gaps.modelledCount : null,
      }
      : null,
    // Receptor state, read from the record itself: a bound heterotrimeric G protein or a
    // G-protein-mimetic is what the deposited entry offers as evidence of an active state.
    receptorStateEvidence: {
      partnerChains: polymers
        .filter((p) => !p.uniprotAccessions.includes(HUMAN_GLP1R_UNIPROT))
        .map((p) => p.description),
      titleSaysComplex: /complex|-gs\b|gs\b/i.test(entry.struct?.title ?? ''),
    },
  };
}

/* -------------------------------- the frozen rule ------------------------------- */
function eligibility(c) {
  const g = c.glp1rEntity;
  const partners = c.receptorStateEvidence.partnerChains.join(' ; ');
  const gProteinPresent = /\bG\s*protein|guanine nucleotide-binding|G\(s\)|Gs alpha|GNAS/i.test(partners);
  const checks = [
    {
      id: 'E1_isHumanGlp1r',
      ok: Boolean(g) && g.sourceOrganisms.some((o) => /Homo sapiens/i.test(o)),
      observed: g ? `UniProt ${HUMAN_GLP1R_UNIPROT} present, organism ${g.sourceOrganisms.join('/')}` : 'no polymer entity maps to P43220',
    },
    {
      id: 'E2_resolution',
      ok: c.resolutionAngstrom != null && c.resolutionAngstrom <= MAX_RESOLUTION_A,
      observed: c.resolutionAngstrom == null ? 'UNKNOWN' : `${c.resolutionAngstrom} A against a ${MAX_RESOLUTION_A} A ceiling`,
    },
    {
      id: 'E3_activeState',
      ok: gProteinPresent,
      observed: gProteinPresent
        ? `active-state evidence in the record: ${partners}`
        : `no G protein or G-protein mimetic among the other chains (${partners || 'receptor only'})`,
    },
    {
      id: 'E4_pocketIntegrity',
      ok: Boolean(g?.transmembraneRegion) && Array.isArray(g.missingBackboneResiduesInTransmembrane) && g.missingBackboneResiduesInTransmembrane.length === 0,
      observed: g?.transmembraneRegion
        ? `${g.missingBackboneResiduesInTransmembrane?.length ?? 'UNKNOWN'} missing backbone residue(s) inside ${g.transmembraneRegion.begSeqId}-${g.transmembraneRegion.endSeqId}`
        : 'UNKNOWN: no transmembrane annotation in the deposited record',
    },
    {
      id: 'E5_noPocketMutation',
      ok: Boolean(g?.transmembraneRegion) && g.mutationPositionsInTransmembrane.length === 0,
      observed: g?.transmembraneRegion
        ? `${g.mutationPositionsInTransmembrane.length} engineered mutation(s) inside ${g.transmembraneRegion.begSeqId}-${g.transmembraneRegion.endSeqId}${g.mutationPositionsInTransmembrane.length ? ` at ${g.mutationPositionsInTransmembrane.join(', ')}` : ''}`
        : 'UNKNOWN: no transmembrane annotation in the deposited record',
    },
  ];
  return { checks, eligible: checks.every((x) => x.ok), failed: checks.filter((x) => !x.ok).map((x) => x.id) };
}

const smallMoleculeLigand = (c) => c.nonpolymers.find((n) => n.heavyAtomsFromCif != null
  && n.heavyAtomsFromCif >= LIGAND_MIN_HEAVY_ATOMS && n.heavyAtomsFromCif <= LIGAND_MAX_HEAVY_ATOMS) ?? null;

/* ----------------------------------- run it ------------------------------------ */
const prereg = JSON.parse(fs.readFileSync(PREREG_PATH, 'utf8'));
const candidatePrereg = JSON.parse(fs.readFileSync(CANDIDATE_PREREG_PATH, 'utf8'));
const preregFingerprint = canonicalHash(candidatePrereg).slice(0, 16);
const ruleFileSha256 = createHash('sha256').update(fs.readFileSync(PREREG_PATH)).digest('hex');
// A candidate list that is not the one frozen in the decision's own preregistration aborts.
const frozenList = candidatePrereg.candidateSet?.frozenList ?? ['7C2E', '7S15'];
if (JSON.stringify([...frozenList].sort()) !== JSON.stringify([...CANDIDATES].sort())) {
  fail('CANDIDATE_LIST_MISMATCH', `run asked for ${CANDIDATES.join(',')}, ${DECISION_ID} froze ${frozenList.join(',')}`);
}
if (candidatePrereg.theRule?.ruleFileSha256 && candidatePrereg.theRule.ruleFileSha256 !== ruleFileSha256) {
  fail('RULE_FILE_CHANGED', `${DECISION_ID} froze rule sha256 ${candidatePrereg.theRule.ruleFileSha256}, the file now hashes to ${ruleFileSha256}`);
}

const described = CANDIDATES.map(describe);
const assessed = described.map((c) => ({ ...c, eligibility: eligibility(c), smallMoleculeLigand: smallMoleculeLigand(c) }));
const eligible = assessed.filter((c) => c.eligibility.eligible);

let outcome;
let selected = null;
const rankingTrace = [];
if (eligible.length === 0) {
  outcome = 'NO_STRUCTURE_SELECTED';
} else if (eligible.length === 1) {
  outcome = 'STRUCTURE_SELECTED';
  selected = eligible[0];
  rankingTrace.push({ step: 'no ranking needed', detail: `only ${selected.pdbId} passed every hard filter` });
} else {
  const key = (c) => [
    c.glp1rEntity.missingBackboneResidueCount ?? Number.MAX_SAFE_INTEGER,   // R1
    smallMoleculeLigand(c) ? 0 : 1,                                          // R2
    c.resolutionAngstrom,                                                    // R3
    c.glp1rEntity.mutationPositions.length,                                  // R4
    c.validationReport.clashscore ?? Number.MAX_SAFE_INTEGER,                // R5
    c.pdbId,                                                                 // R6
  ];
  const sorted = [...eligible].sort((a, b) => {
    const ka = key(a); const kb = key(b);
    for (let i = 0; i < ka.length; i += 1) {
      if (ka[i] < kb[i]) return -1;
      if (ka[i] > kb[i]) return 1;
    }
    return 0;
  });
  sorted.forEach((c) => rankingTrace.push({ pdbId: c.pdbId, key: key(c) }));
  outcome = 'STRUCTURE_SELECTED';
  [selected] = sorted;
}

const sealed = {
  decisionId: DECISION_ID,
  preregFingerprint,
  preregFrozenAtCommit: PREREG_FROZEN_AT,
  ruleFrom: { file: path.relative(ROOT, PREREG_PATH), sha256: ruleFileSha256, frozenAtCommit: '4252acf7' },
  computedAt: new Date().toISOString(),
  sourceData: {
    dir: path.relative(ROOT, SRC) || SRC,
    gitRef: SRC_REF,
    manifest: 'SOURCES.json, as fetched by the ingest thread',
    filesVerified: verifiedFiles.length,
    allHashesMatched: true,
    files: verifiedFiles,
  },
  frozenRule: {
    humanGlp1rUniprot: HUMAN_GLP1R_UNIPROT,
    maxResolutionAngstrom: MAX_RESOLUTION_A,
    ligandHeavyAtomWindow: [LIGAND_MIN_HEAVY_ATOMS, LIGAND_MAX_HEAVY_ATOMS],
    transmembraneRegionFrom: `the structure's own Pfam annotation containing "${TM_PFAM_NAME_FRAGMENT}"`,
    rankingOrder: ['R1 missing backbone residues', 'R2 non-peptidic ligand in window', 'R3 resolution', 'R4 construct mutations', 'R5 clashscore', 'R6 PDB id'],
  },
  candidates: assessed.map((c) => ({
    pdbId: c.pdbId,
    title: c.title,
    experimentalMethod: c.experimentalMethod,
    emReconstructionMethod: c.emReconstructionMethod,
    resolutionAngstrom: c.resolutionAngstrom,
    initialReleaseDate: c.initialReleaseDate,
    latestRevisionDate: c.latestRevisionDate,
    revisionCount: c.revisionCount,
    polymerEntityCount: c.polymerEntityCount,
    nonpolymerEntityCount: c.nonpolymerEntityCount,
    glp1rEntity: c.glp1rEntity,
    otherChains: c.receptorStateEvidence.partnerChains,
    nonpolymers: c.nonpolymers,
    smallMoleculeLigandInWindow: c.smallMoleculeLigand,
    validationReport: c.validationReport,
    eligibility: c.eligibility,
  })),
  rankingTrace,
  outcome,
  selected: selected
    ? {
      pdbId: selected.pdbId,
      pocketDefinedFromPeptideContext: smallMoleculeLigand(selected) == null,
      mandatoryLimitation: smallMoleculeLigand(selected) == null
        ? 'POCKET_DEFINED_FROM_PEPTIDE_CONTEXT — no non-peptidic component of 10-60 heavy atoms sits in this structure, so it may not be used to rank small molecules without a separate decision.'
        : null,
    }
    : null,
  whatThisDoesNotLicense: prereg.mandatoryLimitationOnTheResult.whatSelectionDoesNotLicense,
  defaultDockingTarget: 'ABL1_1IEP — unchanged by this decision',
};
sealed.artifactHash = canonicalHash(sealed).slice(0, 16);
fs.writeFileSync(OUT_PATH, `${JSON.stringify(sealed, null, 2)}\n`);

for (const c of sealed.candidates) {
  console.log(`\n${c.pdbId}  ${c.resolutionAngstrom} A  ${c.experimentalMethod.join('/')}  — ${c.title}`);
  for (const chk of c.eligibility.checks) console.log(`  ${chk.ok ? 'PASS' : 'FAIL'}  ${chk.id}: ${chk.observed}`);
  console.log(`  ligand in window: ${c.smallMoleculeLigandInWindow ? `${c.smallMoleculeLigandInWindow.compId} (${c.smallMoleculeLigandInWindow.heavyAtomsFromCif} heavy atoms)` : 'none'}`);
  console.log(`  validation: clashscore ${c.validationReport.clashscore}, rama outliers ${c.validationReport.percentRamachandranOutliers}%`);
}
console.log(`\nOUTCOME: ${outcome}${selected ? ` -> ${selected.pdbId}` : ''}`);
console.log(`sealed -> ${path.relative(ROOT, OUT_PATH)} (${sealed.artifactHash}), ${verifiedFiles.length} files hash-verified`);
