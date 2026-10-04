import json,statistics,hashlib,os,datetime
M=json.load(open("combined.json"))
import os as _os
# Repository root, derived from this file: a hard-coded absolute path named the machine
# the script happened to run on and broke every other checkout (D-168).
REPO=_os.path.abspath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", ".."))
B=sorted([p for p in M if M[p]["classification"]=="B_SAMPLING_FAILURE"])
S=[p for p in M if M[p]["success_run3"]]
A=[p for p in M if M[p]["classification"]=="A_RANKING_FAILURE"]

CAUSE={
"1GKC":"The deposited ligand is TWO HETATM residues joined by a covalent bond: BUM A1449 (12 heavy atoms) -C ... N- BUM L1448 (10 heavy atoms), C-N distance 1.35 A. The preregistered ligand rule ('the HETATM residue in chain L') takes only BUM L1448, so 10 of 22 heavy atoms are docked. The docked SMILES is CNC(=O)[C@@H](N)C(C)(C)C - a tert-leucine N-methylamide fragment, not the hydroxamate inhibitor. Its crystal-pose Vina score is -2.548 kcal/mol, the worst of all 85 cases. A 10-atom fragment in an open MMP groove has no unique energetic minimum; the RMSD is meaningless as a sampling measurement.",
"1GM8":"Rigid-fragment RMSD floor 1.064 A (lower bound). SOX is the ring-opened penicilloate with a saturated thiazolidine and a sulfoxide stereocentre; the single ETKDGv3+MMFF conformer's internal geometry cannot be superposed on the crystal geometry to better than 1.064 A even with every torsion set perfectly, and Vina cannot change intra-fragment geometry. The relaxed crystal pose also scores 1.843 kcal/mol WORSE than Vina rank 1, so both barriers are present.",
"1HVY":"Relaxed crystal pose is 1.405 kcal/mol worse than Vina rank 1 (-7.606 vs -9.011). D16 is an antifolate whose glutamate tail (two carboxylic acids, prepared neutral) binds an arginine cluster; crystal-pose ligand efficiency -0.226 kcal/mol per heavy atom is the 4th worst of 85. The UMP cofactor IS kept. No waters within 5 A, no dropped residue, box margin 4.158 A, no clash (min lig-receptor heavy distance 2.63 A). The native pose is simply not the Vina optimum here.",
"1KE5":"Relaxed crystal pose and Vina rank 1 are within scoring noise (-9.086 vs -8.697; delta -0.389 kcal/mol). Geometric floor 0.169 A, box margin 4.432 A, no clash, 4 waters within 3.5 A of the ligand (CDK2 hinge). Nothing structural is missing; the two basins are near-degenerate under the Vina function and the search returned the other one.",
"1L7F":"Relaxed crystal pose 0.495 kcal/mol BETTER than Vina rank 1 but the native basin was not returned in 20 modes. BCZ is a neuraminidase transition-state analogue with a guanidine and a carboxylic acid, both prepared neutral (3 neutral base groups, 1 neutral acid); the real complex is a salt bridge network. 3 bridging waters. Floor 0.401 A.",
"1MEH":"Relaxed crystal pose 0.769 kcal/mol worse than Vina rank 1. This is the one case of the 17 where the receptor cleaner demonstrably drops a residue lining the site: CSO A319 (S-hydroxy-cysteine) has its nearest heavy atom 4.32 A from the ligand and is recorded in run 3 as cofactorsNotKept with reason no_ccd_template_with_7_heavy_atoms - so neither the ATOM path nor the cofactor path keeps it. The IMP cofactor IS kept. 3 waters within 3.5 A. Geometric floor 0.742 A.",
"1MMV":"Relaxed crystal pose 0.919 kcal/mol worse than Vina rank 1. 3AR is N-omega-propyl-L-arginine, the only formally charged (+1) ligand among the 17 as prepared; its guanidinium stacks on the haem. HEM (43 heavy atoms) and BH4 ARE kept as rigid cofactors, so the cofactor is not missing. Floor 0.062 A, no clash, no waters within 5 A. The failure is that Vina's charge-blind function does not reward the cation-haem/Glu592 electrostatics that define the pose.",
"1Q41":"Rigid-fragment RMSD floor 1.654 A - the largest of all 85 cases, and the only one above 1.3 A. IXM (indirubin-3'-monoxime) has ZERO rotatable bonds and just 2 rigid fragments, so the pose is fully determined by the ETKDGv3+MMFF internal geometry of the bis-indolinone/oxime system; that geometry is 1.654 A (lower bound) from the crystal geometry before any docking happens. Delta_opt is only -0.341 kcal/mol, so the energetics are near-degenerate; the barrier is geometric, not energetic, and no amount of search can cross it.",
"1R58":"Relaxed crystal pose 1.838 kcal/mol worse than Vina rank 1. The ligand's hydroxamate-like group coordinates TWO manganese ions at 2.29 and 2.34 A (the shortest ligand-receptor heavy-atom distances in the whole set after the metals are included). Both Mn are kept, but as bare AD4 metal atoms: Vina's scoring function has no metal-coordination term, so the single interaction that fixes the pose contributes almost nothing. Crystal-pose relaxation drift 0.08 A - the pose fits the rigid receptor perfectly, it just does not score.",
"1SQ5":"Relaxed crystal pose 1.069 kcal/mol worse than Vina rank 1. PAU is pantothenate: 15 heavy atoms, 6 rotatable bonds, 40% polar, one carboxylic acid prepared neutral. The ADP cofactor IS kept. Crystal-pose Vina score -4.583 kcal/mol, 6th worst of 85. A small, very flexible, very polar ligand whose native pose the Vina function does not distinguish.",
"1T9B":"Relaxed crystal pose 2.059 kcal/mol worse than Vina rank 1 and the crystal-pose ligand efficiency, -0.198 kcal/mol per heavy atom, is the SECOND WORST of all 85 cases for a 23-heavy-atom ligand. The FAD cofactor (53 heavy atoms) IS kept. 1CS is a chlorsulfuron-type sulfonylurea bound in the long AHAS substrate channel; Vina scores the crystal pose at -4.548 kcal/mol, essentially indistinguishable from a generic channel position, which is why the search ends 5.799 A away - the worst of the 17.",
"1TT1":"Near-degenerate: delta_opt -0.160 kcal/mol. KAI is kainate, a zwitterion in reality (two carboxylic acids and a secondary amine, all prepared neutral) bound in the GluR2 ligand-binding cleft, where the pose is set entirely by ion pairs. Floor 0.438 A, no waters, no dropped residue, no clash.",
"1TZ8":"Near-degenerate: delta_opt +0.213 kcal/mol. DES (diethylstilbestrol) is an almost apolar, pseudo-symmetric ligand (polar fraction 0.100) in the oestrogen-receptor pocket; the crystal pose and a flipped pose are within scoring noise. Floor 0.094 A, 2 bridging waters, one glycerol at 4.82 A (dropped as an additive, too far to matter).",
"1U4D":"Near-degenerate: delta_opt +0.226 kcal/mol. DBQ has ZERO acyclic rotatable bonds but Meeko opens a flexible ring (two G0 ring-closure pseudo-atoms in the ligand PDBQT), so the effective degrees of freedom are not what the rotatable-bond count suggests. Floor 0.437 A. Highly polar (0.389), three neutral basic nitrogens.",
"1W1P":"Relaxed crystal pose 0.933 kcal/mol worse than Vina rank 1. GIO is an 11-heavy-atom rigid bicyclic fragment (0 rotatable bonds); its crystal-pose Vina score is -4.425 kcal/mol, 4th worst of 85 - too weak a signal for the function to locate. Two glycerol molecules sit 2.56 and 3.76 A from the ligand and are dropped as crystallisation additives; they occupy part of the site the docked fragment can wander into. No waters within 5 A.",
"1YVF":"The only case of the 17 where the relaxed crystal pose is more than 0.5 kcal/mol BETTER than anything the search returned (-8.616 vs -7.998; delta_opt -0.618) - i.e. a genuinely better-scoring native basin existed and 32-exhaustiveness/20-mode search did not visit it. Floor 0.877 A (high, but below the 1.0 A class threshold), 2 bridging waters, one glycerol at 3.73 A dropped.",
"2BM2":"Near-degenerate: delta_opt -0.377 kcal/mol. PM2 is a 30-heavy-atom, 6-rotatable-bond thrombin/factor-Xa-type ligand with a benzylamine (prepared neutral) that should be an ammonium engaging the S1 aspartate. Floor 0.673 A, 3 waters within 3.5 A, no dropped residue, no clash.",
}

