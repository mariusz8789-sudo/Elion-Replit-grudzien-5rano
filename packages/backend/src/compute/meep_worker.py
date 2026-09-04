#!/usr/bin/env python3
"""PyMeep Maxwell/FDTD worker called by the Genesis Node adapter.

Protocol: argv[1] is a JSON request and stdout is one JSON object only. The worker
never replaces a missing runtime with a formula. It imports the installed PyMeep
runtime and executes the declared finite-difference time-domain simulation.

Supported physical scope: one-dimensional, normal-incidence plane wave at a
lossless, non-dispersive dielectric interface. This is a reference integration,
not a general Maxwell solver API, and never models ship invisibility, teleportation,
or the Philadelphia Experiment.
"""

from __future__ import annotations

import json
import math
import os
import sys


def emit(payload: dict) -> None:
    """Write one JSON response and bypass PyMeep's process-exit stdout diagnostics."""
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()
    os._exit(0)


def finite_float(value: object, label: str, low: float, high: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{label}_must_be_numeric") from error
    if not math.isfinite(parsed) or parsed < low or parsed > high:
        raise ValueError(f"{label}_out_of_range_{low}_to_{high}")
    return parsed


def finite_int(value: object, label: str, low: int, high: int) -> int:
    if isinstance(value, bool):
        raise ValueError(f"{label}_must_be_integer")
    try:
        parsed = int(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{label}_must_be_integer") from error
    if parsed < low or parsed > high:
        raise ValueError(f"{label}_out_of_range_{low}_to_{high}")
    return parsed


def simulate_interface(mp, n1: float, n2: float, frequency: float, resolution: int) -> dict[str, float]:
    """Runs the official Meep reflected-flux subtraction pattern for normal incidence."""
    pml = 1.0
    interior_z = 10.0
    cell_z = interior_z + 2.0 * pml
    source_z = -0.5 * cell_z + pml
    reflection_monitor_z = -0.25 * cell_z
    pulse_width = max(0.08, min(0.25, frequency * 0.25))
    forward_kz = n1 * frequency

    source = mp.Source(
        mp.GaussianSource(frequency, fwidth=pulse_width),
        component=mp.Ex,
        center=mp.Vector3(0, 0, source_z),
    )

    def simulation(interface: bool):
        geometry = []
        if interface:
            geometry = [
                mp.Block(
                    center=mp.Vector3(0, 0, 0.25 * cell_z),
                    size=mp.Vector3(mp.inf, mp.inf, 0.5 * cell_z),
                    material=mp.Medium(index=n2),
                )
            ]
        return mp.Simulation(
            cell_size=mp.Vector3(0, 0, cell_z),
            geometry=geometry,
            default_material=mp.Medium(index=n1),
            boundary_layers=[mp.PML(pml)],
            sources=[source],
            k_point=mp.Vector3(0, 0, forward_kz),
            dimensions=1,
            resolution=resolution,
        )

    reference = simulation(interface=False)
    incident_monitor = reference.add_flux(
        frequency, 0, 1, mp.FluxRegion(center=mp.Vector3(0, 0, reflection_monitor_z))
    )
    reference.run(
        until_after_sources=mp.stop_when_fields_decayed(
            50, mp.Ex, mp.Vector3(0, 0, source_z), 1e-9
        )
    )
    incident_flux = float(mp.get_fluxes(incident_monitor)[0])
    if not math.isfinite(incident_flux) or incident_flux <= 0:
        reference.reset_meep()
        raise RuntimeError("nonpositive_incident_flux")
    incident_flux_data = reference.get_flux_data(incident_monitor)
    reference.reset_meep()

    interface_sim = simulation(interface=True)
    reflected_monitor = interface_sim.add_flux(
        frequency, 0, 1, mp.FluxRegion(center=mp.Vector3(0, 0, reflection_monitor_z))
    )
    interface_sim.load_minus_flux_data(reflected_monitor, incident_flux_data)
    interface_sim.run(
        until_after_sources=mp.stop_when_fields_decayed(
            50, mp.Ex, mp.Vector3(0, 0, source_z), 1e-9
        )
    )
    reflected_flux = -float(mp.get_fluxes(reflected_monitor)[0])
    interface_sim.reset_meep()

    reflectance = reflected_flux / incident_flux
    transmittance = 1.0 - reflectance
    analytic_reflectance = ((n1 - n2) / (n1 + n2)) ** 2
    analytic_transmittance = 4.0 * n1 * n2 / (n1 + n2) ** 2
    return {
        "incidentFlux": incident_flux,
        "reflectedFlux": reflected_flux,
        "computedReflectance": reflectance,
        "computedTransmittance": transmittance,
        "analyticReflectance": analytic_reflectance,
        "analyticTransmittance": analytic_transmittance,
        "reflectanceAbsoluteError": abs(reflectance - analytic_reflectance),
        "transmittanceAbsoluteError": abs(transmittance - analytic_transmittance),
        "energyClosure": reflectance + transmittance,
        "n1": n1,
        "n2": n2,
        "frequency": frequency,
        "resolution": resolution,
        "pulseWidth": pulse_width,
        "forwardBlochKz": forward_kz,
    }


def simulate_pec_reflection(mp, frequency: float, resolution: int) -> dict[str, float]:
    """Real 1D FDTD reflection from a declared ideal-conductor half-space."""
    pml = 1.0
    interior_z = 10.0
    cell_z = interior_z + 2.0 * pml
    source_z = -0.5 * cell_z + pml
    monitor_z = -0.25 * cell_z
    sample_z = -0.5
    pulse_width = max(0.08, min(0.25, frequency * 0.25))
    source = mp.Source(
        mp.GaussianSource(frequency, fwidth=pulse_width),
        component=mp.Ex,
        center=mp.Vector3(0, 0, source_z),
    )

    def simulation(with_pec: bool):
        geometry = []
        if with_pec:
            geometry = [
                mp.Block(
                    center=mp.Vector3(0, 0, 0.25 * cell_z),
                    size=mp.Vector3(mp.inf, mp.inf, 0.5 * cell_z),
                    material=mp.metal,
                )
            ]
        return mp.Simulation(
            cell_size=mp.Vector3(0, 0, cell_z),
            geometry=geometry,
            boundary_layers=[mp.PML(pml)],
            sources=[source],
            dimensions=1,
            resolution=resolution,
        )

    reference = simulation(with_pec=False)
    incident_monitor = reference.add_flux(
        frequency, 0, 1, mp.FluxRegion(center=mp.Vector3(0, 0, monitor_z))
    )
    reference.run(
        until_after_sources=mp.stop_when_fields_decayed(
            50, mp.Ex, mp.Vector3(0, 0, source_z), 1e-9
        )
    )
    incident_flux = float(mp.get_fluxes(incident_monitor)[0])
    if not math.isfinite(incident_flux) or incident_flux <= 0:
        reference.reset_meep()
        raise RuntimeError("nonpositive_incident_flux")
    incident_flux_data = reference.get_flux_data(incident_monitor)
    reference.reset_meep()

    pec = simulation(with_pec=True)
    reflected_monitor = pec.add_flux(
        frequency, 0, 1, mp.FluxRegion(center=mp.Vector3(0, 0, monitor_z))
    )
    pec.load_minus_flux_data(reflected_monitor, incident_flux_data)
    peak_ex = 0.0
    peak_hy = 0.0

    def sample_fields(sim):
        nonlocal peak_ex, peak_hy
        point = mp.Vector3(0, 0, sample_z)
        peak_ex = max(peak_ex, abs(complex(sim.get_field_point(mp.Ex, point))))
        peak_hy = max(peak_hy, abs(complex(sim.get_field_point(mp.Hy, point))))

    pec.run(
        mp.at_every(0.05, sample_fields),
        until_after_sources=mp.stop_when_fields_decayed(
            50, mp.Ex, mp.Vector3(0, 0, source_z), 1e-9
        )
    )
    reflected_flux = -float(mp.get_fluxes(reflected_monitor)[0])
    pec.reset_meep()
    reflectance = reflected_flux / incident_flux
    return {
        "incidentFlux": incident_flux,
        "reflectedFlux": reflected_flux,
        "computedReflectance": reflectance,
        "expectedReflectance": 1.0,
        "reflectanceAbsoluteError": abs(reflectance - 1.0),
        "energyClosure": reflectance,
        "frequency": frequency,
        "resolution": resolution,
        "pulseWidth": pulse_width,
        "fieldSampleZ": sample_z,
        "peakAbsExAtSample": peak_ex,
        "peakAbsHyAtSample": peak_hy,
    }


def main() -> None:
    try:
        request = json.loads(sys.argv[1]) if len(sys.argv) > 1 else {}
    except Exception as error:  # noqa: BLE001
        emit({"ok": False, "error": f"bad_request: {error}"})

    try:
        import meep as mp
    except Exception as error:  # noqa: BLE001
        emit({"ok": False, "error": f"pymeep_unavailable: {str(error)[:180]}"})

    mp.verbosity(0)
    command = request.get("cmd")
    if command == "detect":
        emit({"ok": True, "version": mp.__version__})

    try:
        if command == "reference":
            data = simulate_interface(mp, 1.0, 2.0, 1.0, 80)
            tolerance = 0.003
            emit({
                "ok": True,
                "version": mp.__version__,
                "case": "normal-incidence n1=1 n2=2 lossless dielectric interface",
                "expectedTransmittance": 8.0 / 9.0,
                "actualTransmittance": data["computedTransmittance"],
                "tolerance": tolerance,
                "pass": data["transmittanceAbsoluteError"] <= tolerance,
                "data": data,
            })
        if command == "pec_reflection":
            frequency = finite_float(request.get("frequency", 1.0), "frequency", 0.2, 2.0)
            resolution = finite_int(request.get("resolution", 80), "resolution", 40, 160)
            data = simulate_pec_reflection(mp, frequency, resolution)
            tolerance = 0.003
            emit({
                "ok": True,
                "version": mp.__version__,
                "data": data,
                "meta": {
                    "method": "FDTD",
                    "dimension": "1D normal incidence",
                    "geometry": "ideal-conductor (PEC) half-space z>0 via mp.metal",
                    "source": "Ex Gaussian pulse",
                    "boundaries": "PML",
                    "measurement": "Meep reflected-flux incident-field subtraction; expected R=1 for PEC",
                    "modelScope": "ideal PEC reflection only; no finite-conductivity material fit or 3D object",
                },
                "expectedReflectance": 1.0,
                "actualReflectance": data["computedReflectance"],
                "tolerance": tolerance,
                "pass": data["reflectanceAbsoluteError"] <= tolerance,
            })
        if command == "interface":
            n1 = finite_float(request.get("n1", 1.0), "n1", 1.0, 4.0)
            n2 = finite_float(request.get("n2", 2.0), "n2", 1.0, 4.0)
            frequency = finite_float(request.get("frequency", 1.0), "frequency", 0.2, 2.0)
            resolution = finite_int(request.get("resolution", 80), "resolution", 40, 160)
            data = simulate_interface(mp, n1, n2, frequency, resolution)
            emit({
                "ok": True,
                "version": mp.__version__,
                "data": data,
                "meta": {
                    "method": "FDTD",
                    "dimension": "1D normal incidence",
                    "polarization": "Ex",
                    "measurement": "Meep reflected-flux incident-field subtraction; T=1-R for declared lossless media",
                    "modelScope": "planar non-dispersive dielectric interface only",
                },
            })
        emit({"ok": False, "error": f"unknown_cmd: {command}"})
    except Exception as error:  # noqa: BLE001
        emit({"ok": False, "error": f"meep_execution_failed: {str(error)[:240]}"})


if __name__ == "__main__":
    main()
