"""OpenMM MD reference worker for Genesis Fabric.

Runs only a bounded public PDB 1VII CPU benchmark. It does not simulate HIV,
10E8, membranes, a ligand complex, affinity, or vaccine efficacy.
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path

# Must be set before OpenMM CPU platform creation for reproducible reference runs.
os.environ.setdefault('OPENMM_CPU_THREADS', '1')
EXPECTED_PDB = '1VII.pdb'
# SHA-256 artefaktu pobranego z oficjalnego RCSB PDB: https://files.rcsb.org/download/1VII.pdb
EXPECTED_PDB_SHA256 = 'ebecd3d6c0dd9c8b34bcbea9b57c73e4f73986cc674150f0aaa0687db66e77ef'
SEED = 20260821


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def detect():
    try:
        import openmm
        from openmm import app  # noqa: F401
    except Exception as exc:  # noqa: BLE001
        return {'ok': False, 'error': f'openmm_unavailable:{exc}'}
    root = os.environ.get('GENESIS_OPENMM_DATA_DIR', '')
    artifact = Path(root) / EXPECTED_PDB
    if not root:
        return {'ok': False, 'error': 'missing_GENESIS_OPENMM_DATA_DIR'}
    if not artifact.is_file():
        return {'ok': False, 'error': f'missing_md_artifact:{EXPECTED_PDB}'}
    artifact_sha256 = sha256(artifact)
    if artifact_sha256 != EXPECTED_PDB_SHA256:
        return {'ok': False, 'error': f'md_artifact_checksum_mismatch:{EXPECTED_PDB}'}
    platforms = [openmm.Platform.getPlatform(i).getName() for i in range(openmm.Platform.getNumPlatforms())]
    if 'CPU' not in platforms:
        return {'ok': False, 'error': 'openmm_cpu_platform_unavailable'}
    return {'ok': True, 'version': openmm.__version__, 'platforms': platforms, 'pdbSha256': artifact_sha256}


def run_reference(steps: int):
    from openmm import LangevinMiddleIntegrator, Platform, unit, app
    artifact = Path(os.environ['GENESIS_OPENMM_DATA_DIR']) / EXPECTED_PDB
    pdb = app.PDBFile(str(artifact))
    forcefield = app.ForceField('amber14-all.xml', 'implicit/obc2.xml')
    modeller = app.Modeller(pdb.topology, pdb.positions)
    modeller.addHydrogens(forcefield)
    system = forcefield.createSystem(modeller.topology, nonbondedMethod=app.NoCutoff, constraints=app.HBonds)
    integrator = LangevinMiddleIntegrator(300 * unit.kelvin, 1 / unit.picosecond, 0.002 * unit.picoseconds)
    integrator.setRandomNumberSeed(SEED)
    platform = Platform.getPlatformByName('CPU')
    simulation = app.Simulation(modeller.topology, system, integrator, platform)
    simulation.context.setPositions(modeller.positions)
    simulation.context.setVelocitiesToTemperature(300 * unit.kelvin, SEED)

    def energy():
        return simulation.context.getState(getEnergy=True).getPotentialEnergy().value_in_unit(unit.kilojoule_per_mole)

    before = energy()
    simulation.minimizeEnergy()
    minimized = energy()
    simulation.step(steps)
    after = energy()
    return {
        'ok': True,
        'data': {
            'atomCountAfterHydrogenAddition': system.getNumParticles(),
            'potentialEnergyBeforeKjPerMol': before,
            'potentialEnergyMinimizedKjPerMol': minimized,
            'potentialEnergyAfterKjPerMol': after,
            'simulatedPicoseconds': steps * 0.002,
        },
        'engine': f'OpenMM {__import__("openmm").__version__} CPU',
        'provenance': {
            'pdbId': '1VII', 'pdbSha256': sha256(artifact), 'forceField': 'amber14-all.xml + implicit/obc2.xml',
            'solventModel': 'implicit OBC2', 'integrator': 'LangevinMiddleIntegrator',
            'temperatureKelvin': 300, 'frictionPerPicosecond': 1, 'timestepPicoseconds': 0.002,
            'steps': steps, 'seed': SEED, 'platform': 'CPU', 'cpuThreads': 1,
            'classification': 'COMPUTATIONAL_RESULT',
            'requiredEnvironmentVariables': ['GENESIS_OPENMM_PYTHON', 'GENESIS_OPENMM_DATA_DIR'],
        },
    }


def main():
    try:
        req = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    except Exception as exc:  # noqa: BLE001
        print(json.dumps({'ok': False, 'error': f'bad_request:{exc}'})); return
    if req.get('cmd') == 'detect':
        print(json.dumps(detect())); return
    if req.get('cmd') == 'reference':
        status = detect()
        if not status.get('ok'):
            print(json.dumps(status)); return
        steps = req.get('steps', 500)
        if not isinstance(steps, int) or steps < 100 or steps > 1000:
            print(json.dumps({'ok': False, 'error': 'invalid_steps'})); return
        try:
            print(json.dumps(run_reference(steps)))
        except Exception as exc:  # noqa: BLE001
            print(json.dumps({'ok': False, 'error': f'openmm_execution_failed:{exc}'}))
        return
    print(json.dumps({'ok': False, 'error': 'unknown_command'}))


if __name__ == '__main__':
    main()
