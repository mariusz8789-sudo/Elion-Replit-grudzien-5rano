import type { SourceEvidence } from './naturalProducts';
import type { TargetEvidenceRef } from './targetHypothesis';
import type { CuratedNaturalCandidate } from './naturalProductCandidatePool';

/**
 * CURATED GABA-A / BENZODIAZEPINE-SITE NATURAL CANDIDATE POOL.
 *
 * Reuses the EXACT `CuratedNaturalCandidate` contract from
 * naturalProductCandidatePool.ts, unchanged — this is a second, real DATA
 * pool for a different reference pharmacology (GABA-A / benzodiazepine
 * site, e.g. alprazolam), not a new schema.
 *
 * SCOPE HONESTLY DISCLOSED: this pool holds 6 real, named, individually
 * cited natural candidates, not 20. Every SMILES below was cross-checked
 * against this repository's real RDKit worker before being written here
 * (verified in this session; canonical output and formula match recorded).
 * Five candidates (apigenin, chrysin, honokiol, valerenic-acid, curcumin)
 * cite a real, well-documented publication to the best of Genesis's
 * training knowledge — but PubMed/PMID live lookup is blocked in this
 * runtime (the same disclosed limitation as PubChem/ChEMBL elsewhere in
 * this codebase), so citation text has NOT been independently re-verified
 * against a live bibliographic database in this run. The sixth (baicalein)
 * was added via Knowledge Pack #5 ingestion — a transmitted conversation
 * summary with NO PMID/DOI at all, weaker provenance than the other five;
 * see knowledgePack5.ts for that exact limitation. A scientist using this
 * pool should independently confirm every citation before relying on it.
 * "A pool of a handful of well-evidenced candidates is worth more here than
 * one of twenty asserted without citation" — the same discipline the
 * ketamine/NMDA pool already applies.
 *
 * WHAT THIS POOL DELIBERATELY INCLUDES:
 *  - three small-molecule flavonoids/lignans with real, published evidence
 *    of binding at (or positively modulating) the GABA-A receptor complex
 *    — apigenin, chrysin, honokiol;
 *  - one real natural compound (valerenic acid) with strong literature
 *    evidence of GABA-A modulation but NO independently verifiable
 *    stereo-structure Genesis will assert from memory — an honest
 *    capability gap, not an omission, exactly like conantokin-g/harmaline
 *    in the ketamine pool;
 *  - one NEGATIVE CONTROL (curcumin): a real, well-documented natural
 *    compound whose best-established mechanisms (NF-kB/COX-2 inhibition,
 *    Nrf2/antioxidant pathway) are unrelated to GABA-A receptor
 *    pharmacology, included specifically so mechanism-level falsification
 *    has something real to reject on target-mismatch grounds.
 */
export const GABA_BENZODIAZEPINE_POOL_VERSION = '1.0.0';

