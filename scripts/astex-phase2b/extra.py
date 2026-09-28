import json
M=json.load(open("combined.json"))
B=sorted([p for p in M if M[p]["classification"]=="B_SAMPLING_FAILURE"])
S=[p for p in M if M[p]["success_run3"]]
LE_WORST_SUCCESS=max(M[p]["ligandEfficiencyXtal"] for p in S)   # -0.227, least negative

DIRECT_PREP={
 "1GKC":"the docked chemical entity is not the deposited ligand (10 of 22 heavy atoms)",
 "1MEH":"CSO A319, a modified residue lining the site 4.32 A from the ligand, is absent from the prepared receptor (run 3 cofactorsNotKept: no_ccd_template_with_7_heavy_atoms)",
}
CONF={
 "1GKC":("HIGH","Direct structural fact from the deposited file: two BUM residues joined by a 1.35 A C-N bond, only one of them docked. Nothing inferred."),
 "1Q41":("HIGH","Measured rigid-fragment RMSD floor 1.654 A, the largest of all 85 and the only one above 1.3 A, on a ligand with zero rotatable bonds. The barrier is geometric and cannot be argued away."),
 "1GM8":("HIGH","Measured floor 1.064 A AND a measured +1.843 kcal/mol adverse energetic gap. Two independent barriers, both measured."),
 "1T9B":("HIGH","Measured: crystal-pose ligand efficiency -0.198 kcal/mol per heavy atom, worse than any of the 46 successes and 2nd worst of all 85; relaxed crystal pose 2.059 kcal/mol worse than Vina rank 1. The conclusion 'Vina does not see this complex' follows from the numbers."),
 "1R58":("HIGH","Measured +1.838 kcal/mol adverse gap with zero relaxation drift (0.08 A) - the pose fits perfectly and still loses. The ligand coordinates two Mn at 2.29/2.34 A and Vina has no metal-coordination term; that is a documented property of the function, not a guess."),
 "1HVY":("MEDIUM","The +1.405 kcal/mol adverse gap and the -0.226 ligand efficiency are measured, but that marginally crosses the 'worse than any success' line (-0.227) and the attribution to the unionised glutamate tail is inference, not measurement."),
 "1MEH":("MEDIUM","That CSO A319 is dropped is a recorded fact; that it causes the failure is inferred - the residue is 4.32 A away, in the second shell. The +0.769 kcal/mol gap is measured."),
 "1MMV":("MEDIUM","The +0.919 kcal/mol adverse gap is measured. The mechanism (charge-blind scoring of a +1 guanidinium over the haem) is inferred; HEM and BH4 are confirmed present, so the obvious alternative is excluded."),
 "1SQ5":("MEDIUM","+1.069 kcal/mol adverse gap measured; ADP cofactor confirmed present, no waters, no dropped residue, no clash. The residual attribution to a small polar flexible ligand is descriptive."),
 "1W1P":("MEDIUM","+0.933 kcal/mol adverse gap and a crystal-pose score of -4.425 kcal/mol (4th worst of 85) are measured. The role of the two glycerols dropped at 2.56/3.76 A is inferred, not tested."),
 "1TZ8":("MEDIUM","Near-degeneracy (+0.213 kcal/mol) is measured. The pseudo-symmetry explanation for a flipped pose is inference."),
 "1U4D":("MEDIUM","Near-degeneracy (+0.226 kcal/mol) is measured, as is the presence of Meeko ring-opening pseudo-atoms. Why the search settles on the other basin is not established."),
 "1TT1":("MEDIUM","Near-degeneracy (-0.160 kcal/mol) is measured. That the missing zwitterion is what flattens the landscape is inference under a charge-blind function."),
 "1KE5":("MEDIUM","Measured -0.389 kcal/mol: the native basin is very slightly better and was not returned. No structural defect found. The cause is the flatness of the landscape, which is measured; the reason the search chose otherwise is not."),
 "2BM2":("MEDIUM","Measured -0.377 kcal/mol. No structural defect found. Same caveat as 1KE5."),
 "1L7F":("MEDIUM","Measured -0.495 kcal/mol: native basin better, not returned. The salt-bridge network of a neuraminidase transition-state analogue is prepared fully neutral, which is a fact about the input, but its causal role is inference."),
 "1YVF":("MEDIUM","Measured -0.618 kcal/mol: the only case where the native basin is clearly better and the search still missed it. The classification is solid; no mechanism for WHY the search missed it was established."),
}
GLOBAL={p:("YES","") for p in B}
GLOBAL["1GKC"]=("YES","Rule: treat covalently bonded HETATM residues (heavy-atom distance < 1.9 A between residues sharing the ligand's chain/site) as one ligand. General, no PDB named.")
GLOBAL["1Q41"]=("YES","Rule: generate an N-conformer ETKDG ensemble (or enumerate ring conformers) and dock each, keep the best-scoring. General.")
GLOBAL["1GM8"]=("YES","Same conformer-ensemble rule as 1Q41.")
GLOBAL["1MEH"]=("YES","Rule: any HETATM residue carrying N/CA/C/O backbone atoms is a modified amino acid and is kept as rigid receptor atoms (templated from the CCD, or from its heavy atoms with RDKit/Meeko typing). General; it would also pick up 1XM6's CME.")
GLOBAL["1R58"]=("YES","Rule: a scoring function with a metal-coordination term, applied to all 85. NOT satisfied by the proposed Vinardo change, which is also charge- and coordination-blind (measured Vinardo delta +1.706).")
for p in ["1T9B","1HVY","1MMV","1SQ5","1W1P","1TZ8","1U4D","1TT1","1KE5","2BM2","1L7F","1YVF"]:
    GLOBAL[p]=("YES","Rule: change the docking scoring function globally (the proposal). Applies to all 85 identically.")
