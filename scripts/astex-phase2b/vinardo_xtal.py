import json,os,io,contextlib
from rdkit import Chem
from rdkit import RDLogger; RDLogger.DisableLog('rdApp.*')
from meeko import MoleculePreparation, PDBQTWriterLegacy
from vina import Vina
M=json.load(open("combined.json"))
R5={c['pdbId']:c for c in json.load(open("/home/claude/Elion-Replit-grudzien-5rano/docs/evidence/astex-vinardo-rescore.json"))['cases']}
TOPN="/tmp/genesis-astex-topn-9wvus3jl"
B=[p for p in M if M[p]["classification"]=="B_SAMPLING_FAILURE"]
for p in sorted(M):
    r=M[p]
    try:
        lig=Chem.RemoveHs(Chem.MolFromMolFile(os.path.join(TOPN,p,"ligand.sdf"),removeHs=False))
        molh=Chem.AddHs(lig,addCoords=True)
        pq,ok,err=PDBQTWriterLegacy.write_string(MoleculePreparation().prepare(molh)[0])
        v=Vina(sf_name="vinardo",seed=42,verbosity=0)
        v.set_receptor(os.path.join(TOPN,p,"run","receptor",r["receptorPdbqt"]))
        v.compute_vina_maps(center=r["box"]["center"],box_size=r["box"]["size"])
        v.set_ligand_from_string(pq)
        with contextlib.redirect_stdout(io.StringIO()):
            s=v.score(); v.optimize(); o=v.score()
        r["vinardoCrystalPose"]=round(float(s[0]),3)
        r["vinardoCrystalPoseOpt"]=round(float(o[0]),3)
    except Exception as e:
        r["vinardoCrystalPose"]=None;r["vinardoErr"]=str(e)[:120]
    best=min(x["vinardoScoreKcalMol"] for x in R5[p]["poses"])
    r["vinardoBestOfStoredPoses"]=best
    if r["vinardoCrystalPose"] is not None:
        r["vinardoDeltaOpt"]=round(r["vinardoCrystalPoseOpt"]-best,3)
json.dump(M,open("combined.json","w"),indent=1)
print("%-6s %7s %7s | %7s %7s"%("PDB","dOptVina","dOptVinardo","xtalOpt","vrdBest"))
for p in sorted(B,key=lambda x:M[x]["deltaOptMinusRank1"]):
    r=M[p]; print("%-6s %8.2f %11.2f | %7.2f %7.2f"%(p,r["deltaOptMinusRank1"],r["vinardoDeltaOpt"],r["vinardoCrystalPoseOpt"],r["vinardoBestOfStoredPoses"]))
import statistics
for n,g in (("SUCC",[p for p in M if M[p]["success_run3"]]),("B",B)):
    v=[M[p]["vinardoDeltaOpt"] for p in g]
    print(n,"vinardoDeltaOpt med=%.2f  frac<0=%.2f"%(statistics.median(v),sum(1 for x in v if x<0)/len(v)))
