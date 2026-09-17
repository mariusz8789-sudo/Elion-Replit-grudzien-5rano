#!/usr/bin/env python3
# =============================================================================
# GENESIS VOICE GUIDE — TTS GENERATOR (D-119)
# -----------------------------------------------------------------------------
# Renders the guide's lines to MP3 and writes the manifest the app reads.
#
#   npm run voice:lines                 # 1) export the lines from the narration model
#   pip install edge-tts requests
#   python scripts/genesis_tts.py       # 2) render PL+EN via Edge-TTS (free, no key)
#   python scripts/genesis_tts.py --engine eleven   # ElevenLabs (needs ELEVENLABS_API_KEY)
#
# Input : packages/frontend/public/audio/lines.json   (from genesis-voice-lines-export.mjs)
# Output: packages/frontend/public/audio/genesis_<id>_<lang>.mp3 + manifest.json
#
# The lines are NOT written here by hand: they are exactly the sentences the
# narration model derives from the committed real run, so the manifest's
# `text` equals what the guide would say — and the app plays a recording only
# when the two are identical. Voices: Edge-TTS pl-PL-ZofiaNeural / en-US-JennyNeural
# (free neural), ElevenLabs Multilingual v2 Antoni / Rachel when a key is set.
# =============================================================================
import argparse, asyncio, json, os, re, sys
from pathlib import Path

VOICES = {
    "edge_pl": "pl-PL-ZofiaNeural",
    "edge_en": "en-US-JennyNeural",
    "eleven_pl": "ErXwobaYbeN019PWNRVs",  # ElevenLabs "Antoni" (multilingual)
    "eleven_en": "21m00Tcm4TlvDq8ikWAM",  # ElevenLabs "Rachel"
}
REPO = Path(__file__).resolve().parent.parent
OUT_DIR = REPO / "packages" / "frontend" / "public" / "audio"


def safe_name(key: str) -> str:
    return re.sub(r"[^a-zA-Z0-9]+", "_", key).strip("_").lower()


async def gen_edge(text: str, voice: str, path: Path) -> None:
    import edge_tts
    comm = edge_tts.Communicate(text, voice, rate="-5%", pitch="+0Hz", volume="+0%")
    await comm.save(str(path))


def gen_eleven(text: str, voice_id: str, path: Path, api_key: str) -> None:
    import requests
    r = requests.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
        headers={"xi-api-key": api_key, "Content-Type": "application/json"},
        json={"text": text, "model_id": "eleven_multilingual_v2",
              "voice_settings": {"stability": 0.5, "similarity_boost": 0.75, "style": 0.3, "use_speaker_boost": True}},
        timeout=60)
    r.raise_for_status()
    path.write_bytes(r.content)


async def main() -> None:
    ap = argparse.ArgumentParser(description="GENESIS Voice Guide TTS")
    ap.add_argument("--engine", choices=["auto", "edge", "eleven"], default="auto")
    ap.add_argument("--lang", choices=["both", "pl", "en"], default="both")
    ap.add_argument("--outdir", type=Path, default=OUT_DIR)
    ap.add_argument("--lines", type=Path, default=OUT_DIR / "lines.json")
    args = ap.parse_args()

    if not args.lines.exists():
        sys.exit(f"{args.lines} not found — run `npm run voice:lines` first (lines come from the narration model, never by hand).")
    lines = json.loads(args.lines.read_text(encoding="utf-8"))

    api_key = os.environ.get("ELEVENLABS_API_KEY", "")
    engine = args.engine
    if engine == "auto":
        engine = "eleven" if api_key else "edge"
    if engine == "eleven" and not api_key:
        print("ELEVENLABS_API_KEY missing -> falling back to Edge-TTS.")
        engine = "edge"

    args.outdir.mkdir(parents=True, exist_ok=True)
    manifest = []
    for line in lines:
        key, lang, text = line["id"], line["lang"], line["text"]
        if args.lang != "both" and lang != args.lang:
            continue
        voice = VOICES[f"{engine}_{lang}"]
        fname = args.outdir / f"genesis_{safe_name(key)}_{lang}.mp3"
        if engine == "edge":
            await gen_edge(text, voice, fname)
        else:
            gen_eleven(text, voice, fname, api_key)
        manifest.append({"id": key, "lang": lang, "file": fname.name, "voice": voice, "engine": engine, "text": text})
        print(f"[ok] {fname.name}  ({engine}:{voice})")

    (args.outdir / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nDone. {len(manifest)} files -> {args.outdir}/  + manifest.json")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except ImportError as e:
        sys.exit(f"Missing dependency ({e}). Run: pip install edge-tts requests")