GLOBAL["1W1P"]=("YES","Global scoring-function change; a second candidate global rule is to keep, rather than drop, crystallisation additives whose heavy atoms come within 4 A of the crystal ligand (here two glycerols at 2.56 and 3.76 A). Both are general rules.")

for p in B:
    r=M[p]
    clash = (r["minLigRecHeavyDistA"]<2.2) or (r["crystalPoseRelaxDriftA"]>0.6)
    scores_badly = r["ligandEfficiencyXtal"]>LE_WORST_SUCCESS
    floor_bad = r["rigidFragmentRmsdFloorA"]>=1.0
    direct = p in DIRECT_PREP
    triggers=[]
    if clash: triggers.append("clash/large relaxation drift (drift %.2f A, min heavy dist %.2f A)"%(r["crystalPoseRelaxDriftA"],r["minLigRecHeavyDistA"]))
    if scores_badly: triggers.append("crystal-pose ligand efficiency %.3f is worse than the worst of the 46 successes (%.3f)"%(r["ligandEfficiencyXtal"],LE_WORST_SUCCESS))
    if floor_bad: triggers.append("prepared-ligand rigid-fragment RMSD floor %.3f A >= 1.0 A"%r["rigidFragmentRmsdFloorA"])
    if direct: triggers.append(DIRECT_PREP[p])
    if triggers:
        tw="3_PREPARATION_OR_MODEL"
    elif r["deltaOptMinusRank1"]>0:
        tw="2_SCORING"
        triggers=["crystal pose scores acceptably (LE %.3f) and does not clash (drift %.2f A), but Vina ranks another pose %.3f kcal/mol above the relaxed native basin"%(r["ligandEfficiencyXtal"],r["crystalPoseRelaxDriftA"],r["deltaOptMinusRank1"])]
    else:
        tw="1_SEARCH"
        triggers=["crystal pose scores acceptably (LE %.3f), does not clash (drift %.2f A), and the relaxed native basin is %.3f kcal/mol BETTER than Vina rank 1 - the search simply never returned it"%(r["ligandEfficiencyXtal"],r["crystalPoseRelaxDriftA"],r["deltaOptMinusRank1"])]
    r["threeWayDiagnosis"]=tw
    r["threeWayEvidence"]="; ".join(triggers)
    r["causeConfidence"],r["causeConfidenceBasis"]=CONF[p]
    r["globalRulePossible"],r["globalRuleNote"]=GLOBAL[p]
    r["recoverableByProposedVinardoDocking"]= r["vinardoDeltaOpt"]<0
json.dump(M,open("combined.json","w"),indent=1)
from collections import Counter
print(Counter(M[p]["threeWayDiagnosis"] for p in B))
for p in B: print(p,M[p]["threeWayDiagnosis"],M[p]["phase2bClass"],M[p]["causeConfidence"],M[p]["recoverableByProposedVinardoDocking"])
print("LE_WORST_SUCCESS",LE_WORST_SUCCESS)
