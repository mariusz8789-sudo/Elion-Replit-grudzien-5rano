import json,os,sys,io,contextlib
from rdkit import Chem
from rdkit.Chem import AllChem
from rdkit import RDLogger
RDLogger.DisableLog('rdApp.*')
from meeko import MoleculePreparation, PDBQTWriterLegacy
from vina import Vina
TOPN="/tmp/genesis-astex-topn-9wvus3jl"
M=json.load(open("/tmp/claude-0/phase2b/measure.json"))
res={}
for pid in sorted(M):
    d=os.path.join(TOPN,pid)
    r=M[pid]
    try:
        mol=Chem.MolFromMolFile(os.path.join(d,"ligand.sdf"),removeHs=False)
        mol=Chem.RemoveHs(mol)
        molh=Chem.AddHs(mol,addCoords=True)
        setup=MoleculePreparation().prepare(molh)[0]
        pdbqt,ok,err=PDBQTWriterLegacy.write_string(setup)
        if not ok: raise ValueError("write:"+str(err))
        rp=os.path.join(d,"run","receptor",r["receptorPdbqt"])
        v=Vina(sf_name="vina",seed=42,verbosity=0)
        v.set_receptor(rp)
        c=r["box"]["center"];s=r["box"]["size"]
        v.compute_vina_maps(center=c,box_size=s)
        v.set_ligand_from_string(pdbqt)
        with contextlib.redirect_stdout(io.StringIO()):
            sc=v.score()
        # local minimisation for reference (reported separately, NOT used as the headline)
        with contextlib.redirect_stdout(io.StringIO()):
            v.optimize()
            om=v.score()
        res[pid]={"crystalPoseVinaTotal":round(float(sc[0]),3),"crystalPoseInter":round(float(sc[1]),3),
                  "crystalPoseIntra":round(float(sc[2]),3),
                  "afterLocalOptTotal":round(float(om[0]),3)}
    except Exception as e:
        res[pid]={"error":str(e)[:200]}
    print(pid,res[pid],flush=True)
json.dump(res,open("/tmp/claude-0/phase2b/xtalscore.json","w"),indent=1)
