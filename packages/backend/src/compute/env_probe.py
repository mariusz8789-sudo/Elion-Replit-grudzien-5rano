#!/usr/bin/env python3
"""Runtime scientific-environment probe (Priority 1) — REAL detection.

Emits one JSON line describing the host runtime and, for every target scientific
engine, an HONEST status derived from an actual import/version or binary probe —
never inferred from a package name alone.

Statuses: AVAILABLE | NOT_INSTALLED | BLOCKED_BY_RUNTIME | BLOCKED_BY_LICENSE |
BLOCKED_BY_RESOURCES | UNVALIDATED. "AVAILABLE" here means "imports/executes and
reports a version"; a capability only becomes AVAILABLE in the Toolchain Registry
after a real reference case passes (that is validated separately).
"""
import json
import os
import platform
import shutil
import subprocess
import sys


def py_probe(module, version_attr="__version__"):
    try:
        m = __import__(module)
        v = getattr(m, version_attr, None)
        if v is None:
            v = getattr(getattr(m, "version", None), "__version__", None)
        return {"status": "AVAILABLE", "version": str(v) if v else "?"}
    except ImportError:
        return {"status": "NOT_INSTALLED", "version": None}
    except Exception as e:  # noqa: BLE001 — import present but broken runtime
        return {"status": "BLOCKED_BY_RUNTIME", "version": None, "reason": str(e)[:140]}


def bin_probe(name, version_args=("--version",)):
    path = shutil.which(name)
    if not path:
        return {"status": "NOT_INSTALLED", "path": None, "version": None}
    try:
        out = subprocess.run([path, *version_args], capture_output=True, text=True, timeout=15)
        ver = (out.stdout or out.stderr).strip().splitlines()
        return {"status": "AVAILABLE", "path": path, "version": ver[0][:80] if ver else "?"}
    except Exception as e:  # noqa: BLE001
        return {"status": "BLOCKED_BY_RUNTIME", "path": path, "version": None, "reason": str(e)[:120]}


def detect_gpu():
    if shutil.which("nvidia-smi"):
        try:
            out = subprocess.run(["nvidia-smi", "-L"], capture_output=True, text=True, timeout=10)
            if out.returncode == 0 and out.stdout.strip():
                return {"gpu": True, "detail": out.stdout.strip().splitlines()[0][:80]}
        except Exception:  # noqa: BLE001
            pass
    if any(os.path.exists(p) for p in ("/dev/nvidia0", "/dev/nvidiactl")):
        return {"gpu": True, "detail": "/dev/nvidia* present"}
    return {"gpu": False, "cuda": shutil.which("nvcc") is not None}


def mem_gb():
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                if line.startswith("MemTotal"):
                    return round(int(line.split()[1]) / (1024 * 1024), 1)
    except Exception:  # noqa: BLE001
        return None
    return None


def disk_free_gb():
    try:
        st = os.statvfs(".")
        return round(st.f_bavail * st.f_frsize / (1024 ** 3), 1)
    except Exception:  # noqa: BLE001
        return None


def main():
    runtime = {
        "os": platform.system(),
        "osRelease": platform.release(),
        "arch": platform.machine(),
        "python": platform.python_version(),
        "cpuCount": os.cpu_count(),
        "memoryGb": mem_gb(),
        "diskFreeGb": disk_free_gb(),
        "processExecution": True,  # ten probe sam jest dowodem wykonywania procesów
        **detect_gpu(),
    }

    # Silniki naukowe — sonda importu (Python) lub binarna. Nazwy pakietów -> moduł.
    py_engines = {
        "rdkit": "rdkit",
        "openmm": "openmm",
        "pyscf": "pyscf",
        "mdanalysis": "MDAnalysis",
        "pdbfixer": "pdbfixer",
        "biopython": "Bio",
        "prolif": "prolif",
        "deepchem": "deepchem",
        "meeko": "meeko",
        "openbabel_py": "openbabel",
        "xtb_py": "xtb",
        "psi4": "psi4",
        "vina_py": "vina",
    }
    bin_engines = {
        "vina": ("vina", ("--version",)),
        "obabel": ("obabel", ("-V",)),
        "gromacs": ("gmx", ("--version",)),
        "xtb": ("xtb", ("--version",)),
        "orca": ("orca", ()),
    }

    engines = {}
    for key, mod in py_engines.items():
        engines[key] = {"kind": "python", "module": mod, **py_probe(mod)}
    for key, (binname, args) in bin_engines.items():
        if key in engines and engines[key].get("status") == "AVAILABLE":
            continue
        engines[key + "_bin" if key in engines else key] = {"kind": "binary", "binary": binname, **bin_probe(binname, args)}

    print(json.dumps({"ok": True, "runtime": runtime, "engines": engines}))


if __name__ == "__main__":
    main()