export const GABA_BENZODIAZEPINE_CANDIDATE_POOL: readonly CuratedNaturalCandidate[] = [
  {
    candidateKey: 'apigenin',
    compoundName: 'Apigenin',
    sourceOrganismOrOrigin: 'Widely distributed plant flavonoid (e.g. chamomile/Matricaria recutita flowers, parsley, celery).',
    naturalOccurrenceEvidence: [{
      kind: 'PEER_REVIEWED_LITERATURE',
      reference: 'Viola H, Wasowski C, Levi de Stein M, Wolfman C, Silveira R, Dajas F, Medina JH, Paladini AC. "Apigenin, a component of Matricaria recutita flowers, is a central benzodiazepine receptors-ligand with anxiolytic effects." Planta Med. 1995;61(3):213-216.',
      establishes: 'Identification of apigenin as a natural constituent of chamomile flowers and characterisation as a central benzodiazepine-receptor ligand.',
    } as SourceEvidence],
    mechanismEvidence: [{
      source: 'LITERATURE',
      identifier: 'Viola H, Wasowski C, Levi de Stein M, Wolfman C, Silveira R, Dajas F, Medina JH, Paladini AC. Planta Med. 1995;61(3):213-216.',
      establishes: 'Apigenin displaces radioligand binding at the central benzodiazepine receptor site and produces anxiolytic-like effects in rodent behavioural assays, reported WITHOUT the sedative, myorelaxant or amnestic effects seen with classical benzodiazepines at the doses tested.',
    } as TargetEvidenceRef],
    mechanismSummary: 'Reported central benzodiazepine-site ligand at the GABA-A receptor complex, with anxiolytic-like activity described as behaviourally dissociable from classical full benzodiazepine agonism (no reported sedation/myorelaxation at anxiolytic doses in the cited study).',
    reportedTargetFamily: 'GABA-A receptor (benzodiazepine binding site)',
    structure: { kind: 'SMILES_CROSS_VALIDATED', smiles: 'O=c1cc(-c2ccc(O)cc2)oc2cc(O)cc(O)c12', expectedFormula: 'C15H10O5' },
  },
  {
    candidateKey: 'chrysin',
    compoundName: 'Chrysin',
    sourceOrganismOrOrigin: 'Plant flavonoid (e.g. Passiflora coerulea/passionflower, honey, propolis).',
    naturalOccurrenceEvidence: [{
      kind: 'PEER_REVIEWED_LITERATURE',
      reference: 'Wolfman C, Viola H, Paladini A, Dajas F, Medina JH. "Possible anxiolytic effects of chrysin, a central benzodiazepine receptor ligand isolated from Passiflora coerulea." Pharmacol Biochem Behav. 1994;47(1):1-4.',
      establishes: 'Isolation of chrysin from Passiflora coerulea and identification as a central benzodiazepine receptor ligand.',
    } as SourceEvidence],
    mechanismEvidence: [{
      source: 'LITERATURE',
      identifier: 'Wolfman C, Viola H, Paladini A, Dajas F, Medina JH. Pharmacol Biochem Behav. 1994;47(1):1-4.',
      establishes: 'Chrysin binds the central benzodiazepine receptor site and shows anxiolytic-like activity in rodent models, reported at doses without the sedative/muscle-relaxant profile of classical benzodiazepines.',
    } as TargetEvidenceRef],
    mechanismSummary: 'Reported central benzodiazepine-site ligand at the GABA-A receptor complex; documented as a comparatively promiscuous flavonoid with other reported targets (e.g. aromatase inhibition) and known poor oral bioavailability.',
    reportedTargetFamily: 'GABA-A receptor (benzodiazepine binding site)',
    structure: { kind: 'SMILES_CROSS_VALIDATED', smiles: 'O=c1cc(-c2ccccc2)oc2cc(O)cc(O)c12', expectedFormula: 'C15H10O4' },
  },
  {
    candidateKey: 'honokiol',
    compoundName: 'Honokiol',
    sourceOrganismOrOrigin: 'Neolignan from Magnolia officinalis bark.',
    naturalOccurrenceEvidence: [{
      kind: 'PEER_REVIEWED_LITERATURE',
      reference: 'Kuribara H, Kishi E, Hattori N, Okada M, Maruyama Y. "The anxiolytic effect of two oriental herbal drugs in Japan attributed to honokiol from magnolia bark." J Pharm Pharmacol. 2000;52(11):1425-1429.',
      establishes: 'Honokiol identified as a Magnolia officinalis bark constituent responsible for anxiolytic-like activity of the crude bark extract.',
    } as SourceEvidence],
    mechanismEvidence: [{
      source: 'LITERATURE',
      identifier: 'Kuribara H, Kishi E, Hattori N, Okada M, Maruyama Y. J Pharm Pharmacol. 2000;52(11):1425-1429.',
      establishes: 'Honokiol reported to positively modulate GABA-A receptor-mediated activity and produce anxiolytic-like effects in rodent assays, reported without the diazepam-like sedative/motor-impairing side-effect profile.',
    } as TargetEvidenceRef],
    mechanismSummary: 'Reported positive modulator of GABA-A receptor activity; the specific binding site relative to the classical benzodiazepine site is not clearly established in the cited literature, and honokiol carries numerous other well-documented pharmacological targets (e.g. anti-inflammatory, anti-tumour pathways), making it a comparatively non-selective compound.',
    reportedTargetFamily: 'GABA-A receptor (positive modulation; benzodiazepine-site involvement not clearly established)',
    structure: { kind: 'SMILES_CROSS_VALIDATED', smiles: 'C=CCc1cc(-c2ccc(O)c(CC=C)c2)ccc1O', expectedFormula: 'C18H18O2' },
  },
  {
    candidateKey: 'valerenic-acid',
    compoundName: 'Valerenic acid',
    sourceOrganismOrOrigin: 'Sesquiterpene from Valeriana officinalis (valerian) root.',
    naturalOccurrenceEvidence: [{
      kind: 'PEER_REVIEWED_LITERATURE',
      reference: 'Khom S, Baburin I, Timin E, Hohaus A, Trauner G, Kopp B, Hering S. "Valerenic acid potentiates and inhibits GABA(A) receptors: molecular mechanism and subunit specificity." Neuropharmacology. 2007;53(1):178-187.',
      establishes: 'Valerenic acid identified as an active constituent of valerian root and characterised electrophysiologically at recombinant GABA-A receptors.',
    } as SourceEvidence],
    mechanismEvidence: [{
      source: 'LITERATURE',
      identifier: 'Khom S, Baburin I, Timin E, Hohaus A, Trauner G, Kopp B, Hering S. Neuropharmacology. 2007;53(1):178-187.',
      establishes: 'Valerenic acid reported to act at a subunit-specific site on GABA-A receptors (beta2/beta3-subunit-dependent), with the SAME study title explicitly reporting BOTH potentiation AND inhibition depending on receptor subunit composition — a genuinely direction-conflicting finding, not a single clean positive-modulator result.',
    } as TargetEvidenceRef],
    mechanismSummary: 'Reported GABA-A receptor modulator acting at a distinct, subunit-specific site (not the classical benzodiazepine alpha/gamma interface site); the cited literature itself reports direction-dependent (potentiating in some subunit contexts, inhibiting in others) effects — a real, disclosed directional conflict, not a clean single-direction match.',
    reportedTargetFamily: 'GABA-A receptor (beta-subunit-specific site, distinct from the classical benzodiazepine site)',
    structure: {
      kind: 'STRUCTURE_DECLINED',
      reason: 'Valerenic acid is a bicyclic sesquiterpene carboxylic acid with defined stereocentres. Genesis attempted to recall its SMILES and cross-validated the attempt against the real RDKit worker in this session: the recalled structure returned formula C13H20O2, not the correct C15H22O2 — Genesis will not assert an uncorrected, self-contradicted structure. PubChem/ChEMBL live lookup (which would supply a verified structure) is blocked in this runtime. This is a declared capability gap, not an assumed absence of structure.',
    },
  },
  {
    candidateKey: 'baicalein',
    compoundName: 'Baicalein',
    sourceOrganismOrOrigin: 'Flavone from Scutellaria baicalensis (Chinese/Baikal skullcap) root.',
    naturalOccurrenceEvidence: [{
      kind: 'PEER_REVIEWED_LITERATURE',
      reference: 'Added via Knowledge Pack #5 ingestion (transmitted conversation summary, no PMID/DOI attached): Scutellaria baicalensis named as the natural origin of baicalein and its reported GABA-A benzodiazepine-site activity.',
      establishes: 'Identification of baicalein as a Scutellaria baicalensis root constituent with reported GABA-A benzodiazepine-site activity. NOT independently checked against a primary paper — see knowledgePack5.ts for the exact provenance limitation.',
    } as SourceEvidence],
    mechanismEvidence: [{
      source: 'LITERATURE',
      identifier: 'knowledgePack5:Baicalein (transmitted summary, no PMID/DOI)',
      establishes: 'Reported Ki = 7.5 nM at a benzodiazepine-related GABA-A site, described by the source summary as HIGH comparability (same assay/target/mechanism family) and ~3x weaker than alprazolam. This value has NOT been independently checked against a primary paper in this runtime.',
    } as TargetEvidenceRef],
    mechanismSummary: 'Reported positive modulator at a benzodiazepine-related GABA-A site with a specific, transmitted Ki value — but sourced only from an unverified conversation summary (Knowledge Pack #5), not a checked primary citation, unlike apigenin/chrysin/honokiol above.',
    reportedTargetFamily: 'GABA-A receptor (benzodiazepine-related site)',
    structure: { kind: 'SMILES_CROSS_VALIDATED', smiles: 'O=c1cc(-c2ccccc2)oc2cc(O)c(O)c(O)c12', expectedFormula: 'C15H10O5' },
  },
  {
    candidateKey: 'curcumin',
    compoundName: 'Curcumin',
    sourceOrganismOrOrigin: 'Curcuminoid from Curcuma longa (turmeric) rhizome.',
    naturalOccurrenceEvidence: [{
      kind: 'PEER_REVIEWED_LITERATURE',
      reference: 'Aggarwal BB, Harikumar KB. "Potential therapeutic effects of curcumin, the anti-inflammatory agent, against neurodegenerative, cardiovascular, pulmonary, metabolic, autoimmune and neoplastic diseases." Int J Biochem Cell Biol. 2009;41(1):40-59.',
      establishes: 'Curcumin identified as the principal curcuminoid of Curcuma longa rhizome and reviewed for its established anti-inflammatory/antioxidant pharmacology.',
    } as SourceEvidence],
    mechanismEvidence: [{
      source: 'LITERATURE',
      identifier: 'Aggarwal BB, Harikumar KB. Int J Biochem Cell Biol. 2009;41(1):40-59.',
      establishes: 'Curcumin\'s best-established mechanisms are inhibition of NF-kB signalling and COX-2 activity and modulation of the Nrf2 antioxidant pathway — mechanisms unrelated to GABA-A receptor pharmacology.',
    } as TargetEvidenceRef],
    mechanismSummary: 'NEGATIVE CONTROL. Best-documented mechanisms are NF-kB/COX-2 inhibition and Nrf2-pathway antioxidant activity, not GABA-A receptor modulation — included to prove the falsification stage rejects a real natural product on real target-mismatch grounds, not only on missing data.',
    reportedTargetFamily: 'NF-kB signalling / COX-2 / Nrf2 antioxidant pathway',
    structure: { kind: 'SMILES_CROSS_VALIDATED', smiles: 'COc1cc(/C=C/C(=O)CC(=O)/C=C/c2ccc(O)c(OC)c2)ccc1O', expectedFormula: 'C21H20O6' },
  },
];
