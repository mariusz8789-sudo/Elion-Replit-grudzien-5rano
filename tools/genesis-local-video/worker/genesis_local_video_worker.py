"""
Genesis Local AI-Video — Stage-B worker (owned, Claude Stage-B branch).

Single-shot subprocess protocol: the Node adapter
(packages/backend/src/cinematic/localVideoWorkerAdapter.mjs) spawns this
script once per generation attempt, writes exactly ONE JSON request line to
stdin, closes stdin, and reads exactly ONE JSON response line from stdout.
No persistent process, no hidden state between calls — the Node side can
kill this process at any time (timeout/cancellation) with no cleanup
beyond removing a partial output file.

This worker NEVER claims a result is ready unless a real, plugged-in model
adapter under adapters/<modelId>.py actually wrote a real file. With no
adapter plugged in (the case in this branch), every request honestly
resolves to BLOCKED_MODEL_UNAVAILABLE. This mirrors, and is inspired by
the shape of, Genesis_AI_Video_Starter_Pack's own
genesis_local_video_worker.py (candidate integration material reviewed for
this task) — rewritten here as an owned Stage-B file, not a copy, with an
explicit plug-in seam the starter pack did not define.

To attach a real local model (Stage B, out of scope for this branch):
  1. Implement `generate(request: dict) -> dict` in
     `adapters/<modelId>.py` (see `adapters/_example_adapter.py.txt`
     for the exact contract).
  2. The function must write a REAL file to `request["outputPath"]`
     and return {"ok": True, "outputPath": ..., "limitations": [...]}
     or {"ok": False, "reason": "..."} — never fabricate success.
  3. This worker discovers it by `modelId` automatically; no other
     change to this file is required.
"""
from __future__ import annotations
import hashlib
import importlib.util
import json
import os
import sys
from pathlib import Path

MEDIA_CLASS = "GENERATED_MEDIA"
MEDIA_SCOPE = "VISUALIZATION_ONLY"
SUPPORTED_CAPABILITIES = {
    "TEXT_TO_VIDEO",
    "IMAGE_TO_VIDEO",
    "VIDEO_TO_VIDEO",
    "FRAME_ENHANCEMENT",
    "TEMPORAL_UPSCALE",
}
ADAPTERS_DIR = Path(__file__).parent / "adapters"


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def blocked(status: str, reason: str, request_id=None) -> dict:
    return {
        "requestId": request_id,
        "ok": False,
        "status": status,
        "reason": reason,
        "mediaClass": MEDIA_CLASS,
        "mediaScope": MEDIA_SCOPE,
        "evidenceEligible": False,
        "scientificStateMutation": False,
    }


def load_plugged_adapter(model_id: str):
    """Looks for adapters/<model_id>.py exposing generate(request) -> dict.
    Returns None (never raises) when nothing is plugged in — this is the
    honest default in this branch."""
    if not model_id:
        return None
    candidate = ADAPTERS_DIR / f"{model_id}.py"
    if not candidate.is_file():
        return None
    spec = importlib.util.spec_from_file_location(f"genesis_video_adapter_{model_id}", candidate)
    if spec is None or spec.loader is None:
        return None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return getattr(module, "generate", None)


def handle(req: dict) -> dict:
    request_id = req.get("requestId")

    capability = req.get("capability")
    if capability not in SUPPORTED_CAPABILITIES:
        return blocked("BLOCKED_UNSUPPORTED_CAPABILITY", f"Unsupported capability: {capability}", request_id)

    checkpoint_path = req.get("checkpointPath")
    if not checkpoint_path or not Path(checkpoint_path).is_file():
        return blocked("BLOCKED_MODEL_UNAVAILABLE", "checkpointPath is missing or does not exist on disk", request_id)

    expected_fingerprint = req.get("checkpointFingerprint")
    if expected_fingerprint:
        actual = sha256_file(Path(checkpoint_path))
        if actual.lower() != str(expected_fingerprint).lower():
            return blocked(
                "BLOCKED_MODEL_UNAVAILABLE",
                f"checkpoint SHA-256 mismatch: expected {expected_fingerprint}, got {actual}",
                request_id,
            )

    model_id = req.get("modelId")
    generate_fn = load_plugged_adapter(model_id)
    if generate_fn is None:
        return blocked(
            "BLOCKED_MODEL_UNAVAILABLE",
            f"No real local AI-video model adapter is plugged in for modelId \"{model_id}\" "
            f"(expected adapters/{model_id}.py) — Stage B has not attached a real model yet",
            request_id,
        )

    try:
        result = generate_fn(req)
    except Exception as e:  # a plugged-in adapter's own failure is FAILED_GENERATION, never fabricated success
        return {
            "requestId": request_id,
            "ok": False,
            "status": "FAILED_GENERATION",
            "reason": f"plugged adapter raised: {e}",
            "mediaClass": MEDIA_CLASS,
            "mediaScope": MEDIA_SCOPE,
            "evidenceEligible": False,
            "scientificStateMutation": False,
        }

    if not isinstance(result, dict) or "ok" not in result:
        return {
            "requestId": request_id,
            "ok": False,
            "status": "FAILED_GENERATION",
            "reason": "plugged adapter returned a malformed result",
            "mediaClass": MEDIA_CLASS,
            "mediaScope": MEDIA_SCOPE,
            "evidenceEligible": False,
            "scientificStateMutation": False,
        }

    result.setdefault("requestId", request_id)
    result.setdefault("mediaClass", MEDIA_CLASS)
    result.setdefault("mediaScope", MEDIA_SCOPE)
    result["evidenceEligible"] = False
    result["scientificStateMutation"] = False
    return result


def main() -> None:
    raw = sys.stdin.readline()
    if not raw.strip():
        sys.stdout.write(json.dumps(blocked("FAILED_GENERATION", "no request received on stdin")) + "\n")
        sys.stdout.flush()
        return
    try:
        req = json.loads(raw)
        result = handle(req)
    except Exception as e:
        result = blocked("FAILED_GENERATION", f"invalid request: {e}")
    sys.stdout.write(json.dumps(result, ensure_ascii=False) + "\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
