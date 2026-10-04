import json,statistics
import os as _os
# Repository root, derived from this file: a hard-coded absolute path named the machine
# the script happened to run on and broke every other checkout (D-168).
REPO=_os.path.abspath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", ".."))
M=json.load(open("/tmp/claude-0/phase2b/measure.json"))
X=json.load(open("/tmp/claude-0/phase2b/xtalscore.json"))
diag=json.load(open(REPO+"/docs/evidence/astex-redock-run4-diagnostic.json"))
D={c['pdbId']:c for c in diag['cases']}
for pid,r in M.items():
    r.update(X[pid])
    c=D[pid]
    r["rank1Score"]=c["rank1VinaScoreKcalMol"]
    r["rank1Rmsd"]=c["rank1RmsdA"]
    r["bestRmsdA"]=c["bestRmsdA"]
    r["poses"]=c["poses"]
    r["ligandSmiles"]=c["ligandSmiles"]
    r["deltaXtalMinusRank1"]=round(r["crystalPoseVinaTotal"]-c["rank1VinaScoreKcalMol"],3)
    r["deltaOptMinusRank1"]=round(r["afterLocalOptTotal"]-c["rank1VinaScoreKcalMol"],3)
json.dump(M,open("/tmp/claude-0/phase2b/combined.json","w"),indent=1)

B=[p for p in M if M[p]["classification"]=="B_SAMPLING_FAILURE"]
S=[p for p in M if M[p]["success_run3"]]
A=[p for p in M if M[p]["classification"]=="A_RANKING_FAILURE"]
print("B",len(B),"S",len(S),"A",len(A))
def dist(ids,key):
    v=[M[p][key] for p in ids]
    return "n=%d min=%s med=%s mean=%.2f max=%s"%(len(v),min(v),statistics.median(v),statistics.mean(v),max(v))
for k in ["rotBonds","heavyAtoms","deltaXtalMinusRank1","deltaOptMinusRank1","crystalPoseVinaTotal","worstBoxMarginA","minLigRecHeavyDistA","watersWithin3_5A","watersWithin5A"]:
    print("%-22s SUCC  %s"%(k,dist(S,k)))
    print("%-22s FAILB %s"%(k,dist(B,k)))
    print("%-22s FAILA %s"%(k,dist(A,k)))
    print()
print("=== the 17 ===")
print("%-6s %5s %4s %4s %6s %7s %7s %7s %7s %5s %4s %4s %s"%("PDB","bestR","HA","rot","chg","xtal","opt","rank1","dXtal","marg","w3.5","w5","het"))
for p in sorted(B,key=lambda x:M[x]["bestRmsdInTopKA"]):
    r=M[p]
    print("%-6s %5.3f %4d %4d %6d %7.2f %7.2f %7.2f %7.2f %5.2f %4d %4d %s"%(p,r["bestRmsdInTopKA"],r["heavyAtoms"],r["rotBonds"],r["formalCharge"],r["crystalPoseVinaTotal"],r["afterLocalOptTotal"],r["rank1Score"],r["deltaXtalMinusRank1"],r["worstBoxMarginA"],r["watersWithin3_5A"],r["watersWithin5A"],[ (h["res"],h["minDistA"]) for h in r["hetWithin5A"]]))
