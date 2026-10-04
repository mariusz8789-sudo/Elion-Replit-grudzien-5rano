import json, os, sys, math, glob
from rdkit import Chem
from rdkit.Chem import Descriptors, rdMolDescriptors
from rdkit import RDLogger
RDLogger.DisableLog('rdApp.*')

TOPN="/tmp/genesis-astex-topn-9wvus3jl"
SRC="/tmp/claude-0/p2r/joined/astex"
import os as _os
# Repository root, derived from this file: a hard-coded absolute path named the machine
# the script happened to run on and broke every other checkout (D-168).
REPO=_os.path.abspath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", ".."))

run3=json.load(open(REPO+"/docs/evidence/astex-redock-benchmark-2026-09-27-run3.json"))
diag=json.load(open(REPO+"/docs/evidence/astex-redock-run4-diagnostic.json"))
cls={x['pdbId']:x for x in diag['run3FailureClassification']}
r3={c['pdbId']:c for c in run3['cases']}

METALS={"ZN","MG","CA","MN","FE","CO","NI","CU"}
WATERS={"HOH","WAT","DOD"}
ADDITIVES=set("SO4 PO4 GOL EDO PEG PGE PG4 1PE P6G MPD DMS ACT FMT EPE MES TRS CIT TLA IMD BME NO3 CL IOD BR BOG LDA SCN AZI IPA EOH MOH DMF MLI SIN VO4 MO3 NH4 CO3 BCT PGO PGR HEZ 1BO BU3".split())

def is_h(l):
    el=l[76:78].strip().upper()
    if el: return el in ("H","D")
    return l[12:16].strip().lstrip("0123456789").upper().startswith(("H","D"))

