import json,os,numpy as np,re
from rdkit import Chem
from rdkit import RDLogger; RDLogger.DisableLog('rdApp.*')
from meeko import PDBQTMolecule, RDKitMolCreate
M=json.load(open("combined.json"))
TOPN="/tmp/genesis-astex-topn-9wvus3jl"

def kabsch_rmsd_sq(P,Q):
    # best-fit P onto Q, return sum of squared deviations
    if len(P)==1: return 0.0
    Pc=P-P.mean(0);Qc=Q-Q.mean(0)
    H=Pc.T@Qc; U,S,Vt=np.linalg.svd(H)
    d=np.sign(np.linalg.det(Vt.T@U.T))
    D=np.diag([1,1,d]); R=Vt.T@D@U.T
    Pr=(R@Pc.T).T
    return float(((Pr-Qc)**2).sum())

for p in sorted(M):
    d=os.path.join(TOPN,p)
    lp=os.path.join(d,"run","dock","ligand.pdbqt")
    try:
        txt=open(lp).read()
        # rigid fragments: atoms grouped by torsion-tree node
        frags=[];stack=[];cur=[]
        serial_order=[]
        for l in txt.splitlines():
            if l.startswith("ROOT"): cur=[]
            elif l.startswith("ENDROOT"): frags.append(cur); cur=None
            elif l.startswith("BRANCH"): stack.append(cur); cur=[]
            elif l.startswith("ENDBRANCH"): frags.append(cur); cur=stack.pop()
            elif l.startswith(("ATOM","HETATM")):
                t=l[77:79].strip()
                idx=len(serial_order)
                serial_order.append(t)
                if t in ("HD","H","G0"):  # skip polar H and Meeko ring-closure pseudo-atoms
                    pass
                if cur is not None: cur.append(idx)
        frags=[f for f in frags if f]
        pm=PDBQTMolecule(txt,skip_typing=True)
        gen=RDKitMolCreate.from_pdbqt_mol(pm)[0]   # includes H
        # map pdbqt atom order -> rdkit atom order: RDKitMolCreate preserves pdbqt order for heavy+polarH? assume index==index
        genH=gen
        heavy_pdbqt=[i for i,t in enumerate(serial_order) if t not in ("HD","H","G0")]
        xtal=Chem.RemoveHs(Chem.MolFromMolFile(os.path.join(d,"ligand.sdf"),removeHs=False))
        genn=Chem.RemoveHs(Chem.Mol(gen))
        if genn.GetNumAtoms()!=xtal.GetNumAtoms(): raise ValueError("atom count %d vs %d"%(genn.GetNumAtoms(),xtal.GetNumAtoms()))
        # coords
        gc=genn.GetConformer(); xc=xtal.GetConformer()
        G=np.array([list(gc.GetAtomPosition(i)) for i in range(genn.GetNumAtoms())])
        X=np.array([list(xc.GetAtomPosition(i)) for i in range(xtal.GetNumAtoms())])
        matches=xtal.GetSubstructMatches(genn,uniquify=False,useChirality=False,maxMatches=2000)
        if not matches: raise ValueError("no_match")
        # heavy index in genn corresponds to order of heavy atoms in pdbqt
        pos_of_pdbqt_heavy={s:k for k,s in enumerate(heavy_pdbqt)}
        fragsH=[[pos_of_pdbqt_heavy[i] for i in f if i in pos_of_pdbqt_heavy] for f in frags]
        fragsH=[f for f in fragsH if f]
        best=None
        for mt in matches:
            tot=0.0
            for f in fragsH:
                P=G[f]; Q=X[list(mt[i] for i in f)]
                tot+=kabsch_rmsd_sq(P,Q)
            rms=(tot/genn.GetNumAtoms())**0.5
            if best is None or rms<best: best=rms
        M[p]["rigidFragmentRmsdFloorA"]=round(best,3)
        M[p]["nRigidFragments"]=len(fragsH)
    except Exception as e:
        M[p]["rigidFragmentRmsdFloorA"]=None; M[p]["floorErr"]=str(e)[:120]
    print(p,M[p]["rigidFragmentRmsdFloorA"],M[p].get("nRigidFragments"),M[p].get("floorErr",""),flush=True)
json.dump(M,open("combined.json","w"),indent=1)
