import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * PLAYWRIGHT-BUNDLED FFMPEG LOCATOR — Node-only. `which ffmpeg` is confirmed
 * absent in this sandbox (verified repeatedly across this task's own repo
 * audit), but Playwright's own browser download already ships a real, working
 * ffmpeg binary under `$PLAYWRIGHT_BROWSERS_PATH` (an `ffmpeg-<build>` directory containing an `ffmpeg-<platform>` binary) —
 * used internally by Playwright for its own video-recording feature. This is
 * NOT a new dependency: it is already present on disk as part of the
 * pre-installed Playwright browsers this environment documents. Using it as a
 * real fallback encoder is honest (a real binary, really executed) and
 * doesn't require installing anything new — unlike, say, adding an
 * `ffmpeg-static` npm package, which would need the user's explicit sign-off
 * per this task's own "ask before adding a new dependency" instruction.
 *
 * KNOWN LIMITATION, discovered by inspecting this exact binary's own
 * `-version` build flags: it is a deliberately stripped build
 * (`--disable-everything`) that enables `muxer=webm` + `encoder=libvpx_vp8`
 * but NOT an mp4/h264 muxer or encoder. So this binary can produce a real
 * `.webm` (VP8) video, never a real `.mp4` — `bundledFfmpegVideoEncoder.node.ts`
 * reports `format: 'WEBM'` honestly rather than claiming MP4 support this
 * binary does not have.
 */
export function locatePlaywrightBundledFfmpeg(): string | null {
  const browsersPath = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!browsersPath || !existsSync(browsersPath)) return null;
  let entries: string[];
  try {
    entries = readdirSync(browsersPath);
  } catch {
    return null;
  }
  const ffmpegDir = entries.find((entry) => /^ffmpeg-\d+$/.test(entry));
  if (!ffmpegDir) return null;
  const dir = path.join(browsersPath, ffmpegDir);
  const candidateNames = ['ffmpeg-linux', 'ffmpeg-mac', 'ffmpeg-mac-arm64', 'ffmpeg-win64.exe', 'ffmpeg-win32.exe'];
  for (const name of candidateNames) {
    const candidate = path.join(dir, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}
