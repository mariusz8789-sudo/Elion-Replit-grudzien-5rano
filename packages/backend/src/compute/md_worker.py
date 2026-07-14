#!/usr/bin/env python3
"""Molecular-dynamics worker — REAL MD via OpenMM, called by the Node adapter.

OpenMM is mature, open-source (MIT/LGPL) MD. Short-lived subprocess. Protocol:
argv[1] is a JSON request {"cmd": ...}. Output is a single JSON line. No OpenMM
-> import fails and the adapter treats the capability as unavailable (never faked).

Commands:
  detect                 -> { ok, version, platforms }
  reference {steps?}     -> TIP3P water-box minimization + short NVT (integration
                            validation). Reports energy drop on minimization and a
                            controlled temperature — NOT biological stability.

Units: energy kJ/mol, temperature K, time ps. A short software-validation
trajectory says nothing about biological stability; that is stated explicitly.
"""
import json
import sys


def platforms(mm):
    return [mm.Platform.getPlatform(i).getName() for i in range(mm.Platform.getNumPlatforms())]


def main():
    try:
        req = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": "bad_request: %s" % e}))
        return

    cmd = req.get("cmd")

    try:
        import openmm as mm
        from openmm import app, unit, LangevinMiddleIntegrator
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": "openmm_unavailable: %s" % e}))
        return

    if cmd == "detect":
        print(json.dumps({"ok": True, "version": mm.version.version, "platforms": platforms(mm)}))
        return

    if cmd == "reference":
        try:
            steps = int(req.get("steps", 500))
            steps = max(100, min(steps, 5000))
            box = float(req.get("boxNm", 1.8))
            box = max(1.5, min(box, 2.4))
            seed = int(req.get("seed", 42))

            ff = app.ForceField("amber14/tip3p.xml")
            modeller = app.Modeller(app.Topology(), [])
            modeller.addSolvent(ff, boxSize=unit.Quantity((box, box, box), unit.nanometers), model="tip3p")
            n_waters = modeller.topology.getNumResidues()
            n_atoms = modeller.topology.getNumAtoms()

            system = ff.createSystem(
                modeller.topology, nonbondedMethod=app.PME,
                nonbondedCutoff=0.9 * unit.nanometer, constraints=app.HBonds, rigidWater=True,
            )
            integrator = LangevinMiddleIntegrator(300 * unit.kelvin, 1.0 / unit.picosecond, 0.002 * unit.picoseconds)
            integrator.setRandomNumberSeed(seed)
            platform = mm.Platform.getPlatformByName("CPU")
            sim = app.Simulation(modeller.topology, system, integrator, platform)
            sim.context.setPositions(modeller.positions)

            def pe():
                return sim.context.getState(getEnergy=True).getPotentialEnergy().value_in_unit(unit.kilojoule_per_mole)

            e_initial = pe()
            sim.minimizeEnergy(maxIterations=200)
            e_min = pe()
            sim.context.setVelocitiesToTemperature(300 * unit.kelvin, seed)
            sim.step(steps)

            state = sim.context.getState(getEnergy=True)
            e_prod = state.getPotentialEnergy().value_in_unit(unit.kilojoule_per_mole)
            ke = state.getKineticEnergy().value_in_unit(unit.kilojoule_per_mole)
            dof = 3 * n_atoms - system.getNumConstraints() - 3
            kB = 0.0083144621  # kJ/mol/K
            temp = 2 * ke / (dof * kB) if dof > 0 else 0.0

            passed = (e_min < e_initial) and (150.0 < temp < 450.0)
            print(json.dumps({
                "ok": True, "version": mm.version.version, "platform": platform.getName(),
                "case": "TIP3P water box, minimization + %d-step NVT @300K" % steps,
                "data": {
                    "waters": n_waters, "atoms": n_atoms, "steps": steps,
                    "timestepPs": 0.002, "temperatureK": round(temp, 1),
                    "potentialEnergyInitialKjmol": round(e_initial, 1),
                    "potentialEnergyMinimizedKjmol": round(e_min, 1),
                    "potentialEnergyProductionKjmol": round(e_prod, 1),
                    "forceField": "amber14/tip3p.xml", "seed": seed,
                },
                "pass": bool(passed),
                "expectation": "minimization lowers potential energy; NVT holds T in 150-450 K",
            }))
        except Exception as e:  # noqa: BLE001
            print(json.dumps({"ok": False, "error": "md_failed: %s" % str(e)[:180]}))
        return

    print(json.dumps({"ok": False, "error": "unknown_cmd: %s" % cmd}))


if __name__ == "__main__":
    main()
