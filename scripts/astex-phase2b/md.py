import json
REPO="/home/claude/Elion-Replit-grudzien-5rano"
R=json.load(open(REPO+"/docs/evidence/astex-phase2b-sampling-diagnosis.json"))
P={x["pdbId"]:x for x in R["perCase"]}
order=sorted(P,key=lambda p:P[p]["bestRmsdInTop20A"])
D=R["distributions"]
L=[]
w=L.append
w("# Astex phase 2B - diagnosis of the 17 B_SAMPLING_FAILURE cases")
w("")
w("**No docking was performed for this document.** Nothing here changes a benchmark number. The 2.0 A threshold stands, the denominator stays 85, no case is excluded, and runs 1-5 and both preregistrations are untouched. Every measurement below was made on the run-4 artefacts already on disk (`/tmp/genesis-astex-topn-9wvus3jl/`) and the deposited Astex structures (`p2rank-datasets` 0236ecb38cbb60b89849a1ea36fbd9ee93f3e906).")
w("")
w("Machine-readable companion: `docs/evidence/astex-phase2b-sampling-diagnosis.json`.")
w("")
w("Engine used for the probes: AutoDock Vina 1.2.7, Meeko 0.8.0, RDKit 2026.03.6, biotite 1.6.0 - the same versions as run 4.")
w("")
w("## Headline")
w("")
w("| question | answer |")
w("| --- | --- |")
w("| of the 17, how many have a concrete identified cause | **17 of 17** |")
w("| of the 17, how many could NOT be explained | **0** |")
w("| near-misses (best pose in the stored 20 within 0.5 A of the threshold) | **7** |")
w("| of the 17, how many are a genuine search failure by the crystal-pose test | **5** |")
w("| of the 17, how many are a scoring failure | **6** |")
w("| of the 17, how many are a preparation / receptor-or-ligand-model failure | **6** |")
w("| single proposed protocol change | dock with the **Vinardo** scoring function instead of docking with `vina` and rescoring afterwards |")
w("| bounded ESTIMATE of cases that change from those 17 | **3 to 6**, hard upper bound 8, lower bound 0 |")
w("")
w("The blunt version: **the run-4 label `B_SAMPLING_FAILURE` is mostly wrong.** Only one of the 17 (1YVF) has a native binding mode that is clearly better-scoring than what Vina returned and was nevertheless never visited. For the other 16 the search is not the limiting step - the energy function, the prepared ligand conformer, or the prepared chemical entity is.")
w("")
w("## The decisive measurement: scoring the crystal pose itself")
w("")
w("For all 85 cases the deposited crystal ligand was scored, at its deposited coordinates, against the *exact* rigid receptor PDBQT run 4 docked into (including the extra rigid cofactor atoms where run 3 kept any), in the same box. Two numbers per case: the score at fixed coordinates, and the score after a Vina local minimisation only (`optimize()`, no search). This is a diagnostic probe, not a rescoring run and not a benchmark result.")
w("")
w("The quantity that decides everything is")
w("")
w("> **delta_opt = (crystal pose after local minimisation) - (Vina rank-1 pose of the stored 20-pose set)**")
w("")
w("A negative delta_opt means the native basin is the better-scoring one and the search missed it - a real search failure. A positive delta_opt means Vina correctly preferred a non-native pose, and no amount of extra exhaustiveness can help.")
w("")
w("| group | n | median delta_opt | count with delta_opt < 0 | count with delta_opt < -0.5 |")
w("| --- | ---: | ---: | ---: | ---: |")
w("| 46 run-3 successes | 46 | %.3f | 15 (rank 1 IS the native pose here, so this is relaxation slop) | 6 |"%D["deltaOptMinusRank1"]["successes_run3"]["median"])
w("| 20 A_RANKING_FAILURE | 20 | %.3f | 5 | 4 |"%D["deltaOptMinusRank1"]["A_ranking_failures"]["median"])
w("| **17 B_SAMPLING_FAILURE** | 17 | **%.3f** | **6** | **1 (1YVF only)** |"%D["deltaOptMinusRank1"]["B_sampling_failures"]["median"])
w("")
w("Read the last column. Across the whole 17 there is exactly ONE case where the native basin is better than what Vina returned by more than half a kcal/mol. That is the entire evidential basis for \"the search failed\".")
w("")
w("### The three-way split the user asked for")
w("")
for k in ["1_SEARCH","2_SCORING","3_PREPARATION_OR_MODEL"]:
    w("- **%s** (%d cases): %s"%(k,R["threeWayCounts"][k],R["threeWayDiagnosisDefinitions"][k]))
w("")
w("  Note: %s"%R["threeWayDiagnosisDefinitions"]["note"])
w("")
w("  A caution on group 1: four of its five members (1KE5 -0.389, 1L7F -0.495, 1TT1 -0.160, 2BM2 -0.377 kcal/mol) are inside scoring noise, so 'the search never found it' is literally true but the native basin carries almost no advantage to find. Only 1YVF (-0.618) has a margin worth calling a search failure.")
w("")
w("| group | cases |")
w("| --- | --- |")
for k in ["1_SEARCH","2_SCORING","3_PREPARATION_OR_MODEL"]:
    w("| %s | %s |"%(k,", ".join(sorted(p for p in P if P[p]["threeWayDiagnosis"]==k))))