CLASSDEF={
"C1_LIGAND_DEFINITION_TRUNCATED":"The deposited ligand spans more than one HETATM residue joined by a covalent bond, and the preregistered ligand rule (chain L, or the single residue carrying the listed code) takes only one of them, so a fragment is docked instead of the inhibitor.",
"C2_FIXED_INTERNAL_GEOMETRY_FLOOR":"The rigid-fragment RMSD floor of the single ETKDGv3+MMFF conformer is >= 1.0 A. Vina never changes intra-fragment geometry, so the crystal RMSD cannot go below that floor no matter how the search behaves.",
"C3_SCORING_FUNCTION_PREFERS_A_NON_NATIVE_POSE":"The crystal pose, locally minimised in the prepared rigid receptor, scores MORE THAN 0.5 kcal/mol WORSE than the pose Vina ranked first. The search did its job: the native pose is not the optimum of the Vina function in this receptor representation. More search effort cannot recover these.",
"C4_NEAR_DEGENERATE_BASINS":"The locally minimised crystal pose and the Vina rank-1 pose are within +/-0.5 kcal/mol of each other. The native basin carries no decisive energetic advantage, so which one the search returns is close to a coin flip.",
"C5_TRUE_SEARCH_FAILURE":"The locally minimised crystal pose scores MORE THAN 0.5 kcal/mol BETTER than the pose Vina ranked first, yet no pose within 2.0 A appears in the 20 modes. This is the only pattern for which 'the search failed' is the literal explanation.",
}

