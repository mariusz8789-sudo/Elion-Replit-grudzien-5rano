import json,statistics,hashlib,datetime,os
M=json.load(open("combined.json"))
import os as _os
# Repository root, derived from this file: a hard-coded absolute path named the machine
# the script happened to run on and broke every other checkout (D-168).
REPO=_os.path.abspath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", ".."))
B=sorted([p for p in M if M[p]["classification"]=="B_SAMPLING_FAILURE"])
S=[p for p in M if M[p]["success_run3"]]
A=[p for p in M if M[p]["classification"]=="A_RANKING_FAILURE"]

TRUNC={"1GKC":{"deposited":"BUM L1448 (10 heavy atoms) + BUM A1449 (12 heavy atoms), joined by a 1.35 A C-N bond (BUM A1449 C -> BUM L1448 N)","docked":"BUM L1448 only, 10 of 22 heavy atoms"}}

def classify(p):
    r=M[p]
    if p in TRUNC: return "C1_LIGAND_DEFINITION_TRUNCATED"
    if r["rigidFragmentRmsdFloorA"] is not None and r["rigidFragmentRmsdFloorA"]>=1.0:
        return "C2_FIXED_INTERNAL_GEOMETRY_FLOOR"
    d=r["deltaOptMinusRank1"]
    if d>0.5: return "C3_SCORING_FUNCTION_PREFERS_A_NON_NATIVE_POSE"
    if d<-0.5: return "C5_TRUE_SEARCH_FAILURE"
    return "C4_NEAR_DEGENERATE_BASINS"

for p in B: M[p]["phase2bClass"]=classify(p)
from collections import Counter
print(Counter(M[p]["phase2bClass"] for p in B))
for p in B: print(p, M[p]["phase2bClass"], M[p]["bestRmsdInTopKA"], M[p]["deltaOptMinusRank1"], M[p]["rigidFragmentRmsdFloorA"], M[p]["vinardoDeltaOpt"])
json.dump(M,open("combined.json","w"),indent=1)
