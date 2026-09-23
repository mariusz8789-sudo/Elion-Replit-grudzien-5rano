"""
Genesis Local AI-Video — Stage-B admission check (read-only, no installs).

Run this AFTER you have followed README.md's install command yourself, to
get one structured, honest verdict on whether this machine's environment
is actually ready to attempt a real local generation. This script:
  - never installs anything,
  - never downloads anything,
  - never modifies the system or any environment variable,
  - never loads a model checkpoint into memory (existence + SHA-256 only),
  - always exits 0 (it prints an admission verdict; it is a diagnostic,
    not a gate that fails your shell script — check the JSON "admitted"
    field yourself).

Usage:
    .venv/Scripts/python.exe scripts/check_admission.py
    .venv/Scripts/python.exe scripts/check_admission.py --model-id my-model --checkpoint C:\\path\\to\\checkpoint.safetensors --checkpoint-sha256 <64-hex-chars>
"""
from __future__ import annotations
import argparse
import hashlib
import importlib.util
import json
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path


def sha256_file(path: Path) -> str | None:
    try:
        h = hashlib.sha256()
        with path.open("rb") as f:
            for chunk in iter(lambda: f.read(1024 * 1024), b""):
                h.update(chunk)
        return h.hexdigest()
    except Exception:
        return None


def module_available(name: str) -> dict:
    try:
        spec = importlib.util.find_spec(name)
        if spec is None:
            return {"available": False}
        mod = importlib.import_module(name)
        return {"available": True, "version": getattr(mod, "__version__", "unknown")}
    except Exception as e:
        return {"available": False, "error": str(e)}


def cmd_version(args: list[str]) -> dict:
    try:
        p = subprocess.run(args, capture_output=True, text=True, timeout=10)
        return {"available": p.returncode == 0, "output": (p.stdout or p.stderr).strip().splitlines()[:1]}
    except Exception as e:
        return {"available": False, "error": str(e)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model-id", default=os.environ.get("GENESIS_LOCAL_VIDEO_MODEL_ID"))
    parser.add_argument("--checkpoint", default=None, help="Path to a specific checkpoint to verify")
    parser.add_argument("--checkpoint-sha256", default=None, help="Expected SHA-256 of --checkpoint")
    args = parser.parse_args()

    report: dict = {
        "platform": platform.platform(),
        "python": {"executable": sys.executable, "version": platform.python_version()},
        "packages": {
            name: module_available(name)
            for name in ["diffusers", "transformers", "accelerate", "safetensors", "huggingface_hub", "numpy", "PIL", "imageio", "imageio_ffmpeg", "psutil"]
        },
        "torchLike": {
            "torch": module_available("torch"),
            "torch_directml": module_available("torch_directml"),
            "onnxruntime": module_available("onnxruntime"),
        },
        "tools": {
            "ffmpeg": {"path": shutil.which("ffmpeg"), **cmd_version(["ffmpeg", "-version"])} if shutil.which("ffmpeg") else {"path": None, "available": False},
        },
        "env": {
            "GENESIS_LOCAL_VIDEO_MODELS_DIR": os.environ.get("GENESIS_LOCAL_VIDEO_MODELS_DIR"),
        },
    }

    models_dir = os.environ.get("GENESIS_LOCAL_VIDEO_MODELS_DIR")
    if models_dir:
        p = Path(models_dir)
        report["modelsDir"] = {"path": str(p), "exists": p.is_dir(), "writable": os.access(p, os.W_OK) if p.exists() else None}
    else:
        report["modelsDir"] = {"path": None, "exists": False, "reason": "GENESIS_LOCAL_VIDEO_MODELS_DIR is not set"}

    if args.checkpoint:
        cp = Path(args.checkpoint)
        exists = cp.is_file()
        actual_hash = sha256_file(cp) if exists else None
        matches = (actual_hash is not None and args.checkpoint_sha256 is not None and actual_hash.lower() == args.checkpoint_sha256.lower())
        report["checkpoint"] = {
            "path": str(cp), "exists": exists, "sha256": actual_hash,
            "expectedSha256": args.checkpoint_sha256, "matches": matches if args.checkpoint_sha256 else None,
        }
    else:
        report["checkpoint"] = {"path": None, "reason": "no --checkpoint supplied"}

    # ADMISSION VERDICT — honest, conservative. Every gate must genuinely
    # pass; nothing here is a fabricated "probably fine".
    reasons = []
    if not report["modelsDir"]["exists"]:
        reasons.append("models directory is not configured or does not exist")
    if not report["tools"]["ffmpeg"].get("available") and not report["packages"]["imageio_ffmpeg"]["available"]:
        reasons.append("no ffmpeg available (system PATH or imageio-ffmpeg)")
    if args.checkpoint and not report["checkpoint"]["exists"]:
        reasons.append("checkpoint file does not exist")
    if args.checkpoint and args.checkpoint_sha256 and not report["checkpoint"]["matches"]:
        reasons.append("checkpoint SHA-256 does not match the expected fingerprint")
    if not any(report["torchLike"][k]["available"] for k in report["torchLike"]):
        reasons.append("no torch/torch-directml/onnxruntime runtime detected — a real model cannot execute yet")

    report["admitted"] = len(reasons) == 0
    report["admissionBlockers"] = reasons

    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
