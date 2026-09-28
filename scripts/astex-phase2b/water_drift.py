import json,os,io,contextlib,numpy as np,tempfile
from rdkit import Chem
from rdkit.Chem import rdMolAlign
from rdkit import RDLogger; RDLogger.DisableLog('rdApp.*')
from meeko import MoleculePreparation, PDBQTWriterLegacy, PDBQTMolecule, RDKitMolCreate
from vina import Vina
M=json.load(open("combined.json"))
SRC="/tmp/claude-0/p2r/joined/astex"; TOPN="/tmp/genesis-astex-topn-9wvus3jl"
POLAR=("N","O","S")
for p in sorted(M):
    r=M[p]
    lig=Chem.RemoveHs(Chem.MolFromMolFile(os.path.join(TOPN,p,"ligand.sdf"),removeHs=False))
    conf=lig.GetConformer(); L=np.array([list(conf.GetAtomPosition(i)) for i in range(lig.GetNumAtoms())])
    polar_idx=[i for i,a in enumerate(lig.GetAtoms()) if a.GetSymbol() in POLAR]
    LP=L[polar_idx] if polar_idx else L[:0]
    txt=open(os.path.join(SRC,p.lower()+".pdb")).read()
    wat=[];prot=[]
    for l in txt.splitlines():
        if l[16:17] not in (" ","A"): continue
        if l[76:78].strip().upper() in ("H","D"): continue
        if l.startswith("HETATM") and l[17:20].strip() in ("HOH","WAT","DOD"):
            wat.append((float(l[30:38]),float(l[38:46]),float(l[46:54])))
        elif l.startswith("ATOM") and l[76:78].strip().upper() in POLAR:
            prot.append((float(l[30:38]),float(l[38:46]),float(l[46:54])))
    nb=0
    if wat and len(LP):
        W=np.array(wat);P=np.array(prot)
        d1=np.sqrt(((W[:,None,:]-LP[None,:,:])**2).sum(-1)).min(1)
        d2=np.sqrt(((W[:,None,:]-P[None,:,:])**2).sum(-1)).min(1)
        nb=int(((d1<=3.5)&(d2<=3.5)).sum())
    r["bridgingWaters"]=nb
    # relaxation drift
    try:
        molh=Chem.AddHs(lig,addCoords=True)
        setup=MoleculePreparation().prepare(molh)[0]
        pq,ok,err=PDBQTWriterLegacy.write_string(setup)
        v=Vina(sf_name="vina",seed=42,verbosity=0)
        v.set_receptor(os.path.join(TOPN,p,"run","receptor",r["receptorPdbqt"]))
        v.compute_vina_maps(center=r["box"]["center"],box_size=r["box"]["size"])
        v.set_ligand_from_string(pq)
        with contextlib.redirect_stdout(io.StringIO()): v.optimize()
        tf=tempfile.mktemp(suffix=".pdbqt"); v.write_pose(tf,overwrite=True)
        pm=PDBQTMolecule(open(tf).read(),skip_typing=True)
        mm=Chem.RemoveHs(RDKitMolCreate.from_pdbqt_mol(pm)[0])
        s=Chem.Mol(mm); s.RemoveAllConformers(); s.AddConformer(Chem.Conformer(mm.GetConformers()[0]),assignId=True)
        r["crystalPoseRelaxDriftA"]=round(float(rdMolAlign.CalcRMS(s,lig)),3)
        os.unlink(tf)
    except Exception as e:
        r["crystalPoseRelaxDriftA"]=None; r["driftErr"]=str(e)[:100]
    print(p,r["bridgingWaters"],r["crystalPoseRelaxDriftA"],flush=True)
json.dump(M,open("combined.json","w"),indent=1)