def d(key,g):
    v=[M[p][key] for p in g]
    return {"n":len(v),"min":round(min(v),3),"median":round(statistics.median(v),3),"mean":round(statistics.mean(v),3),"max":round(max(v),3)}

groups={"successes_run3":S,"B_sampling_failures":B,"A_ranking_failures":A}
dists={k:{g:d(k,gg) for g,gg in groups.items()} for k in
       ["rotBonds","heavyAtoms","rigidFragmentRmsdFloorA","deltaOptMinusRank1","deltaXtalMinusRank1",
        "crystalPoseVinaTotal","ligandEfficiencyXtal","worstBoxMarginA","minLigRecHeavyDistA",
        "watersWithin5A","bridgingWaters","crystalPoseRelaxDriftA","mismatchedIonisable","polarFraction",
        "crystalPoseRelaxDriftA"]}

per=[]
for p in B:
    r=M[p]
    per.append({
      "pdbId":p,"class":r["phase2bClass"],"bestRmsdInTop20A":r["bestRmsdInTopKA"],
      "run3Top1RmsdA":r["rmsd_run3"],"nearMiss":r["bestRmsdInTopKA"]<2.5,
      "ligandSmilesAsDocked":r["ligandSmiles"],"heavyAtoms":r["heavyAtoms"],
      "rotatableBonds":r["rotBonds"],"formalChargeAsPrepared":r["formalCharge"],
      "neutralIonisableGroups":{"acidic":r["neutralAcidGroups"],"basic":r["neutralBaseGroups"]},
      "polarHeavyAtomFraction":r["polarFraction"],
      "rigidFragmentRmsdFloorA":r["rigidFragmentRmsdFloorA"],"nRigidFragments":r["nRigidFragments"],
      "crystalPoseVinaKcalMol":r["crystalPoseVinaTotal"],
      "crystalPoseVinaAfterLocalOptKcalMol":r["afterLocalOptTotal"],
      "vinaRank1KcalMol":r["rank1Score"],
      "deltaOptMinusRank1KcalMol":r["deltaOptMinusRank1"],
      "crystalPoseLigandEfficiency":r["ligandEfficiencyXtal"],
      "crystalPoseLigandEfficiencyWorstRankOf85":r["leRankWorstOf85"],
      "crystalPoseRelaxationDriftA":r["crystalPoseRelaxDriftA"],
      "worstBoxMarginA":r["worstBoxMarginA"],
      "minLigandReceptorHeavyDistA":r["minLigRecHeavyDistA"],
      "hetatmWithin5A":r["hetWithin5A"],
      "watersWithin5A":r["watersWithin5A"],"watersWithin3_5A":r["watersWithin3_5A"],
      "bridgingWaters":r["bridgingWaters"],
      "modifiedResiduesWithin6A":r["modAAwithin6A"],
      "cofactorsKept":r["cofactorsKept"],"cofactorsNotKept":r["cofactorsNotKept"],
      "vinardoCrystalPoseAfterLocalOptKcalMol":r["vinardoCrystalPoseOpt"],
      "vinardoBestOfStoredRun4Poses":r["vinardoBestOfStoredPoses"],
      "vinardoDeltaOptMinusBestStored":r["vinardoDeltaOpt"],
      "cause":CAUSE[p],
      "causeConfidence":r["causeConfidence"],
      "causeConfidenceBasis":r["causeConfidenceBasis"],
      "globalRulePossible":r["globalRulePossible"],
      "globalRuleNote":r["globalRuleNote"],
      "threeWayDiagnosis":r["threeWayDiagnosis"],
      "threeWayEvidence":r["threeWayEvidence"],
      "recoverableByProposedVinardoDocking":r["recoverableByProposedVinardoDocking"],
    })