w("")
w("## What is NOT the cause - factors checked and ruled out across all 85")
w("")
for k,v in R["factorsRuledOutGlobally"].items():
    w("- **%s** - %s"%(k,v))
w("")
w("### Correlations found but not proven causal")
w("")
for k,v in R["correlationsNotProvenCausal"].items():
    w("- **%s** - %s"%(k,v))
w("")
w("### Distributions (the 17 against the 46 successes), not cherry-picked examples")
w("")
w("| quantity | 46 successes (min / median / mean / max) | 17 B failures | 20 A failures |")
w("| --- | --- | --- | --- |")
LAB={"rotBonds":"rotatable bonds","heavyAtoms":"heavy atoms","rigidFragmentRmsdFloorA":"rigid-fragment RMSD floor (A)","deltaOptMinusRank1":"delta_opt (kcal/mol)","crystalPoseVinaTotal":"crystal-pose Vina (kcal/mol)","ligandEfficiencyXtal":"crystal-pose kcal/mol per heavy atom","worstBoxMarginA":"worst box margin (A)","minLigRecHeavyDistA":"min lig-receptor heavy dist (A)","watersWithin5A":"waters within 5 A","bridgingWaters":"bridging waters","crystalPoseRelaxDriftA":"crystal-pose relaxation drift (A)","mismatchedIonisable":"unionised ionisable groups","polarFraction":"polar heavy-atom fraction"}
for k,lab in LAB.items():
    def f(g):
        x=D[k][g]; return "%.3f / %.3f / %.3f / %.3f"%(x["min"],x["median"],x["mean"],x["max"])
    w("| %s | %s | %s | %s |"%(lab,f("successes_run3"),f("B_sampling_failures"),f("A_ranking_failures")))
w("")
w("## Near-misses")
w("")
w("**Criterion, applied uniformly to all 17:** best RMSD anywhere in the stored 20-pose set < 2.5 A, i.e. within 0.5 A of the preregistered 2.0 A threshold. No other rule was used and no case was re-labelled by hand.")
w("")
w("**7 of 17 are near-misses:** " + ", ".join("%s (%.3f A)"%(p,P[p]["bestRmsdInTop20A"]) for p in order if P[p]["nearMiss"]) + ".")
w("")
w("The remaining 10 are not: " + ", ".join("%s (%.3f A)"%(p,P[p]["bestRmsdInTop20A"]) for p in order if not P[p]["nearMiss"]) + ".")
w("")
w("## Per-case table, all 17")
w("")
w("Columns: bestR = best RMSD anywhere in the stored 20-pose set; xtal = Vina score of the crystal pose at deposited coordinates; opt = after local minimisation only; r1 = Vina rank-1 score; d_opt = opt - r1; floor = rigid-fragment RMSD floor (lower bound on any achievable RMSD); drift = how far the crystal pose moves under local minimisation; marg = worst box margin; minD = min ligand-receptor heavy-atom distance; w5 / bridge = waters within 5 A / bridging waters; d_vrd = Vinardo(relaxed crystal pose) - best Vinardo score among the 20 stored poses.")
w("")
w("| PDB | bestR | class | 3-way | conf | HA | rot | chg | xtal | opt | r1 | d_opt | floor | drift | marg | minD | w5 / bridge | d_vrd | global rule? |")
w("| --- | ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |")
for p in order:
    x=P[p]
    w("| **%s** | %.3f | %s | %s | %s | %d | %d | %+d | %.2f | %.2f | %.2f | %+.2f | %.3f | %.2f | %.2f | %.2f | %d / %d | %+.2f | %s |"%(
      p,x["bestRmsdInTop20A"],x["class"].split("_")[0],x["threeWayDiagnosis"].split("_")[0],x["causeConfidence"][0],
      x["heavyAtoms"],x["rotatableBonds"],x["formalChargeAsPrepared"],
      x["crystalPoseVinaKcalMol"],x["crystalPoseVinaAfterLocalOptKcalMol"],x["vinaRank1KcalMol"],x["deltaOptMinusRank1KcalMol"],
      x["rigidFragmentRmsdFloorA"],x["crystalPoseRelaxationDriftA"],x["worstBoxMarginA"],x["minLigandReceptorHeavyDistA"],
      x["watersWithin5A"],x["bridgingWaters"],x["vinardoDeltaOptMinusBestStored"],"yes" if x["globalRulePossible"]=="YES" else "NO"))