out={}
for pid in sorted(r3):
    rec={"pdbId":pid}
    d=os.path.join(TOPN,pid)
    sdf=os.path.join(d,"ligand.sdf")
    m=Chem.MolFromMolFile(sdf, removeHs=False)
    lig=Chem.RemoveHs(m)
    smi=Chem.MolToSmiles(lig)
    rec["smiles"]=smi
    rec["heavyAtoms"]=lig.GetNumHeavyAtoms()
    rec["rotBonds"]=rdMolDescriptors.CalcNumRotatableBonds(lig, strict=True)
    rec["rotBondsNonStrict"]=rdMolDescriptors.CalcNumRotatableBonds(lig, strict=False)
    rec["formalCharge"]=Chem.GetFormalCharge(lig)
    rec["mw"]=round(Descriptors.MolWt(lig),1)
    rec["nRings"]=rdMolDescriptors.CalcNumRings(lig)
    # count ionisable groups in the as-prepared molecule
    patt={"neutralCOOH":"[CX3](=O)[OX2H1]","carboxylate":"[CX3](=[OX1])[OX1-]",
          "neutralAliphAmine":"[NX3;H2,H1;!$(N[!#6]);!$(N=*);!$(N#*);!$(Nc)]","protonatedAmine":"[NX4+]",
          "amidine_guanidine_neutral":"[NX2]=[CX3]([NX3])","phosphateP":"[P]"}
    rec["groups"]={k:len(lig.GetSubstructMatches(Chem.MolFromSmarts(v))) for k,v in patt.items()}
    # crystal coords
    conf=lig.GetConformer()
    lxyz=[tuple(conf.GetAtomPosition(i)) for i in range(lig.GetNumAtoms())]
    # box
    bt=open(os.path.join(d,"run","receptor","receptor.box.txt")).read()
    bv={}
    for line in bt.splitlines():
        if "=" in line:
            k,v=line.split("=");bv[k.strip()]=float(v)
    c=[bv["center_x"],bv["center_y"],bv["center_z"]];s=[bv["size_x"],bv["size_y"],bv["size_z"]]
    rec["box"]={"center":c,"size":s}
    marg=min(min(s[i]/2-abs(p[i]-c[i]) for i in range(3)) for p in lxyz)
    rec["worstBoxMarginA"]=round(marg,3)
    # receptor with extra rigid
    rp=os.path.join(d,"run","receptor","receptor_with_extra.pdbqt")
    if not os.path.exists(rp): rp=os.path.join(d,"run","receptor","receptor.pdbqt")
    rec["receptorPdbqt"]=os.path.basename(rp)
    rxyz=[];rel=[]
    for l in open(rp):
        if l.startswith(("ATOM","HETATM")):
            t=l[77:79].strip()
            if t in ("HD","H"): continue
            rxyz.append((float(l[30:38]),float(l[38:46]),float(l[46:54])));rel.append(t)
    import numpy as np
    R=np.array(rxyz);L=np.array(lxyz)
    D=np.sqrt(((L[:,None,:]-R[None,:,:])**2).sum(-1))
    mind=D.min()
    rec["minLigRecHeavyDistA"]=round(float(mind),3)
    rec["nContactsBelow2_2A"]=int((D<2.2).sum())
    rec["nContactsBelow2_6A"]=int((D<2.6).sum())
    rec["nRecHeavyAtoms"]=len(rxyz)
    # HETATM near crystal ligand from original pdb
    pdb=open(os.path.join(SRC,pid.lower()+".pdb")).read()
    ligres=None
    hets={}
    for l in pdb.splitlines():
        if not l.startswith("HETATM") or l[16] not in (" ","A") or is_h(l): continue
        hets.setdefault((l[17:20].strip(),l[21],l[22:27].strip()),[]).append(l)
    # ligand residue: chain L first
    near=[];nwat=0;watnear=[]
    ligkeys=[k for k in hets if k[1]=="L"]
    for k,lines in hets.items():
        xyz=np.array([(float(l[30:38]),float(l[38:46]),float(l[46:54])) for l in lines])
        dd=np.sqrt(((xyz[:,None,:]-L[None,:,:])**2).sum(-1)).min()
        if dd>5.0: continue
        name=k[0]
        if k[1]=="L": continue
        if name in WATERS:
            nwat+=1; watnear.append(round(float(dd),2)); continue
        kept = name in METALS  # metals kept; cofactors handled separately
        near.append({"res":name,"chain":k[1],"seq":k[2],"nAtoms":len(lines),"minDistA":round(float(dd),2),"class":
                     "metal" if name in METALS else ("additive" if name in ADDITIVES else "other")})
    rec["hetWithin5A"]=sorted(near,key=lambda x:x["minDistA"])
    rec["watersWithin5A"]=nwat
    rec["watersWithin3_5A"]=sum(1 for x in watnear if x<=3.5)
    # non-standard residues present as HETATM anywhere (modified aa)
    MODAA={"MSE","CSO","CME","SEP","TPO","PTR","KCX","LLP","CSD","OCS","CSX","MLY","M3L","HYP","PCA","ABA","SAC","CGU","NEP","HIC","TYS","ALY","DAL","FME","SME","CAS","CSS","SNC"}
    modnear=[x for x in near if x["res"] in MODAA]
    rec["modifiedResiduesWithin5A"]=modnear
    rec["success_run3"]=bool(r3[pid].get("success"))
    rec["rmsd_run3"]=r3[pid].get("rmsdA")
    rec["cofactorsKept"]=r3[pid].get("cofactorsKept")
    rec["cofactorsNotKept"]=r3[pid].get("cofactorsNotKept")
    rec["classification"]=cls.get(pid,{}).get("classification")
    rec["bestRmsdInTopKA"]=cls.get(pid,{}).get("bestRmsdInTopKA")
    out[pid]=rec
    print(pid, rec["heavyAtoms"], rec["rotBonds"], rec["formalCharge"], rec["worstBoxMarginA"], rec["minLigRecHeavyDistA"], rec["watersWithin5A"], [x["res"] for x in near][:6], flush=True)

json.dump(out, open("/tmp/claude-0/phase2b/measure.json","w"), indent=1)