from collections import Counter
cc=Counter(x["class"] for x in per)
vin8=[x["pdbId"] for x in per if x["vinardoDeltaOptMinusBestStored"]<0]

report={
 "kind":"GENESIS_ASTEX_PHASE2B_SAMPLING_DIAGNOSIS",
 "label":"Astex phase 2B - diagnosis of the 17 B_SAMPLING_FAILURE cases of run 3/run 4",
 "statusOfThisDocument":"DIAGNOSIS ONLY. No docking was performed. No benchmark number changes. Runs 1-5 and both preregistrations are untouched. The success threshold stays at 2.0 A and the denominator stays 85.",
 "finishedAt":datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
 "inputs":{
   "poseSetsAndPreparedReceptors":"/tmp/genesis-astex-topn-9wvus3jl/<PDBID>/ (run-4 artefacts, reused, not regenerated)",
   "crystalStructures":"/tmp/claude-0/p2r/joined/astex (p2rank-datasets 0236ecb38cbb60b89849a1ea36fbd9ee93f3e906)",
   "classificationSource":"docs/evidence/astex-redock-run4-diagnostic.json field run3FailureClassification, class B_SAMPLING_FAILURE",
   "vinardoRescoreSource":"docs/evidence/astex-vinardo-rescore.json (run 5)"},
 "versions":{"vina":"1.2.7","meeko":"0.8.0","rdkit":"2026.03.6","biotite":"1.6.0"},
 "measurementsPerformed":[
  {"name":"crystalPoseVina","what":"Vina score of the CRYSTAL ligand pose at its deposited coordinates against the exact prepared rigid receptor used in run 4 (receptor_with_extra.pdbqt where cofactors were kept), same box. Reported both at fixed coordinates (score()) and after a local minimisation only (optimize()). This is a diagnostic probe, NOT a rescoring run and NOT a benchmark result."},
  {"name":"deltaOptMinusRank1","what":"crystalPoseVinaAfterLocalOpt minus the Vina score of the rank-1 pose of the stored run-4 20-pose set. NEGATIVE means the native basin is the better-scoring one and the search missed it; POSITIVE means Vina correctly preferred a non-native pose and more search cannot help."},
  {"name":"rigidFragmentRmsdFloorA","what":"Lower bound on the RMSD any Vina pose of this ligand can reach, given that Vina never changes intra-fragment geometry. The torsion tree is read from the actual run-4 ligand.pdbqt (ROOT/BRANCH records, Meeko G0 ring-closure pseudo-atoms excluded); each rigid fragment of the ETKDGv3+MMFF conformer is independently Kabsch-fitted onto the crystal coordinates over all symmetry-equivalent atom mappings, and the pooled RMSD is taken. Because fragment connectivity is ignored, the true floor is >= this number."},
  {"name":"crystalPoseRelaxationDriftA","what":"Symmetry-aware RMSD the crystal pose moves under Vina local minimisation in the rigid receptor. A large drift would indicate the rigid receptor cannot accommodate the crystal ligand (clash / wrong side-chain rotamer)."},
  {"name":"hetatmWithin5A / modifiedResiduesWithin6A / bridgingWaters","what":"Every HETATM residue whose nearest heavy atom is within 5 A of a crystal-ligand heavy atom, taken from the deposited file (altloc ' ' or 'A', hydrogens excluded), with waters counted separately; modified amino acids detected by the presence of N/CA/C/O backbone atom names in a HETATM residue. A bridging water is a water within 3.5 A of BOTH a ligand N/O/S and a protein N/O/S."},
  {"name":"worstBoxMargin","what":"min over crystal-ligand heavy atoms and axes of (half box edge - |coordinate - box centre|), using the exact box written in run 4 (receptor.box.txt)."},
  {"name":"vinardoCrystalPose","what":"Same crystal-pose probe with sf_name='vinardo', compared against the BEST Vinardo score among the 20 stored run-4 poses (from run 5). Negative delta means: if the docking scoring function were Vinardo, the native basin would out-score everything the Vina search produced."}],
 "factorsRuledOutGlobally":{
  "boxCoverage":"RULED OUT for all 85. The worst per-case margin over the whole set is 3.167 A (1SJ0, a success); over the 17 it is 4.158 A (1HVY). No crystal ligand comes close to a box wall.",
  "stericClashWithTheRigidReceptor":"RULED OUT. The smallest ligand-receptor heavy-atom distance over the 17 is 2.286 A and that is a Mn coordination bond (1R58), not a clash; over all 85 the minimum is 1.934 A. Crystal-pose relaxation drift is 0.08-0.65 A over the 17 and 0.18-0.46 A over the 46 successes - the crystal ligand sits comfortably in every prepared rigid receptor. Receptor side-chain flexibility is not the missing ingredient; this is redocking into the ligand's own holo structure, so the side chains are already in the bound rotamer.",
  "covalentOrCoordinatedLigands":"No ligand among the 17 is covalently bound: the smallest ligand-to-protein-ATOM heavy-atom distance is 2.52 A (1MEH, a hydrogen bond to Ser263 OG). Exactly one, 1R58, is metal-coordinated (two Mn at 2.29 and 2.34 A).",
  "ligandFlexibility":"RULED OUT as a discriminator. Rotatable bonds: the 17 failures have mean 4.41, median 4, max 9; the 46 successes have mean 4.41, median 4.0, max 11. The distributions are indistinguishable. Heavy atoms: 20.8 mean for the 17 vs 23.6 for the 46 - the failures are if anything SMALLER. 'The ligand is too flexible for exhaustiveness 32' is not supported by the data.",
  "crystallographicWater":"NOT SUPPORTED as a discriminator. Waters within 5 A of the ligand: median 0 for the 17, median 3.5 for the 46 successes. Bridging waters (within 3.5 A of both ligand and protein polar atoms): mean 1.00 for the 17, mean 1.04 for the 46 successes, medians both 0. Seven of the 17 have NO water at all within 5 A. Keeping conserved waters cannot be the general fix for this class.",
  "missingCofactors":"NOT the cause for the 17. Every cofactor the rule identifies next to these ligands was kept: UMP (1HVY), IMP (1MEH), HEM + BH4 (1MMV), ADP (1SQ5), FAD (1T9B). The only recorded cofactorsNotKept entry among the 17 is CSO:A319 in 1MEH, which is a modified residue, not a cofactor.",
  "modifiedResiduesDroppedByTheCleaner":"REAL but RARE. Over the whole 85 only two cases have a modified amino acid deposited as HETATM within 6 A of the ligand: 1MEH (CSO A319, 4.32 A, dropped, class B) and 1XM6 (CME A432, 4.35 A, dropped, class A_RANKING_FAILURE). No MSE, SEP, TPO or PTR lines any of the 85 sites. Fixing the cleaner would touch at most 1 of the 17."},
 "correlationsNotProvenCausal":{
  "unionisedIonisableGroups":"The prepared ligand keeps the CCD protonation state: carboxylic acids stay neutral COOH, guanidines and amines stay neutral. 13 of the 17 failures (76%) carry at least one such group against 20 of the 46 successes (43%). This is a real association, but Vina's scoring function is charge-blind (no Coulomb term), so the mechanism can only be a change in donor/acceptor typing and torsion count - it is INFERRED, not measured, that correcting protonation would change these poses. Treat as a hypothesis, not a cause.",
  "lowLigandEfficiencyOfTheCrystalPose":"The crystal pose of the 17 is scored at a median -0.306 kcal/mol per heavy atom against -0.389 for the 46 successes. Four of the ten worst crystal-pose ligand efficiencies in the whole 85 belong to the 17 (1T9B 2nd, 1HVY 4th, 1GM8 6th, 1GKC 8th). This is the quantitative statement of 'Vina does not see these complexes'."},
 "threeWayDiagnosisDefinitions":{
  "1_SEARCH":"The crystal pose scores acceptably on the prepared rigid receptor and does not clash, and its locally minimised score is at least as good as the Vina rank-1 pose, yet no pose within 2.0 A appears in the 20 modes. Vina simply never found it.",
  "2_SCORING":"The crystal pose scores acceptably and does not clash, but Vina ranks another pose above the locally minimised native basin (delta_opt > 0). The function, not the search, chose wrongly.",
  "3_PREPARATION_OR_MODEL":"The crystal pose itself is defective on our prepared inputs. Triggered by ANY of: (a) clash - min ligand-receptor heavy-atom distance < 2.2 A or crystal-pose relaxation drift > 0.6 A; (b) the crystal-pose ligand efficiency is worse than the worst of the 46 successes (-0.227 kcal/mol per heavy atom); (c) the prepared ligand's rigid-fragment RMSD floor is >= 1.0 A, so the prepared conformer cannot reproduce the crystal pose; (d) direct inspection shows the docked entity is not the deposited ligand, or a residue lining the site is absent from the prepared receptor.",
  "note":"This three-way label is a strict mechanical test on the prepared inputs and is reported alongside, not instead of, the C1-C5 class. Where they differ (1HVY, 1MEH, 1T9B are C3 but flagged 3_PREPARATION_OR_MODEL because their crystal pose scores worse than any success; 1Q41 and 1GM8 are C2 and flagged 3 because of the ligand-conformer floor), both labels are true statements about different tests."},
 "threeWayCounts":{"1_SEARCH":5,"2_SCORING":6,"3_PREPARATION_OR_MODEL":6},
 "classDefinitions":CLASSDEF,
 "classCounts":dict(cc),
 "nearMissCriterion":"best RMSD anywhere in the stored 20-pose set < 2.5 A, i.e. within 0.5 A of the preregistered 2.0 A threshold. Applied uniformly to all 17.",
 "nearMisses":[x["pdbId"] for x in per if x["nearMiss"]],
 "casesWithAnIdentifiedCause":17,
 "casesWithoutAnIdentifiedCause":0,
 "distributions":dists,
 "perCase":per,
 "proposal":{
   "change":"Dock with the Vinardo scoring function (vina.Vina(sf_name='vinardo')) instead of docking with 'vina' and rescoring afterwards. One global constant in dock_worker; nothing per-target, no new box, no new preparation step.",
   "whyThisOne":"The diagnosis says the search is not the bottleneck: only 1 of the 17 (1YVF) has a native basin more than 0.5 kcal/mol better than what the search returned, so raising exhaustiveness addresses at most 1 case. 10 of the 17 fail because the native pose is not the optimum of the energy function being searched (7 in C3, plus C1 and the 2 in C2 where the energetics are also adverse). The only way to recover those is to change the energy landscape, and of the changes available, changing the scoring function is the one the existing evidence already quantifies from two independent directions: run 5 showed Vinardo re-ranking alone moves 46 -> 50 on the SAME pose sets, and the crystal-pose probe here shows that for 8 of the 17 (1KE5, 1L7F, 1Q41, 1TT1, 1TZ8, 1U4D, 1YVF, 2BM2) the locally minimised crystal pose out-scores EVERY one of the 20 stored poses under Vinardo, by 0.26 to 1.75 kcal/mol - a native basin that is the Vinardo optimum but not the Vina optimum. Docking with Vinardo makes the search follow that landscape instead of merely re-reading it at the end.",
   "alternativesRejected":{
     "raiseExhaustiveness":"Addresses only C5 (1 case). For the 7 C3 cases the search already found something the function likes better than the native pose; more search makes that worse, not better.",
     "keepConservedWaters":"The water statistics do not separate the 17 from the 46 successes, and 7 of the 17 have no water within 5 A.",
     "flexibleReceptorSideChains":"Redocking uses the holo receptor; the crystal pose relaxes by at most 0.65 A in every prepared receptor, so there is nothing to relieve.",
     "keepModifiedResiduesDepositedAsHETATM":"Correct to do, but touches 1 of the 17 (1MEH) and 1 of the 20 A cases (1XM6).",
     "multipleETKDGconformers":"Addresses C2 (2 cases) and would lower the floor generally, but the floor exceeds 1.0 A in only 2 of the 17 and in 1 of the 46 successes.",
     "protonateLigandsAtPH7.4":"Best-supported correlation but no measured mechanism under a charge-blind scoring function."},
   "boundedEstimateOfRecovery":{
     "labelled":"ESTIMATE, NOT A MEASUREMENT. No docking was run for this document.",
     "hardUpperBound":8,
     "hardUpperBoundReasoning":"Exactly 8 of the 17 have vinardoDeltaOptMinusBestStored < 0, i.e. a native basin that out-scores every pose the Vina search produced under Vinardo: 1KE5, 1L7F, 1Q41, 1TT1, 1TZ8, 1U4D, 1YVF, 2BM2. For the other 9 Vinardo still prefers a non-native pose by +0.11 to +1.74 kcal/mol, so re-docking with Vinardo cannot recover them.",
     "lowerBound":0,
     "lowerBoundReasoning":"A better-scoring basin is necessary, not sufficient: the Vinardo search must also visit it, and it must produce a pose under 2.0 A once there. 1Q41 in particular has a 1.654 A rigid-fragment floor, so even a perfect Vinardo search may land at ~1.7-2.4 A.",
     "mostLikelyRange":"3 to 6 of the 17",
     "mostLikelyRangeReasoning":"Of the 8, six have a Vinardo margin >= 0.73 kcal/mol (1KE5 -1.06, 2BM2 -1.00, 1YVF -0.98, 1L7F -0.91, 1U4D -0.74, 1Q41 -1.75) and two are marginal (1TT1 -0.26, 1TZ8 -0.43). Discount 1Q41 for its geometric floor. That leaves ~5 plausible plus 2 marginal, and any global search change converts basins to sub-2.0 A poses imperfectly, so 3 to 6 is the honest interval.",
     "importantCaveat":"This is a bound on the 17 only. Run 5 also showed Vinardo re-ranking LOSES 5 cases that Vina got right (1L2S, 1OF1, 1OQ5, 1U1C, 1UML). Re-docking with Vinardo re-rolls all 85, so the net effect on the headline 46/85 is NOT bounded by this estimate and could be negative."},
   "theOneNextExperiment":"Re-run the full 85-case protocol unchanged except sf_name='vinardo' at docking time (same preparation, same boxes, same exhaustiveness 32, same seed 42, same 2.0 A threshold, same denominator 85), preregistered before it is run, and report it as run 6 alongside run 3 rather than replacing it. Prespecify the two numbers that decide it: successes/85, and the count among the 17 diagnosed here. The falsifiable prediction from this diagnosis is that of the 17, between 3 and 6 are recovered and none of the 9 with a positive Vinardo delta is."},
 "whatCouldNotBeDetermined":[
  "Whether any of the C3 cases would be recovered by a protonation fix: Vina and Vinardo are both charge-blind, so the prepared protonation state could not be tested with the existing scoring machinery. The association (76% vs 43%) is reported, the causation is not established.",
  "The true RMSD floor including fragment connectivity. The reported floor is a lower bound obtained by fitting each rigid fragment independently; the achievable floor is higher by an unmeasured amount.",
  "Whether the Vinardo search would actually visit the better-scoring native basins. Only the scores of the basins were measured, never a Vinardo docking run.",
  "For 1GKC, what the benchmark result would be with the full 22-heavy-atom two-residue ligand. It was not re-docked, because that requires changing the preregistered ligand rule."],
}
os.makedirs(REPO+"/docs/evidence",exist_ok=True)
with open(REPO+"/docs/evidence/astex-phase2b-sampling-diagnosis.json","w") as f:
    json.dump(report,f,indent=1); f.write("\n")
print("json ok", cc, vin8)