w("")
w("conf: H = HIGH, M = MEDIUM. 3-way: 1 = search, 2 = scoring, 3 = preparation/model.")
w("")
w("### HETATM environment of each of the 17 (5 A shell, waters counted separately)")
w("")
w("| PDB | non-water HETATM within 5 A of the crystal ligand (the ligand residue itself excluded), and whether the prepared receptor keeps it | cofactor bookkeeping from run 3 | waters <=5 A / <=3.5 A / bridging | modified residues within 6 A |")
w("| --- | --- | --- | --- | --- |")
KEEP={"metal":"kept (metal ion)","additive":"DROPPED (crystallisation additive)","other":"see cofactor columns"}
for p in order:
    x=P[p]
    hh=x["hetatmWithin5A"]
    kept={c["residue"].split(":")[0].rstrip("0123456789"):True for c in x["cofactorsKept"]}
    keptlab=", ".join(c["residue"] for c in x["cofactorsKept"]) or "-"
    notkept=", ".join("%s (%s)"%(c["residue"],c["reason"]) for c in x["cofactorsNotKept"]) or "-"
    hs="; ".join("%s at %.2f A - %s"%(h["res"],h["minDistA"],h["preparedReceptorStatus"]) for h in hh) or "none"
    mods=", ".join("%s %s at %.2f A"%(m["res"],m["id"],m["minDistA"]) for m in x["modifiedResiduesWithin6A"] if m["minDistA"]>0.01) or "none"
    w("| %s | %s | kept: %s; NOT kept: %s | %d / %d / %d | %s |"%(p,hs,keptlab,notkept,x["watersWithin5A"],x["watersWithin3_5A"],x["bridgingWaters"],mods))
w("")
w("## Class grouping")
w("")
w("Classes are defined by a test applied uniformly, in this order. No class is a list of PDB IDs; each is a property any case in the set can have.")
w("")
for k,v in R["classDefinitions"].items():
    mem=sorted(p for p in P if P[p]["class"]==k)
    w("### %s - %d case%s: %s"%(k,len(mem),"" if len(mem)==1 else "s",", ".join(mem)))
    w("")
    w(v)
    w("")
w("## Per-case evidence and confidence")
w("")
for p in order:
    x=P[p]
    w("### %s - %s - three-way %s - confidence %s"%(p,x["class"],x["threeWayDiagnosis"],x["causeConfidence"]))
    w("")
    w("- Best RMSD in the stored 20-pose set: **%.3f A**%s. Run-3 top-1 RMSD %.3f A."%(x["bestRmsdInTop20A"]," (near-miss)" if x["nearMiss"] else "",x["run3Top1RmsdA"]))
    w("- Ligand as docked: `%s` - %d heavy atoms, %d rotatable bonds, formal charge %+d, %d unionised acidic and %d unionised basic group(s), polar heavy-atom fraction %.3f."%(x["ligandSmilesAsDocked"],x["heavyAtoms"],x["rotatableBonds"],x["formalChargeAsPrepared"],x["neutralIonisableGroups"]["acidic"],x["neutralIonisableGroups"]["basic"],x["polarHeavyAtomFraction"]))
    w("- **Cause:** %s"%x["cause"])
    w("- **Three-way evidence:** %s"%x["threeWayEvidence"])
    w("- **Confidence basis:** %s"%x["causeConfidenceBasis"])
    w("- **Could the fix be a global rule rather than a PDB-specific hack?** %s - %s"%(x["globalRulePossible"],x["globalRuleNote"]))
    w("- Recoverable by the proposed Vinardo docking change (native basin out-scores every stored pose under Vinardo)? **%s** (Vinardo delta %+.2f kcal/mol)."%("yes" if x["recoverableByProposedVinardoDocking"] else "no",x["vinardoDeltaOptMinusBestStored"]))
    w("")
w("## The one proposed protocol change")
w("")
pr=R["proposal"]
w("**%s**"%pr["change"])
w("")
w(pr["whyThisOne"])
w("")
w("### Alternatives considered and why they lose")
w("")
w("| alternative | why it is not the best single change |")
w("| --- | --- |")
for k,v in pr["alternativesRejected"].items():
    w("| %s | %s |"%(k,v))
w("")
w("### Bounded estimate - LABELLED AS AN ESTIMATE, NOT A MEASUREMENT")
w("")
b=pr["boundedEstimateOfRecovery"]
w("> %s"%b["labelled"])
w("")
w("- **Hard upper bound: %d of the 17.** %s"%(b["hardUpperBound"],b["hardUpperBoundReasoning"]))
w("- **Lower bound: %d.** %s"%(b["lowerBound"],b["lowerBoundReasoning"]))
w("- **Most likely: %s.** %s"%(b["mostLikelyRange"],b["mostLikelyRangeReasoning"]))
w("- **Caveat that matters:** %s"%b["importantCaveat"])
w("")
w("### The one next experiment")
w("")
w(pr["theOneNextExperiment"])
w("")
w("## What could not be determined")
w("")
for x in R["whatCouldNotBeDetermined"]:
    w("- %s"%x)
w("")
w("Cases of the 17 left with no identified cause: **0**. That is a statement about having *a* mechanism supported by measurement for each case, not a claim that each mechanism is proven - the per-case confidence column says which are HIGH (5 cases: 1GKC, 1GM8, 1Q41, 1R58, 1T9B) and which are MEDIUM (12 cases). None is HIGH by inference alone; every HIGH rests on a number in the table above.")
w("")
open(REPO+"/docs/evidence/astex-phase2b-sampling-diagnosis.md","w").write("\n".join(L)+"\n")
print("md ok",len(L),"lines")
